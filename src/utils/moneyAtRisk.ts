import type { CommercialCommitment } from '../domain/commercialKernel/types.ts';
import type { CommittedOrder } from './orderToCash.ts';
import { ORDER_STALLED_AFTER_DAYS } from './orderToCash.ts';
import type { ReceivablesSummary } from './receivables.ts';
import type { OrderMarginSummary } from './orderMargin.ts';
import { normalizeEntityName } from './accountIdentity.ts';
import { convertMoney, formatCompactBaseAmount } from './money.ts';
import {
  compareSafeBusinessDate,
  daysBetweenBusinessDates,
  formatSafeBusinessDate,
  isValidBusinessDate,
  sanitizeBusinessDate,
  timestampToLocalDateKey,
  todayDateKey,
} from './safeDate.ts';

/**
 * Money at risk: the exceptions on the road from a won deal to money in the bank.
 *
 * ## Composition, not a fourth engine
 *
 * Money already has three engines, each the owner of one question: the order
 * book (where is each order on the road to cash), receivables (what is owed
 * and how late), and margin (was it worth doing). This file adds no rule about
 * any of those. It reads their answers and names the exceptions among them, so
 * an order the order book calls stalled is the order this list calls stuck, and
 * an invoice receivables calls 40 days late is 40 days late here.
 *
 * Two things are genuinely added, and both are about reading records together:
 *
 *   - "Won but no PO" and "Delivered, not invoiced" are gaps between two ticks on
 *     the same order. The order book knows both ticks; it has never said that
 *     one without the other is a problem.
 *   - "Payment promise missed" joins a customer's dated promise to pay, from the
 *     commitment ledger, to the fact that it is past. The ledger knows the date;
 *     nobody was reading it as money.
 *
 * ## What it refuses to be
 *
 * Accounting. There is no ledger here, no journal, no accrual. Margin is the
 * commercial margin on an order, graded against the target the operator set.
 */

export const moneyRiskKinds = [
  'payment-promise-missed',
  'invoice-overdue',
  'deposit-overdue',
  'delivered-not-invoiced',
  'won-no-po',
  'margin-below-target',
  'order-stuck',
] as const;
export type MoneyRiskKind = (typeof moneyRiskKinds)[number];

export const moneyRiskLabels: Record<MoneyRiskKind, string> = {
  'payment-promise-missed': 'Payment promise missed',
  'invoice-overdue': 'Invoice overdue',
  'deposit-overdue': 'Deposit overdue',
  'delivered-not-invoiced': 'Delivered, not invoiced',
  'won-no-po': 'Won, no PO',
  'margin-below-target': 'Margin below target',
  'order-stuck': 'Order stuck',
};

/** How long after delivery an uninvoiced order becomes an exception. */
export const INVOICE_AFTER_DELIVERY_DAYS = 3;
/** How long after the win a missing PO becomes an exception. */
export const PO_AFTER_WIN_DAYS = 7;

export type MoneyRiskItem = {
  id: string;
  kind: MoneyRiskKind;
  label: string;
  opportunityId: string;
  accountName: string;
  orderName: string;
  orderRef: string;
  /** What happened, with the date or figure that proves it. */
  what: string;
  /** Why it matters in money. */
  why: string;
  /** What to do. */
  action: string;
  /** The money exposed, in the reporting currency. Null when it cannot be priced. */
  exposureBase: number | null;
  exposureLabel: string;
  /** Days past the point it became an exception. Drives the order within a kind. */
  daysLate: number;
  severity: 'critical' | 'high' | 'medium';
  href: string;
  /** Which engine's answer this came from, for "why am I seeing this". */
  basis: string;
};

export type MoneyAtRisk = {
  items: MoneyRiskItem[];
  counts: Record<MoneyRiskKind, number>;
  /** Exposure across items, counting each order once at its largest exposure. */
  exposureBase: number;
  unpricedCount: number;
};

const SEVERITY_ORDER: Record<MoneyRiskItem['severity'], number> = { critical: 0, high: 1, medium: 2 };
const KIND_ORDER: Record<MoneyRiskKind, number> = Object.fromEntries(moneyRiskKinds.map((kind, index) => [kind, index])) as Record<MoneyRiskKind, number>;

