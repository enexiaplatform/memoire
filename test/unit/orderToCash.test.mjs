import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {
  buildOrderBook,
  createOrderMilestoneRecord,
  isCommittedToOrder,
} from '../../src/utils/orderToCash.ts';

const opportunity = (id, overrides = {}) => ({
  id,
  accountName: `Account ${id}`,
  opportunityName: `Order ${id}`,
  stage: 'Negotiation',
  status: 'Active',
  estimatedValue: 1_000_000,
  currency: 'VND',
  pipelineProbability: null,
  nextAction: '',
  nextActionDate: '',
  ...overrides,
});

const quote = (id, opportunityId, overrides = {}) => ({
  id,
  quoteId: id,
  accountName: 'Account a',
  opportunityId,
  opportunityName: '',
  title: `Quote ${id}`,
  quoteDate: '2026-07-01',
  validUntil: '',
  amount: 500_000,
  currency: 'VND',
  grossMarginEstimate: null,
  discount: null,
  paymentTerm: '30% deposit, 70% on delivery',
  status: 'Accepted',
  poStatus: 'Pending',
  deliveryStatus: 'Not scheduled',
  expectedDeliveryDate: '',
  paymentStatus: 'Not due',
  paymentDueDate: '',
  nextAction: '',
  notes: '',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

describe('order book: who is committed', () => {
  test('won, procurement, and 90%+ deals are committed; colder deals are not', () => {
    assert.equal(isCommittedToOrder(opportunity('a', { status: 'Won' })), true);
    assert.equal(isCommittedToOrder(opportunity('b', { stage: 'Procurement' })), true);
    assert.equal(isCommittedToOrder(opportunity('c', { pipelineProbability: 90 })), true);
    assert.equal(isCommittedToOrder(opportunity('d', { pipelineProbability: 89 })), false);
    assert.equal(isCommittedToOrder(opportunity('e', { status: 'Lost', pipelineProbability: 100 })), false);
    assert.equal(isCommittedToOrder(opportunity('f')), false);
  });
});

describe('order book: milestones from quote evidence', () => {
  test('a received PO proves the contract; a delivery proves delivery; payment proves invoice and collection', () => {
    const book = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won' })],
      quotes: [quote('q1', 'a', { poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid' })],
      milestoneRecords: [],
      today: '2026-07-28',
    });

    const [order] = book.orders;
    const byKey = Object.fromEntries(order.milestones.map((milestone) => [milestone.key, milestone]));
    assert.equal(byKey.contract.done, true);
    assert.equal(byKey.contract.evidence, 'quote');
    assert.equal(byKey.delivery.done, true);
    assert.equal(byKey.invoice.done, true);
    assert.equal(byKey.paid.done, true);
    // The deposit has no record to prove it - open until ticked by hand.
    assert.equal(byKey.deposit.done, false);
    assert.equal(order.fullyCollected, true);
  });

  test('a hand tick fills a gap but never argues with quote evidence', () => {
    const deposit = createOrderMilestoneRecord({ opportunityId: 'a', milestone: 'deposit', done: true });
    const book = buildOrderBook({
      opportunities: [opportunity('a', { pipelineProbability: 95 })],
      quotes: [quote('q1', 'a', { poStatus: 'Received' })],
      milestoneRecords: [deposit],
      today: '2026-07-28',
    });

    const byKey = Object.fromEntries(book.orders[0].milestones.map((milestone) => [milestone.key, milestone]));
    assert.equal(byKey.deposit.done, true);
    assert.equal(byKey.deposit.evidence, 'manual');
    assert.equal(byKey.contract.evidence, 'quote');
  });

  test('an unpaid quote past its payment due date makes the order overdue', () => {
    const book = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won' })],
      quotes: [quote('q1', 'a', { paymentStatus: 'Due', paymentDueDate: '2026-07-20' })],
      milestoneRecords: [],
      today: '2026-07-28',
    });

    assert.equal(book.orders[0].overdue, true);
    assert.equal(book.overdueCount, 1);
  });
});

describe('order book: ordering and totals', () => {
  test('collected orders sink; awaiting total counts only uncollected money', () => {
    const book = buildOrderBook({
      opportunities: [
        opportunity('paidOrder', { status: 'Won' }),
        opportunity('openOrder', { status: 'Won' }),
      ],
      quotes: [
        quote('q1', 'paidOrder', { paymentStatus: 'Paid', amount: 200_000 }),
        quote('q2', 'openOrder', { amount: 300_000 }),
      ],
      milestoneRecords: [],
      today: '2026-07-28',
    });

    assert.equal(book.orders[0].opportunityId, 'openOrder');
    assert.equal(book.orders[1].fullyCollected, true);
    assert.equal(book.collectedCount, 1);
    assert.equal(book.awaitingBase, 300_000);
  });

  test('quotes link by id or by matching account and order name', () => {
    const book = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won', accountName: 'DP Lab', opportunityName: 'Isolator' })],
      quotes: [quote('q1', '', { accountName: 'dp lab', opportunityName: 'isolator', amount: 700_000 })],
      milestoneRecords: [],
      today: '2026-07-28',
    });

    assert.equal(book.orders[0].quoteCount, 1);
    assert.equal(book.orders[0].amount, 700_000);
  });
});

