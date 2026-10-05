import {
  createOrderReceivableRecord,
  sanitizeReceipts,
  validatePaymentReceiptDate,
  uniquePaymentReceipts,
  ReceiptIntegrityError,
  type OrderReceivableRecord,
  type PaymentReceipt,
} from '../utils/receivables.ts';
import { sanitizeInstallments, validatePaymentSchedule, PaymentScheduleIntegrityError, type PaymentInstallment } from '../utils/paymentTerms.ts';
import { sanitizeBusinessDate } from '../utils/safeDate.ts';
import {
  claimLocalCollectionForUser,
  loadCloudJsonCollection,
} from './cloudJsonCollectionStore.ts';
import { invalidateWorkspaceCollection } from './workspaceDataCache.ts';
import { requireLocalWrite, writeLocalRecords } from './localWriteGuard.ts';
import { applyReceivableChanges, receivableCloudPayload, resolvePendingReceivableTerms, sameReceivableBusinessValue, validateReceivableChanges, type ReceivableChange } from '../utils/receivableChanges.ts';
import { flushPendingReceivables, makeReceivableCloudAdapter, triggerReceivableSync } from './orderReceivableSync.ts';
import { supabaseClient } from '../lib/supabaseClient.ts';
import { getLocalWorkspaceOwner } from './localWorkspaceOwner.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';

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
  } catch (error) {
    reportWorkspaceSyncError('Collection sync is incomplete. Browser records remain available.');
    if (error instanceof SyntaxError) throw new Error('The collection data on this device is invalid. Keep a backup and review it before using totals.');
    throw error;
  }
}

export async function loadOrderReceivablesForWorkspace(userId?: string | null, sampleDataActive = false) {
  if (!userId || sampleDataActive) return loadOrderReceivables();
  try {
    const cloud = await loadCloudJsonCollection<OrderReceivableRecord>('order_receivables', userId);
    // Read after the await: a payment recorded during the fetch must survive it.
    const local = loadOrderReceivables();
    const recordsToMerge = claimLocalCollectionForUser('order_receivables', userId)
      ? local.filter(isUserRecord)
      : [];
    const merged = new Map(cloud.map(record => [record.id, record]));
    for (const record of recordsToMerge) {
      const remote = merged.get(record.id);
      if (record.pendingChanges?.length) {
        try { merged.set(record.id, { ...applyReceivableChanges(remote || null, record), pendingChanges: record.pendingChanges, syncBase: record.syncBase }); }
        catch (error) { merged.set(record.id, { ...record, syncError: error instanceof Error ? error.message : 'A pending collection change needs review.' }); }
      } else if (!remote) {
        merged.set(record.id, { ...record, syncBase: receivableCloudPayload(record), pendingChanges: [{ id: crypto.randomUUID(), kind: 'initialize' }] });
      } else if (!record.syncVersion && record.updatedAt > remote.updatedAt && !sameReceivableBusinessValue(record, remote)) {
        // A legacy unsynced copy has no command history. Preserve it for review,
        // never infer deletions or replace a newer cloud receipt list.
        merged.set(record.id, { ...record, syncError: 'This older device copy differs from the account. Keep a backup and review it before syncing.' });
      }
    }
    const normalized = [...merged.values()].map(sanitizeOrderReceivableRecord).filter((record): record is OrderReceivableRecord => Boolean(record));
    persistOrderReceivables(normalized, false);
    await flushPendingReceivables(userId, localIO);
    return loadOrderReceivables();
  } catch (error) {
    if (error instanceof ReceiptIntegrityError || error instanceof PaymentScheduleIntegrityError) throw error;
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
  validatePaymentReceiptDate(input.receipt.receivedOn);
  if (typeof input.receipt.id !== 'string' || !input.receipt.id.trim()) throw new Error('The payment needs a stable identity before recording it.');
  const receipt = sanitizeReceipts([input.receipt])[0];
  if (!receipt) throw new Error('Enter a finite, non-zero payment amount.');
  const existingRecords = loadOrderReceivables();
  const existing = existingRecords.find((record) => record.opportunityId === input.opportunityId);
  if (existing?.receipts.some(value => value.id === receipt.id)) {
    uniquePaymentReceipts([...existing.receipts, receipt]);
    return existingRecords;
  }
  const next = createOrderReceivableRecord({
    opportunityId: input.opportunityId,
    receipts: [...(existing?.receipts || []), receipt],
    existing,
    source: input.source,
    isSample: input.isSample,
  });
  return saveChangedRecord(existingRecords, existing, next, { id: crypto.randomUUID(), kind: 'add', receipt });
}

export function removePaymentReceipt(opportunityId: string, receiptId: string): OrderReceivableRecord[] {
  const existingRecords = loadOrderReceivables();
  const existing = existingRecords.find((record) => record.opportunityId === opportunityId);
  if (!existing) return existingRecords;
  const receipt = existing.receipts.find(receipt => receipt.id === receiptId);
  if (!receipt) return existingRecords;
  const next = createOrderReceivableRecord({
    opportunityId,
    receipts: existing.receipts.filter((receipt) => receipt.id !== receiptId),
    existing,
  });
  return saveChangedRecord(existingRecords, existing, next, { id: crypto.randomUUID(), kind: 'remove', receipt });
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
  orderAmount?: number;
}): OrderReceivableRecord[] {
  const existingRecords = loadOrderReceivables();
  const existing = existingRecords.find((record) => record.opportunityId === input.opportunityId);
  if (input.installments !== undefined) {
    if (input.installments.some(part => typeof part.amount === 'number' && part.amount > 0) && !Number.isFinite(input.orderAmount)) throw new Error('The order value is required before saving a fixed payment schedule.');
    validatePaymentSchedule(input.installments, input.orderAmount);
  }
  const next = createOrderReceivableRecord({ ...input, existing });
  const fields = ['installments', 'deliveredOn', 'invoicedOn', 'note'] as const;
  const base = existing || createOrderReceivableRecord({ opportunityId: input.opportunityId });
  const before = Object.fromEntries(fields.filter(field => input[field] !== undefined).map(field => [field, base[field]]));
  const after = Object.fromEntries(fields.filter(field => input[field] !== undefined).map(field => [field, next[field]]));
  return saveChangedRecord(existingRecords, existing, next, { id: crypto.randomUUID(), kind: 'terms', before, after });
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
  return saveChangedRecord(loadOrderReceivables(), existing, { ...existing, receipts: [], __deleted: true, updatedAt: new Date().toISOString() }, { id: crypto.randomUUID(), kind: 'delete', before: receivableCloudPayload(existing) });
}

