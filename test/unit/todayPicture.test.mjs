import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {
  greetingFor,
  summariseMoneyInMotion,
  summariseOpenPipeline,
  summariseOverdueCash,
  summariseSilence,
  summariseWeekPromises,
} from '../../src/utils/todayPicture.ts';
import { SILENCE_CRITICAL_DAYS, SILENCE_WARNING_DAYS } from '../../src/utils/proactiveNudges.ts';

const TODAY = '2026-09-15';
const STAGES = ['Lead', 'Discovery', 'Qualification', 'Technical discussion', 'Demo', 'Proposal', 'Negotiation', 'Procurement'];

const deal = (id, patch = {}) => ({
  id,
  accountName: `Account ${id}`,
  opportunityName: `Deal ${id}`,
  status: 'Active',
  stage: 'Discovery',
  estimatedValue: 1_000_000,
  currency: 'VND',
  nextAction: '',
  nextActionDate: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...patch,
});

const touch = (accountName, activityDate) => ({ id: `a-${accountName}-${activityDate}`, accountName, activityDate });

const daysAgo = (days) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

describe('greeting', () => {
  test('the part of the day follows the local hour', () => {
    assert.equal(greetingFor(new Date(2026, 8, 15, 8), 'Henry Nguyen'), 'Good morning, Henry Nguyen.');
    assert.equal(greetingFor(new Date(2026, 8, 15, 13), 'Henry Nguyen'), 'Good afternoon, Henry Nguyen.');
    assert.equal(greetingFor(new Date(2026, 8, 15, 19), 'Henry Nguyen'), 'Good evening, Henry Nguyen.');
  });

  test('the name is used as given, and left out rather than guessed when there is none', () => {
    assert.equal(greetingFor(new Date(2026, 8, 15, 9), 'Nguyễn Văn An'), 'Good morning, Nguyễn Văn An.');
    assert.equal(greetingFor(new Date(2026, 8, 15, 9), '   '), 'Good morning.');
    assert.equal(greetingFor(new Date(2026, 8, 15, 9), null), 'Good morning.');
  });
});

describe('open pipeline', () => {
  test('only active deals, stages in pipeline order, and the value from Proposal on', () => {
    const picture = summariseOpenPipeline([
      deal('a', { stage: 'Negotiation', estimatedValue: 3_000_000 }),
      deal('b', { stage: 'Discovery', estimatedValue: 1_000_000 }),
      deal('c', { stage: 'Discovery', estimatedValue: 500_000 }),
      deal('won', { status: 'Won', stage: 'Won', estimatedValue: 9_000_000 }),
    ], STAGES);
    assert.equal(picture.dealCount, 3);
    assert.equal(picture.openBase, 4_500_000);
    assert.equal(picture.advancedBase, 3_000_000);
    assert.deepEqual(picture.stages.map((slice) => [slice.stage, slice.count, slice.base]), [
      ['Discovery', 2, 1_500_000],
      ['Negotiation', 1, 3_000_000],
    ]);
  });

  test('a deal in an unpriced currency is counted as a deal and said to be missing from the total', () => {
    const picture = summariseOpenPipeline([
      deal('a', { estimatedValue: 1_000_000 }),
      deal('b', { estimatedValue: 5_000, currency: 'XAF' }),
      deal('c', { estimatedValue: 0 }),
    ], STAGES);
    assert.equal(picture.dealCount, 3);
    assert.equal(picture.openBase, 1_000_000);
    assert.equal(picture.unpricedCount, 1, 'a deal with no amount is not "unpriced", it is unvalued');
  });
});

describe('going silent', () => {
  test('counts with the watch-list thresholds and buckets by how long it has been quiet', () => {
    const picture = summariseSilence({
      opportunities: [
        deal('fresh'),
        deal('warn', { estimatedValue: 700_000 }),
        deal('alarm', { estimatedValue: 2_000_000 }),
        deal('ancient', { estimatedValue: 3_000_000 }),
        deal('booked', { nextActionDate: '2026-09-20' }),
        deal('closed', { status: 'Lost' }),
      ],
      activities: [
        touch('Account fresh', daysAgo(2)),
        touch('Account warn', daysAgo(SILENCE_WARNING_DAYS)),
        touch('Account alarm', daysAgo(SILENCE_CRITICAL_DAYS + 3)),
        touch('Account ancient', daysAgo(75)),
        touch('Account booked', daysAgo(90)),
      ],
      today: TODAY,
    });
    assert.equal(picture.silentCount, 2);
    assert.equal(picture.atRiskCount, 1);
    assert.equal(picture.atStakeBase, 5_000_000, 'only the silent deals are at stake, not the ones at risk');
    assert.equal(picture.quietestOpportunityId, 'ancient');
    assert.deepEqual(picture.buckets.map((bucket) => bucket.count), [1, 1, 0, 0, 1]);
    assert.deepEqual(picture.buckets.map((bucket) => bucket.alarm), [false, true, true, true, true]);
  });

  test('a promise dated on the account turns an alarm into a risk, as it does on the watch-list', () => {
    const picture = summariseSilence({
      opportunities: [deal('x')],
      activities: [touch('Account x', daysAgo(40))],
      commitments: [{ opportunityId: null, accountName: 'Account x', currentDueDate: '2026-09-18', status: 'open' }],
      today: TODAY,
    });
    assert.equal(picture.silentCount, 0);
    assert.equal(picture.atRiskCount, 1);
    assert.equal(picture.atStakeBase, 0);
  });

  test('bucket edges run upward with no gap', () => {
    const { buckets } = summariseSilence({ opportunities: [], activities: [], today: TODAY });
    buckets.slice(0, -1).forEach((bucket, index) => {
      assert.equal(bucket.toDays, buckets[index + 1].fromDays);
    });
    assert.equal(buckets.at(-1).toDays, null);
  });
});

