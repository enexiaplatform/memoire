import type { CommittedOrder } from './orderToCash.ts';
import { getReportingCurrency, sumMoneyInBase, type SupportedCurrency } from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

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
 * ## What changed on 2026-08-06, and why
 *
 * The first version was one purchase price per order and a percentage. The
 * founder's verdict was that it was too thin to act on, and they were right for
 * three specific reasons, each of which is now a thing this model computes:
 *
 *   1. **Goods are not the cost.** A distributor pays the principal in USD and
 *      then pays freight, import duty and installation in dong. A margin worked
 *      out on the invoice from the principal alone is the number that makes an
 *      order look fine right up until the year does not add up. So the buy side
 *      is landed cost - goods plus freight plus duty plus other - and the model
 *      keeps the two halves apart so the operator can see what the extras ate.
 *   2. **A percentage with nothing to compare it to is trivia.** "You kept 14%"
 *      is only a finding once there is a number it was supposed to be. The
 *      operator states their target and every figure is read against it: which
 *      orders missed, by how much money, and what the price or the purchase
 *      would have had to be to hit it.
 *   3. **One snapshot hides the direction.** A book that kept 22% last quarter
 *      and 11% this one is a business in trouble that a single total reports as
 *      healthy. Margin is therefore also rolled up by month.
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

/**
 * The margin an order is supposed to keep, until the operator says otherwise.
 *
 * A stated line, not a learned one - the same reasoning that keeps the loss and
 * thin thresholds fixed. Twenty percent is a plain distributor's number and it
 * is wrong for somebody, which is exactly why it is editable and printed next to
 * every figure it grades.
 */
export const DEFAULT_TARGET_MARGIN_PCT = 20;

export type OrderCostRecord = {
  id: string;
  /** The order this is the buy side of. One cost per order. */
  opportunityId: string;
  /** What the goods cost you, from the principal. Null means "not priced yet". */
  amount: number | null;
  /** The currency the goods were bought in - usually not the selling currency. */
  currency: string;
  /**
   * The three costs that turn a purchase price into a landed cost.
   *
   * Separate fields rather than one "other costs" box because they behave
   * differently and the operator knows them separately: freight is negotiable,
   * duty is a rate on a tariff line, and installation is labour. Rolling them
   * into one number would answer "what did this cost" and lose "which part of it
   * is worth attacking", which is the only reason to record them at all.
   */
  freightAmount: number | null;
  dutyAmount: number | null;
  otherAmount: number | null;
  /**
   * The currency the extras were paid in, kept apart from the goods currency.
   *
   * This is the ordinary shape of an import: the principal invoices in USD and
   * the forwarder, the customs broker and the engineer all invoice in dong.
   * Forcing one currency onto the whole record would have made the operator
   * convert by hand, which is how a rate from six months ago ends up baked into
   * a cost record nobody can audit.
   */
  extrasCurrency: string;
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
  /** Some part of the buy side has been priced, so this order has both halves. */
  hasCost: boolean;
  /** What the principal charged, as entered. */
  costAmount: number | null;
  /** The currency the goods were bought in. Preserved for display. */
  costCurrency: string;
  goodsBase: number;
  freightAmount: number | null;
  dutyAmount: number | null;
  otherAmount: number | null;
  extrasCurrency: string;
  /** Freight, duty and other, converted and added. Zero when none are recorded. */
  extrasBase: number;
  /** Goods plus extras, in the reporting currency. What the order really cost. */
  costBase: number;
  /** True when anything beyond the goods price was recorded against this order. */
  hasExtras: boolean;
  supplier: string;
  revenueBase: number;
  /** Revenue minus landed cost, in the reporting currency. Null without a cost. */
  marginBase: number | null;
  /** Whole percent of revenue kept. Null without a cost, or on a zero-value order. */
  marginPct: number | null;
  /**
   * What the margin would have read on the goods price alone.
   *
   * The gap between this and `marginPct` is the whole argument for recording
   * landed cost: it is the percentage the operator thought they were keeping.
   */
  goodsMarginPct: number | null;
  /** Keeping at least the target. False for an unpriced order - unknown is not a pass. */
  meetsTarget: boolean;
  /** Money this order is short of the target. Zero when it meets or beats it. */
  targetGapBase: number;
  /** What it needed to sell for to hit the target at this cost. */
  priceForTargetBase: number | null;
  /** What it needed to cost to hit the target at this price. */
  costForTargetBase: number | null;
};

