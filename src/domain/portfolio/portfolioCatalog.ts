import { brandKey } from '../../utils/brandIdentity.ts';

export const PORTFOLIO_SCHEMA_VERSION = 1;
export const portfolioKinds = ['unit', 'brand', 'group', 'product'] as const;
export type PortfolioKind = typeof portfolioKinds[number];
export type PortfolioNodeData = {
  kind: PortfolioKind;
  name: string;
  code: string;
  description: string;
  status: 'active' | 'retired';
  parentId: string | null;
  brandId: string | null;
  groupId: string | null;
  aliases: string[];
};
export type PortfolioAssignmentData = {
  kind: 'assignment';
  opportunityId: string;
  businessUnitId: string | null;
  brandId: string | null;
  groupId: string | null;
  productId: string | null;
  originalBrand: string;
  originalProduct: string;
};
export type PortfolioData = PortfolioNodeData | PortfolioAssignmentData;
export type PortfolioRevision = { version: number; changedAt: string; state: PortfolioData };
export type PortfolioRecord = PortfolioData & {
  id: string;
  schemaVersion: 1;
  version: number;
  createdAt: string;
  updatedAt: string;
  source: 'user' | 'demo';
  isSample: boolean;
  history: PortfolioRevision[];
};
export type PortfolioNode = PortfolioRecord & PortfolioNodeData;
export type PortfolioAssignment = PortfolioRecord & PortfolioAssignmentData;

function string(value: unknown, field: string, limit = 2000): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`Invalid portfolio ${field}.`);
  return value;
}
function reference(value: unknown, field: string): string | null {
  return value === null ? null : string(value, field, 200) || null;
}
function data(value: unknown): PortfolioData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid portfolio record.');
  const raw = value as Record<string, unknown>;
  if (raw.kind === 'assignment') {
    const opportunityId = string(raw.opportunityId, 'opportunity', 200);
    if (!opportunityId.trim()) throw new Error('Choose an opportunity.');
    return { kind: 'assignment', opportunityId,
      businessUnitId: reference(raw.businessUnitId, 'business unit'), brandId: reference(raw.brandId, 'brand'),
      groupId: reference(raw.groupId, 'product group'), productId: reference(raw.productId, 'product'),
      originalBrand: string(raw.originalBrand, 'original brand'), originalProduct: string(raw.originalProduct, 'original product') };
  }
  if (!(portfolioKinds as readonly unknown[]).includes(raw.kind)) throw new Error('Unsupported portfolio kind.');
  const name = string(raw.name, 'name', 200).trim();
  if (!name) throw new Error('Enter a name.');
  if (raw.status !== 'active' && raw.status !== 'retired') throw new Error('Unsupported portfolio status.');
  if (!Array.isArray(raw.aliases) || raw.aliases.length > 50) throw new Error('Invalid portfolio aliases.');
  const aliases = raw.aliases.map(alias => string(alias, 'alias', 200).trim()).filter(Boolean);
  return { kind: raw.kind as PortfolioKind, name, code: string(raw.code, 'code', 100).trim(),
    description: string(raw.description, 'description'), status: raw.status,
    parentId: reference(raw.parentId, 'parent'), brandId: reference(raw.brandId, 'brand'),
    groupId: reference(raw.groupId, 'group'), aliases: [...new Set(aliases)] };
}

