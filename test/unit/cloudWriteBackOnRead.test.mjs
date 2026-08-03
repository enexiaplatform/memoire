import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { selectOwedCloudJsonRecords } = await import('../../src/services/cloudJsonCollectionStore.ts');
const { selectOwedCloudRecords } = await import('../../src/services/commercialKernel/kernelRepository.ts');

/**
 * Every merged read used to end by upserting the whole collection back, awaited,
 * before the caller got an answer. That is a second round trip on the read path
 * carrying every record the user owns - and the workspace is read on every
 * navigation, which is what made switching tabs feel slow.
 *
 * These tests hold the replacement to the only two things that matter: it sends
 * nothing when the cloud is already current, and it never drops a record the
 * cloud has not got.
 */
describe('what a merged read still owes the cloud', () => {
  it('sends nothing when the cloud already has every record', () => {
    const cloud = [
      { id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'b', updatedAt: '2026-08-02T00:00:00.000Z' },
    ];
    const merged = [...cloud];

    assert.deepEqual(selectOwedCloudJsonRecords(merged, cloud), []);
    assert.deepEqual(selectOwedCloudRecords(merged, cloud), []);
  });

  it('sends a record captured on this device that the cloud has never seen', () => {
    const cloud = [{ id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' }];
    const offlineCapture = { id: 'b', updatedAt: '2026-08-03T00:00:00.000Z' };
    const merged = [...cloud, offlineCapture];

    assert.deepEqual(selectOwedCloudJsonRecords(merged, cloud), [offlineCapture]);
    assert.deepEqual(selectOwedCloudRecords(merged, cloud), [offlineCapture]);
  });

  it('sends a local edit that beat an older cloud copy', () => {
    const cloud = [{ id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' }];
    const localWin = { id: 'a', updatedAt: '2026-08-03T00:00:00.000Z' };

    assert.deepEqual(selectOwedCloudJsonRecords([localWin], cloud), [localWin]);
    assert.deepEqual(selectOwedCloudRecords([localWin], cloud), [localWin]);
  });

  it('sends nothing back when the cloud copy is the one that won the merge', () => {
    // The merge already picked the cloud's newer copy. Writing it back would be
    // the round trip this change exists to remove.
    const cloudWin = { id: 'a', updatedAt: '2026-08-03T00:00:00.000Z' };

    assert.deepEqual(selectOwedCloudJsonRecords([cloudWin], [cloudWin]), []);
    assert.deepEqual(selectOwedCloudRecords([cloudWin], [cloudWin]), []);
  });

  it('falls back to createdAt when a record carries no updatedAt', () => {
    const cloud = [{ id: 'a', createdAt: '2026-08-01T00:00:00.000Z' }];
    const newer = { id: 'a', createdAt: '2026-08-02T00:00:00.000Z' };

    assert.deepEqual(selectOwedCloudJsonRecords(cloud, cloud), []);
    assert.deepEqual(selectOwedCloudJsonRecords([newer], cloud), [newer]);
  });

  it('never sends demo or sample records to the account', () => {
    const demo = { id: 'demo-1', updatedAt: '2026-08-03T00:00:00.000Z', source: 'demo' };
    const sample = { id: 'sample-1', updatedAt: '2026-08-03T00:00:00.000Z', isSample: true };

    assert.deepEqual(selectOwedCloudJsonRecords([demo, sample], []), []);
  });
});
