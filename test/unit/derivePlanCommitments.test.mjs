import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  derivePlanCommitments,
  isPlanDerivedCommitment,
  mergePlanCommitments,
} from '../../src/domain/commercialKernel/derivePlanCommitments.ts';
import { buildCaptureDerivedKey } from '../../src/utils/weeklyPlan.ts';

const activity = (patch = {}) => ({
  id: 'a1',
  activityDate: '2026-08-16',
  activityType: 'Customer meeting',
  summary: 'Called Aiko Tanaka',
  accountName: 'Meridian Logistics',
  nextAction: 'Send the revised quote',
  dueDate: '2026-08-21',
  tags: [],
  createdAt: '2026-08-16T02:00:00.000Z',
  updatedAt: '2026-08-16T02:00:00.000Z',
  ...patch,
});

const planItem = (patch = {}) => ({
  id: 'p1',
  date: '2026-08-18',
  label: 'Confirm the ship date',
  tag: 'customer',
  done: false,
  linkedAccountName: 'Meridian Logistics',
  createdAt: '2026-08-16T02:00:00.000Z',
  updatedAt: '2026-08-16T02:00:00.000Z',
  ...patch,
});

const recorded = (patch = {}) => ({
  id: 'c1',
  userId: null,
  threadId: '',
  accountId: '',
  accountName: 'Meridian Logistics',
  commitmentParty: 'self',
  ownerLabel: 'You',
  commitmentText: 'Send the revised quote',
  originalDueDate: '2026-08-21',
  currentDueDate: '2026-08-21',
  silenceThresholdDays: 3,
  status: 'open',
  impactType: 'none',
  dueDateHistory: [],
  createdAt: '2026-08-16T02:00:00.000Z',
  updatedAt: '2026-08-16T02:00:00.000Z',
  sourceType: 'manual',
  ...patch,
});

describe('derivePlanCommitments', () => {
  test('a capture with a dated next action is a promise, owed by you, on its day', () => {
    const [commitment] = derivePlanCommitments({ activities: [activity()] });
    assert.equal(commitment.commitmentText, 'Send the revised quote');
    assert.equal(commitment.currentDueDate, '2026-08-21');
    assert.equal(commitment.originalDueDate, '2026-08-21');
    assert.equal(commitment.commitmentParty, 'self');
    assert.equal(commitment.status, 'open');
    assert.equal(commitment.accountName, 'Meridian Logistics');
    assert.equal(isPlanDerivedCommitment(commitment), true, 'the panel needs to know not to offer a tick');
  });

  test('an undated next action is not a promise the product can watch', () => {
    assert.equal(derivePlanCommitments({ activities: [activity({ dueDate: '' })] }).length, 0);
  });

  test('a promise ticked off on the Plan is kept, not still open', () => {
    const derivedKey = buildCaptureDerivedKey('a1', '2026-08-21', 'main');
    const settled = derivePlanCommitments({
      activities: [activity()],
      planItems: [planItem({ id: 'stub', derivedKey, done: true })],
    });
    assert.equal(settled.length, 0, 'the Plan records completion as a stub carrying the derived key');
  });

  test('a hand-written plan item is a promise too, and nothing settled is', () => {
    assert.equal(derivePlanCommitments({ planItems: [planItem()] }).length, 1);
    assert.equal(derivePlanCommitments({ planItems: [planItem({ done: true })] }).length, 0);
    assert.equal(derivePlanCommitments({ planItems: [planItem({ dismissed: true })] }).length, 0);
    assert.equal(derivePlanCommitments({ planItems: [planItem({ __deleted: true })] }).length, 0);
    assert.equal(derivePlanCommitments({ planItems: [planItem({ date: '' })] }).length, 0);
  });

  test('sample and demo records never become promises in a real workspace', () => {
    const input = {
      activities: [activity({ id: 'a2', isSample: true }), activity({ id: 'a3', source: 'demo' })],
      planItems: [planItem({ id: 'p2', isSample: true })],
    };
    assert.equal(derivePlanCommitments(input).length, 0);
    assert.equal(
      derivePlanCommitments({ ...input, includeSampleRecords: true }).length,
      3,
      'inside the demo the sample data is the workspace',
    );
  });

  test('a promise keeps the deal it names, and stays unattached when it names none', () => {
    const [onDeal] = derivePlanCommitments({ activities: [activity({ linkedOpportunityId: 'o9' })] });
    assert.equal(onDeal.opportunityId, 'o9');

    const [onAccount] = derivePlanCommitments({ activities: [activity()] });
    assert.equal(onAccount.opportunityId, null);
    assert.equal(onAccount.threadId, '', 'an unattached promise is matched to its thread by customer name');
  });
});

describe('mergePlanCommitments', () => {
  test('the recorded ledger and the promises on the Plan are one list', () => {
    const merged = mergePlanCommitments([recorded({ id: 'c2', commitmentText: 'Chase the PO' })], {
      activities: [activity()],
      planItems: [planItem()],
    });
    // Recorded ledger first, then the Plan's promises oldest-first: the panel
    // renders them in the order it is handed, and the one that has been waiting
    // longest belongs at the top of its group.
    assert.deepEqual(
      merged.map((commitment) => commitment.commitmentText),
      ['Chase the PO', 'Confirm the ship date', 'Send the revised quote'],
    );
  });

  test('a promise written up by hand is not also shown as its capture', () => {
    const merged = mergePlanCommitments([recorded({ sourceId: 'a1' })], { activities: [activity()] });
    assert.equal(merged.length, 1, 'the same promise must not be counted twice');
    assert.equal(isPlanDerivedCommitment(merged[0]), false, 'the recorded one wins - it is the editable record');
  });
});

describe('one promise, once', () => {
  test('a hand-written plan item hides the capture promise it duplicates', async () => {
    const { derivePlanCommitments } = await import('../../src/domain/commercialKernel/derivePlanCommitments.ts');
    const derived = derivePlanCommitments({
      activities: [{
        id: 'a9', activityDate: '2026-08-16', activityType: 'Customer meeting', summary: 's',
        accountName: 'Bayside Freight', nextAction: 'Send the pilot proposal', dueDate: '2026-07-31',
        tags: [], createdAt: '2026-07-27T08:00:00.000Z', updatedAt: '2026-07-27T08:00:00.000Z',
      }],
      planItems: [{
        id: 'p9', date: '2026-07-31', label: 'Send the pilot proposal', tag: 'customer', done: false,
        linkedAccountName: 'Bayside Freight', createdAt: '2026-07-27T08:00:00.000Z', updatedAt: '2026-07-27T08:00:00.000Z',
      }],
    });
    assert.equal(derived.length, 1, 'the Plan board hides the duplicate; this panel must too');
    assert.equal(derived[0].sourceId, 'p9', 'the operator’s own wording is the one kept');
  });
});
