import { supabaseClient } from '../../lib/supabaseClient.ts';
import { fetchAllRows } from '../supabasePaging.ts';
import { reportClientOperationalEvent } from '../clientTelemetry.ts';
import { reportWorkspaceSyncError } from '../workspaceSyncStatus.ts';
import { invalidateWorkspaceCollection } from '../workspaceDataCache.ts';
import { requireLocalWrite, writeLocalCollection } from '../localWriteGuard.ts';
import { commitLocalHistoricalCollection, historicalSources, type HistoricalSource } from '../historicalIntegrity.ts';
import { requireCloudHistoricalIntegrity } from '../historicalCloudGate.ts';

export type KernelTable =
  | 'commercial_threads'
  | 'commercial_commitments'
  | 'commercial_events'
  | 'commercial_value_outcomes'
  | 'commercial_evidence'
  | 'commercial_conditions'
  | 'commercial_outcome_requirements'
  | 'commercial_dependencies'
  | 'commercial_timing_assertions'
  | 'commercial_money_gates'
  | 'commercial_decisions'
  | 'commercial_policies'
  | 'commercial_incidents'
  | 'commercial_decision_observations';

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
  return record.isSample !== true && (record as KernelRecord & { source?: string }).source !== 'demo';
}

/**
 * Which workspace collection a kernel table feeds, so a write drops that one
 * rather than every cached table. `commercial_events` is not in the workspace at
 * all; naming it here keeps its writes from clearing anything that is.
 */
