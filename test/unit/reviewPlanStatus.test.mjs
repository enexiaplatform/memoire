import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmedReviewOutcome, isReviewPlanStatusRow, planItemHref } from '../../src/utils/reviewPlanStatus.ts';

const planned = {
  item_id: 'plan/one & two', proposal_id: 'proposal', label: 'Review terms', plan_date: '2026-11-21',
  completion_status: 'planned', activity_id: null, activity_evidence: null,
};
const linked = {
  date: '2026-11-17', type: 'Call', summary: 'Customer requested terms',
  opportunity_id: 'aaaaaaaa-1111-4111-8111-111111111111', opportunity_name: 'Renewal', outcome: null,
};

test('Review status accepts only bounded rows with a recognized status and consistent Activity evidence', () => {
  assert.equal(isReviewPlanStatusRow(planned), true);
  assert.equal(isReviewPlanStatusRow({ ...planned, completion_status: 'reported_done' }), true);
  assert.equal(isReviewPlanStatusRow({ ...planned, completion_status: 'verified_done' }), false);
  assert.equal(isReviewPlanStatusRow({ ...planned, completion_status: 'verified_done', activity_id: 'not-an-id' }), false);
  const activity_id = 'aaaaaaaa-1111-4111-8111-111111111111';
  assert.equal(isReviewPlanStatusRow({ ...planned, completion_status: 'verified_done', activity_id }), false);
  assert.equal(isReviewPlanStatusRow({ ...planned, completion_status: 'verified_done', activity_id, activity_evidence: linked }), true);
  assert.equal(isReviewPlanStatusRow({ ...planned, activity_id }), false);
  assert.equal(isReviewPlanStatusRow({ ...planned, completion_status: 'unavailable' }), false);
  assert.equal(isReviewPlanStatusRow({ ...planned, plan_date: '2026-02-30' }), false);
});

test('a captured Activity alone, a prior outcome, or incomplete evidence does not confirm a result', () => {
  const outcome = { result: 'Won', date: '2026-11-18', reason: 'Signed renewal' };
  assert.equal(confirmedReviewOutcome(linked), null);
  assert.equal(confirmedReviewOutcome({ ...linked, outcome: { ...outcome, date: '2026-11-16' } }), null);
  assert.equal(confirmedReviewOutcome({ ...linked, outcome: { ...outcome, reason: '' } }), null);
  assert.equal(confirmedReviewOutcome({ ...linked, outcome: { ...outcome, result: 'Delayed' } }), null);
  assert.equal(confirmedReviewOutcome({ ...linked, opportunity_id: null, outcome }), null);
  assert.deepEqual(confirmedReviewOutcome({ ...linked, outcome }), outcome);
});
test('an exact Plan href preserves the item ID and planning date', () => {
  const url = new URL(planItemHref(planned.item_id, planned.plan_date), 'https://example.test');
  assert.equal(url.pathname, '/app/timeline');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    view: 'upcoming', date: planned.plan_date, planItem: planned.item_id,
  });
});
