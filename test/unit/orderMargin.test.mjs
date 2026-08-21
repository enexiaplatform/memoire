import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {
  DEFAULT_TARGET_MARGIN_PCT,
  buildOrderMargins,
  createOrderCostRecord,
  marginTone,
  normalizeTargetPct,
  rollupMarginByMonth,
  rollupOrderMargins,
} from '../../src/utils/orderMargin.ts';

/**
 * Cost analysis, checked against the arithmetic it claims.
 *
 * This model grades a distributor's book and it is the only place in the product
 * that reports whether the work was worth doing, so the numbers it invents when
 * a field is blank matter as much as the ones it computes. Nothing here had a
 * test; three of the cases below were failing when they were written.
 */

const order = (opportunityId, overrides = {}) => ({
  opportunityId,
  accountName: `Account ${opportunityId}`,
  orderName: `Order ${opportunityId}`,
  orderRef: opportunityId.toUpperCase(),
  stage: 'Won',
  status: 'Won',
  orderStage: 'delivering',
  probability: 100,
  amount: 1_000_000,
  currency: 'VND',
  amountBase: 1_000_000,
  paymentTerm: '',
  quoteCount: 1,
  orderDate: '2026-08-01',
  lastMovedAt: '2026-08-01',
  ...overrides,
});

const cost = (opportunityId, overrides = {}) => createOrderCostRecord({
  opportunityId,
  amount: 800_000,
  currency: 'VND',
  ...overrides,
});

describe('order margin: the buy side against the sell side', () => {
  test('landed cost is goods plus freight, duty and other', () => {
    const summary = buildOrderMargins({
      orders: [order('a')],
      costRecords: [cost('a', {
        amount: 600_000,
        freightAmount: 100_000,
        dutyAmount: 50_000,
        otherAmount: 50_000,
      })],
    });

    const margin = summary.byOrder.get('a');
    assert.equal(margin.goodsBase, 600_000);
    assert.equal(margin.extrasBase, 200_000);
    assert.equal(margin.costBase, 800_000);
    assert.equal(margin.marginBase, 200_000);
    assert.equal(margin.marginPct, 20);
    // The whole argument for recording landed cost: 40% was what it looked like.
    assert.equal(margin.goodsMarginPct, 40);
  });

  test('an order with only extras recorded reports no goods margin rather than 100%', () => {
    const summary = buildOrderMargins({
      orders: [order('a')],
      costRecords: [cost('a', { amount: null, freightAmount: 250_000 })],
    });

    const margin = summary.byOrder.get('a');
    assert.equal(margin.hasCost, true, 'freight alone still means this order has a buy side');
    assert.equal(margin.costBase, 250_000);
    assert.equal(margin.marginPct, 75);
    assert.equal(
      margin.goodsMarginPct,
      null,
      'with no goods price there is no "before landed cost" figure to compare against',
    );
  });

  test('an order with only extras does not lift the workspace goods margin', () => {
    const summary = buildOrderMargins({
      orders: [order('a'), order('b')],
      costRecords: [
        cost('a', { amount: 600_000 }),
        cost('b', { amount: null, freightAmount: 100_000 }),
      ],
    });

    // Only order a has a goods price: 400,000 kept on 1,000,000 sold.
    assert.equal(summary.goodsMarginPct, 40);
  });

  test('a zero-value order contributes no target gap', () => {
    const summary = buildOrderMargins({
      orders: [order('a', { amount: null, amountBase: 0 })],
      costRecords: [cost('a', { amount: 500_000 })],
    });

    const margin = summary.byOrder.get('a');
    assert.equal(margin.marginPct, null, 'no revenue means no percentage to report');
    assert.equal(margin.targetGapBase, 0);
    // The two figures have to describe the same set of orders. They did not:
    // this order was excluded from the count and included in the gap.
    assert.equal(summary.belowTargetCount, 0);
    assert.equal(summary.targetGapBase, 0);
  });

  test('the target gap is the money between what was kept and what was asked for', () => {
    const summary = buildOrderMargins({
      orders: [order('a')],
      costRecords: [cost('a', { amount: 900_000 })],
      targetPct: 20,
    });

    // Kept 100,000; the target asked for 200,000.
    assert.equal(summary.targetGapBase, 100_000);
    assert.equal(summary.belowTargetCount, 1);
    assert.equal(summary.byOrder.get('a').meetsTarget, false);
    assert.equal(summary.byOrder.get('a').priceForTargetBase, 1_125_000);
    assert.equal(summary.byOrder.get('a').costForTargetBase, 800_000);
  });

  test('an order meeting the target is short nothing', () => {
    const summary = buildOrderMargins({
      orders: [order('a')],
      costRecords: [cost('a', { amount: 700_000 })],
      targetPct: 20,
    });

    assert.equal(summary.byOrder.get('a').meetsTarget, true);
    assert.equal(summary.targetGapBase, 0);
    assert.equal(summary.belowTargetCount, 0);
  });

  test('totals cover the costed orders only, and say how many that is', () => {
    const summary = buildOrderMargins({
      orders: [order('a'), order('b'), order('c')],
      costRecords: [cost('a', { amount: 800_000 })],
    });

    assert.equal(summary.coveredCount, 1);
    assert.equal(summary.totalCount, 3);
    assert.equal(summary.revenueBase, 1_000_000, 'uncosted revenue must not inflate the denominator');
    assert.equal(summary.marginPct, 20);
    assert.equal(summary.uncoveredCount, 2);
    assert.equal(summary.uncoveredRevenueBase, 2_000_000);
  });

  test('an order priced below cost is counted as a loss', () => {
    const summary = buildOrderMargins({
      orders: [order('a')],
      costRecords: [cost('a', { amount: 1_200_000 })],
    });

    assert.equal(summary.losingCount, 1);
    assert.equal(summary.byOrder.get('a').marginBase, -200_000);
    assert.equal(marginTone(summary.byOrder.get('a').marginPct), 'loss');
  });

  test('tracked follows the cost records, not the orders still in the book', () => {
    const withoutCosts = buildOrderMargins({ orders: [order('a')], costRecords: [] });
    assert.equal(withoutCosts.tracked, false);

    // The order this cost belongs to has left the book. The operator still
    // prices their buy side, so the column stays.
    const orphaned = buildOrderMargins({ orders: [], costRecords: [cost('gone')] });
    assert.equal(orphaned.tracked, true);

    const deleted = buildOrderMargins({
      orders: [order('a')],
      costRecords: [{ ...cost('a'), __deleted: true }],
    });
    assert.equal(deleted.tracked, false);
    assert.equal(deleted.byOrder.get('a').hasCost, false);
  });

  test('a target outside 0-99 falls back to something you can price from', () => {
    assert.equal(normalizeTargetPct('22'), 22);
    assert.equal(normalizeTargetPct(140), 99);
    assert.equal(normalizeTargetPct(-5), 0);
    assert.equal(normalizeTargetPct('not a number'), DEFAULT_TARGET_MARGIN_PCT);
    assert.equal(normalizeTargetPct(undefined), DEFAULT_TARGET_MARGIN_PCT);
  });
});

