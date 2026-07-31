import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_PROBABILITY,
  defaultProbabilityForStage,
  isClosedProbabilityStale,
  isProbabilityOptimistic,
  probabilityGapText,
  resolveProbability,
  weightedValue,
} from '../../src/utils/stageProbability.ts';

// Mirrors opportunityStages. Imported by hand because the store pulls the
// Supabase client, which has no place in a unit test.
const opportunityStages = [
  'Lead', 'Discovery', 'Qualification', 'Technical discussion', 'Demo',
  'Proposal', 'Negotiation', 'Procurement', 'Won', 'Lost', 'On hold',
];

const deal = (patch = {}) => ({
  stage: 'Discovery',
  status: 'Active',
  pipelineProbability: null,
  estimatedValue: 1000,
  ...patch,
});

describe('stage probability', () => {
  // A stage the table forgets would silently weight at zero, quietly deleting a
  // deal from the forecast.
  test('every stage has an entry', () => {
    for (const stage of opportunityStages) {
      assert.ok(stage in STAGE_PROBABILITY, `${stage} is missing from the table`);
    }
  });

  test('the table climbs with the stage', () => {
    const ordered = ['Lead', 'Discovery', 'Qualification', 'Technical discussion', 'Demo', 'Proposal', 'Negotiation', 'Procurement', 'Won'];
    for (let index = 1; index < ordered.length; index += 1) {
      assert.ok(
        STAGE_PROBABILITY[ordered[index]] > STAGE_PROBABILITY[ordered[index - 1]],
        `${ordered[index]} must be worth more than ${ordered[index - 1]}`,
      );
    }
    assert.equal(STAGE_PROBABILITY.Lost, 0);
    assert.equal(STAGE_PROBABILITY.Won, 100);
  });

  // A paused deal's odds depend on why it paused, which the stage cannot know.
  test('On hold has no default', () => {
    assert.equal(defaultProbabilityForStage('On hold'), null);
    assert.deepEqual(resolveProbability(deal({ stage: 'On hold' })), {
      value: null, source: 'unknown', stageDefault: null, declared: null,
    });
  });
});

describe('resolving a probability', () => {
  // The seller has looked at the deal; the table has not.
  test('a declared number outranks the stage default', () => {
    const resolved = resolveProbability(deal({ stage: 'Discovery', pipelineProbability: 45 }));
    assert.equal(resolved.value, 45);
    assert.equal(resolved.source, 'declared');
    assert.equal(resolved.stageDefault, 10);
  });

  test('an empty field falls back to the stage', () => {
    const resolved = resolveProbability(deal({ stage: 'Negotiation' }));
    assert.equal(resolved.value, 75);
    assert.equal(resolved.source, 'stage');
  });

  test('an out-of-range number is clamped rather than trusted', () => {
    assert.equal(resolveProbability(deal({ pipelineProbability: 140 })).value, 100);
    assert.equal(resolveProbability(deal({ pipelineProbability: -20 })).value, 0);
    assert.equal(resolveProbability(deal({ pipelineProbability: Number.NaN })).value, 0);
  });
});

describe('probability against the stage', () => {
  test('flags a number further ahead than its stage', () => {
    assert.equal(isProbabilityOptimistic(deal({ stage: 'Discovery', pipelineProbability: 80 })), true);
    assert.match(probabilityGapText(deal({ stage: 'Discovery', pipelineProbability: 80 })), /ahead of Discovery/);
  });

  // Being careful is not an error, and nagging someone for it teaches them to
  // ignore the warning that matters.
  test('says nothing about a number more cautious than its stage', () => {
    assert.equal(isProbabilityOptimistic(deal({ stage: 'Negotiation', pipelineProbability: 40 })), false);
    assert.equal(probabilityGapText(deal({ stage: 'Negotiation', pipelineProbability: 40 })), '');
  });

  test('leaves a judgement call inside the tolerance alone', () => {
    // Proposal runs at 60; 75 is one stage of optimism, not a broken record.
    assert.equal(isProbabilityOptimistic(deal({ stage: 'Proposal', pipelineProbability: 75 })), false);
    assert.equal(isProbabilityOptimistic(deal({ stage: 'Proposal', pipelineProbability: 85 })), true);
  });

  test('a closed deal is judged on being finished, not on optimism', () => {
    assert.equal(isProbabilityOptimistic(deal({ status: 'Won', stage: 'Won', pipelineProbability: 60 })), false);
    assert.equal(isClosedProbabilityStale(deal({ status: 'Won', stage: 'Won', pipelineProbability: 60 })), true);
    assert.match(probabilityGapText(deal({ status: 'Won', stage: 'Won', pipelineProbability: 60 })), /still reads 60%/);
  });

  test('a properly closed deal is quiet', () => {
    assert.equal(isClosedProbabilityStale(deal({ status: 'Won', stage: 'Won', pipelineProbability: 100 })), false);
    assert.equal(isClosedProbabilityStale(deal({ status: 'Lost', stage: 'Lost', pipelineProbability: 0 })), false);
  });

  test('a deal with no number at all raises nothing', () => {
    assert.equal(isClosedProbabilityStale(deal({ status: 'Won', stage: 'Won' })), false);
    assert.equal(isProbabilityOptimistic(deal({ stage: 'Discovery' })), false);
  });
});

describe('weighted value', () => {
  test('weights by the resolved probability', () => {
    assert.equal(weightedValue(deal({ stage: 'Proposal', estimatedValue: 1000 })), 600);
    assert.equal(weightedValue(deal({ stage: 'Proposal', estimatedValue: 1000, pipelineProbability: 20 })), 200);
  });

  // Counting an unqualified number at full value is how a pipeline total stops
  // being believable.
  test('contributes nothing when nothing is known', () => {
    assert.equal(weightedValue(deal({ stage: 'On hold', estimatedValue: 1000 })), 0);
    assert.equal(weightedValue(deal({ stage: 'Proposal', estimatedValue: null })), 0);
  });
});
