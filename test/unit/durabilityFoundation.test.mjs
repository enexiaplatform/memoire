import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

class Storage {
  data = new Map();
  refuse = () => false;
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { if (this.refuse(k, v)) throw new DOMException('Full', 'QuotaExceededError'); this.data.set(k, String(v)); }
  removeItem(k) { this.data.delete(k); }
}
const storage = new Storage();
const requests = [];
let rejectedTable = '';
globalThis.window = { localStorage: storage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
globalThis.localStorage = storage;
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
globalThis.__durabilityCloud = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
  from(table) { return { async upsert(rows, options) {
    requests.push({ table, rows: Array.isArray(rows) ? rows : [rows], options });
    return { error: table === rejectedTable ? { message: 'Account write refused' } : null };
  } }; },
};
// Replace only the network boundary. All codecs, stores, commands and restore code are real.
registerHooks({ load(url, context, next) {
  if (url.endsWith('/lib/supabaseClient.ts')) return { format: 'module', shortCircuit: true,
    source: 'export const supabaseClient = globalThis.__durabilityCloud; export const isPipelineSupabaseConfigured = true;' };
  return next(url, context);
} });
const { kernelCodecs, canonicalContracts, archiveOnlyTables } = await import('../../src/services/canonicalDurability.ts');
const { buildRestorePlan, parseBackupFile } = await import('../../src/utils/workspaceBackup.ts');
const { restoreWorkspace, undoRestore } = await import('../../src/services/workspaceRestore.ts');
const { applyLocalRestore, recoverInterruptedRestore, RESTORE_JOURNAL_KEY } = await import('../../src/services/restoreJournal.ts');
const commands = await import('../../src/domain/commercialKernel/commands.ts');
const { appendEvent, loadEvents } = await import('../../src/services/commercialKernel/eventStore.ts');
const { writeLocal } = await import('../../src/services/commercialKernel/kernelRepository.ts');
const { projectCurrentEvidence } = await import('../../src/domain/commercialKernel/commercialEvidence.ts');
const at = '2026-08-12T10:30:00.000Z';
const later = '2026-09-10T12:30:00.000Z';
const base = { userId: 'owner', accountId: 'a', accountName: 'Acme', opportunityId: 'o', threadId: 't',
  sourceType: 'email', sourceId: 'mail-73', sourceUrl: 'https://example.com/mail/73', sourceUpdatedAt: at,
  createdAt: at, updatedAt: later, occurredAt: at, recordedAt: later };
const fixtures = [
  { ...base, id: 't', title: 'Renewal', objective: 'Keep business', status: 'active', currentMoneyState: 'quoted', currentWaitingParty: 'customer', lastActivityAt: at },
  { ...base, id: 'c', commitmentParty: 'customer', ownerLabel: 'Buyer', commitmentText: 'Send PO', originalDueDate: '2026-08-14', currentDueDate: '2026-08-20', status: 'open', impactType: 'none',
    dueDateHistory: [{ from: '2026-08-14', to: '2026-08-20', changedAt: later, reason: 'Buyer travel' }], sourceEventId: 'e', silenceThresholdDays: 3 },
  { ...base, id: 'e', eventType: 'commitment_created', commitmentId: 'c', summary: 'Buyer promised', structuredPayload: { evidence: 'mail-73' }, idempotencyKey: 'promise-73' },
  { ...base, id: 'ev', category: 'technical_outcome', direction: 'positive', evidenceText: 'Retest passed', summary: 'Passed', observedAt: '2026-08-11', sourceActivityId: 'activity-1' },
  { ...base, id: 'v', outcomeType: 'payment_recovered', userAssessment: 'protected_revenue_or_payment', recommendationId: 'rec-1', impactAmount: 3200, impactCurrency: 'USD', confidence: 0.75, note: 'Buyer paid' },
].map((fixture, i) => kernelCodecs[i].sanitize(fixture));
const backup = localBrowserData => ({ formatVersion: 3, exportedAt: later, localBrowserData });
const kernelBackup = () => backup(Object.fromEntries(kernelCodecs.map((codec, i) => [codec.storageKey, [fixtures[i]]])));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(async () => { await tick(); storage.data.clear(); storage.refuse = () => false; requests.length = 0; rejectedTable = ''; });

