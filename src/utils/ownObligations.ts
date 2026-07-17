import type { ExpenseRecord } from '../services/expenseStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import { convertMoney } from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export type ObligationKind = 'Payment' | 'Delivery';
export type ObligationStatus = 'Overdue' | 'Due soon' | 'Upcoming';

export type OwnObligation = {
  id: string;
  kind: ObligationKind;
  label: string;
  counterparty: string;
  amount: number | null;
  currency: string;
  amountBase: number | null;
  dueDate: string;
  daysUntilDue: number | null;
  status: ObligationStatus;
  href: string;
};

export type OwnObligationsModel = {
  obligations: OwnObligation[];
  overdue: OwnObligation[];
  dueSoon: OwnObligation[];
  paymentsOwedBase: number;
};

type OwnObligationsInput = {
  expenses: ExpenseRecord[];
  quotes: QuoteRecord[];
  today?: string;
  dueSoonDays?: number;
};

const DEFAULT_DUE_SOON_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Silence detection pointed back at the seller. The app watches the customer for
 * silence; a missed supplier payment, tax deadline, or delivery you owe goes
 * silent too - and costs more than a cold deal. Obligations are derived from the
 * commitments already in the workspace: upcoming expenses (money you owe) and
 * accepted quotes with a delivery you still owe. Derived, never stored.
 */
export function buildOwnObligations(input: OwnObligationsInput): OwnObligationsModel {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const dueSoonDays = input.dueSoonDays ?? DEFAULT_DUE_SOON_DAYS;

  const paymentObligations: OwnObligation[] = input.expenses
    .filter((expense) => expense.__deleted !== true && expense.status === 'Upcoming' && expense.label.trim())
    .map((expense) => makeObligation({
      id: `obligation-pay-${expense.id}`,
      kind: 'Payment',
      label: expense.label.trim(),
      counterparty: expense.vendor.trim() || expense.linkedAccountName.trim() || expense.category,
      amount: expense.amount,
      currency: expense.currency,
      dueDate: sanitizeBusinessDate(expense.dueDate),
      href: '/app/revenue',
      today,
      dueSoonDays,
    }));

  const deliveryObligations: OwnObligation[] = input.quotes
    .filter((quote) => !quote.__deleted
      && quote.poStatus === 'Received'
      && quote.deliveryStatus !== 'Delivered'
      && Boolean(sanitizeBusinessDate(quote.expectedDeliveryDate)))
    .map((quote) => makeObligation({
      id: `obligation-deliver-${quote.id}`,
      kind: 'Delivery',
      label: `Deliver ${quote.title || quote.opportunityName || quote.quoteId || 'order'}`,
      counterparty: quote.accountName.trim() || 'Needs confirmation',
      amount: quote.amount,
      currency: quote.currency,
      dueDate: sanitizeBusinessDate(quote.expectedDeliveryDate),
      href: '/app/quotes',
      today,
      dueSoonDays,
    }));

  const obligations = [...paymentObligations, ...deliveryObligations].sort(compareObligations);

  const paymentsOwedBase = paymentObligations.reduce(
    (total, obligation) => total + (obligation.amountBase ?? 0),
    0,
  );

  return {
    obligations,
    overdue: obligations.filter((obligation) => obligation.status === 'Overdue'),
    dueSoon: obligations.filter((obligation) => obligation.status === 'Due soon'),
    paymentsOwedBase,
  };
}

function makeObligation(input: {
  id: string;
  kind: ObligationKind;
  label: string;
  counterparty: string;
  amount: number | null;
  currency: string;
  dueDate: string;
  href: string;
  today: string;
  dueSoonDays: number;
}): OwnObligation {
  const daysUntilDue = input.dueDate
    ? Math.floor((toTime(input.dueDate) - toTime(input.today)) / DAY_MS)
    : null;
  const status: ObligationStatus = daysUntilDue === null
    ? 'Upcoming'
    : daysUntilDue < 0
      ? 'Overdue'
      : daysUntilDue <= input.dueSoonDays
        ? 'Due soon'
        : 'Upcoming';

  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    counterparty: input.counterparty,
    amount: input.amount,
    currency: input.currency,
    amountBase: convertMoney(input.amount ?? 0, input.currency),
    dueDate: input.dueDate,
    daysUntilDue,
    status,
    href: input.href,
  };
}

function compareObligations(a: OwnObligation, b: OwnObligation) {
  const rank = { Overdue: 0, 'Due soon': 1, Upcoming: 2 };
  if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return 0;
}

function toTime(dateKey: string) {
  return Date.parse(`${dateKey}T00:00:00Z`);
}
