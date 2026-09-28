import { decodeHistoricalStorage, encodeHistoricalStorage } from './historicalStorageCodec.ts';

/** A local rollback journal, not a transaction spanning browser and cloud. */
export const RESTORE_JOURNAL_KEY = 'memoire.restoreJournal.v1';
let applying = false;
export function isRestoreInProgress() {
  if (applying) return true;
  try { return typeof window !== 'undefined' && Boolean(window.localStorage?.getItem(RESTORE_JOURNAL_KEY)); }
  catch { return false; }
}
export function beginRestore() { if (applying) throw new Error('A restore is already in progress.'); applying = true; }
export function endRestore() { applying = false; }
type Journal = { version: 1; before: Record<string, string | null> };

export function recoverInterruptedRestore(storage: Storage): boolean {
  const raw = storage.getItem(RESTORE_JOURNAL_KEY);
  if (!raw) return true;
  try {
    const journal = JSON.parse(decodeHistoricalStorage(raw)) as Journal;
    if (journal.version !== 1 || !journal.before || typeof journal.before !== 'object') return false;
    const entries = Object.entries(journal.before);
    if (entries.some(([key, value]) => !safeKey(key) || (value !== null && typeof value !== 'string'))) return false;
    // Free newly-created keys before putting old values back, to reduce quota pressure.
    for (const [key, value] of entries) if (value === null) storage.removeItem(key);
    for (const [key, value] of entries) if (value !== null && storage.getItem(key) !== value) storage.setItem(key, value);
    if (entries.some(([key, value]) => storage.getItem(key) !== value)) return false;
    storage.removeItem(RESTORE_JOURNAL_KEY);
    return true;
  } catch { return false; }
}

export function applyLocalRestore(storage: Storage, desired: Record<string, string | null>): void {
  if (!recoverInterruptedRestore(storage)) throw new Error('An earlier restore needs recovery. Keep this browser and your backup file.');
  const before: Journal['before'] = {};
  for (const key of Object.keys(desired)) {
    if (!safeKey(key)) throw new Error('Unsafe restore key. Nothing was changed.');
    before[key] = storage.getItem(key);
  }
  const journal: Journal = { version: 1, before };
  // If the browser cannot hold the rollback copy, refuse before touching any records.
  try { storage.setItem(RESTORE_JOURNAL_KEY, encodeHistoricalStorage(JSON.stringify(journal))); }
  catch { throw new Error('Restore could not start because this browser could not save a recovery copy. Free browser storage and retry. Nothing was changed.'); }
  try {
    for (const [key, value] of Object.entries(desired)) {
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
    }
    if (Object.entries(desired).some(([key, value]) => storage.getItem(key) !== value)) throw new Error('Browser did not retain the restored data.');
    storage.removeItem(RESTORE_JOURNAL_KEY);
  } catch (error) {
    const recovered = recoverInterruptedRestore(storage);
    throw new Error(recovered
      ? `Restore was rejected; the previous workspace was restored. ${error instanceof Error ? error.message : String(error)}`
      : 'Restore and rollback did not complete. Recovery data is retained in this browser. Reload to retry recovery; do not clear browser data.');
  }
}

function safeKey(key: string) {
  return (key.startsWith('memoire.') || ['memoire_reporting_currency', 'memoire_opening_cash_balance'].includes(key))
    && !/(?:cloud-owner|local-workspace-owner|sampleData|demo|auth|restoreJournal)/i.test(key);
}
