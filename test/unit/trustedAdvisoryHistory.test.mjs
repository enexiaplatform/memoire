import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Node's type stripping retains .js specifiers. Resolve SDK source the same way as TypeScript.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith('file:')) {
      const target = new URL(specifier, context.parentURL);
      if (target.pathname.includes('/packages/memoire-sdk/src/')) {
        return nextResolve(target.href.replace(/\.js$/, '.ts'), context);
      }
    }
    return nextResolve(specifier, context);
  },
});
const { createTrustedAdvisoryHistoryResolver } = await import('../../server/advisoryReceiptHistory.ts');
const { evaluateAdvisoryActionReceipt } = await import('../../packages/memoire-sdk/src/agent-action-receipt.ts');

const accountId = '11111111-1111-4111-8111-111111111111';
const foreignAccount = '22222222-2222-4222-8222-222222222222';
const ownerA = '33333333-3333-4333-8333-333333333333';
const ownerB = '44444444-4444-4444-8444-444444444444';
const bookA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bookB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const principal = { accountId, agentId: 'fixture-agent' };
const reference = { id: 'action-fixture', revision: '1' };
const now = Date.parse('2026-11-20T12:00:00Z');
const keyA = { ...principal, workspaceId: bookA, dataOwnerId: ownerA, actionId: reference.id };
const defaultKey = { ...keyA, workspaceId: null, dataOwnerId: accountId };
const keyB = { ...keyA, workspaceId: bookB, dataOwnerId: ownerB };
const headers = (workspaceId, token = 'fixture-owner') => ({
  authorization: 'Bearer ' + token,
  ...(workspaceId ? { 'x-memoire-data-workspace': workspaceId } : {}),
});
const partition = key => JSON.stringify([key.accountId, key.agentId, key.workspaceId, key.dataOwnerId, key.actionId]);

function actionFor(key, revision = reference.revision) {
  return {
    identity: { id: key.actionId, revision }, principal: { accountId: key.accountId, agentId: key.agentId },
    workspace: { workspaceId: key.workspaceId, dataOwnerId: key.dataOwnerId },
    command: 'list-commitments', targetRevision: null, payloadRevision: null,
  };
}

function receiptFor(key, revision, time = now - 1, override = {}) {
  const action = actionFor(key, revision);
  const result = evaluateAdvisoryActionReceipt(action.identity, {
    principal: action.principal, workspace: action.workspace, action, now: time, ...override,
  });
  assert.equal(result.status, 'evaluated');
  return result.receipt;
}

function fixtures() {
  const rows = new Map();
  const reads = [];
  const checks = [];
  const contexts = [];
  const owners = new Map([[bookA, ownerA], [bookB, ownerB]]);
  const sessions = new Map([['fixture-owner', accountId], ['fixture-foreign', foreignAccount]]);
  const repository = {
    async readLatest(key) {
      assert.ok(Object.isFrozen(key));
      reads.push(key);
      return structuredClone(rows.get(partition(key)) ?? null);
    },
  };
  function resolver(overrides = {}) {
    return createTrustedAdvisoryHistoryResolver({
      principal, repository, now: () => now,
      async loadCurrentAction(key) { contexts.push(key); return { action: actionFor(key) }; },
      async verify(token, expected) { checks.push([token, expected]); return { id: sessions.get(token) }; },
      clientForToken(token, selection) {
        return {
          rpc(name, args) {
            const isOwner = sessions.get(token) === accountId;
            if (name === 'memoire_get_native_workspace_scope') {
              assert.equal(selection, undefined);
              const owner = isOwner ? owners.get(args.p_workspace) : undefined;
              return { maybeSingle: async () => ({ data: owner ? { data_owner_id: owner } : null, error: null }) };
            }
            assert.equal(name, 'memoire_active_data_owner');
            return Promise.resolve({ data: isOwner ? owners.get(selection) : null, error: null });
          },
        };
      },
      ...overrides,
    });
  }
  function seed(key, receipt = receiptFor(key)) { rows.set(partition(key), { key, receipt }); }
  return { resolver, seed, rows, reads, checks, contexts, owners, sessions };
}

const unavailable = { status: 'scope_unavailable' };

