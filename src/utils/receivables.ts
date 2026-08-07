import type { CommittedOrder } from './orderToCash.ts';
import { getReportingCurrency, sumMoneyInBase, type SupportedCurrency } from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';
import {
  installmentAmount,
  installmentDueDate,
  parsePaymentTerm,
  sanitizeInstallments,
  type PaymentInstallment,
  type ParsedPaymentTerm,
} from './paymentTerms.ts';

/**
 * Công nợ: what the customer owes, when it falls due, and what has come back.
 *
 * The order book already followed an order to a milestone called Collected, and
 * that milestone was a tick. It could say an order had been paid; it could not
 * say that 30% arrived in June, the balance was due on the 14th, and 340 million
 * dong has been sitting eleven days past due since. For a distributor that gap
 * is the whole job - the founder's words were "nhằm mục đích collect tiền về",
 * for the purpose of getting the money back - and a tick does not tell anyone
 * who to ring this morning.
 *
 * Three ideas, and the boundaries between them are what keep this honest.
 *
 *   1. **The schedule is derived, the receipts are recorded.** Due dates come
 *      from the payment terms already on the quote, so an operator gets a
 *      receivables ledger without entering anything twice. Money arriving is a
 *      fact only they know, so it is entered once, against the order.
 *   2. **Nothing here writes back to the order.** Same contract the cost model
 *      has: this reads the order book and owns receipts. An order's value is
 *      whatever the quote says, whether or not the cash agrees yet.
 *   3. **Overpayment and early payment are normal.** Customers round up, pay two
 *      invoices together, and settle the balance before the deposit. Receipts
 *      are applied oldest-due-first rather than demanding the operator allocate
 *      each one, and a surplus is carried rather than refused.
 *
 * What this is not: a ledger. There is no double entry, no credit note, no
 * write-off workflow and no tax. It answers who owes what, since when.
 */

export type PaymentReceipt = {
  id: string;
  /** Money in the order's own currency, the way it was actually banked. */
  amount: number;
  currency: string;
  receivedOn: string;
  /** Free text: "bank transfer", "cheque 0041". Not a controlled list. */
  method: string;
  note: string;
};

/**
 * One order's collection record. One row per order, like its cost.
 *
 * `installments` is normally empty: the schedule read off the payment terms is
 * the answer, and storing a copy of a derived thing is how the copy and the
 * source drift apart. It is filled only when the operator overrides the parse,
 * which is exactly when a stored answer is the right one.
 */
