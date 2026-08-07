import {
  createOrderReceivableRecord,
  sanitizeReceipts,
  type OrderReceivableRecord,
  type PaymentReceipt,
} from '../utils/receivables';
import { sanitizeInstallments, type PaymentInstallment } from '../utils/paymentTerms';
import { sanitizeBusinessDate } from '../utils/safeDate';
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

export const ORDER_RECEIVABLE_STORAGE_KEY = 'memoire.orderReceivables.v1';

/**
 * The collection side of an order: money that has actually arrived, and any
 * correction to when the rest is due.
 *
 * Deliberately thin, because most of the answer is derived rather than stored.
 * The due dates come from the payment terms already written on the quote, so an
 * operator gets a receivables ledger without entering a schedule twice, and a
 * schedule is only kept here when they overrule the parse. What genuinely has to
 * be recorded is the part no document in the workspace could ever prove: that
 * 340 million dong landed in the bank on the 14th.
 *
 * One row per order, keyed by the opportunity, the same shape as its cost. A
 * collection ledger with its own primary keys and allocation rules is an
 * accounts-receivable product, and this exists so a distributor who needs to
 * know who owes them what does not have to buy one.
 *
 * Rides the existing JSON-collection pattern, so it costs no API function -
 * api/ is at the Vercel Hobby ceiling of twelve.
 */
export function loadOrderReceivables(): OrderReceivableRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(ORDER_RECEIVABLE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeOrderReceivableRecord)
      .filter((record): record is OrderReceivableRecord => Boolean(record));
  } catch {
    return [];
  }
}

export async function loadOrderReceivablesForWorkspace(userId?: string | null, sampleDataActive = false) {
  if (!userId || sampleDataActive) return loadOrderReceivables();
  try {
    const local = loadOrderReceivables();
    const cloud = await loadCloudJsonCollection<OrderReceivableRecord>('order_receivables', userId);
    const recordsToMerge = claimLocalCollectionForUser('order_receivables', userId)
      ? local.filter(isUserRecord)
      : [];
    const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
      .map(sanitizeOrderReceivableRecord)
      .filter((record): record is OrderReceivableRecord => Boolean(record));
    persistOrderReceivables(merged, false);
    sendOwedCloudJsonRecords('order_receivables', userId, merged, cloud);
    return merged;
  } catch {
    return loadOrderReceivables();
  }
}

/**
 * Banks one payment against an order.
 *
 * Appends rather than replaces. A customer who pays in three transfers has made
 * three payments, and collapsing them into a running total loses the dates - the
 * only thing that answers "when did they last actually pay us", which is the
 * question that decides whether the next call is a reminder or a problem.
 */
export function recordPaymentReceipt(input: {
  opportunityId: string;
  receipt: PaymentReceipt;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): OrderReceivableRecord[] {
  const existingRecords = loadOrderReceivables();
  const existing = existingRecords.find((record) => record.opportunityId === input.opportunityId);
  const next = createOrderReceivableRecord({
    opportunityId: input.opportunityId,
    receipts: [...(existing?.receipts || []), input.receipt],
    existing,
    source: input.source,
    isSample: input.isSample,
  });
  return persistOrderReceivables([next, ...existingRecords.filter((record) => record.id !== next.id)]);
}

export function removePaymentReceipt(opportunityId: string, receiptId: string): OrderReceivableRecord[] {
  const existingRecords = loadOrderReceivables();
  const existing = existingRecords.find((record) => record.opportunityId === opportunityId);
  if (!existing) return existingRecords;
  const next = createOrderReceivableRecord({
    opportunityId,
    receipts: existing.receipts.filter((receipt) => receipt.id !== receiptId),
    existing,
  });
  return persistOrderReceivables([next, ...existingRecords.filter((record) => record.id !== next.id)]);
}

/** Corrects the schedule, the delivery date, or the invoice date on one order. */
export function saveOrderReceivableTerms(input: {
  opportunityId: string;
  installments?: PaymentInstallment[];
  deliveredOn?: string;
  invoicedOn?: string;
  note?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): OrderReceivableRecord[] {
  const existingRecords = loadOrderReceivables();
  const existing = existingRecords.find((record) => record.opportunityId === input.opportunityId);
  const next = createOrderReceivableRecord({ ...input, existing });
  return persistOrderReceivables([next, ...existingRecords.filter((record) => record.id !== next.id)]);
}

/**
 * Clears an order's whole collection record.
 *
 * Dropped locally and then deleted in the cloud, the same two steps every other
 * JSON collection takes here. A `__deleted` tombstone would race the full-list
 * sync that follows it.
 */
export function deleteOrderReceivable(opportunityId: string): OrderReceivableRecord[] {
  const existing = loadOrderReceivables().find((record) => record.opportunityId === opportunityId);
  if (!existing) return loadOrderReceivables();
  const records = persistOrderReceivables(
    loadOrderReceivables().filter((record) => record.id !== existing.id),
  );
  deleteCloudJsonRecordForCurrentUser('order_receivables', existing.id);
  return records;
}

function persistOrderReceivables(records: OrderReceivableRecord[], syncCloud = true) {
  const sanitized = records
    .map(sanitizeOrderReceivableRecord)
    .filter((record): record is OrderReceivableRecord => Boolean(record));

  if (canUseStorage()) {
    writeLocalRecords(ORDER_RECEIVABLE_STORAGE_KEY, sanitized);
    if (syncCloud) {
      syncCloudJsonCollectionForCurrentUser('order_receivables', sanitized);
      invalidateWorkspaceCollection('orderReceivables');
    }
  }
  return sanitized;
}

function sanitizeOrderReceivableRecord(value: unknown): OrderReceivableRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<OrderReceivableRecord>;
  const opportunityId = typeof candidate.opportunityId === 'string' ? candidate.opportunityId.trim() : '';
  if (!opportunityId) return null;
  const now = new Date().toISOString();

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `or-${opportunityId}`,
    opportunityId,
    installments: sanitizeInstallments(candidate.installments),
    receipts: sanitizeReceipts(candidate.receipts),
    deliveredOn: sanitizeBusinessDate(candidate.deliveredOn) || '',
    invoicedOn: sanitizeBusinessDate(candidate.invoicedOn) || '',
    note: typeof candidate.note === 'string' ? candidate.note : '',
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : now,
    source: candidate.source === 'demo' ? 'demo' : candidate.source === 'user' ? 'user' : undefined,
    isSample: candidate.isSample === true,
    __deleted: candidate.__deleted === true ? true : undefined,
  };
}

function isUserRecord(record: OrderReceivableRecord) {
  return record.source !== 'demo' && record.isSample !== true;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
