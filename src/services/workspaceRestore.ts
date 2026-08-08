import {
  claimLocalCollectionForUser,
  upsertCloudJsonCollection,
  type CloudJsonCollectionTable,
  type CloudJsonRecord,
} from './cloudJsonCollectionStore.ts';
import { writeLocalCollection } from './localWriteGuard.ts';
import { invalidateWorkspaceDataCache } from './workspaceDataCache.ts';
import { buildRestorePlan, isWorkspaceKey, type BackupEnvelope } from '../utils/workspaceBackup.ts';
import { formatCount } from '../utils/numberFormat.ts';

/**
 * Putting a backup back, all the way back.
 *
 * Restore used to write the browser and stop there, and Settings said so:
 * "Full cloud restore - Memoire does not do this yet. If you are signed in,
 * cloud sync may overwrite a restored browser copy with what the cloud already
 * holds." The documented workaround was to sign out, restore, check, and sign
 * in again. That is a real answer to a real hazard, and it is also an admission
 * that the backup only half works - which for a tool holding a seller's entire
 * book is the difference between a bad afternoon and a lost customer.
 *
 * What made the cloud half hard is that the two halves can disagree. The
 * browser copy is authoritative for the user who just chose a file; the cloud
 * copy is authoritative for every other device. A restore has to make the cloud
 * agree with the file rather than the other way round, and it has to say what
 * it did, per collection, in records.
 *
 * Three things this does that the old path did not:
 *
 *   1. Snapshots the current workspace before touching it, so "restore the
 *      wrong file" is recoverable. The old confirmation said "this cannot be
 *      undone", which was true and did not have to be.
 *   2. Writes through the guarded path. Restoring a full backup is precisely
 *      when a browser runs out of room, and a restore that half-lands while
 *      reporting success is worse than one that refuses.
 *   3. Pushes every restored collection that has a cloud table up to the
 *      account, and claims ownership, so the next sync agrees with the file
 *      instead of overwriting it.
 */

/**
 * Which local collections have somewhere to go in the cloud.
 *
 * The rest are browser-only today - accounts, opportunities, activities,
 * stakeholders and objections sync through their own stores and tables, and
 * preferences are not records. A restore does not invent a home for a
 * collection that does not have one; it reports what it could and could not
 * push, which is the honest version of the same information.
 */
const CLOUD_TABLE_BY_KEY: Record<string, CloudJsonCollectionTable> = {
  'memoire.reviewPacks.v1': 'review_packs',
  'memoire.salesAssets.v1': 'sales_assets',
  'memoire.actionOutcomes.v1': 'action_outcomes',
  'memoire.opportunityOutcomes.v1': 'opportunity_outcomes',
  'memoire.quotes.v1': 'quotes',
  'memoire.nudges.v1': 'nudges',
  'memoire.weeklyCommitments.v1': 'weekly_commitments',
  'memoire.planItems.v1': 'plan_items',
  'memoire.accountMerges.v1': 'account_merges',
  'memoire.orderMilestones.v1': 'order_milestones',
  'memoire.orderCosts.v1': 'order_costs',
  'memoire.orderReceivables.v1': 'order_receivables',
  'memoire.supplierCommitments.v1': 'supplier_commitments',
  'memoire.expenses.v1': 'expenses',
};

export type RestoreCollectionResult = {
  key: string;
  /** Records in this browser before the restore. Null when it was not a list. */
  before: number | null;
  /** Records the backup carries for this collection. */
  after: number | null;
  localWritten: boolean;
  /** Null when the collection has no cloud table, or nobody is signed in. */
  cloudPushed: boolean | null;
  message: string;
};

export type RestoreResult = {
  ok: boolean;
  collections: RestoreCollectionResult[];
  restoredRecords: number;
  droppedSampleRecords: number;
  /** Everything this browser held before the restore, for a one-step undo. */
  snapshot: Record<string, string>;
  cloudPushedCount: number;
  cloudFailedCount: number;
  /** One sentence for the interface. Never claims more than happened. */
  summary: string;
};

