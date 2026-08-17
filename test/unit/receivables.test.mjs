import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {
  buildReceivables,
  createOrderReceivableRecord,
  createPaymentReceipt,
  sanitizeReceipts,
} from '../../src/utils/receivables.ts';

/**
 * Công nợ - what is owed, since when, and what has come back.
 *
 * The order book could already say an order had been paid. It could not say
 * that the balance was due on the 14th and 340 million has been sitting eleven
 * days late since, which is the only version of the fact that tells somebody who
 * to ring. These tests are mostly about the awkward cases, because collections
 * is made of awkward cases: customers pay early, pay round numbers, pay two
 * invoices at once, and occasionally pay too much.
 */

const TODAY = '2026-08-06';

const order = (opportunityId, overrides = {}) => ({
  opportunityId,
  accountName: `Account ${opportunityId}`,
  orderName: `Order ${opportunityId}`,
  orderRef: opportunityId.toUpperCase(),
  stage: 'Won',
  status: 'Won',
  orderStage: 'Awaiting payment',
  probability: 100,
  amount: 1_000_000,
  currency: 'VND',
  amountBase: 1_000_000,
  paymentTerm: '30% deposit, 70% net 30',
  quoteCount: 1,
  orderDate: '2026-06-01',
  lastMovedAt: '2026-06-01',
  ...overrides,
});

const record = (opportunityId, overrides = {}) => createOrderReceivableRecord({
  opportunityId,
  ...overrides,
});

const receipt = (amount, receivedOn, overrides = {}) => createPaymentReceipt({
  amount,
  currency: 'VND',
  receivedOn,
  ...overrides,
});

describe('receivables: turning terms into a schedule', () => {
  test('the schedule comes off the payment terms with nothing re-entered', () => {
    const summary = buildReceivables({ orders: [order('a')], records: [], today: TODAY });
    const ar = summary.orders[0];

    assert.equal(ar.installments.length, 2);
    assert.equal(ar.installments[0].dueBase, 300_000);
    assert.equal(ar.installments[0].dueDate, '2026-06-01', 'the deposit is due on the order date');
    assert.equal(ar.installments[1].dueBase, 700_000);
    assert.equal(ar.installments[1].dueDate, '2026-07-01', 'net 30 from an invoice raised at order time');
    assert.equal(ar.termConfidence, 'stated');
    assert.equal(ar.outstandingBase, 1_000_000, 'nothing received means the whole order is owed');
  });

  test('an operator-corrected schedule replaces the parse and says so', () => {
    const summary = buildReceivables({
      orders: [order('a')],
      records: [record('a', {
        installments: [{ id: 'x', label: 'One payment', percent: 100, trigger: 'order', offsetDays: 90 }],
      })],
      today: TODAY,
    });

    assert.equal(summary.orders[0].installments.length, 1);
    assert.equal(summary.orders[0].termConfidence, 'operator');
    assert.equal(summary.orders[0].installments[0].dueDate, '2026-08-30');
  });

  test('a real delivery date re-anchors the slices waiting on it', () => {
    const summary = buildReceivables({
      orders: [order('a', { paymentTerm: '100% on delivery' })],
      records: [record('a', { deliveredOn: '2026-07-20' })],
      today: TODAY,
    });

    assert.equal(summary.orders[0].installments[0].dueDate, '2026-07-20');
  });

  test('terms nobody could read are marked assumed rather than trusted', () => {
    const summary = buildReceivables({
      orders: [order('a', { paymentTerm: 'per annex B' })],
      records: [],
      today: TODAY,
    });

    assert.equal(summary.orders[0].termConfidence, 'assumed');
  });
});

