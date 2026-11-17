import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/lib/supabaseClient.ts')) {
      return {
        format: 'module', shortCircuit: true,
        source: 'export const supabaseClient = globalThis.__workspaceRaceCloud; export const isPipelineSupabaseConfigured = true;',
      };
    }
    return next(url, context);
  },
});

const storage = new Map();
let refuseLocalWrites = false;
globalThis.localStorage = globalThis.window = undefined;
globalThis.localStorage = {
  get length() { return storage.size; },
  key: index => [...storage.keys()][index] ?? null,
  getItem: key => storage.get(key) ?? null,
  setItem(key, value) {
    if (refuseLocalWrites) throw new DOMException('Fixture storage is full', 'QuotaExceededError');
    storage.set(key, value);
  },
  removeItem: key => storage.delete(key),
};
globalThis.window = { localStorage, dispatchEvent: () => true };
const requests = [];
const uploads = [];
const activityRows = new Map();
let loseFirstActivityResponse = false;
globalThis.__workspaceRaceCloud = {
  from(table) {
    const request = { table, owner: null };
    const response = () => new Promise(resolve => requests.push({ ...request, resolve }));
    if (table === 'sales_activities') {
      const filters = new Map();
      let inserted;
      return {
        insert(row) { inserted = row; return this; },
        select() { return this; },
        eq(key, value) { filters.set(key, value); return this; },
        async single() {
          if (!inserted) {
            const row = activityRows.get(filters.get('id'));
            return { data: row?.user_id === filters.get('user_id') ? row : null, error: null };
          }
          if (activityRows.has(inserted.id)) return { data: null, error: { code: '23505', message: 'Duplicate' } };
          activityRows.set(inserted.id, inserted);
          if (loseFirstActivityResponse) {
            loseFirstActivityResponse = false;
            return { data: null, error: { message: 'Network interrupted after commit' } };
          }
          return { data: inserted, error: null };
        },
      };
    }
    return {
      select() { return this; },
      eq(_, owner) { request.owner = owner; return this; },
      order() { return this; },
      range: response,
      maybeSingle: response,
      async upsert(rows) { uploads.push(...rows); return { error: null }; },
    };
  },
};

const { saveSalesActivity, flushPendingSalesActivities, listPendingSalesActivities } =
  await import('../../src/services/salesActivityStore.ts');
const { claimLocalWorkspace } = await import('../../src/services/localWorkspaceOwner.ts');
const { emptyQuoteInput, loadQuotes, loadQuotesForUser, QUOTE_STORAGE_KEY } =
  await import('../../src/services/quoteStore.ts');
const { loadAccounts } = await import('../../src/services/accountStore.ts');
const { getCachedWorkspaceValue, setCachedWorkspaceValue } = await import('../../src/services/workspaceDataCache.ts');
const { hydrateWorkspacePreferences } = await import('../../src/services/workspacePreferences.ts');
const { getReportingCurrency } = await import('../../src/utils/money.ts');

const ownerA = '10000000-0000-4000-8000-000000000001';
const ownerB = '10000000-0000-4000-8000-000000000002';
const quote = id => ({
  ...emptyQuoteInput, id, quoteId: id, title: id, accountName: id, amount: 120,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
});
const cloudRow = id => ({ id, payload: quote(id) });
const seedQuote = id => storage.set(QUOTE_STORAGE_KEY, JSON.stringify([quote(id)]));

beforeEach(() => {
  storage.clear();
  requests.length = 0;
  uploads.length = 0;
  activityRows.clear();
  loseFirstActivityResponse = false;
  refuseLocalWrites = false;
  claimLocalWorkspace(ownerA);
});

test('a previous owner’s delayed quotation read cannot publish or resync into the new book', async () => {
  seedQuote('A-local');
  const loadingA = loadQuotesForUser(ownerA);
  assert.equal(requests[0].owner, ownerA);
  claimLocalWorkspace(ownerB);
  seedQuote('B-local');

  requests[0].resolve({ data: [cloudRow('A-cloud')], error: null });
  const settled = await Promise.allSettled([loadingA]);
  assert.deepEqual(loadQuotes().map(row => row.id), ['B-local']);
  assert.equal(settled[0].status, 'rejected');
  assert.deepEqual(uploads, []);

  const loadingB = loadQuotesForUser(ownerB);
  requests[1].resolve({ data: [cloudRow('B-cloud')], error: null });
  assert.deepEqual(new Set((await loadingB).map(row => row.id)), new Set(['B-local', 'B-cloud']));
  assert.deepEqual(uploads.map(row => [row.user_id, row.id]), [[ownerB, 'B-local']]);
});

test('a stale failure cannot return the previous owner’s offline quotations', async () => {
  seedQuote('A-local');
  const loading = loadQuotesForUser(ownerA);
  claimLocalWorkspace(ownerB);
  requests[0].resolve({ data: null, error: { message: 'offline' } });
  await assert.rejects(loading, /workspace account changed/i);
  assert.deepEqual(loadQuotes(), []);
});

