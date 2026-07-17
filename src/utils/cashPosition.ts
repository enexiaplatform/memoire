import type { QuoteRecord } from '../services/quoteStore.ts';
import type { ExpenseRecord, ExpenseCategory } from '../services/expenseStore.ts';
import { expenseCategories } from '../services/expenseStore.ts';
import { getReportingCurrency, sumMoney, type SupportedCurrency } from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export type CategorySpendRow = {
  category: ExpenseCategory;
  totalBase: number;
};

export type CashPositionModel = {
  reportingCurrency: SupportedCurrency;
  // Realized: cash that has actually moved.
  collectedRevenueBase: number;
  paidExpensesBase: number;
  realizedProfitBase: number;
  // Projected: committed money not yet settled.
  upcomingInBase: number;
  upcomingOutBase: number;
  projectedDeltaBase: number;
  // Optional absolute cash, only when the user set an opening balance.
  openingBalanceBase: number | null;
  cashOnHandBase: number | null;
  projectedCashBase: number | null;
  categorySpend: CategorySpendRow[];
  monthLabel: string;
  monthPaidExpensesBase: number;
  monthCollectedRevenueBase: number;
};

type CashPositionInput = {
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
  openingBalanceBase?: number | null;
  today?: string;
};

const OPENING_BALANCE_KEY = 'memoire_opening_cash_balance';

/**
 * The money-out companion to buildMoneyFlow. "Collected revenue" is cash truly
 * received (a quote whose payment status is Paid), never forecast pipeline -
 * so realized profit can never be inflated by deals that have not paid. Every
 * figure is in the reporting currency; unknown currencies are excluded, not
 * guessed. Derived, never stored.
 */
export function buildCashPosition(input: CashPositionInput): CashPositionModel {
  const reportingCurrency = getReportingCurrency();
  const todayKey = sanitizeBusinessDate(input.today) || todayDateKey();
  const monthPrefix = todayKey.slice(0, 7);

  const activeExpenses = input.expenses.filter((expense) => expense.__deleted !== true);
  const paidExpenses = activeExpenses.filter((expense) => expense.status === 'Paid');
  const upcomingExpenses = activeExpenses.filter((expense) => expense.status === 'Upcoming');

  const paidQuotes = input.quotes.filter(
    (quote) => !quote.__deleted && quote.paymentStatus === 'Paid',
  );
  const awaitingPaymentQuotes = input.quotes.filter(
    (quote) => !quote.__deleted && quote.paymentStatus !== 'Paid'
      && (quote.status === 'Accepted' || quote.poStatus === 'Received' || quote.deliveryStatus === 'Delivered'),
  );

  const collectedRevenueBase = sumMoney(paidQuotes.map((quote) => ({ amount: quote.amount, currency: quote.currency })));
  const paidExpensesBase = sumMoney(paidExpenses.map((expense) => ({ amount: expense.amount, currency: expense.currency })));
  const upcomingInBase = sumMoney(awaitingPaymentQuotes.map((quote) => ({ amount: quote.amount, currency: quote.currency })));
  const upcomingOutBase = sumMoney(upcomingExpenses.map((expense) => ({ amount: expense.amount, currency: expense.currency })));

  const realizedProfitBase = collectedRevenueBase - paidExpensesBase;
  const projectedDeltaBase = upcomingInBase - upcomingOutBase;

  const openingBalanceBase = typeof input.openingBalanceBase === 'number' && Number.isFinite(input.openingBalanceBase)
    ? input.openingBalanceBase
    : null;
  const cashOnHandBase = openingBalanceBase === null ? null : openingBalanceBase + realizedProfitBase;
  const projectedCashBase = cashOnHandBase === null ? null : cashOnHandBase + projectedDeltaBase;

  const categorySpend: CategorySpendRow[] = expenseCategories
    .map((category) => ({
      category,
      totalBase: sumMoney(paidExpenses.filter((expense) => expense.category === category).map((expense) => ({ amount: expense.amount, currency: expense.currency }))),
    }))
    .filter((row) => row.totalBase > 0)
    .sort((a, b) => b.totalBase - a.totalBase);

  const monthPaidExpensesBase = sumMoney(
    paidExpenses.filter((expense) => (expense.expenseDate || '').startsWith(monthPrefix)).map((expense) => ({ amount: expense.amount, currency: expense.currency })),
  );
  const monthCollectedRevenueBase = sumMoney(
    paidQuotes.filter((quote) => (quote.paymentDueDate || quote.quoteDate || '').startsWith(monthPrefix)).map((quote) => ({ amount: quote.amount, currency: quote.currency })),
  );

  return {
    reportingCurrency,
    collectedRevenueBase,
    paidExpensesBase,
    realizedProfitBase,
    upcomingInBase,
    upcomingOutBase,
    projectedDeltaBase,
    openingBalanceBase,
    cashOnHandBase,
    projectedCashBase,
    categorySpend,
    monthLabel: formatMonthLabel(monthPrefix),
    monthPaidExpensesBase,
    monthCollectedRevenueBase,
  };
}

export function getOpeningCashBalance(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(OPENING_BALANCE_KEY);
    if (raw === null || raw.trim() === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setOpeningCashBalance(value: number | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null || !Number.isFinite(value)) {
      localStorage.removeItem(OPENING_BALANCE_KEY);
      return;
    }
    localStorage.setItem(OPENING_BALANCE_KEY, String(value));
  } catch {
    // ignore storage failures
  }
}

function formatMonthLabel(monthPrefix: string) {
  const [year, month] = monthPrefix.split('-');
  const monthIndex = Number(month) - 1;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[monthIndex] ? `${names[monthIndex]} ${year}` : monthPrefix;
}
