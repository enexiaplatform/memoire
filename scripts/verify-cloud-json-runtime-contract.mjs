import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const failures = [];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function loadCloudJsonModule() {
  const source = readFileSync('src/services/cloudJsonCollectionStore.ts', 'utf8')
    .replace(/^import .+;\r?\n/gm, '');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dir = mkdtempSync(join(tmpdir(), 'memoire-cloud-json-contract-'));
  const file = join(dir, `cloud-json-${Date.now()}.mjs`);
  writeFileSync(file, transpiled.outputText, 'utf8');
  const mod = await import(`file:///${file.replaceAll('\\', '/')}`);
  return {
    mod,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function installWindowMock() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
    },
  };
  return store;
}

let cleanup = () => {};

try {
  const loaded = await loadCloudJsonModule();
  cleanup = loaded.cleanup;
  const { claimLocalCollectionForUser, mergeCloudJsonRecords } = loaded.mod;

  const cloud = [
    { id: 'cloud-only', updatedAt: '2026-06-17T10:00:00.000Z', title: 'Cloud only' },
    { id: 'same', updatedAt: '2026-06-17T10:00:00.000Z', title: 'Cloud older' },
    { id: 'cloud-newer', updatedAt: '2026-06-17T12:00:00.000Z', title: 'Cloud newer' },
  ];
  const local = [
    { id: 'same', updatedAt: '2026-06-17T11:00:00.000Z', title: 'Local newer' },
    { id: 'cloud-newer', updatedAt: '2026-06-17T09:00:00.000Z', title: 'Local older' },
    { id: 'demo-record', updatedAt: '2026-06-17T13:00:00.000Z', source: 'demo', title: 'Demo should not merge' },
    { id: 'sample-record', updatedAt: '2026-06-17T13:30:00.000Z', isSample: true, title: 'Sample should not merge' },
  ];

  const merged = mergeCloudJsonRecords(local, cloud);
  const mergedById = new Map(merged.map((record) => [record.id, record]));

  assert(merged.length === 3, 'merge should keep only user records after filtering demo/sample records');
  assert(mergedById.get('same')?.title === 'Local newer', 'newer local record should win over older cloud record');
  assert(mergedById.get('cloud-newer')?.title === 'Cloud newer', 'newer cloud record should win over older local record');
  assert(mergedById.has('cloud-only'), 'cloud-only record should be preserved');
  assert(!mergedById.has('demo-record'), 'demo records should be filtered from merge');
  assert(!mergedById.has('sample-record'), 'sample records should be filtered from merge');
  assert(merged[0]?.id === 'cloud-newer', 'merged records should sort newest first');

  const deletedNewer = mergeCloudJsonRecords(
    [{ id: 'deleted', updatedAt: '2026-06-17T12:00:00.000Z', __deleted: true }],
    [{ id: 'deleted', updatedAt: '2026-06-17T10:00:00.000Z', title: 'Cloud stale' }],
  );
  assert(deletedNewer.length === 0, 'newer tombstone should remove older cloud record');

  const deletedOlder = mergeCloudJsonRecords(
    [{ id: 'kept', updatedAt: '2026-06-17T10:00:00.000Z', __deleted: true }],
    [{ id: 'kept', updatedAt: '2026-06-17T12:00:00.000Z', title: 'Cloud newer than tombstone' }],
  );
  assert(deletedOlder.length === 1, 'older tombstone should not remove newer cloud record');
  assert(deletedOlder[0]?.title === 'Cloud newer than tombstone', 'newer cloud record should survive older tombstone');

  const createdAtFallback = mergeCloudJsonRecords(
    [{ id: 'created-only', createdAt: '2026-06-17T14:00:00.000Z', title: 'Local createdAt' }],
    [{ id: 'created-only', createdAt: '2026-06-17T13:00:00.000Z', title: 'Cloud createdAt' }],
  );
  assert(createdAtFallback[0]?.title === 'Local createdAt', 'merge should use createdAt when updatedAt is missing');

  const ownerStore = installWindowMock();
  assert(claimLocalCollectionForUser('review_packs', 'user-a') === true, 'unclaimed local review packs should be claimable');
  assert(ownerStore.get('memoire.cloud-owner.review_packs.v1') === 'user-a', 'claim should write review_packs owner marker');
  assert(claimLocalCollectionForUser('review_packs', 'user-a') === true, 'same owner should keep local collection claim');
  assert(claimLocalCollectionForUser('review_packs', 'user-b') === false, 'different owner should not claim stale local collection');
  assert(ownerStore.get('memoire.cloud-owner.review_packs.v1') === 'user-b', 'new owner marker should be recorded after stale claim attempt');
  assert(claimLocalCollectionForUser('sales_assets', 'user-b') === true, 'owner markers should be isolated by table');
  assert(ownerStore.get('memoire.cloud-owner.sales_assets.v1') === 'user-b', 'sales_assets owner marker should be table-specific');
} finally {
  cleanup();
  delete globalThis.window;
}

if (failures.length > 0) {
  console.error('Cloud JSON runtime contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Cloud JSON runtime contract verification passed.');
