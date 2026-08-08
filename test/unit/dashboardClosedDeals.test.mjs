import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterDashboard } from '../../src/utils/masterDashboard.ts';

/**
 * "Tại sao tôi có opp won rồi vẫn hiện 0 SGD" - why does this read zero when I
 * am looking at my own won deals?
 *
 * Because "Won" meant two different things in two rooms. Opportunities counted
 * deals whose status is Won; the dashboard counted *retro records*, and a deal
 * can reach Won without one - imported that way, or closed before the retro was
 * ever asked for. Each surface was internally correct and the pair was useless.
 */

function deal(patch = {}) {
  return {
    id: patch.id || 'opp-1',
    accountName: 'CÔNG TY TNHH SAMIL PHARMACEUTICAL',
    opportunityName: 'Samil - BI - Jun/26',
    stage: 'Won',
    status: 'Won',
    estimatedValue: 2000,
    currency: 'SGD',
    pipelineProbability: null,
    forecastEvidenceCategory: 'Defensible',
    decisionRecommendation: 'Defend',
    nextAction: '',
    nextActionDate: '',
    evidence: '',
    missingContext: '',
    objectionDebt: '',
    expectedClosePeriod: '2026-06-27',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-27T00:00:00.000Z',
    ...patch,
  };
}

function retro(patch = {}) {
  return {
    id: 'out-1',
    opportunityId: 'opp-1',
    accountName: 'CÔNG TY TNHH SAMIL PHARMACEUTICAL',
    opportunityName: 'Samil - BI - Jun/26',
    outcome: 'Won',
    outcomeDate: '2026-06-27',
    finalAmount: 1800,
    currency: 'SGD',
    reasonCategory: 'Price',
    reasonText: 'Our price was competitive',
    ...patch,
  };
}

function build(opportunities, opportunityOutcomes = []) {
  return buildMasterDashboard({
    opportunities,
    opportunityOutcomes,
    quotes: [],
    activities: [],
    expenses: [],
    planRecords: [],
    today: '2026-08-08',
  });
}

describe('what closed, on the dashboard', () => {
  test('a won deal with no retro is still counted, at its forecast value', () => {
    const model = build([deal()]);
    assert.equal(model.outcomes.won.count, 1);
    assert.equal(model.outcomes.won.totalBase > 0, true);
    assert.equal(model.outcomes.won.missingRetro, 1);
  });

  test('the retro wins on amount, because a signed figure beats a forecast', () => {
    const model = build([deal()], [retro()]);
    assert.equal(model.outcomes.won.count, 1);
    assert.equal(model.outcomes.won.missingRetro, 0);
    // Compared as a ratio rather than a figure: totals are converted into the
    // workspace's reporting currency, and pinning the rate here would make this
    // a test of the FX table. 1800 signed against 2000 forecast.
    const forecastOnly = build([deal()]).outcomes.won.totalBase;
    assert.equal(Math.round((model.outcomes.won.totalBase / forecastOnly) * 100), 90);
  });

  test('a retro for a deal that is not closed cannot invent a win', () => {
    const model = build([deal({ status: 'Active', stage: 'Proposal' })], [retro()]);
    assert.equal(model.outcomes.won.count, 0);
    assert.equal(model.outcomes.won.totalBase, 0);
  });

  test('lost deals are counted the same way', () => {
    const model = build([deal({ id: 'opp-2', status: 'Lost', stage: 'Lost' })]);
    assert.equal(model.outcomes.lost.count, 1);
    assert.equal(model.outcomes.lost.missingRetro, 1);
    assert.equal(model.outcomes.won.count, 0);
  });
});
