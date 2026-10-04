import { uniquePaymentReceipts, validatePaymentReceiptDate, type OrderReceivableRecord, type PaymentReceipt } from './receivables.ts';
import { validatePaymentSchedule, type PaymentInstallment } from './paymentTerms.ts';

export type ReceivableTerms = Pick<OrderReceivableRecord, 'installments' | 'deliveredOn' | 'invoicedOn' | 'note'>;
export type ReceivableChange = { id: string } & (
  | { kind: 'add'; receipt: PaymentReceipt }
  | { kind: 'remove'; receipt: PaymentReceipt }
  | { kind: 'terms'; before: Partial<ReceivableTerms>; after: Partial<ReceivableTerms> }
  | { kind: 'delete'; before: OrderReceivableRecord }
  | { kind: 'initialize' }
);

export class ReceivableSyncConflict extends Error {
  constructor(message = 'This collection changed on another device. Your pending changes are kept on this device; review the conflict before syncing.') {
    super(message);
    this.name = 'ReceivableSyncConflict';
  }
}

/** Local pending commands never become part of an acknowledged cloud payload. */
export function receivableCloudPayload(record: OrderReceivableRecord): OrderReceivableRecord {
  const result = { ...record };
  delete result.pendingChanges;
  delete result.syncBase;
  delete result.syncError;
  return result;
}

export function sameReceivableValue(left: unknown, right: unknown): boolean {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])) : value;
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function businessValue(record: OrderReceivableRecord) {
  return { opportunityId: record.opportunityId, receipts: record.receipts || [], installments: record.installments || [],
    deliveredOn: record.deliveredOn || '', invoicedOn: record.invoicedOn || '', note: record.note || '', deleted: record.__deleted === true };
}

export function sameReceivableBusinessValue(left: OrderReceivableRecord, right: OrderReceivableRecord) {
  return sameReceivableValue(businessValue(left), businessValue(right));
}

/** Explicitly resolve terms only; pending payments are never discarded by this choice. */
export function resolvePendingReceivableTerms(remote: OrderReceivableRecord, local: OrderReceivableRecord, keepDevice: boolean): OrderReceivableRecord {
  const terms = (local.pendingChanges || []).filter(change => change.kind === 'terms');
  const remaining: ReceivableChange[] = (local.pendingChanges || []).filter(change => change.kind !== 'terms');
  if (keepDevice && terms.length) {
    const after = Object.assign({}, ...terms.map(change => change.kind === 'terms' ? change.after : {})) as Partial<ReceivableTerms>;
    const before = Object.fromEntries(Object.keys(after).map(field => [field, remote[field as keyof ReceivableTerms]]));
    remaining.push({ id: crypto.randomUUID(), kind: 'terms', before, after });
  }
  const pending = { ...local, syncBase: receivableCloudPayload(remote), pendingChanges: remaining, syncError: undefined };
  return { ...applyReceivableChanges(remote, pending), syncBase: pending.syncBase, pendingChanges: remaining, syncError: undefined };
}