describe('receivables: applying the money that came in', () => {
  test('a receipt covers what has been owed longest first', () => {
    const summary = buildReceivables({
      orders: [order('a')],
      records: [record('a', { receipts: [receipt(300_000, '2026-06-02')] })],
      today: TODAY,
    });
    const ar = summary.orders[0];

    assert.equal(ar.installments[0].settled, true);
    assert.equal(ar.installments[1].outstandingBase, 700_000);
    assert.equal(ar.outstandingBase, 700_000);
    assert.equal(ar.receivedBase, 300_000);
  });

  test('a part payment settles what it can and leaves the rest outstanding', () => {
    const summary = buildReceivables({
      orders: [order('a')],
      records: [record('a', { receipts: [receipt(500_000, '2026-07-02')] })],
      today: TODAY,
    });
    const ar = summary.orders[0];

    assert.equal(ar.installments[0].settled, true);
    assert.equal(ar.installments[1].receivedBase, 200_000);
    assert.equal(ar.installments[1].outstandingBase, 500_000);
    assert.equal(ar.settled, false);
  });

  test('an order paid in full is settled and stops being chased', () => {
    const summary = buildReceivables({
      orders: [order('a')],
      records: [record('a', { receipts: [receipt(1_000_000, '2026-07-05')] })],
      today: TODAY,
    });

    assert.equal(summary.orders[0].settled, true);
    assert.equal(summary.orders[0].outstandingBase, 0);
    assert.equal(summary.orders[0].overdueBase, 0);
    assert.equal(summary.openCount, 0);
    assert.equal(summary.totalOutstandingBase, 0);
  });

  test('an overpayment is reported rather than quietly clamped away', () => {
    const summary = buildReceivables({
      orders: [order('a')],
      records: [record('a', { receipts: [receipt(1_200_000, '2026-07-05')] })],
      today: TODAY,
    });

    assert.equal(summary.orders[0].settled, true);
    assert.equal(summary.orders[0].overpaidBase, 200_000);
  });

  test('several receipts add up', () => {
    const summary = buildReceivables({
      orders: [order('a')],
      records: [record('a', {
        receipts: [receipt(300_000, '2026-06-02'), receipt(400_000, '2026-07-10')],
      })],
      today: TODAY,
    });

    assert.equal(summary.orders[0].receivedBase, 700_000);
    assert.equal(summary.orders[0].outstandingBase, 300_000);
  });
});

describe('receivables: how late the money is', () => {
  test('an installment past its date with money on it is overdue', () => {
    const summary = buildReceivables({ orders: [order('a')], records: [], today: TODAY });
    const ar = summary.orders[0];

    // Deposit due 2026-06-01, balance due 2026-07-01, today is 2026-08-06.
    assert.equal(ar.installments[0].overdue, true);
    assert.equal(ar.installments[0].daysOverdue, 66);
    assert.equal(ar.installments[1].daysOverdue, 36);
    assert.equal(ar.daysOverdue, 66, 'the order is as late as its oldest unpaid slice');
    assert.equal(ar.overdueBase, 1_000_000);
    assert.equal(ar.bucket, '61-90');
  });

  test('money not yet due is not late', () => {
    const summary = buildReceivables({
      orders: [order('a', { orderDate: '2026-08-01', paymentTerm: 'Net 60' })],
      records: [],
      today: TODAY,
    });

    assert.equal(summary.orders[0].daysOverdue, null);
    assert.equal(summary.orders[0].overdueBase, 0);
    assert.equal(summary.orders[0].bucket, 'current');
  });

  test('money falling within a week is called out before it is late', () => {
    const summary = buildReceivables({
      orders: [order('a', { orderDate: '2026-08-01', paymentTerm: 'Net 10' })],
      records: [],
      today: TODAY,
    });

    assert.equal(summary.orders[0].bucket, 'due-soon');
    assert.equal(summary.orders[0].overdueBase, 0);
  });

  test('the aging buckets split the outstanding money by how late it is', () => {
    const summary = buildReceivables({
      orders: [
        order('fresh', { orderDate: '2026-08-01', paymentTerm: 'Net 60' }),
        order('late20', { orderDate: '2026-07-17', paymentTerm: 'Net 0', amountBase: 500_000 }),
        order('late120', { orderDate: '2026-04-01', paymentTerm: 'Net 0', amountBase: 200_000 }),
      ],
      records: [],
      today: TODAY,
    });

    const bucket = (key) => summary.aging.find((entry) => entry.bucket === key);
    assert.equal(bucket('current').count, 1);
    assert.equal(bucket('1-30').amountBase, 500_000);
    assert.equal(bucket('90+').amountBase, 200_000);
    assert.equal(summary.aging.length, 6, 'every bucket is drawn, including the empty ones');
  });

  test('a split order lands in two buckets, not one', () => {
    // 30% on order, 70% forty-five days after it. On 2026-08-15 the deposit is
    // due today and the balance is six weeks out. Bucketing the whole order by
    // its earliest slice reported all 250,000,000 as due within the week and
    // left "not yet due" empty, while the schedule underneath said otherwise.
    const summary = buildReceivables({
      orders: [order('split', {
        orderDate: '2026-08-15',
        paymentTerm: '30% deposit, 70% net 45',
        amountBase: 250_000_000,
      })],
      records: [],
      today: '2026-08-15',
    });

    const bucket = (key) => summary.aging.find((entry) => entry.bucket === key);
    assert.equal(bucket('due-soon').amountBase, 75_000_000);
    assert.equal(bucket('due-soon').count, 1);
    assert.equal(bucket('current').amountBase, 175_000_000);
    assert.equal(bucket('current').count, 1);
    assert.equal(
      summary.aging.reduce((sum, entry) => sum + entry.amountBase, 0),
      summary.totalOutstandingBase,
      'the buckets have to add up to what is owed',
    );
  });

  test('a part-paid split order ages only what is still outstanding', () => {
    const summary = buildReceivables({
      orders: [order('split', {
        orderDate: '2026-08-15',
        paymentTerm: '30% deposit, 70% net 45',
        amountBase: 250_000_000,
      })],
      records: [{
        id: 'rec-1',
        opportunityId: 'split',
        installments: [],
        receipts: [{ id: 'r-1', amount: 75_000_000, currency: 'VND', receivedOn: '2026-08-15', reference: '', note: '' }],
        deliveredOn: '',
        invoicedOn: '',
        note: '',
        createdAt: '',
        updatedAt: '',
      }],
      today: '2026-08-15',
    });

    const bucket = (key) => summary.aging.find((entry) => entry.bucket === key);
    assert.equal(bucket('due-soon').amountBase, 0, 'the deposit has been paid');
    assert.equal(bucket('current').amountBase, 175_000_000);
  });

  test('the order to ring first is the biggest, not merely the oldest', () => {
    const summary = buildReceivables({
      orders: [
        order('small-ancient', { orderDate: '2026-01-01', paymentTerm: 'Net 0', amountBase: 10_000 }),
        order('big-recent', { orderDate: '2026-07-01', paymentTerm: 'Net 0', amountBase: 900_000 }),
      ],
      records: [],
      today: TODAY,
    });

    assert.equal(summary.worstOverdue.opportunityId, 'big-recent');
  });

  test('days outstanding is weighted by the money, and counted from the due date', () => {
    const summary = buildReceivables({
      orders: [order('a', { orderDate: '2026-07-07', paymentTerm: 'Net 0', amountBase: 1_000_000 })],
      records: [],
      today: TODAY,
    });

    // Due 2026-07-07, today 2026-08-06: thirty days of waiting past the promise.
    assert.equal(summary.averageDaysOutstanding, 30);
  });

  test('nothing owed means no average to report', () => {
    const summary = buildReceivables({ orders: [], records: [], today: TODAY });
    assert.equal(summary.averageDaysOutstanding, null);
    assert.equal(summary.totalOutstandingBase, 0);
  });
});

