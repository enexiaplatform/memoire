import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Substitute only the network client. All stores, codecs, commands, guards and
// event ordering execute their real source. No credentials or network access.
const rows = new Map();
const calls = [];
let rejectCloud = false;
const client = {
  auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  from(table) {
    calls.push(table);
    let payload; let inserting = false; let id;
    const query = {
      insert(value) { payload = value; inserting = true; return query; },
      update(value) { payload = value; return query; },
      select() { return query; },
      eq(key, value) { if (key === 'id') id = value; return query; },
      order() { return query; },
      async range() { return { data: [...rows.values()], error: null }; },
      async single() {
        if (rejectCloud) return { data: null, error: { message: 'Cloud refused write' } };
        if (inserting) id = `cloud-${rows.size + 1}`;
        const row = { ...rows.get(id), ...payload, id };
        rows.set(id, row);
        return { data: row, error: null };
      },
    };
    return query;
  },
};
globalThis.__leadIntegrityClient = client;
const hooks = registerHooks({
  load(url, context, next) {
    if (url.endsWith('/src/lib/supabaseClient.ts')) return {
      format: 'module', shortCircuit: true,
      source: 'export const supabaseClient = globalThis.__leadIntegrityClient; export const isPipelineSupabaseConfigured = true; export const pipelineSupabaseConfigMessage = "";',
    };
    return next(url, context);
  },
});
const data = new Map();
const refused = new Set();
const storage = {
  getItem: key => data.get(key) ?? null,
  setItem(key, value) {
    if (refused.has(key)) throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' });
    data.set(key, String(value));
  },
  removeItem: key => data.delete(key),
  key: i => [...data.keys()][i] ?? null,
  get length() { return data.size; },
};
globalThis.localStorage = storage;
globalThis.window = { localStorage: storage, dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const { createLead, qualifyLead } = await import('../../src/services/leadCommands.ts');
const { createOpportunity, emptyOpportunityInput, OPPORTUNITY_STORAGE_KEY } = await import('../../src/services/opportunityStore.ts');
const { loadEvents, EVENT_STORAGE_KEY } = await import('../../src/services/commercialKernel/eventStore.ts');
hooks.deregister();

beforeEach(() => { rows.clear(); calls.length = 0; data.clear(); refused.clear(); rejectCloud = false; });
const real = { source: 'user', isSample: false };

test('accepted cloud qualification remains successful when browser mirror is refused', async () => {
  const lead = (await createLead({ accountName: 'Customer' }, 'owner', real)).opportunity;
  refused.add(OPPORTUNITY_STORAGE_KEY);
  const result = await qualifyLead(lead, 'owner');
  assert.equal(result.mode, 'cloud');
  assert.match(result.warning, /browser copy/i);
  assert.equal(rows.get(lead.id).stage, 'Discovery');
  assert.equal(rows.size, 1);
  assert.equal(loadEvents().filter(e => e.eventType === 'opportunity_stage_changed').length, 1);
  await assert.rejects(() => qualifyLead(lead, 'owner'), /saved lead/);
  assert.equal(loadEvents().length, 1);
});

test('cloud and local refusal reject qualification without event or persisted mutation', async () => {
  const lead = (await createLead({ accountName: 'Customer' }, 'owner', real)).opportunity;
  rejectCloud = true;
  refused.add(OPPORTUNITY_STORAGE_KEY);
  await assert.rejects(() => qualifyLead(lead, 'owner'));
  assert.equal(rows.get(lead.id).stage, 'Lead');
  assert.equal(JSON.parse(data.get(OPPORTUNITY_STORAGE_KEY))[0].stage, 'Lead');
  assert.equal(loadEvents().length, 0);
});

test('cloud refusal retains the existing durable local fallback contract', async () => {
  const lead = (await createLead({ accountName: 'Customer' }, 'owner', real)).opportunity;
  rejectCloud = true;
  const result = await qualifyLead(lead, 'owner');
  assert.equal(result.mode, 'local');
  assert.match(result.warning, /Cloud sync issue/);
  assert.equal(JSON.parse(data.get(OPPORTUNITY_STORAGE_KEY))[0].stage, 'Discovery');
  assert.equal(rows.get(lead.id).stage, 'Lead', 'no claim that cloud accepted the change');
  assert.equal(loadEvents().length, 1);
});

test('cloud accepted but event storage refused returns history warning without rollback', async () => {
  const lead = (await createLead({ accountName: 'Customer' }, 'owner', real)).opportunity;
  refused.add(EVENT_STORAGE_KEY);
  const result = await qualifyLead(lead, 'owner');
  assert.equal(result.mode, 'cloud');
  assert.match(result.warning, /history/);
  assert.equal(rows.get(lead.id).stage, 'Discovery');
  assert.equal(loadEvents().length, 0);
  await assert.rejects(() => qualifyLead(lead, 'owner'));
  assert.equal(loadEvents().length, 0);
});

test('accepted cloud create with refused mirror does not fall back to a duplicate local lead', async () => {
  refused.add(OPPORTUNITY_STORAGE_KEY);
  const result = await createLead({ accountName: 'Customer' }, 'owner', real);
  assert.equal(result.mode, 'cloud');
  assert.match(result.warning, /browser copy/);
  assert.equal(rows.size, 1);
  assert.equal(result.opportunity.id, [...rows.keys()][0]);
});

test('sample Lead and shared Opportunity creation never call cloud even with an authenticated owner', async () => {
  const sample = { source: 'demo', isSample: true };
  const lead = await createLead({ accountName: 'Same name', contactName: 'Person' }, 'owner', sample);
  const direct = await createOpportunity({ ...emptyOpportunityInput, accountName: 'Same name', opportunityName: 'Imported lead', stage: 'Lead' }, 'owner', sample);
  assert.equal(lead.opportunity.isSample, true);
  assert.equal(lead.stakeholder.isSample, true);
  assert.equal(direct.opportunity.isSample, true);
  await qualifyLead(lead.opportunity, 'owner');
  assert.equal(calls.length, 0);
  assert.equal(rows.size, 0);
});

test('a lead created in local fallback can qualify without disappearing into a cloud reread', async () => {
  rejectCloud = true;
  const lead = (await createLead({ accountName: 'Offline customer' }, 'owner', real)).opportunity;
  assert.equal(lead.storageMode, 'local');
  const result = await qualifyLead(lead, 'owner');
  assert.equal(result.opportunity.id, lead.id);
  assert.equal(result.opportunity.stage, 'Discovery');
  assert.equal(JSON.parse(data.get(OPPORTUNITY_STORAGE_KEY))[0].stage, 'Discovery');
});
