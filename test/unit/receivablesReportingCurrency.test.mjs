import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Receivables read in a currency that is not the rate table's pivot.
 *
 * Its own file, and USD is pinned before the engine is imported, because that
 * is the whole condition. Every other receivables suite runs in VND, which is
 * `BASE_CURRENCY`: converting into it is one multiplication and lands exactly on
 * the slice it settles. Reporting in anything else divides, and a paid
 * installment comes back a fraction of a cent off.
 *
 * `overdue` was `outstandingBase > 0`, so that fraction was a debt no payment
 * could ever clear. A deposit banked in May reported itself 92 days late in
 * August, the order took the worst age among its slices, and "Chase this one
 * first" - the single instruction on the page - named an order whose only late
 * money was five days late in a different slice.
 *
 * The residue is signed, which is why it hid: on the shipped rates a 242,000 EUR
 * order rounds the safe way and a 168,000 EUR order does not. Half the book
 * looks correct. That reads as ordinary variation between customers rather than
 * as arithmetic, so it is asserted here across a spread of amounts rather than
 * on the one that happened to be caught.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const entries = new Map();
  globalThis.localStorage = {
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    clear: () => entries.clear(),
  };
}
globalThis.localStorage.setItem('memoire_reporting_currency', 'USD');

const { buildReceivables, createOrderReceivableRecord, createPaymentReceipt } = await import('../../src/utils/receivables.ts');
const { convertMoney, getReportingCurrency } = await import('../../src/utils/money.ts');

const TODAY = '2026-08-22';

const eurOrder = (opportunityId, amount) => ({
  opportunityId,
  accountName: `Account ${opportunityId}`,
  orderName: `Order ${opportunityId}`,
  orderRef: opportunityId.toUpperCase(),
  stage: 'Won',
  status: 'Won',
  orderStage: 'Awaiting payment',
  probability: 100,
  amount,
  currency: 'EUR',
  amountBase: convertMoney(amount, 'EUR'),
  paymentTerm: '30% deposit, 70% net 45',
  quoteCount: 1,
  orderDate: '2026-05-22',
  lastMovedAt: '2026-05-22',
});

const paidDepositOn = (opportunityId, amount, extra = {}) => createOrderReceivableRecord({
  opportunityId,
  receipts: [createPaymentReceipt({
    amount: amount * 0.3,
    currency: 'EUR',
    receivedOn: '2026-05-28',
  })],
  ...extra,
});

describe('receivables: a paid slice is not a late slice, whatever the rate leaves behind', () => {
  test('the basis really is not the pivot, or none of this proves anything', () => {
    assert.equal(getReportingCurrency(), 'USD');
  });

  // Amounts whose 30% lands on both sides of the rounding, so the suite cannot
  // pass by picking a lucky one.
  for (const amount of [168_000, 242_000, 184_000, 96_000, 124_000, 58_000]) {
    test(`a deposit paid in full on a ${amount.toLocaleString('en')} EUR order is not overdue`, () => {
      const summary = buildReceivables({
        orders: [eurOrder('fx', amount)],
        records: [paidDepositOn('fx', amount)],
        today: TODAY,
      });
      const [deposit] = summary.orders[0].installments;

      assert.equal(deposit.settled, true, 'the customer paid it');
      assert.equal(deposit.overdue, false, 'so it cannot be late');
      assert.equal(deposit.daysOverdue, 0);
      assert.equal(deposit.outstandingBase, 0, 'a residue is not a debt');
    });
  }

  test('the order is aged on money still owed, not on a slice already banked', () => {
    const summary = buildReceivables({
      orders: [eurOrder('fx', 168_000)],
      records: [paidDepositOn('fx', 168_000, {
        deliveredOn: '2026-07-01',
        invoicedOn: '2026-07-03',
      })],
      today: TODAY,
    });
    const ar = summary.orders[0];

    // Balance fell due 17 August on net 45 from the invoice. Five days, not 92.
    assert.equal(ar.daysOverdue, 5);
    assert.equal(ar.bucket, '1-30', 'it used to read 90+ and lead "Chase this one first"');
  });

  test('settled and overdue are never both true', () => {
    const amounts = [168_000, 242_000, 184_000, 96_000, 124_000, 58_000];
    const summary = buildReceivables({
      orders: amounts.map((amount, index) => eurOrder(`fx${index}`, amount)),
      records: amounts.map((amount, index) => paidDepositOn(`fx${index}`, amount)),
      today: TODAY,
    });

    summary.orders.forEach((ar) => {
      ar.installments.forEach((slice) => {
        assert.equal(slice.settled && slice.overdue, false, `${ar.orderRef} / ${slice.label}`);
      });
    });
  });
});
