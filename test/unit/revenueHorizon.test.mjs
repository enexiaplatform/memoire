import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildRevenueHorizon } from '../../src/utils/pipelineInsights.ts';

/**
 * "Expected revenue: when the money lands" weighted every deal with no declared
 * probability at a flat 50%, while `resolveProbability` - which the rest of the
 * product uses - says a Lead is 5% and an On hold deal has no probability at all.
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
  test('a Lead is weighted at 5%, not 50%', () => {
    const row = bucket([{ ...deal(), stage: 'Lead' }]);
    assert.equal(row.rawValueBase, 1_000_000);
    assert.equal(row.weightedValueBase, 50_000, 'it used to be 500,000');
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
    const row = bucket([{ ...deal(), stage: 'Lead', pipelineProbability: 80 }]);
    assert.equal(row.weightedValueBase, 800_000);
  });
});
