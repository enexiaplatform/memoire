import test from 'node:test';
import assert from 'node:assert/strict';
import { eventCodec } from '../../src/services/commercialKernel/eventStore.ts';
import { evidenceCodec } from '../../src/services/commercialKernel/evidenceStore.ts';
import { commitmentCodec } from '../../src/services/commercialKernel/commitmentStore.ts';
import { threadCodec } from '../../src/services/commercialKernel/threadStore.ts';
import { buildRestorePlan, parseBackupFile, BACKUP_FORMAT_VERSION } from '../../src/utils/workspaceBackup.ts';

// Existing records only. These exercise real codecs across both serialization
// boundaries; they do not claim that cloudData is consumed by workspace restore.
const owner = '00000000-0000-4000-8000-000000000001';
const recordedAt = '2026-09-15T08:30:00.000Z';
const source = {
  userId: owner,
  sourceType: 'capture',
  sourceId: 'activity-1',
  sourceUrl: 'https://example.test/source/1',
  sourceUpdatedAt: '2026-09-04T07:00:00.000Z',
  createdAt: recordedAt,
};
const fixtures = [
  [eventCodec, {
    ...source, id: 'event-1', eventType: 'opportunity_close_period_changed',
    occurredAt: '2026-09-04T07:00:00.000Z', recordedAt,
    accountId: 'account-1', opportunityId: 'opportunity-1', threadId: 'thread-1',
    commitmentId: null, summary: 'Close period moved',
    structuredPayload: { from: 'Q3 2026', to: 'Q4 2026', accountName: 'Example customer' },
    idempotencyKey: 'revision-1:expectedClosePeriod',
  }],
  [evidenceCodec, {
    ...source, id: 'evidence-1', accountId: 'account-1', accountName: 'Example customer',
    opportunityId: 'opportunity-1', threadId: 'thread-1', category: 'technical_outcome',
    direction: 'negative', summary: 'Trial failed', evidenceText: 'QA reported that the trial failed.',
    observedAt: '2026-09-04', recordedAt, sourceActivityId: 'activity-1', updatedAt: recordedAt,
  }],
  [commitmentCodec, {
    ...source, id: 'commitment-1', threadId: 'thread-1', accountId: 'account-1',
    accountName: 'Example customer', opportunityId: 'opportunity-1',
    commitmentParty: 'customer', ownerLabel: 'QA', commitmentText: 'Confirm retest result',
    originalDueDate: '2026-09-05', currentDueDate: '2026-09-12', silenceThresholdDays: 3,
    status: 'completed', impactType: 'revenue', impactAmount: 1200000000, impactCurrency: 'VND',
    sourceEventId: 'event-created', completionEvidence: 'QA confirmed in the meeting',
    completionEventId: 'event-completed',
    dueDateHistory: [{ from: '2026-09-05', to: '2026-09-12', changedAt: '2026-09-06T10:00:00.000Z', reason: 'Retest required' }],
    lastRenegotiatedAt: '2026-09-06T10:00:00.000Z', completedAt: '2026-09-12T09:00:00.000Z',
    cancelledAt: null, updatedAt: recordedAt,
  }],
  [threadCodec, {
    ...source, id: 'thread-1', accountId: 'account-1', accountName: 'Example customer',
    opportunityId: 'opportunity-1', title: 'Trial order', objective: 'Receive customer PO',
    status: 'waiting', currentMoneyState: 'awaiting_po', currentWaitingParty: 'customer',
    lastActivityAt: '2026-09-04T07:00:00.000Z', archivedAt: null, updatedAt: recordedAt,
  }],
];

for (const [codec, original] of fixtures) {
  test(`${codec.table}: provenance and history survive cloud row and browser backup round trips`, () => {
    const row = JSON.parse(JSON.stringify(codec.toRow(original, owner)));
    const fromCloud = codec.fromRow(row);
    // Compare to the original fixture, not to sanitize(original): otherwise a
    // sanitizer deleting a field could erase it from both sides of the test.
    assert.deepEqual(fromCloud, original);

    const parsed = parseBackupFile(JSON.stringify({
      exportedAt: recordedAt, formatVersion: BACKUP_FORMAT_VERSION,
      localBrowserData: { [codec.storageKey]: [fromCloud] },
    }));
    assert.equal(parsed.ok, true);
    const plan = buildRestorePlan(parsed.envelope);
    assert.equal(plan.writes.length, 1);
    assert.equal(plan.writes[0].key, codec.storageKey);
    const [restored] = JSON.parse(plan.writes[0].value);
    assert.deepEqual(codec.sanitize(restored), original);
  });
}

test('restoring backdated evidence preserves both clocks and excludes sample evidence', () => {
  const [codec, original] = fixtures[1];
  const plan = buildRestorePlan({
    exportedAt: recordedAt, formatVersion: BACKUP_FORMAT_VERSION,
    localBrowserData: { [codec.storageKey]: [original, { ...original, id: 'sample', isSample: true }] },
  });
  const [restored] = JSON.parse(plan.writes[0].value);
  assert.equal(restored.observedAt, '2026-09-04');
  assert.equal(restored.recordedAt, recordedAt);
  assert.equal(restored.direction, 'negative');
  assert.equal(plan.droppedSampleRecords, 1);
  assert.equal(plan.restoredRecords, 1);
});
