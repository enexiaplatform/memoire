import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildGlobalB2BYear } from '../../scripts/fixtures/global-b2b-year.mjs';
import { buildOrderBook } from '../../src/utils/orderToCash.ts';
import { convertMoney } from '../../src/utils/money.ts';
import { buildReceivables, sanitizeReceipts, validatePaymentReceiptDate } from '../../src/utils/receivables.ts';
import { recordPaymentReceipt, loadOrderReceivables, ORDER_RECEIVABLE_STORAGE_KEY } from '../../src/services/orderReceivableStore.ts';
import { buildRestorePlan } from '../../src/utils/workspaceBackup.ts';

const today = '2026-09-28';
const fixture = () => buildGlobalB2BYear();
function calculate(f) {
  const book = buildOrderBook({ opportunities: f.opportunities, quotes: f.quotes,
    milestoneRecords: [], receivableRecords: f.receivables, today, linkage: 'explicit-id' });
  return { book, cash: buildReceivables({ orders: book.orders, records: f.receivables, today }) };
}

test('only an accepted revision changes the contract amount, currency, terms and fulfilment evidence', () => {
  const f = fixture(), before = calculate(f), accepted = f.quotes.find(q => q.status === 'Accepted');
  const revised = { ...accepted, id: 'revision', quoteId: 'REVISION', quoteDate: '2026-09-27',
    amount: 20000, currency: 'EUR', paymentTerm: 'Net 60', deliveryStatus: 'Not scheduled', paymentStatus: 'Not due' };
  for (const status of ['Draft', 'Sent', 'Expired']) {
    f.quotes.push({ ...revised, status });
    const after = calculate(f).book.orders.find(o => o.opportunityId === accepted.opportunityId);
    const original = before.book.orders.find(o => o.opportunityId === accepted.opportunityId);
    assert.deepEqual(after, { ...original, quoteCount: original.quoteCount + 1 });
    f.quotes.pop();
  }
  f.quotes.push({ ...revised, status: 'Accepted' });
  const after = calculate(f).book.orders.find(o => o.opportunityId === accepted.opportunityId);
  assert.equal(after.amount, 20000); assert.equal(after.currency, 'EUR'); assert.equal(after.paymentTerm, 'Net 60');
  assert.equal(after.fullyCollected, false);
});

test('retrying a receipt identity is idempotent; distinct identical transfers remain separate', () => {
  const f = fixture(), initial = calculate(f).cash.totalReceivedBase, r = f.receivables[0].receipts[0];
  f.receivables[0].receipts.push({ ...r });
  assert.equal(calculate(f).cash.totalReceivedBase, initial);
  assert.equal(sanitizeReceipts(f.receivables[0].receipts).length, 2);
  f.receivables[0].receipts.push({ ...r, id: 'different-transfer' });
  assert.equal(calculate(f).cash.totalReceivedBase, initial + convertMoney(4000, 'USD'));
  f.receivables[0].receipts.push({ ...r, amount: r.amount + 1 });
  assert.throws(() => calculate(f), /Conflicting payment receipt identity/);
  assert.throws(() => sanitizeReceipts(f.receivables[0].receipts), /Conflicting payment receipt identity/);
});

test('as-of receipt boundaries exclude future and malformed dates without replacing them with today', () => {
  const f = fixture(), initial = calculate(f).cash.totalReceivedBase;
  const receipts = f.receivables[0].receipts;
  receipts[0].receivedOn = today; receipts[1].receivedOn = '2026-09-29';
  assert.equal(calculate(f).cash.totalReceivedBase, initial - convertMoney(6000, 'USD'));
  receipts[0].receivedOn = 'not-a-date';
  assert.equal(calculate(f).cash.totalReceivedBase, initial - convertMoney(10000, 'USD'));
  assert.equal(sanitizeReceipts(receipts)[0].receivedOn, '');
  assert.doesNotThrow(() => validatePaymentReceiptDate(today, today));
  assert.throws(() => validatePaymentReceiptDate('2026-09-29', today), /future/);
  assert.throws(() => validatePaymentReceiptDate('', today), /valid date/);
});

