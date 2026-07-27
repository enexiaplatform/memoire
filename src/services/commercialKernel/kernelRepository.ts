import { supabaseClient } from '../../lib/supabaseClient.ts';
import { reportClientOperationalEvent } from '../clientTelemetry.ts';
import { reportWorkspaceSyncError } from '../workspaceSyncStatus.ts';
import { invalidateWorkspaceDataCache } from '../workspaceDataCache.ts';

export type KernelTable =
  | 'commercial_threads'
  | 'commercial_commitments'
  | 'commercial_events'
  | 'commercial_value_outcomes';

export type KernelRecord = {
  id: string;
  userId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isSample?: boolean;
  sourceType?: string;
};

/**
 * Shared local-first repository for the Commercial Kernel tables.
 *
 * Local-first because the workspace already is: a seller with no connection, or
 * with Supabase unconfigured, still has to be able to record a promise. Cloud
 * writes are fire-and-forget and report a sync failure rather than throwing
 * into a save handler, so a network problem never loses the record the user
 * just typed - it stays in localStorage and re-syncs on the next load.
 *
 * Unlike the JSON-collection store, these tables are relational: rows are
 * mapped column-by-column through each table's own codec, so Postgres can
 * answer "what is overdue" and "which threads are silent" with an index
 * instead of a scan.
 *
 * Sample and demo records never leave the browser. That rule lives here rather
 * than in each store, so a new kernel table cannot forget it.
 */
export type KernelCodec<T extends KernelRecord> = {
  table: KernelTable;
  storageKey: string;
  updatedEvent: string;
  toRow: (record: T, userId: string) => Record<string, unknown>;
  fromRow: (row: Record<string, unknown>) => T | null;
  sanitize: (value: unknown) => T | null;
  /** Newest-first ordering column for cloud reads. */
  orderColumn: string;
  /** In-memory sort so local and cloud agree on order. */
  compare: (left: T, right: T) => number;
};

export function isSyncableRecord(record: KernelRecord) {
  return record.isSample !== true;
}

// ------------------------------------------------------------------ local

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function readLocal<T extends KernelRecord>(codec: KernelCodec<T>): T[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(codec.storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(codec.sanitize)
      .filter((record): record is T => Boolean(record))
      .sort(codec.compare);
  } catch {
    // A corrupted local store must never take the app down. The cloud copy is
    // authoritative for a signed-in user; a local-only user loses nothing that
    // was not already unreadable.
    return [];
  }
}

/**
 * Writes the store, and announces it **only when something actually changed**.
 *
 * The guard is not an optimisation. Every load path ends in a write: a
 * cloud/local merge finishes by persisting the merged result, which is usually
 * byte-for-byte what was already there. Announcing that as a change made the
 * app eat itself - a surface listening for the update refetched the workspace,
 * the refetch merged and wrote again, and the cycle ran forever, flickering the
 * sync pill and firing an upsert at Supabase on every pass.
 *
 * A write that changes nothing is not a change, so it emits no event and does
 * not invalidate the workspace cache.
 */
export function writeLocal<T extends KernelRecord>(codec: KernelCodec<T>, records: T[]): T[] {
  const sanitized = records
    .map(codec.sanitize)
    .filter((record): record is T => Boolean(record))
    .sort(codec.compare);

  if (!canUseStorage()) return sanitized;

  const serialized = JSON.stringify(sanitized);
  if (window.localStorage.getItem(codec.storageKey) === serialized) return sanitized;

  window.localStorage.setItem(codec.storageKey, serialized);
  invalidateWorkspaceDataCache();
  window.dispatchEvent(new CustomEvent(codec.updatedEvent, { detail: sanitized }));

  return sanitized;
}

// ------------------------------------------------------------------ cloud

