import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { deriveOutcomesFromClosedDeals } from '../../src/utils/outcomeScoreboard.ts';

const deal = (overrides = {}) => ({
  id: 'opp-1',
  accountName: 'Grupo Pestana',
  opportunityName: 'Laundry heat recovery - Madeira',
  status: 'Won',
  stage: 'Won',
  estimatedValue: 112_000,
  currency: 'EUR',
  forecastEvidenceCategory: 'Weak but recoverable',
  decisionRecommendation: 'Monitor',
  // Edited long after it closed - which is what an import, a merge, or opening
  // the deal to read it all do.
  updatedAt: '2026-08-23T23:24:31.000Z',
  ...overrides,
});

const derive = (overrides) => deriveOutcomesFromClosedDeals([deal(overrides)], [])[0];

describe('a review says what the week produced, not what was edited in it', () => {
  test('the recorded close date wins over the last edit', () => {
    // Eight deals closed between March and August all counted as "closed this
    // week", because `updated_at` was 23 Aug 23:24 UTC - the 24th in the
    // operator's own timezone, inside the week on screen.
    assert.equal(derive({ closedOn: '2026-03-06' }).outcomeDate, '2026-03-06');
  });

  test('a close period that is a real date is used when there is no close date', () => {
    assert.equal(derive({ expectedClosePeriod: '2026-04-22' }).outcomeDate, '2026-04-22');
  });

  test('a quarter label is not a day and is not treated as one', () => {
    const result = derive({ expectedClosePeriod: 'Q3 2026' });
    assert.notEqual(result.outcomeDate, 'Q3 2026');
    assert.match(result.outcomeDate, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('the close date beats the close period when both are present', () => {
    assert.equal(
      derive({ closedOn: '2026-03-06', expectedClosePeriod: '2026-08-01' }).outcomeDate,
      '2026-03-06',
    );
  });

  test('with nothing recorded it still falls back to the edit, as before', () => {
    const result = derive({});
    assert.match(result.outcomeDate, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('an open deal is not an outcome', () => {
    assert.deepEqual(deriveOutcomesFromClosedDeals([deal({ status: 'Active', stage: 'Proposal' })], []), []);
  });

  test('a deal with a real retro is left to its retro', () => {
    const recorded = [{
      id: 'out-1', opportunityId: 'opp-1', accountName: '', opportunityName: '',
      outcome: 'Won', outcomeDate: '2026-03-06', finalAmount: 100_000, currency: 'EUR',
    }];
    assert.deepEqual(deriveOutcomesFromClosedDeals([deal({ closedOn: '2026-03-06' })], recorded), []);
  });
});

describe('the two tabs of Review agree about the same closed deals', () => {
  const closedDeal = (id, status, value) => ({
    id, accountName: `Account ${id}`, opportunityName: `Deal ${id}`,
    stage: status, status, estimatedValue: value, currency: 'EUR',
    expectedClosePeriod: '', closedOn: '2026-06-19', productOrSolution: '',
    decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
    nextAction: '', nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
    forecastEvidenceCategory: 'Weak but recoverable', decisionRecommendation: 'Monitor',
    createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-08-23T23:24:31.000Z',
    storageMode: 'local',
  });

  const book = [
    closedDeal('w1', 'Won', 112_000), closedDeal('w2', 'Won', 38_000),
    closedDeal('w3', 'Won', 74_000), closedDeal('w4', 'Won', 164_000),
    closedDeal('w5', 'Won', 41_500), closedDeal('l1', 'Lost', 54_000),
    closedDeal('l2', 'Lost', 145_000), closedDeal('l3', 'Lost', 72_000),
  ];

  test('a win rate quoted on one tab is not "0 records" on the other', async () => {
    const { buildOperatorProfile } = await import('../../src/utils/operatorProfile.ts');
    // The scoreboard printed "63% win rate" from these eight while How you sell
    // said "Win rate - 0 of 5 records", because only one of them counted deals
    // closed without a retro.
    const derived = deriveOutcomesFromClosedDeals(book, []);
    assert.equal(derived.length, 8);

    const blind = buildOperatorProfile({
      opportunities: book, opportunityOutcomes: [], activities: [], quotes: [], today: '2026-08-24',
    });
    assert.equal(blind.economics.winRate, null, 'this is what the tab used to see');

    const seeing = buildOperatorProfile({
      opportunities: book, opportunityOutcomes: derived, activities: [], quotes: [], today: '2026-08-24',
    });
    assert.equal(seeing.economics.closedCount, 8);
    assert.equal(seeing.economics.wonCount, 5);
    assert.equal(Math.round((seeing.economics.winRate || 0) * 100), 63);
  });
});
