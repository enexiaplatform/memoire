import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createPlanCompletionHandler } from '../../api/_planCompletion.js';

const login = randomUUID();
const activity = randomUUID();
const receiptId = randomUUID();
const item = { id: 'plan-1', kind: 'personal' };
const record = { id: item.id, date: '2026-11-18', label: 'Call', updatedAt: '2026-11-18T01:00:00.000Z' };
const receipt = {
  status: 'confirmed', transitioned: false, receiptId, committedAt: '2026-11-18T01:00:01Z',
  record: { ...record, done: true, updatedAt: '2026-11-18T01:00:01.000Z', completionActivityId: activity, completionRevision: receiptId },
};
let online = true;
let writesBlocked = false;
let activityPending = false;
let keepDependency = false;
let stale = false;
let saved;
const entries = new Map();
const storage = {
  get length() { return entries.size; },
  key: index => [...entries.keys()][index] ?? null,
  getItem: key => entries.get(key) ?? null,
  setItem(key, value) { if (writesBlocked) throw Error('quota'); entries.set(key, value); },
  removeItem: key => entries.delete(key),
};
globalThis.window = Object.assign(new EventTarget(), { localStorage: storage });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
globalThis.__planTest = {
  login, get saved() { return saved; }, save(value) { if (this.saveError) throw Error('cache full'); saved = value; },
  assert() { if (stale) throw Error('stale scope'); },
  pending() { return activityPending ? [{ id: activity }] : []; },
  flush() { if (!keepDependency) activityPending = false; },
};
const substitutions = {
  'productAnalytics.ts': 'export const trackProductEvent = () => {};',
  'supabaseClient.ts': 'export const supabaseAccountClient = {auth:{ getSession: async () => ({data: {session:{user:{id:globalThis.__planTest.login}, access_token:"opaque"}}}) }};',
  'localWorkspaceOwner.ts': 'export const guardLocalWorkspaceScope = () => globalThis.__planTest.assert;',
  'planItemStore.ts': 'export const loadPlanItems = () => globalThis.__planTest.saved ? [globalThis.__planTest.saved] : []; export const savePlanItem = value => globalThis.__planTest.save(value);',
  'salesActivityStore.ts': 'export const flushPendingSalesActivities = globalThis.__planTest.flush; export const listPendingSalesActivities = globalThis.__planTest.pending;',
};
registerHooks({
  load(url, context, nextLoad) {
    const name = new URL(url).pathname.split('/').at(-1);
    if (substitutions[name]) return { format: 'module', source: substitutions[name], shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { confirmExistingPlanActivity, countPendingPlanCompletions, flushPendingPlanCompletions } =
  await import('../../src/services/planCompletionClient.ts');

test('offline intent waits for its Capture dependency and a valid receipt, including a lost response', async () => {
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers['x-memoire-data-workspace'], 'default');
    requests.push(JSON.parse(init.body));
    if (requests.length === 1) throw Error('response lost');
    return Response.json(receipt);
  };
  online = false;
  activityPending = true;
  keepDependency = true;
  const first = await confirmExistingPlanActivity(login, item, record, activity, record);
  assert.equal(first.status, 'pending');
  assert.equal(countPendingPlanCompletions(login), 1);
  assert.equal(countPendingPlanCompletions(randomUUID()), 0);
  assert.equal(saved, undefined);

  online = true;
  await flushPendingPlanCompletions(login);
  assert.equal(requests.length, 0);
  keepDependency = false;
  await flushPendingPlanCompletions(login);
  assert.equal(countPendingPlanCompletions(login), 1);
  assert.equal(saved, undefined);
  await flushPendingPlanCompletions(login);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(saved.completionActivityId, activity);
  assert.equal(countPendingPlanCompletions(login), 0);
});

test('full storage rejects before sending; a scope switch leaves the original intent parked', async () => {
  saved = undefined;
  writesBlocked = true;
  try {
    await assert.rejects(confirmExistingPlanActivity(login, item, record, activity, record), /quota/);
    assert.equal(countPendingPlanCompletions(login), 0);
  } finally {
    writesBlocked = false;
  }
  globalThis.fetch = async () => {
    stale = true;
    return Response.json(receipt);
  };
  try {
    await assert.rejects(confirmExistingPlanActivity(login, item, record, activity, record), /stale scope/);
    assert.equal(saved, undefined);
  } finally {
    stale = false;
  }
  assert.equal(countPendingPlanCompletions(login), 1);
  globalThis.fetch = async () => Response.json({ status: 'conflict' }, { status: 409 });
  await flushPendingPlanCompletions(login);
  assert.equal(countPendingPlanCompletions(login), 0);
});

test('flag off parks the original command and a confirmed receipt survives a local cache failure', async () => {
  saved = undefined;
  const requests = [];
  globalThis.__planTest.saveError = true;
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return requests.length === 1
      ? Response.json({ status: 'paused' }, { status: 503 })
      : Response.json(receipt);
  };
  assert.equal((await confirmExistingPlanActivity(login, item, record, activity, record)).status, 'pending');
  assert.equal(countPendingPlanCompletions(login), 1);
  assert.equal(saved, undefined);
  await flushPendingPlanCompletions(login);
  assert.equal(countPendingPlanCompletions(login), 1);
  globalThis.__planTest.saveError = false;
  await flushPendingPlanCompletions(login);
  assert.equal(countPendingPlanCompletions(login), 0);
  assert.deepEqual(requests, [requests[0], requests[0], requests[0]]);
  assert.equal(saved.completionActivityId, activity);
});

test('API checks explicit scope, derives actor/session from verified token, and pauses without dropping queued intent', async () => {
  const session = randomUUID();
  const jwt = 'header.' + Buffer.from(JSON.stringify({ session_id: session })).toString('base64url') + '.signature';
  const body = {
    requestId: randomUUID(), activityId: activity, planId: item.id, derivedKey: null, expectedUpdatedAt: record.updatedAt, label: null, tag: null,
  };
  let invoked;
  const env = { PLAN_COMPLETION_ENABLED: 'true' };
  const handler = createPlanCompletionHandler({
    env, verify: async token => token === jwt ? { id: login } : null, rateLimit: () => ({ allowed: true }),
    database: () => ({ rpc: async (name, args) => { invoked = { name, args }; return { data: receipt }; } }),
  });
  const call = async (headers, request = body) => {
    const result = {};
    await handler({ method: 'POST', headers, body: request }, {
      setHeader() {}, status(value) { result.code = value; return this; }, json(value) { result.data = value; },
    });
    return result;
  };
  assert.equal((await call({ authorization: 'Bearer ' + jwt })).code, 400);
  assert.equal((await call({ 'x-memoire-data-workspace': 'default' })).code, 401);
  assert.equal((await call({ 'x-memoire-data-workspace': 'default', 'x-memoire-workspace': randomUUID() })).code, 400);
  const named = randomUUID();
  assert.equal((await call({ authorization: 'Bearer ' + jwt, 'x-memoire-data-workspace': named }, { ...body, actorId: randomUUID() })).code, 400);
  assert.equal(invoked, undefined);
  const ok = await call({ authorization: 'Bearer ' + jwt, 'x-memoire-data-workspace': named });
  assert.equal(ok.code, 200);
  assert.equal(invoked.args.p_actor, login);
  assert.equal(invoked.args.p_session, session);
  assert.equal(invoked.args.p_workspace, named);
  env.PLAN_COMPLETION_ENABLED = 'false';
  assert.equal((await call({ authorization: 'Bearer ' + jwt, 'x-memoire-data-workspace': named })).data.status, 'paused');
});
