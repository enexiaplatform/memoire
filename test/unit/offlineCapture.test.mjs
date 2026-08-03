import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * A capture made where there is no signal.
 *
 * The record was always written to this device first, so the note itself was
 * never lost. What was lost was every trace of it: the cloud load returned the
 * server's answer alone, so the moment the connection came back the capture
 * disappeared from every surface while still sitting in localStorage with
 * nothing pointing at it. These tests are about that record staying visible,
 * staying owed, and arriving with the date it was actually made.
 */

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};

const {
  SALES_ACTIVITY_STORAGE_KEY,
  listPendingSalesActivities,
  loadSalesActivities,
  flushPendingSalesActivities,
  mergePendingIntoCloud,
} = await import('../../src/services/salesActivityStore.ts');

const record = (id, overrides = {}) => ({
  id,
  accountName: `Account ${id}`,
  opportunityName: '',
  contactName: '',
  stakeholderName: '',
  stakeholderRole: '',
  competitors: [],
  buyingSignals: [],
  risks: [],
  timelineSignals: [],
  nextActions: [],
  activityType: 'Meeting',
  summary: `Note ${id}`,
  nextAction: '',
  dueDate: '',
  tags: [],
  linkedOpportunityId: '',
  linkedOpportunityName: '',
  linkedAccountName: '',
  linkStatus: 'Unlinked',
  rawNote: `Note ${id}`,
  activityDate: '2026-08-01',
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
  storageMode: 'local',
  ...overrides,
});

const seed = (records) => {
  values.clear();
  values.set(SALES_ACTIVITY_STORAGE_KEY, JSON.stringify(records));
};

describe('offline capture: what is owed to the cloud', () => {
  beforeEach(() => values.clear());

  test('only the records marked pending are counted as waiting', () => {
    seed([record('pending', { pendingSync: true }), record('synced')]);

    const pending = listPendingSalesActivities();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, 'pending');
  });

  test('the flag survives being read back from storage', () => {
    seed([record('pending', { pendingSync: true })]);
    assert.equal(listPendingSalesActivities()[0].pendingSync, true);
  });

  test('with no account there is nothing to send it to, and nothing is dropped', async () => {
    seed([record('pending', { pendingSync: true })]);

    const result = await flushPendingSalesActivities(null);
    assert.deepEqual(result, { synced: 0, remaining: 1 });
    assert.equal(listPendingSalesActivities().length, 1, 'the capture stays on the device');
  });

  test('a flush with nothing waiting does no work', async () => {
    seed([record('synced')]);
    assert.deepEqual(await flushPendingSalesActivities('user-1'), { synced: 0, remaining: 0 });
  });
});

describe('offline capture: what the app shows while it waits', () => {
  beforeEach(() => values.clear());

  test('a signed-out workspace reads the device, pending records included', async () => {
    seed([record('pending', { pendingSync: true }), record('older')]);

    const activities = await loadSalesActivities(null);
    assert.equal(activities.length, 2);
    assert.ok(activities.some((activity) => activity.id === 'pending'));
  });

  test('a capture waiting to sync is never hidden by an empty local store', async () => {
    seed([]);
    assert.deepEqual(await loadSalesActivities(null), []);
  });

  test('a pending capture survives the cloud answer that does not contain it', () => {
    const cloud = [record('from-cloud', { storageMode: 'cloud', updatedAt: '2026-08-02T09:00:00.000Z' })];
    const pending = [record('offline', { pendingSync: true, updatedAt: '2026-08-03T09:00:00.000Z' })];

    const merged = mergePendingIntoCloud(cloud, pending);
    assert.deepEqual(merged.map((activity) => activity.id), ['offline', 'from-cloud']);
  });

  test('a capture that has since been accepted appears once, not twice', () => {
    const cloud = [record('same', { storageMode: 'cloud' }), record('other', { storageMode: 'cloud' })];
    const pending = [record('same', { pendingSync: true })];

    const merged = mergePendingIntoCloud(cloud, pending);
    assert.equal(merged.length, 2);
    assert.equal(merged.filter((activity) => activity.id === 'same').length, 1);
    assert.equal(merged.find((activity) => activity.id === 'same').pendingSync, true, 'the copy the operator typed wins');
  });

  test('with nothing waiting the cloud answer is passed through untouched', () => {
    const cloud = [record('a', { storageMode: 'cloud' })];
    assert.equal(mergePendingIntoCloud(cloud, []), cloud);
  });
});