export type OrderMarginSummary = {
  /** False until the first purchase cost exists anywhere in the workspace. */
  tracked: boolean;
  reportingCurrency: SupportedCurrency;
  /** The margin these figures are graded against. */
  targetPct: number;
  byOrder: Map<string, OrderMargin>;
  /** Orders in the book that carry a priced cost. */
  coveredCount: number;
  totalCount: number;
  /** Every figure below covers the covered orders only - never the whole book. */
  revenueBase: number;
  costBase: number;
  goodsBase: number;
  /** Freight, duty and other across every costed order. */
  extrasBase: number;
  grossMarginBase: number;
  marginPct: number | null;
  /** What the margin would read if only the goods price were counted. */
  goodsMarginPct: number | null;
  /** The order keeping the least of what it sold. Null when nothing is covered. */
  thinnest: OrderMargin | null;
  /** Orders priced below cost. The reason this feature is worth the screen space. */
  losingCount: number;
  /** Costed orders keeping less than the target, including the ones below cost. */
  belowTargetCount: number;
  /** The money between what these orders kept and what the target asked for. */
  targetGapBase: number;
  /** Committed orders with no purchase cost against them at all. */
  uncoveredCount: number;
  /**
   * What those orders are worth.
   *
   * The size of the blind spot, in money. Coverage as a count ("4 of 30") is easy
   * to shrug at; the same gap expressed as the value passing through it is the
   * sentence that gets the costs entered.
   */
  uncoveredRevenueBase: number;
};

export function buildOrderMargins(input: {
  orders: CommittedOrder[];
  costRecords: OrderCostRecord[];
  /** The margin to grade against. Defaults to the stated line. */
  targetPct?: number;
}): OrderMarginSummary {
  const live = input.costRecords.filter((record) => record.__deleted !== true);
  const costByOrder = new Map(live.map((record) => [record.opportunityId, record]));
  const reportingCurrency = getReportingCurrency();
  const targetPct = normalizeTargetPct(input.targetPct);

  const byOrder = new Map<string, OrderMargin>();
  input.orders.forEach((order) => {
    byOrder.set(
      order.opportunityId,
      buildOneOrderMargin(order, costByOrder.get(order.opportunityId), reportingCurrency, targetPct),
    );
  });

  const covered = [...byOrder.values()].filter((margin) => margin.hasCost);
  const uncovered = [...byOrder.values()].filter((margin) => !margin.hasCost);
  const revenueBase = covered.reduce((sum, margin) => sum + margin.revenueBase, 0);
  const costBase = covered.reduce((sum, margin) => sum + margin.costBase, 0);
  const goodsBase = covered.reduce((sum, margin) => sum + margin.goodsBase, 0);
  const extrasBase = covered.reduce((sum, margin) => sum + margin.extrasBase, 0);
  const grossMarginBase = revenueBase - costBase;

  return {
    // Tracked reads the *records*, not the orders. A cost entered against an
    // order that has since been lost still means this operator prices their
    // buy side, and hiding the column again the moment their only costed order
    // leaves the book would read as the feature breaking.
    tracked: live.some((record) => recordIsPriced(record)),
    reportingCurrency,
    targetPct,
    byOrder,
    coveredCount: covered.length,
    totalCount: input.orders.length,
    revenueBase,
    costBase,
    goodsBase,
    extrasBase,
    grossMarginBase,
    marginPct: revenueBase > 0 ? Math.round((grossMarginBase / revenueBase) * 100) : null,
    goodsMarginPct: revenueBase > 0 ? Math.round(((revenueBase - goodsBase) / revenueBase) * 100) : null,
    thinnest: covered
      .filter((margin) => margin.marginPct !== null)
      .sort((left, right) => (left.marginPct as number) - (right.marginPct as number))[0] || null,
    losingCount: covered.filter((margin) => (margin.marginBase as number) < 0).length,
    belowTargetCount: covered.filter((margin) => margin.marginPct !== null && !margin.meetsTarget).length,
    targetGapBase: covered.reduce((sum, margin) => sum + margin.targetGapBase, 0),
    uncoveredCount: uncovered.length,
    uncoveredRevenueBase: uncovered.reduce((sum, margin) => sum + margin.revenueBase, 0),
  };
}

