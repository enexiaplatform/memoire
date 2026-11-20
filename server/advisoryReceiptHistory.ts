import { createClient } from '@supabase/supabase-js';
import { getBearerToken, verifyUserToken } from '../api/_auth.js';
import { getSupabaseAnonKey, getSupabaseUrl } from '../api/_env.js';
import { DATA_WORKSPACE_HEADER, resolveWorkspaceServerScope, workspaceDataHeaders } from '../api/_workspaceScope.js';
import { isActionReference, sameWorkspace, type AgentPrincipal, type AgentWorkspaceScope } from '../packages/memoire-sdk/src/agent-authorization.js';
import {
  evaluateAdvisoryActionReceipt, isAdvisoryActionReceipt,
  type AdvisoryActionContext, type AdvisoryActionReceiptResult,
} from '../packages/memoire-sdk/src/agent-action-receipt.js';

type RequestHeaders = Record<string, string | string[] | undefined>;
export type AdvisoryHistoryKey = Readonly<AgentPrincipal & AgentWorkspaceScope & { actionId: string }>;
type CurrentAction = Pick<AdvisoryActionContext, 'action' | 'approval' | 'grant'>;

export interface AdvisoryHistoryRow {
  /** Actual partition key of the stored row. The adapter must not copy this from the query. */
  readonly key: AdvisoryHistoryKey;
  readonly receipt: unknown;
}

export interface AdvisoryHistoryRepository {
  /** Read by the full authorized key, including action ID across revisions. Null means no row. */
  readLatest(key: AdvisoryHistoryKey): Promise<AdvisoryHistoryRow | null>;
}

export type TrustedAdvisoryHistoryResult =
  | { readonly status: 'resolved'; readonly history: 'found' | 'missing' | 'stale' | 'not_used'; readonly evaluation: AdvisoryActionReceiptResult }
  | { readonly status: 'invalid_request' | 'scope_unavailable' | 'context_unavailable' | 'history_unavailable' | 'history_corrupted' };

function dataClient(token: string, workspaceId?: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + token, ...workspaceDataHeaders(workspaceId) } },
  });
}

export interface TrustedAdvisoryHistoryOptions {
  /** Provisioned by the server for an account and configured agent, never populated from a request. */
  readonly principal: AgentPrincipal;
  readonly repository: AdvisoryHistoryRepository;
  readonly loadCurrentAction: (key: AdvisoryHistoryKey) => Promise<CurrentAction>;
  readonly verify?: typeof verifyUserToken;
  readonly clientForToken?: typeof dataClient;
  readonly now?: () => number;
}

function inPartition(row: AdvisoryHistoryKey, key: AdvisoryHistoryKey) {
  return row.accountId === key.accountId && row.agentId === key.agentId
    && row.actionId === key.actionId && sameWorkspace(row, key);
}

/** Detect readable foreign bindings before reporting corruption in a returned row. */
function hasForeignReceiptBinding(value: unknown, key: AdvisoryHistoryKey) {
  if (!value || typeof value !== 'object') return false;
  const { scope, action } = value as { scope?: unknown; action?: unknown };
  return (Array.isArray(scope) && scope.length === 4
      && (scope[0] !== key.accountId || scope[1] !== key.agentId || scope[2] !== key.workspaceId || scope[3] !== key.dataOwnerId))
    || (Array.isArray(action) && typeof action[0] === 'string' && action[0] !== key.actionId);
}

/** Server-only read boundary. No route, cache, persistence or dispatch is installed. */
export function createTrustedAdvisoryHistoryResolver({
  principal: configured, repository, loadCurrentAction, verify = verifyUserToken,
  clientForToken = dataClient, now = Date.now,
}: TrustedAdvisoryHistoryOptions) {
  const principal = Object.freeze({ accountId: configured.accountId, agentId: configured.agentId });
  if (![principal.accountId, principal.agentId].every(id => typeof id === 'string' && id.trim().length > 0 && id.length <= 200)) {
    throw new TypeError('A configured advisory account and agent are required.');
  }

  return async function resolve(headers: RequestHeaders, input: unknown): Promise<TrustedAdvisoryHistoryResult> {
    if (!isActionReference(input) || !input.id.trim() || !input.revision.trim()) return { status: 'invalid_request' };
    const reference = Object.freeze({ id: input.id, revision: input.revision });
    const token = getBearerToken(headers);
    // Bind this attempt to the original request while Auth and the repository are pending.
    const selector = headers?.[DATA_WORKSPACE_HEADER];
    const nativeHeaders = { [DATA_WORKSPACE_HEADER]: selector, 'x-memoire-workspace': headers?.['x-memoire-workspace'] };

    async function authorizedScope(): Promise<AgentWorkspaceScope | null> {
      if (!token) return null;
      try {
        const verified = await verify(token, principal.accountId);
        if (verified?.id !== principal.accountId) return null;
        const scope = await resolveWorkspaceServerScope(nativeHeaders, token, principal.accountId, clientForToken);
        if (!scope) return null;
        return { workspaceId: typeof selector === 'string' ? selector.toLowerCase() : null, dataOwnerId: scope.ownerId };
      } catch {
        return null;
      }
    }

    const workspace = await authorizedScope();
    if (!workspace) return { status: 'scope_unavailable' };
    const key: AdvisoryHistoryKey = Object.freeze({ ...principal, ...workspace, actionId: reference.id });

    // Load current policy inputs after the history read so history latency cannot age the policy snapshot.
    const history = await Promise.resolve().then(() => repository.readLatest(key)).then(row => ({ row }), () => null);
    const current = await Promise.resolve().then(() => loadCurrentAction(key)).catch(() => null);
    const latestScope = await authorizedScope();
    if (!latestScope || !sameWorkspace(latestScope, workspace)) return { status: 'scope_unavailable' };
    if (!current) return { status: 'context_unavailable' };

    const { action, grant, approval } = current;
    const context: AdvisoryActionContext = { principal, workspace, action, grant, approval, now: now() };
    const fresh = evaluateAdvisoryActionReceipt(reference, context);
    if (fresh.status !== 'evaluated') return { status: 'resolved', history: 'not_used', evaluation: fresh };
    if (!history) return { status: 'history_unavailable' };

    const { row } = history;
    if (row === null || (row?.key && (!inPartition(row.key, key) || hasForeignReceiptBinding(row.receipt, key)))) {
      return { status: 'resolved', history: 'missing', evaluation: fresh };
    }
    if (!row?.key) return { status: 'history_unavailable' };
    if (!isAdvisoryActionReceipt(row.receipt)) return { status: 'history_corrupted' };

    const evaluation = evaluateAdvisoryActionReceipt(reference, context, row.receipt);
    return { status: 'resolved', history: evaluation.status === 'conflict' ? 'stale' : 'found', evaluation };
  };
}
