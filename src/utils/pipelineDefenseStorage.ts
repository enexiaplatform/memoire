import { createInitialPipelineDefenseDeals, pipelineDefenseBriefMeta, type PipelineDefenseDeal } from '../data/pipelineDefenseBrief';
import { invalidateWorkspaceDataCache } from '../services/workspaceDataCache';
import { normalizeImportedDeal } from './importPipelineDefenseBrief';

export const MULTI_BRIEF_STORAGE_KEY = 'memoire.pipelineDefenseBriefs.v1';
export const LEGACY_LOCAL_STORAGE_KEY = 'memoire.pipelineDefenseBrief.v1';

export type PipelineDefenseBrief = {
  id: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  title: string;
  weekLabel: string;
  salesOwner: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
  deals: PipelineDefenseDeal[];
};

export type PipelineDefenseBriefStore = {
  activeBriefId: string;
  briefs: PipelineDefenseBrief[];
};

export function loadPipelineDefenseBriefStore(): PipelineDefenseBriefStore {
  const savedStore = loadNewStore();
  if (savedStore) return savedStore;

  const migratedStore = migrateLegacyDraft();
  if (migratedStore) {
    savePipelineDefenseBriefStore(migratedStore);
    return migratedStore;
  }

  return createDefaultPipelineDefenseBriefStore();
}

export function savePipelineDefenseBriefStore(store: PipelineDefenseBriefStore) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(MULTI_BRIEF_STORAGE_KEY, JSON.stringify(sanitizeStore(store)));
    invalidateWorkspaceDataCache();
    return true;
  } catch {
    return false;
  }
}

export function clearPipelineDefenseBriefStore() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.removeItem(MULTI_BRIEF_STORAGE_KEY);
    invalidateWorkspaceDataCache();
    return true;
  } catch {
    return false;
  }
}

export function createPipelineDefenseBrief(overrides: Partial<PipelineDefenseBrief> = {}): PipelineDefenseBrief {
  const now = new Date().toISOString();
  return {
    id: overrides.id || `brief-${Date.now()}`,
    source: overrides.source,
    isSample: overrides.isSample,
    title: overrides.title || 'New Pipeline Defense Brief',
    weekLabel: overrides.weekLabel || 'Current Week',
    salesOwner: overrides.salesOwner || pipelineDefenseBriefMeta.salesOwner,
    scope: overrides.scope || pipelineDefenseBriefMeta.scope,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    deals: overrides.deals ? cloneDeals(overrides.deals) : createInitialPipelineDefenseDeals(),
  };
}

export function duplicatePipelineDefenseBrief(brief: PipelineDefenseBrief): PipelineDefenseBrief {
  const now = new Date().toISOString();
  return {
    ...brief,
    id: `brief-${Date.now()}`,
    title: `${brief.title} Copy`,
    createdAt: now,
    updatedAt: now,
    deals: cloneDeals(brief.deals),
  };
}

export function updatePipelineDefenseBrief(
  store: PipelineDefenseBriefStore,
  briefId: string,
  patch: Partial<PipelineDefenseBrief>,
): PipelineDefenseBriefStore {
  const now = new Date().toISOString();
  return {
    ...store,
    briefs: store.briefs.map((brief) => (
      brief.id === briefId
        ? { ...brief, ...patch, id: brief.id, createdAt: brief.createdAt, updatedAt: now }
        : brief
    )),
  };
}

export function deletePipelineDefenseBrief(store: PipelineDefenseBriefStore, briefId: string): PipelineDefenseBriefStore {
  const remainingBriefs = store.briefs.filter((brief) => brief.id !== briefId);

  if (remainingBriefs.length === 0) {
    const freshBrief = createPipelineDefenseBrief({ title: 'Sample Pipeline Defense Brief', weekLabel: pipelineDefenseBriefMeta.week, isSample: true });
    return { activeBriefId: freshBrief.id, briefs: [freshBrief] };
  }

  const activeBriefId = store.activeBriefId === briefId ? remainingBriefs[0].id : store.activeBriefId;
  return { activeBriefId, briefs: remainingBriefs };
}

