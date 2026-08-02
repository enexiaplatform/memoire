import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  buildOrderBook,
  createOrderMilestoneRecord,
  isCommittedToOrder,
  orderMilestoneKeys,
} from '../src/utils/orderToCash.ts';

// Orders & Cash exists because "Money" was answering the wrong question. The
// operator does not want every commercial record; they want the deals the
// customer has already committed to, and the honest position of each one on
// the road to cash. This contract guards the two ways that promise breaks:
// letting an uncommitted deal in, and letting a hand-made tick outrank what a
// quote actually says.

const opportunity = (id, overrides = {}) => ({
  id,
  accountName: 'DP Lab',
  opportunityName: `Order ${id}`,
  stage: 'Negotiation',
  status: 'Active',
  estimatedValue: 1_000_000,
  currency: 'VND',
  pipelineProbability: null,
  ...overrides,
});

const quote = (id, opportunityId, overrides = {}) => ({
  id,
  quoteId: id,
  accountName: 'DP Lab',
  opportunityId,
  opportunityName: '',
  quoteDate: '2026-07-01',
  amount: 500_000,
  currency: 'VND',
  paymentTerm: '',
  status: 'Accepted',
  poStatus: 'Pending',
  deliveryStatus: 'Not scheduled',
  expectedDeliveryDate: '',
  paymentStatus: 'Not due',
  paymentDueDate: '',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

// 1. The 90% line is the gate. A deal the customer has not committed to belongs
//    on Opportunities, where the question is still whether it will be won.
{
  assert.equal(isCommittedToOrder(opportunity('a', { pipelineProbability: 90 })), true);
  assert.equal(isCommittedToOrder(opportunity('b', { pipelineProbability: 89 })), false);
  assert.equal(isCommittedToOrder(opportunity('c', { stage: 'Procurement' })), true);
  assert.equal(isCommittedToOrder(opportunity('d', { status: 'Won' })), true);
  assert.equal(
    isCommittedToOrder(opportunity('e', { status: 'Lost', pipelineProbability: 100 })),
    false,
    'a lost deal is not an order however confident the forecast once was',
  );

  const book = buildOrderBook({
    opportunities: [opportunity('hot', { pipelineProbability: 95 }), opportunity('cold')],
    quotes: [],
    milestoneRecords: [],
    today: '2026-07-28',
  });
  assert.deepEqual(book.orders.map((order) => order.opportunityId), ['hot']);
}

// 2. The five steps are the road to cash, in order. Renaming or reordering them
//    silently changes what every stored tick means.
{
  assert.deepEqual([...orderMilestoneKeys], ['contract', 'deposit', 'delivery', 'invoice', 'paid']);
}

// 3. A quote proves what it proves, and a hand tick can never contradict it.
//    The deposit is the one step no record can prove, which is exactly why the
//    manual tick exists at all.
{
  const proven = buildOrderBook({
    opportunities: [opportunity('a', { status: 'Won' })],
    quotes: [quote('q1', 'a', { poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid' })],
    milestoneRecords: [],
    today: '2026-07-28',
  }).orders[0];
  const byKey = Object.fromEntries(proven.milestones.map((milestone) => [milestone.key, milestone]));

  assert.equal(byKey.contract.evidence, 'quote', 'a received PO proves the contract');
  assert.equal(byKey.delivery.evidence, 'quote');
  assert.equal(byKey.paid.evidence, 'quote');
  assert.equal(byKey.deposit.done, false, 'no record proves a deposit');

  // Unticking by hand must not undo what the quote says.
  const argued = buildOrderBook({
    opportunities: [opportunity('a', { status: 'Won' })],
    quotes: [quote('q1', 'a', { poStatus: 'Received' })],
    milestoneRecords: [createOrderMilestoneRecord({ opportunityId: 'a', milestone: 'contract', done: false })],
    today: '2026-07-28',
  }).orders[0];
  assert.equal(
    argued.milestones.find((milestone) => milestone.key === 'contract').done,
    true,
    'a hand tick fills gaps between records; it never argues with one',
  );
}

// 4. Stuck money surfaces first, and collected orders sink to the bottom as
//    receipts. An order book sorted by anything else buries the thing to chase.
{
  const book = buildOrderBook({
    opportunities: [
      opportunity('collected', { status: 'Won' }),
      opportunity('late', { status: 'Won' }),
    ],
    quotes: [
      quote('q1', 'collected', { paymentStatus: 'Paid' }),
      quote('q2', 'late', { paymentStatus: 'Due', paymentDueDate: '2026-07-01' }),
    ],
    milestoneRecords: [],
    today: '2026-07-28',
  });

  assert.equal(book.orders[0].opportunityId, 'late');
  assert.equal(book.orders[0].overdue, true);
  assert.equal(book.orders[1].fullyCollected, true);
  assert.equal(book.collectedCount, 1);
}

// 5. The surface says what it is. "Money" invited every commercial record onto
//    one page; the rename is the product decision, not a caption.
{
  const registry = readFileSync(new URL('../src/config/featureRegistry.ts', import.meta.url), 'utf8');
  // Shortened to "Orders" on 2026-08-02: the road to cash is what the page
  // shows, the order is what the operator came to look at.
  assert.match(registry, /label: 'Orders'/, 'the destination is named for committed orders');

  const page = readFileSync(new URL('../src/features/revenue/RevenueViewPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /<OrderBookPanel/, 'the order book leads the page');
  assert.match(page, /Orders/, 'the page header matches the rail');
}

// 6. Storage contract: another JSON collection with a real table behind it, and
//    no new API function - the Hobby cap is a hard ceiling.
{
  const cloudStore = readFileSync(new URL('../src/services/cloudJsonCollectionStore.ts', import.meta.url), 'utf8');
  assert.match(cloudStore, /'order_milestones'/, 'order_milestones is a registered JSON collection');

  const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    .join('\n');
  assert.match(migrations, /create table public\.order_milestones/i, 'the collection has a table to sync into');

  const apiFunctions = readdirSync(new URL('../api/', import.meta.url))
    .filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(apiFunctions.length <= 12, `api/ must stay within the Hobby function cap (found ${apiFunctions.length})`);
}

// 7. Following an order is a list with a status, a date and an age - the four
//    things every ERP sales-order screen has and this page did not. The
//    milestone chips answered "how far along", which is not the same question
//    as "where is it stuck, since when, and what do I chase".
{
  const book = buildOrderBook({
    opportunities: [opportunity('a', { status: 'Won' })],
    quotes: [quote('q1', 'a', { quoteDate: '2026-07-01', poStatus: 'Received' })],
    milestoneRecords: [],
    today: '2026-07-28',
  });
  const [order] = book.orders;

  assert.equal(order.orderStage, 'Deposit due', 'the stage is the first step still open');
  assert.equal(order.orderDate, '2026-07-01', 'an order has the date it was placed');
  assert.equal(order.daysInStage, 27, 'an order says how long it has been sitting');
  assert.ok(order.orderRef, 'an order has a reference to chase it by');
  assert.equal(
    book.stages.length,
    6,
    'the book reports every stage, so the operator can count and filter what is stuck where',
  );

  const panel = readFileSync(new URL('../src/features/revenue/OrderBookPanel.tsx', import.meta.url), 'utf8');
  for (const marker of ['orderStage', 'daysInStage', 'orderRef', 'orderDate', '<table']) {
    assert.ok(panel.includes(marker), `the order book must show ${marker}`);
  }
}

console.log('Order-to-cash contract verified: committed orders only, quote evidence outranks hand ticks, every order has a status, a date and an age.');
