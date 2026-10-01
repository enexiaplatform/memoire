import { supabaseClient } from '../lib/supabaseClient.ts';
import { getLocalWorkspaceOwner } from './localWorkspaceOwner.ts';
import { requireLocalWrite, writeLocalRecords } from './localWriteGuard.ts';
import { claimLocalCollectionForUser, loadCloudJsonCollection, upsertCloudJsonCollection } from './cloudJsonCollectionStore.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';
import { changeSavedReport, mergeSavedReports, parseSavedReport, type ReportState, type SavedReport } from '../domain/reports/reportRecord.ts';
import type { PortfolioScope } from './portfolioStore.ts';
export const REPORT_STORAGE_KEY = 'memoire.reportDefinitions.v1';
export const REPORT_UPDATED_EVENT = 'memoire:reports-updated';
export type ReportLibrary = { records: SavedReport[]; message: string; cloud: 'local' | 'synced' | 'unavailable' };
export function assertReportScope(scope: PortfolioScope) {
  if (!scope.sampleDataActive && getLocalWorkspaceOwner() !== scope.userId) throw new Error('The workspace account changed. Reload before using reports.');
}
function readAll(): SavedReport[] {
  const raw: unknown = JSON.parse(window.localStorage.getItem(REPORT_STORAGE_KEY) || '[]');
  if (!Array.isArray(raw)) throw new Error('Saved reports are unreadable. Restore a verified workspace backup before editing.');
  const records = raw.map(parseSavedReport);
  if (new Set(records.map(record => `${record.isSample}:${record.id}`)).size !== records.length) throw new Error('Duplicate saved report identity.');
  return records;
}
export function readSavedReports(scope: PortfolioScope): SavedReport[] {
  assertReportScope(scope); return readAll().filter(record => record.isSample === scope.sampleDataActive);
}
function persist(scope: PortfolioScope, records: SavedReport[]) {
  assertReportScope(scope);
  const otherMode = readAll().filter(record => record.isSample !== scope.sampleDataActive);
  requireLocalWrite(writeLocalRecords(REPORT_STORAGE_KEY, [...otherMode, ...records]));
  window.dispatchEvent(new CustomEvent(REPORT_UPDATED_EVENT));
}
async function sync(scope: PortfolioScope, changed: SavedReport[], all: SavedReport[]): Promise<ReportLibrary> {
  if (scope.sampleDataActive || !scope.userId) return { records: all, cloud: 'local', message: scope.sampleDataActive ? 'Demo reports saved only in this demo.' : 'Reports saved in this browser.' };
  try {
    assertReportScope(scope);
    if (!supabaseClient || !claimLocalCollectionForUser('report_definitions', scope.userId)) throw new Error('Report cloud connection unavailable.');
    await upsertCloudJsonCollection('report_definitions', scope.userId, changed);
    assertReportScope(scope);
    return { records: all, cloud: 'synced', message: 'Report definitions saved and cloud sync completed.' };
  } catch (error) {
    reportWorkspaceSyncError();
    return { records: all, cloud: 'unavailable', message: error instanceof Error && /conflict|diverged/i.test(error.message)
      ? 'Saved in this browser. Report cloud revisions conflict; export a workspace backup before reconciling.'
      : 'Saved in this browser. Report cloud sync is unavailable; retry before using another device.' };
  }
}
export async function loadSavedReports(scope: PortfolioScope): Promise<ReportLibrary> {
  const local = readSavedReports(scope);
  if (scope.sampleDataActive || !scope.userId) return { records: local, cloud: 'local', message: scope.sampleDataActive ? 'Demo report library. Separate from your real data.' : 'Report library stored in this browser.' };
  let cloud: SavedReport[];
  try {
    if (!supabaseClient) throw new Error('Unavailable');
    cloud = await loadCloudJsonCollection<SavedReport>('report_definitions', scope.userId);
  } catch {
    assertReportScope(scope); reportWorkspaceSyncError();
    return { records: readSavedReports(scope), cloud: 'unavailable', message: 'Using this browser’s report library. Cloud sync is unavailable.' };
  }
  assertReportScope(scope);
  if (!claimLocalCollectionForUser('report_definitions', scope.userId)) throw new Error('Report ownership changed.');
  const merged = mergeSavedReports(readSavedReports(scope), cloud);
  persist(scope, merged);
  const owed = merged.filter(record => record.version > (cloud.find(row => row.id === record.id)?.version || 0));
  if (owed.length) return sync(scope, owed, merged);
  return { records: merged, cloud: 'synced', message: 'Report library cloud sync completed.' };
}
export async function saveReportDefinition(scope: PortfolioScope, input: { id: string; state: ReportState; expectedVersion: number }): Promise<ReportLibrary> {
  const records = changeSavedReport(readSavedReports(scope), { ...input, sample: scope.sampleDataActive, at: new Date().toISOString() });
  persist(scope, records);
  return sync(scope, [records.find(row => row.id === input.id)!], records);
}
