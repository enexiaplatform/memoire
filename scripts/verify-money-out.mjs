import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCashPosition } from '../src/utils/cashPosition.ts';
import { expenseCategories } from '../src/services/expenseStore.ts';

// The money-out half of the money-spine. These assertions pin the mechanism,
// not one user's data: collected revenue is cash actually received (a quote
// paid), realized profit is collected minus paid expenses, and nothing is
// inflated by forecast pipeline or upcoming commitments.

const paidQuote = (amount, currency = 'VND') => ({
  __deleted: false, status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered',
  paymentStatus: 'Paid', amount, currency, quoteDate: '2026-07-01', paymentDueDate: '2026-07-10',
});
const awaitingQuote = (amount, currency = 'VND') => ({
  __deleted: false, status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered',
  paymentStatus: 'Due', amount, currency, quoteDate: '2026-07-01', paymentDueDate: '2026-07-20',
});
const expense = (amount, status, category = 'Other', currency = 'VND') => ({
  __deleted: false, status, category, amount, currency, expenseDate: '2026-07-05', dueDate: '2026-07-25',
});

// 1. Realized profit = collected (paid quotes) − paid expenses. Upcoming money
//    on either side never touches the realized figure.
{
  const model = buildCashPosition({
    quotes: [paidQuote(500_000_000), awaitingQuote(300_000_000)],
    expenses: [expense(180_000_000, 'Paid'), expense(60_000_000, 'Upcoming')],
    today: '2026-07-17',
  });
  assert.equal(model.collectedRevenueBase, 500_000_000, 'only paid quotes are collected revenue');
  assert.equal(model.paidExpensesBase, 180_000_000, 'only paid expenses reduce realized profit');
  assert.equal(model.realizedProfitBase, 320_000_000, 'profit = collected − paid out');
  assert.equal(model.upcomingInBase, 300_000_000, 'awaiting-payment quote is upcoming in');
  assert.equal(model.upcomingOutBase, 60_000_000, 'upcoming expense is upcoming out');
  assert.equal(model.projectedDeltaBase, 240_000_000, 'projected delta = upcoming in − upcoming out');
}

// 2. Opening balance controls whether absolute cash is shown - never fabricated.
{
  const noOpening = buildCashPosition({ quotes: [paidQuote(100_000_000)], expenses: [], today: '2026-07-17' });
  assert.equal(noOpening.cashOnHandBase, null, 'without an opening balance, absolute cash stays null');
  assert.equal(noOpening.projectedCashBase, null);

  const withOpening = buildCashPosition({ quotes: [paidQuote(100_000_000)], expenses: [expense(40_000_000, 'Paid')], openingBalanceBase: 200_000_000, today: '2026-07-17' });
  assert.equal(withOpening.cashOnHandBase, 260_000_000, 'cash on hand = opening + realized profit');
}

// 3. An unsupported currency is excluded from every total, not guessed.
{
  const model = buildCashPosition({
    quotes: [paidQuote(100, 'XYZ'), paidQuote(5, 'VND')],
    expenses: [expense(3, 'Paid', 'Other', 'XYZ')],
    today: '2026-07-17',
  });
  assert.equal(model.collectedRevenueBase, 5, 'unsupported-currency revenue is excluded');
  assert.equal(model.paidExpensesBase, 0, 'unsupported-currency expense is excluded');
}

// 4. Category spend only counts paid expenses and is sorted high-to-low.
{
  const model = buildCashPosition({
    quotes: [],
    expenses: [expense(10_000_000, 'Paid', 'Salaries'), expense(30_000_000, 'Paid', 'Cost of goods'), expense(99_000_000, 'Upcoming', 'Tax & fees')],
    today: '2026-07-17',
  });
  assert.deepEqual(model.categorySpend.map((row) => row.category), ['Cost of goods', 'Salaries'], 'paid categories only, largest first');
}

// 5. The expense domain uses a fixed, non-empty category set.
assert.ok(expenseCategories.length >= 6, 'a real business needs a usable category set');
assert.ok(expenseCategories.includes('Cost of goods') && expenseCategories.includes('Tax & fees'));

// 6. The store is local-first and rides the existing memoire. export/clear path.
{
  const store = readFileSync('src/services/expenseStore.ts', 'utf8');
  assert.ok(store.includes("EXPENSE_STORAGE_KEY = 'memoire.expenses.v1'"), 'expenses persist under the memoire. prefix so export/clear pick them up');
}

// 7. Money-out is wired into the workspace, the Money page, and the Dashboard.
{
  const workspace = readFileSync('src/services/workspaceData.ts', 'utf8');
  assert.ok(workspace.includes('expenses: ExpenseRecord[]'), 'workspace data must carry expenses');

  const money = readFileSync('src/features/revenue/RevenueViewPage.tsx', 'utf8');
  assert.ok(money.includes('MoneyOutSection'), 'Money page must render the money-out section');
  assert.ok(money.includes('ProfitAndLossStatement'), 'Money page must render the P&L statement');

  // The cash position now lives inside the P&L statement, which the page shows -
  // and the P&L reuses buildCashPosition rather than inventing its own rules, so
  // the receivables/payables/cash line can never disagree with the money-out panel.
  const pnl = readFileSync('src/utils/pnl.ts', 'utf8');
  assert.ok(pnl.includes('buildCashPosition'), 'the P&L must derive the cash position from the shared rule');
  const pnlStatement = readFileSync('src/features/revenue/ProfitAndLossStatement.tsx', 'utf8');
  assert.ok(pnlStatement.includes('buildProfitAndLoss'), 'the P&L statement must derive from buildProfitAndLoss');

  const dashboard = readFileSync('src/utils/masterDashboard.ts', 'utf8');
  assert.ok(dashboard.includes('buildCashPosition'), 'Dashboard model must include the cash position');
}

// 8. The demo seeds both sides so the profit line is real out of the box.
{
  const sample = readFileSync('src/utils/sampleData.ts', 'utf8');
  assert.ok(sample.includes('sampleExpense('), 'demo must seed sample expenses');
  assert.ok(sample.includes("paymentStatus: 'Paid'"), 'demo must include a collected (paid) quote');
}

console.log('Money-out and cash-position contract verified.');
