import {
  classifyAgentCommand, evaluateAgentAuthorization, isActionReference, isAgentAuthorizationDenyReason,
  sameAction, samePrincipal, sameWorkspace,
  type AgentAction, type AgentActionClass, type AgentActionIdentity, type AgentApproval,
  type AgentAuthorizationContext, type AgentAuthorizationDenyReason, type AgentCommand,
} from './agent-authorization.js';

/** All revisions are opaque, non-secret identifiers resolved by the authenticated host. */
export interface AdvisoryAction extends AgentAction {
  readonly targetRevision: string | null;
  readonly payloadRevision: string | null;
}

export interface AdvisoryHumanApproval extends AgentApproval {
  readonly identity: AgentActionIdentity;
  readonly action: AdvisoryAction;
}

export interface AdvisoryActionContext extends Omit<AgentAuthorizationContext, 'action' | 'approval'> {
  readonly action: AdvisoryAction | null;
  readonly approval?: AdvisoryHumanApproval;
}

type ScopeBinding = readonly [accountId: string, agentId: string, workspaceId: string | null, dataOwnerId: string];
type ActionBinding = readonly [
  id: string, revision: string, targetRevision: string | null, payloadRevision: string | null,
  command: AgentCommand, actionClass: AgentActionClass, sourceNamespace: string | null,
];
type ApprovalBinding = readonly [
  id: string, revision: string, reviewerId: string, status: AgentApproval['status'], expiresAt: number,
];
export type AdvisoryAuthorization =
  | { readonly decision: 'allow' }
  | { readonly decision: 'deny'; readonly reason: AgentAuthorizationDenyReason };

export interface AdvisoryActionReceipt {
  readonly version: 1;
  readonly kind: 'advisory-action-evaluation';
  readonly executionOutcome: 'unknown';
  readonly scope: ScopeBinding;
  readonly action: ActionBinding;
  readonly approval: ApprovalBinding | null;
  readonly retryIdentity: string;
  /** UTC epoch milliseconds supplied by the host. */
  readonly evaluatedAt: number;
  readonly authorization: AdvisoryAuthorization;
}

type RejectionReason = 'invalid_request' | 'invalid_context' | 'invalid_action_binding' | 'action_unavailable'
  | 'unknown_action' | 'principal_mismatch' | 'workspace_mismatch' | 'invalid_approval_binding'
  | 'approval_mismatch' | 'malformed_receipt';
type ConflictReason = 'action_id_changed' | 'action_revision_changed' | 'scope_changed' | 'action_binding_changed'
  | 'approval_changed' | 'stale_evaluation' | 'authorization_changed';

export type AdvisoryActionReceiptResult =
  | { readonly status: 'evaluated' | 'retry'; readonly receipt: AdvisoryActionReceipt }
  | { readonly status: 'rejected'; readonly reason: RejectionReason }
  | { readonly status: 'conflict'; readonly reason: ConflictReason };

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

function revision(value: unknown): value is string | null {
  return value === null || identifier(value);
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
}

function expiration(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return timestamp(parsed) ? parsed : null;
}