describe('receivables: what to plan around', () => {
  test('money due in the next thirty days includes what is already late', () => {
    const summary = buildReceivables({
      orders: [
        order('late', { orderDate: '2026-07-01', paymentTerm: 'Net 0', amountBase: 400_000 }),
        order('soon', { orderDate: '2026-08-01', paymentTerm: 'Net 20', amountBase: 300_000 }),
        order('far', { orderDate: '2026-08-01', paymentTerm: 'Net 200', amountBase: 900_000 }),
      ],
      records: [],
      today: TODAY,
    });

    // Late money is money you are still trying to collect this month.
    assert.equal(summary.expectedNext30Base, 700_000);
  });

  test('a deleted collection record is ignored', () => {
    const summary = buildReceivables({
      orders: [order('a')],
      records: [{ ...record('a', { receipts: [receipt(1_000_000, '2026-07-01')] }), __deleted: true }],
      today: TODAY,
    });

    assert.equal(summary.orders[0].receivedBase, 0);
    assert.equal(summary.orders[0].outstandingBase, 1_000_000);
  });

  test('each order links to itself on the collection page', () => {
    const summary = buildReceivables({ orders: [order('acme-1')], records: [], today: TODAY });
    assert.equal(summary.orders[0].href, '/app/cash-collection?orderId=acme-1');
  });
});

describe('receivables: writing a receipt down', () => {
  test('a receipt is normalised on the way in', () => {
    const created = createPaymentReceipt({ amount: 500, currency: ' usd ', method: '  wire  ' });

    assert.equal(created.currency, 'USD');
    assert.equal(created.method, 'wire');
    assert.ok(created.receivedOn, 'a receipt with no date is banked today rather than never');
    assert.ok(created.id.startsWith('rc-'));
  });

  test('a receipt with no money in it is a typo, not a payment', () => {
    const cleaned = sanitizeReceipts([
      { amount: 100, currency: 'VND' },
      { amount: 0, currency: 'VND' },
      { amount: 'lots', currency: 'VND' },
      null,
    ]);

    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].amount, 100);
  });

  test('a refund is a negative receipt and is kept', () => {
    const cleaned = sanitizeReceipts([{ amount: -50_000, currency: 'VND' }]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].amount, -50_000);
  });

  test('recording against an order edits one row rather than stacking a second', () => {
    const first = record('a', { receipts: [receipt(100, '2026-07-01')] });
    const second = createOrderReceivableRecord({
      opportunityId: 'a',
      receipts: [...first.receipts, receipt(200, '2026-07-05')],
      existing: first,
    });

    assert.equal(first.id, second.id);
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(second.receipts.length, 2);
  });
});