/** Rebase only the user's commands, never an entire stale order or collection. */
export function applyReceivableChanges(current: OrderReceivableRecord | null, local: OrderReceivableRecord): OrderReceivableRecord {
  const base = receivableCloudPayload(local.syncBase || local);
  let next = receivableCloudPayload(current || base);
  if (current && current.opportunityId && current.opportunityId !== local.opportunityId) throw new ReceivableSyncConflict('The collection identity changed. Your pending changes have been retained.');
  const changes = local.pendingChanges || [];
  if (current?.__deleted && !base.__deleted && changes.some(c => c.kind !== 'delete')) throw new ReceivableSyncConflict('This collection was deleted on another device. Your pending changes have been retained.');
  for (const change of changes) {
    if (change.kind === 'initialize') {
      if (current && !sameReceivableBusinessValue(current, base)) throw new ReceivableSyncConflict();
    } else if (change.kind === 'add') {
      next = { ...next, __deleted: undefined, receipts: uniquePaymentReceipts([...(next.receipts || []), change.receipt]) };
    } else if (change.kind === 'remove') {
      const existing = next.receipts?.find(receipt => receipt.id === change.receipt.id);
      if (existing && !sameReceivableValue(existing, change.receipt)) throw new ReceivableSyncConflict('This payment was edited on another device. The pending removal has been retained.');
      next = { ...next, receipts: (next.receipts || []).filter(receipt => receipt.id !== change.receipt.id) };
    } else if (change.kind === 'terms') {
      for (const field of Object.keys(change.after) as (keyof ReceivableTerms)[]) {
        if (!sameReceivableValue(next[field], change.before[field]) && !sameReceivableValue(next[field], change.after[field])) throw new ReceivableSyncConflict(`The ${field} changed on another device. Your pending change has been retained.`);
      }
      next = { ...next, ...change.after };
    } else if (change.kind === 'delete') {
      if (!next.__deleted && !sameReceivableBusinessValue(next, change.before)) throw new ReceivableSyncConflict('This collection has newer changes. Its pending deletion has been retained.');
      next = { ...next, receipts: [], __deleted: true };
    }
  }
  return { ...next, id: local.id, opportunityId: local.opportunityId };
}

export function validateReceivableChanges(record: OrderReceivableRecord): void {
  if (record.pendingChanges === undefined) return;
  if (!Array.isArray(record.pendingChanges) || (record.pendingChanges.length && !record.syncBase)) throw new Error('Invalid pending collection changes. Keep the backup and review this record.');
  if (record.syncBase) {
    if (record.syncBase.id !== record.id || record.syncBase.opportunityId !== record.opportunityId) throw new Error('Pending collection changes have a different identity.');
    validatePaymentSchedule(record.syncBase.installments);
    uniquePaymentReceipts(record.syncBase.receipts || []);
  }
  for (const change of record.pendingChanges) {
    if (!change || typeof change.id !== 'string' || !change.id || !['add', 'remove', 'terms', 'delete', 'initialize'].includes(change.kind)) throw new Error('Invalid pending collection change.');
    if (change.kind === 'add' || change.kind === 'remove') {
      if (!change.receipt || typeof change.receipt.id !== 'string' || !change.receipt.id || !Number.isFinite(change.receipt.amount)) throw new Error('Invalid pending payment.');
      if (change.kind === 'add') validatePaymentReceiptDate(change.receipt.receivedOn);
    }
    if (change.kind === 'terms') {
      if (!change.before || !change.after || Object.keys(change.after).some(key => !['installments', 'deliveredOn', 'invoicedOn', 'note'].includes(key))) throw new Error('Invalid pending collection terms.');
      if (change.after.installments !== undefined && !Array.isArray(change.after.installments as PaymentInstallment[])) throw new Error('Invalid pending instalments.');
      validatePaymentSchedule(change.after.installments);
    }
    if (change.kind === 'delete' && (!change.before || change.before.id !== record.id)) throw new Error('Invalid pending collection deletion.');
  }
}

export type ReceivableCloudRow = { payload: OrderReceivableRecord; updatedAt: string };
export type ReceivableCloudAdapter = {
  read(id: string): Promise<ReceivableCloudRow | null>;
  compareAndSet(id: string, expected: ReceivableCloudRow | null, next: OrderReceivableRecord): Promise<boolean>;
};

/** The database must atomically match the observed version, otherwise read and rebase. */
export async function commitReceivableChanges(adapter: ReceivableCloudAdapter, local: OrderReceivableRecord): Promise<OrderReceivableRecord> {
  validateReceivableChanges(local);
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await adapter.read(local.id);
    const next = { ...applyReceivableChanges(current?.payload || null, local),
      syncVersion: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    if (await adapter.compareAndSet(local.id, current, next)) return next;
  }
  throw new ReceivableSyncConflict('This collection is changing on another device. Your pending changes are retained; refresh to retry.');
}
