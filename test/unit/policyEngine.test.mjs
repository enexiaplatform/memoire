import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCommercialPolicies,
  policyThresholds,
  reasonCodes,
} from '../../src/domain/commercialKernel/policyEngine.ts';

const TODAY = new Date('2026-07-26T00:00:00Z');

const thread = (patch = {}) => ({
  id: 'thread-1', userId: null, accountId: '', accountName: 'Northstar Foods', opportunityId: 'opp-1',
  title: 'QC analyser rollout', objective: '', status: 'active', currentMoneyState: 'none',
  currentWaitingParty: 'none', lastActivityAt: '2026-07-25T00:00:00.000Z', archivedAt: null,
  sourceType: 'system_rule', createdAt: '', updatedAt: '',
  derived: true, lastEventSummary: '', nextCommitment: null, openCommitmentCount: 1,
  daysSinceActivity: 1, ...patch,
});

const commitment = (patch = {}) => ({
  id: 'c-1', threadId: 'thread-1', accountId: '', accountName: 'Northstar Foods', opportunityId: 'opp-1',
  commitmentParty: 'customer', ownerLabel: 'Mai at Northstar', commitmentText: 'Confirm the validation quantity',
  originalDueDate: '2026-07-22', currentDueDate: '2026-07-22', silenceThresholdDays: 3, status: 'open',
  impactType: 'none', dueDateHistory: [], sourceType: 'manual', createdAt: '', updatedAt: '', ...patch,
});

const opportunity = (patch = {}) => ({
  id: 'opp-1', accountName: 'Northstar Foods', opportunityName: 'QC analyser rollout', stage: 'Proposal',
  status: 'Active', evidence: 'Lab signed off on the trial', nextAction: 'Send revised quote',
  nextActionDate: '2026-07-30', ...patch,
});

const quote = (patch = {}) => ({
  id: 'q-1', quoteId: 'Q-118', accountName: 'Northstar Foods', opportunityId: 'opp-1',
  status: 'Sent', validUntil: '2026-08-20', ...patch,
});

const run = (patch = {}) => evaluateCommercialPolicies({
  threads: [], commitments: [], opportunities: [], quotes: [], today: TODAY, ...patch,
});

const codes = (results) => results.map((item) => item.reasonCode);

describe('policy engine contract', () => {
  test('an empty workspace produces no recommendations', () => {
    assert.deepEqual(run(), []);
  });

  test('every recommendation carries its evidence and the threshold it was judged against', () => {
    const results = run({ commitments: [commitment()] });
    assert.ok(results.length > 0);

    for (const item of results) {
      assert.ok(reasonCodes.includes(item.reasonCode), `unknown reason code: ${item.reasonCode}`);
      assert.ok(item.reasonText.length > 10, 'a recommendation must explain itself in words');
      assert.ok(Array.isArray(item.sourceRecordIds) && item.sourceRecordIds.length > 0,
        'a recommendation must name the record that produced it');
      assert.equal(typeof item.threshold, 'number');
      assert.ok(['critical', 'high', 'medium', 'low'].includes(item.severity));
      assert.ok(item.recommendedAction.length > 0);
      assert.ok(item.calculatedAt);
      assert.ok(item.href.startsWith('/app/'), 'a recommendation must be actionable somewhere');
    }
  });

  test('the rules are pure: the same input twice gives the same answer', () => {
    const input = { commitments: [commitment()], threads: [thread()], today: TODAY };
    assert.deepEqual(run(input), run(input));
  });
});