function workspaceCollectionForTable(table: KernelTable) {
  if (table === 'commercial_commitments') return 'commitments';
  if (table === 'commercial_threads') return 'threads';
  if (table === 'commercial_value_outcomes') return 'valueOutcomes';
  if (table === 'commercial_evidence') return 'evidence';
  if (table === 'commercial_conditions') return 'conditions';
  if (table === 'commercial_outcome_requirements') return 'requirements';
  if (table === 'commercial_dependencies') return 'dependencies';
  if (table === 'commercial_timing_assertions') return 'timing';
  if (table === 'commercial_money_gates') return 'moneyGates';
  if (table === 'commercial_decisions') return 'decisions';
  if (table === 'commercial_decision_observations') return 'decisionObservations';
  if (table === 'commercial_policies') return 'policies';
  if (table === 'commercial_incidents') return 'incidents';
  return 'commercialEvents';
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
export function writeLocal<T extends KernelRecord>(codec: KernelCodec<T>, records: T[], options: { requireDurable?: boolean } = { requireDurable: true }): T[] {
  const requireDurable = options.requireDurable !== false;
  const sanitized = records
    .map(codec.sanitize)
    .filter((record): record is T => Boolean(record))
    .sort(codec.compare);

  if (requireDurable) for (const record of sanitized) validateStoredDates(record);
  if (requireDurable && sanitized.length !== records.length) throw new Error('This record is incomplete and was not saved.');
  if (!canUseStorage()) {
    if (requireDurable) throw new Error('This browser has no local storage available for saving this record.');
    return sanitized;
  }

  const serialized = JSON.stringify(sanitized);
  if (window.localStorage.getItem(codec.storageKey) === serialized) return sanitized;

  if(requireDurable&&codec.table in historicalSources){
    commitLocalHistoricalCollection(codec.table as HistoricalSource,sanitized as KernelRecord[] as {id:string;userId?:string|null;isSample?:boolean}[]);
  }else{
    const written = writeLocalCollection(codec.storageKey, serialized);
    if (requireDurable) requireLocalWrite(written);
    if (!written.ok) { reportWorkspaceSyncError(); return sanitized; }
  }
  invalidateWorkspaceCollection(workspaceCollectionForTable(codec.table));
  window.dispatchEvent(new CustomEvent(codec.updatedEvent, { detail: sanitized }));

  return sanitized;
}

// ------------------------------------------------------------------ cloud

export async function loadCloudRecords<T extends KernelRecord>(
  codec: KernelCodec<T>,
  userId: string,
): Promise<T[]> {
  if (!supabaseClient) return [];

  // Paged: see `fetchAllRows`. Commitments are written one per promise made, so
  // this table grows with use rather than with an import.
  const data = await fetchAllRows<Record<string, unknown>>((from, to) => supabaseClient!
    .from(codec.table)
    .select('*')
    .eq('user_id', userId)
    .order(codec.orderColumn, { ascending: false })
    // Total order, so paging cannot repeat or skip a record. See `fetchAllRows`.
    .order('id', { ascending: true })
    .range(from, to) as never);

  return data
    .map(codec.fromRow)
    .filter((record): record is T => Boolean(record));
}

/**
 * A bounded slice of a kernel table, newest first.
 *
 * `loadCloudRecords` above reads every row, which is right for commitments and
 * threads - collections that grow with the number of promises a person makes.
 * The event log is different in kind: it grows with every state change forever,
 * and nothing on screen ever needs all of it. Reading it unbounded would put an
 * ever-growing payload on a workspace load that is already dominated by
 * accounts and stakeholders.
 *
 * Both the time window and the row cap are the caller's, so the bound is
 * declared where the reason for it lives rather than hidden in the repository.
 */
export async function loadCloudRecordsSince<T extends KernelRecord>(
  codec: KernelCodec<T>,
  userId: string,
  sinceColumn: string,
  sinceIso: string,
  limit: number,
): Promise<T[]> {
  if (!supabaseClient) return [];

  const { data, error } = await supabaseClient
    .from(codec.table)
    .select('*')
    .eq('user_id', userId)
    .gte(sinceColumn, sinceIso)
    .order(sinceColumn, { ascending: false })
    // Total order, so the cap always takes the same rows. See `fetchAllRows`.
    .order('id', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data || [])
    .map((row) => codec.fromRow(row as Record<string, unknown>))
    .filter((record): record is T => Boolean(record));
}

export async function upsertCloudRecords<T extends KernelRecord>(
  codec: KernelCodec<T>,
  userId: string,
  records: T[],
) {
  if (!supabaseClient) throw new Error('The account connection is unavailable.');
  if(codec.table in historicalSources)await requireCloudHistoricalIntegrity(userId);
  const rows = records.filter(isSyncableRecord).map((record) => codec.toRow(record, userId));
  if (rows.length === 0) return;

  const { error } = await supabaseClient
    .from(codec.table)
    .upsert(rows, { onConflict: 'user_id,id' });

  if (error) throw new Error(error.message);
}

export async function deleteCloudRecord(codec: KernelCodec<never>, userId: string, recordId: string) {
  if (!supabaseClient) return;
  if(codec.table in historicalSources)await requireCloudHistoricalIntegrity(userId);
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
  const allLocal = readLocal(codec);
  const ownerScoped = codec.table === 'commercial_conditions' || codec.table === 'commercial_outcome_requirements'
    || codec.table === 'commercial_dependencies' || codec.table === 'commercial_timing_assertions'
    || codec.table === 'commercial_money_gates' || codec.table === 'commercial_decisions'
    || codec.table === 'commercial_decision_observations' || codec.table === 'commercial_policies' || codec.table === 'commercial_incidents';
  const local = allLocal.filter(r => !ownerScoped || r.userId === userId);
  const otherOwners = ownerScoped ? allLocal.filter(r => r.userId !== userId) : [];
  const cloud = await loadCloudRecords(codec, userId);

  const merged = new Map<string, T>();
  for (const record of [...cloud, ...local]) {
    const existing = merged.get(record.id);
    if (!existing || updatedAt(record) >= updatedAt(existing)) merged.set(record.id, record);
  }

  const result = Array.from(merged.values()).sort(codec.compare);
  writeLocal(codec, [...result, ...otherOwners], { requireDurable: false });
  sendOwedCloudRecords(codec, userId, result, cloud);
  return result;
}

/**
 * Sends only the records the cloud does not already have.
 *
 * The merged read used to end with an awaited upsert of the whole collection.
 * That is a second round trip on the read path, and in the steady state it
 * writes back exactly what it just read. The merge above already decided which
 * copy wins per id, so a record is owed to the cloud only when it beat an older
 * cloud copy or the cloud had none - normally an empty set, and then no request
 * is made.
 *
 * It does not block the read: the answer is `result` either way, and a failed
 * push leaves the record in the browser for the next read to offer again.
 */
export function sendOwedCloudRecords<T extends KernelRecord>(
  codec: KernelCodec<T>,
  userId: string,
  merged: T[],
  cloud: T[],
) {
  const owed = selectOwedCloudRecords(merged, cloud);
  if (owed.length === 0) return;

  void upsertCloudRecords(codec, userId, owed).catch((error) => {
    reportWorkspaceSyncError();
    reportKernelSyncFailure(codec.table, 'upsert', error);
  });
}

/**
 * Which of the merged records the cloud is still missing. Split out from the
 * send so the decision can be tested without a network.
 */
export function selectOwedCloudRecords<T extends KernelRecord>(merged: T[], cloud: T[]): T[] {
  const cloudUpdatedAt = new Map(cloud.map((record) => [record.id, updatedAt(record)]));
  return merged.filter((record) => {
    const seen = cloudUpdatedAt.get(record.id);
    return seen === undefined || updatedAt(record) > seen;
  });
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
  // PostgREST may return +00:00 while browser writes Z for the same instant.
  // Comparing strings would keep sending an unchanged record back to cloud.
  return Date.parse(record.updatedAt || record.createdAt || '') || 0;
}

export function reportKernelSyncFailure(table: KernelTable, operation: 'load' | 'upsert' | 'delete', error: unknown) {
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

/** A newly accepted record must remain readable by the backup preflight. */
function validateStoredDates(record: KernelRecord) {
  const fields = record as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(fields)) {
    if ((name.endsWith('At') || name.endsWith('Date')) && value != null && value !== '') {
      if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('This record has an invalid date and was not saved.');
      if (/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0,10) !== value) throw new Error('This record has an invalid date and was not saved.');
    }
  }
  if (Array.isArray(fields.dueDateHistory)) for (const item of fields.dueDateHistory) {
    for (const value of [item.from, item.to, item.changedAt]) if (value && !Number.isFinite(Date.parse(value))) throw new Error('This commitment has invalid date history and was not saved.');
  }
}
