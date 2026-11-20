import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAdvisoryActionReceipt } from '../../packages/memoire-sdk/dist/agent-action-receipt.js';
import { evaluateAgentAuthorization } from '../../packages/memoire-sdk/dist/agent-authorization.js';
import { createAgentRuntime } from '../../packages/memoire-sdk/dist/agent-runtime.js';

const now = Date.parse('2026-11-20T14:00:00Z');
const expiresAt = '2026-11-20T14:01:00Z';
const principal = { accountId: 'account-a', agentId: 'agent-one' };
const workspace = { workspaceId: 'book-a', dataOwnerId: 'owner-a' };
const identity = { id: 'action-1', revision: '1' };
const action = { identity, principal, workspace, command: 'accept-evidence', targetRevision: 'target-1', payloadRevision: 'payload-1' };
const approval = {
  identity: { id: 'approval-1', revision: '1' }, action, status: 'approved',
  reviewedBy: { kind: 'human', accountId: 'reviewer' }, expiresAt,
};
const base = { principal, workspace, action, approval, now };
const expectedDisabled = { decision: 'deny', reason: 'action_disabled' };

function evaluate(patches = {}, prior, reference = identity) {
  return evaluateAdvisoryActionReceipt(reference, { ...base, ...patches }, prior);
}
function first(patches) {
  const result = evaluate(patches);
  assert.equal(result.status, 'evaluated');
  return result.receipt;
}
const conflict = reason => ({ status: 'conflict', reason });
const rejected = reason => ({ status: 'rejected', reason });

test('first evaluation and exact retry bind all scope information without claiming execution', () => {
  const original = first();
  assert.equal(original.kind, 'advisory-action-evaluation');
  assert.equal(original.version, 1);
  assert.deepEqual(original.scope, ['account-a', 'agent-one', 'book-a', 'owner-a']);
  assert.deepEqual(original.action, ['action-1', '1', 'target-1', 'payload-1', 'accept-evidence', 'consequential_action', null]);
  assert.deepEqual(original.approval, ['approval-1', '1', 'reviewer', 'approved', Date.parse(expiresAt)]);
  assert.deepEqual(original.authorization, expectedDisabled);
  assert.equal(original.executionOutcome, 'unknown');
  const reordered = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(original))).reverse());
  assert.deepEqual(evaluate({ now: now + 1 }, reordered, { revision: '1', id: 'action-1' }),
    { status: 'retry', receipt: { ...original, evaluatedAt: now + 1 } });
  assert.equal(evaluate({ approval: { ...approval, expiresAt: '2026-11-20T21:01:00+07:00' } }, original).status, 'retry');
});

test('unknown IDs, invalid times and forged action references reject before a receipt is formed', () => {
  assert.deepEqual(evaluate({ action: null }), rejected('action_unavailable'));
  assert.deepEqual(evaluate({}, undefined, { ...identity, id: 'unknown' }), rejected('action_unavailable'));
  for (const time of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(evaluate({ now: time }), rejected('invalid_context'));
  }
  for (const bad of [null, [identity], { ...identity, approval }, { ...identity, agentId: 'privileged' },
    { ...identity, permissions: ['approve'] }, { ...identity, revision: { value: '1' } }]) {
    assert.deepEqual(evaluate({}, undefined, bad), rejected('invalid_request'));
  }
  assert.deepEqual(evaluate({ action: { ...action, command: 'toString' } }), rejected('unknown_action'));
  assert.deepEqual(evaluate({ action: { ...action, payloadRevision: null } }), rejected('invalid_action_binding'));
});

test('changed identity, command, target, payload and source bindings conflict', () => {
  const old = first();
  const revision = { ...identity, revision: '2' };
  const revised = { ...action, identity: revision };
  assert.deepEqual(evaluate({ action: revised }, old), conflict('action_revision_changed'));
  assert.deepEqual(evaluate({ action: revised, approval: { ...approval, action: revised } }, old, revision),
    conflict('action_revision_changed'));
  const other = { ...action, identity: { ...identity, id: 'action-2' } };
  assert.deepEqual(evaluate({ action: other, approval: { ...approval, action: other } }, old, other.identity),
    conflict('action_id_changed'));
  for (const patch of [{ targetRevision: 'target-2' }, { payloadRevision: 'payload-2' }, { command: 'list-commitments' }]) {
    const revisedAction = { ...action, ...patch };
    assert.deepEqual(evaluate({ action: revisedAction }, old), conflict('action_binding_changed'));
    assert.deepEqual(evaluate({ action: revisedAction, approval: { ...approval, action: revisedAction } }, old),
      conflict('action_binding_changed'));
  }
  const observation = { ...action, command: 'receive-observation', sourceNamespace: 'source-one' };
  const before = first({ action: observation });
  assert.deepEqual(evaluate({ action: { ...observation, sourceNamespace: 'source-two' } }, before), conflict('action_binding_changed'));
});

