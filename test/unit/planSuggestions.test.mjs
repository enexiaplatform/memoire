import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanSuggestions, condensePlanLabel } from '../../src/utils/planSuggestions.ts';
import { createDismissedSuggestionRecord, createPersonalPlanRecord } from '../../src/utils/weeklyPlan.ts';

const activity = (overrides = {}) => ({
  id: 'a1',
  accountName: 'MDL',
  linkedAccountName: '',
  linkedOpportunityId: '',
  activityType: 'Customer meeting',
  activityDate: '2026-07-15',
  nextAction: '',
  dueDate: '',
  summary: '',
  risks: [],
  ...overrides,
});

const opportunity = (id, accountName, nextActionDate, status = 'Active') => ({
  id, accountName, nextActionDate, status,
  opportunityName: `${accountName} deal`, nextAction: 'Existing action', stage: 'Qualified',
  estimatedValue: 1000, currency: 'VND',
});

// Planning the week of Mon 2026-07-20 .. Sun 2026-07-26; the ledger looked at
// is the fortnight before it.
const week = { rangeStart: '2026-07-20', rangeEnd: '2026-07-26' };

describe('buildPlanSuggestions', () => {
  test('promotes a next action already promised inside the planned week', () => {
    const suggestions = buildPlanSuggestions({
      activities: [activity({ nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
      opportunities: [],
      records: [],
      ...week,
    });

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].kind, 'due-next-action');
    assert.equal(suggestions[0].label, 'Send revised quote');
    assert.equal(suggestions[0].suggestedDate, '2026-07-22');
    assert.match(suggestions[0].evidence, /Customer meeting on/);
  });

  test('ignores a promise dated outside the planned week', () => {
    const suggestions = buildPlanSuggestions({
      activities: [activity({ nextAction: 'Send quote', dueDate: '2026-08-15' })],
      opportunities: [],
      records: [],
      ...week,
    });
    assert.equal(suggestions.length, 0);
  });

  test('proposes a day for a next action that was never dated', () => {
    const suggestions = buildPlanSuggestions({
      activities: [activity({ nextAction: 'Call Mr. Tinh back' })],
      opportunities: [],
      records: [],
      ...week,
    });

    assert.equal(suggestions[0].kind, 'undated-next-action');
    // A meeting on Jul 15 + 3 days = Jul 18, which is before the week starts,
    // so it lands on the first day of the week being planned.
    assert.equal(suggestions[0].suggestedDate, '2026-07-20');
    assert.match(suggestions[0].reason, /never put a date on it/);
  });

  test('chases a customer touch that captured no next action and went quiet', () => {
    const suggestions = buildPlanSuggestions({
      activities: [activity({ activityType: 'Demo / technical discussion' })],
      opportunities: [],
      records: [],
      ...week,
    });

    assert.equal(suggestions[0].kind, 'quiet-after-touch');
    assert.match(suggestions[0].label, /Follow up after the demo/);
  });

  test('never generates wording like "follow up after the follow-up"', () => {
    const suggestions = buildPlanSuggestions({
      activities: [activity({ activityType: 'Follow-up' })],
      opportunities: [],
      records: [],
      ...week,
    });

    assert.equal(suggestions[0].label, 'Chase the reply');
    assert.doesNotMatch(suggestions[0].label.toLowerCase(), /follow up after the follow/);
  });

  test('condenses a paragraph-long captured next action into a readable item', () => {
    const paragraph = 'follow-up to Lan Pham after two quiet weeks on the line audit service. Shared audit scope options for both lines';
    const suggestions = buildPlanSuggestions({
      activities: [activity({ nextAction: paragraph })],
      opportunities: [],
      records: [],
      ...week,
    });

    assert.ok(suggestions[0].label.length < paragraph.length);
    assert.doesNotMatch(suggestions[0].label, /Shared audit scope/);
  });

  test('stays quiet when a later touch on the same account already happened', () => {
    const suggestions = buildPlanSuggestions({
      activities: [
        activity({ id: 'a1', activityDate: '2026-07-14' }),
        activity({ id: 'a2', activityDate: '2026-07-16', accountName: 'MDL.' }),
      ],
      opportunities: [],
      records: [],
      ...week,
    });

    // Only the later touch can suggest anything; the earlier one is answered.
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].sourceActivityId, 'a2');
  });

  test('surfaces a captured risk ahead of a plain follow-up', () => {
    const suggestions = buildPlanSuggestions({
      activities: [
        activity({ id: 'a1', accountName: 'MDL', risks: ['Budget freeze until Q4'] }),
        activity({ id: 'a2', accountName: 'ACS' }),
      ],
      opportunities: [],
      records: [],
      ...week,
    });

    assert.equal(suggestions[0].kind, 'open-risk');
    assert.match(suggestions[0].label, /Budget freeze until Q4/);
    assert.equal(suggestions[1].kind, 'quiet-after-touch');
  });

  test('never re-suggests work the pipeline already puts on the board', () => {
    const suggestions = buildPlanSuggestions({
      activities: [activity({ linkedOpportunityId: 'o1', nextAction: 'Send quote', dueDate: '2026-07-22' })],
      opportunities: [opportunity('o1', 'MDL', '2026-07-22')],
      records: [],
      ...week,
    });

    assert.equal(suggestions.length, 0, 'the deal next action already derives onto the board');
  });

  test('drops a suggestion once it has been accepted', () => {
    const first = buildPlanSuggestions({
      activities: [activity({ nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
      opportunities: [],
      records: [],
      ...week,
    });

    const accepted = createPersonalPlanRecord({
      date: '2026-07-22',
      label: first[0].label,
      tag: first[0].tag,
      suggestionKey: first[0].key,
    });

    const after = buildPlanSuggestions({
      activities: [activity({ nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
      opportunities: [],
      records: [accepted],
      ...week,
    });

    assert.equal(after.length, 0);
  });

  test('drops a suggestion once it has been refused, and remembers the refusal', () => {
    const first = buildPlanSuggestions({
      activities: [activity({ nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
      opportunities: [],
      records: [],
      ...week,
    });

    const dismissal = createDismissedSuggestionRecord({
      suggestionKey: first[0].key,
      date: first[0].suggestedDate,
      label: first[0].label,
      tag: first[0].tag,
    });
    assert.equal(dismissal.dismissed, true);
    assert.equal(dismissal.suggestionKey, first[0].key);

    const after = buildPlanSuggestions({
      activities: [activity({ nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
      opportunities: [],
      records: [dismissal],
      ...week,
    });

    assert.equal(after.length, 0);
  });

  test('collapses repeated quiet touches on one account into a single ask', () => {
    const suggestions = buildPlanSuggestions({
      activities: [
        activity({ id: 'a1', accountName: 'MDL', activityDate: '2026-07-13', nextAction: 'Do thing one' }),
        activity({ id: 'a2', accountName: 'MDL', activityDate: '2026-07-14', nextAction: 'Do thing two' }),
        activity({ id: 'a3', accountName: 'MDL', activityDate: '2026-07-15', nextAction: 'Do thing three' }),
      ],
      opportunities: [],
      records: [],
      ...week,
    });

    assert.equal(suggestions.length, 1, 'one account, one undated-action ask');
  });

  test('caps the list so it stays a plan rather than a data dump', () => {
    const activities = Array.from({ length: 20 }, (_, index) => activity({
      id: `a${index}`,
      accountName: `Account ${index}`,
      activityDate: '2026-07-15',
    }));

    const suggestions = buildPlanSuggestions({ activities, opportunities: [], records: [], ...week });
    assert.equal(suggestions.length, 6);
  });

  test('leaves a short action untouched and truncates a long one on a word', () => {
    assert.equal(condensePlanLabel('Send quote'), 'Send quote');
    const long = condensePlanLabel('Send the revised commercial proposal including the extended warranty terms and updated lead times for Q4');
    assert.ok(long.length <= 84, `expected a capped label, got ${long.length} chars`);
    assert.match(long, /\.\.\.$/);
    assert.doesNotMatch(long, /\s\.\.\.$/, 'no dangling space before the ellipsis');
  });

  test('ignores internal work and anything outside the lookback window', () => {
    const suggestions = buildPlanSuggestions({
      activities: [
        activity({ id: 'a1', activityType: 'Internal coordination' }),
        activity({ id: 'a2', activityType: 'Admin / CRM' }),
        activity({ id: 'a3', accountName: 'Old', activityDate: '2026-05-01' }),
      ],
      opportunities: [],
      records: [],
      ...week,
    });

    assert.equal(suggestions.length, 0);
  });
});
