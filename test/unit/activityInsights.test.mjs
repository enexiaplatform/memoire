import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildActivityInsights } from '../../src/utils/activityInsights.ts';
import { buildCaptureDerivedKey } from '../../src/utils/weeklyPlan.ts';

const activity = (overrides = {}) => ({
  id: 'a1', accountName: 'MDL', linkedAccountName: '', linkedOpportunityId: '',
  activityType: 'Customer meeting', activityDate: '2026-07-21',
  nextAction: '', dueDate: '', nextActions: [], summary: '', tags: [], risks: [],
  ...overrides,
});

// Planning/viewing the week of Mon 2026-07-20 .. Sun 2026-07-26.
const week = { start: '2026-07-20', end: '2026-07-26' };

describe('buildActivityInsights', () => {
  test('counts touches in the period and names the busiest day', () => {
    const insights = buildActivityInsights({
      activities: [
        activity({ id: 'a1', activityDate: '2026-07-21' }),
        activity({ id: 'a2', activityDate: '2026-07-21' }),
        activity({ id: 'a3', activityDate: '2026-07-23' }),
        activity({ id: 'a4', activityDate: '2026-08-01' }), // outside the week
      ],
      planRecords: [],
      range: week,
      today: '2026-07-23',
    });

    assert.equal(insights.total, 3);
    assert.equal(insights.activeDays, 2);
    assert.equal(insights.busiestDay.date, '2026-07-21');
    assert.equal(insights.busiestDay.count, 2);
  });

  test('reads momentum against the previous equal-length period', () => {
    const insights = buildActivityInsights({
      activities: [
        // previous week (Jul 13-19): 1 touch
        activity({ id: 'p1', activityDate: '2026-07-14' }),
        // this week: 3 touches
        activity({ id: 'a1', activityDate: '2026-07-20' }),
        activity({ id: 'a2', activityDate: '2026-07-21' }),
        activity({ id: 'a3', activityDate: '2026-07-22' }),
      ],
      planRecords: [],
      range: week,
      today: '2026-07-23',
    });

    assert.equal(insights.momentum.current, 3);
    assert.equal(insights.momentum.previous, 1);
    assert.equal(insights.momentum.direction, 'up');
    assert.equal(insights.momentum.deltaPct, 200);
  });

  test('measures follow-through against the plan completion marks', () => {
    const touch = activity({
      id: 'a1', activityDate: '2026-07-20',
      nextAction: 'Send revised quote', dueDate: '2026-07-22',
      nextActions: [{ title: 'Book demo', dueDate: '2026-07-24' }],
    });
    // The headline next action (slot "main") was ticked done; the structured one was not.
    const done = {
      id: 'done-1', date: '2026-07-22', label: 'Send revised quote', tag: 'MDL',
      done: true, doneAt: '2026-07-22T09:00:00Z',
      derivedKey: buildCaptureDerivedKey('a1', '2026-07-22', 'main'),
      createdAt: '2026-07-22T09:00:00Z', updatedAt: '2026-07-22T09:00:00Z',
    };

    const insights = buildActivityInsights({
      activities: [touch],
      planRecords: [done],
      range: week,
      today: '2026-07-25',
    });

    assert.equal(insights.followThrough.committed, 2, 'two dated next actions were captured');
    assert.equal(insights.followThrough.done, 1, 'one of them was ticked done on the plan');
    assert.equal(insights.followThrough.rate, 0.5);
    assert.equal(insights.followThrough.openOverdue, 1, 'the undone one is now past due');
  });

  test('flags an account that has gone quiet but is still recent', () => {
    const insights = buildActivityInsights({
      activities: [
        activity({ id: 'a1', accountName: 'Quiet Co', activityDate: '2026-07-01' }), // 24 days before today
        activity({ id: 'a2', accountName: 'Fresh Co', activityDate: '2026-07-24' }), // 1 day before today
      ],
      planRecords: [],
      range: week,
      today: '2026-07-25',
    });

    assert.equal(insights.quietAccounts.length, 1);
    assert.equal(insights.quietAccounts[0].account, 'Quiet Co');
    assert.equal(insights.quietAccounts[0].daysSinceTouch, 24);
  });

  test('is empty and safe when nothing was captured in the period', () => {
    const insights = buildActivityInsights({ activities: [], planRecords: [], range: week, today: '2026-07-23' });
    assert.equal(insights.total, 0);
    assert.equal(insights.followThrough.committed, 0);
    assert.equal(insights.followThrough.rate, null);
    assert.match(insights.headline, /No activity captured/);
  });
});
