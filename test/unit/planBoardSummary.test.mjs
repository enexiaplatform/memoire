import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPlanPeriodEyebrow,
  isoWeekNumber,
  NOT_STATED_CHANNEL,
  summarisePlanBoard,
} from '../../src/utils/planBoardSummary.ts';

const item = (patch = {}) => ({
  id: `i-${Math.random().toString(36).slice(2)}`,
  kind: 'personal', date: '2026-09-14', tag: '', label: 'Work', done: false, href: '', overdue: false,
  workKind: 'internal', workBrand: '', workDomain: null, channel: '',
  ...patch,
});

const board = (items, patch = {}) => ({
  periodType: 'week', rangeStart: '2026-09-14', rangeEnd: '2026-09-20',
  days: [{ date: '2026-09-14', weekdayLabel: 'Monday', dayLabel: 'Sep 14', isToday: true, isWeekend: false, items, doneCount: 0 }],
  totalCount: items.length, doneCount: 0, personalCount: 0, derivedCount: 0, captureCount: 0,
  workSplit: { customer: 0, principal: 0, internal: 0, internalByDomain: [] },
  ...patch,
});

describe('plan board summary', () => {
  test('done share, and the lines the records put there versus the ones typed by hand', () => {
    const summary = summarisePlanBoard(board([
      item({ done: true }),
      item({ kind: 'deal' }),
      item({ kind: 'capture', done: true }),
      item({ kind: 'obligation' }),
    ]));
    assert.equal(summary.total, 4);
    assert.equal(summary.done, 2);
    assert.equal(summary.donePercent, 50);
    assert.equal(summary.fromRecords, 3);
    assert.equal(summary.addedByHand, 1);
  });

  test('an empty period has no percentage rather than a zero one', () => {
    assert.equal(summarisePlanBoard(board([])).donePercent, null);
  });

  test('the delta compares with the period before only when that period had anything on it', () => {
    const current = board([item({ done: true }), item()]);
    assert.equal(summarisePlanBoard(current, board([item({ done: true }), item(), item(), item()])).deltaPoints, 25);
    assert.equal(summarisePlanBoard(current, board([])).deltaPoints, null);
  });

  test('channels keep the fixed order, an unstated channel is counted as such, and empty ones are dropped', () => {
    const summary = summarisePlanBoard(board([
      item({ channel: 'Desk work' }),
      item({ channel: 'On-site visit' }),
      item({ channel: 'On-site visit' }),
      item({ channel: '' }),
    ]));
    assert.deepEqual(summary.channelMix, [
      { channel: 'On-site visit', count: 2 },
      { channel: 'Desk work', count: 1 },
      { channel: NOT_STATED_CHANNEL, count: 1 },
    ]);
  });
});

describe('period eyebrow', () => {
  test('ISO week numbers across a year boundary', () => {
    assert.equal(isoWeekNumber('2026-09-14'), 38);
    assert.equal(isoWeekNumber('2026-12-28'), 53);
    assert.equal(isoWeekNumber('2027-01-04'), 1);
  });

  test('a week inside one month, a week across two, and a month', () => {
    assert.equal(formatPlanPeriodEyebrow({ periodType: 'week', rangeStart: '2026-09-14', rangeEnd: '2026-09-20' }), 'Week 38 · 14–20 September');
    assert.equal(
      formatPlanPeriodEyebrow({ periodType: 'week', rangeStart: '2026-09-28', rangeEnd: '2026-10-04' }),
      'Week 40 · 28 September – 4 October',
    );
    assert.equal(formatPlanPeriodEyebrow({ periodType: 'month', rangeStart: '2026-09-01', rangeEnd: '2026-09-30' }), 'September 2026');
  });
});
