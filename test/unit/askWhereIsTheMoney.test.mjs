import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { answerFromMoneyFlow } from '../../src/features/v31/askMemoireInsightAnswers.ts';
import { buildMoneyFlow } from '../../src/utils/moneyFlow.ts';
import { buildOrderBook } from '../../src/utils/orderToCash.ts';

const TODAY = '2026-08-24';

const deal = (id, status, value, closedOn) => ({
  id, accountName: `Account ${id}`, opportunityName: `Deal ${id}`,
  stage: status === 'Won' ? 'Won' : 'Proposal', status,
  estimatedValue: value, currency: 'VND', expectedClosePeriod: '',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '',
  missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Weak but recoverable', decisionRecommendation: 'Monitor',
  createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z',
  storageMode: 'local', ...(closedOn ? { closedOn } : {}),
});

const answer = (opportunities) => answerFromMoneyFlow(
  buildMoneyFlow({ opportunities, quotes: [], today: TODAY }),
  buildOrderBook({ opportunities, quotes: [], milestoneRecords: [], today: TODAY }),
);

describe('"Where is the money?" answers about both pools', () => {
  test('committed money that has not been collected is named', () => {
    // The answer used to be pipeline only, so a book with 429.5K EUR sitting
    // uncollected - the oldest waiting 171 days - heard only about pipeline.
    const result = answer([deal('a', 'Active', 300_000), deal('w', 'Won', 164_000, '2026-06-19')]);
    assert.match(result.answer, /committed and not yet collected/);
    assert.ok(result.contextUsed.includes('Order book'));
  });

  test('the pipeline figure is still there and still leads', () => {
    // Amounts are shown in the reporting currency, which the test helper pins,
    // so this asserts the shape rather than a literal figure.
    const result = answer([deal('a', 'Active', 300_000), deal('w', 'Won', 164_000, '2026-06-19')]);
    assert.match(result.answer, /^[\d,.]+[KMB]? [A-Z]{3} is in motion across Opportunity/);
  });

  test('an empty pipeline with money owed does not say you have nothing', () => {
    // "No commercial threads are in motion" over a book that is owed money
    // reads as "you have nothing".
    const result = answer([deal('w', 'Won', 164_000, '2026-06-19')]);
    assert.equal(/No commercial threads are in motion/.test(result.answer), false);
    assert.match(result.answer, /committed and not yet collected/);
  });

  test('a genuinely empty book still says so', () => {
    const result = answer([]);
    assert.match(result.answer, /No commercial threads are in motion/);
  });

  test('stalled orders are counted out loud', () => {
    const result = answer([deal('w', 'Won', 164_000, '2026-03-06')]);
    assert.match(result.answer, /not moved in a month/);
  });

  test('"nothing is stuck" says which nothing it means', () => {
    // One sentence before "1 of those orders not moved in a month", a flat
    // "Nothing is stuck right now" contradicts its own paragraph.
    const result = answer([deal('a', 'Active', 300_000), deal('w', 'Won', 164_000, '2026-03-06')]);
    assert.match(result.answer, /Nothing in the pipeline is stuck/);
    const clean = answer([deal('a', 'Active', 300_000)]);
    assert.match(clean.answer, /Nothing is stuck right now/);
  });

  test('without an order book it behaves exactly as it did', () => {
    const flowOnly = answerFromMoneyFlow(
      buildMoneyFlow({ opportunities: [deal('a', 'Active', 300_000)], quotes: [], today: TODAY }),
    );
    assert.equal(/committed and not yet collected/.test(flowOnly.answer), false);
    assert.deepEqual(flowOnly.contextUsed, ['Money flow (deals, quotes, POs, deliveries, payments)']);
  });
});
