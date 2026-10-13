import { supabaseClient } from '../lib/supabaseClient.ts';
import { getLocalWorkspaceOwner } from './localWorkspaceOwner.ts';
import { requireLocalWrite, writeLocalRecords } from './localWriteGuard.ts';
import { claimLocalCollectionForUser, loadCloudJsonCollection, upsertCloudJsonCollection } from './cloudJsonCollectionStore.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';
import type { CrmLiteOpportunity } from './opportunityStore.ts';
import { resolveBrandSelection } from '../domain/portfolio/brandSelection.ts';
import { portfolioAssignments, portfolioNodes } from '../domain/portfolio/portfolioCatalog.ts';
import { suggestPortfolioNode } from '../domain/portfolio/portfolioCatalog.ts';
import { brandKey } from '../utils/brandIdentity.ts';
import { invalidateWorkspaceCollection } from './workspaceDataCache.ts';
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
  invalidateWorkspaceCollection('portfolioRecords');
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
    if (opportunity.brand?.trim() && !input.state.brandId) throw new Error('Choose a Brand or Others. A recorded brand name must keep a catalog link.');
    const brand = portfolioNodes(readPortfolio(scope)).find(row => row.id === input.state.brandId && row.kind === 'brand');
    if (brand?.name === 'Others' && !input.state.originalBrand?.trim()) throw new Error('Enter the manual brand name in the source record before classifying it as Others.');
  }
  const current = readPortfolio(scope);
  const next = changePortfolioRecord({ ...input, records: current, at: new Date().toISOString(), sample: scope.sampleDataActive });
  persist(scope, next);
  const changed = next.find(record => record.id === input.id)!;
  return sync(scope, [changed]).then(result => ({ ...result, records: next }));
}

export async function prepareOpportunityBrand(scope: PortfolioScope, input: { brand?: string; brandCatalogId?: string }, opportunityId?: string, previousBrand?: string) {
  if (!input.brand?.trim() && !input.brandCatalogId && (!opportunityId || !window.localStorage.getItem(PORTFOLIO_STORAGE_KEY))) return { brand: '', node: null, others: false, cloudState:'local' as const };
  const catalog = await loadPortfolio(scope);
  return {...resolveBrandSelection(catalog.records, input, opportunityId, previousBrand),cloudState:catalog.cloud};
}

/** Re-read at commit time to preserve independent product/BU classifications. */
export async function linkOpportunityBrand(scope: PortfolioScope, opportunity: CrmLiteOpportunity, selection: ReturnType<typeof resolveBrandSelection> & { preserveOriginal?: boolean }) {
  if (!selection.brand && !window.localStorage.getItem(PORTFOLIO_STORAGE_KEY)) return null;
  let records = readPortfolio(scope);
  const old = portfolioAssignments(records).find(row => row.opportunityId === opportunity.id);
  if (!selection.brand && !old) return null;
  let brandId = selection.node?.id || null;
  // Imports save several deals concurrently. Another save may have created
  // Others since this selection was prepared; reuse that catalog identity.
  if (selection.others && !brandId) brandId = suggestPortfolioNode(records, 'brand', 'Others')?.id || null;
  if (selection.others && !brandId) {
    const catalog = await savePortfolio(scope, { id: `${scope.sampleDataActive ? 'sample-' : ''}portfolio-${crypto.randomUUID()}`, expectedVersion: 0,
      state: { kind: 'brand', name: 'Others', code: '', description: 'Brands entered manually outside the catalog.', status: 'active', parentId: null, brandId: null, groupId: null, aliases: [] } });
    brandId = catalog.records.find(row => row.kind === 'brand' && row.name === 'Others')!.id;
    records = readPortfolio(scope);
  }
  const current = portfolioAssignments(records).find(row => row.opportunityId === opportunity.id);
  const originalBrand = selection.preserveOriginal && current ? current.originalBrand : selection.brand;
  if (current?.brandId === brandId && current?.originalBrand === originalBrand) return null;
  return savePortfolio(scope, { id: current?.id || `${scope.sampleDataActive ? 'sample-' : ''}portfolio-assignment:${opportunity.id}`,
    expectedVersion: current?.version || 0, opportunity,
    state: { kind: 'assignment', opportunityId: opportunity.id, businessUnitId: current?.businessUnitId || null,
      brandId, groupId: current?.groupId || null, productId: current?.productId || null,
      originalBrand, originalProduct: current?.originalProduct ?? opportunity.productOrSolution ?? '' } });
}

/** Operator accepts one exact legacy spelling; existing classifications are never replaced. */
export async function registerLegacyBrand(scope: PortfolioScope, name: string, opportunities: CrmLiteOpportunity[]): Promise<PortfolioLoad> {
  let catalog = await loadPortfolio(scope);
  let node = suggestPortfolioNode(catalog.records, 'brand', name);
  if (!node) {
    catalog = await savePortfolio(scope, { id: `${scope.sampleDataActive ? 'sample-' : ''}portfolio-${crypto.randomUUID()}`, expectedVersion: 0,
      state: { kind: 'brand', name, code: '', description: '', status: 'active', parentId: null, brandId: null, groupId: null, aliases: [] } });
    node = suggestPortfolioNode(catalog.records, 'brand', name)!;
  }
  let unavailable = catalog.cloud === 'unavailable';
  for (const opportunity of opportunities) {
    if ((opportunity.isSample === true || opportunity.source === 'demo') !== scope.sampleDataActive
      || brandKey(opportunity.brand || '') !== brandKey(name)) continue;
    if (portfolioAssignments(readPortfolio(scope)).some(row => row.opportunityId === opportunity.id && row.brandId)) continue;
    const saved = await linkOpportunityBrand(scope, opportunity, { brand: opportunity.brand || '', node, others: false });
    if (saved) { catalog = saved; unavailable ||= saved.cloud === 'unavailable'; }
  }
  return { ...catalog, records: readPortfolio(scope), ...(unavailable ? { cloud: 'unavailable' as const, message: 'Brand links saved in this browser. Cloud sync is unavailable; reload the catalog to retry.' } : {}) };
}

/** Explicitly classifies one original legacy spelling as Others, never inventing a Brand. */
export async function classifyLegacyBrandAsOthers(scope: PortfolioScope, name: string, opportunities: CrmLiteOpportunity[]) {
  if (!name.trim()) throw new Error('Enter the manual Brand name.');
  let catalog = await loadPortfolio(scope);
  for (const opportunity of opportunities) {
    if ((opportunity.isSample === true || opportunity.source === 'demo') !== scope.sampleDataActive || brandKey(opportunity.brand || '') !== brandKey(name)) continue;
    if (portfolioAssignments(readPortfolio(scope)).some(row => row.opportunityId === opportunity.id && row.brandId)) continue;
    const selection = resolveBrandSelection(readPortfolio(scope), {brand: opportunity.brand,brandCatalogId:'__others__'});
    const linked = await linkOpportunityBrand(scope, opportunity, selection);
    if (linked) catalog = linked;
  }
  return {...catalog,records:readPortfolio(scope)};
}
