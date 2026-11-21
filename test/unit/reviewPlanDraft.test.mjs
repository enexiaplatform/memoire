import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingReviewPlanItem, readReviewPlanHandoff, readReviewPlanOrigin, reviewPlanStatus } from '../../src/utils/reviewPlanDraft.ts';

const origin = { proposalId: 'thread:follow-up', sourceRecordIds: ['thread', 'evidence'] };
const candidate = {
  id: 'candidate', label: 'Check renewal', date: '2026-11-21', tag: 'Fixture account',
  linkedAccountName: 'Fixture account', linkedOpportunityId: 'deal', done: false, reviewProposal: origin,
};

test('draft route state retains bounded provenance and no supplied authority or completion', () => {
  const handoff = { ...origin, scope: 'workspace', executed: true, actor: 'other', done: true };
  assert.deepEqual(readReviewPlanHandoff({ reviewPlanDraft: handoff }), { ...origin, scope: 'workspace' });
  assert.equal(readReviewPlanHandoff({ reviewPlanDraft: { ...origin, scope: {} } }), undefined);
  assert.equal(readReviewPlanOrigin({ ...origin, sourceRecordIds: [] }), undefined);
  assert.equal(readReviewPlanOrigin({ ...origin, sourceRecordIds: ['x'.repeat(301)] }), undefined);
});

test('matching Plan items include prior proposal identity and normalized open work for the same subject and day', () => {
  const previous = { ...candidate, date: '2026-10-10', label: 'Earlier follow-up', done: true };
  assert.equal(matchingReviewPlanItem([previous], candidate, false), previous);
  const similar = { ...candidate, label: '  check renewal  ', reviewProposal: undefined };
  assert.equal(matchingReviewPlanItem([similar], candidate, false), similar);
  for (const change of [{ isSample: true }, { __deleted: true }, { date: '2026-11-22' },
    { linkedOpportunityId: 'different' }, { linkedAccountName: 'Other account' }, { done: true }]) {
    assert.equal(matchingReviewPlanItem([{ ...similar, ...change }], candidate, false), undefined);
  }
});

test('planning and reporting are distinct from a confirmed link to the matching Activity', () => {
  assert.equal(reviewPlanStatus(candidate), 'planned');
  const reported = { ...candidate, done: true, completionActivityId: 'activity' };
  assert.equal(reviewPlanStatus(reported, 'activity'), 'reported_done');
  assert.equal(reviewPlanStatus({ ...reported, completionRevision: 'receipt' }, 'different'), 'reported_done');
  assert.equal(reviewPlanStatus({ ...reported, completionRevision: 'receipt' }, 'activity'), 'verified_done');
});
