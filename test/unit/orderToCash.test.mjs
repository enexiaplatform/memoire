import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
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
