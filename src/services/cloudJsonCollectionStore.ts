import { supabaseClient } from '../lib/supabaseClient';
import { reportClientOperationalEvent } from './clientTelemetry';
import { reportWorkspaceSyncError } from './workspaceSyncStatus';

export type CloudJsonCollectionTable = 'review_packs' | 'sales_assets' | 'action_outcomes' | 'opportunity_outcomes' | 'quotes' | 'nudges';

export type CloudJsonRecord = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  source?: string;
  isSample?: boolean;
  __deleted?: boolean;
};

type CloudJsonRow = {
  id: string;
  payload: unknown;
  updated_at: string;
};

export async function loadCloudJsonCollection<T extends CloudJsonRecord>(
  table: CloudJsonCollectionTable,
  userId: string,
): Promise<T[]> {
  if (!supabaseClient) return [];

  const { data, error } = await supabaseClient
    .from(table)
    .select('id, payload, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  return ((data || []) as CloudJsonRow[]).flatMap((row) => {
    if (!row.payload || typeof row.payload !== 'object') return [];
    return [{ ...(row.payload as T), id: row.id }];
  });
}

export async function upsertCloudJsonCollection<T extends CloudJsonRecord>(
  table: CloudJsonCollectionTable,
  userId: string,
  records: T[],
) {
  if (!supabaseClient) return;
  const rows = records
    .filter(isUserRecord)
    .map((record) => ({
      user_id: userId,
      id: record.id,
      payload: record,
      created_at: record.createdAt || new Date().toISOString(),
      updated_at: record.updatedAt || new Date().toISOString(),
    }));
  if (rows.length === 0) return;

  const { error } = await supabaseClient
    .from(table)
    .upsert(rows, { onConflict: 'user_id,id' });

  if (error) throw new Error(error.message);
}

export async function deleteCloudJsonRecord(
  table: CloudJsonCollectionTable,
  userId: string,
  recordId: string,
) {
  if (!supabaseClient) return;
  const now = new Date().toISOString();
  const { error } = await supabaseClient
    .from(table)
    .upsert({
      user_id: userId,
      id: recordId,
      payload: { id: recordId, updatedAt: now, __deleted: true },
      created_at: now,
      updated_at: now,
    }, { onConflict: 'user_id,id' });
  if (error) throw new Error(error.message);
}

export function syncCloudJsonCollectionForCurrentUser<T extends CloudJsonRecord>(
  table: CloudJsonCollectionTable,
  records: T[],
) {
  void getCurrentUserId()
    .then((userId) => {
      if (!userId) return undefined;
      setLocalCollectionOwner(table, userId);
      return upsertCloudJsonCollection(table, userId, records);
    })
    .catch((error) => {
      reportWorkspaceSyncError();
      reportCloudJsonSyncFailure(table, 'upsert', error);
    });
}

export function deleteCloudJsonRecordForCurrentUser(
  table: CloudJsonCollectionTable,
  recordId: string,
) {
  void getCurrentUserId()
    .then((userId) => {
      if (!userId) return undefined;
      setLocalCollectionOwner(table, userId);
      return deleteCloudJsonRecord(table, userId, recordId);
    })
    .catch((error) => {
      reportWorkspaceSyncError();
      reportCloudJsonSyncFailure(table, 'delete', error);
    });
}

export function mergeCloudJsonRecords<T extends CloudJsonRecord>(local: T[], cloud: T[]) {
  const merged = new Map<string, T>();
  [...cloud, ...local].forEach((record) => {
    if (!isUserRecord(record)) return;
    const existing = merged.get(record.id);
    if (!existing || getUpdatedAt(record) >= getUpdatedAt(existing)) {
      merged.set(record.id, record);
    }
  });
  return Array.from(merged.values())
    .filter((record) => record.__deleted !== true)
    .sort((a, b) => getUpdatedAt(b).localeCompare(getUpdatedAt(a)));
}

export function claimLocalCollectionForUser(table: CloudJsonCollectionTable, userId: string) {
  if (typeof window === 'undefined') return false;
  const key = getOwnerKey(table);
  const owner = window.localStorage.getItem(key);
  window.localStorage.setItem(key, userId);
  return !owner || owner === userId;
}

function isUserRecord<T extends CloudJsonRecord>(record: T) {
  return record.source !== 'demo' && record.isSample !== true;
}

function getUpdatedAt(record: CloudJsonRecord) {
  return record.updatedAt || record.createdAt || '';
}

async function getCurrentUserId() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) throw new Error(error.message);
  return data.user?.id || null;
}

function setLocalCollectionOwner(table: CloudJsonCollectionTable, userId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getOwnerKey(table), userId);
}

function getOwnerKey(table: CloudJsonCollectionTable) {
  return `memoire.cloud-owner.${table}.v1`;
}

function reportCloudJsonSyncFailure(
  table: CloudJsonCollectionTable,
  operation: 'upsert' | 'delete',
  error: unknown,
) {
  reportClientOperationalEvent({
    eventName: 'cloud_json_sync_failed',
    component: 'cloudJsonCollectionStore',
    operation,
    table,
    severity: 'error',
    error,
  });
}