export async function loadCloudRecords<T extends KernelRecord>(
  codec: KernelCodec<T>,
  userId: string,
): Promise<T[]> {
  if (!supabaseClient) return [];

  const { data, error } = await supabaseClient
    .from(codec.table)
    .select('*')
    .eq('user_id', userId)
    .order(codec.orderColumn, { ascending: false });

  if (error) throw new Error(error.message);

  return ((data || []) as Record<string, unknown>[])
    .map(codec.fromRow)
    .filter((record): record is T => Boolean(record));
}

export async function upsertCloudRecords<T extends KernelRecord>(
  codec: KernelCodec<T>,
  userId: string,
  records: T[],
) {
  if (!supabaseClient) return;
  const rows = records.filter(isSyncableRecord).map((record) => codec.toRow(record, userId));
  if (rows.length === 0) return;

  const { error } = await supabaseClient
    .from(codec.table)
    .upsert(rows, { onConflict: 'user_id,id' });

  if (error) throw new Error(error.message);
}

export async function deleteCloudRecord(codec: KernelCodec<never>, userId: string, recordId: string) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient
    .from(codec.table)
    .delete()
    .eq('user_id', userId)
    .eq('id', recordId);
  if (error) throw new Error(error.message);
}

/**
 * Loads the union of local and cloud, newest wins, then writes the merged set
 * back to both. This is what makes a record typed on a phone show up on a
 * laptop without either copy silently winning.
 */
export async function loadMergedForUser<T extends KernelRecord>(
  codec: KernelCodec<T>,
  userId: string,
): Promise<T[]> {
  const local = readLocal(codec);
  const cloud = await loadCloudRecords(codec, userId);

  const merged = new Map<string, T>();
  for (const record of [...cloud, ...local]) {
    const existing = merged.get(record.id);
    if (!existing || updatedAt(record) >= updatedAt(existing)) merged.set(record.id, record);
  }

  const result = Array.from(merged.values()).sort(codec.compare);
  writeLocal(codec, result);
  await upsertCloudRecords(codec, userId, result);
  return result;
}

/**
 * The read every surface uses. A sample-data workspace never touches the cloud;
 * a cloud failure falls back to the local copy rather than showing an empty
 * workspace, which would look exactly like data loss.
 */
export async function loadForWorkspace<T extends KernelRecord>(
  codec: KernelCodec<T>,
  userId?: string | null,
  sampleDataActive = false,
): Promise<T[]> {
  if (!userId || sampleDataActive) return readLocal(codec);
  try {
    return await loadMergedForUser(codec, userId);
  } catch (error) {
    reportWorkspaceSyncError();
    reportKernelSyncFailure(codec.table, 'load', error);
    return readLocal(codec);
  }
}

export function syncRecordsForCurrentUser<T extends KernelRecord>(codec: KernelCodec<T>, records: T[]) {
  void currentUserId()
    .then((userId) => (userId ? upsertCloudRecords(codec, userId, records) : undefined))
    .catch((error) => {
      reportWorkspaceSyncError();
      reportKernelSyncFailure(codec.table, 'upsert', error);
    });
}

export function deleteRecordForCurrentUser<T extends KernelRecord>(codec: KernelCodec<T>, recordId: string) {
  void currentUserId()
    .then((userId) => (userId ? deleteCloudRecord(codec as unknown as KernelCodec<never>, userId, recordId) : undefined))
    .catch((error) => {
      reportWorkspaceSyncError();
      reportKernelSyncFailure(codec.table, 'delete', error);
    });
}

async function currentUserId() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) throw new Error(error.message);
  return data.user?.id || null;
}

function updatedAt(record: KernelRecord) {
  return record.updatedAt || record.createdAt || '';
}

function reportKernelSyncFailure(table: KernelTable, operation: 'load' | 'upsert' | 'delete', error: unknown) {
  reportClientOperationalEvent({
    eventName: 'cloud_json_sync_failed',
    component: 'commercialKernelRepository',
    operation,
    table,
    severity: 'error',
    error,
  });
}

// ------------------------------------------------------------- row helpers

export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function isoOrNow(value: unknown): string {
  return typeof value === 'string' && value ? value : new Date().toISOString();
}

export function kernelId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
