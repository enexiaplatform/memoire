import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildRevenueHorizon } from '../../src/utils/pipelineInsights.ts';

/**
 * "Expected revenue: when the money lands" weighted every deal with no declared
 * probability at a flat 50%, while `resolveProbability` - which the rest of the
 * product uses - gives stage-specific defaults. M1 excludes Leads from the
 * qualified revenue horizon entirely. On hold has no probability.
 */
const deal = (overrides = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`,
  accountName: 'Truong Son',
  opportunityName: 'Q3 supply',
  status: 'Active',
  stage: 'Lead',
  estimatedValue: 1_000_000,
  currency: 'VND',
  expectedClosePeriod: 'This month',
  pipelineProbability: null,
});

const bucket = (opportunities) => buildRevenueHorizon(opportunities)[0];

describe('the weighted revenue horizon uses the stage ladder', () => {
  test('a Lead has no qualified revenue horizon, even with declared probability', () => {
    assert.deepEqual(buildRevenueHorizon([{ ...deal(), stage: 'Lead', pipelineProbability: 80 }]), []);
  });

  test('Discovery is 10% and Negotiation is 75%', () => {
    assert.equal(bucket([{ ...deal(), stage: 'Discovery' }]).weightedValueBase, 100_000);
    assert.equal(bucket([{ ...deal(), stage: 'Negotiation' }]).weightedValueBase, 750_000);
  });

  test('an On hold deal contributes nothing to the weighted bar but keeps its full value', () => {
    // The ladder gives On hold no probability on purpose; it used to be counted
    // at half its value as money arriving on a date.
    const row = bucket([{ ...deal(), stage: 'On hold' }]);
    assert.equal(row.weightedValueBase, 0);
    assert.equal(row.rawValueBase, 1_000_000);
  });

  test('a declared probability still wins over the stage', () => {
    const row = bucket([{ ...deal(), stage: 'Discovery', pipelineProbability: 80 }]);
    assert.equal(row.weightedValueBase, 800_000);
  });
});