export async function restoreWorkspace(
  envelope: BackupEnvelope,
  options: { userId?: string | null; clearFirst?: boolean } = {},
): Promise<RestoreResult> {
  const plan = buildRestorePlan(envelope);
  const snapshot = snapshotWorkspace();

  // Cleared before writing, not after: a backup taken from a workspace that had
  // fewer collections must not leave the extra ones behind, or the restored
  // workspace is a merge nobody asked for.
  if (options.clearFirst !== false) clearWorkspaceKeys();

  const collections: RestoreCollectionResult[] = [];
  let localFailures = 0;

  for (const write of plan.writes) {
    const before = countRecords(snapshot[write.key]);
    const after = countRecords(write.value);
    const result = writeLocalCollection(write.key, write.value);
    if (!result.ok) localFailures += 1;

    collections.push({
      key: write.key,
      before,
      after,
      localWritten: result.ok,
      cloudPushed: null,
      message: result.ok ? '' : result.message,
    });
  }

  invalidateWorkspaceDataCache();

  // The cloud half. Only for a signed-in user, only for collections with a
  // table, and awaited - a restore that returns before the push lands is how
  // the next sync overwrites what was just restored.
  let cloudPushedCount = 0;
  let cloudFailedCount = 0;

  if (options.userId) {
    for (const collection of collections) {
      const table = CLOUD_TABLE_BY_KEY[collection.key];
      if (!table || !collection.localWritten) continue;

      const records = parseRecords(plan.writes.find((write) => write.key === collection.key)?.value);
      if (!records) continue;

      try {
        claimLocalCollectionForUser(table, options.userId);
        await upsertCloudJsonCollection(table, options.userId, records);
        collection.cloudPushed = true;
        cloudPushedCount += 1;
      } catch (error) {
        collection.cloudPushed = false;
        collection.message = `Restored in this browser, but the account copy did not accept it: ${describeError(error)}`;
        cloudFailedCount += 1;
      }
    }
  }

  return {
    ok: localFailures === 0 && cloudFailedCount === 0,
    collections,
    restoredRecords: plan.restoredRecords,
    droppedSampleRecords: plan.droppedSampleRecords,
    snapshot,
    cloudPushedCount,
    cloudFailedCount,
    summary: buildSummary({
      restoredRecords: plan.restoredRecords,
      collectionCount: collections.length,
      droppedSampleRecords: plan.droppedSampleRecords,
      localFailures,
      cloudPushedCount,
      cloudFailedCount,
      signedIn: Boolean(options.userId),
    }),
  };
}

/** Puts back exactly what was there before a restore. */
export function undoRestore(snapshot: Record<string, string>): boolean {
  clearWorkspaceKeys();
  let ok = true;
  Object.entries(snapshot).forEach(([key, value]) => {
    if (!writeLocalCollection(key, value).ok) ok = false;
  });
  invalidateWorkspaceDataCache();
  return ok;
}

export function snapshotWorkspace(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  if (typeof window === 'undefined' || !window.localStorage) return snapshot;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !isWorkspaceKey(key)) continue;
    snapshot[key] = window.localStorage.getItem(key) || '';
  }
  return snapshot;
}

function clearWorkspaceKeys() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && isWorkspaceKey(key)) keys.push(key);
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
}

function countRecords(value: string | undefined): number | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

/**
 * A cloud collection is keyed by record id, so a row without one cannot be
 * pushed. Dropping it here rather than letting the upsert reject the whole
 * batch keeps one malformed row from costing a collection its restore.
 */
function parseRecords(value: string | undefined): CloudJsonRecord[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((record): record is CloudJsonRecord => (
      Boolean(record) && typeof record === 'object' && typeof (record as { id?: unknown }).id === 'string'
    ));
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'unknown error');
}

function buildSummary(input: {
  restoredRecords: number;
  collectionCount: number;
  droppedSampleRecords: number;
  localFailures: number;
  cloudPushedCount: number;
  cloudFailedCount: number;
  signedIn: boolean;
}): string {
  if (input.localFailures > 0) {
    return `${input.localFailures} of ${input.collectionCount} collections could not be written to this browser. The workspace is part-restored - undo, free some space, and try again.`;
  }

  const base = `${formatCount(input.restoredRecords)} records restored across ${input.collectionCount} collections`;
  const dropped = input.droppedSampleRecords > 0
    ? `, ${input.droppedSampleRecords} demo record${input.droppedSampleRecords === 1 ? '' : 's'} left out`
    : '';

  if (!input.signedIn) {
    return `${base}${dropped}. This browser only - sign in and Memoire will sync them to your account.`;
  }

  if (input.cloudFailedCount > 0) {
    return `${base}${dropped}. ${input.cloudPushedCount} pushed to your account, ${input.cloudFailedCount} refused - those collections are correct here but not yet in the cloud.`;
  }

  return `${base}${dropped}. ${input.cloudPushedCount} collections pushed to your account, so your other devices will match.`;
}