for (const [i, codec] of kernelCodecs.entries()) {
  test(`${codec.table}: actual cloud codec → backup → restore → actual codec preserves history and provenance`, async () => {
    const original = fixtures[i];
    const row = codec.toRow(original, 'owner');
    const file = { ...backup({}), cloudData: { user_id: 'owner', manifest: { complete: true }, data: { [codec.table]: [row] } } };
    const parsed = parseBackupFile(JSON.stringify(file));
    assert.equal(parsed.ok, true, parsed.message);
    const result = await restoreWorkspace(parsed.envelope, { userId: 'owner' });
    assert.equal(result.ok, true);
    const restored = codec.sanitize(JSON.parse(storage.getItem(codec.storageKey))[0]);
    assert.deepEqual(restored, original);
    assert.deepEqual(requests[0].rows[0], row);
    await restoreWorkspace(file, { userId: 'owner' });
    assert.equal(JSON.parse(storage.getItem(codec.storageKey)).length, 1, 'retry preserves identity');
  });
}

test('local full kernel round-trip preserves both evidence observations and all linkages', async () => {
  const file = kernelBackup();
  file.localBrowserData[kernelCodecs[3].storageKey].push({ ...fixtures[3], id: 'ev-old', direction: 'negative', observedAt: '2026-08-01' });
  const result = await restoreWorkspace(file);
  assert.equal(result.restoredRecords, 6);
  for (const [key, records] of Object.entries(file.localBrowserData)) assert.deepEqual(JSON.parse(storage.getItem(key)), records);
});

test('preflight rejects malformed identity, enum, timestamp, history and future versions without mutation', async () => {
  storage.setItem('memoire.accounts.v1', '[{"id":"original"}]');
  const before = [...storage.data];
  for (const patch of [{ id: '' }, { sourceType: 'unknown' }, { createdAt: 'not-a-date' }, { observedAt: '2026-02-30' }]) {
    const file = backup({ [kernelCodecs[3].storageKey]: [{ ...fixtures[3], ...patch }] });
    assert.equal(parseBackupFile(JSON.stringify(file)).ok, false);
    await assert.rejects(restoreWorkspace(file));
    assert.deepEqual([...storage.data], before);
  }
  for (const version of [0, -1, 1.5, '3', 999]) assert.equal(parseBackupFile(JSON.stringify({ ...kernelBackup(), formatVersion: version })).ok, false);
  const malformed = backup({ [kernelCodecs[1].storageKey]: [{ ...fixtures[1], dueDateHistory: [{ to: 'bad', changedAt: at }] }] });
  assert.equal(parseBackupFile(JSON.stringify(malformed)).ok, false);
});

test('invalid source enum in a cloud row is rejected before fromRow can default to manual', () => {
  const row = { ...kernelCodecs[3].toRow(fixtures[3], 'owner'), source_type: 'unknown' };
  assert.throws(() => buildRestorePlan({ ...backup({}), cloudData: { user_id: 'owner', data: { commercial_evidence: [row] } } }), /sourceType/);
});

test('legacy v1/v2 records with absent modern optional fields remain readable', () => {
  for (const version of [undefined, 1, 2]) {
    const parsed = parseBackupFile(JSON.stringify({ ...backup({ 'memoire.accounts.v1': [{ id: 'legacy', accountName: 'Old account' }] }), formatVersion: version }));
    assert.equal(parsed.ok, true);
  }
});

test('sample records and session/owner flags cannot cross restore into live data', async () => {
  const file = kernelBackup();
  for (const records of Object.values(file.localBrowserData)) records.push({ ...records[0], id: 'sample', isSample: true });
  file.localBrowserData['memoire.supabase.auth'] = 'foreign token';
  file.localBrowserData['memoire.sampleData.loaded'] = 'true';
  file.localBrowserData['memoire.local-workspace-owner.v1'] = 'foreign owner';
  storage.setItem('memoire.local-workspace-owner.v1', 'owner');
  const result = await restoreWorkspace(file, { userId: 'owner' });
  assert.equal(result.droppedSampleRecords, 5);
  assert.equal(storage.getItem('memoire.local-workspace-owner.v1'), 'owner');
  assert.equal(storage.getItem('memoire.supabase.auth'), null);
  assert.ok(requests.every(request => request.rows.every(row => row.id !== 'sample')));
});

test('third collection failure rolls back byte-for-byte; nothing reaches cloud', async () => {
  storage.setItem('memoire.accounts.v1', '[{"id":"original"}]');
  const before = [...storage.data];
  let writes = 0;
  storage.refuse = key => key !== RESTORE_JOURNAL_KEY && ++writes === 3;
  await assert.rejects(restoreWorkspace(kernelBackup(), { userId: 'owner' }), /previous workspace was restored/);
  assert.deepEqual([...storage.data], before);
  assert.equal(requests.length, 0);
});

