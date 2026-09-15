import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_CHANNELS,
  ACTIVITY_CHANNEL_VALUES,
  countOutOfOfficeDays,
  inferActivityChannel,
  isCustomerFacingChannel,
  isInPersonChannel,
  isOutOfOfficeChannel,
  normalizeActivityChannel,
  summariseActivityChannels,
} from '../../src/utils/activityChannel.ts';
import {
  buildPlanCompletionActivity,
  findPlanCompletionActivity,
  peopleForPlanAccount,
  planCompletionActivityDate,
  planCompletionNeedsPerson,
  planCompletionProblems,
  planItemAccountName,
} from '../../src/utils/planCompletionLog.ts';
import { buildActivityInsights } from '../../src/utils/activityInsights.ts';

describe('normalizeActivityChannel', () => {
  test('keeps a known channel and rejects everything else', () => {
    assert.equal(normalizeActivityChannel('On-site visit'), 'On-site visit');
    assert.equal(normalizeActivityChannel('  Cold outreach  '), 'Cold outreach');
    assert.equal(normalizeActivityChannel('Site visit'), '');
    assert.equal(normalizeActivityChannel(undefined), '');
    assert.equal(normalizeActivityChannel(7), '');
  });

  test('an unstated channel is never coerced into a real one', () => {
    // Every record written before this field existed reads back as ''. Defaulting
    // them to a channel would invent months of days nobody worked that way.
    assert.equal(normalizeActivityChannel(''), '');
    assert.equal(normalizeActivityChannel(null), '');
  });
});

describe('the vocabulary itself', () => {
  test('the value list and the spec list cannot drift apart', () => {
    // Dropdowns render from the specs and validation reads the values. Two
    // hand-kept lists is how a channel becomes selectable and then unsaveable.
    assert.deepEqual(ACTIVITY_CHANNEL_VALUES, ACTIVITY_CHANNELS.map((spec) => spec.channel));
  });

  test('every channel round-trips through the normalizer', () => {
    ACTIVITY_CHANNEL_VALUES.forEach((channel) => {
      assert.equal(normalizeActivityChannel(channel), channel);
    });
  });
});

describe('channel predicates', () => {
  test('only desk work and days off are not customer-facing', () => {
    const notFacing = ACTIVITY_CHANNELS.filter((spec) => !spec.customerFacing).map((spec) => spec.channel);
    assert.deepEqual(notFacing, ['Desk work', 'Out of office']);
  });

  test('an unstated channel makes no claim in either direction', () => {
    assert.equal(isCustomerFacingChannel(''), false);
    assert.equal(isOutOfOfficeChannel(''), false);
    assert.equal(isInPersonChannel(''), false);
  });

  test('out of office is the only non-working channel', () => {
    const notWorking = ACTIVITY_CHANNELS.filter((spec) => !spec.working).map((spec) => spec.channel);
    assert.deepEqual(notWorking, ['Out of office']);
  });

  test('travel is what in-person means', () => {
    assert.equal(isInPersonChannel('On-site visit'), true);
    assert.equal(isInPersonChannel('Hosted visit'), true);
    assert.equal(isInPersonChannel('Event'), true);
    assert.equal(isInPersonChannel('Online meeting'), false);
  });
});

describe('inferActivityChannel', () => {
  test('reads a channel out of an English note', () => {
    assert.equal(inferActivityChannel('Site visit to the Nam Dinh plant'), 'On-site visit');
    assert.equal(inferActivityChannel('Teams call with procurement'), 'Online meeting');
    assert.equal(inferActivityChannel('Emailed the TDS across'), 'Email / message');
  });

  test('reads the same words written in Vietnamese, with or without diacritics', () => {
    // The operator types "nghỉ lễ" on a phone and "nghi le" on a laptop. A rule
    // that only matches one of them works half the time.
    assert.equal(inferActivityChannel('Nghỉ lễ 2/9'), 'Out of office');
    assert.equal(inferActivityChannel('nghi le 2/9'), 'Out of office');
    assert.equal(inferActivityChannel('Đi khách ở Hải Dương'), 'On-site visit');
    assert.equal(inferActivityChannel('di khach o Hai Duong'), 'On-site visit');
  });

  test('a day off is read as a day off even when it names a customer visit', () => {
    // Tested first on purpose. Read in the other order this becomes a customer
    // visit made on a public holiday, and the holiday disappears.
    assert.equal(inferActivityChannel('Nghỉ lễ, không đi khách'), 'Out of office');
  });

  test('a cold call stays a cold call rather than collapsing into a phone call', () => {
    assert.equal(inferActivityChannel('Cold call to a new distributor'), 'Cold outreach');
    assert.equal(inferActivityChannel('Called Ms Ha about the quote'), 'Phone call');
  });

  test('a hosted visit is not read as a trip to the customer', () => {
    assert.equal(inferActivityChannel('They visited our demo room'), 'Hosted visit');
    assert.equal(inferActivityChannel('Visited their QC lab'), 'On-site visit');
  });

  test('says nothing when the note says nothing', () => {
    assert.equal(inferActivityChannel('Price is still under discussion'), '');
    assert.equal(inferActivityChannel(''), '');
  });
});