export type OrderReceivableRecord = {
  id: string;
  opportunityId: string;
  /** An operator-corrected schedule. Empty means "use the terms on the quote". */
  installments: PaymentInstallment[];
  receipts: PaymentReceipt[];
  /** When the goods actually landed, where the operator knows. Anchors due dates. */
  deliveredOn: string;
  /** When the invoice was raised, for terms that run from it. */
  invoicedOn: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

export type ReceivableInstallmentState = {
  id: string;
  label: string;
  dueDate: string;
  /** What this slice is worth, in the reporting currency. */
  dueBase: number;
  /** How much of it has been covered by receipts. */
  receivedBase: number;
  outstandingBase: number;
  settled: boolean;
  /** Positive once the due date has passed and something is still outstanding. */
  daysOverdue: number;
  overdue: boolean;
};

/**
 * How late money is, in the buckets a credit controller actually works in.
 *
 * `due-soon` is not an aging bucket - nothing is late yet - but it is the one
 * that prevents lateness, and a collections screen with no future on it can only
 * ever report failure after the fact.
 */
export const agingBuckets = ['due-soon', 'current', '1-30', '31-60', '61-90', '90+'] as const;
export type AgingBucket = (typeof agingBuckets)[number];

export const agingBucketLabels: Record<AgingBucket, string> = {
  'due-soon': 'Due within 7 days',
  current: 'Not yet due',
  '1-30': '1-30 days late',
  '31-60': '31-60 days late',
  '61-90': '61-90 days late',
  '90+': 'Over 90 days late',
};

export type OrderReceivable = {
  opportunityId: string;
  accountName: string;
  orderName: string;
  orderRef: string;
  orderDate: string;
  currency: string;
  /** The order's value, in the reporting currency. The ceiling on what is owed. */
  orderValueBase: number;
  paymentTerm: string;
  /** Where the schedule came from, and how much of it was read rather than assumed. */
  termConfidence: ParsedPaymentTerm['confidence'] | 'operator';
  installments: ReceivableInstallmentState[];
  receivedBase: number;
  outstandingBase: number;
  /** Money past its due date and still unpaid. */
  overdueBase: number;
  /** The oldest unpaid due date's age. Null when nothing is late. */
  daysOverdue: number | null;
  /** The next money expected, whether or not it is late yet. */
  nextDueDate: string;
  nextDueBase: number;
  bucket: AgingBucket;
  settled: boolean;
  /** Received more than the order is worth. Kept visible rather than clamped away. */
  overpaidBase: number;
  href: string;
};

export type ReceivablesSummary = {
  reportingCurrency: SupportedCurrency;
  orders: OrderReceivable[];
  /** Orders with money still to come. */
  openCount: number;
  totalOutstandingBase: number;
  totalOverdueBase: number;
  totalReceivedBase: number;
  /** Money falling due in the next 30 days, late or not. What to plan around. */
  expectedNext30Base: number;
  /** Outstanding money by how late it is. Every bucket, including the empty ones. */
  aging: { bucket: AgingBucket; label: string; count: number; amountBase: number }[];
  /** The order to ring first: most money, longest late. */
  worstOverdue: OrderReceivable | null;
  /**
   * Days sales outstanding, weighted by value - the average age of the money
   * owed. One number for "how long am I waiting to be paid", which is the
   * question a credit line is sized against.
   */
  averageDaysOutstanding: number | null;
};

export function buildReceivables(input: {
  orders: CommittedOrder[];
  records: OrderReceivableRecord[];
  today?: string;
}): ReceivablesSummary {
  const reportingCurrency = getReportingCurrency();
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const live = (input.records || []).filter((record) => record.__deleted !== true);
  const byOrder = new Map(live.map((record) => [record.opportunityId, record]));

  const orders = (input.orders || []).map((order) => buildOneReceivable(order, byOrder.get(order.opportunityId), today));
  const open = orders.filter((order) => !order.settled);

  const aging = agingBuckets.map((bucket) => {
    const inBucket = open.filter((order) => order.bucket === bucket && order.outstandingBase > 0);
    return {
      bucket,
      label: agingBucketLabels[bucket],
      count: inBucket.length,
      amountBase: inBucket.reduce((sum, order) => sum + order.outstandingBase, 0),
    };
  });

  const overdueOrders = open.filter((order) => order.overdueBase > 0);
  const totalOutstandingBase = open.reduce((sum, order) => sum + order.outstandingBase, 0);

  return {
    reportingCurrency,
    orders,
    openCount: open.length,
    totalOutstandingBase,
    totalOverdueBase: open.reduce((sum, order) => sum + order.overdueBase, 0),
    totalReceivedBase: orders.reduce((sum, order) => sum + order.receivedBase, 0),
    expectedNext30Base: open.reduce((sum, order) => sum + expectedWithin(order, today, 30), 0),
    aging,
    // Most money first, then longest overdue - a small invoice that is 200 days
    // late is a bookkeeping problem, and a large one 20 days late is a business
    // problem. Sorting by age alone puts the wrong call at the top of the list.
    worstOverdue: [...overdueOrders].sort((left, right) => (
      right.overdueBase - left.overdueBase
      || (right.daysOverdue ?? 0) - (left.daysOverdue ?? 0)
    ))[0] || null,
    averageDaysOutstanding: weightedDaysOutstanding(open, today, totalOutstandingBase),
  };
}

function buildOneReceivable(
  order: CommittedOrder,
  record: OrderReceivableRecord | undefined,
  today: string,
): OrderReceivable {
  const parsed = parsePaymentTerm(order.paymentTerm);
  const override = sanitizeInstallments(record?.installments);
  const installments = override.length > 0 ? override : parsed.installments;
  const orderValueBase = order.amountBase;

  const deliveredOn = sanitizeBusinessDate(record?.deliveredOn) || '';
  const invoicedOn = sanitizeBusinessDate(record?.invoicedOn) || '';
  const orderDate = sanitizeBusinessDate(order.orderDate) || today;

  // How long delivery is actually taking. Where it has happened, the real gap is
  // used; otherwise nothing is assumed, because inventing a lag would move every
  // due date on the page by a number the operator never supplied.
  const deliveryLagDays = deliveredOn ? Math.max(0, daysBetween(orderDate, deliveredOn) ?? 0) : 0;

  const scheduled = installments
    .map((installment) => ({
      id: installment.id,
      label: installment.label,
      dueDate: installmentDueDate(installment, orderDate, {
        deliveryLagDays,
        deliveryDate: deliveredOn,
        invoiceDate: invoicedOn,
      }),
      dueBase: installmentAmount(installment, orderValueBase),
    }))
    // Applied oldest first, so a receipt covers what has been owed longest.
    .sort((left, right) => compareDueDates(left.dueDate, right.dueDate));

  const receivedBase = sumMoneyInBase(
    (record?.receipts || [])
      .filter((receipt) => typeof receipt?.amount === 'number' && Number.isFinite(receipt.amount))
      .map((receipt) => ({ amount: receipt.amount, currency: receipt.currency || order.currency })),
  );

  let remaining = receivedBase;
  const states: ReceivableInstallmentState[] = scheduled.map((entry) => {
    const applied = Math.min(remaining, entry.dueBase);
    remaining = Math.max(0, remaining - applied);
    const outstandingBase = Math.max(0, entry.dueBase - applied);
    const daysLate = entry.dueDate ? (daysBetween(entry.dueDate, today) ?? 0) : 0;
    const overdue = outstandingBase > 0 && Boolean(entry.dueDate) && daysLate > 0;
    return {
      id: entry.id,
      label: entry.label,
      dueDate: entry.dueDate,
      dueBase: entry.dueBase,
      receivedBase: applied,
      outstandingBase,
      settled: outstandingBase <= 0.005,
      daysOverdue: overdue ? daysLate : 0,
      overdue,
    };
  });

  const outstandingBase = states.reduce((sum, state) => sum + state.outstandingBase, 0);
  const overdueBase = states.reduce((sum, state) => sum + (state.overdue ? state.outstandingBase : 0), 0);
  const overdueStates = states.filter((state) => state.overdue);
  const daysOverdue = overdueStates.length > 0
    ? Math.max(...overdueStates.map((state) => state.daysOverdue))
    : null;
  const nextOpen = states.find((state) => !state.settled) || null;

  return {
    opportunityId: order.opportunityId,
    accountName: order.accountName,
    orderName: order.orderName,
    orderRef: order.orderRef,
    orderDate,
    currency: order.currency,
    orderValueBase,
    paymentTerm: order.paymentTerm,
    termConfidence: override.length > 0 ? 'operator' : parsed.confidence,
    installments: states,
    receivedBase,
    outstandingBase,
    overdueBase,
    daysOverdue,
    nextDueDate: nextOpen?.dueDate || '',
    nextDueBase: nextOpen?.outstandingBase || 0,
    bucket: bucketFor(daysOverdue, nextOpen?.dueDate || '', today, outstandingBase),
    settled: outstandingBase <= 0.005,
    // Not clamped to zero. A customer who has paid more than the order is worth
    // is a fact somebody has to deal with, and hiding it is how it survives to
    // the next audit.
    overpaidBase: Math.max(0, receivedBase - states.reduce((sum, state) => sum + state.dueBase, 0)),
    href: `/app/cash-collection?orderId=${encodeURIComponent(order.opportunityId)}`,
  };
}

function bucketFor(
  daysOverdue: number | null,
  nextDueDate: string,
  today: string,
  outstandingBase: number,
): AgingBucket {
  if (outstandingBase <= 0.005) return 'current';
  if (daysOverdue === null || daysOverdue <= 0) {
    const until = nextDueDate ? daysBetween(today, nextDueDate) : null;
    return until !== null && until >= 0 && until <= 7 ? 'due-soon' : 'current';
  }
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

/** Money on this order falling due within the window, counting anything already late. */
function expectedWithin(order: OrderReceivable, today: string, windowDays: number) {
  return order.installments.reduce((sum, state) => {
    if (state.settled) return sum;
    if (!state.dueDate) return sum;
    const until = daysBetween(today, state.dueDate);
    if (until === null) return sum;
    return until <= windowDays ? sum + state.outstandingBase : sum;
  }, 0);
}

/**
 * Average age of the money owed, weighted by how much of it there is.
 *
 * Counted from each installment's due date, so it measures how long the operator
 * has been waiting past the point they agreed to wait - not how long since the
 * order, which would make generous terms look like a collection problem.
 */
function weightedDaysOutstanding(orders: OrderReceivable[], today: string, totalOutstandingBase: number) {
  if (totalOutstandingBase <= 0) return null;
  const weighted = orders.reduce((sum, order) => (
    sum + order.installments.reduce((inner, state) => {
      if (state.settled || !state.dueDate) return inner;
      const age = daysBetween(state.dueDate, today) ?? 0;
      return inner + state.outstandingBase * Math.max(0, age);
    }, 0)
  ), 0);
  return Math.round(weighted / totalOutstandingBase);
}

function compareDueDates(left: string, right: string) {
  // An installment with no computable date sorts last: it cannot be chased, and
  // putting it first would let it absorb receipts owed to a dated slice.
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function createOrderReceivableRecord(input: {
  opportunityId: string;
  installments?: PaymentInstallment[];
  receipts?: PaymentReceipt[];
  deliveredOn?: string;
  invoicedOn?: string;
  note?: string;
  existing?: OrderReceivableRecord;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): OrderReceivableRecord {
  const now = new Date().toISOString();
  return {
    // Keyed by the order, so recording a second receipt edits one row rather
    // than stacking a second collection record under the first.
    id: input.existing?.id || `or-${input.opportunityId}`,
    opportunityId: input.opportunityId,
    installments: sanitizeInstallments(input.installments ?? input.existing?.installments ?? []),
    receipts: sanitizeReceipts(input.receipts ?? input.existing?.receipts ?? []),
    deliveredOn: sanitizeBusinessDate(input.deliveredOn ?? input.existing?.deliveredOn) || '',
    invoicedOn: sanitizeBusinessDate(input.invoicedOn ?? input.existing?.invoicedOn) || '',
    note: (input.note ?? input.existing?.note ?? '').trim(),
    createdAt: input.existing?.createdAt || now,
    updatedAt: now,
    source: input.existing?.source ?? input.source,
    isSample: input.existing?.isSample ?? input.isSample,
  };
}

export function createPaymentReceipt(input: {
  amount: number;
  currency: string;
  receivedOn?: string;
  method?: string;
  note?: string;
  id?: string;
}): PaymentReceipt {
  return {
    id: input.id || `rc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    amount: Number.isFinite(input.amount) ? input.amount : 0,
    currency: (input.currency || 'VND').trim().toUpperCase(),
    receivedOn: sanitizeBusinessDate(input.receivedOn) || todayDateKey(),
    method: (input.method || '').trim().slice(0, 80),
    note: (input.note || '').trim().slice(0, 240),
  };
}

export function sanitizeReceipts(value: unknown): PaymentReceipt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    const amount = Number(raw.amount);
    // A receipt with no money in it is not a payment record, it is a typo.
    if (!Number.isFinite(amount) || amount === 0) return [];
    return [createPaymentReceipt({
      id: typeof raw.id === 'string' ? raw.id : undefined,
      amount,
      currency: typeof raw.currency === 'string' ? raw.currency : 'VND',
      receivedOn: typeof raw.receivedOn === 'string' ? raw.receivedOn : undefined,
      method: typeof raw.method === 'string' ? raw.method : '',
      note: typeof raw.note === 'string' ? raw.note : '',
    })];
  });
}