test('Orders derives full, partial, overpaid and unpaid states from the same collection balance', () => {
  const f = fixture(), { book, cash } = calculate(f);
  assert.equal(book.collectedCount, 24); assert.equal(cash.openCount, 24);
  for (const order of book.orders) {
    const ar = cash.orders.find(row => row.opportunityId === order.opportunityId);
    assert.equal(order.fullyCollected, ar.settled);
    assert.equal(order.milestones.find(m => m.key === 'delivery').done, true);
    assert.equal(order.milestones.find(m => m.key === 'invoice').done, true);
    if (ar.settled) {
      assert.equal(order.orderStage, 'Collected'); assert.equal(order.overdue, false); assert.equal(order.stalled, false);
      assert.equal(order.milestones.find(m => m.key === 'paid').evidence, 'collection');
    }
  }
  f.receivables[0].receipts.push({ ...f.receivables[0].receipts[0], id: 'refund', amount: -4000 });
  assert.equal(calculate(f).book.orders.find(o => o.opportunityId === f.receivables[0].opportunityId).fullyCollected, false);
  f.receivables[0].receipts = [];
  f.quotes.find(q => q.status === 'Accepted' && q.opportunityId === f.receivables[0].opportunityId).paymentStatus = 'Paid';
  const cleared = calculate(f).book.orders.find(o => o.opportunityId === f.receivables[0].opportunityId);
  assert.equal(cleared.fullyCollected, false, 'removing the last receipt cannot resurrect an old Paid quote');
  assert.equal(cleared.milestones.find(m => m.key === 'paid').evidence, 'collection');
});

test('a fulfilled deposit advances the order and unknown FX never proves payment', () => {
  const f = fixture(), r = f.receivables[1], q = f.quotes.find(q => q.status === 'Accepted' && q.opportunityId === r.opportunityId);
  q.paymentTerm = '30% deposit, 70% net 30';
  let order = calculate(f).book.orders.find(o => o.opportunityId === r.opportunityId);
  assert.equal(order.milestones.find(m => m.key === 'deposit').done, true); assert.equal(order.fullyCollected, false);
  r.receipts[0].currency = 'UNKNOWN';
  order = calculate(f).book.orders.find(o => o.opportunityId === r.opportunityId);
  assert.equal(order.milestones.find(m => m.key === 'deposit').done, false);
  assert.equal(order.fullyCollected, false);
});

test('the actual payment store retries without a write and refuses conflicting or future receipts', () => {
  const f = fixture(), record = f.receivables[0], receipt = record.receipts[0];
  globalThis.window = { localStorage: globalThis.localStorage };
  const original = JSON.stringify([record]);
  localStorage.setItem(ORDER_RECEIVABLE_STORAGE_KEY, original);
  try {
    assert.equal(recordPaymentReceipt({ opportunityId: record.opportunityId, receipt: { ...receipt } }).length, 1);
    assert.equal(localStorage.getItem(ORDER_RECEIVABLE_STORAGE_KEY), original, 'an identical retry has no revision or cloud write');
    assert.throws(() => recordPaymentReceipt({ opportunityId: record.opportunityId, receipt: { ...receipt, amount: 1 } }), /Conflicting/);
    assert.throws(() => recordPaymentReceipt({ opportunityId: record.opportunityId, receipt: { ...receipt, id: 'future', receivedOn: '2099-01-01' } }), /future/);
    assert.equal(localStorage.getItem(ORDER_RECEIVABLE_STORAGE_KEY), original);
    const corrupt = { ...record, receipts: [...record.receipts, { ...receipt, amount: 1 }] };
    localStorage.setItem(ORDER_RECEIVABLE_STORAGE_KEY, JSON.stringify([corrupt]));
    assert.throws(() => loadOrderReceivables(), /Conflicting/, 'corruption cannot masquerade as an empty workspace');
    assert.throws(() => buildRestorePlan({ exportedAt: '2026-10-03T00:00:00Z',
      localBrowserData: { [ORDER_RECEIVABLE_STORAGE_KEY]: [corrupt] } }), /Conflicting/, 'restore rejects the conflict before writing');
  } finally { localStorage.removeItem(ORDER_RECEIVABLE_STORAGE_KEY); delete globalThis.window; }
});