describe('overdue cash', () => {
  test('folds the receivables aging into four segments and finds the oldest late order', () => {
    const receivables = {
      reportingCurrency: 'VND',
      totalOutstandingBase: 1_000,
      totalOverdueBase: 600,
      totalReceivedBase: 0,
      expectedNext30Base: 0,
      openCount: 3,
      averageDaysOutstanding: null,
      aging: [
        { bucket: 'due-soon', label: '', count: 1, amountBase: 100 },
        { bucket: 'current', label: '', count: 1, amountBase: 300 },
        { bucket: '1-30', label: '', count: 1, amountBase: 200 },
        { bucket: '31-60', label: '', count: 0, amountBase: 0 },
        { bucket: '61-90', label: '', count: 1, amountBase: 250 },
        { bucket: '90+', label: '', count: 1, amountBase: 150 },
      ],
      orders: [
        { opportunityId: 'a', accountName: 'A', settled: false, overdueBase: 400, daysOverdue: 95 },
        { opportunityId: 'b', accountName: 'B', settled: false, overdueBase: 200, daysOverdue: 12 },
        { opportunityId: 'c', accountName: 'C', settled: false, overdueBase: 0, daysOverdue: null },
        { opportunityId: 'd', accountName: 'D', settled: true, overdueBase: 0, daysOverdue: null },
      ],
      worstOverdue: { opportunityId: 'a', accountName: 'A', overdueBase: 400, daysOverdue: 95 },
    };
    const picture = summariseOverdueCash(receivables);
    assert.equal(picture.overdueBase, 600);
    assert.equal(picture.overdueOrderCount, 2);
    assert.equal(picture.oldestDaysOverdue, 95);
    assert.deepEqual(picture.segments.map((segment) => [segment.key, segment.base]), [
      ['not-due', 400], ['1-30', 200], ['31-60', 0], ['61+', 400],
    ]);
    assert.equal(picture.worst.accountName, 'A');
  });

  test('nothing late means no oldest age rather than zero days', () => {
    const picture = summariseOverdueCash({
      totalOutstandingBase: 0, totalOverdueBase: 0, aging: [], orders: [], worstOverdue: null,
    });
    assert.equal(picture.oldestDaysOverdue, null);
    assert.equal(picture.worst, null);
  });
});

describe('promises kept', () => {
  test('done over total for the week, and the open ones whose day has passed', () => {
    const item = (patch) => ({ id: Math.random().toString(36), kind: 'personal', label: 'x', done: false, overdue: false, channel: '', ...patch });
    const board = {
      periodType: 'week', rangeStart: '2026-09-14', rangeEnd: '2026-09-20',
      days: [
        { date: '2026-09-14', items: [item({ done: true }), item({ overdue: true })] },
        { date: '2026-09-15', items: [item({ done: true }), item({ overdue: true, done: true }), item()] },
      ],
    };
    assert.deepEqual(summariseWeekPromises(board), { done: 3, total: 5, percent: 60, overdueOpen: 1 });
  });
});

describe('money in motion', () => {
  test('the quote-side lanes on one scale, and the first stuck thread past the deal lane', () => {
    const flow = {
      threads: [],
      totalInMotionBase: 0,
      lanes: [
        { stage: 'Opportunity', threads: 4, totalBase: 9_000, stuckThreads: 1 },
        { stage: 'Quoted', threads: 2, totalBase: 3_000, stuckThreads: 0 },
        { stage: 'Pending PO', threads: 1, totalBase: 5_000, stuckThreads: 1 },
        { stage: 'Pending delivery', threads: 0, totalBase: 0, stuckThreads: 0 },
        { stage: 'Pending payment', threads: 0, totalBase: 0, stuckThreads: 0 },
        { stage: 'Paid', threads: 0, totalBase: 0, stuckThreads: 0 },
      ],
      stuckThreads: [
        { id: 'opp-1', stage: 'Opportunity', stuckReason: 'Next action overdue' },
        { id: 'quote-1', stage: 'Pending PO', stuckReason: 'PO overdue' },
      ],
    };
    const motion = summariseMoneyInMotion(flow);
    assert.deepEqual(motion.lanes.map((lane) => lane.stage), ['Quoted', 'Pending PO', 'Pending delivery', 'Pending payment', 'Paid']);
    assert.equal(motion.maxBase, 5_000, 'the deal lane does not set the scale');
    assert.equal(motion.worstStuck.id, 'quote-1');
    assert.equal(motion.hasAny, true);
  });
});