const localIO = { load: loadOrderReceivables, save: (records: OrderReceivableRecord[]) => { persistOrderReceivables(records, false); } };
export async function resolveOrderReceivableTerms(opportunityId: string, keepDevice: boolean) {
  if (!supabaseClient) throw new Error('Sign in before resolving account changes.');
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data.user || getLocalWorkspaceOwner() !== data.user.id) throw new Error('Sign in to this workspace before resolving its changes.');
  const userId = data.user.id;
  const initial = loadOrderReceivables().find(record => record.opportunityId === opportunityId);
  if (!initial) throw new Error('This collection is unavailable.');
  const remote = await makeReceivableCloudAdapter(userId).read(initial.id);
  if (!remote || getLocalWorkspaceOwner() !== userId) throw new Error('The account collection changed. Refresh before resolving it.');
  const records = loadOrderReceivables();
  const local = records.find(record => record.id === initial.id);
  if (!local) throw new Error('This collection is unavailable.');
  const next = resolvePendingReceivableTerms(remote.payload, local, keepDevice);
  persistOrderReceivables(records.map(record => record.id === next.id ? next : record));
  await flushPendingReceivables(userId, localIO);
  return loadOrderReceivables();
}
function saveChangedRecord(records: OrderReceivableRecord[], existing: OrderReceivableRecord | undefined, next: OrderReceivableRecord, change: ReceivableChange) {
  if (next.source !== 'demo' && !next.isSample) {
    const base = existing?.syncBase || receivableCloudPayload(existing || createOrderReceivableRecord({ opportunityId: next.opportunityId, existing: { ...next, receipts: [] } }));
    next = { ...next, syncBase: base, pendingChanges: [...(existing?.pendingChanges || []), change], syncVersion: existing?.syncVersion, syncError: undefined };
  }
  return persistOrderReceivables([next, ...records.filter(record => record.id !== next.id)]);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => triggerReceivableSync(localIO));
}

function persistOrderReceivables(records: OrderReceivableRecord[], syncCloud = true) {
  const sanitized = records
    .map(sanitizeOrderReceivableRecord)
    .filter((record): record is OrderReceivableRecord => Boolean(record));

  if (canUseStorage()) {
    requireLocalWrite(writeLocalRecords(ORDER_RECEIVABLE_STORAGE_KEY, sanitized));
    if (syncCloud) {
      triggerReceivableSync(localIO);
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
  validatePaymentSchedule(candidate.installments);
  validateReceivableChanges(candidate as OrderReceivableRecord);

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
    syncVersion: typeof candidate.syncVersion === 'string' ? candidate.syncVersion : undefined,
    pendingChanges: candidate.pendingChanges,
    syncBase: candidate.syncBase,
    syncError: typeof candidate.syncError === 'string' ? candidate.syncError : undefined,
  };
}

function isUserRecord(record: OrderReceivableRecord) {
  return record.source !== 'demo' && record.isSample !== true;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
