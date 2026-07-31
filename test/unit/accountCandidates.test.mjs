import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAccountCandidatesFromActivities,
  deriveAccountCandidatesFromOpportunities,
  mergeAccountCandidates,
} from '../../src/utils/accountMemory.ts';
import { buildAccountAliasIndex } from '../../src/utils/accountAliases.ts';

const opp = (accountName, id = accountName) => ({
  id, accountName, opportunityName: `${accountName} deal`, stage: 'Proposal',
  status: 'Active', estimatedValue: 100, currency: 'VND',
});

const activity = (accountName, id = `a-${accountName}`) => ({
  id, accountName, linkedAccountName: accountName, linkStatus: 'Linked',
  activityType: 'Customer meeting', activityDate: '2026-06-01', tags: [],
});

const account = (accountName, id = `acc-${accountName}`) => ({ id, accountName });

const merge = (canonical, mergedNames) => ({
  id: `merge-${canonical}`,
  kind: 'merge',
  canonicalAccountName: canonical,
  mergedNames,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const candidatesFor = (opportunities, activities, accounts, merges = []) => mergeAccountCandidates(
  deriveAccountCandidatesFromOpportunities(opportunities),
  deriveAccountCandidatesFromActivities(activities),
  accounts,
  buildAccountAliasIndex(merges),
);

describe('work with no customer record', () => {
  test('a deal against a name nobody made an account for is surfaced', () => {
    const candidates = candidatesFor([opp('Tenamyd')], [], []);

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].accountName, 'Tenamyd');
    assert.equal(candidates[0].opportunityCount, 1);
  });

  test('a customer that already exists is not offered again', () => {
    const candidates = candidatesFor([opp('Tenamyd')], [], [account('Tenamyd')]);
    assert.deepEqual(candidates, []);
  });

  // Punctuation and diacritics already resolve to one key everywhere else.
  test('a spelling variant of an existing account is not a new customer', () => {
    const candidates = candidatesFor([opp('VNVC.')], [], [account('VNVC')]);
    assert.deepEqual(candidates, []);
  });

  // The bug this guards: a merge records an alias and rewrites nothing, so the
  // deals keep the old spelling. Without the alias index every name the
  // operator had just merged away came back as a customer to create - offering
  // to rebuild, one click at a time, the duplicate they had cleaned up.
  test('a name already merged away never comes back as a new customer', () => {
    const merges = [merge('VNVC', ['VNVC Vietnam'])];

    const withoutAliases = mergeAccountCandidates(
      deriveAccountCandidatesFromOpportunities([opp('VNVC Vietnam')]),
      [],
      [account('VNVC')],
    );
    assert.equal(withoutAliases.length, 1, 'this is the behaviour the alias index has to fix');

    const withAliases = candidatesFor([opp('VNVC Vietnam')], [], [account('VNVC')], merges);
    assert.deepEqual(withAliases, [], 'the merge decision must reach this surface too');
  });

  test('a merged name with no surviving account offers the canonical spelling', () => {
    const candidates = candidatesFor(
      [opp('Apex Labs Ltd')],
      [],
      [],
      [merge('Apex Labs', ['Apex Labs Ltd'])],
    );

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].accountName, 'Apex Labs', 'creating the alias would recreate the split');
  });

  test('deals and touches for one customer are one candidate, counted separately', () => {
    const candidates = candidatesFor(
      [opp('MDL', 'o1'), opp('MDL', 'o2')],
      [activity('MDL', 'a1')],
      [],
    );

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].opportunityCount, 2);
    assert.equal(candidates[0].activityCount, 1);
    assert.equal(candidates[0].source, 'mixed');
  });

  test('the busiest customer is offered first', () => {
    const candidates = candidatesFor(
      [opp('Quiet', 'o1'), opp('Busy', 'o2'), opp('Busy', 'o3'), opp('Busy', 'o4')],
      [],
      [],
    );

    assert.equal(candidates[0].accountName, 'Busy');
  });

  test('a blank account name is not a customer', () => {
    const candidates = candidatesFor([opp(''), opp('   ')], [], []);
    assert.deepEqual(candidates, []);
  });
});
