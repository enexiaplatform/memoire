import type { QuoteRecord } from '../services/quoteStore.ts';
import type { ExpenseRecord } from '../services/expenseStore.ts';
import { expenseCategories, type ExpenseCategory } from '../services/expenseStore.ts';
import { buildCashPosition, getOpeningCashBalance } from './cashPosition.ts';
import { getReportingCurrency, sumMoney, type SupportedCurrency } from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * A mini profit-and-loss statement, in the vocabulary a SaaS finance tool uses:
 * revenue, cost, net profit and margin for a chosen period, then the point-in-
 * time balance items - receivables, payables, cash. It is cash-basis on purpose
 * (revenue is money actually collected, cost is money actually paid), so the
 * bottom line can never be inflated by pipeline that has not paid.
 *
 * Nothing new is stored or measured here: the balance items come straight from
 * buildCashPosition, and the period figures apply the same "paid means real"
 * rule, only windowed to the month, quarter, or year to date.
 */

export type PnlPeriod = 'mtd' | 'qtd' | 'ytd';

export type PnlCategoryRow = {
  category: ExpenseCategory;
  totalBase: number;
};

export type ProfitAndLoss = {
  period: PnlPeriod;
  periodLabel: string;
  rangeStart: string;
  rangeEnd: string;
  reportingCurrency: SupportedCurrency;
  // The statement, for the chosen period.
  revenueBase: number;
  expensesBase: number;
  netProfitBase: number;
  marginPct: number | null;
  expenseByCategory: PnlCategoryRow[];
  // The balance, as of now (not period-scoped).
  accountsReceivableBase: number;
  accountsPayableBase: number;
  cashOnHandBase: number | null;
  projectedCashBase: number | null;
};

type PnlInput = {
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
  period: PnlPeriod;
  today?: string;
};

const PERIOD_LABEL: Record<PnlPeriod, string> = {
  mtd: 'Month to date',
  qtd: 'Quarter to date',
  ytd: 'Year to date',
};

export function buildProfitAndLoss(input: PnlInput): ProfitAndLoss {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const rangeStart = periodStart(input.period, today);
  const reportingCurrency = getReportingCurrency();

  // Balance items are as-of-now and share buildCashPosition's exact rules, so
  // the statement and the money-out panel can never disagree.
  const cash = buildCashPosition({
    quotes: input.quotes,
    expenses: input.expenses,
    openingBalanceBase: getOpeningCashBalance(),
    today,
  });

  const paidQuotesInPeriod = input.quotes.filter((quote) =>
    !quote.__deleted
    && quote.paymentStatus === 'Paid'
    && inRange(collectionDate(quote), rangeStart, today));
  const paidExpensesInPeriod = input.expenses.filter((expense) =>
    expense.__deleted !== true
    && expense.status === 'Paid'
    && inRange(sanitizeBusinessDate(expense.expenseDate), rangeStart, today));

  const revenueBase = sumMoney(paidQuotesInPeriod.map((quote) => ({ amount: quote.amount, currency: quote.currency })));
  const expensesBase = sumMoney(paidExpensesInPeriod.map((expense) => ({ amount: expense.amount, currency: expense.currency })));
  const netProfitBase = revenueBase - expensesBase;
  const marginPct = revenueBase > 0 ? Math.round((netProfitBase / revenueBase) * 100) : null;

  const expenseByCategory: PnlCategoryRow[] = expenseCategories
    .map((category) => ({
      category,
      totalBase: sumMoney(
        paidExpensesInPeriod
          .filter((expense) => expense.category === category)
          .map((expense) => ({ amount: expense.amount, currency: expense.currency })),
      ),
    }))
    .filter((row) => row.totalBase > 0)
    .sort((left, right) => right.totalBase - left.totalBase);

  return {
    period: input.period,
    periodLabel: PERIOD_LABEL[input.period],
    rangeStart,
    rangeEnd: today,
    reportingCurrency,
    revenueBase,
    expensesBase,
    netProfitBase,
    marginPct,
    expenseByCategory,
    accountsReceivableBase: cash.upcomingInBase,
    accountsPayableBase: cash.upcomingOutBase,
    cashOnHandBase: cash.cashOnHandBase,
    projectedCashBase: cash.projectedCashBase,
  };
}

/** The date a paid quote is recognised on - its payment due date, else its quote date. */
function collectionDate(quote: QuoteRecord) {
  return sanitizeBusinessDate(quote.paymentDueDate || quote.quoteDate);
}

function periodStart(period: PnlPeriod, today: string): string {
  const [year, month] = today.split('-').map(Number);
  if (period === 'ytd') return `${year}-01-01`;
  if (period === 'qtd') {
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return `${year}-${pad(quarterStartMonth)}-01`;
  }
  return `${year}-${pad(month)}-01`;
}

function inRange(dateKey: string, start: string, end: string) {
  return Boolean(dateKey) && dateKey >= start && dateKey <= end;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