describe('commitment rules', () => {
  test('an overdue customer commitment names who promised what, and by when', () => {
    const [overdue] = run({ commitments: [commitment()] })
      .filter((item) => item.reasonCode === 'CUSTOMER_COMMITMENT_OVERDUE');

    assert.ok(overdue, 'a customer promise past its date must be raised');
    assert.match(overdue.reasonText, /Mai at Northstar committed to/);
    assert.match(overdue.reasonText, /22 July/);
    assert.match(overdue.reasonText, /4 days overdue/);
    assert.equal(overdue.recommendedAction, 'Send a confirmation follow-up.');
    assert.equal(overdue.severity, 'critical', `4 days is past the ${policyThresholds.overdueCriticalDays}-day line`);
  });

  test('my own overdue promise reads as mine, not the customer\'s', () => {
    const [mine] = run({ commitments: [commitment({ commitmentParty: 'self', ownerLabel: 'You' })] })
      .filter((item) => item.reasonCode === 'SELF_COMMITMENT_OVERDUE');
    assert.match(mine.reasonText, /^You committed to/);
  });

  test('one day overdue is high, not yet critical', () => {
    const [item] = run({ commitments: [commitment({ currentDueDate: '2026-07-25' })] })
      .filter((entry) => entry.reasonCode === 'CUSTOMER_COMMITMENT_OVERDUE');
    assert.equal(item.severity, 'high');
  });

  test('a commitment that is not yet due raises nothing', () => {
    const results = run({ commitments: [commitment({ currentDueDate: '2026-08-10' })] });
    assert.equal(codes(results).includes('CUSTOMER_COMMITMENT_OVERDUE'), false);
  });

  test('completed and cancelled commitments are never chased', () => {
    for (const status of ['completed', 'cancelled']) {
      assert.deepEqual(run({ commitments: [commitment({ status })] }), []);
    }
  });

  test('a promise moved twice is flagged as a pattern, with the original date', () => {
    const [pattern] = run({
      commitments: [commitment({
        currentDueDate: '2026-08-10',
        dueDateHistory: [
          { from: '2026-07-22', to: '2026-08-01', changedAt: '' },
          { from: '2026-08-01', to: '2026-08-10', changedAt: '' },
        ],
      })],
    }).filter((item) => item.reasonCode === 'COMMITMENT_REPEATEDLY_RESCHEDULED');

    assert.ok(pattern);
    assert.match(pattern.reasonText, /moved 2 times since it was first promised for 22 July/);
    assert.equal(pattern.threshold, policyThresholds.rescheduleLimit);
  });

  test('an undated commitment says why that matters', () => {
    const [undated] = run({ commitments: [commitment({ currentDueDate: '', originalDueDate: '' })] })
      .filter((item) => item.reasonCode === 'COMMITMENT_WITHOUT_DUE_DATE');
    assert.match(undated.reasonText, /nothing can ever tell you it is late/);
  });

  test('an unowned commitment is raised, quietly', () => {
    const [unowned] = run({ commitments: [commitment({ ownerLabel: '  ', currentDueDate: '2026-08-10' })] })
      .filter((item) => item.reasonCode === 'COMMITMENT_WITHOUT_OWNER');
    assert.equal(unowned.severity, 'low');
  });

  test('sample commitments never generate recommendations in a real workspace', () => {
    assert.deepEqual(run({ commitments: [commitment({ isSample: true })] }), []);
  });

  test('but in the demo, where sample data IS the workspace, they do', () => {
    // Suppressing samples everywhere left the demo saying "nothing is going
    // silent" over a pipeline full of overdue payments - the showcase
    // demonstrating the opposite of the product's promise.
    const demo = run({
      commitments: [commitment({ isSample: true })],
      opportunities: [opportunity({ isSample: true, evidence: '' })],
      quotes: [quote({ isSample: true, validUntil: '2026-07-27' })],
      includeSampleRecords: true,
    });
    assert.ok(demo.length >= 3, 'the demo must show its own risks');
    assert.ok(codes(demo).includes('CUSTOMER_COMMITMENT_OVERDUE'));
    assert.ok(codes(demo).includes('OPPORTUNITY_WITHOUT_STAGE_EVIDENCE'));
    assert.ok(codes(demo).includes('QUOTE_EXPIRING'));
  });
});