test('switching back to the same owner also invalidates the earlier quotation request', async () => {
  const loading = loadQuotesForUser(ownerA);
  claimLocalWorkspace(ownerB);
  claimLocalWorkspace(ownerA);
  seedQuote('A-current');
  requests[0].resolve({ data: [cloudRow('A-stale')], error: null });
  const settled = await Promise.allSettled([loading]);
  assert.deepEqual(loadQuotes().map(row => row.id), ['A-current']);
  assert.equal(settled[0].status, 'rejected');
});

test('a delayed reporting preference cannot change the new owner’s currency or proposed defaults', async () => {
  const loadingA = hydrateWorkspacePreferences(ownerA);
  claimLocalWorkspace(ownerB);
  storage.set('memoire_reporting_currency', 'USD');
  requests[0].resolve({ data: { reporting_currency: 'SGD' }, error: null });
  const result = await loadingA;
  assert.equal(getReportingCurrency(), 'USD');
  assert.notEqual(result.reportingCurrency, 'SGD');
});

test('an unchanged owner keeps its offline fallback and can still hydrate reporting preferences', async () => {
  seedQuote('A-offline');
  const loading = loadQuotesForUser(ownerA);
  requests[0].resolve({ data: null, error: { message: 'offline' } });
  assert.deepEqual((await loading).map(row => row.id), ['A-offline']);
  const preferences = hydrateWorkspacePreferences(ownerA);
  requests[1].resolve({ data: { reporting_currency: 'SGD' }, error: null });
  assert.equal((await preferences).reportingCurrency, 'SGD');
  assert.equal(getReportingCurrency(), 'SGD');
});

test('the owner transition invalidates cached aggregate and guest-projection entries', () => {
  setCachedWorkspaceValue(`ws:${ownerA}:accounts`, [{ id: 'A-account' }]);
  setCachedWorkspaceValue('ws:local:quotes', [quote('A-local')]);
  claimLocalWorkspace(ownerB);
  assert.equal(getCachedWorkspaceValue(`ws:${ownerA}:accounts`), null);
  assert.equal(getCachedWorkspaceValue('ws:local:quotes'), null);
});

test('a relational account query is rejected if its browser owner changes before response', async () => {
  const loading = loadAccounts(ownerA);
  assert.equal(requests[0].owner, ownerA);
  claimLocalWorkspace(ownerB);
  requests[0].resolve({ data: [{
    id: 'A-account', user_id: ownerA, account_name: 'Fictional customer A',
  }], error: null });
  await assert.rejects(loading, /workspace account changed/i);
});

test('a new settings load does not reuse an earlier visit to the same account', async () => {
  const original = hydrateWorkspacePreferences(ownerA);
  claimLocalWorkspace(ownerB);
  claimLocalWorkspace(ownerA);
  const current = hydrateWorkspacePreferences(ownerA);
  assert.equal(requests.length, 2);
  requests[1].resolve({ data: { reporting_currency: 'USD' }, error: null });
  await current;
  requests[0].resolve({ data: { reporting_currency: 'SGD' }, error: null });
  await original;
  assert.equal(getReportingCurrency(), 'USD');
});


test('Capture retries the original Activity ID when the first write committed without a response', async () => {
  loseFirstActivityResponse = true;
  const input = {
    activityDate: '2026-11-17', rawNote: 'Fictional renewal call',
    summary: 'Discussed the renewal', activityType: 'Call', tags: [],
  };
  const scope = { source: 'user', isSample: false };
  const target = { linkedOpportunityId: '10000000-0000-4000-8000-000000000101',
    linkedOpportunityName: 'Fictional renewal', linkedAccountName: 'Fictional customer', linkStatus: 'Linked' };
  const first = await saveSalesActivity(input, ownerA, scope, target);
  assert.equal(first.mode, 'local');
  assert.deepEqual([...activityRows.keys()], [first.record.id]);
  assert.equal(listPendingSalesActivities().length, 1);

  const result = await flushPendingSalesActivities(ownerA);
  assert.equal(result.synced, 1);
  assert.equal(result.remaining, 0);
  assert.deepEqual([...activityRows.keys()], [first.record.id]);
  assert.equal(activityRows.get(first.record.id).linked_opportunity_id, target.linkedOpportunityId);
});

test('a full browser cannot report an offline Capture save as successful', async () => {
  refuseLocalWrites = true;
  await assert.rejects(saveSalesActivity({
    activityDate: '2026-11-17', rawNote: 'Fictional demo call', activityType: 'Call', tags: [],
  }, null, { source: 'demo', isSample: true }), /not saved here/i);
  assert.equal(activityRows.size, 0);
});
