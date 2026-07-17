import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCashPosition } from '../../src/utils/cashPosition.ts';

const paid = (amount, currency = 'VND') => ({
  __deleted: false, status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered',
  paymentStatus: 'Paid', amount, currency, quoteDate: '2026-07-01', paymentDueDate: '2026-07-10',
});
const awaiting = (amount, currency = 'VND') => ({
  __deleted: false, status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered',
  paymentStatus: 'Due', amount, currency, quoteDate: '2026-07-01', paymentDueDate: '2026-07-20',
});
const expense = (amount, status, category = 'Other') => ({
  __deleted: false, status, category, amount, currency: 'VND', expenseDate: '2026-07-05', dueDate: '2026-07-25',
});

describe('buildCashPosition', () => {
  test('realized profit is collected cash minus paid expenses only', () => {
    const model = buildCashPosition({
      quotes: [paid(500_000_000), awaiting(300_000_000)],
      expenses: [expense(180_000_000, 'Paid'), expense(60_000_000, 'Upcoming')],
      today: '2026-07-17',
    });
    assert.equal(model.collectedRevenueBase, 500_000_000);
    assert.equal(model.paidExpensesBase, 180_000_000);
    assert.equal(model.realizedProfitBase, 320_000_000);
    assert.equal(model.projectedDeltaBase, 240_000_000);
  });

  test('a loss is reported honestly as a negative realized profit', () => {
    const model = buildCashPosition({
      quotes: [paid(50_000_000)],
      expenses: [expense(120_000_000, 'Paid')],
      today: '2026-07-17',
    });
    assert.equal(model.realizedProfitBase, -70_000_000);
  });

  test('absolute cash appears only with an opening balance', () => {
    const without = buildCashPosition({ quotes: [paid(100_000_000)], expenses: [], today: '2026-07-17' });
    assert.equal(without.cashOnHandBase, null);
    const withOpening = buildCashPosition({ quotes: [paid(100_000_000)], expenses: [expense(40_000_000, 'Paid')], openingBalanceBase: 200_000_000, today: '2026-07-17' });
    assert.equal(withOpening.cashOnHandBase, 260_000_000);
  });

  test('unsupported currencies are excluded, never guessed', () => {
    const model = buildCashPosition({ quotes: [paid(100, 'XYZ'), paid(5, 'VND')], expenses: [], today: '2026-07-17' });
    assert.equal(model.collectedRevenueBase, 5);
  });

  test('deleted records are ignored', () => {
    const model = buildCashPosition({
      quotes: [{ ...paid(100_000_000), __deleted: true }],
      expenses: [{ ...expense(10_000_000, 'Paid'), __deleted: true }],
      today: '2026-07-17',
    });
    assert.equal(model.collectedRevenueBase, 0);
    assert.equal(model.paidExpensesBase, 0);
  });
});