describe('countOutOfOfficeDays', () => {
  test('counts distinct days, not entries', () => {
    // Two notes written on the same holiday are still one day off.
    assert.equal(countOutOfOfficeDays([
      { activityDate: '2026-09-02', activityChannel: 'Out of office' },
      { activityDate: '2026-09-02', activityChannel: 'Out of office' },
      { activityDate: '2026-09-03', activityChannel: 'Out of office' },
      { activityDate: '2026-09-04', activityChannel: 'On-site visit' },
      { activityDate: '', activityChannel: 'Out of office' },
    ]), 2);
  });
});

describe('summariseActivityChannels', () => {
  test('counts stated channels largest first and drops the empty ones', () => {
    const rows = summariseActivityChannels([
      { activityChannel: 'On-site visit' },
      { activityChannel: 'On-site visit' },
      { activityChannel: 'Phone call' },
      { activityChannel: '' },
      { activityChannel: undefined },
    ]);
    assert.deepEqual(rows, [
      { channel: 'On-site visit', count: 2 },
      { channel: 'Phone call', count: 1 },
    ]);
  });
});

const planItem = (overrides = {}) => ({
  id: 'p1',
  kind: 'personal',
  date: '2026-09-02',
  tag: 'Frulact',
  label: 'Follow up on the RTU plate quote',
  done: true,
  href: '',
  overdue: false,
  workKind: 'customer',
  workBrand: '',
  workDomain: null,
  ...overrides,
});

describe('buildPlanCompletionActivity', () => {
  test('writes nothing when the note is empty', () => {
    // A tick means "done", not "and here is a paragraph about it".
    assert.equal(buildPlanCompletionActivity({
      item: planItem(), note: '   ', opportunities: [], activityDate: '2026-09-02',
    }), null);
  });

  test('carries the planned channel onto the touch', () => {
    const log = buildPlanCompletionActivity({
      item: planItem({ channel: 'On-site visit' }),
      note: 'Walked the line with Ms Ha.',
      person: { name: 'Ms Ha' },
      opportunities: [],
      activityDate: '2026-09-02',
    });
    assert.equal(log.activity.activityChannel, 'On-site visit');
    assert.equal(log.accountName, 'Frulact');
  });

  test('an override at the tick beats the channel that was planned', () => {
    // The day is allowed to have gone differently from the plan.
    const log = buildPlanCompletionActivity({
      item: planItem({ channel: 'On-site visit' }),
      note: 'They cancelled, so we did it on a call.',
      person: { name: 'Ms Ha' },
      opportunities: [],
      activityDate: '2026-09-02',
      channel: 'Online meeting',
    });
    assert.equal(log.activity.activityChannel, 'Online meeting');
  });

  test('a day out of the office never lands on a customer', () => {
    // Ticking "[Frulact] follow up" as a holiday must not stamp Frulact as
    // freshly contacted - an alarm switched off by a public holiday never fires.
    const log = buildPlanCompletionActivity({
      item: planItem({ channel: 'Out of office' }),
      note: 'Public holiday.',
      opportunities: [],
      activityDate: '2026-09-02',
    });
    assert.equal(log.accountName, '');
    assert.equal(log.activity.accountName, '');
    assert.equal(log.activity.opportunityName, '');
  });

  test('every touch it writes is traceable back to the box that made it', () => {
    const log = buildPlanCompletionActivity({
      item: planItem(), note: 'Sent it.', person: { name: 'Ms Ha' }, opportunities: [], activityDate: '2026-09-02',
    });
    assert.ok(log.activity.tags.includes('plan-completion'));
    assert.ok(log.activity.tags.includes('plan:p1'));
  });
});

