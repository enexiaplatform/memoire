import type { QuoteRecord } from '../services/quoteStore.ts';
import type { ExpenseRecord } from '../services/expenseStore.ts';
import { expenseCategories, type ExpenseCategory } from '../services/expenseStore.ts';
import { buildCashPosition, getOpeningCashBalance } from './cashPosition.ts';
import { getReportingCurrency, hasExchangeRate, sumMoney, type SupportedCurrency } from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import { buildOrderBook, type OrderMilestoneRecord } from './orderToCash.ts';
import { uniquePaymentReceipts, type OrderReceivableRecord } from './receivables.ts';

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
  /**
   * Currencies in this period's revenue or cost that are not the reporting
   * currency, so the statement can say a figure was converted rather than
   * presenting a mixed-currency total as if it were counted. Empty when every
   * amount was already in the reporting currency, which is the common case.
   */
  convertedFrom: string[];
  /**
   * Currencies nobody has priced, whose money is therefore **not in these
   * totals at all**.
   *
   * `sumMoney` drops an amount it cannot convert rather than inventing a rate,
   * which is the right call - but this statement used to list those currencies
   * under `convertedFrom` and print "includes SEK converted at planning rates".
   * The money was not included and nothing was converted: the revenue line was
   * short by the whole amount, and the one sentence that could have said so said
   * the opposite. An operator picking a currency the product ships no rate for is
   * a supported path (see `listSelectableCurrencies`), so this is reachable by
   * choosing your own country's money and never visiting Settings.
   */
  excludedCurrencies: string[];
  /** How many paid records were left out of the totals for want of a rate. */
  excludedRecordCount: number;
};

type PnlInput = {
  opportunities?: CrmLiteOpportunity[];
  receivableRecords?: OrderReceivableRecord[];
  milestoneRecords?: OrderMilestoneRecord[];
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
    opportunities: input.opportunities || [],
    receivableRecords: input.receivableRecords || [],
    milestoneRecords: input.milestoneRecords || [],
    quotes: input.quotes,
    expenses: input.expenses,
    openingBalanceBase: getOpeningCashBalance(),
    today,
  });

  const book = buildOrderBook({opportunities: input.opportunities || [], quotes: input.quotes,
    milestoneRecords: input.milestoneRecords || [], receivableRecords: input.receivableRecords || [], linkage: 'explicit-id', today});
  const eligibleIds = new Set(book.orders.map(order => order.opportunityId));
  const receiptsInPeriod = (input.receivableRecords || []).filter(record => !record.__deleted && eligibleIds.has(record.opportunityId))
    .flatMap(record => uniquePaymentReceipts(record.receipts)).filter(receipt => inRange(sanitizeBusinessDate(receipt.receivedOn), rangeStart, today));
  const paidExpensesInPeriod = input.expenses.filter((expense) =>
    expense.__deleted !== true
    && expense.status === 'Paid'
    && inRange(sanitizeBusinessDate(expense.expenseDate), rangeStart, today));

  const revenueBase = sumMoney(receiptsInPeriod.map(receipt => ({amount: receipt.amount, currency: receipt.currency})));
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

  // Named from the amounts that actually contributed to this period, so the
  // disclosure appears only when a conversion really happened - and split by
  // whether a conversion was possible at all, because the two need opposite
  // sentences. `sumMoney` silently drops what it cannot price.
  const periodCurrencies = [...new Set([
    ...receiptsInPeriod.map(receipt => (receipt.currency || '').trim().toUpperCase()),
    ...paidExpensesInPeriod.map((expense) => (expense.currency || '').trim().toUpperCase()),
  ])]
    .filter((currency) => currency && currency !== reportingCurrency)
    .sort();

  const convertedFrom = periodCurrencies.filter((currency) => hasExchangeRate(currency));
  const excludedCurrencies = periodCurrencies.filter((currency) => !hasExchangeRate(currency));
  const isExcluded = (currency?: string | null) =>
    excludedCurrencies.includes((currency || '').trim().toUpperCase());
  const excludedRecordCount = receiptsInPeriod.filter(receipt => isExcluded(receipt.currency)).length
    + paidExpensesInPeriod.filter((expense) => isExcluded(expense.currency)).length;

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
    convertedFrom,
    excludedCurrencies,
    excludedRecordCount,
  };
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
