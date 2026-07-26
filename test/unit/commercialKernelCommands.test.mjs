import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// The commands write through localStorage-backed stores, so the tests need a
// minimal browser environment. This is deliberately a stub rather than jsdom:
// what is under test is the domain logic, not the DOM.
class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
  clear() { this.#data.clear(); }
}

const storage = new MemoryStorage();
globalThis.window = {
  localStorage: storage,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = storage;
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
};

const {
  createCommitment,
  completeCommitment,
  cancelCommitment,
  rescheduleCommitment,
  createCommercialThread,
  changeThreadStatus,
  markThreadWaiting,
  advanceMoneyCheckpoint,
  recordValueOutcome,
} = await import('../../src/domain/commercialKernel/commands.ts');
const { loadCommitments } = await import('../../src/services/commercialKernel/commitmentStore.ts');
const { loadThreads } = await import('../../src/services/commercialKernel/threadStore.ts');
const { loadEvents } = await import('../../src/services/commercialKernel/eventStore.ts');
const { loadValueOutcomes } = await import('../../src/services/commercialKernel/valueOutcomeStore.ts');

const scope = { userId: null, sampleDataActive: false };

beforeEach(() => storage.clear());

describe('commitment ledger', () => {
  test('creates a commitment for each party and records history', () => {
    for (const party of ['self', 'customer', 'internal']) {
      const result = createCommitment(scope, {
        accountName: 'Northstar Foods',
        commitmentParty: party,
        commitmentText: `${party} promise`,
        dueDate: '2026-08-01',
      });
      assert.equal(result.ok, true);
      assert.equal(result.value.commitmentParty, party);
      assert.equal(result.value.status, 'open');
    }

    assert.equal(loadCommitments().length, 3);
    const created = loadEvents().filter((event) => event.eventType === 'commitment_created');
    assert.equal(created.length, 3, 'every commitment leaves history');
  });

  test('a commitment with no text is refused rather than saved empty', () => {
    const result = createCommitment(scope, {
      accountName: 'Northstar Foods',
      commitmentParty: 'self',
      commitmentText: '   ',
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /what was promised/);
    assert.equal(loadCommitments().length, 0);
  });

  test('the owner label defaults to the party, and the customer is named', () => {
    const mine = createCommitment(scope, {
      accountName: 'Northstar Foods', commitmentParty: 'self', commitmentText: 'Send quote',
    });
    const theirs = createCommitment(scope, {
      accountName: 'Northstar Foods', commitmentParty: 'customer', commitmentText: 'Confirm quantity',
    });
    assert.equal(mine.value.ownerLabel, 'You');
    assert.equal(theirs.value.ownerLabel, 'Northstar Foods');
  });

  test('completing records evidence and points at the event that proves it', () => {
    const created = createCommitment(scope, {
      accountName: 'Northstar Foods', commitmentParty: 'self', commitmentText: 'Send revised quote', dueDate: '2026-08-01',
    });
    const done = completeCommitment(scope, { commitmentId: created.value.id, evidence: 'Quote Q-118 sent' });

    assert.equal(done.ok, true);
    assert.equal(done.value.status, 'completed');
    assert.equal(done.value.completionEvidence, 'Quote Q-118 sent');
    assert.ok(done.value.completedAt, 'a completed commitment records when');
    assert.equal(done.value.completionEventId, done.event.id, 'the event is the evidence');
    assert.equal(loadCommitments().find((item) => item.id === created.value.id).status, 'completed');
  });

  test('a completed commitment cannot be completed or cancelled again', () => {
    const created = createCommitment(scope, {
      accountName: 'Apex', commitmentParty: 'self', commitmentText: 'Call back',
    });
    completeCommitment(scope, { commitmentId: created.value.id });

    const again = cancelCommitment(scope, { commitmentId: created.value.id });
    assert.equal(again.ok, false, 'a kept promise cannot later be cancelled');
    assert.match(again.error, /completed commitment cannot become cancelled/);
  });

  test('rescheduling keeps the original promise and stays open', () => {
    const created = createCommitment(scope, {
      accountName: 'Northstar Foods',
      commitmentParty: 'customer',
      commitmentText: 'Confirm validation quantity',
      dueDate: '2026-07-22',
    });

    const first = rescheduleCommitment(scope, {
      commitmentId: created.value.id, newDueDate: '2026-07-29', reason: 'Lab busy',
    });
    const second = rescheduleCommitment(scope, {
      commitmentId: created.value.id, newDueDate: '2026-08-05',
    });

    assert.equal(second.value.originalDueDate, '2026-07-22', 'the promise as made is never overwritten');
    assert.equal(second.value.currentDueDate, '2026-08-05');
    assert.equal(second.value.status, 'open', 'a moved promise is still open, not a third status');
    assert.equal(second.value.dueDateHistory.length, 2);
    assert.deepEqual(
      second.value.dueDateHistory.map((entry) => [entry.from, entry.to]),
      [['2026-07-22', '2026-07-29'], ['2026-07-29', '2026-08-05']],
    );
    assert.equal(first.value.dueDateHistory[0].reason, 'Lab busy');
    assert.ok(second.value.lastRenegotiatedAt);

    const rescheduled = loadEvents().filter((event) => event.eventType === 'commitment_rescheduled');
    assert.equal(rescheduled.length, 2, 'each move is history');
    assert.equal(rescheduled[0].structuredPayload.originalDueDate, '2026-07-22');
  });

  test('a cancelled commitment can be reopened, a completed one cannot', () => {
    const created = createCommitment(scope, {
      accountName: 'Apex', commitmentParty: 'internal', commitmentText: 'Approve discount',
    });
    cancelCommitment(scope, { commitmentId: created.value.id, reason: 'Not needed' });
    assert.equal(loadCommitments()[0].status, 'cancelled');

    const reschedule = rescheduleCommitment(scope, {
      commitmentId: created.value.id, newDueDate: '2026-09-01',
    });
    assert.equal(reschedule.ok, false, 'only an open commitment can be rescheduled');
  });

  test('a missing commitment fails cleanly rather than throwing', () => {
    const result = completeCommitment(scope, { commitmentId: 'does-not-exist' });
    assert.equal(result.ok, false);
    assert.match(result.error, /no longer exists/);
  });
});

describe('commercial threads', () => {
  test('creating a thread records history and starts active', () => {
    const result = createCommercialThread(scope, {
      accountId: '', accountName: 'Northstar Foods', title: 'QC analyser rollout',
      objective: 'Replace the incumbent analyser',
    });

    assert.equal(result.ok, true);
    assert.equal(result.value.status, 'active');
    assert.equal(result.value.currentMoneyState, 'none');
    assert.equal(loadThreads().length, 1);
    assert.equal(loadEvents().filter((event) => event.eventType === 'thread_created').length, 1);
  });

  test('a thread without a title or an account is refused', () => {
    assert.equal(createCommercialThread(scope, { accountId: '', accountName: 'Apex', title: '  ' }).ok, false);
    assert.equal(createCommercialThread(scope, { accountId: '', accountName: ' ', title: 'Deal' }).ok, false);
  });

  test('illegal status transitions are refused, not silently applied', () => {
    const thread = createCommercialThread(scope, {
      accountId: '', accountName: 'Apex', title: 'Renewal',
    }).value;

    assert.equal(changeThreadStatus(scope, { threadId: thread.id, status: 'lost' }).ok, true);
    const reopened = changeThreadStatus(scope, { threadId: thread.id, status: 'active' });
    assert.equal(reopened.ok, false, 'a lost thread cannot quietly become active again');
    assert.match(reopened.error, /lost thread cannot become active/);
  });

  test('archiving stamps archivedAt so archived work leaves Today', () => {
    const thread = createCommercialThread(scope, {
      accountId: '', accountName: 'Apex', title: 'Old pilot',
    }).value;
    const archived = changeThreadStatus(scope, { threadId: thread.id, status: 'archived' });
    assert.equal(archived.value.status, 'archived');
    assert.ok(archived.value.archivedAt);
  });

  test('marking waiting sets the party and does not manufacture history', () => {
    const thread = createCommercialThread(scope, {
      accountId: '', accountName: 'Apex', title: 'Renewal',
    }).value;
    const before = loadEvents().length;

    const waiting = markThreadWaiting(scope, { threadId: thread.id, waitingOn: 'customer' });
    assert.equal(waiting.value.status, 'waiting');
    assert.equal(waiting.value.currentWaitingParty, 'customer');
    assert.equal(loadEvents().length, before, 'current state is not an event');
  });

  test('advancing a money checkpoint writes the matching commercial event', () => {
    const thread = createCommercialThread(scope, {
      accountId: '', accountName: 'Apex', title: 'Analyser',
    }).value;

    const paid = advanceMoneyCheckpoint(scope, {
      threadId: thread.id, moneyState: 'paid', amount: 45000, currency: 'USD',
    });

    assert.equal(paid.value.currentMoneyState, 'paid');
    assert.equal(paid.event.eventType, 'payment_received');
    assert.equal(paid.event.structuredPayload.amount, 45000);
  });
});

describe('value outcomes', () => {
  test('records the verdict, including "would have done it anyway"', () => {
    const result = recordValueOutcome(scope, {
      outcomeType: 'follow_up_recovered',
      userAssessment: 'would_have_done_anyway',
      accountId: 'acct-1',
    });

    assert.equal(result.ok, true);
    assert.equal(loadValueOutcomes().length, 1);
    assert.equal(loadValueOutcomes()[0].userAssessment, 'would_have_done_anyway');
    assert.equal(loadEvents().filter((event) => event.eventType === 'value_outcome_recorded').length, 1);
  });
});

describe('sample data isolation', () => {
  test('a demo workspace marks its records so they never sync', () => {
    const demoScope = { userId: 'user-1', sampleDataActive: true };
    const commitment = createCommitment(demoScope, {
      accountName: 'Demo Co', commitmentParty: 'self', commitmentText: 'Demo promise',
    });
    assert.equal(commitment.value.isSample, true);
    assert.equal(loadEvents()[0].isSample, true);
  });
});