describe('finishing a plan item records who it was with', () => {
  const deal = { id: 'd1', accountName: 'Frulact Portugal', opportunityName: 'Line 2 retrofit' };

  test('customer work names a person, or nothing is written', () => {
    const input = { item: planItem(), note: 'Agreed the trial date.', opportunities: [], activityDate: '2026-09-02' };
    assert.equal(buildPlanCompletionActivity(input), null);
    assert.deepEqual(planCompletionProblems(input), ['Name who it was with.']);
    assert.deepEqual(planCompletionProblems({ ...input, note: '' }), ['Write what happened.', 'Name who it was with.']);

    const log = buildPlanCompletionActivity({ ...input, person: { name: 'Ana Sousa', roleTitle: 'Plant manager' } });
    assert.equal(log.activity.stakeholderName, 'Ana Sousa');
    assert.equal(log.activity.contactName, 'Ana Sousa');
    assert.equal(log.activity.stakeholderRole, 'Plant manager');
    assert.match(log.activity.rawNote, /with Ana Sousa/);
  });

  test('internal work and a day off do not ask for anyone', () => {
    const internal = planItem({ tag: 'Internal', workKind: 'internal' });
    assert.equal(planCompletionNeedsPerson(internal, []), false);
    assert.ok(buildPlanCompletionActivity({ item: internal, note: 'Submitted KPI.', opportunities: [], activityDate: '2026-09-02' }));

    const holiday = planItem({ channel: 'Out of office' });
    assert.equal(planCompletionNeedsPerson(holiday, []), false);
    const log = buildPlanCompletionActivity({
      item: holiday, note: 'Public holiday.', person: { name: 'Ana Sousa' }, opportunities: [], activityDate: '2026-09-02',
    });
    assert.equal(log.activity.stakeholderName, '', 'a person named on a day off is not recorded as met');
  });

  test('the customer comes from the deal, then the link on the line, then a customer tag', () => {
    const dealItem = planItem({ kind: 'deal', id: 'deal-d1', derivedKey: 'deal:d1:2026-09-02', tag: 'Frulact', href: '/app/opportunities?opportunityId=d1' });
    assert.equal(planItemAccountName(dealItem, [deal]), 'Frulact Portugal');
    const linked = planItem({ kind: 'personal', tag: 'Visit', workKind: 'internal', href: '/app/accounts?accountName=Vila%20Gale' });
    assert.equal(planItemAccountName(linked, []), 'Vila Gale');
    assert.equal(planItemAccountName(planItem({ workKind: 'internal', tag: 'Internal' }), []), '');
  });

  test('the people offered are the ones filed under that customer, the named one first', () => {
    const people = [
      { name: 'Rui Costa', accountName: 'Frulact' },
      { name: 'Ana Sousa', accountName: 'FRULACT' },
      { name: 'Mai Nguyen', accountName: 'Vila Gale' },
    ];
    assert.deepEqual(peopleForPlanAccount(people, 'Frulact', 'Rui Costa').map((person) => person.name), ['Rui Costa', 'Ana Sousa']);
    assert.deepEqual(peopleForPlanAccount(people, '', 'Rui Costa'), []);
  });

  test('the activity is dated on the plan day once it has passed, and today when finished early', () => {
    assert.equal(planCompletionActivityDate({ date: '2026-09-14' }, '2026-09-15'), '2026-09-14', 'a Monday visit ticked on Tuesday is Monday');
    assert.equal(planCompletionActivityDate({ date: '2026-09-15' }, '2026-09-15'), '2026-09-15');
    assert.equal(planCompletionActivityDate({ date: '2026-09-18' }, '2026-09-15'), '2026-09-15', 'Friday work done on Tuesday happened Tuesday');
    assert.equal(planCompletionActivityDate({ date: 'not a date' }, '2026-09-15'), '2026-09-15');
  });

  test('a recorded line is found again by the tag it wrote', () => {
    const item = planItem({ id: 'p9' });
    assert.equal(findPlanCompletionActivity(item, [{ tags: ['plan-completion', 'plan:p1'] }]), undefined);
    assert.ok(findPlanCompletionActivity(item, [{ tags: ['plan-completion', 'plan:p9'] }]));
  });
});

describe('going quiet, with channels in play', () => {
  const activity = (overrides = {}) => ({
    id: 'a1', accountName: 'Frulact', linkedAccountName: '', linkedOpportunityId: '',
    activityType: 'Customer meeting', activityDate: '2026-08-01',
    nextAction: '', dueDate: '', nextActions: [], summary: '', tags: [], risks: [],
    ...overrides,
  });
  const range = { start: '2026-09-01', end: '2026-09-07' };

  test('desk work does not reset a customer silence clock', () => {
    // Filing a quotation under Frulact's name does not mean Frulact heard from
    // anybody. Without this the account reads as touched yesterday.
    const insights = buildActivityInsights({
      activities: [
        activity({ id: 'a1', activityDate: '2026-08-01' }),
        activity({ id: 'a2', activityDate: '2026-09-01', activityChannel: 'Desk work' }),
      ],
      planRecords: [],
      range,
      today: '2026-09-03',
    });
    assert.equal(insights.quietAccounts[0]?.account, 'Frulact');
    assert.equal(insights.quietAccounts[0]?.lastTouch, '2026-08-01');
  });

  test('a record with no channel still counts as a touch', () => {
    // Every row written before the field existed has no channel. If the rule
    // read those as internal, a busy history would report itself as silence.
    const insights = buildActivityInsights({
      activities: [
        activity({ id: 'a1', activityDate: '2026-08-01' }),
        activity({ id: 'a2', activityDate: '2026-09-01' }),
      ],
      planRecords: [],
      range,
      today: '2026-09-03',
    });
    assert.equal(insights.quietAccounts.length, 0);
  });
});
