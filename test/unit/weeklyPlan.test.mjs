import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlanBoard,
  createDerivedCompletionRecord,
  createPersonalPlanRecord,
  getPlanRange,
  shiftPlanAnchor,
  splitBracketTag,
} from '../../src/utils/weeklyPlan.ts';

const opportunity = (id, accountName, nextAction, nextActionDate, status = 'Active') => ({
  id, accountName, nextAction, nextActionDate, status,
  opportunityName: `${accountName} deal`, stage: 'Qualified', estimatedValue: 1000, currency: 'VND',
});

const obligation = (id, label, counterparty, dueDate) => ({
  id, label, counterparty, dueDate, kind: 'payment', amount: 1000, currency: 'VND',
  amountBase: 1000, daysUntilDue: 1, status: 'upcoming', href: '/app/revenue',
});

// Week of Mon 2026-07-20 .. Sun 2026-07-26
const anchor = new Date(2026, 6, 22);

describe('getPlanRange', () => {
  test('weeks run Monday to Sunday', () => {
    const range = getPlanRange('week', anchor);
    assert.equal(range.start, '2026-07-20');
    assert.equal(range.end, '2026-07-26');
  });

  test('a Sunday belongs to the week that started the previous Monday', () => {
    const range = getPlanRange('week', new Date(2026, 6, 26));
    assert.equal(range.start, '2026-07-20');
  });

  test('month range covers the whole calendar month', () => {
    const range = getPlanRange('month', anchor);
    assert.equal(range.start, '2026-07-01');
    assert.equal(range.end, '2026-07-31');
  });
});

describe('buildPlanBoard', () => {
  test('places dated deal actions on their weekday', () => {
    const board = buildPlanBoard({
      periodType: 'week',
      anchorDate: anchor,
      opportunities: [opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20')],
      obligations: [],
      records: [],
      today: '2026-07-22',
    });

    const monday = board.days.find((day) => day.date === '2026-07-20');
    assert.equal(monday.weekdayLabel, 'Monday');
    assert.equal(monday.items.length, 1);
    assert.equal(monday.items[0].tag, 'MDL');
    assert.equal(monday.items[0].label, 'Connect Mr. Tinh');
    assert.equal(monday.items[0].kind, 'deal');
  });

  test('excludes closed deals and dates outside the period', () => {
    const board = buildPlanBoard({
      periodType: 'week',
      anchorDate: anchor,
      opportunities: [
        opportunity('o1', 'MDL', 'In period', '2026-07-21'),
        opportunity('o2', 'ACS', 'Out of period', '2026-08-11'),
        opportunity('o3', 'KN', 'Closed deal', '2026-07-21', 'Won'),
      ],
      obligations: [],
      records: [],
      today: '2026-07-22',
    });

    assert.equal(board.totalCount, 1);
    assert.equal(board.derivedCount, 1);
  });

  test('includes obligations you owe', () => {
    const board = buildPlanBoard({
      periodType: 'week',
      anchorDate: anchor,
      opportunities: [],
      obligations: [obligation('e1', 'VAT payment', 'Tax office', '2026-07-23')],
      records: [],
      today: '2026-07-22',
    });

    const thursday = board.days.find((day) => day.date === '2026-07-23');
    assert.equal(thursday.items[0].kind, 'obligation');
    assert.equal(thursday.items[0].tag, 'Tax office');
  });

  test('personal items sit beside derived ones on the same day', () => {
    const personal = createPersonalPlanRecord({ date: '2026-07-20', label: '[Internal] Submit KPI' });
    const board = buildPlanBoard({
      periodType: 'week',
      anchorDate: anchor,
      opportunities: [opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20')],
      obligations: [],
      records: [personal],
      today: '2026-07-22',
    });

    const monday = board.days.find((day) => day.date === '2026-07-20');
    assert.equal(monday.items.length, 2);
    assert.equal(board.personalCount, 1);
    assert.equal(board.derivedCount, 1);
    const kpi = monday.items.find((item) => item.kind === 'personal');
    assert.equal(kpi.tag, 'Internal');
    assert.equal(kpi.label, 'Submit KPI');
  });

  test('a completion mark checks off the derived item it belongs to', () => {
    const opp = opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20');
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor, opportunities: [opp], obligations: [], records: [], today: '2026-07-22',
    });
    const item = board.days.find((day) => day.date === '2026-07-20').items[0];

    const done = buildPlanBoard({
      periodType: 'week',
      anchorDate: anchor,
      opportunities: [opp],
      obligations: [],
      records: [createDerivedCompletionRecord(item, true)],
      today: '2026-07-22',
    });

    assert.equal(done.days.find((day) => day.date === '2026-07-20').items[0].done, true);
    assert.equal(done.doneCount, 1);
  });

  test('rescheduling a deal drops its old completion mark', () => {
    const opp = opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20');
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor, opportunities: [opp], obligations: [], records: [], today: '2026-07-22',
    });
    const completion = createDerivedCompletionRecord(board.days.find((day) => day.date === '2026-07-20').items[0], true);

    // The seller moves the next action to Wednesday: that is a new commitment,
    // so it must show up open rather than inheriting Monday's tick.
    const moved = buildPlanBoard({
      periodType: 'week',
      anchorDate: anchor,
      opportunities: [opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-22')],
      obligations: [],
      records: [completion],
      today: '2026-07-22',
    });

    assert.equal(moved.days.find((day) => day.date === '2026-07-22').items[0].done, false);
    assert.equal(moved.doneCount, 0);
  });

  test('flags an unfinished past-dated item as overdue', () => {
    const board = buildPlanBoard({
      periodType: 'week',
      anchorDate: anchor,
      opportunities: [opportunity('o1', 'MDL', 'Late action', '2026-07-20')],
      obligations: [],
      records: [],
      today: '2026-07-22',
    });

    assert.equal(board.days.find((day) => day.date === '2026-07-20').items[0].overdue, true);
  });

  test('open work sorts above completed work in a column', () => {
    const opp = opportunity('o1', 'AAA', 'Derived action', '2026-07-20');
    const seed = buildPlanBoard({
      periodType: 'week', anchorDate: anchor, opportunities: [opp], obligations: [], records: [], today: '2026-07-22',
    });
    const completion = createDerivedCompletionRecord(seed.days.find((day) => day.date === '2026-07-20').items[0], true);

    const board = buildPlanBoard({
      periodType: 'week',
      anchorDate: anchor,
      opportunities: [opp],
      obligations: [],
      records: [completion, createPersonalPlanRecord({ date: '2026-07-20', label: '[ZZZ] Still to do' })],
      today: '2026-07-22',
    });

    const monday = board.days.find((day) => day.date === '2026-07-20');
    assert.equal(monday.items[0].done, false);
    assert.equal(monday.items[1].done, true);
  });

  test('deleted records never reach the board', () => {
    const personal = { ...createPersonalPlanRecord({ date: '2026-07-20', label: 'Removed' }), __deleted: true };
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor, opportunities: [], obligations: [], records: [personal], today: '2026-07-22',
    });
    assert.equal(board.totalCount, 0);
  });
});