test('account, agent and effective workspace switches reject cross-scope replay', () => {
  const old = first();
  const account = { ...principal, accountId: 'account-b' };
  const agent = { ...principal, agentId: 'agent-two' };
  const initialDefault = { workspaceId: null, dataOwnerId: principal.accountId };
  for (const [nextPrincipal, nextScope] of [
    [account, workspace], [agent, workspace], [principal, initialDefault],
    [principal, { ...workspace, workspaceId: 'other-book' }], [principal, { ...workspace, dataOwnerId: 'other-owner' }],
  ]) {
    const nextAction = { ...action, principal: nextPrincipal, workspace: nextScope };
    const next = { principal: nextPrincipal, workspace: nextScope, action: nextAction,
      approval: { ...approval, action: nextAction } };
    assert.deepEqual(evaluate(next, old), conflict('scope_changed'));
    assert.notEqual(first(next).retryIdentity, old.retryIdentity);
  }
  assert.deepEqual(evaluate({ principal: account }), rejected('principal_mismatch'));
  assert.deepEqual(evaluate({ workspace: initialDefault }), rejected('workspace_mismatch'));
});

test('only an exact bound human approval is recognized and it never enables dispatch', () => {
  const old = first();
  for (const patch of [
    { identity: { id: 'approval-2', revision: '1' } }, { identity: { ...approval.identity, revision: '2' } },
    { reviewedBy: { kind: 'human', accountId: 'other-reviewer' } },
    { expiresAt: '2026-11-20T14:02:00Z' },
  ]) {
    assert.deepEqual(evaluate({ approval: { ...approval, ...patch } }, old), conflict('approval_changed'));
  }
  for (const status of ['revoked', 'consumed']) {
    const current = { approval: { ...approval, status } };
    assert.deepEqual(first(current).authorization, { decision: 'deny', reason: 'approval_inactive' });
    assert.deepEqual(evaluate(current, old), conflict('approval_changed'));
  }
  assert.deepEqual(first({ now: Date.parse(expiresAt) }).authorization, { decision: 'deny', reason: 'approval_expired' });
  assert.deepEqual(evaluate({ now: Date.parse(expiresAt) }, old), conflict('authorization_changed'));
  assert.deepEqual(first({ approval: undefined }).authorization, { decision: 'deny', reason: 'approval_required' });
  assert.deepEqual(evaluate({ approval: undefined }, old), conflict('approval_changed'));
  for (const malformed of [
    { ...approval, identity: undefined }, { ...approval, reviewedBy: { kind: 'agent', accountId: 'fake' } },
    { ...approval, status: 'pending' }, { ...approval, expiresAt: 'invalid' },
    { ...approval, expiresAt: '2026-11-20T14:01:00' },
  ]) assert.deepEqual(evaluate({ approval: malformed }, old), rejected('invalid_approval_binding'));
  assert.deepEqual(evaluate({ approval: { ...approval, action: { ...action, targetRevision: 'other' } } }, old),
    rejected('approval_mismatch'));
  assert.deepEqual(evaluate({ approval: { ...approval, action: { ...action, payloadRevision: 'other' } } }, old),
    rejected('approval_mismatch'));
  assert.deepEqual(evaluate({ approval: { ...approval, action: { ...action, workspace: { ...workspace, dataOwnerId: 'foreign' } } } }, old),
    rejected('approval_mismatch'));
});

