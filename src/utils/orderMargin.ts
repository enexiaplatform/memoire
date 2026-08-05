import type { CommittedOrder } from './orderToCash.ts';
import { getReportingCurrency, sumMoneyInBase, type SupportedCurrency } from './money.ts';

/**
 * What each order actually earned: the sell side the workspace already knows,
 * minus the buy side only the operator can tell it.
 *
 * The founder's brief was specific about what this is *not*. Memoire already has
 * a profit-and-loss statement (utils/pnl.ts) - cash collected against cash paid,
 * for a period, in accounting language - and it sits behind a flag that is off,
 * because testing a commercial-control product and a bookkeeping product in one
 * beta teaches neither. This is a different question with a different answer:
 * not "what did the business earn last month" but "did I make money on this
 * order, and on this customer". A distributor knows their selling price to the
 * decimal and carries the purchase price in their head; the gap between the two
 * is the only number on the order book that says whether the work was worth
 * doing, and it was the one number the page could not show.
 *
 * Three rules keep it honest, and each one exists because the obvious shortcut
 * produces a figure an operator would act on and should not:
 *
 *   1. **Only orders with a cost are counted.** Summing all committed revenue
 *      against the costs that happen to be recorded would report a margin near
 *      100% for a workspace that has priced two orders out of thirty. The
 *      totals here cover the orders that have both halves, and the model always
 *      reports how many that is, so the number can be read for what it is.
 *   2. **Cost never touches the order's value.** Revenue stays whatever the
 *      quote or the deal says. This model reads; it does not write back, the
 *      same contract the plan board has with deals.
 *   3. **Nothing appears until a cost exists.** `tracked` is false for a
 *      workspace that has never entered one, and every surface reading this
 *      hides itself. An operator whose company does not let them see purchase
 *      price should never meet an empty margin column asking to be filled.
 */

