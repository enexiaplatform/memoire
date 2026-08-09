import {
  sanitizeKnowledgeRecord,
  type KnowledgeRecord,
} from '../utils/knowledgeNotes';
import {
  claimLocalCollectionForUser,
  deleteCloudJsonRecordForCurrentUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  sendOwedCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
} from './cloudJsonCollectionStore';
import { invalidateWorkspaceCollection } from './workspaceDataCache';
import { writeLocalRecords } from './localWriteGuard.ts';

export const KNOWLEDGE_NOTE_STORAGE_KEY = 'memoire.knowledgeNotes.v1';

/**
 * The one collection the Business Vault owns.
 *
 * It rides the existing JSON-collection pattern - browser first, cloud table
 * behind it, merged on read - for the same reason supplier commitments and
 * order costs do: it costs no API function, and `api/` is at the Vercel Hobby
 * ceiling of twelve.
 *
 * Deliberately not added to `SalesWorkspaceData`. Every surface in the product
 * loads that blob as one barrier, and a sixteenth collection would put a round
 * trip on Today, Accounts and Orders to fetch records only the Vault reads.
 */
export function loadKnowledgeNotes(): KnowledgeRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_NOTE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortKnowledge(parsed
      .map(sanitizeKnowledgeRecord)
      .filter((record): record is KnowledgeRecord => Boolean(record)));
  } catch {
    return [];
  }
}

export async function loadKnowledgeNotesForWorkspace(userId?: string | null, sampleDataActive = false) {
  if (!userId || sampleDataActive) return loadKnowledgeNotes();
  try {
    const local = loadKnowledgeNotes();
    const cloud = await loadCloudJsonCollection<KnowledgeRecord>('knowledge_notes', userId);
    const recordsToMerge = claimLocalCollectionForUser('knowledge_notes', userId) ? local.filter(isUserRecord) : [];
    const merged = sortKnowledge(mergeCloudJsonRecords(recordsToMerge, cloud)
      .map(sanitizeKnowledgeRecord)
      .filter((record): record is KnowledgeRecord => Boolean(record)));
    persistKnowledgeNotes(merged, false);
    sendOwedCloudJsonRecords('knowledge_notes', userId, merged, cloud);
    return merged;
  } catch {
    return loadKnowledgeNotes();
  }
}

export function saveKnowledgeNote(record: KnowledgeRecord): KnowledgeRecord[] {
  const existing = loadKnowledgeNotes().filter((item) => item.id !== record.id);
  return persistKnowledgeNotes([{ ...record, updatedAt: new Date().toISOString() }, ...existing]);
}

export function deleteKnowledgeNote(recordId: string): KnowledgeRecord[] {
  const records = persistKnowledgeNotes(loadKnowledgeNotes().filter((item) => item.id !== recordId));
  deleteCloudJsonRecordForCurrentUser('knowledge_notes', recordId);
  return records;
}

function persistKnowledgeNotes(records: KnowledgeRecord[], syncCloud = true) {
  const sanitized = sortKnowledge(records
    .map(sanitizeKnowledgeRecord)
    .filter((record): record is KnowledgeRecord => Boolean(record)));

  if (canUseStorage()) {
    writeLocalRecords(KNOWLEDGE_NOTE_STORAGE_KEY, sanitized);
    if (syncCloud) {
      syncCloudJsonCollectionForCurrentUser('knowledge_notes', sanitized);
      invalidateWorkspaceCollection('knowledgeNotes');
    }
  }
  return sanitized;
}

/** Newest first: the Vault's Library leads with what changed. */
function sortKnowledge(records: KnowledgeRecord[]) {
  return [...records].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function isUserRecord(record: KnowledgeRecord) {
  return record.source !== 'demo' && record.isSample !== true;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
