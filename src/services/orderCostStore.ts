import { createOrderCostRecord, type OrderCostRecord } from '../utils/orderMargin';
import {
  claimLocalCollectionForUser,
  deleteCloudJsonRecordForCurrentUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  sendOwedCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
} from './cloudJsonCollectionStore';
import { invalidateWorkspaceCollection } from './workspaceDataCache';
import { writeLocalRecords } from './localWriteGuard.ts';

export const ORDER_COST_STORAGE_KEY = 'memoire.orderCosts.v1';

/**
 * The buy side of an order - the one number in the whole money spine that no
 * customer-facing document could ever prove.
 *
 * Everything else on the order book is derived: the value comes from the quote
 * or the deal, the status from what the documents say, the aging from when
 * things moved. Purchase cost has no such source. It lives in the operator's
 * head or in a supplier's email, and until it is written down the order book
 * can say what an order is worth but not whether it was worth doing.
 *
 * Owned records rather than derived, therefore, and deliberately one per order:
 * a cost book with several lines per order is an accounting product, and this
 * exists precisely so that a distributor who wants one number can have it
 * without acquiring one. Same JSON-collection pattern as milestones and quotes,
 * so it costs no API function - the Hobby ceiling is twelve and api/ is at it.
 */
export function loadOrderCosts(): OrderCostRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(ORDER_COST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeOrderCostRecord)
      .filter((record): record is OrderCostRecord => Boolean(record));
  } catch {
    return [];
  }
}

export async function loadOrderCostsForWorkspace(userId?: string | null, sampleDataActive = false) {
  if (!userId || sampleDataActive) return loadOrderCosts();
  try {
    const local = loadOrderCosts();
    const cloud = await loadCloudJsonCollection<OrderCostRecord>('order_costs', userId);
    const recordsToMerge = claimLocalCollectionForUser('order_costs', userId) ? local.filter(isUserRecord) : [];
    const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
      .map(sanitizeOrderCostRecord)
      .filter((record): record is OrderCostRecord => Boolean(record));
    persistOrderCosts(merged, false);
    sendOwedCloudJsonRecords('order_costs', userId, merged, cloud);
    return merged;
  } catch {
    return loadOrderCosts();
  }
}

export function saveOrderCost(input: {
  opportunityId: string;
  amount: number | null;
  currency: string;
  supplier?: string;
  note?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): OrderCostRecord[] {
  const existingRecords = loadOrderCosts();
  const existing = existingRecords.find((record) => record.opportunityId === input.opportunityId);
  const next = createOrderCostRecord({ ...input, existing });
  return persistOrderCosts([next, ...existingRecords.filter((record) => record.id !== next.id)]);
}

/**
 * Clears the buy side of an order.
 *
 * Dropped from the local list and then deleted in the cloud - the same two steps
 * every other JSON collection here takes. An earlier version wrote a `__deleted`
 * tombstone instead, which was wrong twice: `persistOrderCosts` syncs the whole
 * collection up, so the tombstone raced the delete that was meant to remove it,
 * and it would have sat in this browser's copy for good. If cross-device delete
 * propagation is worth hardening it is worth hardening for all thirteen
 * collections at once, not for this one alone.
 */
export function deleteOrderCost(opportunityId: string): OrderCostRecord[] {
  const existing = loadOrderCosts().find((record) => record.opportunityId === opportunityId);
  if (!existing) return loadOrderCosts();
  const records = persistOrderCosts(loadOrderCosts().filter((record) => record.id !== existing.id));
  deleteCloudJsonRecordForCurrentUser('order_costs', existing.id);
  return records;
}

function persistOrderCosts(records: OrderCostRecord[], syncCloud = true) {
  const sanitized = records
    .map(sanitizeOrderCostRecord)
    .filter((record): record is OrderCostRecord => Boolean(record));

  if (canUseStorage()) {
    writeLocalRecords(ORDER_COST_STORAGE_KEY, sanitized);
    if (syncCloud) {
      syncCloudJsonCollectionForCurrentUser('order_costs', sanitized);
      invalidateWorkspaceCollection('orderCosts');
    }
  }
  return sanitized;
}

function sanitizeOrderCostRecord(value: unknown): OrderCostRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<OrderCostRecord>;
  const opportunityId = typeof candidate.opportunityId === 'string' ? candidate.opportunityId.trim() : '';
  if (!opportunityId) return null;
  const now = new Date().toISOString();
  const amount = typeof candidate.amount === 'number' && Number.isFinite(candidate.amount) ? candidate.amount : null;

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `oc-${opportunityId}`,
    opportunityId,
    amount,
    currency: typeof candidate.currency === 'string' && candidate.currency
      ? candidate.currency.trim().toUpperCase()
      : 'VND',
    supplier: typeof candidate.supplier === 'string' ? candidate.supplier : '',
    note: typeof candidate.note === 'string' ? candidate.note : '',
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : now,
    source: candidate.source === 'demo' ? 'demo' : candidate.source === 'user' ? 'user' : undefined,
    isSample: candidate.isSample === true,
    __deleted: candidate.__deleted === true ? true : undefined,
  };
}

function isUserRecord(record: OrderCostRecord) {
  return record.source !== 'demo' && record.isSample !== true;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