function buildOneOrderMargin(
  order: CommittedOrder,
  cost: OrderCostRecord | undefined,
  reportingCurrency: SupportedCurrency,
  targetPct: number,
): OrderMargin {
  const goodsAmount = finiteOrNull(cost?.amount);
  const freightAmount = finiteOrNull(cost?.freightAmount);
  const dutyAmount = finiteOrNull(cost?.dutyAmount);
  const otherAmount = finiteOrNull(cost?.otherAmount);
  const costCurrency = (cost?.currency || order.currency || reportingCurrency).toUpperCase();
  const extrasCurrency = (cost?.extrasCurrency || reportingCurrency).toUpperCase();
  const hasExtras = freightAmount !== null || dutyAmount !== null || otherAmount !== null;
  const hasCost = goodsAmount !== null || hasExtras;

  const base: OrderMargin = {
    opportunityId: order.opportunityId,
    hasCost,
    costAmount: goodsAmount,
    costCurrency,
    goodsBase: 0,
    freightAmount,
    dutyAmount,
    otherAmount,
    extrasCurrency,
    extrasBase: 0,
    costBase: 0,
    hasExtras,
    supplier: cost?.supplier || '',
    revenueBase: order.amountBase,
    marginBase: null,
    marginPct: null,
    goodsMarginPct: null,
    meetsTarget: false,
    targetGapBase: 0,
    priceForTargetBase: null,
    costForTargetBase: null,
  };

  if (!hasCost) return base;

  const goodsBase = goodsAmount === null ? 0 : sumMoneyInBase([{ amount: goodsAmount, currency: costCurrency }]);
  const extrasBase = hasExtras
    ? sumMoneyInBase([{ amount: (freightAmount || 0) + (dutyAmount || 0) + (otherAmount || 0), currency: extrasCurrency }])
    : 0;
  const costBase = goodsBase + extrasBase;
  const marginBase = order.amountBase - costBase;
  // An order with no value recorded has no denominator. Reporting 0% or 100%
  // there would be a number invented out of a missing field.
  const marginPct = order.amountBase > 0 ? Math.round((marginBase / order.amountBase) * 100) : null;
  const meetsTarget = marginPct !== null && marginPct >= targetPct;

  return {
    ...base,
    goodsBase,
    extrasBase,
    costBase,
    marginBase,
    marginPct,
    goodsMarginPct: order.amountBase > 0 ? Math.round(((order.amountBase - goodsBase) / order.amountBase) * 100) : null,
    meetsTarget,
    targetGapBase: Math.max(0, (order.amountBase * targetPct) / 100 - marginBase),
    // What it had to sell for, at this cost, to keep the target. Undefined at a
    // 100% target - there is no price at which cost is nothing.
    priceForTargetBase: targetPct < 100 ? costBase / (1 - targetPct / 100) : null,
    costForTargetBase: order.amountBase > 0 ? (order.amountBase * (100 - targetPct)) / 100 : null,
  };
}