/** Unknown versions and corrupt histories are errors, never silently empty catalogs. */
export function parsePortfolioRecord(value: unknown): PortfolioRecord {
  const state = data(value);
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) throw new Error('Unsupported portfolio version. Update Memoire before reading this catalog.');
  const id = string(raw.id, 'id', 200);
  if (!id || !Number.isInteger(raw.version) || Number(raw.version) < 1) throw new Error('Invalid portfolio identity/version.');
  const createdAt = string(raw.createdAt, 'created timestamp');
  const updatedAt = string(raw.updatedAt, 'updated timestamp');
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt)) || updatedAt < createdAt) throw new Error('Invalid portfolio timestamps.');
  if (!['user', 'demo'].includes(String(raw.source)) || typeof raw.isSample !== 'boolean'
    || (raw.source === 'demo') !== raw.isSample) throw new Error('Invalid portfolio data mode.');
  if (!Array.isArray(raw.history) || raw.history.length !== Number(raw.version) - 1) throw new Error('Incomplete portfolio change history.');
  let previous = createdAt;
  const history = raw.history.map((revision, index) => {
    if (!revision || revision.version !== index + 1 || typeof revision.changedAt !== 'string'
      || !Number.isFinite(Date.parse(revision.changedAt)) || revision.changedAt < previous || revision.changedAt > updatedAt) throw new Error('Invalid portfolio change history.');
    const prior = data(revision.state);
    if (prior.kind !== state.kind || (state.kind === 'assignment' && prior.kind === 'assignment' && prior.opportunityId !== state.opportunityId)) throw new Error('Portfolio identity changed in history.');
    previous = revision.changedAt;
    return { version: index + 1, changedAt: revision.changedAt, state: prior };
  });
  return { ...state, id, schemaVersion: 1, version: Number(raw.version), createdAt, updatedAt,
    source: raw.source as 'user' | 'demo', isSample: raw.isSample, history };
}

export function portfolioNodes(records: PortfolioRecord[]): PortfolioNode[] {
  return records.filter((record): record is PortfolioNode => record.kind !== 'assignment');
}
export function portfolioAssignments(records: PortfolioRecord[]): PortfolioAssignment[] {
  return records.filter((record): record is PortfolioAssignment => record.kind === 'assignment');
}

/** References are independent: a brand does not grant or imply a business unit. */
export function validatePortfolioCatalog(records: PortfolioRecord[]): void {
  const ids = new Set<string>();
  const names = new Map<string, string>();
  const nodes = new Map(portfolioNodes(records).map(node => [node.id, node]));
  const assignments = new Set<string>();
  for (const record of records) {
    parsePortfolioRecord(record);
    if (ids.has(record.id)) throw new Error('Duplicate portfolio identity.');
    ids.add(record.id);
    const ref = (id: string | null, kind: PortfolioKind) => {
      if (id && nodes.get(id)?.kind !== kind) throw new Error(`Missing or incompatible ${kind} reference.`);
    };
    if (record.kind === 'assignment') {
      if (assignments.has(record.opportunityId)) throw new Error('An opportunity can have only one primary portfolio assignment.');
      assignments.add(record.opportunityId);
      ref(record.businessUnitId, 'unit'); ref(record.brandId, 'brand'); ref(record.groupId, 'group'); ref(record.productId, 'product');
      // Assignments freeze their own classification; product defaults can change later.
    } else {
      for (const spelling of [record.name, ...record.aliases]) {
        const key = `${record.kind}:${brandKey(spelling)}`;
        if (!brandKey(spelling)) throw new Error('Use a name with letters or numbers.');
        const previous = names.get(key);
        if (previous && previous !== record.id) throw new Error(`This ${record.kind} name or alias already belongs to another catalog entry.`);
        names.set(key, record.id);
      }
      if (record.kind === 'unit' || record.kind === 'group') {
        ref(record.parentId, record.kind);
        let parent = record.parentId;
        const ancestors = new Set([record.id]);
        while (parent) {
          if (ancestors.has(parent)) throw new Error('A portfolio hierarchy cannot contain a cycle.');
          ancestors.add(parent); parent = nodes.get(parent)?.parentId || null;
        }
      } else if (record.parentId) throw new Error('Brands and products do not have an organization parent.');
      if (record.kind === 'product') { ref(record.brandId, 'brand'); ref(record.groupId, 'group'); }
      else if (record.brandId || record.groupId) throw new Error('Only a product can carry brand/group defaults.');
    }
  }
}