function approvalStatus(value: unknown): value is AgentApproval['status'] {
  return value === 'approved' || value === 'revoked' || value === 'consumed';
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: readonly string[]) {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

function validScope(value: unknown): value is ScopeBinding {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const [account, agent, workspace, owner] = value;
  return identifier(account) && identifier(agent) && revision(workspace) && identifier(owner)
    && (workspace === null) === (account === owner);
}

function validAction(value: unknown): value is ActionBinding {
  if (!Array.isArray(value) || value.length !== 7) return false;
  const [id, version, target, payload, command, actionClass, namespace] = value;
  const registeredClass = classifyAgentCommand(command);
  return identifier(id) && identifier(version) && revision(target) && revision(payload)
    && registeredClass !== null && registeredClass === actionClass && revision(namespace)
    && (registeredClass === 'read' || payload !== null)
    && (registeredClass !== 'consequential_action' || target !== null);
}

function validApproval(value: unknown): value is ApprovalBinding {
  if (!Array.isArray(value) || value.length !== 5) return false;
  const [id, version, reviewer, status, expiresAt] = value;
  return identifier(id) && identifier(version) && identifier(reviewer) && approvalStatus(status)
    && timestamp(expiresAt);
}

function validAuthorization(value: unknown): value is AdvisoryAuthorization {
  if (!record(value)) return false;
  return (value.decision === 'allow' && keys(value, ['decision']))
    || (value.decision === 'deny' && keys(value, ['decision', 'reason']) && isAgentAuthorizationDenyReason(value.reason));
}

function retryKey(scope: ScopeBinding, action: ActionBinding, approval: ApprovalBinding | null) {
  return JSON.stringify([1, [...scope], [...action], approval && [...approval]]);
}

function sameBinding(left: readonly unknown[], right: readonly unknown[]) {
  return left.length === right.length && right.every((value, index) => left[index] === value);
}

export function isAdvisoryActionReceipt(value: unknown): value is AdvisoryActionReceipt {
  if (!record(value) || !keys(value, ['version', 'kind', 'executionOutcome', 'scope', 'action', 'approval',
    'retryIdentity', 'evaluatedAt', 'authorization'])) return false;
  const approval = validApproval(value.approval) ? value.approval : null;
  return value.version === 1 && value.kind === 'advisory-action-evaluation' && value.executionOutcome === 'unknown'
    && validScope(value.scope) && validAction(value.action)
    && (value.approval === null || (value.action[5] === 'consequential_action' && approval !== null))
    && timestamp(value.evaluatedAt) && validAuthorization(value.authorization)
    && value.retryIdentity === retryKey(value.scope, value.action, approval);
}

function rejection(reason: RejectionReason) {
  return { status: 'rejected', reason } as const;
}

function conflict(reason: ConflictReason) {
  return { status: 'conflict', reason } as const;
}

/** Supply prior history from the trusted host. History is compared, never used to authorize. */
export function evaluateAdvisoryActionReceipt(
  reference: unknown, context: AdvisoryActionContext, previous?: unknown,
): AdvisoryActionReceiptResult {
  if (!isActionReference(reference)) return rejection('invalid_request');
  const { principal, workspace, action, now } = context;
  const scope: ScopeBinding = [principal.accountId, principal.agentId, workspace.workspaceId, workspace.dataOwnerId];
  if (!timestamp(now) || !validScope(scope)) return rejection('invalid_context');
  if (!action || action.identity.id !== reference.id) return rejection('action_unavailable');
  if (!samePrincipal(principal, action.principal)) return rejection('principal_mismatch');
  if (!sameWorkspace(workspace, action.workspace)) return rejection('workspace_mismatch');
  if (action.identity.revision !== reference.revision) return conflict('action_revision_changed');

  const actionClass = classifyAgentCommand(action.command);
  if (!actionClass) return rejection('unknown_action');
  const actionBinding: ActionBinding = [action.identity.id, action.identity.revision, action.targetRevision,
    action.payloadRevision, action.command, actionClass, action.sourceNamespace ?? null];
  if (!validAction(actionBinding)) return rejection('invalid_action_binding');

  const prior = isAdvisoryActionReceipt(previous) ? previous : null;
  if (previous !== undefined && !prior) return rejection('malformed_receipt');
  if (prior) {
    if (!sameBinding(prior.scope, scope)) return conflict('scope_changed');
    if (prior.action[0] !== actionBinding[0]) return conflict('action_id_changed');
    if (prior.action[1] !== actionBinding[1]) return conflict('action_revision_changed');
    if (!sameBinding(prior.action, actionBinding)) return conflict('action_binding_changed');
  }

  if (actionClass === 'observation_intake' && context.grant?.status === 'active'
    && expiration(context.grant.authority?.expiresAt) === null) return rejection('invalid_context');

  let approvalBinding: ApprovalBinding | null = null;
  if (actionClass === 'consequential_action' && context.approval !== undefined) {
    const approval = context.approval;
    if (!approval || !isActionReference(approval.identity) || approval.reviewedBy?.kind !== 'human'
      || !approval.action?.identity || !approval.action.principal
      || !approval.action.workspace) return rejection('invalid_approval_binding');

    const expiresAt = expiration(approval.expiresAt);
    if (expiresAt === null) return rejection('invalid_approval_binding');
    approvalBinding = [approval.identity.id, approval.identity.revision, approval.reviewedBy.accountId,
      approval.status, expiresAt];
    if (!validApproval(approvalBinding)) return rejection('invalid_approval_binding');
    if (!sameAction(action, approval.action) || action.targetRevision !== approval.action.targetRevision
      || action.payloadRevision !== approval.action.payloadRevision) return rejection('approval_mismatch');
  }

  const decision = evaluateAgentAuthorization(reference, context);
  const authorization: AdvisoryAuthorization = decision.decision === 'allow' ? { decision: 'allow' }
    : { decision: 'deny', reason: decision.reason };
  const receipt: AdvisoryActionReceipt = {
    version: 1, kind: 'advisory-action-evaluation', executionOutcome: 'unknown',
    scope, action: actionBinding, approval: approvalBinding, retryIdentity: retryKey(scope, actionBinding, approvalBinding),
    evaluatedAt: now, authorization,
  };
  if (!prior) return { status: 'evaluated', receipt };
  if (approvalBinding ? !prior.approval || !sameBinding(prior.approval, approvalBinding) : prior.approval !== null) {
    return conflict('approval_changed');
  }
  if (prior.evaluatedAt > now) return conflict('stale_evaluation');
  if (prior.authorization.decision !== authorization.decision
    || (prior.authorization.decision === 'deny' && authorization.decision === 'deny'
      && prior.authorization.reason !== authorization.reason)) return conflict('authorization_changed');
  return { status: 'retry', receipt };
}