test('same-scope lookup uses fresh policy and a bounded key, and missing history evaluates without a prior', async () => {
  const f = fixtures();
  const resolve = f.resolver();
  const request = headers(bookA.toUpperCase());
  const missing = await resolve(request, reference);
  assert.equal(missing.status, 'resolved');
  assert.equal(missing.history, 'missing');
  assert.equal(missing.evaluation.status, 'evaluated');
  f.seed(keyA);
  const found = await resolve(request, reference);
  assert.deepEqual(found, { status: 'resolved', history: 'found',
    evaluation: { ...missing.evaluation, status: 'retry' } });
  assert.equal(found.evaluation.receipt.executionOutcome, 'unknown');
  assert.deepEqual(f.reads, [keyA, keyA]);
  assert.deepEqual(f.contexts, f.reads);
  assert.deepEqual(f.checks, Array.from({ length: 4 }, () => ['fixture-owner', accountId]));
});

test('foreign accounts and unowned or conflicting workspace selectors perform no reads', async () => {
  const f = fixtures();
  f.seed(keyA);
  const resolve = f.resolver();
  assert.deepEqual(await resolve(headers(bookA, 'fixture-foreign'), reference), unavailable);
  assert.deepEqual(await resolve(headers(bookA, 'unknown'), reference), unavailable);
  assert.deepEqual(await resolve(headers('99999999-9999-4999-8999-999999999999'), reference), unavailable);
  assert.deepEqual(await resolve({ ...headers(bookA), 'x-memoire-workspace': bookB }, reference), unavailable);
  assert.deepEqual(f.reads, []);
  assert.deepEqual(f.contexts, []);
});

test('agent, default, and named partitions never reuse each other’s history', async () => {
  const f = fixtures();
  f.seed(keyA);
  const resolve = f.resolver();
  assert.equal((await resolve(headers(bookA), reference)).history, 'found');
  assert.equal((await resolve(headers(), reference)).history, 'missing');
  assert.equal((await resolve(headers(bookB), reference)).history, 'missing');
  const agent = { ...principal, agentId: 'another-agent' };
  assert.equal((await f.resolver({ principal: agent })(headers(bookA), reference)).history, 'missing');
  assert.deepEqual(f.reads, [keyA, defaultKey, keyB, { ...keyA, agentId: agent.agentId }]);
});

test('forged owner, approval, and client history cannot enter the authorization or lookup key', async () => {
  const f = fixtures();
  const resolve = f.resolver();
  for (const input of [null, [], { ...reference, dataOwnerId: ownerB }, { ...reference, approval: {} },
    { ...reference, prior: receiptFor(keyA) }, { ...reference, id: 'x'.repeat(201) }, { ...reference, revision: 1 },
    { ...reference, revision: '  ' }]) {
    assert.deepEqual(await resolve(headers(bookA), input), { status: 'invalid_request' });
  }
  assert.deepEqual(f.checks, []);
  const forgedHeaders = { ...headers(bookA), 'x-memoire-data-owner': ownerB, 'x-memoire-agent-id': 'forged' };
  assert.equal((await resolve(forgedHeaders, reference, receiptFor(keyA))).history, 'missing');
  assert.deepEqual(f.reads, [keyA]);
});

test('an inconsistent adapter cannot disclose foreign history, even if its receipt is malformed', async () => {
  const f = fixtures();
  const missing = await f.resolver()(headers(bookA), reference);
  for (const foreign of [defaultKey, keyB, { ...keyA, agentId: 'another-agent' },
    { ...keyA, accountId: foreignAccount }, { ...keyA, actionId: 'other-action' }]) {
    const invalid = { ...receiptFor(foreign), version: 99 };
    for (const key of [foreign, keyA]) {
      const resolve = f.resolver({ repository: { readLatest: async () => ({ key, receipt: invalid }) } });
      assert.deepEqual(await resolve(headers(bookA), reference), missing);
    }
  }
});

