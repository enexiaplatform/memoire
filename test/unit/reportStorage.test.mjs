import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
class Storage {
  map = new Map(); fail = false;
  get length() { return this.map.size; } key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { if (this.fail && key === 'memoire.reportDefinitions.v1') throw new DOMException('Full', 'QuotaExceededError'); this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
const storage = new Storage(), writes = []; let cloud = [], reject = false, delay = null;
globalThis.window = { localStorage: storage, dispatchEvent() {} }; globalThis.localStorage = storage;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.__ReportCloud = { from(table) { return {
  select() { return this; }, eq() { return this; }, order() { return this; }, async range() { if (delay) await delay; return { data: cloud.map(payload => ({ id: payload.id, payload })), error: null }; },
  async upsert(rows) { writes.push({ table, rows }); return { error: reject ? { message: 'Report sync conflict' } : null }; },
}; } };
registerHooks({ load(url, context, next) {
  if (url.endsWith('/lib/supabaseClient.ts')) return { format: 'module', shortCircuit: true, source: 'export const supabaseClient=globalThis.__ReportCloud; export const isPipelineSupabaseConfigured=true;' };
  return next(url, context);
} });
const { reportTemplate } = await import('../../src/domain/reports/reportDefinition.ts');
const { saveReportDefinition, loadSavedReports, readSavedReports, REPORT_STORAGE_KEY } = await import('../../src/services/reportStore.ts');
const { buildRestorePlan } = await import('../../src/utils/workspaceBackup.ts');
const scope = { userId: 'owner', sampleDataActive: false }, definition = reportTemplate('portfolio');
const save = (name = 'Report', expectedVersion = 0, selectedScope = scope) => saveReportDefinition(selectedScope, { id: 'r', state: { definition: { ...definition, name }, archived: false }, expectedVersion });
beforeEach(() => { storage.map.clear(); storage.fail = false; cloud = []; reject = false; delay = null; writes.length = 0; storage.setItem('memoire.local-workspace-owner.v1', 'owner'); });
test('refused local writes never reach cloud; demo reports are separate and never synced', async () => {
  storage.fail = true; await assert.rejects(save(), /not saved/); assert.equal(writes.length, 0);
  storage.fail = false; await save(); await save('Sample', 0, { userId: null, sampleDataActive: true });
  assert.equal(writes.length, 1); assert.equal(readSavedReports(scope)[0].definition.name, 'Report');
  assert.equal(readSavedReports({ userId: null, sampleDataActive: true })[0].source, 'demo');
});
test('invalid or conflicting cloud definitions preserve the local copy and require reconciliation', async () => {
  await save(); const first = readSavedReports(scope)[0]; reject = true;
  const result = await save('Local rename', 1); assert.equal(result.cloud, 'unavailable'); assert.match(result.message, /conflict/);
  cloud = [{ ...first, version: 2, definition: { ...definition, name: 'Other device' }, history: result.records[0].history, updatedAt: result.records[0].updatedAt }];
  await assert.rejects(loadSavedReports(scope), /sync conflict/); assert.equal(readSavedReports(scope)[0].definition.name, 'Local rename');
  cloud = [{ ...first, definition: { ...definition, name: '' } }]; await assert.rejects(loadSavedReports(scope), /report name/);
  assert.equal(readSavedReports(scope)[0].version, 2);
});
test('owner change during an awaited load cannot replace the next account’s browser records', async () => {
  await save(); let release; delay = new Promise(resolve => { release = resolve; });
  const pending = loadSavedReports(scope); storage.setItem('memoire.local-workspace-owner.v1', 'other');
  storage.setItem(REPORT_STORAGE_KEY, '[]'); release();
  await assert.rejects(pending, /account changed/); assert.equal(storage.getItem(REPORT_STORAGE_KEY), '[]');
});
test('backup restores definition history, drops sample reports and refuses divergent copies', async () => {
  await save(); const original = readSavedReports(scope);
  await save('Renamed', 1); await save('Sample', 0, { userId: null, sampleDataActive: true });
  const records = JSON.parse(storage.getItem(REPORT_STORAGE_KEY));
  const backup = { formatVersion: 17, exportedAt: new Date().toISOString(), localBrowserData: { [REPORT_STORAGE_KEY]: records },
    cloudData: { user_id: 'owner', data: { report_definitions: original.map(payload => ({ id: payload.id, user_id: 'owner', payload })) } } };
  const plan = buildRestorePlan(backup), restored = JSON.parse(plan.writes.find(write => write.key === REPORT_STORAGE_KEY).value);
  assert.equal(restored.length, 1); assert.equal(restored[0].definition.name, 'Renamed'); assert.equal(restored[0].history[0].state.definition.name, 'Report');
  backup.cloudData.data.report_definitions[0].payload = { ...restored[0], definition: { ...definition, name: 'Conflict' } };
  assert.throws(() => buildRestorePlan(backup), /sync conflict/);
});