test('refused journal leaves workspace untouched; persistent rollback failure retains rescue journal', () => {
  storage.setItem('memoire.accounts.v1', 'before');
  storage.refuse = key => key === RESTORE_JOURNAL_KEY;
  assert.throws(() => applyLocalRestore(storage, { 'memoire.accounts.v1': 'after' }));
  assert.equal(storage.getItem('memoire.accounts.v1'), 'before');
  storage.refuse = key => key !== RESTORE_JOURNAL_KEY;
  assert.throws(() => applyLocalRestore(storage, { 'memoire.accounts.v1': 'after' }), /Recovery data is retained/);
  assert.ok(storage.getItem(RESTORE_JOURNAL_KEY));
  storage.refuse = () => false;
  assert.equal(recoverInterruptedRestore(storage), true);
  assert.equal(storage.getItem('memoire.accounts.v1'), 'before');
});

test('partial cloud rejection is reported per collection; local recovery and retry keep IDs', async () => {
  rejectedTable = 'commercial_evidence';
  const first = await restoreWorkspace(kernelBackup(), { userId: 'owner' });
  assert.equal(first.ok, false);
  assert.equal(first.cloudFailedCount, 1);
  assert.equal(first.cloudPushedCount, 4);
  assert.deepEqual(JSON.parse(storage.getItem(kernelCodecs[3].storageKey))[0], fixtures[3]);
  rejectedTable = '';
  assert.equal((await restoreWorkspace(kernelBackup(), { userId: 'owner' })).ok, true);
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[3].storageKey)).length, 1);
});

test('undo is local-only and uses the rollback boundary', async () => {
  storage.setItem('memoire.accounts.v1', '[{"id":"old"}]');
  const result = await restoreWorkspace(kernelBackup(), { userId: 'owner' });
  const networkCount = requests.length;
  assert.equal(undoRestore(result.snapshot), true);
  assert.equal(storage.getItem('memoire.accounts.v1'), '[{"id":"old"}]');
  assert.equal(storage.getItem(kernelCodecs[0].storageKey), null);
  assert.equal(requests.length, networkCount);
});

test('state rejection emits no event; history rejection returns accepted-with-warning', async () => {
  storage.refuse = key => key === kernelCodecs[3].storageKey;
  const input = { accountName: 'Acme', category: 'technical_outcome', direction: 'positive', summary: 'Passed', evidenceText: 'Trial passed', observedAt: '2026-08-10' };
  const failed = commands.recordCommercialEvidence({}, input);
  assert.equal(failed.ok, false);
  assert.equal(storage.getItem(kernelCodecs[2].storageKey), null);
  storage.refuse = key => key === kernelCodecs[2].storageKey;
  const accepted = commands.recordCommercialEvidence({}, input);
  assert.equal(accepted.ok, true);
  assert.match(accepted.warning, /Do not repeat/);
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[3].storageKey)).length, 1);
  assert.equal(accepted.event, undefined);
});

test('value outcome rejection does not return a phantom record', () => {
  storage.refuse = key => key === kernelCodecs[4].storageKey;
  assert.equal(commands.recordValueOutcome({}, { outcomeType: 'payment_recovered', userAssessment: 'protected_revenue_or_payment' }).ok, false);
  assert.equal(storage.getItem(kernelCodecs[4].storageKey), null);
});

test('retry cannot build a replacement from a partially rolled-back workspace', async () => {
  storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify({ version: 1, before: { 'memoire.accounts.v1': '[{"id":"old"}]' } }));
  const before = [...storage.data];
  await assert.rejects(restoreWorkspace(kernelBackup()), /Reload to recover/);
  assert.equal(undoRestore({}), false);
  assert.deepEqual([...storage.data], before);
  assert.equal(recoverInterruptedRestore(storage), true);
  await restoreWorkspace(kernelBackup());
  assert.equal(storage.getItem('memoire.accounts.v1'), null, 'the recovered old collection is cleared by replacement');
});

test('evidence supersession is identical across backup ordering, including observation-date ties', async () => {
  const records = [
    { ...fixtures[3], id: 'old', observedAt: '2026-08-01' },
    { ...fixtures[3], id: 'middle', recordedAt: at },
    { ...fixtures[3], id: 'newest' },
  ];
  for (const order of [[0,1,2], [2,1,0], [1,2,0], [1,0,2]]) {
    await restoreWorkspace(backup({ [kernelCodecs[3].storageKey]: order.map(i => records[i]) }));
    const restored = JSON.parse(storage.getItem(kernelCodecs[3].storageKey));
    const projection = projectCurrentEvidence(restored);
    assert.equal(projection.supersededBy.get('old'), 'newest');
    assert.equal(projection.supersededBy.get('middle'), 'newest');
    assert.equal([...projection.currentByScope.values()][0][0].id, 'newest');
  }
});

