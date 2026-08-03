import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  activitiesForOpportunityBroad,
  activitiesForOpportunityStrict,
} from '../../src/utils/activityIndex.ts';

/**
 * The index replaced two filters that ran once per opportunity. A join that is
 * merely fast is worth nothing here: if it answers differently, Today reports a
 * different deal as going quiet and the playbook finds a different pattern, and
 * nobody would connect either to a performance change.
 *
 * So the tests below are the old predicates, written out, checked against the
 * new lookups on the same data - including the cases the two definitions
 * deliberately disagree on.
 */

const activity = (id, overrides = {}) => ({
  id,
  accountName: '',
  opportunityName: '',
  linkedAccountName: '',
  linkedOpportunityName: '',
  linkedOpportunityId: '',
  rawNote: `note ${id}`,
  summary: '',
  activityDate: '2026-07-01',
  activityType: 'Meeting',
  ...overrides,
});

/** The predicate `salesPlaybook.getRelatedActivities` used before the index. */
const broadFilter = (opportunity, activities) => {
  const normalize = (value) => (value || '').trim().toLowerCase();
  return activities.filter((item) => (
    item.linkedOpportunityId === opportunity.id
    || normalize(item.linkedOpportunityName || item.opportunityName) === normalize(opportunity.opportunityName)
    || normalize(item.linkedAccountName || item.accountName) === normalize(opportunity.accountName)
  ));
};

/** The predicate `meddicLite.getRelatedActivities` used before the index. */
const strictFilter = (opportunity, activities) => {
  const normalize = (value) => (value || '').trim().toLowerCase();
  const account = normalize(opportunity.accountName);
  const opportunityName = normalize(opportunity.opportunityName);
  return activities.filter((item) => (
    item.linkedOpportunityId === opportunity.id
    || (item.linkedOpportunityName && normalize(item.linkedOpportunityName) === opportunityName)
    || (
      normalize(item.linkedAccountName || item.accountName) === account
      && normalize(item.opportunityName || '').includes(opportunityName)
    )
  ));
};

const ids = (records) => records.map((record) => record.id);

describe('activity index: the same answer as the filter it replaced', () => {
  const activities = [
    activity('by-id', { linkedOpportunityId: 'opp-1', accountName: 'Other Co' }),
    activity('by-linked-name', { linkedOpportunityName: ' Analyzer Deal ', accountName: 'Other Co' }),
    activity('by-own-name', { opportunityName: 'Analyzer Deal', accountName: 'Other Co' }),
    activity('by-account', { accountName: 'Orion Pharma' }),
    activity('by-linked-account', { linkedAccountName: 'orion pharma', accountName: 'Other Co' }),
    activity('account-and-partial-name', { accountName: 'Orion Pharma', opportunityName: 'Analyzer Deal phase 2' }),
    activity('unrelated', { accountName: 'Nothing Co', opportunityName: 'Other work' }),
  ];
  const opportunity = { id: 'opp-1', accountName: 'Orion Pharma', opportunityName: 'Analyzer Deal' };

  test('the broad definition matches the old filter exactly, in source order', () => {
    assert.deepEqual(
      ids(activitiesForOpportunityBroad(opportunity, activities)),
      ids(broadFilter(opportunity, activities)),
    );
  });

  test('the strict definition matches its own old filter exactly', () => {
    assert.deepEqual(
      ids(activitiesForOpportunityStrict(opportunity, activities)),
      ids(strictFilter(opportunity, activities)),
    );
  });

  test('the two definitions still disagree where they always did', () => {
    const broad = ids(activitiesForOpportunityBroad(opportunity, activities));
    const strict = ids(activitiesForOpportunityStrict(opportunity, activities));

    assert.ok(broad.includes('by-account'), 'any touch on the account is a playbook signal');
    assert.ok(!strict.includes('by-account'), 'but not evidence about this particular deal');
    assert.ok(strict.includes('account-and-partial-name'), 'a touch naming this deal is evidence');
  });

  test('a record matching two ways appears once', () => {
    const both = [activity('two-ways', {
      linkedOpportunityId: 'opp-1',
      accountName: 'Orion Pharma',
      linkedOpportunityName: 'Analyzer Deal',
    })];
    assert.equal(activitiesForOpportunityBroad(opportunity, both).length, 1);
    assert.equal(activitiesForOpportunityStrict(opportunity, both).length, 1);
  });

  test('an empty activity list is answered without building anything', () => {
    assert.deepEqual(activitiesForOpportunityBroad(opportunity, []), []);
    assert.deepEqual(activitiesForOpportunityStrict(opportunity, []), []);
  });
});

describe('activity index: the same array, many opportunities', () => {
  // The whole point: the index is built once and reused. If it were rebuilt per
  // call the cost would be worse than the filter it replaced, and if it were
  // keyed wrongly the second opportunity would get the first one's answer.
  const activities = Array.from({ length: 200 }, (_, index) => activity(`a-${index}`, {
    accountName: `Account ${index % 20}`,
    opportunityName: `Deal ${index % 20}`,
  }));

  test('each opportunity gets its own answer from the shared index', () => {
    for (const seed of [0, 7, 19]) {
      const opportunity = { id: `opp-${seed}`, accountName: `Account ${seed}`, opportunityName: `Deal ${seed}` };
      assert.deepEqual(
        ids(activitiesForOpportunityBroad(opportunity, activities)),
        ids(broadFilter(opportunity, activities)),
        `broad answer differs for ${opportunity.accountName}`,
      );
      assert.deepEqual(
        ids(activitiesForOpportunityStrict(opportunity, activities)),
        ids(strictFilter(opportunity, activities)),
        `strict answer differs for ${opportunity.accountName}`,
      );
    }
  });

  test('a different array is a different index, not a stale one', () => {
    const other = [activity('only', { accountName: 'Account 0', opportunityName: 'Deal 0' })];
    const opportunity = { id: 'opp-0', accountName: 'Account 0', opportunityName: 'Deal 0' };

    assert.equal(activitiesForOpportunityBroad(opportunity, activities).length, 10);
    assert.deepEqual(ids(activitiesForOpportunityBroad(opportunity, other)), ['only']);
  });
});
