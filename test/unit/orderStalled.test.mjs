import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildOrderBook, ORDER_STALLED_AFTER_DAYS } from '../../src/utils/orderToCash.ts';

const TODAY = '2026-08-24';

const wonDeal = (id, closedOn) => ({
  id, accountName: `Account ${id}`, opportunityName: `Order ${id}`,
  stage: 'Won', status: 'Won', estimatedValue: 112_000, currency: 'VND',
  pipelineProbability: null, nextAction: '', nextActionDate: '',
  updatedAt: '2026-08-23T09:00:00.000Z', closedOn,
});

const book = (opportunities, quotes = []) => buildOrderBook({
  opportunities, quotes, milestoneRecords: [], today: TODAY,
});

describe('an order nobody dated can still be late', () => {
  test('a contract sitting since March is stalled', () => {
    // `overdue` needs a dueDate, and a step's date only ever comes from a
    // quote's payment terms - so a handshake order can sit for ever and the
    // book reported "Overdue follow-ups: 0" over an order 171 days old.
    const result = book([wonDeal('a', '2026-03-06')]);
    assert.equal(result.orders[0].overdue, false, 'still not overdue - nobody set a date');
    assert.equal(result.orders[0].stalled, true);
    assert.equal(result.stalledCount, 1);
  });

  test('an order that moved last week is not stalled', () => {
    const recent = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    const result = book([wonDeal('b', recent)]);
    assert.equal(result.orders[0].stalled, false);
    assert.equal(result.stalledCount, 0);
  });

  test('the threshold is the boundary, not a suggestion', () => {
    const dayBefore = new Date(Date.parse(`${TODAY}T00:00:00Z`) - (ORDER_STALLED_AFTER_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
    const onIt = new Date(Date.parse(`${TODAY}T00:00:00Z`) - ORDER_STALLED_AFTER_DAYS * 86_400_000).toISOString().slice(0, 10);
    assert.equal(book([wonDeal('c', dayBefore)]).orders[0].stalled, false);
    assert.equal(book([wonDeal('d', onIt)]).orders[0].stalled, true);
  });

  test('stuck money sorts to the top whichever way it is stuck', () => {
    const recent = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10);
    const result = book([wonDeal('fresh', recent), wonDeal('old', '2026-03-06')]);
    assert.equal(result.orders[0].orderName, 'Order old');
  });
});
