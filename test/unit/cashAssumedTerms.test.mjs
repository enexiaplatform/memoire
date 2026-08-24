import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildOrderBook } from '../../src/utils/orderToCash.ts';
import { buildReceivables } from '../../src/utils/receivables.ts';

const TODAY = '2026-08-24';

const wonDeal = (id, closedOn, amount = 164_000) => ({
  id, accountName: `Account ${id}`, opportunityName: `Order ${id}`,
  stage: 'Won', status: 'Won', estimatedValue: amount, currency: 'VND',
  pipelineProbability: null, nextAction: '', nextActionDate: '',
  updatedAt: '2026-08-23T09:00:00.000Z', closedOn,
});

const receivables = (opportunities, quotes = []) => {
  const book = buildOrderBook({ opportunities, quotes, milestoneRecords: [], today: TODAY });
  return buildReceivables({ orders: book.orders, records: [], today: TODAY });
};

describe('money past a date nobody agreed', () => {
  test('an order with no terms is marked assumed, not stated', () => {
    // An empty payment term parses to "100% on delivery, offset 0" with
    // confidence 'assumed'. The page then reported "Money you agreed would be
    // here" over five handshakes.
    const summary = receivables([wonDeal('a', '2026-03-06')]);
    assert.equal(summary.orders[0].termConfidence, 'assumed');
  });

  test('it is still counted, because it is still what to chase', () => {
    const summary = receivables([wonDeal('a', '2026-03-06')]);
    assert.ok(summary.totalOverdueBase > 0, 'an assumed date is still a date to work from');
  });

  test('a stated term is not marked assumed', () => {
    const quote = {
      id: 'q1', quoteId: 'q1', accountName: 'Account a', opportunityId: 'a', opportunityName: 'Order a',
      title: 'Quote', quoteDate: '2026-03-06', validUntil: '', amount: 164_000, currency: 'VND',
      grossMarginEstimate: null, discount: null, paymentTerm: 'Net 30', status: 'Accepted',
      poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Due', paymentDueDate: '',
      createdAt: '2026-03-06T00:00:00.000Z', updatedAt: '2026-03-06T00:00:00.000Z', storageMode: 'local',
    };
    const summary = receivables([wonDeal('a', '2026-03-06')], [quote]);
    assert.equal(summary.orders[0].termConfidence, 'stated');
  });

  test('the two pages agree that this money is stuck', () => {
    // Orders said nought overdue while Cash said all of it past due, on the
    // same five orders on the same day: no date meant never late on one page
    // and always late on the other.
    const book = buildOrderBook({
      opportunities: [wonDeal('a', '2026-03-06')], quotes: [], milestoneRecords: [], today: TODAY,
    });
    const summary = buildReceivables({ orders: book.orders, records: [], today: TODAY });
    assert.equal(book.stalledCount, 1, 'Orders now sees it');
    assert.ok(summary.totalOverdueBase > 0, 'Cash always did');
  });
});
