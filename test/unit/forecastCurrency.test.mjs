import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoverage, quarterAmounts } from '../../src/domain/commercialKernel/forecast.ts';
import { BASE_CURRENCY, EXCHANGE_RATES_TO_VND } from '../../src/utils/money.ts';

/*
 * The forecast counts in the reporting currency, because that is the currency
 * every figure on the coverage panel is *labelled* with.
 *
 * It counted in `BASE_CURRENCY` for months while the panel printed
 * `formatCompactBaseAmount`, which labels with the reporting currency and
 * converts nothing. On a workspace reporting in USD over a VND book that showed
 * a 400,000,000 dong target as "400M USD" - and, worse than the label, compared
 * that target against pipeline converted into a different currency, so the
 * shortfall itself was arithmetic on two units.
 */

/** A localStorage stub, so `getReportingCurrency` has something to read. */
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};
const REPORTING_KEY = 'memoire_reporting_currency';
const setReporting = (currency) => store.set(REPORTING_KEY, currency);

const deal = (overrides = {}) => ({
  id: 'o1', accountName: 'Acme', opportunityName: 'Q4 deal', stage: 'Negotiation',
  status: 'Active', estimatedValue: 250_000_000, currency: 'VND', expectedClosePeriod: 'Q4 2026',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '', missingContext: '',
  objectionDebt: '', forecastEvidenceCategory: 'Unsupported', decisionRecommendation: 'Monitor',
  createdAt: '', updatedAt: '', storageMode: 'local', ...overrides,
});

const inQ4 = new Date('2026-11-15T00:00:00Z');
const q4Of = (report) => report.quarters.find((quarter) => quarter.quarter === 'Q4');

beforeEach(() => store.clear());

describe('quarterAmounts', () => {
  test('converts into the reporting currency, not the base currency', () => {
    setReporting('USD');
    const usd = quarterAmounts(deal(), 'Q4').Q4;
    const expected = 250_000_000 / EXCHANGE_RATES_TO_VND.USD;
    assert.ok(
      Math.abs(usd - expected) < 1,
      `expected roughly ${Math.round(expected)} USD, got ${Math.round(usd)}`,
    );
    // The magnitude is the whole point: a dong figure shown under a dollar label
    // is off by four orders of magnitude, which is what shipped.
    assert.ok(usd < 250_000_000 / 1000, 'a dong amount must not survive into a dollar total');
  });

  test('a deal already in the reporting currency passes through untouched', () => {
    setReporting(BASE_CURRENCY);
    assert.equal(quarterAmounts(deal(), 'Q4').Q4, 250_000_000);
  });

  test('an unconvertible currency is carried at face value, never dropped', () => {
    // Visibly wrong beats invisibly missing: a deal that vanishes from the
    // forecast because nobody priced its currency is the worse failure.
    setReporting('USD');
    assert.equal(quarterAmounts(deal({ currency: 'ZWL' }), 'Q4').Q4, 250_000_000);
  });
});

describe('buildCoverage and the target currency', () => {
  test('a target keeps its own currency and is converted to match the pipeline', () => {
    setReporting('USD');
    const report = buildCoverage({
      opportunities: [deal()],
      threads: [],
      targets: [{ quarter: 'Q4', amount: 400_000_000, currency: 'VND' }],
      today: inQ4,
    });
    const q4 = q4Of(report);
    const expectedTarget = 400_000_000 / EXCHANGE_RATES_TO_VND.USD;
    assert.ok(
      Math.abs(q4.target - expectedTarget) < 1,
      `target should convert to about ${Math.round(expectedTarget)} USD, got ${Math.round(q4.target)}`,
    );
    // Target and pipeline now share a unit, so the ratio between them means
    // something. Before the fix this compared dollars against dong.
    assert.ok(q4.openPipeline > 0 && q4.target > q4.openPipeline);
  });

  test('a target with no currency is read as the reporting currency', () => {
    // Which is what the operator was looking at when they typed it. Every
    // target saved before the field was read back is in this state.
    setReporting('USD');
    const report = buildCoverage({
      opportunities: [],
      threads: [],
      targets: [{ quarter: 'Q4', amount: 15_000 }],
      today: inQ4,
    });
    assert.equal(q4Of(report).target, 15_000, 'no currency means "the one on screen", not a conversion');
  });

  test('target and pipeline agree whichever currency the operator reports in', () => {
    // The same book, read two ways. Coverage is a ratio, so it must not move
    // when only the display currency changes.
    const targets = [{ quarter: 'Q4', amount: 400_000_000, currency: 'VND' }];
    const opportunities = [deal()];

    setReporting(BASE_CURRENCY);
    const inVnd = q4Of(buildCoverage({ opportunities, threads: [], targets, today: inQ4 }));

    setReporting('USD');
    const inUsd = q4Of(buildCoverage({ opportunities, threads: [], targets, today: inQ4 }));

    const ratio = (quarter) => quarter.openPipeline / quarter.target;
    assert.ok(
      Math.abs(ratio(inVnd) - ratio(inUsd)) < 0.0001,
      'coverage is a ratio and must not depend on the currency it is displayed in',
    );
    assert.ok(inVnd.target > inUsd.target * 1000, 'and the magnitudes do differ, so the test is real');
  });

  test('an unconvertible target is carried at face value rather than read as no target', () => {
    // "No target" is the one wrong answer a coverage check must never give: it
    // reads as nothing to be short of.
    setReporting('USD');
    const report = buildCoverage({
      opportunities: [],
      threads: [],
      targets: [{ quarter: 'Q4', amount: 90_000, currency: 'ZWL' }],
      today: inQ4,
    });
    assert.equal(q4Of(report).target, 90_000);
  });
});