export function buildMoneyAtRisk(input: {
  orders: CommittedOrder[];
  receivables: ReceivablesSummary;
  margins?: OrderMarginSummary | null;
  commitments?: CommercialCommitment[];
  today?: string;
}): MoneyAtRisk {
  const today = isValidBusinessDate(input.today) ? (input.today as string) : todayDateKey();
  const receivableByOrder = new Map(input.receivables.orders.map((receivable) => [receivable.opportunityId, receivable]));
  const items: MoneyRiskItem[] = [];
  let unpricedCount = 0;

  const exposure = (base: number | null | undefined) => {
    if (base === null || base === undefined) return { exposureBase: null, exposureLabel: '' };
    return { exposureBase: base, exposureLabel: base > 0 ? formatCompactBaseAmount(base) : '' };
  };

  for (const order of input.orders) {
    const receivable = receivableByOrder.get(order.opportunityId);
    const milestone = (key: string) => order.milestones.find((item) => item.key === key);
    const common = {
      opportunityId: order.opportunityId,
      accountName: order.accountName,
      orderName: order.orderName,
      orderRef: order.orderRef,
      href: order.href,
    };
    const unpriced = receivable?.valueUnavailable === true;
    if (unpriced) unpricedCount += 1;
    const orderValue = unpriced ? null : order.amountBase;

    // ---- the invoice is late: receivables owns lateness
    if (receivable && !receivable.settled && receivable.daysOverdue !== null && receivable.daysOverdue > 0) {
      items.push({
        ...common,
        id: `invoice-overdue:${order.opportunityId}`,
        kind: 'invoice-overdue',
        label: moneyRiskLabels['invoice-overdue'],
        // Collections dates an order with no agreed term from the order itself, and
        // counts it - so this does too, and says the date was assumed rather than
        // letting "past due" read as a term the customer agreed to.
        what: `${receivable.overdueBase > 0 ? formatCompactBaseAmount(receivable.overdueBase) : 'Payment'} is ${receivable.daysOverdue} ${receivable.daysOverdue === 1 ? 'day' : 'days'} past due${receivable.termConfidence === 'assumed' ? ' - no payment term is recorded, so it is counted from the order date' : receivable.paymentTerm ? ` on ${receivable.paymentTerm}` : ''}.`,
        why: 'Money that is late gets later. Every week unchased is working capital you are lending the customer.',
        action: `Chase payment with ${order.accountName}`,
        ...exposure(unpriced ? null : receivable.overdueBase),
        daysLate: receivable.daysOverdue,
        severity: receivable.daysOverdue > 30 ? 'critical' : 'high',
        basis: 'Collections: the oldest unpaid instalment is past its due date.',
      });
    }

    // ---- the deposit step is late: the order book owns the dated step
    const deposit = milestone('deposit');
    if (deposit && !deposit.done && deposit.overdue) {
      const days = daysBetweenBusinessDates(deposit.dueDate, today) ?? 0;
      items.push({
        ...common,
        id: `deposit-overdue:${order.opportunityId}`,
        kind: 'deposit-overdue',
        label: moneyRiskLabels['deposit-overdue'],
        what: `The deposit was due ${formatSafeBusinessDate(deposit.dueDate)} and has not arrived.`,
        why: 'Goods ordered against a deposit that never landed is stock bought on the customer\'s word.',
        action: `Confirm the deposit with ${order.accountName} before anything ships`,
        ...exposure(orderValue),
        daysLate: days,
        severity: days > 14 ? 'critical' : 'high',
        basis: 'Order book: the Deposit step has a due date and is not ticked.',
      });
    }

    // ---- delivered and not invoiced: two ticks that disagree
    const delivery = milestone('delivery');
    const invoice = milestone('invoice');
    if (delivery?.done && invoice && !invoice.done) {
      const deliveredOn = sanitizeBusinessDate(delivery.doneAt || receivable?.orderDate || '');
      const days = deliveredOn ? (daysBetweenBusinessDates(deliveredOn, today) ?? 0) : INVOICE_AFTER_DELIVERY_DAYS;
      if (days >= INVOICE_AFTER_DELIVERY_DAYS) {
        items.push({
          ...common,
          id: `delivered-not-invoiced:${order.opportunityId}`,
          kind: 'delivered-not-invoiced',
          label: moneyRiskLabels['delivered-not-invoiced'],
          what: deliveredOn
            ? `Delivered ${formatSafeBusinessDate(deliveredOn)}, ${days} days ago, and no invoice is recorded.`
            : 'Delivered, and no invoice is recorded.',
          why: 'Payment terms usually run from the invoice. Until it is raised, the clock on getting paid has not started.',
          action: `Raise the invoice for ${order.orderRef || order.orderName}`,
          ...exposure(orderValue),
          daysLate: Math.max(0, days - INVOICE_AFTER_DELIVERY_DAYS),
          severity: days > 14 ? 'high' : 'medium',
          basis: 'Order book: Delivered is ticked, Invoiced is not.',
        });
      }
    }

    // ---- won and no PO
    const contract = milestone('contract');
    if (order.status === 'Won' && contract && !contract.done) {
      const wonOn = sanitizeBusinessDate(order.orderDate);
      const days = wonOn ? (daysBetweenBusinessDates(wonOn, today) ?? 0) : PO_AFTER_WIN_DAYS;
      if (days >= PO_AFTER_WIN_DAYS) {
        items.push({
          ...common,
          id: `won-no-po:${order.opportunityId}`,
          kind: 'won-no-po',
          label: moneyRiskLabels['won-no-po'],
          what: `Won${wonOn ? ` ${formatSafeBusinessDate(wonOn)}` : ''}, and no contract or PO is recorded.`,
          why: 'A verbal win is not an order. Until the paper arrives, the revenue on your scoreboard can still walk.',
          action: `Get the PO from ${order.accountName}`,
          ...exposure(orderValue),
          daysLate: Math.max(0, days - PO_AFTER_WIN_DAYS),
          severity: days > 30 ? 'high' : 'medium',
          basis: 'Order book: the deal is Won and the Contract / PO step is not ticked.',
        });
      }
    }

    // ---- margin below target: margin owns the grading
    const margin = input.margins?.byOrder.get(order.opportunityId);
    if (margin && margin.hasCost && !margin.costUnavailable && margin.marginPct !== null && !margin.meetsTarget) {
      const losing = (margin.marginBase ?? 0) < 0;
      items.push({
        ...common,
        id: `margin-below-target:${order.opportunityId}`,
        kind: 'margin-below-target',
        label: moneyRiskLabels['margin-below-target'],
        what: losing
          ? `Sold below landed cost: ${margin.marginPct}% margin.`
          : `Keeps ${margin.marginPct}% against a ${input.margins?.targetPct}% target.`,
        why: losing
          ? 'Every unit of this order loses money after freight and duty.'
          : `${formatCompactBaseAmount(margin.targetGapBase)} short of what the target asked this order to keep.`,
        action: losing ? 'Check the landed cost, then decide whether to renegotiate' : 'Check the price or the landed cost before repeating it',
        ...exposure(margin.targetGapBase),
        daysLate: 0,
        severity: losing ? 'high' : 'medium',
        basis: 'Margin: revenue minus recorded landed cost, graded against your target.',
      });
    }

    // ---- stuck: the order book owns "stalled"
    if (order.stalled && !order.fullyCollected) {
      items.push({
        ...common,
        id: `order-stuck:${order.opportunityId}`,
        kind: 'order-stuck',
        label: moneyRiskLabels['order-stuck'],
        what: `${order.nextMilestone ? `Waiting at ${order.nextMilestone.label}` : 'Not moving'} for ${order.daysInStage ?? ORDER_STALLED_AFTER_DAYS}+ days, with no date that could make it overdue.`,
        why: 'An order nobody dated can never be late, so nothing else in the product will ever flag it.',
        action: order.nextMilestone ? `Find out where ${order.nextMilestone.label.toLowerCase()} stands, and date it` : 'Confirm the order is still live',
        ...exposure(orderValue),
        daysLate: Math.max(0, (order.daysInStage ?? ORDER_STALLED_AFTER_DAYS) - ORDER_STALLED_AFTER_DAYS),
        severity: 'medium',
        basis: `Order book: no step has moved for ${ORDER_STALLED_AFTER_DAYS}+ days and none carries a due date.`,
      });
    }
  }

  // ---- a customer's promise to pay, past its date
  const ordersByAccount = new Map<string, CommittedOrder[]>();
  for (const order of input.orders) {
    const key = normalizeEntityName(order.accountName);
    ordersByAccount.set(key, [...(ordersByAccount.get(key) || []), order]);
  }
  for (const commitment of input.commitments || []) {
    if (commitment.status !== 'open' || commitment.commitmentParty !== 'customer') continue;
    const isPayment = commitment.impactType === 'payment'
      || /\b(pay|paid|payment|transfer|remit|settle|deposit)\b/iu.test(commitment.commitmentText || '');
    if (!isPayment) continue;
    const due = sanitizeBusinessDate(commitment.currentDueDate);
    if (!due || compareSafeBusinessDate(due, today) >= 0) continue;
    const days = daysBetweenBusinessDates(due, today) ?? 0;
    const linkedOrder = (commitment.opportunityId && input.orders.find((order) => order.opportunityId === commitment.opportunityId))
      || (ordersByAccount.get(normalizeEntityName(commitment.accountName)) || [])[0];
    const amountBase = commitment.impactAmount
      ? convertMoney(commitment.impactAmount, commitment.impactCurrency || '')
      : null;
    const renegotiated = commitment.dueDateHistory.length > 0
      ? ` It has already moved ${commitment.dueDateHistory.length} ${commitment.dueDateHistory.length === 1 ? 'time' : 'times'} since ${formatSafeBusinessDate(commitment.originalDueDate)}.`
      : '';
    items.push({
      id: `payment-promise-missed:${commitment.id}`,
      kind: 'payment-promise-missed',
      label: moneyRiskLabels['payment-promise-missed'],
      opportunityId: linkedOrder?.opportunityId || commitment.opportunityId || '',
      accountName: commitment.accountName,
      orderName: linkedOrder?.orderName || commitment.commitmentText,
      orderRef: linkedOrder?.orderRef || '',
      what: `${commitment.ownerLabel || commitment.accountName} promised "${commitment.commitmentText}" by ${formatSafeBusinessDate(due)}, ${days} ${days === 1 ? 'day' : 'days'} ago.${renegotiated}`,
      why: 'A missed promise to pay is the earliest warning a collection is going wrong - earlier than the invoice aging.',
      action: `Call ${commitment.ownerLabel || commitment.accountName} and get a new date in writing`,
      exposureBase: amountBase,
      exposureLabel: amountBase ? formatCompactBaseAmount(amountBase) : '',
      daysLate: days,
      severity: days > 7 || commitment.dueDateHistory.length > 0 ? 'critical' : 'high',
      href: linkedOrder?.href || '/app/timeline',
      basis: `Commitments: a customer promise about payment, dated ${formatSafeBusinessDate(due)} and still open. Recorded ${formatSafeBusinessDate(timestampToLocalDateKey(commitment.createdAt))}.`,
    });
  }

  items.sort((left, right) => (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
    || (right.exposureBase ?? 0) - (left.exposureBase ?? 0)
    || right.daysLate - left.daysLate
    || left.accountName.localeCompare(right.accountName)
  ));

  const counts = moneyRiskKinds.reduce((accumulator, kind) => {
    accumulator[kind] = items.filter((item) => item.kind === kind).length;
    return accumulator;
  }, {} as Record<MoneyRiskKind, number>);

  // One order at its largest exposure: an overdue invoice and a stalled step on
  // the same order are the same money, and adding both would double it.
  const largestByOrder = new Map<string, number>();
  for (const item of items) {
    if (item.exposureBase === null) continue;
    const key = item.opportunityId || item.id;
    largestByOrder.set(key, Math.max(largestByOrder.get(key) ?? 0, item.exposureBase));
  }

  return {
    items,
    counts,
    exposureBase: [...largestByOrder.values()].reduce((sum, value) => sum + value, 0),
    unpricedCount,
  };
}