export function changePortfolioRecord(input: {
  records: PortfolioRecord[]; id: string; state: PortfolioData; expectedVersion: number;
  at: string; sample: boolean;
}): PortfolioRecord[] {
  const existing = input.records.find(record => record.id === input.id);
  if ((existing?.version || 0) !== input.expectedVersion) throw new Error('This catalog entry changed. Reload before saving.');
  if (existing && (existing.kind !== input.state.kind || existing.isSample !== input.sample
    || (existing.kind === 'assignment' && input.state.kind === 'assignment' && existing.opportunityId !== input.state.opportunityId))) throw new Error('Portfolio identity cannot change.');
  if (existing && input.at < existing.updatedAt) throw new Error('The change timestamp cannot precede the current record.');
  const history = existing ? [...existing.history, { version: existing.version, changedAt: existing.updatedAt, state: data(existing) }] : [];
  const next = parsePortfolioRecord({ ...input.state, id: input.id, schemaVersion: 1, version: input.expectedVersion + 1,
    createdAt: existing?.createdAt || input.at, updatedAt: input.at,
    source: input.sample ? 'demo' : 'user', isSample: input.sample, history });
  const activeReference = (id: string | null, oldId: string | null) => {
    if (id && id !== oldId && portfolioNodes(input.records).find(node => node.id === id)?.status === 'retired') throw new Error('Retired catalog entries cannot receive new links. Reactivate the entry first.');
  };
  if (next.kind === 'assignment') {
    const old = existing?.kind === 'assignment' ? existing : null;
    activeReference(next.businessUnitId, old?.businessUnitId || null); activeReference(next.brandId, old?.brandId || null);
    activeReference(next.groupId, old?.groupId || null); activeReference(next.productId, old?.productId || null);
  } else {
    const old = existing && existing.kind !== 'assignment' ? existing : null;
    activeReference(next.parentId, old?.parentId || null); activeReference(next.brandId, old?.brandId || null); activeReference(next.groupId, old?.groupId || null);
  }
  const records = [...input.records.filter(record => record.id !== input.id), next];
  validatePortfolioCatalog(records);
  return records;
}

/** Suggestions only. Similar names are never merged, and no assignment is written here. */
export function suggestPortfolioNode(records: PortfolioRecord[], kind: PortfolioKind, legacyName: string): PortfolioNode | null {
  const key = brandKey(legacyName);
  if (!key) return null;
  return portfolioNodes(records).find(node => node.kind === kind && node.status === 'active'
    && [node.name, ...node.aliases].some(name => brandKey(name) === key)) || null;
}

/** Only a proven descendant can replace a cloud/local record. Divergent edits stay visible. */
export function mergePortfolioRecord(left: PortfolioRecord, right: PortfolioRecord): PortfolioRecord {
  const record = parsePortfolioRecord(left), previous = parsePortfolioRecord(right);
  const newer = record.version >= previous.version ? record : previous;
  const older = newer === record ? previous : record;
  const common = newer.version === older.version ? data(newer) : newer.history[older.version - 1]?.state;
  const commonDate = newer.version === older.version ? newer.updatedAt : newer.history[older.version - 1]?.changedAt;
  if (newer.id !== older.id || newer.createdAt !== older.createdAt || commonDate !== older.updatedAt
    || !common || JSON.stringify(common) !== JSON.stringify(data(older))
    || JSON.stringify(newer.history.slice(0, older.version - 1)) !== JSON.stringify(older.history)
    || newer.kind !== older.kind || newer.isSample !== older.isSample) throw new Error('Portfolio sync conflict: two devices changed this entry differently. Export a backup before reconciling the catalog.');
  return newer;
}

export function mergePortfolioRecords(local: PortfolioRecord[], cloud: PortfolioRecord[]): PortfolioRecord[] {
  const merged = new Map(cloud.map(record => [record.id, record]));
  for (const record of local) {
    const previous = merged.get(record.id);
    if (!previous) { merged.set(record.id, record); continue; }
    merged.set(record.id, mergePortfolioRecord(record, previous));
  }
  const records = [...merged.values()]; validatePortfolioCatalog(records); return records;
}