export function createOrderCostRecord(input: {
  opportunityId: string;
  amount: number | null;
  currency: string;
  freightAmount?: number | null;
  dutyAmount?: number | null;
  otherAmount?: number | null;
  extrasCurrency?: string;
  supplier?: string;
  note?: string;
  existing?: OrderCostRecord;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): OrderCostRecord {
  const now = new Date().toISOString();
  const currency = (input.currency || 'VND').trim().toUpperCase();
  return {
    // One cost per order, keyed by the order, so re-entering it edits the same
    // row rather than stacking a second buy side under the first.
    id: input.existing?.id || `oc-${input.opportunityId}`,
    opportunityId: input.opportunityId,
    amount: finiteOrNull(input.amount),
    currency,
    freightAmount: finiteOrNull(input.freightAmount),
    dutyAmount: finiteOrNull(input.dutyAmount),
    otherAmount: finiteOrNull(input.otherAmount),
    // Falls back to the goods currency rather than to a hardcoded one: a cost
    // record written before extras existed, edited now, should not silently
    // acquire a currency the operator never chose.
    extrasCurrency: (input.extrasCurrency || input.existing?.extrasCurrency || currency).trim().toUpperCase(),
    supplier: (input.supplier || '').trim(),
    note: (input.note || '').trim(),
    createdAt: input.existing?.createdAt || now,
    updatedAt: now,
    source: input.existing?.source ?? input.source,
    isSample: input.existing?.isSample ?? input.isSample,
  };
}

/**
 * The margin tone an order wears.
 *
 * Two of the three lines are fixed and one is stated by the operator, which is a
 * deliberate distinction. Below cost is a fact and needs nobody's opinion. Below
 * *target* is a judgement, and the only person who can make it is the one who
 * knows what their trade keeps - so they declare it once and every figure is
 * graded against the same number. What this never does is learn a threshold from
 * the workspace's own data: a line that moves quietly with the numbers it grades
 * is one nobody can argue with, and a thin order becomes indistinguishable from
 * a shifted definition.
 */
export function marginTone(
  marginPct: number | null,
  targetPct: number = DEFAULT_TARGET_MARGIN_PCT,
): 'loss' | 'thin' | 'healthy' | 'unknown' {
  if (marginPct === null) return 'unknown';
  if (marginPct < 0) return 'loss';
  if (marginPct < normalizeTargetPct(targetPct)) return 'thin';
  return 'healthy';
}

/**
 * Margin gathered by something the orders have in common - the customer, the
 * line the goods came from, or who you bought them from.
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
  /** Costed orders in this group keeping less than the target. */
  belowTargetCount: number;
  /** Money this group is short of the target across its costed orders. */
  targetGapBase: number;
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
      belowTargetCount: 0,
      targetGapBase: 0,
      unknown: true,
    };

    group.orderCount += 1;
    if (margin?.hasCost) {
      group.coveredCount += 1;
      group.revenueBase += margin.revenueBase;
      group.costBase += margin.costBase;
      group.targetGapBase += margin.targetGapBase;
      if (margin.marginPct !== null && !margin.meetsTarget) group.belowTargetCount += 1;
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

/**
 * One month of the order book, priced.
 *
 * A total is a photograph and this is the film. A book that kept 24% last
 * quarter and 12% this one has a problem that no single figure on this page can
 * show, and the operator who reads only the headline will find out about it from
 * their bank instead.
 */
export type MarginPeriod = {
  /** YYYY-MM, so periods sort and join without a date library. */
  key: string;
  label: string;
  orderCount: number;
  coveredCount: number;
  revenueBase: number;
  costBase: number;
  grossMarginBase: number;
  marginPct: number | null;
};

export function rollupMarginByMonth(input: {
  orders: CommittedOrder[];
  margins: OrderMarginSummary;
  /** How many months back to draw, ending with the current one. */
  monthCount?: number;
  today?: string;
}): MarginPeriod[] {
  const monthCount = Math.max(1, Math.min(24, Math.round(input.monthCount ?? 6)));
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const months = recentMonthKeys(today, monthCount);
  const index = new Map<string, MarginPeriod>(
    months.map((key) => [key, {
      key,
      label: monthLabel(key),
      orderCount: 0,
      coveredCount: 0,
      revenueBase: 0,
      costBase: 0,
      grossMarginBase: 0,
      marginPct: null,
    }]),
  );

  input.orders.forEach((order) => {
    const key = sanitizeBusinessDate(order.orderDate).slice(0, 7);
    const period = index.get(key);
    // Orders older than the window are not folded into the first bar - that
    // would draw a spike that never happened in that month.
    if (!period) return;

    period.orderCount += 1;
    const margin = input.margins.byOrder.get(order.opportunityId);
    if (!margin?.hasCost) return;
    period.coveredCount += 1;
    period.revenueBase += margin.revenueBase;
    period.costBase += margin.costBase;
  });

  return months.map((key) => {
    const period = index.get(key) as MarginPeriod;
    const grossMarginBase = period.revenueBase - period.costBase;
    return {
      ...period,
      grossMarginBase,
      marginPct: period.revenueBase > 0 ? Math.round((grossMarginBase / period.revenueBase) * 100) : null,
    };
  });
}

function recentMonthKeys(today: string, count: number) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const absolute = year * 12 + (month - 1) - back;
    keys.push(`${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`);
  }
  return keys;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(key: string) {
  const month = Number(key.slice(5, 7));
  return `${MONTH_NAMES[month - 1] || key.slice(5, 7)} ${key.slice(2, 4)}`;
}

/** Anything outside 0-99 is not a margin you can price back from. */
export function normalizeTargetPct(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TARGET_MARGIN_PCT;
  return Math.min(99, Math.max(0, Math.round(parsed)));
}

function recordIsPriced(record: OrderCostRecord) {
  return finiteOrNull(record.amount) !== null
    || finiteOrNull(record.freightAmount) !== null
    || finiteOrNull(record.dutyAmount) !== null
    || finiteOrNull(record.otherAmount) !== null;
}

function finiteOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
