import {
  claimLocalCollectionForUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
  upsertCloudJsonCollection,
} from './cloudJsonCollectionStore';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';

export const ACCOUNT_MERGE_STORAGE_KEY = 'memoire.accountMerges.v1';
export const ACCOUNT_MERGES_UPDATED_EVENT = 'memoire:account-merges-updated';

/**
 * What the user decided about two account records that looked like one company.
 *
 * A merge is stored as a *decision*, never as a rewrite: the deals and
 * activities keep the name they were captured under, and this record says which
 * names now belong to which account. That is what makes the merge reversible -
 * delete the record and the history is untouched, because it was never edited.
 *
 * Dismissals are stored for the same reason plan suggestions store refusals:
 * a question the user already answered must not be asked again.
 */
export type AccountMergeRecord = {
  id: string;
  kind: 'merge' | 'dismissal';
  /** The surviving account name for a merge. */
  canonicalAccountName: string;
  /** Names folded into the survivor. Empty for a dismissal. */
  mergedNames: string[];
  /** The refused pair, for a dismissal. */
  pairKey?: string;
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

export function loadAccountMerges(): AccountMergeRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(ACCOUNT_MERGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitize)
      .filter((record): record is AccountMergeRecord => Boolean(record));
  } catch {
    return [];
  }
}

export async function loadAccountMergesForUser(userId: string) {
  const local = loadAccountMerges();
  const cloud = await loadCloudJsonCollection<AccountMergeRecord>('account_merges', userId);
  const recordsToMerge = claimLocalCollectionForUser('account_merges', userId)
    ? local.filter((record) => record.source !== 'demo' && record.isSample !== true)
    : [];
  const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
    .map(sanitize)
    .filter((record): record is AccountMergeRecord => Boolean(record));
  persist(merged, false);
  await upsertCloudJsonCollection('account_merges', userId, merged);
  return merged;
}

export async function loadAccountMergesForWorkspace(userId?: string | null, sampleDataActive = false) {
  if (!userId || sampleDataActive) return loadAccountMerges();
  try {
    return await loadAccountMergesForUser(userId);
  } catch {
    return loadAccountMerges();
  }
}

export function saveAccountMerge(record: AccountMergeRecord) {
  const existing = loadAccountMerges().filter((item) => item.id !== record.id);
  return persist([record, ...existing]);
}

export function deleteAccountMerge(recordId: string) {
  return persist(loadAccountMerges().filter((record) => record.id !== recordId));
}

/** Every name that has been folded into another account. */
export function mergedAwayNames(records = loadAccountMerges()) {
  return records
    .filter((record) => record.kind === 'merge')
    .flatMap((record) => record.mergedNames);
}

/** The alternate names an account answers to, after merges. */
export function alternateNamesFor(accountName: string, records = loadAccountMerges()) {
  const target = accountName.trim().toLowerCase();
  return records
    .filter((record) => record.kind === 'merge' && record.canonicalAccountName.trim().toLowerCase() === target)
    .flatMap((record) => record.mergedNames);
}

export function dismissedPairKeys(records = loadAccountMerges()) {
  return records
    .filter((record) => record.kind === 'dismissal' && record.pairKey)
    .map((record) => record.pairKey as string);
}

function persist(records: AccountMergeRecord[], syncCloud = true) {
  const sanitized = records
    .map(sanitize)
    .filter((record): record is AccountMergeRecord => Boolean(record))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (canUseStorage()) {
    window.localStorage.setItem(ACCOUNT_MERGE_STORAGE_KEY, JSON.stringify(sanitized));
    if (syncCloud) syncCloudJsonCollectionForCurrentUser('account_merges', sanitized);
    invalidateWorkspaceDataCache();
    window.dispatchEvent(new CustomEvent(ACCOUNT_MERGES_UPDATED_EVENT, { detail: sanitized }));
  }
  return sanitized;
}

function sanitize(value: unknown): AccountMergeRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AccountMergeRecord>;
  const kind = candidate.kind === 'dismissal' ? 'dismissal' : 'merge';
  const now = new Date().toISOString();

  if (kind === 'merge' && !candidate.canonicalAccountName?.trim()) return null;
  if (kind === 'dismissal' && !candidate.pairKey) return null;

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `account-merge-${Date.now()}`,
    kind,
    canonicalAccountName: (candidate.canonicalAccountName || '').trim(),
    mergedNames: Array.isArray(candidate.mergedNames)
      ? candidate.mergedNames.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [],
    pairKey: typeof candidate.pairKey === 'string' ? candidate.pairKey : undefined,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now,
    source: candidate.source === 'demo' ? 'demo' : candidate.source === 'user' ? 'user' : undefined,
    isSample: candidate.isSample === true,
  };
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
