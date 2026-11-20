/** These records come from the authenticated host. Only the action reference is request data. */
export interface AgentPrincipal {
  readonly accountId: string;
  readonly agentId: string;
}

export interface AgentWorkspaceScope {
  readonly workspaceId: string | null;
  readonly dataOwnerId: string;
}

const actionClasses = {
  'list-commitments': 'read',
  'list-commitment-recommendations': 'read',
  'receive-observation': 'observation_intake',
  'create-plan-item': 'internal_modification',
  'accept-evidence': 'consequential_action',
} as const;
export type AgentCommand = keyof typeof actionClasses;
export type AgentActionClass = (typeof actionClasses)[AgentCommand];

export function classifyAgentCommand(command: unknown): AgentActionClass | null {
  return typeof command === 'string' && Object.hasOwn(actionClasses, command) ? actionClasses[command as AgentCommand] : null;
}

export interface AgentActionIdentity {
  readonly id: string;
  /** The host changes this revision whenever the command, target or payload changes. */
  readonly revision: string;
}

export interface AgentAction {
  readonly identity: AgentActionIdentity;
  readonly principal: AgentPrincipal;
  readonly workspace: AgentWorkspaceScope;
  readonly command: AgentCommand;
  /** Derived by the host from the original source envelope. */
  readonly sourceNamespace?: string;
}

export interface AgentReceiptAuthority {
  expiresAt: string;
  namespaces: string[];
  maxReceipts: number;
}

export function checkReceiptAuthority(authority: AgentReceiptAuthority, namespace: string, now: number) {
  const expiresAt = Date.parse(authority.expiresAt);
  if (!Number.isFinite(expiresAt) || now >= expiresAt) return 'grant_expired';
  if (!Array.isArray(authority.namespaces) || !authority.namespaces.includes(namespace)) return 'namespace_denied';
  return 'active';
}

export interface AgentReceiptGrant {
  readonly principal: AgentPrincipal;
  readonly workspace: AgentWorkspaceScope;
  readonly status: 'active' | 'revoked';
  readonly authority: AgentReceiptAuthority;
}

/** A snapshot resolved from a trusted human review channel by a future caller. */
export interface AgentApproval {
  readonly action: AgentAction;
  readonly reviewedBy: { readonly kind: 'human'; readonly accountId: string };
  readonly status: 'approved' | 'revoked' | 'consumed';
  readonly expiresAt: string;
}

export interface AgentAuthorizationContext {
  readonly principal: AgentPrincipal;
  readonly workspace: AgentWorkspaceScope;
  readonly action: AgentAction | null;
  readonly grant?: AgentReceiptGrant;
  readonly approval?: AgentApproval;
  readonly now: number;
}

const denyReasons = ['invalid_request', 'invalid_context', 'action_unavailable', 'unknown_action',
  'workspace_mismatch', 'principal_mismatch', 'grant_required', 'grant_scope_mismatch',
  'grant_revoked', 'grant_expired', 'namespace_denied', 'approval_required',
  'approval_mismatch', 'approval_inactive', 'approval_expired', 'action_disabled'] as const;
export type AgentAuthorizationDenyReason = (typeof denyReasons)[number];

export function isAgentAuthorizationDenyReason(value: unknown): value is AgentAuthorizationDenyReason {
  return typeof value === 'string' && denyReasons.some(reason => reason === value);
}

export function samePrincipal(left: AgentPrincipal, right: AgentPrincipal) {
  return left.accountId === right.accountId && left.agentId === right.agentId;
}

export function sameWorkspace(left: AgentWorkspaceScope, right: AgentWorkspaceScope) {
  return left.workspaceId === right.workspaceId && left.dataOwnerId === right.dataOwnerId;
}

export function isActionReference(input: unknown): input is AgentActionIdentity {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const keys = Object.keys(input);
  const candidate = input as Partial<AgentActionIdentity>;
  return keys.length === 2 && keys.includes('id') && keys.includes('revision')
    && typeof candidate.id === 'string' && candidate.id.length > 0 && candidate.id.length <= 200
    && typeof candidate.revision === 'string' && candidate.revision.length > 0 && candidate.revision.length <= 200;
}

export function sameAction(left: AgentAction, right: AgentAction) {
  return left.identity.id === right.identity.id && left.identity.revision === right.identity.revision
    && left.command === right.command && left.sourceNamespace === right.sourceNamespace
    && samePrincipal(left.principal, right.principal) && sameWorkspace(left.workspace, right.workspace);
}

/**
 * An advisory decision over trusted snapshots. A caller must resolve fresh state and enforce
 * resource permissions and atomic replay protection at dispatch. This module dispatches nothing.
 */
export function evaluateAgentAuthorization(reference: unknown, context: AgentAuthorizationContext) {
  const { action, principal, workspace, now, grant, approval } = context;
  const actionClass = classifyAgentCommand(action?.command);
  const audit = {
    version: 1 as const,
    accountId: principal.accountId,
    agentId: principal.agentId,
    workspaceId: workspace.workspaceId,
    dataOwnerId: workspace.dataOwnerId,
    actionId: action?.identity.id ?? null,
    actionRevision: action?.identity.revision ?? null,
    actionClass,
    evaluatedAt: Number.isSafeInteger(now) && now >= 0 ? now : null,
  };
  const deny = (reason: AgentAuthorizationDenyReason) => ({ decision: 'deny', reason, audit } as const);
  const allow = () => ({ decision: 'allow', audit } as const);

  if (!isActionReference(reference)) return deny('invalid_request');
  if (audit.evaluatedAt === null || !principal.accountId || !principal.agentId || !workspace.dataOwnerId
    || workspace.workspaceId === ''
    || (workspace.workspaceId === null) !== (workspace.dataOwnerId === principal.accountId)) return deny('invalid_context');
  if (!action || reference.id !== action.identity.id || reference.revision !== action.identity.revision) return deny('action_unavailable');
  if (!samePrincipal(principal, action.principal)) return deny('principal_mismatch');
  if (!sameWorkspace(workspace, action.workspace)) return deny('workspace_mismatch');

  switch (actionClass) {
    case 'read':
      return allow();
    case 'observation_intake': {
      if (!grant) return deny('grant_required');
      if (!samePrincipal(principal, grant.principal) || !sameWorkspace(workspace, grant.workspace)) return deny('grant_scope_mismatch');
      if (grant.status !== 'active') return deny('grant_revoked');
      if (!action.sourceNamespace) return deny('namespace_denied');
      const status = checkReceiptAuthority(grant.authority, action.sourceNamespace, now);
      return status === 'active' ? allow() : deny(status);
    }
    case 'consequential_action': {
      if (!approval) return deny('approval_required');
      if (!sameAction(action, approval.action)) return deny('approval_mismatch');
      if (approval.status !== 'approved' || approval.reviewedBy?.kind !== 'human' || !approval.reviewedBy.accountId) return deny('approval_inactive');
      const expiresAt = Date.parse(approval.expiresAt);
      if (!Number.isFinite(expiresAt) || now >= expiresAt) return deny('approval_expired');
      return deny('action_disabled');
    }
    case 'internal_modification':
      return deny('action_disabled');
    default:
      return deny('unknown_action');
  }
}
