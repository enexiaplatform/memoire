import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActivityLedger } from '../../src/utils/activityLedger.ts';
import { buildActivityAnalytics } from '../../src/utils/activityAnalytics.ts';
import { buildAccountAliasIndex } from '../../src/utils/accountAliases.ts';

const range = { start: '2026-10-01', end: '2026-10-09' };
const opportunity = (patch = {}) => ({
  id: 'deal-a', accountName: 'Apex Labs', opportunityName: 'Validation Expansion',
  status: 'Active', stage: 'Proposal', nextAction: '', nextActionDate: '',
  estimatedValue: 12000, currency: 'USD', expectedClosePeriod: '', ...patch,
});
const account = (name = 'Apex Labs', id = 'account-a') => ({ id, accountName: name });
const touch = (patch = {}) => ({
  id: 'touch-a', accountName: 'Apex Labs', activityDate: '2026-10-08',
  activityType: 'Customer meeting', summary: 'Called buyer', tags: [],
  nextAction: '', dueDate: '', linkedOpportunityId: 'deal-a',
  linkedOpportunityName: 'Validation Expansion', ...patch,
});
const gaps = (patch = {}) => {
  const input = {
    activities: [touch()], opportunities: [opportunity()], accounts: [account()],
    planRecords: [], range, today: '2026-10-09', ...patch,
  };
  const entries = patch.entries ?? buildActivityLedger(input);
  return buildActivityAnalytics({ ...input, entries }).coverageGaps;
};

describe('account activity coverage follows its linked deal', () => {
  test('a linked captured touch covers both the deal and its account', () => {
    assert.deepEqual(gaps(), []);
  });

  test('a touch outside the selected period leaves the account/deal uncovered', () => {
    const result = gaps({ activities: [touch({ activityDate: '2026-09-30' })] });
    assert.equal(result.length, 1);
    assert.equal(result[0].reason, 'open deal');
  });

  test('one touched deal does not hide an untouched sibling at the same account', () => {
    const result = gaps({ opportunities: [opportunity(), opportunity({ id: 'deal-b', opportunityName: 'Service renewal' })] });
    assert.deepEqual(result.map(row => row.href), ['/app/opportunities?opportunityId=deal-b']);
  });

  test('the ID disambiguates identical deal names at different accounts', () => {
    const result = gaps({
      opportunities: [opportunity(), opportunity({ id: 'deal-b', accountName: 'Delta Labs' })],
      accounts: [account(), account('Delta Labs', 'account-b')],
    });
    assert.deepEqual(result.map(row => row.href), ['/app/opportunities?opportunityId=deal-b']);
  });

  test('the linked ID still works when a deal is renamed', () => {
    assert.deepEqual(gaps({ opportunities: [opportunity({ opportunityName: 'New project name' })] }), []);
  });

  test('a linked touch without display names still reaches its deal and account', () => {
    assert.deepEqual(gaps({ activities: [touch({ linkedOpportunityName: '', accountName: '' })] }), []);
  });

  test('a canonical account ID credits the renamed account rather than stale deal text', () => {
    assert.deepEqual(gaps({
      opportunities: [opportunity({ accountId: 'account-a', accountName: 'Old company name' })],
      accounts: [account('New company name')],
    }), []);
  });

  test('merged account names roll up to the surviving account', () => {
    const accountAliases = buildAccountAliasIndex([{ kind: 'merge', canonicalAccountName: 'Apex Labs', mergedNames: ['Old Apex'] }]);
    assert.deepEqual(gaps({ opportunities: [opportunity({ accountName: 'Old Apex' })], accountAliases }), []);
  });

  test('a direct account activity preserves account-wide coverage and applies aliases', () => {
    const accountAliases = buildAccountAliasIndex([{ kind: 'merge', canonicalAccountName: 'Apex Labs', mergedNames: ['Old Apex'] }]);
    assert.deepEqual(gaps({
      activities: [touch({ linkedOpportunityId: '', linkedOpportunityName: '', accountName: 'Old Apex' })],
      accountAliases,
    }), []);
  });

  test('a stale ID never falls back to a different deal sharing its old name', () => {
    assert.equal(gaps({ activities: [touch({ linkedOpportunityId: 'deleted-deal' })] })[0].reason, 'open deal');
  });

  test('a brand or unresolved subject matching an account name does not count as account work', () => {
    const baseEntry = buildActivityLedger({ activities: [touch()], planRecords: [], opportunities: [opportunity()], accounts: [account()], range })[0];
    for (const type of ['brand', 'unresolved', 'internal']) {
      assert.equal(gaps({ entries: [{ ...baseEntry, relatedTo: { type, name: 'Apex Labs', href: '' } }] })[0].reason, 'open deal');
    }
  });

  test('an untouched account whose name prefixes another customer remains visible', () => {
    const result = gaps({ activities: [], opportunities: [opportunity({ accountName: 'Apex Labs Extended' })], accounts: [account()] });
    assert.ok(result.some(row => row.reason === 'account' && row.name === 'Apex Labs'));
  });

  test('a name-only legacy relation can resolve a unique deal but not an ambiguous one', () => {
    const baseEntry = buildActivityLedger({ activities: [touch()], planRecords: [], opportunities: [opportunity()], accounts: [account()], range })[0];
    const entries = [{ ...baseEntry, relatedTo: { ...baseEntry.relatedTo, href: '' } }];
    assert.deepEqual(gaps({ entries }), []);
    const ambiguous = gaps({ entries, opportunities: [opportunity(), opportunity({ id: 'deal-b' })] });
    assert.equal(ambiguous.filter(row => row.reason === 'open deal').length, 2);
  });

  test('a touch on a closed deal still covers its account', () => {
    assert.deepEqual(gaps({ opportunities: [opportunity({ status: 'Won' })] }), []);
  });
});
