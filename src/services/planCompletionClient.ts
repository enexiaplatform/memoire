import { supabaseAccountClient } from '../lib/supabaseClient.ts';
import { trackProductEvent } from '../utils/productAnalytics.ts';
import { getActiveWorkspaceScope, NATIVE_WORKSPACE_HEADER } from './activeWorkspaceScope.ts';
import { guardLocalWorkspaceScope } from './localWorkspaceOwner.ts';
import { resolveWorkspaceStorage } from './workspaceBrowserStorage.ts';
import { loadPlanItems, savePlanItem } from './planItemStore.ts';
import { flushPendingSalesActivities, listPendingSalesActivities } from './salesActivityStore.ts';
import type { PlanItem, PlanRecord } from '../utils/weeklyPlan.ts';

const prefix = 'memoire.plan-completion.v1.';
export const PLAN_COMPLETION_CHANGED = 'memoire:plan-completion-changed';

type Command = {
  requestId: string;
  activityId: string;
  planId: string;
  derivedKey: string | null;
  expectedUpdatedAt: string | null;
  label: string | null;
  tag: string | null;
};
type Outcome = { status: 'pending' | 'conflict' } | { status: 'confirmed'; record: PlanRecord; transitioned: boolean };
const inFlight = new Map<string, Promise<Outcome>>();
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const nullableCommandFields = ['derivedKey', 'expectedUpdatedAt', 'label', 'tag'] as const;

function isStoredCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 7) return false;
  const command = value as Record<string, unknown>;
  return typeof command.requestId === 'string' && uuid.test(command.requestId)
    && typeof command.activityId === 'string' && uuid.test(command.activityId)
    && typeof command.planId === 'string' && command.planId.length > 0
    && nullableCommandFields.every(field => command[field] === null || typeof command[field] === 'string');
}

function scopeFor(ownerId: string) {
  const assertCurrent = guardLocalWorkspaceScope(ownerId);
  const active = getActiveWorkspaceScope();
  if (active && active.dataOwnerId !== ownerId) throw new Error('Workspace has changed.');
  const login = active?.ownerId ?? ownerId;
  const workspace = active?.workspaceId ?? 'default';
  const storage = resolveWorkspaceStorage(active ?? undefined);
  if (!storage) throw new Error('Storage is unavailable.');
  return { assertCurrent, storage, login, workspace, prefix: prefix + login + '.' };
}

function notify(outcome?: Outcome) {
  window.dispatchEvent(new CustomEvent(PLAN_COMPLETION_CHANGED, { detail: outcome }));
}

function readPendingJournal(scope: ReturnType<typeof scopeFor>) {
  const commands: Command[] = [];
  let unreadable = 0;
  for (let index = 0; index < scope.storage.length; index++) {
    const key = scope.storage.key(index);
    if (!key?.startsWith(scope.prefix)) continue;
    const raw = scope.storage.getItem(key);
    if (raw === null) continue;
    try {
      const command: unknown = JSON.parse(raw);
      if (isStoredCommand(command) && key === scope.prefix + command.requestId) {
        commands.push(command);
        continue;
      }
    } catch {
      // Preserve the unreadable entry and continue scanning this workspace.
    }
    unreadable++;
  }
  return { commands, unreadable };
}

export function getPlanCompletionJournalStatus(ownerId: string) {
  const { commands, unreadable } = readPendingJournal(scopeFor(ownerId));
  return { pending: commands.length, unreadable };
}

async function send(ownerId: string, scope: ReturnType<typeof scopeFor>, command: Command): Promise<Outcome> {
  const key = scope.prefix + command.requestId;
  if (navigator.onLine === false) return { status: 'pending' };

  let receipt;
  try {
    if (listPendingSalesActivities().some(activity => activity.id === command.activityId)) {
      await flushPendingSalesActivities(ownerId);
      scope.assertCurrent();
      if (listPendingSalesActivities().some(activity => activity.id === command.activityId)) return { status: 'pending' };
    }
    const session = (await supabaseAccountClient?.auth.getSession())?.data.session;
    scope.assertCurrent();
    if (session?.user.id !== scope.login) return { status: 'pending' };
    const response = await fetch('/api/commercial?resource=plan-completion', {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        [NATIVE_WORKSPACE_HEADER]: scope.workspace,
      },
      body: JSON.stringify(command),
    });
    const body = await response.json();
    if (response.ok && body.status === 'confirmed' && typeof body.receiptId === 'string'
      && typeof body.committedAt === 'string' && typeof body.transitioned === 'boolean'
      && (body.record === null || (body.record?.id === command.planId && body.record.done === true
        && body.record.completionActivityId === command.activityId && body.record.completionRevision === body.receiptId))) {
      receipt = body;
    } else if ((response.status === 409 && ['conflict', 'activity_unavailable'].includes(body.status))
      || (response.status === 400 && body.status === 'invalid')) {
      receipt = { record: null };
    }
  } catch {
    scope.assertCurrent();
    return { status: 'pending' };
  }
  scope.assertCurrent();
  if (!receipt) return { status: 'pending' };

  if (!receipt.record) {
    scope.storage.removeItem(key);
    const outcome = { status: 'conflict' } as const;
    notify(outcome);
    return outcome;
  }
  const local = loadPlanItems().find(plan => plan.id === command.planId);
  if (local && local.updatedAt > receipt.record.updatedAt) {
    scope.storage.removeItem(key);
    const outcome = { status: 'conflict' } as const;
    notify(outcome);
    return outcome;
  }
  const outcome = { status: 'confirmed', record: receipt.record as PlanRecord, transitioned: receipt.transitioned } as const;
  try {
    savePlanItem(outcome.record, { syncCloud: false });
    scope.storage.removeItem(key);
  } catch {
    // The committed receipt stays replayable if the local cache cannot be written.
  }
  if (outcome.transitioned) trackProductEvent('commitment_completed');
  notify(outcome);
  return outcome;
}

function dispatch(ownerId: string, scope: ReturnType<typeof scopeFor>, command: Command) {
  const flightKey = JSON.stringify([scope.login, scope.workspace, ownerId, command.requestId]);
  const busy = inFlight.get(flightKey);
  if (busy) return busy;
  const work = send(ownerId, scope, command).finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, work);
  return work;
}

export async function confirmExistingPlanActivity(
  ownerId: string, item: PlanItem, completion: PlanRecord, activityId: string, current?: PlanRecord,
) {
  const scope = scopeFor(ownerId);
  const queued = readPendingJournal(scope).commands.find(command => command.planId === completion.id);
  if (queued) return queued.activityId === activityId && queued.derivedKey === (item.derivedKey ?? null)
    ? dispatch(ownerId, scope, queued) : { status: 'conflict' } as const;

  const command: Command = {
    requestId: crypto.randomUUID(), activityId, planId: completion.id,
    derivedKey: item.derivedKey ?? null, expectedUpdatedAt: current?.updatedAt ?? null,
    label: current ? null : completion.label, tag: current ? null : completion.tag,
  };
  scope.storage.setItem(scope.prefix + command.requestId, JSON.stringify(command));
  notify();
  return dispatch(ownerId, scope, command);
}

export async function flushPendingPlanCompletions(ownerId: string) {
  const scope = scopeFor(ownerId);
  for (const command of readPendingJournal(scope).commands) {
    scope.assertCurrent();
    await dispatch(ownerId, scope, command);
  }
}
