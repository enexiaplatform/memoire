import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) {
  if (url.endsWith('/lib/supabaseClient.ts')) return { format: 'module', shortCircuit: true, source: 'export const supabaseClient=null; export const isPipelineSupabaseConfigured=false;' };
  return next(url, context);
} });
class Storage {
  map = new Map(); fail = false;
  get length() { return this.map.size; } key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw new DOMException('Full', 'QuotaExceededError'); this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
const storage = new Storage();
globalThis.window = { localStorage: storage, dispatchEvent() {} };
globalThis.localStorage = storage;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
const { readPortfolio, savePortfolio, PORTFOLIO_STORAGE_KEY } = await import('../../src/services/portfolioStore.ts');
const { buildRestorePlan } = await import('../../src/utils/workspaceBackup.ts');
const state = { kind: 'brand', name: 'Brand', code: '', description: '', status: 'active', parentId: null, brandId: null, groupId: null, aliases: [] };
const scope = { userId: null, sampleDataActive: false };
beforeEach(() => { storage.map.clear(); storage.fail = false; });
test('a refused local write never reports a saved entry', async () => {
  storage.fail = true;
  await assert.rejects(savePortfolio(scope, { id: 'brand', state, expectedVersion: 0 }), /not saved|storage/i);
  assert.equal(storage.getItem(PORTFOLIO_STORAGE_KEY), null);
});
test('catalog is mode/owner-scoped and unknown formats cannot be overwritten', async () => {
  await savePortfolio(scope, { id: 'b', state, expectedVersion: 0 });
  await savePortfolio({ userId: null, sampleDataActive: true }, { id: 'demo-b', state, expectedVersion: 0 });
  assert.equal(readPortfolio(scope).length, 1);
  assert.equal(readPortfolio({ userId: null, sampleDataActive: true })[0].source, 'demo');
  storage.setItem('memoire.local-workspace-owner.v1', 'owner');
  assert.throws(() => readPortfolio({ userId: 'other', sampleDataActive: false }), /account changed/);
  const rows = JSON.parse(storage.getItem(PORTFOLIO_STORAGE_KEY)); rows[0].schemaVersion = 2;
  storage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(rows));
  await assert.rejects(savePortfolio({ userId: 'owner', sampleDataActive: false }, { id: 'new', state, expectedVersion: 0 }), /Unsupported/);
});
test('backup carries classification history, drops demo and rejects divergent local/cloud copies', async () => {
  await savePortfolio(scope, { id: 'b', state, expectedVersion: 0 });
  const original = readPortfolio(scope)[0];
  await savePortfolio(scope, { id: 'b', state: { ...state, name: 'Renamed' }, expectedVersion: 1 });
  await savePortfolio({ userId: null, sampleDataActive: true }, { id: 'demo', state, expectedVersion: 0 });
  const records = JSON.parse(storage.getItem(PORTFOLIO_STORAGE_KEY));
  const plan = buildRestorePlan({ formatVersion: 15, exportedAt: new Date().toISOString(), localBrowserData: { [PORTFOLIO_STORAGE_KEY]: records } });
  const restored = JSON.parse(plan.writes.find(write => write.key === PORTFOLIO_STORAGE_KEY).value);
  assert.equal(restored.length, 1); assert.equal(restored[0].history[0].state.name, 'Brand');
  const divergent = { ...restored[0], name: 'Other device' };
  assert.throws(() => buildRestorePlan({ formatVersion: 15, exportedAt: new Date().toISOString(), localBrowserData: { [PORTFOLIO_STORAGE_KEY]: restored }, cloudData: { user_id: 'owner', data: { portfolio_records: [{ user_id: 'owner', id: 'b', payload: divergent }] } } }), /conflict/);
  assert.equal(original.version, 1);
});

