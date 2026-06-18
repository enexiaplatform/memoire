import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import {
  claimLocalCollectionForUser,
  deleteCloudJsonRecordForCurrentUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
  upsertCloudJsonCollection,
} from './cloudJsonCollectionStore';

export const SALES_ASSET_STORAGE_KEY = 'memoire.salesAssets.v1';
export const SALES_ASSET_DRAFT_STORAGE_KEY = 'memoire.salesAssets.draft.v1';

export type SalesAssetType =
  | 'Proof Asset'
  | 'Case Study'
  | 'Email Template'
  | 'Proposal Snippet'
  | 'Objection Response'
  | 'Competitor Response'
  | 'Compliance Note'
  | 'Procurement Justification'
  | 'Validation / Documentation Note'
  | 'Discovery Question Set'
  | 'Follow-up Script';

export type SalesAssetRecord = {
  id: string;
  title: string;
  assetType: SalesAssetType;
  content: string;
  summary: string;
  tags: string[];
  relatedAccountName?: string;
  relatedOpportunityId?: string;
  relatedOpportunityName?: string;
  relatedObjectionType?: string;
  relatedPlaybookPatternId?: string;
  relatedPlaybookPatternTitle?: string;
  useCase: string;
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
};

export type SalesAssetInput = Omit<SalesAssetRecord, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const salesAssetTypes: SalesAssetType[] = [
  'Proof Asset',
  'Case Study',
  'Email Template',
  'Proposal Snippet',
  'Objection Response',
  'Competitor Response',
  'Compliance Note',
  'Procurement Justification',
  'Validation / Documentation Note',
  'Discovery Question Set',
  'Follow-up Script',
];

export const emptySalesAssetInput: SalesAssetInput = {
  title: '',
  assetType: 'Proof Asset',
  content: '',
  summary: '',
  tags: [],
  relatedAccountName: '',
  relatedOpportunityId: '',
  relatedOpportunityName: '',
  relatedObjectionType: '',
  relatedPlaybookPatternId: '',
  relatedPlaybookPatternTitle: '',
  useCase: '',
  source: 'user',
  isSample: false,
};

export function loadSalesAssets(): SalesAssetRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SALES_ASSET_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeAsset).filter(Boolean) as SalesAssetRecord[];
  } catch {
    return [];
  }
}

export async function loadSalesAssetsForUser(userId: string) {
  const local = loadSalesAssets();
  const cloud = await loadCloudJsonCollection<SalesAssetRecord>('sales_assets', userId);
  const recordsToMerge = claimLocalCollectionForUser('sales_assets', userId) ? local : [];
  const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
    .map(sanitizeAsset)
    .filter((asset): asset is SalesAssetRecord => Boolean(asset));
  persistSalesAssets(merged, false);
  await upsertCloudJsonCollection('sales_assets', userId, merged);
  return merged;
}

export function saveSalesAssets(assets: SalesAssetRecord[]) {
  return persistSalesAssets(assets, true);
}

function persistSalesAssets(assets: SalesAssetRecord[], syncCloud: boolean) {
  if (typeof window === 'undefined') return false;
  try {
    const sanitized = assets.map(sanitizeAsset).filter((asset): asset is SalesAssetRecord => Boolean(asset));
    window.localStorage.setItem(SALES_ASSET_STORAGE_KEY, JSON.stringify(sanitized));
    if (syncCloud) syncCloudJsonCollectionForCurrentUser('sales_assets', sanitized);
    invalidateWorkspaceDataCache();
    return true;
  } catch {
    return false;
  }
}

export function createSalesAsset(input: SalesAssetInput) {
  const now = new Date().toISOString();
  const asset = sanitizeAsset({
    ...input,
    id: input.id || createAssetId(input.title),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }) as SalesAssetRecord;

  saveSalesAssets([
    asset,
    ...loadSalesAssets().filter((item) => item.id !== asset.id),
  ]);
  return asset;
}

export function updateSalesAsset(asset: SalesAssetRecord, input: SalesAssetInput) {
  const updated = sanitizeAsset({
    ...asset,
    ...input,
    id: asset.id,
    createdAt: asset.createdAt,
    updatedAt: new Date().toISOString(),
  }) as SalesAssetRecord;

  saveSalesAssets(loadSalesAssets().map((item) => (item.id === asset.id ? updated : item)));
  return updated;
}

export function deleteSalesAsset(assetId: string) {
  const saved = saveSalesAssets(loadSalesAssets().filter((item) => item.id !== assetId));
  deleteCloudJsonRecordForCurrentUser('sales_assets', assetId);
  return saved;
}

export function saveSalesAssetDraft(input: SalesAssetInput) {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(SALES_ASSET_DRAFT_STORAGE_KEY, JSON.stringify(input));
    return true;
  } catch {
    return false;
  }
}

export function loadSalesAssetDraft(): SalesAssetInput | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SALES_ASSET_DRAFT_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const asset = sanitizeAsset({
      ...emptySalesAssetInput,
      ...parsed,
      id: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (!asset) return null;
    const { id, createdAt, updatedAt, ...draft } = asset;
    void id;
    void createdAt;
    void updatedAt;
    return draft;
  } catch {
    return null;
  }
}

export function clearSalesAssetDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SALES_ASSET_DRAFT_STORAGE_KEY);
  } catch {
    // Draft cleanup is best-effort only.
  }
}

function sanitizeAsset(raw: Partial<SalesAssetRecord> | null): SalesAssetRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const now = new Date().toISOString();
  const title = String(raw.title || '').trim();
  if (!title) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createAssetId(title),
    title,
    assetType: isSalesAssetType(raw.assetType) ? raw.assetType : 'Proof Asset',
    content: String(raw.content || '').trim(),
    summary: String(raw.summary || '').trim(),
    tags: normalizeTags(raw.tags),
    relatedAccountName: String(raw.relatedAccountName || '').trim(),
    relatedOpportunityId: String(raw.relatedOpportunityId || '').trim(),
    relatedOpportunityName: String(raw.relatedOpportunityName || '').trim(),
    relatedObjectionType: String(raw.relatedObjectionType || '').trim(),
    relatedPlaybookPatternId: String(raw.relatedPlaybookPatternId || '').trim(),
    relatedPlaybookPatternTitle: String(raw.relatedPlaybookPatternTitle || '').trim(),
    useCase: String(raw.useCase || '').trim(),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    source: raw.source === 'demo' ? 'demo' : raw.source === 'user' ? 'user' : undefined,
    isSample: raw.isSample === true,
  };
}

function isSalesAssetType(value: unknown): value is SalesAssetType {
  return salesAssetTypes.includes(value as SalesAssetType);
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) return unique(value.map((item) => String(item)));
  if (typeof value === 'string') return splitCommaList(value);
  return [];
}

export function splitCommaList(value: string) {
  return unique(value.split(',').map((item) => item.trim()));
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function createAssetId(title: string) {
  return `asset-${slugify(title)}-${Date.now()}`;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70) || 'sales-asset';
}
