/**
 * The two timestamps Sync & Recovery reports: when the workspace last reached
 * the cloud, and when the user last took a backup out of it.
 *
 * These live in their own module rather than beside the panel because they are
 * written from the export flow and from the sync path, not only from the screen
 * that displays them - and because a component file that also exports helpers
 * breaks fast refresh.
 *
 * Best-effort by design. A missing timestamp makes the panel less informative;
 * it never makes a record unsafe, so a storage failure here is swallowed rather
 * than surfaced.
 */

const LAST_SYNC_KEY = 'memoire.sync.lastSuccessAt.v1';
const LAST_BACKUP_KEY = 'memoire.sync.lastBackupAt.v1';

function write(key: string) {
  try {
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Best effort only.
  }
}

export function recordSuccessfulSync() {
  write(LAST_SYNC_KEY);
}

export function recordBackupExport() {
  write(LAST_BACKUP_KEY);
}

export function readLastSuccessfulSync() {
  return read(LAST_SYNC_KEY);
}

export function readLastBackupExport() {
  return read(LAST_BACKUP_KEY);
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