describe('thread rules', () => {
  test('a quiet thread is raised once it passes the silence threshold', () => {
    const quiet = run({ threads: [thread({ daysSinceActivity: policyThresholds.threadSilenceDays })] })
      .filter((item) => item.reasonCode === 'THREAD_SILENT');
    assert.equal(quiet.length, 1);
    assert.match(quiet[0].reasonText, /past the 10 days silence threshold/);
    assert.equal(quiet[0].threshold, policyThresholds.threadSilenceDays);

    const fresh = run({ threads: [thread({ daysSinceActivity: policyThresholds.threadSilenceDays - 1 })] });
    assert.equal(codes(fresh).includes('THREAD_SILENT'), false);
  });

  test('a thread waiting on the customer is chased sooner', () => {
    const waiting = run({
      threads: [thread({ currentWaitingParty: 'customer', status: 'waiting', daysSinceActivity: 6 })],
    }).filter((item) => item.reasonCode === 'THREAD_SILENT');

    assert.equal(waiting.length, 1, 'the customer clock is shorter than the general one');
    assert.equal(waiting[0].threshold, policyThresholds.waitingThreadSilenceDays);
    assert.match(waiting[0].reasonText, /waiting on Northstar Foods for 6 days/);
  });

  test('a thread with no open commitment is raised', () => {
    const [noNext] = run({ threads: [thread({ openCommitmentCount: 0 })] })
      .filter((item) => item.reasonCode === 'THREAD_WITHOUT_NEXT_COMMITMENT');
    assert.match(noNext.reasonText, /nothing is scheduled to move it/);
  });

  test('closed threads are left alone', () => {
    for (const status of ['won', 'lost', 'completed', 'archived']) {
      const results = run({ threads: [thread({ status, daysSinceActivity: 90, openCommitmentCount: 0 })] });
      assert.deepEqual(results, [], `a ${status} thread should not be chased`);
    }
  });

  test('money that has stopped moving is a separate, higher signal', () => {
    const [stuck] = run({
      threads: [thread({
        currentMoneyState: 'awaiting_payment',
        daysSinceActivity: policyThresholds.moneyCheckpointStuckDays,
      })],
    }).filter((item) => item.reasonCode === 'MONEY_CHECKPOINT_STUCK');

    assert.ok(stuck);
    assert.equal(stuck.severity, 'high');
    assert.match(stuck.reasonText, /sat at "awaiting payment" for 14 days/);
    assert.equal(stuck.href, '/app/revenue');
  });

  test('a paid thread is not stuck', () => {
    const results = run({ threads: [thread({ currentMoneyState: 'paid', daysSinceActivity: 60 })] });
    assert.equal(codes(results).includes('MONEY_CHECKPOINT_STUCK'), false);
  });
});

describe('opportunity and quote rules', () => {
  test('an opportunity with no stage evidence is raised', () => {
    const [item] = run({ opportunities: [opportunity({ evidence: '' })] })
      .filter((entry) => entry.reasonCode === 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE');
    assert.match(item.reasonText, /nothing recorded that supports that stage/);
  });

  test('a next action in the past counts as no future action, and says so', () => {
    const [item] = run({ opportunities: [opportunity({ nextActionDate: '2026-07-01' })] })
      .filter((entry) => entry.reasonCode === 'OPPORTUNITY_WITHOUT_FUTURE_ACTION');
    assert.match(item.reasonText, /dated 1 July and has passed/);
  });

  test('a healthy opportunity raises nothing', () => {
    assert.deepEqual(run({ opportunities: [opportunity()] }), []);
  });

  test('won and lost opportunities are not audited', () => {
    assert.deepEqual(run({ opportunities: [opportunity({ status: 'Won', evidence: '', nextAction: '' })] }), []);
  });

  test('a quote nearing expiry is raised, and an expired one harder', () => {
    const soon = run({ quotes: [quote({ validUntil: '2026-07-30' })] })
      .filter((item) => item.reasonCode === 'QUOTE_EXPIRING');
    assert.equal(soon.length, 1);
    assert.match(soon[0].reasonText, /valid for 4 more days/);
    assert.equal(soon[0].severity, 'medium');

    const expired = run({ quotes: [quote({ validUntil: '2026-07-20' })] })
      .filter((item) => item.reasonCode === 'QUOTE_EXPIRING');
    assert.match(expired[0].reasonText, /expired 6 days ago/);
    assert.equal(expired[0].severity, 'high');
  });

  test('draft and accepted quotes are not chased for expiry', () => {
    for (const status of ['Draft', 'Accepted', 'Rejected', 'Expired']) {
      assert.deepEqual(run({ quotes: [quote({ status, validUntil: '2026-07-27' })] }), []);
    }
  });
});

describe('ordering and configurability', () => {
  test('the most severe recommendation comes first', () => {
    const results = run({
      commitments: [commitment()],
      threads: [thread({ openCommitmentCount: 0 })],
      quotes: [quote({ validUntil: '2026-07-20' })],
    });
    assert.equal(results[0].severity, 'critical');
    const order = results.map((item) => item.severity);
    assert.deepEqual([...order].sort((a, b) =>
      ['critical', 'high', 'medium', 'low'].indexOf(a) - ['critical', 'high', 'medium', 'low'].indexOf(b)), order);
  });

  test('thresholds can be overridden, which is what per-account personalisation will use', () => {
    const strict = run({
      threads: [thread({ daysSinceActivity: 4 })],
      thresholds: { threadSilenceDays: 3 },
    }).filter((item) => item.reasonCode === 'THREAD_SILENT');

    assert.equal(strict.length, 1);
    assert.equal(strict[0].threshold, 3, 'the shown threshold is the one actually applied');
  });
});
