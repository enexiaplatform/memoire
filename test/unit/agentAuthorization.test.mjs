import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAgentAuthorization } from '../../packages/memoire-sdk/dist/agent-authorization.js';

const now = Date.parse('2026-11-19T12:00:00Z');
const expiresAt = '2026-11-19T12:01:00Z';
const expiresNow = '2026-11-19T12:00:00Z';
const principal = { accountId: 'owner-a', agentId: 'assistant' };
const workspace = { workspaceId: 'book-a', dataOwnerId: 'storage-a' };
const identity = { id: 'action-a', revision: '1' };
const action = { identity, principal, workspace, command: 'list-commitments' };
const observation = { ...action, command: 'receive-observation', sourceNamespace: 'source-a' };
const grant = { principal, workspace, status: 'active', authority: { namespaces: ['source-a'], expiresAt, maxReceipts: 1 } };
const consequential = { ...action, command: 'accept-evidence' };
const approval = { action: consequential, status: 'approved', expiresAt, reviewedBy: { kind: 'human', accountId: 'reviewer' } };

function evaluate(overrides = {}, reference = identity) {
  return evaluateAgentAuthorization(reference, { principal, workspace, action, now, ...overrides });
}
function deny(reason, overrides, reference) {
  const result = evaluate(overrides, reference);
  assert.equal(result.decision, 'deny');
  assert.equal(result.reason, reason);
}

test('read requires an exact principal and effective workspace, including the owner default', () => {
  assert.equal(evaluate().decision, 'allow');
  const defaultScope = { workspaceId: null, dataOwnerId: principal.accountId };
  assert.equal(evaluate({ workspace: defaultScope, action: { ...action, workspace: defaultScope } }).decision, 'allow');
  deny('workspace_mismatch', { workspace: defaultScope });
  deny('workspace_mismatch', { workspace: { ...workspace, workspaceId: 'other-book' } });
  deny('workspace_mismatch', { workspace: { ...workspace, dataOwnerId: 'other-storage' } });
  deny('invalid_context', { workspace: { ...workspace, workspaceId: null } });
  deny('principal_mismatch', { principal: { ...principal, accountId: 'owner-b' } });
  deny('principal_mismatch', { principal: { ...principal, agentId: 'other-agent' } });
});

test('request accepts only an action reference and denies unknown or stale records', () => {
  for (const [field, value] of Object.entries({ agentId: 'another', principal, workspace, permissions: ['write'], grant, approval })) {
    deny('invalid_request', {}, { ...identity, [field]: value });
  }
  deny('invalid_request', {}, { ...identity, id: { id: identity.id, principal } });
  deny('invalid_request', {}, { ...identity, revision: { version: 1, approval } });
  deny('action_unavailable', { action: null });
  deny('action_unavailable', {}, { ...identity, revision: '2' });
  deny('unknown_action', { action: { ...action, command: 'toString' } });
  deny('invalid_context', { now: Number.NaN });
});

test('receipt intake requires active matching M23 authority and its allowed namespace', () => {
  const context = { action: observation, grant };
  assert.equal(evaluate(context).decision, 'allow');
  deny('grant_required', { action: observation });
  deny('grant_scope_mismatch', { ...context, grant: { ...grant, principal: { ...principal, agentId: 'other-agent' } } });
  deny('grant_scope_mismatch', { ...context, grant: { ...grant, workspace: { ...workspace, workspaceId: 'other-book' } } });
  deny('grant_revoked', { ...context, grant: { ...grant, status: 'revoked' } });
  deny('grant_expired', { ...context, now: Date.parse(expiresAt) });
  deny('grant_expired', { ...context, grant: { ...grant, authority: { ...grant.authority, expiresAt: 'invalid' } } });
  deny('namespace_denied', { ...context, action: { ...observation, sourceNamespace: 'foreign-source' } });
});

test('consequential policy rejects missing, stale, reused, and forged approvals with no write path', () => {
  deny('action_disabled', { action: { ...action, command: 'create-plan-item' }, grant, approval });
  deny('approval_required', { action: consequential, grant });
  deny('approval_inactive', { action: consequential, approval: { ...approval, reviewedBy: { kind: 'agent', accountId: 'reviewer' } } });
  for (const status of ['consumed', 'revoked']) deny('approval_inactive', { action: consequential, approval: { ...approval, status } });
  deny('approval_expired', { action: consequential, approval: { ...approval, expiresAt: expiresNow } });
  for (const changed of [
    { identity: { ...identity, revision: '0' } },
    { identity: { ...identity, id: 'another-action' } },
    { workspace: { ...workspace, workspaceId: 'another-book' } },
    { principal: { ...principal, agentId: 'another-agent' } },
    { command: 'create-plan-item' },
  ]) {
    deny('approval_mismatch', { action: consequential, approval: { ...approval, action: { ...consequential, ...changed } } });
  }
  deny('action_disabled', { action: consequential, approval });
});

test('policy decisions are deterministic and audit emits only trusted routing metadata', () => {
  const result = evaluate({ action: observation, grant }, { ...identity, approval: { token: 'fixture-untrusted' } });
  assert.deepEqual(result, evaluate({ action: observation, grant }, { ...identity, approval: { token: 'different' } }));
  assert.deepEqual(result, {
    decision: 'deny', reason: 'invalid_request',
    audit: {
      version: 1, accountId: principal.accountId, agentId: principal.agentId, workspaceId: workspace.workspaceId,
      dataOwnerId: workspace.dataOwnerId, actionId: identity.id, actionRevision: identity.revision,
      actionClass: 'observation_intake', evaluatedAt: now,
    },
  });
});