test('currency, opening balance and raw preferences survive in the representation their readers expect', async () => {
  const { getReportingCurrency } = await import('../../src/utils/money.ts');
  const file = { ...backup({ memoire_reporting_currency: 'SGD', memoire_opening_cash_balance: 250000,
    'memoire.preference.v1': 'compact' }), localBrowserRawData: { 'memoire.preference.v1': 'compact' } };
  await restoreWorkspace(file);
  assert.equal(getReportingCurrency(), 'SGD');
  assert.equal(storage.getItem('memoire_opening_cash_balance'), '250000');
  assert.equal(storage.getItem('memoire.preference.v1'), 'compact');
});

for (const [i, codec] of kernelCodecs.entries()) {
  test(`${codec.table}: quota and unavailable storage reject authoritative writes`, () => {
    storage.refuse = () => true;
    assert.throws(() => writeLocal(codec, [fixtures[i]]));
    assert.equal(storage.getItem(codec.storageKey), null);
    const browser = globalThis.window;
    delete globalThis.window;
    try { assert.throws(() => writeLocal(codec, [fixtures[i]]), /no local storage/); }
    finally { globalThis.window = browser; }
  });
}

test('completion does not create an event before the commitment is persisted', () => {
  storage.setItem(kernelCodecs[1].storageKey, JSON.stringify([fixtures[1]]));
  storage.refuse = key => key === kernelCodecs[1].storageKey;
  assert.equal(commands.completeCommitment({}, { commitmentId: 'c', evidence: 'PO arrived' }).ok, false);
  assert.equal(loadEvents().length, 0);
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[1].storageKey))[0].status, 'open');
  storage.refuse = key => key === kernelCodecs[2].storageKey;
  const accepted = commands.completeCommitment({}, { commitmentId: 'c', evidence: 'PO arrived' });
  assert.equal(accepted.ok, true);
  assert.ok(accepted.warning);
  assert.equal(JSON.parse(storage.getItem(kernelCodecs[1].storageKey))[0].status, 'completed');
});

test('event idempotency returns the previously persisted identity', () => {
  const first = commands.recordCommercialEvent({}, { eventType: 'commitment_created', summary: 'Created', idempotencyKey: 'same' });
  const second = commands.recordCommercialEvent({}, { eventType: 'commitment_created', summary: 'Created', idempotencyKey: 'same' });
  assert.equal(first.id, second.id);
  assert.equal(loadEvents().length, 1);
});

test('target sample edits preserve the live period and rejected targets emit no history', () => {
  assert.equal(commands.setCommercialTarget({}, { period: 'Q1', fiscalYear: 2026, amount: 200 }).ok, true);
  assert.equal(commands.setCommercialTarget({ sampleDataActive: true }, { period: 'Q1', fiscalYear: 2026, amount: 100 }).ok, true);
  const targets = JSON.parse(storage.getItem('memoire.commercialTargets.v1'));
  assert.equal(targets.find(t => !t.isSample).amount, 200);
  assert.equal(targets.find(t => t.isSample).amount, 100);
  const before = loadEvents().length;
  storage.refuse = key => key === 'memoire.commercialTargets.v1';
  assert.equal(commands.setCommercialTarget({}, { period: 'Q1', fiscalYear: 2026, amount: 300 }).ok, false);
  assert.equal(loadEvents().length, before);
});

test('all JSON collections retain payloads, money/outcome links and tombstones through cloud recovery', async () => {
  for (const contract of canonicalContracts.filter(c => c.kind === 'json')) {
    const record = { id: `record-${contract.table}`, createdAt: at, updatedAt: later, source: 'user',
      accountId: 'a', opportunityId: 'o', quoteId: 'q', outcomeId: 'outcome-1', __deleted: true };
    const cloudRow = contract.encode(record, 'owner');
    const file = { ...backup({}), cloudData: { user_id: 'owner', data: { [contract.table]: [cloudRow] } } };
    assert.equal((await restoreWorkspace(file, { userId: 'owner' })).ok, true);
    assert.deepEqual(JSON.parse(storage.getItem(contract.key))[0], record);
    assert.deepEqual(requests.at(-1).rows[0].payload, record);
  }
});

