import { supabaseClient } from '../lib/supabaseClient.ts';
import { getLocalWorkspaceOwner } from './localWorkspaceOwner.ts';
import { requireLocalWrite, writeLocalRecords } from './localWriteGuard.ts';
import { claimLocalCollectionForUser, loadCloudJsonCollection, upsertCloudJsonCollection } from './cloudJsonCollectionStore.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';
import { changeSavedDashboard, mergeSavedDashboards, parseSavedDashboard, type DashboardState, type SavedDashboard } from '../domain/dashboards/dashboardRecord.ts';
import type { PortfolioScope } from './portfolioStore.ts';
export const DASHBOARD_STORAGE_KEY = 'memoire.dashboardDefinitions.v1';
export const DASHBOARD_UPDATED_EVENT = 'memoire:dashboards-updated';
export type DashboardLibrary = { records: SavedDashboard[]; message: string; cloud: 'local' | 'synced' | 'unavailable' };
export function assertDashboardScope(scope: PortfolioScope) {
  if (!scope.sampleDataActive && getLocalWorkspaceOwner() !== scope.userId) throw new Error('The workspace account changed. Reload before using dashboards.');
}
function readAll(): SavedDashboard[] {
  const raw: unknown = JSON.parse(window.localStorage.getItem(DASHBOARD_STORAGE_KEY) || '[]');
  if (!Array.isArray(raw)) throw new Error('Saved dashboards are unreadable. Restore a verified workspace backup before editing.');
  const records = raw.map(parseSavedDashboard);
  if (new Set(records.map(record => `${record.isSample}:${record.id}`)).size !== records.length) throw new Error('Duplicate saved dashboard identity.');
  return records;
}
export function readSavedDashboards(scope: PortfolioScope): SavedDashboard[] {
  assertDashboardScope(scope); return readAll().filter(record => record.isSample === scope.sampleDataActive);
}
function persist(scope: PortfolioScope, records: SavedDashboard[]) {
  assertDashboardScope(scope);
  const otherMode = readAll().filter(record => record.isSample !== scope.sampleDataActive);
  requireLocalWrite(writeLocalRecords(DASHBOARD_STORAGE_KEY, [...otherMode, ...records]));
  window.dispatchEvent(new CustomEvent(DASHBOARD_UPDATED_EVENT));
}
async function sync(scope: PortfolioScope, changed: SavedDashboard[], all: SavedDashboard[]): Promise<DashboardLibrary> {
  if (scope.sampleDataActive || !scope.userId) return { records: all, cloud: 'local', message: scope.sampleDataActive ? 'Demo dashboards saved only in this demo.' : 'Dashboards saved in this browser.' };
  try {
    assertDashboardScope(scope);
    if (!supabaseClient || !claimLocalCollectionForUser('dashboard_definitions', scope.userId)) throw new Error('Dashboard cloud connection unavailable.');
    await upsertCloudJsonCollection('dashboard_definitions', scope.userId, changed);
    assertDashboardScope(scope);
    return { records: all, cloud: 'synced', message: 'Dashboard definitions saved and cloud sync completed.' };
  } catch (error) {
    reportWorkspaceSyncError();
    return { records: all, cloud: 'unavailable', message: error instanceof Error && /conflict|diverged/i.test(error.message)
      ? 'Saved in this browser. Dashboard cloud revisions conflict; export a workspace backup before reconciling.'
      : 'Saved in this browser. Dashboard cloud sync is unavailable; retry before using another device.' };
  }
}
export async function loadSavedDashboards(scope: PortfolioScope): Promise<DashboardLibrary> {
  const local = readSavedDashboards(scope);
  if (scope.sampleDataActive || !scope.userId) return { records: local, cloud: 'local', message: scope.sampleDataActive ? 'Demo dashboard library. Separate from your real data.' : 'Dashboard library stored in this browser.' };
  let cloud: SavedDashboard[];
  try {
    if (!supabaseClient) throw new Error('Unavailable');
    cloud = await loadCloudJsonCollection<SavedDashboard>('dashboard_definitions', scope.userId);
  } catch {
    assertDashboardScope(scope); reportWorkspaceSyncError();
    return { records: readSavedDashboards(scope), cloud: 'unavailable', message: 'Using this browser’s dashboard library. Cloud sync is unavailable.' };
  }
  assertDashboardScope(scope);
  if (!claimLocalCollectionForUser('dashboard_definitions', scope.userId)) throw new Error('Dashboard ownership changed.');
  const merged = mergeSavedDashboards(readSavedDashboards(scope), cloud);
  persist(scope, merged);
  const owed = merged.filter(record => record.version > (cloud.find(row => row.id === record.id)?.version || 0));
  if (owed.length) return sync(scope, owed, merged);
  return { records: merged, cloud: 'synced', message: 'Dashboard library cloud sync completed.' };
}
export async function saveDashboardDefinition(scope: PortfolioScope, input: { id: string; state: DashboardState; expectedVersion: number }): Promise<DashboardLibrary> {
  const records = changeSavedDashboard(readSavedDashboards(scope), { ...input, sample: scope.sampleDataActive, at: new Date().toISOString() });
  persist(scope, records);
  return sync(scope, [records.find(row => row.id === input.id)!], records);
}
