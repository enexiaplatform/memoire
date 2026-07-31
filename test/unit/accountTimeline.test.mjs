import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountTimeline } from '../../src/utils/accountTimeline.ts';

const activity = (patch = {}) => ({
  id: 'a1',
  accountName: 'MDL',
  linkedAccountName: 'MDL',
  linkStatus: 'Linked',
  activityType: 'Customer meeting',
  activityDate: '2026-06-10',
  summary: 'Walked the line audit scope',
  nextAction: '',
  createdAt: '2026-06-10T00:00:00.000Z',
  ...patch,
});

const opportunity = (patch = {}) => ({
  id: 'o1',
  accountName: 'MDL',
  opportunityName: 'Line audit',
  stage: 'Proposal',
  status: 'Active',
  productOrSolution: 'Audit service',
  nextAction: 'Send revised quote',
  createdAt: '2026-05-02T00:00:00.000Z',
  ...patch,
});

const quote = (patch = {}) => ({
  id: 'q1',
  quoteId: 'Q-001',
  accountName: 'MDL',
  title: 'Line audit quote',
  quoteDate: '2026-06-20',
  status: 'Sent',
  poStatus: 'Awaiting PO',
  deliveryStatus: 'Not started',
  paymentStatus: 'Unpaid',
  nextAction: '',
  ...patch,
});

const outcome = (patch = {}) => ({
  id: 'oc1',
  opportunityId: 'o1',
  accountName: 'MDL',
  opportunityName: 'Line audit',
  outcome: 'Won',
  outcomeDate: '2026-07-01',
  reasonCategory: 'Technical fit',
  reasonText: 'They needed the second line covered and nobody else could.',
  lessonLearned: 'Lead with the second line next time.',
  ...patch,
});

const memory = (patch = {}) => ({
  account: { id: 'acc1', accountName: 'MDL' },
  opportunities: [opportunity()],
  linkedActivities: [activity()],
  matchingActivities: [],
  openNextActions: [],
  objectionDebt: [],
  latestActivityDate: '2026-06-10',
  estimatedActiveValue: 0,
  activeOpportunityCount: 1,
  wonCount: 0,
  lostCount: 0,
  onHoldCount: 0,
  health: 'Healthy',
  riskSignals: [],
  ...patch,
});

describe('account timeline', () => {
  // The whole point: one order, not four boxes the reader merges by hand.
  test('puts deals, touches, quotes and outcomes on one thread, newest first', () => {
    const timeline = buildAccountTimeline({
      memory: memory(),
      quotes: [quote()],
      outcomes: [outcome()],
    });

    assert.deepEqual(timeline.entries.map((entry) => entry.kind), [
      'outcome', 'quote', 'activity', 'opportunity',
    ]);
    assert.equal(timeline.totalCount, 4);
    assert.equal(timeline.lastDate, '2026-07-01');
    assert.equal(timeline.firstDate, '2026-05-02');
  });

  test('every entry links back to the record it came from', () => {
    const timeline = buildAccountTimeline({ memory: memory(), quotes: [quote()], outcomes: [outcome()] });
    for (const entry of timeline.entries) {
      assert.match(entry.href, /^\/app\//, `${entry.kind} must link somewhere real`);
    }
  });

  // The reason a deal ended is the thing the rest of the history explains.
  test('a closed deal carries its reason into the history', () => {
    const timeline = buildAccountTimeline({ memory: memory(), quotes: [], outcomes: [outcome()] });
    const closed = timeline.entries.find((entry) => entry.kind === 'outcome');

    assert.match(closed.title, /Won/);
    assert.equal(closed.label, 'Technical fit');
    assert.match(closed.detail, /second line covered/);
    assert.match(closed.nextAction, /Lead with the second line/);
  });

  // An outcome belonging to another customer's deal must not surface here.
  test('ignores outcomes for deals this account does not own', () => {
    const timeline = buildAccountTimeline({
      memory: memory(),
      quotes: [],
      outcomes: [outcome({ id: 'oc2', opportunityId: 'other-deal' })],
    });

    assert.equal(timeline.entries.filter((entry) => entry.kind === 'outcome').length, 0);
  });

  test('a record with no usable date is left out rather than dated to today', () => {
    const timeline = buildAccountTimeline({
      memory: memory({ linkedActivities: [activity({ activityDate: '' })] }),
      quotes: [],
      outcomes: [],
    });

    assert.equal(timeline.entries.filter((entry) => entry.kind === 'activity').length, 0);
  });

  test('the limit caps what is rendered without hiding what exists', () => {
    const timeline = buildAccountTimeline({
      memory: memory({
        linkedActivities: Array.from({ length: 20 }, (_, index) => activity({
          id: `a${index}`, activityDate: `2026-06-${String((index % 28) + 1).padStart(2, '0')}`,
        })),
      }),
      quotes: [],
      outcomes: [],
      limit: 5,
    });

    assert.equal(timeline.entries.length, 5);
    assert.equal(timeline.totalCount, 21, 'the count still reports everything there is');
  });

  test('an account with nothing recorded returns an empty thread, not a crash', () => {
    const timeline = buildAccountTimeline({
      memory: memory({ opportunities: [], linkedActivities: [] }),
      quotes: [],
      outcomes: [],
    });

    assert.deepEqual(timeline.entries, []);
    assert.equal(timeline.totalCount, 0);
    assert.equal(timeline.firstDate, '');
  });
});