export function getActivePipelineDefenseBrief(store: PipelineDefenseBriefStore) {
  return store.briefs.find((brief) => brief.id === store.activeBriefId) || store.briefs[0] || null;
}

export function createDefaultPipelineDefenseBriefStore(): PipelineDefenseBriefStore {
  // The starter brief is a template to explore, not the user's work - marking
  // it as sample keeps Today's "has real data" check honest for new users.
  const brief = createPipelineDefenseBrief({
    title: 'Sample Pipeline Defense Brief',
    weekLabel: pipelineDefenseBriefMeta.week,
    salesOwner: pipelineDefenseBriefMeta.salesOwner,
    scope: pipelineDefenseBriefMeta.scope,
    deals: createInitialPipelineDefenseDeals(),
    isSample: true,
  });

  return {
    activeBriefId: brief.id,
    briefs: [brief],
  };
}

function loadNewStore() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(MULTI_BRIEF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return sanitizeStore(parsed);
  } catch {
    return null;
  }
}

function migrateLegacyDraft() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const brief = createPipelineDefenseBrief({
      title: 'Migrated Pipeline Defense Brief',
      weekLabel: 'Current Week',
      salesOwner: 'Sales owner',
      scope: 'Demo review pipeline',
      deals: parsed.map((item) => normalizeImportedDeal(item as Partial<PipelineDefenseDeal>)),
    });

    return {
      activeBriefId: brief.id,
      briefs: [brief],
    };
  } catch {
    return null;
  }
}

function sanitizeStore(value: unknown): PipelineDefenseBriefStore | null {
  if (!value || typeof value !== 'object') return null;
  const maybeStore = value as Partial<PipelineDefenseBriefStore>;
  if (!Array.isArray(maybeStore.briefs)) return null;

  const briefs = maybeStore.briefs
    .map(sanitizeBrief)
    .filter((brief): brief is PipelineDefenseBrief => Boolean(brief));

  if (briefs.length === 0) return null;
  const activeBriefId = briefs.some((brief) => brief.id === maybeStore.activeBriefId)
    ? maybeStore.activeBriefId as string
    : briefs[0].id;

  return { activeBriefId, briefs };
}

function sanitizeBrief(value: unknown): PipelineDefenseBrief | null {
  if (!value || typeof value !== 'object') return null;
  const maybeBrief = value as Partial<PipelineDefenseBrief>;
  const now = new Date().toISOString();
  const id = typeof maybeBrief.id === 'string' && maybeBrief.id ? maybeBrief.id : `brief-${Date.now()}`;
  const deals = Array.isArray(maybeBrief.deals)
    ? maybeBrief.deals.map((item) => normalizeImportedDeal(item as Partial<PipelineDefenseDeal>))
    : [];

  return {
    id,
    source: normalizeSource(maybeBrief.source),
    isSample: maybeBrief.isSample === true,
    title: typeof maybeBrief.title === 'string' && maybeBrief.title ? maybeBrief.title : 'Pipeline Defense Brief',
    weekLabel: typeof maybeBrief.weekLabel === 'string' && maybeBrief.weekLabel ? maybeBrief.weekLabel : 'Current Week',
    salesOwner: normalizeLegacySalesOwner(maybeBrief.salesOwner),
    scope: typeof maybeBrief.scope === 'string' && maybeBrief.scope ? maybeBrief.scope : 'Demo review pipeline',
    createdAt: typeof maybeBrief.createdAt === 'string' && maybeBrief.createdAt ? maybeBrief.createdAt : now,
    updatedAt: typeof maybeBrief.updatedAt === 'string' && maybeBrief.updatedAt ? maybeBrief.updatedAt : now,
    deals,
  };
}

function normalizeLegacySalesOwner(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim() === 'Henry') return 'Sales owner';
  return value.trim();
}

function normalizeSource(value: unknown): PipelineDefenseBrief['source'] {
  return value === 'demo' ? 'demo' : value === 'user' ? 'user' : undefined;
}

function cloneDeals(deals: PipelineDefenseDeal[]) {
  return deals.map((deal) => ({
    ...deal,
    riskType: [...deal.riskType],
    evidence: [...deal.evidence],
    missingContext: [...deal.missingContext],
    objectionDebt: { ...deal.objectionDebt },
  }));
}
