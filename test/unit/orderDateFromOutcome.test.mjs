import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildOrderBook } from '../../src/utils/orderToCash.ts';

const wonDeal = (id, updatedAt) => ({
  id,
  accountName: `Account ${id}`,
  opportunityName: `Order ${id}`,
  stage: 'Won',
  status: 'Won',
  estimatedValue: 112_000,
  currency: 'EUR',
  pipelineProbability: null,
  nextAction: '',
  nextActionDate: '',
  updatedAt,
});

const outcome = (opportunityId, outcomeDate, overrides = {}) => ({
  id: `out-${opportunityId}`,
  opportunityId,
  accountName: '',
  opportunityName: '',
  outcome: 'Won',
  outcomeDate,
  finalAmount: null,
  currency: 'EUR',
  ...overrides,
});

const TODAY = '2026-08-23';

describe('an order is dated when the customer committed, not when the row was written', () => {
  test('a deal won in March is an order from March', () => {
    // The whole of a six-month book arrived by import, so every row's
    // `updatedAt` was the import. Orders showed five deals signed between
    // March and August all "ordered today, 0d waiting", and a March order
    // still uninvoiced reported nothing overdue.
    const book = buildOrderBook({
      opportunities: [wonDeal('a', '2026-08-23T09:00:00.000Z')],
      quotes: [],
      milestoneRecords: [],
      outcomes: [outcome('a', '2026-03-06')],
      today: TODAY,
    });
    assert.equal(book.orders[0].orderDate, '2026-03-06');
  });

  test('without an outcome it still falls back to the record, as before', () => {
    const book = buildOrderBook({
      opportunities: [wonDeal('b', '2026-08-23T09:00:00.000Z')],
      quotes: [],
      milestoneRecords: [],
      today: TODAY,
    });
    assert.equal(book.orders[0].orderDate, '2026-08-23');
  });

  test('a deleted outcome is not a close date', () => {
    const book = buildOrderBook({
      opportunities: [wonDeal('c', '2026-08-23T09:00:00.000Z')],
      quotes: [],
      milestoneRecords: [],
      outcomes: [outcome('c', '2026-03-06', { __deleted: true })],
      today: TODAY,
    });
    assert.equal(book.orders[0].orderDate, '2026-08-23');
  });

  test('an unreadable outcome date is not a close date', () => {
    const book = buildOrderBook({
      opportunities: [wonDeal('d', '2026-08-23T09:00:00.000Z')],
      quotes: [],
      milestoneRecords: [],
      outcomes: [outcome('d', 'sometime in spring')],
      today: TODAY,
    });
    assert.equal(book.orders[0].orderDate, '2026-08-23');
  });

  test('ageing is measured from the close date, so an old order reads old', () => {
    const book = buildOrderBook({
      opportunities: [wonDeal('e', '2026-08-23T09:00:00.000Z')],
      quotes: [],
      milestoneRecords: [],
      outcomes: [outcome('e', '2026-03-06')],
      today: TODAY,
    });
    assert.ok(book.orders[0].daysInStage > 150, `expected an aged order, got ${book.orders[0].daysInStage}`);
  });
});