describe('receivables: a schedule that does not cover the order', () => {
  /**
   * The parser completes a partial term - "30% deposit" leaves the rest
   * understood - but an operator override skipped that completion, and
   * `sanitizeInstallments` permits an entry with neither a percent nor an
   * amount. Either way the schedule was worth less than the order, and the
   * missing part was owed by nobody: pay the part that was scheduled and the
   * order went settled and left the collections list.
   */
  test('an override worth half the order is completed to the whole of it', () => {
    const summary = buildReceivables({
      orders: [order('half', { amount: 1_000_000, amountBase: 1_000_000 })],
      records: [record('half', {
        installments: [{ id: 'i1', label: 'Deposit', percent: 50, trigger: 'order', offsetDays: 0 }],
      })],
      today: TODAY,
    });

    const row = summary.orders[0];
    assert.equal(row.installments.length, 2, 'the remainder is scheduled, not dropped');
    assert.equal(row.installments.reduce((sum, i) => sum + i.dueBase, 0), 1_000_000);
    assert.equal(row.outstandingBase, 1_000_000);
    assert.equal(row.settled, false);
  });

  test('paying the scheduled half no longer settles the whole order', () => {
    const summary = buildReceivables({
      orders: [order('part', { amount: 1_000_000, amountBase: 1_000_000 })],
      records: [record('part', {
        installments: [{ id: 'i1', label: 'Deposit', percent: 50, trigger: 'order', offsetDays: 0 }],
        receipts: [receipt(500_000, '2026-06-15')],
      })],
      today: TODAY,
    });

    const row = summary.orders[0];
    assert.equal(row.receivedBase, 500_000);
    assert.equal(row.outstandingBase, 500_000, 'the other half is still owed');
    assert.equal(row.settled, false);
    assert.equal(row.overpaidBase, 0, 'covering half an order is not an overpayment');
  });

  test('an installment with neither a percent nor an amount does not zero the order', () => {
    const summary = buildReceivables({
      orders: [order('null', { amount: 1_000_000, amountBase: 1_000_000 })],
      records: [record('null', {
        installments: [{ id: 'i1', label: 'Balance', trigger: 'delivery', offsetDays: 0 }],
      })],
      today: TODAY,
    });

    assert.equal(summary.orders[0].outstandingBase, 1_000_000);
    assert.equal(summary.orders[0].settled, false);
  });

  test('a fixed installment amount is read in the order currency, not the reporting one', () => {
    // Reporting currency is VND here; USD converts at 26,000. A USD order with a
    // fixed 4,000 slice is 104,000,000 VND of the 260,000,000 it is worth - it
    // used to be counted as 4,000 VND, four thousandths of a percent of it.
    const summary = buildReceivables({
      orders: [order('fx', { currency: 'USD', amount: 10_000, amountBase: 260_000_000 })],
      records: [record('fx', {
        installments: [{ id: 'i1', label: 'Deposit', amount: 4_000, trigger: 'order', offsetDays: 0 }],
      })],
      today: TODAY,
    });

    const row = summary.orders[0];
    const deposit = row.installments.find((entry) => entry.label === 'Deposit');
    assert.equal(deposit.dueBase, 104_000_000);
    assert.equal(row.outstandingBase, 260_000_000, 'and the balance still completes the order');
  });
});

describe('receivables: an order in a currency nobody has priced', () => {
  /**
   * `amountBase` comes from `sumMoneyInBase`, which drops what it cannot convert
   * rather than inventing a rate - so the order arrives worth zero, every
   * instalment is a percentage of zero, and the order reported itself collected.
   * Reachable through the UI today: the currency picker offers every ISO code
   * so that operators outside the twenty-one shipped rates can use the product.
   */
  test('is kept open and flagged, not reported as collected', () => {
    const summary = buildReceivables({
      orders: [order('sek', { currency: 'SEK', amount: 90_000, amountBase: 0 })],
      records: [],
      today: TODAY,
    });

    const row = summary.orders[0];
    assert.equal(row.valueUnavailable, true);
    assert.equal(row.settled, false, 'nothing collected it - there is just no rate to read it in');
    assert.equal(summary.openCount, 1, 'it stays in the collections list');
  });

  test('a priced currency is unaffected', () => {
    const summary = buildReceivables({
      orders: [order('vnd', { currency: 'VND', amount: 1_000_000, amountBase: 1_000_000 })],
      records: [],
      today: TODAY,
    });

    assert.equal(summary.orders[0].valueUnavailable, false);
    assert.equal(summary.orders[0].outstandingBase, 1_000_000);
  });

  test('an order genuinely worth nothing is not mistaken for an unpriced one', () => {
    const summary = buildReceivables({
      orders: [order('zero', { currency: 'VND', amount: 0, amountBase: 0 })],
      records: [],
      today: TODAY,
    });

    assert.equal(summary.orders[0].valueUnavailable, false);
    assert.equal(summary.orders[0].settled, true);
  });
});