test('advisory evaluations leave the live M23 instance receipt budget untouched', async () => {
  const source = { schemaVersion: 1, sourceKind: 'crm', sourceNamespace: 'fixture', sourceEventId: 'event-1',
    sourceVersion: '1', observedAt: null, summary: 'Fixture observation', rawText: 'Fixture text' };
  const receiptAuthority = { namespaces: ['fixture'], expiresAt: '2099-01-01T00:00:00Z', maxReceipts: 1 };
  let writes = 0;
  const runtime = await createAgentRuntime({
    origin: 'https://memoire.example', getAccessToken: () => 'synthetic-token', agentId: principal.agentId, receiptAuthority,
    observations: [{ key: 'one', observation: source }, { key: 'two', observation: { ...source, sourceEventId: 'event-2' } }],
    fetch: async (url, init) => {
      if (init.method === 'GET') return Response.json({ version: 1, resource: url.searchParams.get('resource'),
        scope: 'authenticated-owner', basis: 'commitments-in-this-page', nextCursor: null, items: [] });
      writes++;
      return Response.json({ version: 1, command: 'receive-observation', duplicate: false,
        receipt: { id: 'receipt-fixture', receivedAt: expiresAt, acceptedCommercialTruth: false, observation: source } });
    },
  });
  const [one, two] = await runtime.propose(async () => ['one', 'two'].map(observationKey => ({
    type: 'receive-observation', observationKey, summary: 'Fixture proposal',
  })));
  const context = { action: { ...action, command: 'receive-observation', sourceNamespace: 'fixture' },
    grant: { principal, workspace, status: 'active', authority: receiptAuthority } };
  assert.equal(evaluate(context, first(context)).status, 'retry');
  assert.equal(writes, 0);
  assert.equal((await runtime.executeReceipt(one.id)).receipt.acceptedCommercialTruth, false);
  assert.equal((await runtime.executeReceipt(one.id)).receipt.id, 'receipt-fixture');
  await assert.rejects(runtime.executeReceipt(two.id), { code: 'receipt_budget_exhausted' });
  assert.equal(writes, 1);
});

test('receipt validation, out-of-order evaluation and matching concurrency are deterministic', async () => {
  const old = first();
  for (const bad of [null, {}, { ...old, version: 2 }, { ...old, retryIdentity: 'forged' },
    { ...old, executionOutcome: 'completed' }, { ...old, evaluatedAt: -1 },
    { ...old, action: [...old.action.slice(0, 5), 'read', null] },
    { ...old, authorization: { decision: 'deny', reason: 'invented' } },
    { ...old, authorization: { ...old.authorization, grant: approval } }]) {
    assert.deepEqual(evaluate({}, bad), rejected('malformed_receipt'));
  }
  assert.deepEqual(evaluate({}, { ...old, authorization: { decision: 'allow' } }), conflict('authorization_changed'));
  const later = evaluate({ now: now + 1 }, old).receipt;
  assert.deepEqual(evaluate({}, later), conflict('stale_evaluation'));
  const concurrent = await Promise.all(Array.from({ length: 8 }, async () => evaluate({ now: now + 1 }, old)));
  assert.ok(concurrent.every(result => result.status === 'retry'));
  for (const result of concurrent) assert.deepEqual(result.receipt, later);
});

test('advisory policy reevaluation neither dispatches nor consumes existing observation authority', t => {
  const fetchSpy = t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected external dispatch'));
  const observation = { ...action, command: 'receive-observation', sourceNamespace: 'trusted-source' };
  const grant = { principal, workspace, status: 'active', authority: { expiresAt, namespaces: ['trusted-source'], maxReceipts: 1 } };
  const original = structuredClone(grant);
  const inputs = { action: observation, grant };
  const prior = first(inputs);
  assert.deepEqual(prior.authorization, { decision: 'allow' });
  assert.equal(prior.executionOutcome, 'unknown');
  assert.equal(evaluate(inputs, prior).status, 'retry');
  assert.deepEqual(evaluate({ ...inputs, grant: { ...grant, status: 'revoked' } }, prior), conflict('authorization_changed'));
  assert.deepEqual(evaluate({ ...inputs, now: Date.parse(expiresAt) }, prior), conflict('authorization_changed'));
  assert.deepEqual(evaluate({ ...inputs, grant: { ...grant, authority: { ...grant.authority, expiresAt: '2026-11-20T14:01:00' } } }, prior),
    rejected('invalid_context'));
  assert.deepEqual(grant, original);
  assert.equal(fetchSpy.mock.callCount(), 0);
  // The old PR #11 evaluator intentionally still accepts approvals without receipt identity.
  const { identity: omitted, ...legacyApproval } = approval;
  assert.equal(omitted.id, 'approval-1');
  assert.equal(evaluateAgentAuthorization(identity, { ...base, approval: legacyApproval }).reason, 'action_disabled');
  assert.deepEqual(evaluate({ approval: legacyApproval }), rejected('invalid_approval_binding'));
});