test('account and activity actual row codecs retain imported metadata and explicit linkage', async () => {
  const rows = {
    accounts: [{ id: 'a', user_id: 'owner', account_name: 'Acme', account_code: 'ACC-001',
      source_system: 'erp', external_source_key: 'erp-73', territory: 'South', strategy: 'Renewal',
      key_stakeholders: ['Buyer'], tags: ['imported'], created_at: at, updated_at: later }],
    sales_activities: [{ id: 'activity-1', user_id: 'owner', activity_date: '2026-08-11', raw_note: 'Trial passed',
      activity_type: 'Meeting', account_name: 'Acme', tags: ['source:email'], link_status: 'Linked',
      linked_opportunity_id: 'o', linked_opportunity_name: 'Renewal', linked_account_name: 'Acme', created_at: at, updated_at: later }],
  };
  assert.equal((await restoreWorkspace({ ...backup({}), cloudData: { user_id: 'owner', data: rows } }, { userId: 'owner' })).ok, true);
  const account = JSON.parse(storage.getItem('memoire.accounts.v1'))[0];
  assert.equal(account.externalSourceKey, 'erp-73');
  assert.equal(account.createdAt, at);
  const activity = JSON.parse(storage.getItem('memoire.salesActivities.v1'))[0];
  assert.equal(activity.linkedOpportunityId, 'o');
  assert.equal(activity.activityDate, '2026-08-11');
  assert.equal(requests.find(r => r.table === 'accounts').rows[0].source_system, 'erp');
  assert.equal(requests.find(r => r.table === 'sales_activities').rows[0].linked_opportunity_id, 'o');
});

test('incomplete exports, duplicate identities, foreign ownership and demo-mode restore are refused', async () => {
  await assert.rejects(restoreWorkspace({ ...kernelBackup(), cloudData: { manifest: { complete: false }, data: {} } }));
  const duplicate = kernelBackup();
  duplicate.localBrowserData[kernelCodecs[0].storageKey].push(fixtures[0]);
  await assert.rejects(restoreWorkspace(duplicate), /duplicate/);
  await assert.rejects(restoreWorkspace({ ...backup({}), cloudData: { user_id: 'someone-else', data: { commercial_events: [kernelCodecs[2].toRow(fixtures[2], 'someone-else')] } } }, { userId: 'owner' }), /another account/);
  storage.setItem('memoire.sampleData.loaded', 'true');
  await assert.rejects(restoreWorkspace(kernelBackup()), /sample workspace/);
  assert.equal(requests.length, 0);
});

test('sample thread and target writes stay local', async () => {
  const thread = commands.createCommercialThread({ userId: 'owner', sampleDataActive: true }, { accountId: 'a', accountName: 'Acme', title: 'Sample', objective: '' });
  assert.equal(thread.ok, true);
  assert.equal(thread.value.isSample, true);
  assert.equal(commands.setCommercialTarget({ userId: 'owner', sampleDataActive: true }, { period: 'Q1', fiscalYear: 2026, amount: 100 }).ok, true);
  await tick();
  assert.equal(requests.length, 0);
});

test('accepted local event history is not truncated to the UI window', () => {
  const codec = kernelCodecs[2];
  const many = Array.from({ length: 2001 }, (_, i) => ({ ...fixtures[2], id: `e-${i}`, idempotencyKey: `key-${i}` }));
  storage.setItem(codec.storageKey, JSON.stringify(many));
  appendEvent({ ...fixtures[2], id: 'final', idempotencyKey: 'final' }, { syncCloud: false });
  assert.equal(loadEvents().length, 2002);
});

test('registry covers every exported dataset and all kernel/JSON table unions', () => {
  const api = readFileSync(new URL('../../api/export.ts', import.meta.url), 'utf8');
  const tables = [...api.matchAll(/\{ table: '([^']+)', ownerColumn:/g)].map(m => m[1]);
  const covered = [...canonicalContracts.map(c => c.table), ...archiveOnlyTables];
  assert.deepEqual([...new Set(covered)].sort(), [...new Set(tables)].sort());
  for (const path of ['commercialKernel/kernelRepository.ts', 'cloudJsonCollectionStore.ts']) {
    const source = readFileSync(new URL(`../../src/services/${path}`, import.meta.url), 'utf8');
    const union = source.match(/export type (?:KernelTable|CloudJsonCollectionTable) =\s*([\s\S]*?);/)[1];
    for (const match of union.matchAll(/'([a-z_]+)'/g)) assert.ok(canonicalContracts.some(c => c.table === match[1]), match[1]);
  }
});
