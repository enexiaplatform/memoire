import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPossibleReviewFollowUps } from '../../src/utils/legacyReviewFollowUps.ts';

const row = { item_id: 'original', label: 'Send revised pricing', activity_evidence: {
  outcome_state: 'open', date: '2026-11-21', opportunity_id: 'deal', pending_follow_up: null,
} };
const workspace = {
  accountMerges: [{ kind: 'merge', canonicalAccountName: 'Đức Phát', mergedNames: ['DP Lab'] }],
  accounts: [{ userId: 'owner', id: 'account-a', accountName: 'Đức Phát' }],
  opportunities: [{ userId: 'owner', id: 'deal', accountId: 'account-a', accountName: 'Đức Phát',
    opportunityName: '2027 renewal', nextAction: 'Send revised pricing' }],
};
const base = { id: 'legacy', label: 'Send revised pricing', date: '2026-11-23', linkedAccountName: 'Duc Phat.' };
const find = (plans, book = workspace, source = row) => findPossibleReviewFollowUps([source], plans, book, 'owner').get(row.item_id);

test('normalization, explicit aliases and deal wording identify possible matches without changing records', () => {
  const legacyTag = { ...base, id: 'earlier', date: '2026-11-22', tag: 'DP Lab', linkedAccountName: undefined,
    label: 'Call about 2027 renewal' };
  assert.deepEqual(find([base]), [base]);
  assert.deepEqual(find([base, legacyTag]), [legacyTag, base]);
  assert.equal(find([{ ...base, label: 'Send directions to the office' }]), undefined);
});

test('exact matches take precedence and colliding account identities prevent a name-only suggestion', () => {
  assert.equal(find([base], workspace, { ...row, activity_evidence: { ...row.activity_evidence, pending_follow_up: { item_id: 'exact' } } }), undefined);
  const sameName = { userId: 'owner', id: 'account-b', accountName: 'Duc Phat' };
  assert.equal(find([base], { ...workspace, accounts: [...workspace.accounts, sameName] }), undefined);
  assert.deepEqual(find([base], { ...workspace, accounts: [...workspace.accounts, { ...sameName, userId: 'foreign' }] }), [base]);
  assert.equal(find([base], { ...workspace, opportunities: [{ ...workspace.opportunities[0], userId: 'foreign' }] }), undefined);
});

test('legacy suggestions exclude completed, deleted, dismissed, old and already linked records', () => {
  assert.equal(find([
    { ...base, done: true }, { ...base, __deleted: true }, { ...base, dismissed: true },
    { ...base, date: '2026-11-20' }, { ...base, linkedOpportunityId: 'other' },
    { ...base, id: 'original' }, { ...base, source: 'demo' },
  ]), undefined);
});
