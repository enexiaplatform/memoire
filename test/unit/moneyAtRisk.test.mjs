import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildOrderBook } from '../../src/utils/orderToCash.ts';
import { buildReceivables } from '../../src/utils/receivables.ts';
import { buildOrderMargins } from '../../src/utils/orderMargin.ts';
import { buildMoneyAtRisk } from '../../src/utils/moneyAtRisk.ts';

const TODAY = '2026-09-16';

const won = (id, patch = {}) => ({
  id, accountName: `Account ${id}`, opportunityName: `Order ${id}`, stage: 'Won', status: 'Won',
  estimatedValue: 100_000_000, currency: 'VND', pipelineProbability: null, nextAction: '', nextActionDate: '',
  updatedAt: '2026-09-01T09:00:00.000Z', createdAt: '2026-08-01T09:00:00.000Z', closedOn: '2026-09-01', ...patch,
});

const tick = (opportunityId, milestone, doneAt) => ({
  id: `om-${opportunityId}-${milestone}`, opportunityId, milestone, done: true, doneAt,
  createdAt: `${doneAt}T00:00:00.000Z`, updatedAt: `${doneAt}T00:00:00.000Z`,
});

function risk({ opportunities, milestones = [], receivables = [], costs = [], commitments = [], targetPct = 20 }) {
  const book = buildOrderBook({ opportunities, quotes: [], milestoneRecords: milestones, costRecords: costs, today: TODAY });
  return buildMoneyAtRisk({
    orders: book.orders,
    receivables: buildReceivables({ orders: book.orders, records: receivables, today: TODAY }),
    margins: buildOrderMargins({ orders: book.orders, costRecords: costs, targetPct }),
    commitments,
    today: TODAY,
  });
}

const kinds = (result) => result.items.map((item) => item.kind);

describe('money at risk derives from the canonical engines', () => {
  test('won two weeks ago with no PO is an exception; won yesterday is not yet', () => {
    const late = risk({ opportunities: [won('a', { closedOn: '2026-09-01' })] });
    assert.ok(kinds(late).includes('won-no-po'));
    const item = late.items.find((entry) => entry.kind === 'won-no-po');
    assert.match(item.what, /no contract or PO/);
    assert.equal(item.action, 'Get the PO from Account a');

    const fresh = risk({ opportunities: [won('b', { closedOn: '2026-09-15' })] });
    assert.equal(kinds(fresh).includes('won-no-po'), false);
  });

  test('delivered and not invoiced is two ticks that disagree', () => {
    const result = risk({
      opportunities: [won('c')],
      milestones: [tick('c', 'contract', '2026-09-02'), tick('c', 'delivery', '2026-09-05')],
    });
    const item = result.items.find((entry) => entry.kind === 'delivered-not-invoiced');
    assert.ok(item);
    assert.match(item.what, /11 days ago/);
    assert.equal(kinds(result).includes('won-no-po'), false, 'the PO is ticked');
  });

  test('a customer promise to pay that has passed is the earliest warning', () => {
    const result = risk({
      opportunities: [won('d')],
      milestones: [tick('d', 'contract', '2026-09-02')],
      commitments: [{
        id: 'cm1', userId: null, threadId: '', accountId: '', accountName: 'Account d', opportunityId: 'd',
        commitmentParty: 'customer', ownerLabel: 'Purchasing', commitmentText: 'Transfer the deposit',
        originalDueDate: '2026-09-05', currentDueDate: '2026-09-10', silenceThresholdDays: 7, status: 'open',
        impactType: 'none', dueDateHistory: [{ from: '2026-09-05', to: '2026-09-10' }], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '',
      }],
    });
    const item = result.items.find((entry) => entry.kind === 'payment-promise-missed');
    assert.ok(item);
    assert.equal(item.severity, 'critical', 'a promise already moved once and missed again');
    assert.match(item.what, /moved 1 time/);
    assert.equal(result.items[0].kind, 'payment-promise-missed', 'critical sorts first');
  });

  test('a customer promise that is not about money is not money at risk', () => {
    const result = risk({
      opportunities: [won('e')],
      milestones: [tick('e', 'contract', '2026-09-02')],
      commitments: [{
        id: 'cm2', accountName: 'Account e', commitmentParty: 'customer', commitmentText: 'Send the stability report',
        currentDueDate: '2026-09-10', originalDueDate: '2026-09-10', status: 'open', impactType: 'none', dueDateHistory: [], createdAt: '',
      }],
    });
    assert.equal(kinds(result).includes('payment-promise-missed'), false);
  });

  test('margin is graded by the margin engine, and an unpriced cost is never a verdict', () => {
    const below = risk({
      opportunities: [won('f')],
      milestones: [tick('f', 'contract', '2026-09-02')],
      costs: [{ id: 'c1', opportunityId: 'f', amount: 90_000_000, currency: 'VND', freightAmount: null, dutyAmount: null, otherAmount: null, extrasCurrency: '', paymentTerm: '', createdAt: '', updatedAt: '' }],
    });
    assert.ok(kinds(below).includes('margin-below-target'));

    const unpriced = risk({
      opportunities: [won('g')],
      milestones: [tick('g', 'contract', '2026-09-02')],
      costs: [{ id: 'c2', opportunityId: 'g', amount: 90_000_000, currency: 'XYZ', freightAmount: null, dutyAmount: null, otherAmount: null, extrasCurrency: '', paymentTerm: '', createdAt: '', updatedAt: '' }],
    });
    assert.equal(kinds(unpriced).includes('margin-below-target'), false);
  });

  test('a stalled order is the order book\'s stalled order', () => {
    const result = risk({ opportunities: [won('h', { closedOn: '2026-06-01', updatedAt: '2026-06-01T00:00:00.000Z' })], milestones: [tick('h', 'contract', '2026-06-02')] });
    assert.ok(kinds(result).includes('order-stuck'));
  });

  test('an order counted twice is exposed once', () => {
    const result = risk({ opportunities: [won('i', { closedOn: '2026-06-01', updatedAt: '2026-06-01T00:00:00.000Z' })] });
    assert.ok(result.items.filter((item) => item.opportunityId === 'i').length >= 2);
    assert.equal(result.exposureBase, 100_000_000);
  });

  test('an invoice with no agreed term says the date was assumed', () => {
    // Collections treats an order with no payment term as due on the order
    // date, and still counts it - it is what to chase. This list gives the same
    // number and says where the date came from.
    const result = risk({ opportunities: [won('k', { closedOn: '2026-09-10' })], milestones: [tick('k', 'contract', '2026-09-10')] });
    const item = result.items.find((entry) => entry.kind === 'invoice-overdue');
    assert.ok(item);
    assert.match(item.what, /no payment term/);
  });

  test('a healthy book has nothing at risk', () => {
    const result = risk({
      opportunities: [won('j', { closedOn: '2026-09-14' })],
      milestones: [tick('j', 'contract', '2026-09-14')],
      costs: [{ id: 'cj', opportunityId: 'j', amount: null, currency: 'VND', freightAmount: null, dutyAmount: null, otherAmount: null, extrasCurrency: '', paymentTerm: 'Net 30', createdAt: '', updatedAt: '' }],
    });
    assert.deepEqual(result.items, []);
  });
});
