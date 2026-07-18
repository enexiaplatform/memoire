import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_FORMAT_VERSION,
  buildRestorePlan,
  parseBackupFile,
  summarizeBackup,
} from '../../src/utils/workspaceBackup.ts';

const validBackup = {
  exportedAt: '2026-07-18T09:00:00.000Z',
  formatVersion: 1,
  mode: 'local-only',
  localBrowserData: {
    'memoire.salesActivities.v1': [
      { id: 'a1', accountName: 'Apex' },
      { id: 'a2', accountName: 'Northstar', isSample: true },
    ],
    'memoire.opportunities.v1': [{ id: 'o1', accountName: 'Apex' }],
    'memoire.settings.v1': { reportingCurrency: 'SGD' },
    'unrelated.key': [{ id: 'x' }],
  },
};

test('a valid export parses and summarizes', () => {
  const result = parseBackupFile(JSON.stringify(validBackup));
  assert.equal(result.ok, true);
  assert.equal(result.summary.totalKeys, 3, 'only memoire.* keys count');
  assert.equal(result.summary.totalRecords, 3);
  assert.equal(result.summary.totalSampleRecords, 1);
});

test('non-Memoire files are refused with a reason, not best-effort parsed', () => {
  assert.equal(parseBackupFile('not json at all').reason, 'not-json');
  assert.equal(parseBackupFile('[1,2,3]').reason, 'not-an-object');
  assert.equal(parseBackupFile('{"hello":"world"}').reason, 'not-a-memoire-backup');
});

test('an export with no workspace section is refused', () => {
  const empty = { exportedAt: '2026-07-18T09:00:00.000Z', localBrowserData: { 'other.app': [] } };
  assert.equal(parseBackupFile(JSON.stringify(empty)).reason, 'no-workspace-data');
});

test('a backup from a newer Memoire is refused rather than half-understood', () => {
  const future = { ...validBackup, formatVersion: BACKUP_FORMAT_VERSION + 1 };
  const result = parseBackupFile(JSON.stringify(future));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsupported-version');
});

test('a backup with no formatVersion is treated as version 1, not rejected', () => {
  const legacy = { ...validBackup };
  delete legacy.formatVersion;
  const result = parseBackupFile(JSON.stringify(legacy));
  assert.equal(result.ok, true);
  assert.equal(result.summary.formatVersion, 1);
});

test('demo records never ride a restore into a live workspace', () => {
  const plan = buildRestorePlan(validBackup);
  assert.equal(plan.droppedSampleRecords, 1);
  assert.equal(plan.restoredRecords, 2);

  const activities = JSON.parse(plan.writes.find((write) => write.key === 'memoire.salesActivities.v1').value);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].id, 'a1');
});

test('source-tagged demo records are dropped too, not only isSample', () => {
  const plan = buildRestorePlan({
    exportedAt: '2026-07-18T09:00:00.000Z',
    localBrowserData: { 'memoire.quotes.v1': [{ id: 'q1' }, { id: 'q2', source: 'demo' }] },
  });
  assert.equal(plan.droppedSampleRecords, 1);
  assert.equal(JSON.parse(plan.writes[0].value).length, 1);
});

test('the restore plan never writes outside the memoire namespace', () => {
  const plan = buildRestorePlan(validBackup);
  assert.ok(plan.writes.every((write) => write.key.startsWith('memoire.')));
  assert.ok(!plan.writes.some((write) => write.key === 'unrelated.key'));
});

test('non-array stores are restored whole', () => {
  const plan = buildRestorePlan(validBackup);
  const settings = plan.writes.find((write) => write.key === 'memoire.settings.v1');
  assert.deepEqual(JSON.parse(settings.value), { reportingCurrency: 'SGD' });
});

test('summary counts records per store for the preview', () => {
  const summary = summarizeBackup(validBackup);
  const activities = summary.entries.find((entry) => entry.key === 'memoire.salesActivities.v1');
  assert.equal(activities.recordCount, 2);
  assert.equal(activities.sampleCount, 1);

  const settings = summary.entries.find((entry) => entry.key === 'memoire.settings.v1');
  assert.equal(settings.recordCount, null, 'a non-collection has no record count to claim');
});
