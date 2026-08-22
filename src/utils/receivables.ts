import type { CommittedOrder } from './orderToCash.ts';
import {
  convertMoney,
  getReportingCurrency,
  hasExchangeRate,
  sumMoneyInBase,
  type SupportedCurrency,
} from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';
import {
  DEFAULT_INSTALLMENT_LABEL,
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
  /** How late this slice is, judged on its own due date. */
  bucket: AgingBucket;
};

/**
 * How much of a slice can be left unpaid and still count as settled.
 *
 * Half a cent in the reporting currency. Money crossing a rate never lands
 * exactly on the slice it settles, and the residue is not a debt - treating it
 * as one keeps a paid installment overdue for ever.
 */
const SETTLED_EPSILON_BASE = 0.005;

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
  /**
   * The order is in a currency nobody has priced, so none of the figures above
   * mean anything for it.
   *
   * `amountBase` comes from `sumMoneyInBase`, which drops an amount it cannot
   * convert rather than inventing a rate - so an order in such a currency
   * arrives here worth zero. Every instalment is then a percentage of zero,
   * nothing is outstanding, and the order reported itself `settled`: fully
   * collected, gone from the aging table, gone from the count, gone from "who do
   * I ring today". Left out of a *total* is the documented behaviour and is
   * defensible; **reported as paid** is a different claim, and it is false. The
   * currency picker offers every ISO code on purpose, so any operator outside
   * the twenty-one shipped rates could reach this by selling in their own money.
   */
  valueUnavailable: boolean;
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

  // Aged slice by slice, not order by order.
  //
  // The whole order used to be dropped into the bucket its earliest unpaid
  // instalment fell in. On 30% on order / 70% net 45 that reported the entire
  // 250,000,000 as "Due within 7 days" and left "Not yet due" at zero, while
  // the summary above it correctly said 75,000,000 was due in 30 days and the
  // schedule below it correctly showed 75,000,000 now and 175,000,000 in six
  // weeks. Three answers, one screen. Terms exist precisely so the money is not
  // owed all at once, so the buckets have to read them.
  const aging = agingBuckets.map((bucket) => {
    let amountBase = 0;
    const orderIds = new Set<string>();
    for (const order of open) {
      for (const installment of order.installments) {
        if (installment.bucket !== bucket || installment.outstandingBase <= 0.005) continue;
        amountBase += installment.outstandingBase;
        orderIds.add(order.opportunityId);
      }
    }
    return { bucket, label: agingBucketLabels[bucket], count: orderIds.size, amountBase };
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

  // Asked of the currency rather than inferred from a zero, so an order that is
  // genuinely worth nothing is not mistaken for one that cannot be valued.
  const valueUnavailable = typeof order.amount === 'number'
    && order.amount !== 0
    && !hasExchangeRate(order.currency);

  const deliveredOn = sanitizeBusinessDate(record?.deliveredOn) || '';
  const invoicedOn = sanitizeBusinessDate(record?.invoicedOn) || '';
  const orderDate = sanitizeBusinessDate(order.orderDate) || today;

  // How long delivery is actually taking. Where it has happened, the real gap is
  // used; otherwise nothing is assumed, because inventing a lag would move every
  // due date on the page by a number the operator never supplied.
  const deliveryLagDays = deliveredOn ? Math.max(0, daysBetween(orderDate, deliveredOn) ?? 0) : 0;

  const dueDateOf = (installment: PaymentInstallment) => installmentDueDate(installment, orderDate, {
    deliveryLagDays,
    deliveryDate: deliveredOn,
    invoiceDate: invoicedOn,
  });

  /**
   * A slice's value in the reporting currency, which is what `dueBase` means.
   *
   * `installmentAmount` returns a percentage slice of `orderValueBase` - already
   * converted - but hands back a *fixed* `amount` untouched. An operator writing
   * a fixed slice writes it in the money the order is in, so on a VND order read
   * in USD, "50,000,000" was compared against a USD order value as if it were
   * fifty million dollars. Percentages were right and fixed amounts were not, in
   * the same list, under the same column heading.
   */
  const dueBaseOf = (installment: PaymentInstallment) => {
    if (typeof installment.amount !== 'number' || !Number.isFinite(installment.amount)) {
      return installmentAmount(installment, orderValueBase);
    }
    const converted = convertMoney(installment.amount, order.currency);
    // Unconvertible means the order is in a currency nobody has priced. The
    // figure as written is closer to the truth than zero, and zero would drop
    // the slice out of what is owed entirely.
    return converted === null ? installment.amount : converted;
  };

  const scheduled = installments.map((installment) => ({
    id: installment.id,
    label: installment.label,
    dueDate: dueDateOf(installment),
    dueBase: dueBaseOf(installment),
  }));

  /**
   * The schedule always covers the whole order.
   *
   * `parsePaymentTerm` completes a partial sentence - "30% deposit" leaves the
   * rest understood - but that completion lived in the parser, so a schedule
   * arriving any other way skipped it. An operator override totalling 50%, or
   * one whose percentages did not parse and came back as null (which
   * `sanitizeInstallments` permits), produced a schedule worth less than the
   * order. Everything downstream reads `outstandingBase` off these slices, so
   * the missing half was not owed by anybody: once the customer paid the half
   * that was scheduled the order went `settled: true` and left the collections
   * list, which is the one screen whose entire job is to not let that happen.
   *
   * Enforced here rather than in the parser so it holds for every source of a
   * schedule, including the ones that do not exist yet.
   */
  const scheduledTotal = scheduled.reduce((sum, entry) => sum + entry.dueBase, 0);
  if (orderValueBase > 0 && scheduledTotal < orderValueBase - 0.005) {
    const remainder: PaymentInstallment = {
      id: `pt-remainder-${scheduled.length + 1}`,
      label: DEFAULT_INSTALLMENT_LABEL,
      percent: null,
      amount: null,
      trigger: 'delivery',
      offsetDays: 0,
    };
    scheduled.push({
      id: remainder.id,
      label: remainder.label,
      dueDate: dueDateOf(remainder),
      dueBase: orderValueBase - scheduledTotal,
    });
  }

  // Applied oldest first, so a receipt covers what has been owed longest.
  scheduled.sort((left, right) => compareDueDates(left.dueDate, right.dueDate));

  const receivedBase = sumMoneyInBase(
    (record?.receipts || [])
      .filter((receipt) => typeof receipt?.amount === 'number' && Number.isFinite(receipt.amount))
      .map((receipt) => ({ amount: receipt.amount, currency: receipt.currency || order.currency })),
  );

  let remaining = receivedBase;
  const states: ReceivableInstallmentState[] = scheduled.map((entry) => {
    const applied = Math.min(remaining, entry.dueBase);
    remaining = Math.max(0, remaining - applied);
    const rawOutstanding = Math.max(0, entry.dueBase - applied);
    const daysLate = entry.dueDate ? (daysBetween(entry.dueDate, today) ?? 0) : 0;
    // Settled decides overdue, rather than each answering the question its own
    // way. They used to disagree by a line: `settled` allowed half a cent of
    // slack and `overdue` was `outstandingBase > 0`, so a slice could be both at
    // once - and a converted amount almost always lands a fraction off the slice
    // it settles. 30% of a 168,000 EUR order, paid in full and read in USD, left
    // 0.0038 outstanding; that residue was an unpaid debt for ever. The deposit
    // reported 92 days late, the order took the worst of its slices, and "Chase
    // this one first" sent the operator after money that arrived in May. The
    // 135,692 that really was late was five days late, in the next slice down.
    const settled = rawOutstanding <= SETTLED_EPSILON_BASE;
    const outstandingBase = settled ? 0 : rawOutstanding;
    const overdue = !settled && Boolean(entry.dueDate) && daysLate > 0;
    return {
      id: entry.id,
      label: entry.label,
      dueDate: entry.dueDate,
      dueBase: entry.dueBase,
      receivedBase: applied,
      outstandingBase,
      settled,
      daysOverdue: overdue ? daysLate : 0,
      overdue,
      bucket: bucketFor(overdue ? daysLate : null, entry.dueDate, today, outstandingBase),
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
    // An order nobody could value is not an order that has been paid. It stays
    // open, and the page says why instead of showing a figure it does not have.
    settled: outstandingBase <= 0.005 && !valueUnavailable,
    // Not clamped to zero. A customer who has paid more than the order is worth
    // is a fact somebody has to deal with, and hiding it is how it survives to
    // the next audit.
    overpaidBase: Math.max(0, receivedBase - states.reduce((sum, state) => sum + state.dueBase, 0)),
    valueUnavailable,
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
