import {
  supplierCommitmentKinds,
  supplierCommitmentParties,
  supplierCommitmentStatuses,
  type SupplierCommitmentRecord,
} from '../utils/supplierCommitments';
import {
  claimLocalCollectionForUser,
  deleteCloudJsonRecordForCurrentUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
  upsertCloudJsonCollection,
} from './cloudJsonCollectionStore';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';

export const SUPPLIER_COMMITMENT_STORAGE_KEY = 'memoire.supplierCommitments.v1';

/**
 * What you and your principals owe each other. Owned records, not derived: no
 * customer-side document could ever prove that Sartorius promised you a sample
 * by Friday, so this is the one place that fact can live.
 */
export function loadSupplierCommitments(): SupplierCommitmentRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(SUPPLIER_COMMITMENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeSupplierCommitment)
      .filter((record): record is SupplierCommitmentRecord => Boolean(record))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  } catch {
    return [];
  }
}

export async function loadSupplierCommitmentsForWorkspace(userId?: string | null, sampleDataActive = false) {
  if (!userId || sampleDataActive) return loadSupplierCommitments();
  try {
    const local = loadSupplierCommitments();
    const cloud = await loadCloudJsonCollection<SupplierCommitmentRecord>('supplier_commitments', userId);
    const recordsToMerge = claimLocalCollectionForUser('supplier_commitments', userId) ? local.filter(isUserRecord) : [];
    const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
      .map(sanitizeSupplierCommitment)
      .filter((record): record is SupplierCommitmentRecord => Boolean(record));
    persistSupplierCommitments(merged, false);
    await upsertCloudJsonCollection('supplier_commitments', userId, merged);
    return merged;
  } catch {
    return loadSupplierCommitments();
  }
}

export function saveSupplierCommitment(record: SupplierCommitmentRecord): SupplierCommitmentRecord[] {
  const existing = loadSupplierCommitments().filter((item) => item.id !== record.id);
  return persistSupplierCommitments([{ ...record, updatedAt: new Date().toISOString() }, ...existing]);
}

export function deleteSupplierCommitment(recordId: string): SupplierCommitmentRecord[] {
  const records = persistSupplierCommitments(loadSupplierCommitments().filter((item) => item.id !== recordId));
  deleteCloudJsonRecordForCurrentUser('supplier_commitments', recordId);
  return records;
}

function persistSupplierCommitments(records: SupplierCommitmentRecord[], syncCloud = true) {
  const sanitized = records
    .map(sanitizeSupplierCommitment)
    .filter((record): record is SupplierCommitmentRecord => Boolean(record))
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  if (canUseStorage()) {
    window.localStorage.setItem(SUPPLIER_COMMITMENT_STORAGE_KEY, JSON.stringify(sanitized));
    if (syncCloud) {
      syncCloudJsonCollectionForCurrentUser('supplier_commitments', sanitized);
      invalidateWorkspaceDataCache();
    }
  }
  return sanitized;
}

function sanitizeSupplierCommitment(value: unknown): SupplierCommitmentRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SupplierCommitmentRecord>;
  const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
  const brand = typeof candidate.brand === 'string' ? candidate.brand.trim() : '';
  if (!label || !brand) return null;
  const now = new Date().toISOString();

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `sc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    brand,
    party: supplierCommitmentParties.find((party) => party === candidate.party) || 'self',
    kind: supplierCommitmentKinds.find((kind) => kind === candidate.kind) || 'Other',
    label,
    dueDate: typeof candidate.dueDate === 'string' ? candidate.dueDate : '',
    status: supplierCommitmentStatuses.find((status) => status === candidate.status) || 'open',
    doneAt: typeof candidate.doneAt === 'string' ? candidate.doneAt : undefined,
    amount: typeof candidate.amount === 'number' ? candidate.amount : null,
    currency: typeof candidate.currency === 'string' && candidate.currency ? candidate.currency : 'VND',
    linkedOpportunityId: typeof candidate.linkedOpportunityId === 'string' ? candidate.linkedOpportunityId : undefined,
    notes: typeof candidate.notes === 'string' ? candidate.notes : undefined,
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : now,
    source: candidate.source === 'demo' ? 'demo' : candidate.source === 'user' ? 'user' : undefined,
    isSample: candidate.isSample === true,
    __deleted: candidate.__deleted === true ? true : undefined,
  };
}

function isUserRecord(record: SupplierCommitmentRecord) {
  return record.source !== 'demo' && record.isSample !== true;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
