import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetricTrend,
  buildOperatorTrends,
  buildWeeklyPeriods,
  trendRules,
} from '../../src/utils/metricTrend.ts';

const points = (values, { runningValue = null } = {}) => {
  const list = values.map((value, index) => ({
    start: `2026-06-0${index + 1}`,
    end: `2026-06-0${index + 1}`,
    value,
    complete: true,
  }));
  if (runningValue !== null) {
    list.push({ start: '2026-07-27', end: '2026-08-02', value: runningValue, complete: false });
  }
  return list;
};

const trend = (values, options = {}) => buildMetricTrend({
  id: 'touches',
  label: 'Touches captured',
  unit: 'count',
  betterWhen: options.betterWhen,
  points: points(values, options),
});

describe('buildMetricTrend', () => {
  test('refuses to name a direction on fewer than four completed periods', () => {
    const result = trend([4, 3, 2]);
    assert.equal(result.direction, 'unreadable');
    assert.equal(result.notable, false);
    assert.equal(result.changePct, null);
    assert.match(result.reading, new RegExp(`needs ${trendRules.minimumPeriods}`));
  });

  test('the period still running never votes on the direction', () => {
    // Four flat weeks, and a Wednesday with almost nothing in it yet. Counting
    // the half-finished week would report a collapse every Monday morning.
    const result = trend([5, 5, 5, 5], { runningValue: 0 });
    assert.equal(result.direction, 'steady');
    assert.equal(result.latest, 5);
    assert.equal(result.points.length, 5);
  });

  test('three moves the same way is a slide, and says how long it has run', () => {
    const result = trend([10, 9, 8, 7]);
    assert.equal(result.direction, 'falling');
    assert.equal(result.streak, 3);
    assert.equal(result.notable, true);
    assert.match(result.reading, /down 3 periods in a row/);
  });

  test('a big drop counts even without a run', () => {
    const result = trend([10, 10, 4, 4]);
    assert.equal(result.direction, 'falling');
    assert.equal(result.streak, 0);
    assert.equal(Math.round(result.changePct * 100), -60);
    assert.match(result.reading, /down 60%/);
  });

  test('one deal becoming none is not a 100% collapse', () => {
    // Arithmetically it is. In a sales week it is nothing, and a panel that
    // shouts about it is a panel that gets ignored.
    const result = trend([1, 1, 0, 0]);
    assert.equal(result.direction, 'unreadable');
    assert.equal(result.notable, false);
    assert.match(result.reading, /Too few to read a direction from/);
  });

  test('a run of three still counts however small the numbers are', () => {
    const result = trend([3, 2, 1, 0]);
    assert.equal(result.direction, 'falling');
    assert.equal(result.streak, 3);
  });

  test('the low-volume rule is for counts, not for money', () => {
    const result = buildMetricTrend({
      id: 'wonValue',
      label: 'Value won',
      unit: 'money',
      points: points([2, 2, 0.5, 0.5]),
    });
    assert.equal(result.direction, 'falling');
    assert.equal(result.notable, true);
  });

  test('noise inside the dead-band is reported as steady, which is the truth', () => {
    const result = trend([10, 11, 10, 11]);
    assert.equal(result.direction, 'steady');
    assert.equal(result.notable, false);
    assert.match(result.reading, /holding around/);
  });

  test('rising is bad news for a metric that should fall', () => {
    const result = trend([2, 3, 4, 5], { betterWhen: 'lower' });
    assert.equal(result.direction, 'rising');
    assert.equal(result.sentiment, 'bad');

    const good = trend([5, 4, 3, 2], { betterWhen: 'lower' });
    assert.equal(good.direction, 'falling');
    assert.equal(good.sentiment, 'good');
  });

  test('a period with no reading at all is skipped rather than counted as zero', () => {
    const result = buildMetricTrend({
      id: 'followThrough',
      label: 'Follow-through',
      unit: 'percent',
      points: [
        { start: '2026-06-01', end: '2026-06-07', value: null, complete: true },
        { start: '2026-06-08', end: '2026-06-14', value: 0.8, complete: true },
        { start: '2026-06-15', end: '2026-06-21', value: 0.8, complete: true },
        { start: '2026-06-22', end: '2026-06-28', value: 0.8, complete: true },
      ],
    });

    assert.equal(result.direction, 'unreadable');
    assert.equal(result.latest, 0.8);
  });
});

describe('buildWeeklyPeriods', () => {
  test('anchors on Monday and leaves the current week open', () => {
    const periods = buildWeeklyPeriods(4, '2026-07-29');
    assert.equal(periods.length, 4);
    assert.deepEqual(periods.map((period) => period.start), ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']);
    assert.equal(periods[0].end, '2026-07-12');
    assert.equal(periods[3].complete, false);
    assert.deepEqual(periods.slice(0, 3).map((period) => period.complete), [true, true, true]);
  });

  test('a Monday is the first day of its own week, not the last of the previous one', () => {
    const periods = buildWeeklyPeriods(2, '2026-07-27');
    assert.equal(periods[1].start, '2026-07-27');
    assert.equal(periods[1].complete, false);
  });
});

describe('buildOperatorTrends', () => {
  const activity = (id, activityDate) => ({
    id, accountName: 'MDL', linkedAccountName: 'MDL', linkedOpportunityId: '',
    activityType: 'Customer meeting', activityDate,
    nextAction: '', dueDate: '', nextActions: [], summary: '', tags: [], rawNote: '',
  });

  test('buckets each record into the week it happened in', () => {
    const trends = buildOperatorTrends({
      activities: [
        activity('a1', '2026-07-06'),
        activity('a2', '2026-07-08'),
        activity('a3', '2026-07-20'),
        activity('a4', '2026-07-28'), // the running week
      ],
      opportunities: [{ id: 'o1', createdAt: '2026-07-14', currency: 'VND', estimatedValue: 1, status: 'Active' }],
      opportunityOutcomes: [],
      quotes: [],
      planRecords: [],
      weeks: 4,
      today: '2026-07-29',
    });

    const touches = trends.find((entry) => entry.id === 'touches');
    assert.deepEqual(touches.points.map((point) => point.value), [2, 0, 1, 1]);
    assert.equal(touches.points[3].complete, false);

    const newDeals = trends.find((entry) => entry.id === 'newDeals');
    assert.deepEqual(newDeals.points.map((point) => point.value), [0, 1, 0, 0]);
  });

  test('every standard metric is produced, so an empty workspace still reads as empty rather than absent', () => {
    const trends = buildOperatorTrends({
      activities: [], opportunities: [], opportunityOutcomes: [], quotes: [], planRecords: [],
      today: '2026-07-29',
    });

    assert.deepEqual(trends.map((entry) => entry.id), ['touches', 'followThrough', 'newDeals', 'quotes', 'wonValue']);
    trends.forEach((entry) => assert.equal(entry.notable, false));
  });
});
