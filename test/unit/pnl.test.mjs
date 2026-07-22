import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfitAndLoss } from '../../src/utils/pnl.ts';

const quote = (overrides = {}) => ({
  id: `q-${Math.random().toString(36).slice(2)}`,
  accountName: 'Apex', opportunityName: 'Deal', title: 'Quote',
  amount: 100_000_000, currency: 'VND',
  status: 'Accepted', paymentStatus: 'Paid', poStatus: 'Received', deliveryStatus: 'Delivered',
  quoteDate: '2026-07-05', paymentDueDate: '2026-07-10', validUntil: '2026-08-01',
  __deleted: false, ...overrides,
});

const expense = (overrides = {}) => ({
  id: `e-${Math.random().toString(36).slice(2)}`,
  label: 'Cost', category: 'Operations', amount: 40_000_000, currency: 'VND',
  status: 'Paid', expenseDate: '2026-07-06', dueDate: '', __deleted: false, ...overrides,
});

describe('buildProfitAndLoss', () => {
  test('nets paid revenue against paid cost for the month to date', () => {
    const pnl = buildProfitAndLoss({
      quotes: [quote({ amount: 100_000_000, paymentDueDate: '2026-07-10' })],
      expenses: [expense({ amount: 40_000_000, expenseDate: '2026-07-06' })],
      period: 'mtd',
      today: '2026-07-22',
    });

    assert.equal(pnl.revenueBase, 100_000_000);
    assert.equal(pnl.expensesBase, 40_000_000);
    assert.equal(pnl.netProfitBase, 60_000_000);
    assert.equal(pnl.marginPct, 60);
    assert.equal(pnl.rangeStart, '2026-07-01');
  });

  test('excludes activity from before the period window', () => {
    const pnl = buildProfitAndLoss({
      quotes: [
        quote({ amount: 100_000_000, paymentDueDate: '2026-07-10' }), // in month
        quote({ amount: 500_000_000, paymentDueDate: '2026-06-15' }), // last month
      ],
      expenses: [],
      period: 'mtd',
      today: '2026-07-22',
    });

    assert.equal(pnl.revenueBase, 100_000_000, 'only July collections count for MTD');
  });

  test('quarter to date reaches back to the start of the quarter', () => {
    const pnl = buildProfitAndLoss({
      quotes: [
        quote({ amount: 100_000_000, paymentDueDate: '2026-07-10' }),
        quote({ amount: 300_000_000, paymentDueDate: '2026-06-15' }), // Q3 starts July -> excluded
        quote({ amount: 200_000_000, paymentDueDate: '2026-08-01' }), // after today -> excluded
      ],
      expenses: [],
      period: 'qtd',
      today: '2026-07-22',
    });

    assert.equal(pnl.rangeStart, '2026-07-01', 'Q3 begins in July');
    assert.equal(pnl.revenueBase, 100_000_000);
  });

  test('year to date reaches back to January', () => {
    const pnl = buildProfitAndLoss({
      quotes: [
        quote({ amount: 100_000_000, paymentDueDate: '2026-07-10' }),
        quote({ amount: 300_000_000, paymentDueDate: '2026-02-15' }),
      ],
      expenses: [],
      period: 'ytd',
      today: '2026-07-22',
    });

    assert.equal(pnl.rangeStart, '2026-01-01');
    assert.equal(pnl.revenueBase, 400_000_000);
  });

  test('reports receivables and payables as of now, not period-scoped', () => {
    const pnl = buildProfitAndLoss({
      // Delivered + accepted but not paid -> accounts receivable.
      quotes: [quote({ amount: 250_000_000, paymentStatus: 'Unpaid' })],
      // Upcoming (committed, unpaid) expense -> accounts payable.
      expenses: [expense({ amount: 30_000_000, status: 'Upcoming', expenseDate: '', dueDate: '2026-07-30' })],
      period: 'mtd',
      today: '2026-07-22',
    });

    assert.equal(pnl.accountsReceivableBase, 250_000_000);
    assert.equal(pnl.accountsPayableBase, 30_000_000);
    assert.equal(pnl.revenueBase, 0, 'an unpaid quote is not revenue');
  });

  test('has no margin when there is no revenue', () => {
    const pnl = buildProfitAndLoss({
      quotes: [],
      expenses: [expense({ amount: 10_000_000 })],
      period: 'mtd',
      today: '2026-07-22',
    });
    assert.equal(pnl.revenueBase, 0);
    assert.equal(pnl.netProfitBase, -10_000_000);
    assert.equal(pnl.marginPct, null);
  });
});
