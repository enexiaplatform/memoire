import {
  createOrderMilestoneRecord,
  orderMilestoneKeys,
  type OrderMilestoneKey,
  type OrderMilestoneRecord,
} from '../utils/orderToCash';
import {
  claimLocalCollectionForUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
  upsertCloudJsonCollection,
} from './cloudJsonCollectionStore';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import { writeLocalRecords } from './localWriteGuard.ts';

export const ORDER_MILESTONE_STORAGE_KEY = 'memoire.orderMilestones.v1';

/**
 * Holds only the operator's hand-made milestone ticks on the order book -
 * deposit received, contract signed - for steps no quote record proves.
 * Everything a quote does prove is derived live in orderToCash, so this store
 * can never drift from the money spine.
 */
export function loadOrderMilestones(): OrderMilestoneRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(ORDER_MILESTONE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeOrderMilestoneRecord)
      .filter((record): record is OrderMilestoneRecord => Boolean(record));
  } catch {
    return [];
  }
}

export async function loadOrderMilestonesForWorkspace(userId?: string | null, sampleDataActive = false) {
  if (!userId || sampleDataActive) return loadOrderMilestones();
  try {
    const local = loadOrderMilestones();
    const cloud = await loadCloudJsonCollection<OrderMilestoneRecord>('order_milestones', userId);
    const recordsToMerge = claimLocalCollectionForUser('order_milestones', userId) ? local.filter(isUserRecord) : [];
    const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
      .map(sanitizeOrderMilestoneRecord)
      .filter((record): record is OrderMilestoneRecord => Boolean(record));
    persistOrderMilestones(merged, false);
    await upsertCloudJsonCollection('order_milestones', userId, merged);
    return merged;
  } catch {
    return loadOrderMilestones();
  }
}

export function toggleOrderMilestone(input: {
  opportunityId: string;
  milestone: OrderMilestoneKey;
  done: boolean;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): OrderMilestoneRecord[] {
  const existingRecords = loadOrderMilestones();
  const existing = existingRecords.find(
    (record) => record.opportunityId === input.opportunityId && record.milestone === input.milestone,
  );
  const next = createOrderMilestoneRecord({ ...input, existing });
  return persistOrderMilestones([next, ...existingRecords.filter((record) => record.id !== next.id)]);
}

function persistOrderMilestones(records: OrderMilestoneRecord[], syncCloud = true) {
  const sanitized = records
    .map(sanitizeOrderMilestoneRecord)
    .filter((record): record is OrderMilestoneRecord => Boolean(record));

  if (canUseStorage()) {
    writeLocalRecords(ORDER_MILESTONE_STORAGE_KEY, sanitized);
    if (syncCloud) {
      syncCloudJsonCollectionForCurrentUser('order_milestones', sanitized);
      invalidateWorkspaceDataCache();
    }
  }
  return sanitized;
}

function sanitizeOrderMilestoneRecord(value: unknown): OrderMilestoneRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<OrderMilestoneRecord>;
  const opportunityId = typeof candidate.opportunityId === 'string' ? candidate.opportunityId : '';
  const milestone = orderMilestoneKeys.find((key) => key === candidate.milestone);
  if (!opportunityId || !milestone) return null;
  const now = new Date().toISOString();

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `om-${opportunityId}-${milestone}`,
    opportunityId,
    milestone,
    done: candidate.done === true,
    doneAt: typeof candidate.doneAt === 'string' ? candidate.doneAt : undefined,
    note: typeof candidate.note === 'string' ? candidate.note : undefined,
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : now,
    source: candidate.source === 'demo' ? 'demo' : candidate.source === 'user' ? 'user' : undefined,
    isSample: candidate.isSample === true,
    __deleted: candidate.__deleted === true ? true : undefined,
  };
}

function isUserRecord(record: OrderMilestoneRecord) {
  return record.source !== 'demo' && record.isSample !== true;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