describe('order margin: gathered by what the orders have in common', () => {
  test('a group with nothing costed is unknown rather than zero', () => {
    const margins = buildOrderMargins({
      orders: [order('a'), order('b')],
      costRecords: [cost('a', { amount: 800_000 })],
    });

    const groups = rollupOrderMargins({
      entries: [
        { opportunityId: 'a', key: 'acme', label: 'Acme' },
        { opportunityId: 'b', key: 'globex', label: 'Globex' },
      ],
      margins,
    });

    const globex = groups.find((group) => group.key === 'globex');
    assert.equal(globex.unknown, true);
    assert.equal(globex.marginPct, null);
    assert.equal(globex.orderCount, 1);
    assert.equal(globex.coveredCount, 0);

    const acme = groups.find((group) => group.key === 'acme');
    assert.equal(acme.marginPct, 20);
    // Readable groups first; the uncosted one sinks rather than hides.
    assert.equal(groups[0].key, 'acme');
  });
});

describe('order margin: the direction, not just the snapshot', () => {
  test('months are drawn in order and orders outside the window are not folded in', () => {
    const margins = buildOrderMargins({
      orders: [order('a', { orderDate: '2026-08-03' }), order('old', { orderDate: '2025-01-05' })],
      costRecords: [cost('a', { amount: 800_000 }), cost('old', { amount: 100_000 })],
    });

    const periods = rollupMarginByMonth({
      orders: [order('a', { orderDate: '2026-08-03' }), order('old', { orderDate: '2025-01-05' })],
      margins,
      monthCount: 3,
      today: '2026-08-06',
    });

    assert.deepEqual(periods.map((period) => period.key), ['2026-06', '2026-07', '2026-08']);
    assert.equal(periods[2].orderCount, 1, 'the 2025 order belongs to no drawn month');
    assert.equal(periods[2].marginPct, 20);
    assert.equal(periods[0].marginPct, null, 'an empty month reports nothing, not 0%');
  });

  test('a December window rolls the year over correctly', () => {
    const periods = rollupMarginByMonth({
      orders: [],
      margins: buildOrderMargins({ orders: [], costRecords: [] }),
      monthCount: 3,
      today: '2027-01-15',
    });

    assert.deepEqual(periods.map((period) => period.key), ['2026-11', '2026-12', '2027-01']);
  });
});

