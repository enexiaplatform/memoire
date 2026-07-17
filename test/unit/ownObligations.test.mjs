import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnObligations } from '../../src/utils/ownObligations.ts';

const expense = (label, status, dueDate, amount = 10_000_000) => ({
  __deleted: false, id: `e-${label}`, label, status, dueDate, amount, currency: 'VND',
  vendor: '', linkedAccountName: '', category: 'Other', expenseDate: '2026-07-01',
});

describe('buildOwnObligations', () => {
  test('classifies overdue, due-soon, and upcoming payments', () => {
    const model = buildOwnObligations({
      expenses: [
        expense('VAT', 'Upcoming', '2026-07-10'),
        expense('Rent', 'Upcoming', '2026-07-20'),
        expense('Insurance', 'Upcoming', '2026-09-01'),
      ],
      quotes: [],
      today: '2026-07-17',
    });
    assert.equal(model.overdue.length, 1);
    assert.equal(model.dueSoon.length, 1);
    assert.equal(model.paymentsOwedBase, 30_000_000);
  });

  test('excludes paid expenses', () => {
    const model = buildOwnObligations({
      expenses: [expense('Paid one', 'Paid', '2026-07-01')],
      quotes: [],
      today: '2026-07-17',
    });
    assert.equal(model.obligations.length, 0);
  });

  test('a delivery you owe is an obligation but not money owed out', () => {
    const model = buildOwnObligations({
      expenses: [],
      quotes: [{ __deleted: false, id: 'q1', accountName: 'Acme', title: 'Order', poStatus: 'Received', deliveryStatus: 'Scheduled', expectedDeliveryDate: '2026-07-10', amount: 500_000_000, currency: 'VND' }],
      today: '2026-07-17',
    });
    assert.equal(model.obligations.length, 1);
    assert.equal(model.obligations[0].kind, 'Delivery');
    assert.equal(model.paymentsOwedBase, 0);
  });

  test('an expense with no due date is upcoming, never overdue', () => {
    const model = buildOwnObligations({
      expenses: [expense('No deadline', 'Upcoming', '')],
      quotes: [],
      today: '2026-07-17',
    });
    assert.equal(model.obligations[0].status, 'Upcoming');
    assert.equal(model.overdue.length, 0);
  });
});
