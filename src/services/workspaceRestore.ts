import { supabaseClient } from '../lib/supabaseClient.ts';
import { canonicalContracts, contractForKey, isSampleRecord, type RecordData } from './canonicalDurability.ts';
import { applyLocalRestore, beginRestore, endRestore, RESTORE_JOURNAL_KEY } from './restoreJournal.ts';
import { invalidateWorkspaceDataCache } from './workspaceDataCache.ts';
import { buildRestorePlan, isRestorableWorkspaceKey, type BackupEnvelope } from '../utils/workspaceBackup.ts';
import { hasLocalSampleData } from '../utils/dataMode.ts';
import { reportClientOperationalEvent } from './clientTelemetry.ts';
import { writeLocalCollection } from './localWriteGuard.ts';
import { buildHistoricalBaselineFromCollections, HISTORICAL_COVERAGE_KEY, HISTORICAL_REVISIONS_KEY,
  historicalSources } from './historicalIntegrity.ts';
import { restoreCloudHistoricalScope } from './historicalCloudRestore.ts';

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

/** Local replacement with verified rollback; cloud is an awaited, idempotent merge by stable identity. */
export async function restoreWorkspace(
  envelope: BackupEnvelope,
  options: { userId?: string | null; clearFirst?: boolean } = {},
): Promise<RestoreResult> {
  if (hasLocalSampleData()) throw new Error('Leave the sample workspace before restoring real data.');
  const plan = buildRestorePlan(envelope);
  if (options.clearFirst === false && plan.writes.some(write => write.key === HISTORICAL_REVISIONS_KEY ||
    write.key === HISTORICAL_COVERAGE_KEY || Object.values(historicalSources).some(source => source.key === write.key)))
    throw new Error('Historical restore must replace the covered browser workspace so its revision chain remains complete. Nothing was changed.');
  if (typeof window === 'undefined' || !window.localStorage) throw new Error('Browser storage is unavailable. Nothing was changed.');
  assertNoPendingRestore();
  const cloud = envelope.cloudData as { user_id?: string; data?: Record<string, RecordData[]> } | undefined;
  if (options.userId && cloud?.user_id && cloud.user_id !== options.userId) throw new Error('This backup belongs to another account. Sign in to its original account before restoring.');
  const snapshot = snapshotWorkspace();
  const desired: Record<string, string | null> = options.clearFirst === false ? {} : Object.fromEntries(Object.keys(snapshot).map(key => [key, null]));
  for (const write of plan.writes) desired[write.key] = write.value;
  const coveredKeys = new Set<string>(Object.values(historicalSources).map(source => source.key));
  const hasCoveredData = plan.writes.some(write => coveredKeys.has(write.key));
  const hasArchivedHistory=plan.writes.some(write=>[HISTORICAL_REVISIONS_KEY,HISTORICAL_COVERAGE_KEY,
    'memoire.cloudStateRevisions.v1','memoire.cloudHistoryCoverage.v1'].includes(write.key));
  const restoreAccountHistory=Boolean(options.userId&&(hasCoveredData||hasArchivedHistory)&&supabaseClient?.rpc);
  if(options.userId&&hasArchivedHistory&&!restoreAccountHistory)
    throw new Error('Transactional account history restore is unavailable. Nothing was changed. Keep this backup.');
  const hasHistory = desired[HISTORICAL_REVISIONS_KEY] !== undefined || desired[HISTORICAL_COVERAGE_KEY] !== undefined;
  if (!hasHistory) {
    const collections = Object.fromEntries(plan.writes.filter(write => coveredKeys.has(write.key))
      .map(write => [write.key, JSON.parse(write.value) as unknown]));
    const scope = options.userId || 'guest';
    const baseline = buildHistoricalBaselineFromCollections(collections, scope, new Date().toISOString());
    desired[HISTORICAL_REVISIONS_KEY] = JSON.stringify(baseline.revisions);
    desired[HISTORICAL_COVERAGE_KEY] = JSON.stringify(baseline.coverage);
  }
  // Build every cloud request before the first local mutation, so a broken codec cannot half-restore.
  const requests = plan.writes.flatMap(write => {
    const contract = contractForKey(write.key);
    if (!contract || !options.userId) return [];
    const records = JSON.parse(write.value) as RecordData[];
    const originals = cloud?.data?.[contract.table] || [];
    const originalById = new Map(originals.map(row => [contract.kind === 'target' ? `${row.fiscal_year}:${row.period}` : row.id, row]));
    const rows = records.filter(r => !isSampleRecord(r)).map(record => {
      const original = originalById.get(contract.kind === 'target' ? `${record.fiscalYear}:${record.period}` : record.id);
      return { ...original, ...contract.encode(record, options.userId!) };
    });
    return [{ key: write.key, contract, rows }];
  });
  beginRestore();
  try {
    applyLocalRestore(window.localStorage, desired);
    const collections: RestoreCollectionResult[] = plan.writes.map(write => ({ key: write.key,
      before: countRecords(snapshot[write.key]), after: countRecords(write.value), localWritten: true,
      cloudPushed: null, message: '' }));
    let cloudPushedCount = 0;
    let cloudFailedCount = 0;
    if(restoreAccountHistory){
      try{
        await restoreCloudHistoricalScope(envelope,plan,options.userId!);
        for(const collection of collections.filter(c=>coveredKeys.has(c.key)||c.key==='memoire.accounts.v1')){
          collection.cloudPushed=true;cloudPushedCount++;
        }
      }catch(error){
        const current=snapshotWorkspace();
        const rollback:Record<string,string|null>=Object.fromEntries(Object.keys(current).map(key=>[key,null]));
        for(const [key,value] of Object.entries(snapshot))rollback[key]=value;
        try{applyLocalRestore(window.localStorage,rollback);}
        catch{throw new Error('Account history restore failed and browser rollback needs recovery. Reload before retrying; keep the backup.');}
        throw error;
      }
    }
    // A Decision may link an existing Plan item. Restore that item before the
    // Decision aggregate so its database scope trigger can verify the link.
    const restoreOrder=(table:string)=>table==='commercial_decisions'?canonicalContracts.length+1
      :table==='commercial_decision_observations'?canonicalContracts.length+2
      :canonicalContracts.findIndex(contract=>contract.table===table);
    for (const request of requests.sort((a,b) => restoreOrder(a.contract.table) - restoreOrder(b.contract.table))) {
      if(restoreAccountHistory&&(request.contract.table in historicalSources||request.contract.table==='accounts'))continue;
      const result = collections.find(c => c.key === request.key)!;
      try {
        if (!supabaseClient) throw new Error('The account connection is unavailable.');
        // Bounded requests; retrying a partial cloud merge uses the same IDs, never creates replacements.
        for (let start = 0; start < request.rows.length; start += 200) {
          const { error } = await supabaseClient.from(request.contract.table).upsert(request.rows.slice(start, start + 200), { onConflict: request.contract.conflict });
          if (error) throw new Error(error.message);
        }
        result.cloudPushed = true;
        cloudPushedCount++;
      } catch (error) {
        result.cloudPushed = false;
        result.message = 'Recovered in this browser, but this collection could not be saved to your account. Keep your backup and retry.';
        reportClientOperationalEvent({ eventName: 'cloud_json_sync_failed', component: 'workspaceRestore', operation: 'restore', table: request.contract.table, severity: 'error', error });
        cloudFailedCount++;
      }
    }
    const result: RestoreResult = {
      ok: cloudFailedCount === 0, collections, restoredRecords: plan.restoredRecords,
      droppedSampleRecords: plan.droppedSampleRecords, snapshot, cloudPushedCount, cloudFailedCount,
      summary: `${plan.restoredRecords} records recovered in this browser. ` + (options.userId
        ? restoreAccountHistory
          ? `Historical account state restored as one transaction; ${cloudFailedCount} other collections incomplete. Keep the backup. Local undo does not undo account changes.`
          : `${cloudPushedCount} collections merged into your account; ${cloudFailedCount} incomplete. Existing account records outside this backup remain. Local undo does not undo account merges.`
        : 'Browser recovery only; no account copy has been confirmed. Keep the backup before changing devices or signing in.'),
    };
    endRestore();
    invalidateWorkspaceDataCache();
    writeLocalCollection('memoire.restoreReceipt.v1', JSON.stringify({ ...result, snapshot: undefined }));
    return result;
  } finally { endRestore(); }
}

/** Local-only undo, with the same rollback boundary. Never reverses a cloud merge. */
export function undoRestore(snapshot: Record<string, string>): boolean {
  try {
    assertNoPendingRestore();
    const current = snapshotWorkspace();
    const desired: Record<string, string | null> = Object.fromEntries(Object.keys(current).map(key => [key, null]));
    for (const [key, value] of Object.entries(snapshot)) if (isRestorableWorkspaceKey(key)) desired[key] = value;
    applyLocalRestore(window.localStorage, desired);
    invalidateWorkspaceDataCache();
    return true;
  } catch { return false; }
}

export function snapshotWorkspace(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  if (typeof window === 'undefined' || !window.localStorage) return snapshot;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && isRestorableWorkspaceKey(key)) snapshot[key] = window.localStorage.getItem(key) || '';
  }
  return snapshot;
}

function countRecords(value: string | undefined): number | null {
  if (!value) return null;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.length : null; }
  catch { return null; }
}

function assertNoPendingRestore() {
  if (window.localStorage.getItem(RESTORE_JOURNAL_KEY)) throw new Error('Reload to recover the interrupted restore before trying another restore or undo. Keep your backup and do not clear browser data.');
}