describe('order margin: writing the buy side down', () => {
  test('re-entering a cost edits the same row rather than stacking a second one', () => {
    const first = createOrderCostRecord({ opportunityId: 'a', amount: 100, currency: 'usd' });
    const second = createOrderCostRecord({
      opportunityId: 'a',
      amount: 200,
      currency: 'USD',
      existing: first,
    });

    assert.equal(first.id, second.id);
    assert.equal(first.currency, 'USD', 'currency is normalised on the way in');
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(second.amount, 200);
  });

  test('extras keep the currency they were paid in, and inherit rather than invent one', () => {
    const usdGoods = createOrderCostRecord({ opportunityId: 'a', amount: 100, currency: 'USD' });
    assert.equal(usdGoods.extrasCurrency, 'USD', 'a record written with no extras currency follows the goods');

    const withDong = createOrderCostRecord({
      opportunityId: 'a',
      amount: 100,
      currency: 'USD',
      extrasCurrency: 'vnd',
      existing: usdGoods,
    });
    assert.equal(withDong.extrasCurrency, 'VND');

    const editedLater = createOrderCostRecord({
      opportunityId: 'a',
      amount: 120,
      currency: 'USD',
      existing: withDong,
    });
    assert.equal(editedLater.extrasCurrency, 'VND', 'an edit must not silently reset a chosen currency');
  });

  test('a blank cost field is absent, not zero', () => {
    const record = createOrderCostRecord({
      opportunityId: 'a',
      amount: Number.NaN,
      currency: 'VND',
      freightAmount: undefined,
    });

    assert.equal(record.amount, null);
    assert.equal(record.freightAmount, null);
  });
});

describe('order margin: a cost in a currency nobody has priced', () => {
  test('is not counted as covered and reports no margin', () => {
    const summary = buildOrderMargins({
      orders: [order('sek', { amount: 500_000_000, amountBase: 500_000_000 })],
      // SEK ships no planning rate and none has been set for this workspace.
      costRecords: [cost('sek', { amount: 40_000, currency: 'SEK' })],
    });

    const margin = summary.byOrder.get('sek');
    assert.equal(margin.costUnavailable, true);
    assert.equal(margin.marginPct, null, 'it used to read 100');
    assert.equal(margin.goodsMarginPct, null);
    assert.equal(margin.meetsTarget, false);
    assert.equal(margin.targetGapBase, 0);
    assert.equal(margin.priceForTargetBase, null, 'it used to say "you needed to sell it for nothing"');

    assert.equal(summary.coveredCount, 0, 'a cost nobody can value is not coverage');
    assert.equal(summary.uncoveredCount, 1, 'it belongs in the blind spot, because that is what it is');
    assert.equal(summary.marginPct, null, 'and it cannot inflate the workspace margin');
  });
});

describe('order cost: the delivery lag is part of the record, not the screen', () => {
  test('a lag the operator typed survives being written', () => {
    const record = createOrderCostRecord({
      opportunityId: 'a',
      amount: 168_000,
      currency: 'EUR',
      paymentTerm: '30% deposit, 70% net 45',
      deliveryLagDays: 60,
    });

    assert.equal(record.deliveryLagDays, 60);
  });

  test('a caller with no delivery field cannot zero a lag somebody else recorded', () => {
    const existing = createOrderCostRecord({
      opportunityId: 'a',
      amount: 168_000,
      currency: 'EUR',
      deliveryLagDays: 60,
    });

    // Cost Analysis saves a purchase price from a surface that has no delivery
    // field. Omitting it must keep the lag, exactly as omitting terms keeps
    // the terms.
    const resaved = createOrderCostRecord({
      opportunityId: 'a',
      amount: 171_000,
      currency: 'EUR',
      existing,
    });

    assert.equal(resaved.deliveryLagDays, 60);
  });

  test('never recorded reads as null, not as delivered on payment day', () => {
    const record = createOrderCostRecord({ opportunityId: 'a', amount: 1, currency: 'EUR' });

    assert.equal(
      record.deliveryLagDays,
      null,
      'zero would price the order as if it shipped the day it was paid for, which is a claim nobody made',
    );
  });
});
