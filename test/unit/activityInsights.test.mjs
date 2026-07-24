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
    assert.equal(insights.followThrough.openOverdue, 1, 'the undone one is now past due');
    assert.equal(insights.followThrough.settled, 2, 'both days have arrived');
    assert.equal(insights.followThrough.notYetDue, 0);
    assert.equal(insights.followThrough.rate, 0.5);
  });

  test('work still ahead of its due date is not scored as a miss', () => {
    // Captured on Monday, both due later in the week, neither done. Nothing has
    // come due, so there is no rate to report - not a 0%.
    const insights = buildActivityInsights({
      activities: [activity({
        id: 'a1', activityDate: '2026-07-20',
        nextAction: 'Send revised quote', dueDate: '2026-07-24',
        nextActions: [{ title: 'Book demo', dueDate: '2026-07-25' }],
      })],
      planRecords: [],
      range: week,
      today: '2026-07-21',
    });

    assert.equal(insights.followThrough.committed, 2);
    assert.equal(insights.followThrough.done, 0);
    assert.equal(insights.followThrough.openOverdue, 0, 'nothing is late');
    assert.equal(insights.followThrough.settled, 0);
    assert.equal(insights.followThrough.notYetDue, 2);
    assert.equal(insights.followThrough.rate, null, 'no rate while nothing has come due');
    assert.match(insights.headline, /none due yet/);
  });

  test('an action finished before its due date still counts as kept', () => {
    const done = {
      id: 'done-early', date: '2026-07-24', label: 'Send revised quote', tag: 'MDL',
      done: true, doneAt: '2026-07-21T09:00:00Z',
      derivedKey: buildCaptureDerivedKey('a1', '2026-07-24', 'main'),
      createdAt: '2026-07-21T09:00:00Z', updatedAt: '2026-07-21T09:00:00Z',
    };
    const insights = buildActivityInsights({
      activities: [activity({ id: 'a1', activityDate: '2026-07-20', nextAction: 'Send revised quote', dueDate: '2026-07-24' })],
      planRecords: [done],
      range: week,
      today: '2026-07-21',
    });

    assert.equal(insights.followThrough.done, 1);
    assert.equal(insights.followThrough.settled, 1, 'a completed action is judged even if early');
    assert.equal(insights.followThrough.rate, 1);
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

  test('counts coverage - distinct accounts and opportunities, follow-ups and objections', () => {
    const insights = buildActivityInsights({
      activities: [
        activity({ id: 'a1', accountName: 'MDL', opportunityName: 'MDL deal', activityDate: '2026-07-20', activityType: 'Customer meeting' }),
        activity({ id: 'a2', accountName: 'MDL', opportunityName: 'MDL deal', activityDate: '2026-07-21', activityType: 'Follow-up' }),
        activity({ id: 'a3', accountName: 'ACS', opportunityName: 'ACS deal', activityDate: '2026-07-22', activityType: 'Objection handling' }),
      ],
      planRecords: [],
      range: week,
      today: '2026-07-23',
    });

    assert.equal(insights.coverage.accountsTouched, 2);
    assert.equal(insights.coverage.opportunitiesTouched, 2);
    assert.equal(insights.coverage.followUps, 1);
    assert.equal(insights.coverage.objections, 1);
  });

  test('is empty and safe when nothing was captured in the period', () => {
    const insights = buildActivityInsights({ activities: [], planRecords: [], range: week, today: '2026-07-23' });
    assert.equal(insights.total, 0);
    assert.equal(insights.followThrough.committed, 0);
    assert.equal(insights.followThrough.rate, null);
    assert.match(insights.headline, /No activity captured/);
  });
});
