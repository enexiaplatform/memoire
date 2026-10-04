import { supabaseClient } from '../lib/supabaseClient.ts';
import { getLocalWorkspaceOwner } from './localWorkspaceOwner.ts';
import { isRestoreInProgress } from './restoreJournal.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';
import { invalidateWorkspaceCollection } from './workspaceDataCache.ts';
import { applyReceivableChanges, commitReceivableChanges, type ReceivableCloudAdapter, type ReceivableCloudRow } from '../utils/receivableChanges.ts';
import type { OrderReceivableRecord } from '../utils/receivables.ts';

export const RECEIVABLES_SYNCED_EVENT = 'memoire:receivables-synced';
export type ReceivableLocalIO = { load(): OrderReceivableRecord[]; save(records: OrderReceivableRecord[]): void };
const flights = new Map<string, Promise<void>>();

export function makeReceivableCloudAdapter(userId: string): ReceivableCloudAdapter {
  const client = supabaseClient;
  if (!client) throw new Error('The account connection is unavailable.');
  return {
    async read(id) {
      const { data, error } = await client.from('order_receivables').select('payload,updated_at')
        .eq('user_id', userId).eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { payload: data.payload as OrderReceivableRecord, updatedAt: data.updated_at as string } : null;
    },
    async compareAndSet(id, expected: ReceivableCloudRow | null, next) {
      if (getLocalWorkspaceOwner() !== userId || isRestoreInProgress()) throw new Error('The workspace changed. Pending collection changes have been retained.');
      const row = { user_id: userId, id, payload: next, created_at: next.createdAt, updated_at: next.updatedAt };
      if (!expected) {
        const { error } = await client.from('order_receivables').insert(row);
        if (error?.code === '23505') return false;
        if (error) throw new Error(error.message);
        return true;
      }
      let request = client.from('order_receivables').update(row).eq('user_id', userId).eq('id', id)
        .eq('updated_at', expected.updatedAt);
      // The UUID token prevents two writes in the same millisecond sharing a
      // version. Matching both fields also detects edits by older clients.
      request = expected.payload.syncVersion
        ? request.eq('payload->>syncVersion', expected.payload.syncVersion)
        : request.is('payload->>syncVersion', null);
      const { data, error } = await request.select('id');
      if (error) throw new Error(error.message);
      return data?.length === 1;
    },
  };
}

function notify() {
  invalidateWorkspaceCollection('orderReceivables');
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent(RECEIVABLES_SYNCED_EVENT));
}

/** One flight per owner/order; new commands remain durable while a request is in flight. */
export async function flushPendingReceivables(userId: string, io: ReceivableLocalIO): Promise<void> {
  if (!supabaseClient || getLocalWorkspaceOwner() !== userId || isRestoreInProgress()) return;
  const records = io.load().filter(record => record.pendingChanges?.length && record.source !== 'demo' && !record.isSample);
  await Promise.all(records.map(record => {
    const key = `${userId}:${record.id}`;
    const existing = flights.get(key);
    if (existing) return existing.then(() => {
      const next = io.load().find(value => value.id === record.id);
      if (next?.pendingChanges?.length && !next.syncError) return flushPendingReceivables(userId, io);
    });
    const flight = (async () => {
      while (getLocalWorkspaceOwner() === userId && !isRestoreInProgress()) {
        const local = io.load().find(value => value.id === record.id);
        if (!local?.pendingChanges?.length) return;
        try {
          const acknowledged = await commitReceivableChanges(makeReceivableCloudAdapter(userId), local);
          if (getLocalWorkspaceOwner() !== userId || isRestoreInProgress()) return;
          const current = io.load();
          const latest = current.find(value => value.id === local.id);
          if (!latest) return;
          const sent = new Set(local.pendingChanges.map(change => change.id));
          if (!latest.pendingChanges?.some(change => sent.has(change.id))) return;
          const remaining = latest.pendingChanges.filter(change => !sent.has(change.id));
          // Preserve any commands appended while the server was answering.
          const next = remaining.length ? { ...applyReceivableChanges(acknowledged, { ...latest, pendingChanges: remaining, syncBase: acknowledged }), pendingChanges: remaining, syncBase: acknowledged, syncError: undefined }
            : acknowledged;
          io.save(current.map(value => value.id === next.id ? next : value));
          notify();
        } catch (error) {
          if (getLocalWorkspaceOwner() === userId && !isRestoreInProgress()) {
            const message = error instanceof Error ? error.message : 'The payment could not sync. Your pending changes are retained.';
            io.save(io.load().map(value => value.id === record.id ? { ...value, syncError: message } : value));
            notify();
          }
          reportWorkspaceSyncError();
          return;
        }
      }
    })().finally(() => flights.delete(key));
    flights.set(key, flight);
    return flight;
  }));
}

export function triggerReceivableSync(io: ReceivableLocalIO) {
  if (!supabaseClient || isRestoreInProgress()) return;
  void supabaseClient.auth.getUser().then(({ data, error }) => {
    if (error) throw new Error(error.message);
    if (data.user) return flushPendingReceivables(data.user.id, io);
  }).catch(() => reportWorkspaceSyncError());
}