const capture = (overrides = {}) => ({
  id: 'c1', accountName: 'MDL', linkedAccountName: '', linkedOpportunityId: '',
  activityType: 'Customer meeting', activityDate: '2026-07-20',
  nextAction: '', dueDate: '', nextActions: [], summary: '', ...overrides,
});

describe('buildPlanBoard capture items', () => {
  test('a dated captured next action lands on the plan automatically', () => {
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor,
      opportunities: [], obligations: [], records: [],
      activities: [capture({ nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
      today: '2026-07-22',
    });

    const wednesday = board.days.find((day) => day.date === '2026-07-22');
    assert.equal(wednesday.items.length, 1);
    assert.equal(wednesday.items[0].kind, 'capture');
    assert.equal(wednesday.items[0].tag, 'MDL');
    assert.equal(wednesday.items[0].label, 'Send revised quote');
    assert.equal(board.captureCount, 1);
    assert.equal(board.derivedCount, 1);
  });

  test('an undated captured next action never reaches the board', () => {
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor,
      opportunities: [], obligations: [], records: [],
      activities: [capture({ nextAction: 'Call back', dueDate: '' })],
      today: '2026-07-22',
    });
    assert.equal(board.totalCount, 0);
    assert.equal(board.captureCount, 0);
  });

  test('each structured next action with its own date gets a day', () => {
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor,
      opportunities: [], obligations: [], records: [],
      activities: [capture({ nextActions: [
        { title: 'Send quote', dueDate: '2026-07-21' },
        { title: 'Book demo', dueDate: '2026-07-23' },
        { title: 'No date here' },
      ] })],
      today: '2026-07-22',
    });
    assert.equal(board.captureCount, 2);
    assert.equal(board.days.find((day) => day.date === '2026-07-21').items[0].label, 'Send quote');
    assert.equal(board.days.find((day) => day.date === '2026-07-23').items[0].label, 'Book demo');
  });

  test('a capture linked to a deal does not duplicate the deal item', () => {
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor,
      opportunities: [opportunity('o1', 'MDL', 'Send quote', '2026-07-22')],
      obligations: [], records: [],
      activities: [capture({ accountName: 'MDL', linkedOpportunityId: 'o1', nextAction: 'Send quote', dueDate: '2026-07-22' })],
      today: '2026-07-22',
    });

    const wednesday = board.days.find((day) => day.date === '2026-07-22');
    assert.equal(wednesday.items.length, 1);
    assert.equal(wednesday.items[0].kind, 'deal');
    assert.equal(board.captureCount, 0);
  });

  test('a hand-typed personal item wins over an equivalent capture on the same day', () => {
    const personal = createPersonalPlanRecord({ date: '2026-07-22', label: 'Send revised quote', tag: 'MDL' });
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor,
      opportunities: [], obligations: [], records: [personal],
      activities: [capture({ accountName: 'MDL', nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
      today: '2026-07-22',
    });

    const wednesday = board.days.find((day) => day.date === '2026-07-22');
    assert.equal(wednesday.items.length, 1);
    assert.equal(wednesday.items[0].kind, 'personal');
    assert.equal(board.captureCount, 0);
  });

  test('a genuinely different capture on a planned day is kept, not hidden', () => {
    const personal = createPersonalPlanRecord({ date: '2026-07-22', label: 'Internal budget review', tag: 'MDL' });
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor,
      opportunities: [], obligations: [], records: [personal],
      activities: [capture({ accountName: 'MDL', nextAction: 'Send revised quote', dueDate: '2026-07-22' })],
      today: '2026-07-22',
    });

    const wednesday = board.days.find((day) => day.date === '2026-07-22');
    assert.equal(wednesday.items.length, 2);
    assert.equal(board.captureCount, 1);
  });

  test('the same next action in both the headline and the list is one plan item', () => {
    // The parser commonly mirrors the headline nextAction into nextActions[0];
    // that must not surface the same commitment twice.
    const board = buildPlanBoard({
      periodType: 'week', anchorDate: anchor,
      opportunities: [], obligations: [], records: [],
      activities: [capture({
        nextAction: 'Send revised quote', dueDate: '2026-07-22',
        nextActions: [{ title: 'Send revised quote', dueDate: '2026-07-22' }],
      })],
      today: '2026-07-22',
    });
    assert.equal(board.captureCount, 1);
    assert.equal(board.days.find((day) => day.date === '2026-07-22').items.length, 1);
  });

  test('a completion mark checks off a capture item', () => {
    const activities = [capture({ nextAction: 'Send revised quote', dueDate: '2026-07-22' })];
    const seed = buildPlanBoard({
      periodType: 'week', anchorDate: anchor, opportunities: [], obligations: [], records: [], activities, today: '2026-07-22',
    });
    const item = seed.days.find((day) => day.date === '2026-07-22').items[0];

    const done = buildPlanBoard({
      periodType: 'week', anchorDate: anchor, opportunities: [], obligations: [],
      records: [createDerivedCompletionRecord(item, true)], activities, today: '2026-07-22',
    });

    assert.equal(done.days.find((day) => day.date === '2026-07-22').items[0].done, true);
    assert.equal(done.doneCount, 1);
  });
});

describe('splitBracketTag', () => {
  test('reads a bracketed prefix as the tag', () => {
    assert.deepEqual(splitBracketTag('[Internal] Submit KPI'), { tag: 'Internal', label: 'Submit KPI' });
  });

  test('leaves an unbracketed label alone', () => {
    assert.deepEqual(splitBracketTag('Business trip claim'), { tag: '', label: 'Business trip claim' });
  });
});

describe('shiftPlanAnchor', () => {
  test('moves a week at a time', () => {
    assert.equal(getPlanRange('week', shiftPlanAnchor(anchor, 'week', 1)).start, '2026-07-27');
    assert.equal(getPlanRange('week', shiftPlanAnchor(anchor, 'week', -1)).start, '2026-07-13');
  });

  test('moves a month at a time', () => {
    assert.equal(getPlanRange('month', shiftPlanAnchor(anchor, 'month', 1)).start, '2026-08-01');
  });
});
