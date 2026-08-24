import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildPlanBoard } from '../../src/utils/weeklyPlan.ts';

// Monday 24 August 2026 is inside the week 24-30 Aug.
const TODAY = '2026-08-24';
const anchor = new Date(2026, 7, 24);

const planRecord = (id, date, label, done = false) => ({
  id, date, label, tag: 'Grupo Pestana', done,
  linkedAccountName: 'Grupo Pestana',
  createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
});

const board = (records, overrides = {}) => buildPlanBoard({
  periodType: 'week',
  anchorDate: anchor,
  opportunities: [],
  obligations: [],
  records,
  today: TODAY,
  ...overrides,
});

const itemsOn = (result, date) => (result.days.find((day) => day.date === date)?.items || []);

describe('a promise made in March is still work in August', () => {
  test('an unkept promise from outside the week lands on today', () => {
    // The board filtered every source by `isBusinessDateInRange`, so seven
    // promises from March to July simply were not on it - while the commitment
    // panel directly above listed all seven as overdue.
    const result = board([planRecord('p1', '2026-03-12', 'Send the revised payback model')]);
    const today = itemsOn(result, TODAY);
    assert.equal(today.length, 1);
    assert.equal(today[0].label, 'Send the revised payback model');
  });

  test('it says the day it was actually owed', () => {
    const result = board([planRecord('p1', '2026-03-12', 'Send the revised payback model')]);
    const [item] = itemsOn(result, TODAY);
    assert.equal(item.carriedFrom, '2026-03-12');
    assert.equal(item.overdue, true);
  });

  test('a promise that was kept stays where it was kept', () => {
    const result = board([planRecord('p1', '2026-03-12', 'Send the revised payback model', true)]);
    assert.deepEqual(itemsOn(result, TODAY), []);
  });

  test('the oldest promise comes first', () => {
    const result = board([
      planRecord('p1', '2026-07-31', 'Newest'),
      planRecord('p2', '2026-03-12', 'Oldest'),
      planRecord('p3', '2026-05-18', 'Middle'),
    ]);
    assert.deepEqual(itemsOn(result, TODAY).map((item) => item.label), ['Oldest', 'Middle', 'Newest']);
  });

  test('the week total counts the work that is really owed', () => {
    // "0 / 1 done" on a week where eight things are outstanding is the number
    // an operator reads and believes.
    const result = board([
      planRecord('p1', '2026-03-12', 'Send the revised payback model'),
      planRecord('p2', '2026-05-18', 'Send the phasing plan'),
      planRecord('p3', '2026-08-26', 'Send the board pack'),
    ]);
    assert.equal(result.totalCount, 3);
  });

  test('work older than a year is history, not this week', () => {
    const result = board([planRecord('p1', '2024-01-05', 'Something from two years ago')]);
    assert.deepEqual(itemsOn(result, TODAY), []);
  });

  test('paging back to a past week does not inject this week backlog', () => {
    // Looking at March deliberately is a look at March.
    const result = buildPlanBoard({
      periodType: 'week',
      anchorDate: new Date(2026, 5, 1),
      opportunities: [], obligations: [],
      records: [planRecord('p1', '2026-03-12', 'Send the revised payback model')],
      today: TODAY,
    });
    const carried = result.days.flatMap((day) => day.items).filter((item) => item.carriedFrom);
    assert.deepEqual(carried, []);
  });

  test('items already inside the week are untouched', () => {
    const result = board([planRecord('p1', '2026-08-26', 'Send the board pack')]);
    assert.deepEqual(itemsOn(result, TODAY), []);
    assert.equal(itemsOn(result, '2026-08-26').length, 1);
    assert.equal(itemsOn(result, '2026-08-26')[0].carriedFrom, undefined);
  });
});
