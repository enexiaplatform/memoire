import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCohortStopGo, defaultCohortFunnelInput } from '../../src/utils/cohortStopGo.ts';

const input = (patch = {}) => ({ ...defaultCohortFunnelInput, ...patch });

describe('evaluateCohortStopGo', () => {
  test('an empty tracker is iterate, not a false pause', () => {
    assert.equal(evaluateCohortStopGo(input()).verdict, 'iterate');
  });

  test('a clean 5-finisher cohort meeting every bar reads Go', () => {
    const result = evaluateCohortStopGo(input({
      participants: 5, finishedLoop: 5, createdOrReviewedBrief: 4,
      savedPackOrCopiedSummary: 3, wouldUseWeeklyOrBeforeReview: 3, paidIntent: 2,
    }));
    assert.equal(result.verdict, 'go');
  });

  test('an unresolved P0 blocks Go (drops to iterate)', () => {
    const result = evaluateCohortStopGo(input({
      participants: 5, finishedLoop: 5, createdOrReviewedBrief: 4,
      savedPackOrCopiedSummary: 3, wouldUseWeeklyOrBeforeReview: 3, paidIntent: 2,
      hasUnresolvedP0: true,
    }));
    assert.equal(result.verdict, 'iterate');
  });

  test('too few reaching the brief flags pause', () => {
    const result = evaluateCohortStopGo(input({
      participants: 10, finishedLoop: 6, createdOrReviewedBrief: 3,
      savedPackOrCopiedSummary: 4, wouldUseWeeklyOrBeforeReview: 4, paidIntent: 3,
    }));
    assert.equal(result.verdict, 'pause');
  });

  test('thresholds scale with cohort size (ceil, strict)', () => {
    const six = evaluateCohortStopGo(input({
      participants: 6, finishedLoop: 6, createdOrReviewedBrief: 4,
      savedPackOrCopiedSummary: 4, wouldUseWeeklyOrBeforeReview: 4, paidIntent: 3,
    }));
    assert.equal(six.goConditions.find((c) => c.id === 'brief').met, false);
  });
});
