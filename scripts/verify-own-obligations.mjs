import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOwnObligations } from '../src/utils/ownObligations.ts';

// Silence detection pointed back at the seller. A missed supplier payment, tax
// deadline, or delivery you owe goes silent too - and costs more than a cold
// deal. These pin the classification: overdue < today, due-soon within the
// window, everything else upcoming; delivery you owe is tracked but never
// counted as money owed out.

const expense = (label, status, dueDate, amount = 10_000_000, currency = 'VND') => ({
  __deleted: false, id: `e-${label}`, label, status, dueDate, amount, currency,
  vendor: '', linkedAccountName: '', category: 'Other', expenseDate: '2026-07-01',
});
const deliveryQuote = (expectedDeliveryDate) => ({
  __deleted: false, id: 'q1', accountName: 'Acme', title: 'QC order', poStatus: 'Received',
  deliveryStatus: 'Scheduled', expectedDeliveryDate, amount: 500_000_000, currency: 'VND',
});

// 1. Overdue / due-soon / upcoming payments are classified by their due date.
{
  const model = buildOwnObligations({
    expenses: [
      expense('VAT', 'Upcoming', '2026-07-10'),        // overdue vs today 2026-07-17
      expense('Rent', 'Upcoming', '2026-07-20'),        // due soon (within 7 days)
      expense('Insurance', 'Upcoming', '2026-09-01'),   // upcoming
      expense('Already paid', 'Paid', '2026-07-05'),    // excluded: paid
    ],
    quotes: [],
    today: '2026-07-17',
  });
  assert.equal(model.overdue.length, 1, 'one overdue payment');
  assert.equal(model.overdue[0].label, 'VAT');
  assert.equal(model.dueSoon.length, 1, 'one due-soon payment');
  assert.equal(model.dueSoon[0].label, 'Rent');
  assert.equal(model.obligations.length, 3, 'paid expenses are not obligations');
  // Money owed out counts every upcoming payment, in the reporting currency.
  assert.equal(model.paymentsOwedBase, 30_000_000);
}

// 2. Overdue sorts before due-soon before upcoming.
{
  const model = buildOwnObligations({
    expenses: [expense('B upcoming', 'Upcoming', '2026-09-01'), expense('A overdue', 'Upcoming', '2026-07-01')],
    quotes: [],
    today: '2026-07-17',
  });
  assert.equal(model.obligations[0].label, 'A overdue', 'overdue is surfaced first');
}

// 3. A delivery you still owe is an obligation, but never money owed out.
{
  const model = buildOwnObligations({
    expenses: [],
    quotes: [deliveryQuote('2026-07-10')],
    today: '2026-07-17',
  });
  assert.equal(model.obligations.length, 1);
  assert.equal(model.obligations[0].kind, 'Delivery');
  assert.equal(model.obligations[0].status, 'Overdue');
  assert.equal(model.paymentsOwedBase, 0, 'a delivery is not money owed out');
}

// 4. A delivered order is no longer an obligation.
{
  const model = buildOwnObligations({
    expenses: [],
    quotes: [{ ...deliveryQuote('2026-07-10'), deliveryStatus: 'Delivered' }],
    today: '2026-07-17',
  });
  assert.equal(model.obligations.length, 0);
}

// 5. Only PAYMENT obligations (overdue/due-soon) become Today actions - delivery
//    stays in the existing Revenue signal to avoid double-surfacing.
{
  const today = readFileSync('src/utils/todayCommandCenter.ts', 'utf8');
  assert.ok(today.includes('buildOwnObligations'), 'Today must build own obligations');
  assert.ok(today.includes("source: 'Obligation'"), 'obligation actions carry the Obligation source');
  assert.ok(today.includes("obligation.kind === 'Payment'"), 'only payment obligations become Today actions');

  const money = readFileSync('src/features/revenue/RevenueViewPage.tsx', 'utf8');
  assert.ok(money.includes('Obligations you owe'), 'Money page must render the obligations card');
}

// 6. The demo seeds an overdue supplier payment so the watch shows in demo.
{
  const sample = readFileSync('src/utils/sampleData.ts', 'utf8');
  assert.ok(sample.includes('demo-expense-supplier-overdue'), 'demo must include an overdue supplier obligation');
}

console.log('Own-obligations watch contract verified.');
