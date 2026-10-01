import { supabaseClient } from '../lib/supabaseClient.ts';
import { getLocalWorkspaceOwner } from './localWorkspaceOwner.ts';
import { requireLocalWrite, writeLocalRecords } from './localWriteGuard.ts';
import { claimLocalCollectionForUser, loadCloudJsonCollection, upsertCloudJsonCollection } from './cloudJsonCollectionStore.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';
import type { CrmLiteOpportunity } from './opportunityStore.ts';
import { changePortfolioRecord, mergePortfolioRecords, parsePortfolioRecord, validatePortfolioCatalog, type PortfolioData, type PortfolioRecord } from '../domain/portfolio/portfolioCatalog.ts';

export const PORTFOLIO_STORAGE_KEY = 'memoire.portfolioRecords.v1';
export const PORTFOLIO_UPDATED_EVENT = 'memoire:portfolio-updated';
export type PortfolioScope = { userId: string | null; sampleDataActive: boolean };
export type PortfolioLoad = { records: PortfolioRecord[]; cloud: 'synced' | 'unavailable' | 'local'; message: string };

function checkScope(scope: PortfolioScope) {
  const owner = getLocalWorkspaceOwner();
  if (!scope.sampleDataActive && owner !== scope.userId) throw new Error('The workspace account changed. Reload before reading or saving the catalog.');
}
function readAll(): PortfolioRecord[] {
  if (typeof window === 'undefined') throw new Error('Local storage is unavailable.');
  const parsed: unknown = JSON.parse(window.localStorage.getItem(PORTFOLIO_STORAGE_KEY) || '[]');
  if (!Array.isArray(parsed)) throw new Error('The portfolio catalog is unreadable. Restore a verified backup before editing.');
  return parsed.map(parsePortfolioRecord);
}
export function readPortfolio(scope: PortfolioScope): PortfolioRecord[] {
  checkScope(scope);
  const records = readAll().filter(record => record.isSample === scope.sampleDataActive);
  validatePortfolioCatalog(records);
  return records;
}
function persist(scope: PortfolioScope, records: PortfolioRecord[]) {
  checkScope(scope); validatePortfolioCatalog(records);
  const otherMode = readAll().filter(record => record.isSample !== scope.sampleDataActive);
  requireLocalWrite(writeLocalRecords(PORTFOLIO_STORAGE_KEY, [...otherMode, ...records]));
  window.dispatchEvent(new CustomEvent(PORTFOLIO_UPDATED_EVENT));
}
async function sync(scope: PortfolioScope, records: PortfolioRecord[]): Promise<PortfolioLoad> {
  if (scope.sampleDataActive || !scope.userId) return { records, cloud: 'local', message: scope.sampleDataActive ? 'Demo catalog. Changes stay in this demo.' : 'Saved in this browser.' };
  try {
    checkScope(scope);
    if (!supabaseClient) throw new Error('Cloud connection is unavailable.');
    if (!claimLocalCollectionForUser('portfolio_records', scope.userId)) throw new Error('The catalog belongs to another account.');
    await upsertCloudJsonCollection('portfolio_records', scope.userId, records);
    checkScope(scope);
    return { records, cloud: 'synced', message: 'Catalog saved and cloud sync completed.' };
  } catch (error) {
    reportWorkspaceSyncError();
    return { records, cloud: 'unavailable', message: error instanceof Error && /conflict|diverged/i.test(error.message)
      ? 'Saved in this browser, but a different cloud revision was found. Export a backup, then reload and reconcile the catalog before using another device.'
      : 'Saved in this browser. Catalog cloud sync is unavailable; retry before using another device.' };
  }
}
export async function loadPortfolio(scope: PortfolioScope): Promise<PortfolioLoad> {
  const local = readPortfolio(scope);
  if (scope.sampleDataActive || !scope.userId) return { records: local, cloud: 'local', message: scope.sampleDataActive ? 'Demo catalog. Separate from your real data.' : 'Catalog stored in this browser.' };
  try {
    if (!supabaseClient) throw new Error('Cloud unavailable');
    const cloud = (await loadCloudJsonCollection<PortfolioRecord>('portfolio_records', scope.userId)).map(parsePortfolioRecord);
    checkScope(scope);
    if (!claimLocalCollectionForUser('portfolio_records', scope.userId)) throw new Error('Catalog ownership changed.');
    // Re-read after the request so edits made while loading cannot be overwritten.
    const merged = mergePortfolioRecords(readPortfolio(scope), cloud);
    validatePortfolioCatalog(merged); persist(scope, merged);
    const owed = merged.filter(record => record.version > (cloud.find(item => item.id === record.id)?.version || 0));
    if (owed.length) return sync(scope, owed).then(result => ({ ...result, records: merged }));
    return { records: merged, cloud: 'synced', message: 'Catalog cloud sync completed.' };
  } catch (error) {
    checkScope(scope);
    // Invalid cloud data is not permission to replace it with an empty catalog.
    if (error instanceof Error && /portfolio|catalog|reference|hierarchy/i.test(error.message)) throw error;
    reportWorkspaceSyncError();
    return { records: readPortfolio(scope), cloud: 'unavailable', message: 'Using this browser’s catalog. Cloud sync is unavailable; retry to check for changes on another device.' };
  }
}
export async function savePortfolio(scope: PortfolioScope, input: { id: string; state: PortfolioData; expectedVersion: number; opportunity?: CrmLiteOpportunity }): Promise<PortfolioLoad> {
  if (input.state.kind === 'assignment') {
    const opportunity = input.opportunity;
    if (!opportunity || opportunity.id !== input.state.opportunityId
      || (opportunity.isSample === true || opportunity.source === 'demo') !== scope.sampleDataActive
      || (!scope.sampleDataActive && opportunity.userId && opportunity.userId !== scope.userId)) throw new Error('Only an opportunity from this workspace can be classified.');
  }
  const current = readPortfolio(scope);
  const next = changePortfolioRecord({ ...input, records: current, at: new Date().toISOString(), sample: scope.sampleDataActive });
  persist(scope, next);
  const changed = next.find(record => record.id === input.id)!;
  return sync(scope, [changed]).then(result => ({ ...result, records: next }));
}
