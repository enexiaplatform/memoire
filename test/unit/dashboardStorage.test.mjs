import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
class Storage {
  map = new Map(); fail = false;
  get length() { return this.map.size; } key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { if (this.fail && key === 'memoire.dashboardDefinitions.v1') throw new DOMException('Full', 'QuotaExceededError'); this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
const storage = new Storage(), writes = []; let cloud = [], reject = false, delay = null;
globalThis.window = { localStorage: storage, dispatchEvent() {} }; globalThis.localStorage = storage;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.__DashboardCloud = { from(table) { return {
  select() { return this; }, eq() { return this; }, order() { return this; }, async range() { if (delay) await delay; return { data: cloud.map(payload => ({ id: payload.id, payload })), error: null }; },
  async upsert(rows) { writes.push({ table, rows }); return { error: reject ? { message: 'Dashboard sync conflict' } : null }; },
}; } };
registerHooks({ load(url, context, next) {
  if (url.endsWith('/lib/supabaseClient.ts')) return { format: 'module', shortCircuit: true, source: 'export const supabaseClient=globalThis.__DashboardCloud; export const isPipelineSupabaseConfigured=true;' };
  return next(url, context);
} });
const { newDashboard } = await import('../../src/domain/dashboards/dashboardDefinition.ts');
const { saveDashboardDefinition, loadSavedDashboards, readSavedDashboards, DASHBOARD_STORAGE_KEY } = await import('../../src/services/dashboardStore.ts');
const { buildRestorePlan } = await import('../../src/utils/workspaceBackup.ts');
const scope = { userId: 'owner', sampleDataActive: false }, definition = newDashboard();
const save = (name = 'Dashboard', expectedVersion = 0, selectedScope = scope) => saveDashboardDefinition(selectedScope, { id: 'r', state: { definition: { ...definition, name }, archived: false }, expectedVersion });
beforeEach(() => { storage.map.clear(); storage.fail = false; cloud = []; reject = false; delay = null; writes.length = 0; storage.setItem('memoire.local-workspace-owner.v1', 'owner'); });
test('refused local writes never reach cloud; demo dashboards are separate and never synced', async () => {
  storage.fail = true; await assert.rejects(save(), /not saved/); assert.equal(writes.length, 0);
  storage.fail = false; await save(); await save('Sample', 0, { userId: null, sampleDataActive: true });
  assert.equal(writes.length, 1); assert.equal(readSavedDashboards(scope)[0].definition.name, 'Dashboard');
  assert.equal(readSavedDashboards({ userId: null, sampleDataActive: true })[0].source, 'demo');
});
test('invalid or conflicting cloud definitions preserve the local copy and require reconciliation', async () => {
  await save(); const first = readSavedDashboards(scope)[0]; reject = true;
  const result = await save('Local rename', 1); assert.equal(result.cloud, 'unavailable'); assert.match(result.message, /conflict/);
  cloud = [{ ...first, version: 2, definition: { ...definition, name: 'Other device' }, history: result.records[0].history, updatedAt: result.records[0].updatedAt }];
  await assert.rejects(loadSavedDashboards(scope), /sync conflict/); assert.equal(readSavedDashboards(scope)[0].definition.name, 'Local rename');
  cloud = [{ ...first, definition: { ...definition, name: '' } }]; await assert.rejects(loadSavedDashboards(scope), /dashboard text/);
  assert.equal(readSavedDashboards(scope)[0].version, 2);
});
test('owner change during an awaited load cannot replace the next account’s browser records', async () => {
  await save(); let release; delay = new Promise(resolve => { release = resolve; });
  const pending = loadSavedDashboards(scope); storage.setItem('memoire.local-workspace-owner.v1', 'other');
  storage.setItem(DASHBOARD_STORAGE_KEY, '[]'); release();
  await assert.rejects(pending, /account changed/); assert.equal(storage.getItem(DASHBOARD_STORAGE_KEY), '[]');
});
test('backup restores definition history, drops sample dashboards and refuses divergent copies', async () => {
  await save(); const original = readSavedDashboards(scope);
  await save('Renamed', 1); await save('Sample', 0, { userId: null, sampleDataActive: true });
  const records = JSON.parse(storage.getItem(DASHBOARD_STORAGE_KEY));
  const backup = { formatVersion: 18, exportedAt: new Date().toISOString(), localBrowserData: { [DASHBOARD_STORAGE_KEY]: records },
    cloudData: { user_id: 'owner', data: { dashboard_definitions: original.map(payload => ({ id: payload.id, user_id: 'owner', payload })) } } };
  const plan = buildRestorePlan(backup), restored = JSON.parse(plan.writes.find(write => write.key === DASHBOARD_STORAGE_KEY).value);
  assert.equal(restored.length, 1); assert.equal(restored[0].definition.name, 'Renamed'); assert.equal(restored[0].history[0].state.definition.name, 'Dashboard');
  backup.cloudData.data.dashboard_definitions[0].payload = { ...restored[0], definition: { ...definition, name: 'Conflict' } };
  assert.throws(() => buildRestorePlan(backup), /sync conflict/);
});