describe('order book: where the order is standing', () => {
  test('the stage is the first open step, and it is Collected once nothing is open', () => {
    const book = buildOrderBook({
      opportunities: [
        opportunity('fresh', { status: 'Won' }),
        opportunity('delivering', { status: 'Won' }),
        opportunity('done', { status: 'Won' }),
      ],
      quotes: [
        quote('q1', 'fresh'),
        quote('q2', 'delivering', { poStatus: 'Received' }),
        quote('q3', 'done', { poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid' }),
      ],
      milestoneRecords: [
        // The deposit is the one step no record proves, so it has to be ticked
        // by hand before an order can read as "to deliver" or as collected.
        createOrderMilestoneRecord({ opportunityId: 'delivering', milestone: 'deposit', done: true }),
        createOrderMilestoneRecord({ opportunityId: 'done', milestone: 'deposit', done: true }),
      ],
      today: '2026-07-28',
    });

    const byId = Object.fromEntries(book.orders.map((order) => [order.opportunityId, order]));
    assert.equal(byId.fresh.orderStage, 'To confirm');
    assert.equal(byId.delivering.orderStage, 'To deliver');
    assert.equal(byId.done.orderStage, 'Collected');
    assert.equal(byId.done.fullyCollected, true);
  });

  test('every stage is reported, including the empty ones', () => {
    const book = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won' })],
      quotes: [quote('q1', 'a', { amount: 250_000 })],
      milestoneRecords: [],
      today: '2026-07-28',
    });

    assert.deepEqual(
      book.stages.map((stage) => stage.stage),
      ['To confirm', 'Deposit due', 'To deliver', 'To invoice', 'Awaiting payment', 'Collected'],
    );
    const toConfirm = book.stages.find((stage) => stage.stage === 'To confirm');
    assert.equal(toConfirm.count, 1);
    assert.equal(toConfirm.valueBase, 250_000);
    assert.equal(book.stages.find((stage) => stage.stage === 'Collected').count, 0);
  });

  test('aging runs from the last thing that actually moved, not from the row', () => {
    const ticked = createOrderMilestoneRecord({ opportunityId: 'a', milestone: 'deposit', done: true });
    const book = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won' })],
      // Ordered on the 1st; nothing has moved since.
      quotes: [quote('q1', 'a', { quoteDate: '2026-07-01' })],
      milestoneRecords: [],
      today: '2026-07-28',
    });
    assert.equal(book.orders[0].orderDate, '2026-07-01');
    assert.equal(book.orders[0].daysInStage, 27);

    const moved = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won' })],
      quotes: [quote('q1', 'a', { quoteDate: '2026-07-01' })],
      milestoneRecords: [{ ...ticked, doneAt: '2026-07-26T09:00:00.000Z' }],
      today: '2026-07-28',
    });
    assert.equal(moved.orders[0].daysInStage, 2, 'a step ticked two days ago resets the clock');
  });

  test('an order without a quote still has a reference to chase it by', () => {
    const book = buildOrderBook({
      opportunities: [opportunity('abc123def', { status: 'Won' })],
      quotes: [],
      milestoneRecords: [],
      today: '2026-07-28',
    });
    assert.equal(book.orders[0].orderRef, 'ORD-123DEF');
  });

  test('the next step carries its own due date and lateness', () => {
    const book = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won' })],
      quotes: [quote('q1', 'a', { poStatus: 'Received', expectedDeliveryDate: '2026-07-20' })],
      milestoneRecords: [createOrderMilestoneRecord({ opportunityId: 'a', milestone: 'deposit', done: true })],
      today: '2026-07-28',
    });

    const [order] = book.orders;
    assert.equal(order.orderStage, 'To deliver');
    assert.equal(order.nextDueDate, '2026-07-20');
    assert.equal(order.daysUntilDue, -8);
    assert.equal(order.overdue, true);
  });
});

describe('order book: where the payment terms come from', () => {
  const costRecord = (opportunityId, paymentTerm) => ({
    id: `oc-${opportunityId}`,
    opportunityId,
    amount: 700_000,
    currency: 'VND',
    freightAmount: null,
    dutyAmount: null,
    otherAmount: null,
    extrasCurrency: 'VND',
    supplier: '',
    paymentTerm,
    note: '',
    createdAt: '',
    updatedAt: '',
  });

  test('terms recorded while pricing are used when no quote carries any', () => {
    // The operator types "30% deposit, 70% net 45" on the deal, watches Memoire
    // read it into two dated slices, and saves. Before this the terms lived in
    // component state only, and the order book said "No payment term" for an
    // order whose price had been calculated from them.
    const book = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won' })],
      quotes: [],
      milestoneRecords: [],
      costRecords: [costRecord('a', '30% deposit, 70% net 45')],
      today: '2026-07-28',
    });

    assert.equal(book.orders[0].paymentTerm, '30% deposit, 70% net 45');
  });

  test('a quote the customer has seen outranks the working assumption', () => {
    const book = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won' })],
      quotes: [quote('q1', 'a', { paymentTerm: 'Net 30' })],
      milestoneRecords: [],
      costRecords: [costRecord('a', '30% deposit, 70% net 45')],
      today: '2026-07-28',
    });

    assert.equal(book.orders[0].paymentTerm, 'Net 30');
  });

  test('a caller that never loaded costs behaves exactly as before', () => {
    const book = buildOrderBook({
      opportunities: [opportunity('a', { status: 'Won' })],
      quotes: [],
      milestoneRecords: [],
      today: '2026-07-28',
    });

    assert.equal(book.orders[0].paymentTerm, '');
  });
});