test('backup merges linked records only after assembling and validating the whole catalog', async () => {
  await savePortfolio(scope, { id: 'b', state, expectedVersion: 0 });
  const opportunity = { id: 'o', accountName: 'Acme', source: 'user', isSample: false };
  const assignment = { kind: 'assignment', opportunityId: 'o', businessUnitId: null, brandId: 'b', groupId: null, productId: null, originalBrand: 'Legacy', originalProduct: 'Bundle' };
  await savePortfolio(scope, { id: 'a', state: assignment, expectedVersion: 0, opportunity });
  const original = readPortfolio(scope);
  await savePortfolio(scope, { id: 'a', state: { ...assignment, originalProduct: 'Original bundle' }, expectedVersion: 1, opportunity });
  const latest = readPortfolio(scope);
  const backup = { formatVersion: 16, exportedAt: new Date().toISOString(),
    localBrowserData: { [PORTFOLIO_STORAGE_KEY]: latest, 'memoire.opportunities.v1': [opportunity] },
    cloudData: { user_id: 'owner', data: { portfolio_records: original.map(payload => ({ user_id: 'owner', id: payload.id, payload })) } } };
  const plan = buildRestorePlan(backup);
  const restored = JSON.parse(plan.writes.find(write => write.key === PORTFOLIO_STORAGE_KEY).value);
  assert.equal(restored.find(row => row.id === 'a').version, 2);
  const withoutSource = { ...backup, localBrowserData: { [PORTFOLIO_STORAGE_KEY]: latest } };
  assert.throws(() => buildRestorePlan(withoutSource), /source opportunity is missing/);
});

test('classification refuses absent, foreign and sample source opportunities', async () => {
  const assignment = { kind: 'assignment', opportunityId: 'o', businessUnitId: null, brandId: null, groupId: null, productId: null, originalBrand: '', originalProduct: '' };
  for (const opportunity of [undefined, { id: 'o', userId: 'foreign' }, { id: 'o', source: 'demo', isSample: true }]) {
    await assert.rejects(savePortfolio(scope, { id: 'a', state: assignment, expectedVersion: 0, opportunity }), /from this workspace/);
  }
  assert.equal(storage.getItem(PORTFOLIO_STORAGE_KEY), null);
});

test('native restore preserves the accepted same-version cloud payload including retained metadata', async () => {
  await savePortfolio(scope, { id: 'b', state, expectedVersion: 0 });
  const local = readPortfolio(scope)[0];
  const accepted = { ...local, userId: 'owner', importProvenance: { batch: 'synthetic-import' } };
  const backup = { formatVersion: 18, exportedAt: new Date().toISOString(),
    localBrowserData: { [PORTFOLIO_STORAGE_KEY]: [local] },
    cloudData: { user_id: 'owner', data: { portfolio_records: [{ user_id: 'owner', id: 'b', payload: accepted }] } } };
  const restored = JSON.parse(buildRestorePlan(backup).writes.find(write => write.key === PORTFOLIO_STORAGE_KEY).value);
  assert.deepEqual(restored, [accepted], 'same-version SQL guard must receive the original accepted payload');
  backup.localBrowserData[PORTFOLIO_STORAGE_KEY] = [{ ...local, name: 'Unversioned edit' }];
  assert.throws(() => buildRestorePlan(backup), /conflict/);
});

test('native restore preserves the raw proven descendant without borrowing older metadata', async () => {
  await savePortfolio(scope, { id: 'b', state, expectedVersion: 0 });
  const original = readPortfolio(scope)[0];
  await savePortfolio(scope, { id: 'b', state: { ...state, name: 'Renamed' }, expectedVersion: 1 });
  const descendant = { ...readPortfolio(scope)[0], userId: 'owner', importProvenance: { batch: 'newer-import' } };
  const backup = { formatVersion: 18, exportedAt: new Date().toISOString(),
    localBrowserData: { [PORTFOLIO_STORAGE_KEY]: [descendant] },
    cloudData: { user_id: 'owner', data: { portfolio_records: [{ user_id: 'owner', id: 'b', payload: original }] } } };
  const restored = JSON.parse(buildRestorePlan(backup).writes.find(write => write.key === PORTFOLIO_STORAGE_KEY).value);
  assert.deepEqual(restored, [descendant]);
  backup.localBrowserData[PORTFOLIO_STORAGE_KEY] = [{ ...descendant, history: [{ ...descendant.history[0], state: { ...state, name: 'Forged prior name' } }] }];
  assert.throws(() => buildRestorePlan(backup), /conflict/);
});