test('changed revisions and a future historical evaluation are stale, while a stale request is classified independently', async () => {
  const f = fixtures();
  const resolve = f.resolver();
  f.seed(keyA, receiptFor(keyA, '0'));
  assert.deepEqual(await resolve(headers(bookA), reference), { status: 'resolved', history: 'stale',
    evaluation: { status: 'conflict', reason: 'action_revision_changed' } });
  f.seed(keyA, receiptFor(keyA, '1', now + 1));
  assert.deepEqual(await resolve(headers(bookA), reference), { status: 'resolved', history: 'stale',
    evaluation: { status: 'conflict', reason: 'stale_evaluation' } });
  assert.deepEqual(await resolve(headers(bookA), { ...reference, revision: '0' }), {
    status: 'resolved', history: 'not_used', evaluation: { status: 'conflict', reason: 'action_revision_changed' },
  });
});

test('corrupted, unsupported and unavailable history fail closed rather than becoming a first evaluation', async () => {
  const f = fixtures();
  const valid = receiptFor(keyA);
  for (const bad of [null, {}, { ...valid, version: 2 }, { ...valid, retryIdentity: 'forged' },
    { ...valid, executionOutcome: 'completed' }]) {
    f.seed(keyA, bad);
    assert.deepEqual(await f.resolver()(headers(bookA), reference), { status: 'history_corrupted' });
  }
  const repository = { async readLatest() { throw Error('Fixture offline'); } };
  assert.deepEqual(await f.resolver({ repository })(headers(bookA), reference), { status: 'history_unavailable' });
  assert.deepEqual(await f.resolver({ loadCurrentAction: async () => { throw Error('Fixture offline'); } })(headers(bookA), reference),
    { status: 'context_unavailable' });
});

test('revocation or a changed effective owner during a pending read suppresses the result', async () => {
  for (const change of [
    f => f.owners.delete(bookA),
    f => f.owners.set(bookA, ownerB),
    f => f.sessions.delete('fixture-owner'),
  ]) {
    const f = fixtures();
    const resolve = f.resolver({ repository: { async readLatest() {
      change(f);
      return { key: keyA, receipt: receiptFor(keyA) };
    } } });
    assert.deepEqual(await resolve(headers(bookA), reference), unavailable);
  }
});

test('concurrent requests capture their own selector and never share an in-flight receipt', async () => {
  const f = fixtures();
  const aStarted = Promise.withResolvers();
  const releaseA = Promise.withResolvers();
  const inputs = headers(bookA);
  const resolve = f.resolver({ repository: { async readLatest(key) {
    if (key.workspaceId === bookB) return null;
    aStarted.resolve();
    await releaseA.promise;
    return { key: keyA, receipt: receiptFor(keyA) };
  } } });
  const pending = resolve(inputs, reference);
  await aStarted.promise;
  inputs['x-memoire-data-workspace'] = bookB;
  try {
    const b = await resolve(inputs, reference);
    assert.equal(b.history, 'missing');
    assert.equal(b.evaluation.receipt.scope[2], bookB);
  } finally { releaseA.resolve(); }
  const a = await pending;
  assert.equal(a.history, 'found');
  assert.equal(a.evaluation.receipt.scope[2], bookA);
});

test('fresh revoked policy is not replaced by history and no write, reservation or dispatch occurs', async t => {
  const fetchSpy = t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected dispatch'));
  const f = fixtures();
  const action = { ...actionFor(keyA), command: 'receive-observation', sourceNamespace: 'fixture', payloadRevision: 'payload-1' };
  const grant = { principal, workspace: action.workspace, status: 'active',
    authority: { expiresAt: '2026-11-20T12:01:00Z', namespaces: ['fixture'], maxReceipts: 1 } };
  const original = structuredClone(grant);
  const past = receiptFor(keyA, '1', now - 1, { action, grant });
  f.seed(keyA, past);
  const resolver = f.resolver({ loadCurrentAction: async () => ({ action, grant }) });
  assert.deepEqual((await resolver(headers(bookA), reference)).evaluation.receipt.authorization, { decision: 'allow' });
  const revoked = f.resolver({ loadCurrentAction: async () => ({ action, grant: { ...grant, status: 'revoked' } }) });
  assert.deepEqual(await revoked(headers(bookA), reference), { status: 'resolved', history: 'stale',
    evaluation: { status: 'conflict', reason: 'authorization_changed' } });
  assert.deepEqual(grant, original);
  assert.deepEqual(f.rows.get(partition(keyA)), { key: keyA, receipt: past });
  assert.equal(fetchSpy.mock.callCount(), 0);
});