export type OrderCostRecord = {
  id: string;
  /** The order this is the buy side of. One cost per order. */
  opportunityId: string;
  /** What the goods cost you. Null means "recorded but not priced yet". */
  amount: number | null;
  currency: string;
  /** Who you bought from. Free text - this is not a vendor record. */
  supplier: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

export type OrderMargin = {
  opportunityId: string;
  /** A cost has been recorded and priced, so this order has both halves. */
  hasCost: boolean;
  costAmount: number | null;
  costCurrency: string;
  costBase: number;
  supplier: string;
  revenueBase: number;
  /** Revenue minus cost, in the reporting currency. Null without a cost. */
  marginBase: number | null;
  /** Whole percent of revenue kept. Null without a cost, or on a zero-value order. */
  marginPct: number | null;
};

export type OrderMarginSummary = {
  /** False until the first purchase cost exists anywhere in the workspace. */
  tracked: boolean;
  reportingCurrency: SupportedCurrency;
  byOrder: Map<string, OrderMargin>;
  /** Orders in the book that carry a priced cost. */
  coveredCount: number;
  totalCount: number;
  /** Every figure below covers the covered orders only - never the whole book. */
  revenueBase: number;
  costBase: number;
  grossMarginBase: number;
  marginPct: number | null;
  /** The order keeping the least of what it sold. Null when nothing is covered. */
  thinnest: OrderMargin | null;
  /** Orders priced below cost. The reason this feature is worth the screen space. */
  losingCount: number;
};

export function buildOrderMargins(input: {
  orders: CommittedOrder[];
  costRecords: OrderCostRecord[];
}): OrderMarginSummary {
  const live = input.costRecords.filter((record) => record.__deleted !== true);
  const costByOrder = new Map(live.map((record) => [record.opportunityId, record]));
  const reportingCurrency = getReportingCurrency();

  const byOrder = new Map<string, OrderMargin>();
  input.orders.forEach((order) => {
    const cost = costByOrder.get(order.opportunityId);
    const costAmount = typeof cost?.amount === 'number' && Number.isFinite(cost.amount) ? cost.amount : null;
    const costCurrency = (cost?.currency || order.currency || reportingCurrency).toUpperCase();

    if (costAmount === null) {
      byOrder.set(order.opportunityId, {
        opportunityId: order.opportunityId,
        hasCost: false,
        costAmount: null,
        costCurrency,
        costBase: 0,
        supplier: cost?.supplier || '',
        revenueBase: order.amountBase,
        marginBase: null,
        marginPct: null,
      });
      return;
    }

    const costBase = sumMoneyInBase([{ amount: costAmount, currency: costCurrency }]);
    const marginBase = order.amountBase - costBase;
    byOrder.set(order.opportunityId, {
      opportunityId: order.opportunityId,
      hasCost: true,
      costAmount,
      costCurrency,
      costBase,
      supplier: cost?.supplier || '',
      revenueBase: order.amountBase,
      marginBase,
      // An order with no value recorded has no denominator. Reporting 0% or
      // 100% there would be a number invented out of a missing field.
      marginPct: order.amountBase > 0 ? Math.round((marginBase / order.amountBase) * 100) : null,
    });
  });

  const covered = [...byOrder.values()].filter((margin) => margin.hasCost);
  const revenueBase = covered.reduce((sum, margin) => sum + margin.revenueBase, 0);
  const costBase = covered.reduce((sum, margin) => sum + margin.costBase, 0);
  const grossMarginBase = revenueBase - costBase;

  return {
    // Tracked reads the *records*, not the orders. A cost entered against an
    // order that has since been lost still means this operator prices their
    // buy side, and hiding the column again the moment their only costed order
    // leaves the book would read as the feature breaking.
    tracked: live.some((record) => typeof record.amount === 'number' && Number.isFinite(record.amount)),
    reportingCurrency,
    byOrder,
    coveredCount: covered.length,
    totalCount: input.orders.length,
    revenueBase,
    costBase,
    grossMarginBase,
    marginPct: revenueBase > 0 ? Math.round((grossMarginBase / revenueBase) * 100) : null,
    thinnest: covered
      .filter((margin) => margin.marginPct !== null)
      .sort((left, right) => (left.marginPct as number) - (right.marginPct as number))[0] || null,
    losingCount: covered.filter((margin) => (margin.marginBase as number) < 0).length,
  };
}

export function createOrderCostRecord(input: {
  opportunityId: string;
  amount: number | null;
  currency: string;
  supplier?: string;
  note?: string;
  existing?: OrderCostRecord;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): OrderCostRecord {
  const now = new Date().toISOString();
  return {
    // One cost per order, keyed by the order, so re-entering it edits the same
    // row rather than stacking a second buy side under the first.
    id: input.existing?.id || `oc-${input.opportunityId}`,
    opportunityId: input.opportunityId,
    amount: typeof input.amount === 'number' && Number.isFinite(input.amount) ? input.amount : null,
    currency: (input.currency || 'VND').trim().toUpperCase(),
    supplier: (input.supplier || '').trim(),
    note: (input.note || '').trim(),
    createdAt: input.existing?.createdAt || now,
    updatedAt: now,
    source: input.existing?.source ?? input.source,
    isSample: input.existing?.isSample ?? input.isSample,
  };
}

/**
 * The margin tone an order wears. Thresholds are deliberately blunt and stated
 * out loud rather than adaptive: a distributor knows what a thin deal looks like
 * in their own trade, and a threshold that quietly moves is one nobody can argue
 * with. Negative is the only one that is a fact rather than a judgement.
 */
export function marginTone(marginPct: number | null): 'loss' | 'thin' | 'healthy' | 'unknown' {
  if (marginPct === null) return 'unknown';
  if (marginPct < 0) return 'loss';
  if (marginPct < 10) return 'thin';
  return 'healthy';
}

/**
 * Margin gathered by something the orders have in common - the customer, or the
 * line the goods came from.
 *
 * This is the half of cost analysis that a per-order figure cannot give you.
 * "This order kept 18%" is a fact about one transaction; "everything I sell this
 * customer keeps 4% and everything I sell that one keeps 31%" is the sentence
 * that changes who gets the next quote. Same honesty rule as the totals: a group
 * reports only the orders inside it that have both halves, and says how many
 * that was, so a group with one costed order out of nine is legible as such.
 */
export type MarginGroup = {
  key: string;
  label: string;
  orderCount: number;
  coveredCount: number;
  revenueBase: number;
  costBase: number;
  grossMarginBase: number;
  marginPct: number | null;
  /** True when nothing in this group is costed, so its margin is unknown rather than zero. */
  unknown: boolean;
};

export function rollupOrderMargins(input: {
  /** Each committed order, tagged with the group it belongs to. */
  entries: { opportunityId: string; key: string; label: string }[];
  margins: OrderMarginSummary;
}): MarginGroup[] {
  const groups = new Map<string, MarginGroup>();

  input.entries.forEach((entry) => {
    const margin = input.margins.byOrder.get(entry.opportunityId);
    const group = groups.get(entry.key) || {
      key: entry.key,
      label: entry.label,
      orderCount: 0,
      coveredCount: 0,
      revenueBase: 0,
      costBase: 0,
      grossMarginBase: 0,
      marginPct: null,
      unknown: true,
    };

    group.orderCount += 1;
    if (margin?.hasCost) {
      group.coveredCount += 1;
      group.revenueBase += margin.revenueBase;
      group.costBase += margin.costBase;
    }
    groups.set(entry.key, group);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      grossMarginBase: group.revenueBase - group.costBase,
      marginPct: group.revenueBase > 0 ? Math.round(((group.revenueBase - group.costBase) / group.revenueBase) * 100) : null,
      unknown: group.coveredCount === 0,
    }))
    // Groups you can read first, biggest contribution at the top; the ones with
    // no cost recorded sink to the bottom as work still to do rather than being
    // hidden - a customer you have never costed is itself the finding.
    .sort((left, right) => (
      Number(left.unknown) - Number(right.unknown)
      || right.grossMarginBase - left.grossMarginBase
      || right.orderCount - left.orderCount
    ));
}
