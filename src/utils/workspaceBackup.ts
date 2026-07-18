/**
 * The other half of export.
 *
 * A local-first product makes an implicit promise: your data is yours, and you
 * can always walk away with it. Export kept that promise; without restore it
 * was only half kept, because a backup you cannot put back is a souvenir, not
 * a safety net.
 *
 * Everything here is pure so the rules that matter - what counts as a Memoire
 * backup, what never comes back in - can be tested without a browser.
 */

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_KEY_PREFIX = 'memoire.';

export type BackupEnvelope = {
  exportedAt: string;
  mode?: string;
  formatVersion?: number;
  localBrowserData: Record<string, unknown>;
  cloudData?: unknown;
};

export type BackupEntry = {
  key: string;
  /** Records for array-shaped stores; null when the value is not a collection. */
  recordCount: number | null;
  sampleCount: number;
};

export type BackupSummary = {
  exportedAt: string;
  mode: string;
  formatVersion: number;
  entries: BackupEntry[];
  totalKeys: number;
  totalRecords: number;
  /** Demo records found in the file. They are reported, then dropped. */
  totalSampleRecords: number;
  hadCloudData: boolean;
};

export type BackupParseResult =
  | { ok: true; envelope: BackupEnvelope; summary: BackupSummary }
  | { ok: false; reason: BackupRejectionReason; message: string };

export type BackupRejectionReason =
  | 'not-json'
  | 'not-an-object'
  | 'not-a-memoire-backup'
  | 'unsupported-version'
  | 'no-workspace-data';

/**
 * Deliberately strict. A restore overwrites the workspace, so anything we are
 * not certain is a Memoire backup is refused with a reason the user can act on
 * rather than best-effort parsed into a half-restored state.
 */
export function parseBackupFile(raw: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not-json', message: 'That file is not valid JSON. Pick the .json file from a Memoire export ZIP.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'not-an-object', message: 'That file does not look like a Memoire export.' };
  }

  const candidate = parsed as Partial<BackupEnvelope>;
  const local = candidate.localBrowserData;

  if (!local || typeof local !== 'object' || Array.isArray(local) || typeof candidate.exportedAt !== 'string') {
    return {
      ok: false,
      reason: 'not-a-memoire-backup',
      message: 'That file is missing the workspace section a Memoire export always has. Nothing was changed.',
    };
  }

  const formatVersion = typeof candidate.formatVersion === 'number' ? candidate.formatVersion : 1;
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      reason: 'unsupported-version',
      message: `This backup was written by a newer version of Memoire (format ${formatVersion}). Update before restoring it.`,
    };
  }

  const workspaceKeys = Object.keys(local).filter(isWorkspaceKey);
  if (workspaceKeys.length === 0) {
    return {
      ok: false,
      reason: 'no-workspace-data',
      message: 'This export contains no Memoire workspace data to restore.',
    };
  }

  const envelope: BackupEnvelope = {
    exportedAt: candidate.exportedAt,
    mode: typeof candidate.mode === 'string' ? candidate.mode : 'unknown',
    formatVersion,
    localBrowserData: local as Record<string, unknown>,
    cloudData: candidate.cloudData,
  };

  return { ok: true, envelope, summary: summarizeBackup(envelope) };
}

export function summarizeBackup(envelope: BackupEnvelope): BackupSummary {
  const entries = Object.keys(envelope.localBrowserData)
    .filter(isWorkspaceKey)
    .sort()
    .map((key) => {
      const value = envelope.localBrowserData[key];
      if (!Array.isArray(value)) return { key, recordCount: null, sampleCount: 0 };
      return {
        key,
        recordCount: value.length,
        sampleCount: value.filter(isSampleRecord).length,
      };
    });

  return {
    exportedAt: envelope.exportedAt,
    mode: envelope.mode || 'unknown',
    formatVersion: envelope.formatVersion || 1,
    entries,
    totalKeys: entries.length,
    totalRecords: entries.reduce((total, entry) => total + (entry.recordCount || 0), 0),
    totalSampleRecords: entries.reduce((total, entry) => total + entry.sampleCount, 0),
    hadCloudData: Boolean(envelope.cloudData),
  };
}

export type RestorePlan = {
  /** Exactly what will be written to localStorage, key by key. */
  writes: Array<{ key: string; value: string }>;
  droppedSampleRecords: number;
  restoredRecords: number;
};

/**
 * Demo records never ride a restore into a live workspace. The whole app holds
 * this line at write time (`isUserSnapshot`, the sample-tagged stores); a
 * backup taken while the demo sandbox was loaded would quietly cross it, so it
 * is enforced here too - and the count is reported rather than swallowed.
 */
export function buildRestorePlan(envelope: BackupEnvelope): RestorePlan {
  let droppedSampleRecords = 0;
  let restoredRecords = 0;

  const writes = Object.keys(envelope.localBrowserData)
    .filter(isWorkspaceKey)
    .sort()
    .map((key) => {
      const value = envelope.localBrowserData[key];

      if (Array.isArray(value)) {
        const live = value.filter((record) => !isSampleRecord(record));
        droppedSampleRecords += value.length - live.length;
        restoredRecords += live.length;
        return { key, value: JSON.stringify(live) };
      }

      return { key, value: JSON.stringify(value) };
    });

  return { writes, droppedSampleRecords, restoredRecords };
}

export function isWorkspaceKey(key: string) {
  return key.startsWith(BACKUP_KEY_PREFIX);
}

function isSampleRecord(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const record = value as { source?: unknown; isSample?: unknown };
  return record.isSample === true || record.source === 'demo';
}
