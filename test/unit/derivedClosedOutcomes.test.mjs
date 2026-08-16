import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveOutcomesFromClosedDeals } from '../../src/utils/outcomeScoreboard.ts';

const deal = (patch = {}) => ({
  id: 'o1',
  accountName: 'Halden Industrial',
  opportunityName: 'Phase 2 fixed price',
  status: 'Won',
  stage: 'Won',
  estimatedValue: 96000,
  currency: 'GBP',
  expectedCloseDate: '2026-08-12',
  updatedAt: '2026-08-12T09:00:00.000Z',
  forecastEvidenceCategory: 'Defensible',
  decisionRecommendation: 'Defend',
  ...patch,
});

/**
 * A pipeline imported from a CRM arrives with its Won and Lost rows and no
 * retros, and the review scoreboard counted retros only - so it reported
 * "Nothing closed this week" over a won deal while the Business page counted it.
 */
describe('deriveOutcomesFromClosedDeals', () => {
  test('a closed deal with no retro still counts as closed', () => {
    const [derived] = deriveOutcomesFromClosedDeals([deal()], []);
    assert.equal(derived.outcome, 'Won');
    assert.equal(derived.outcomeDate, '2026-08-12');
    assert.equal(derived.finalAmount, 96000, 'valued at the forecast, which is all there is');
    assert.equal(derived.currency, 'GBP');
    assert.equal(derived.reasonText, '', 'counting the money must not invent a reason for it');
  });

  test('a deal that has a retro is left to the retro', () => {
    const recorded = [{ opportunityId: 'o1', outcome: 'Won', outcomeDate: '2026-08-12', finalAmount: 91000 }];
    assert.deepEqual(deriveOutcomesFromClosedDeals([deal()], recorded), []);
  });

  test('open deals are not closed deals', () => {
    assert.deepEqual(deriveOutcomesFromClosedDeals([deal({ status: 'Active' })], []), []);
    assert.deepEqual(deriveOutcomesFromClosedDeals([deal({ status: 'On hold' })], []), []);
  });

  test('a lost deal counts too, or the win rate is one-sided', () => {
    const [derived] = deriveOutcomesFromClosedDeals([deal({ id: 'o2', status: 'Lost', stage: 'Lost' })], []);
    assert.equal(derived.outcome, 'Lost');
  });

  test('sample and demo closes carry their flags through', () => {
    const [sample] = deriveOutcomesFromClosedDeals([deal({ id: 'o3', isSample: true })], []);
    assert.equal(sample.isSample, true);
    const [demo] = deriveOutcomesFromClosedDeals([deal({ id: 'o4', source: 'demo' })], []);
    assert.equal(demo.source, 'demo');
  });
});
