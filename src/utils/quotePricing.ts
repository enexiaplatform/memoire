import { hasExchangeRate, sumMoneyInBase, type SupportedCurrency } from './money.ts';
import { getReportingCurrency } from './money.ts';
import { weightedCreditDays, type PaymentInstallment } from './paymentTerms.ts';

/**
 * What to charge, worked out before the number is sent to the customer.
 *
 * Cost analysis shipped pointed the wrong way down the timeline. It priced
 * *committed orders* - it could tell an operator that the deal they closed last
 * month kept 11% against a 20% target, which is a true, useful and completely
 * unactionable sentence. The order is signed. The price is the price. The only
 * thing left to do with that finding is feel bad about it.
 *
 * The founder's correction was that this belongs at the moment of quoting, and
 * they are right in a way that changes what the model has to compute. A margin
 * report looks backwards and needs only cost and revenue. A pricing tool looks
 * forwards and has to answer the question the seller is actually holding: *what
 * do I have to charge*, given what this costs me and what I am about to promise
 * about payment.
 *
 * ## Why payment terms belong in a cost model
 *
 * This is the other half of the correction and it is the part that is easy to
 * get wrong. When a distributor gives a customer 60 days to pay, they have not
 * given away a scheduling convenience - they have made the customer an unsecured
 * loan at their own cost of capital, and in this trade that capital is usually
 * an overdraft with a real rate on it. The money is out the door to the
 * principal, the forwarder and the customs broker long before it comes back from
 * the customer, and the gap is financed.
 *
 * The size of it is not a rounding error. On a 1,000,000,000 VND order at a 12%
 * facility, 60 days of credit costs about 19,700,000 VND - close to two points
 * of margin on a trade that might be working on eight. A seller who discounts 2%
 * to win a deal knows they have discounted. A seller who agrees to "net 60
 * instead of net 30" to win the same deal has usually done the same thing to
 * themselves without noticing, because nothing on the screen ever said so.
 *
 * So the cost of credit is computed from the actual payment schedule and added
 * to the landed cost before the target margin is applied. Two consequences the
 * surfaces are built to show:
 *
 *   1. **The suggested price moves when the terms move.** Terms and price are
 *      one decision, and the seller can see the exchange rate between them.
 *   2. **A day of credit has a price.** `costPerCreditDayBase` is what one more
 *      day costs, so "they want another two weeks" becomes a number rather than
 *      a shrug.
 *
 * The financing figure is deliberately simple interest over the weighted credit
 * period, not a discounted cash flow. A distributor deciding whether to hold
 * their price needs an honest order of magnitude in the room where the decision
 * is made; a model that is right to the dong and understood by nobody would be
 * used by nobody.
 */

/** The overdraft rate to assume when the operator has not stated one. */
export const DEFAULT_FINANCING_ANNUAL_RATE_PCT = 10;

/**
 * The stages at which a price is actually being worked out.
 *
 * The founder asked for the pricing panel to appear "khi được tick Quotation".
 * This product's stage list has no Quotation - the quoting stages are Proposal,
 * Negotiation and Procurement - so those three are the test.
 */
const QUOTING_STAGES = new Set(['Proposal', 'Negotiation', 'Procurement']);

/**
 * Whether this deal is far enough along to be priced.
 *
 * Takes the shapes it needs rather than the store types, so the pricing model
 * stays free of anything that reaches a database. A deal with a quote already
 * raised against it counts whatever its stage says: the stage is the field
 * people forget to move, and the quote is proof the pricing has begun.
 */
export function isQuotingStage(
  opportunity: { stage?: string; status?: string },
  quoteCount: number,
): boolean {
  if (quoteCount > 0) return true;
  if (opportunity?.status === 'Won') return true;
  return QUOTING_STAGES.has(opportunity?.stage ?? '');
}

/** Interest is worked out over a 365-day year, the basis a facility quotes. */
const DAYS_PER_YEAR = 365;

export type PricingCostInput = {
  /** What the goods cost, in the currency they were bought in. */
  goodsAmount: number | null;
  goodsCurrency: string;
  freightAmount: number | null;
  dutyAmount: number | null;
  otherAmount: number | null;
  /** Extras are usually paid locally even when the goods are not. */
  extrasCurrency: string;
};

export type QuotePricing = {
  reportingCurrency: SupportedCurrency;
  /** True once any part of the buy side has been entered. */
  hasCost: boolean;
  /**
   * The buy side was entered in a currency nobody has priced, so the cost is
   * zero here for want of a rate rather than because the goods were free.
   *
   * `hasCost` was the guard for "unknown is not a pass", and it did not catch
   * this: the operator *did* enter a cost, so `hasCost` was true, and
   * `sumMoneyInBase` still returned zero because it will not invent a rate.
   * Everything downstream then read a free order - `landedCostBase` 0, margin
   * the whole of the price, `meetsTarget` true, and `headroomBase` the entire
   * proposed price, which on this screen means "you have this much room to
   * discount". Not a hidden fact: advice to give money away, on a deal whose
   * cost the product could not read.
   *
   * A distributor buying from a supplier outside the twenty-one shipped rates
   * reaches this by picking their supplier's currency, which the picker offers.
   */
  costUnavailable: boolean;
  goodsBase: number;
  extrasBase: number;
  /** Goods plus extras. What the order costs before anyone waits to be paid. */
  landedCostBase: number;

  /** Days of credit this schedule grants, weighted by the share of each slice. */
  creditDays: number;
  financingRatePct: number;
  /**
   * What carrying the receivable costs over that period. Zero on terms paid up
   * front - and that is the number a deposit is really worth.
   */
  financingCostBase: number;
  /** Landed cost plus the cost of waiting. What the order truly costs. */
  trueCostBase: number;

  targetPct: number;
  /** The price that hits the target margin on the true cost. */
  suggestedPriceBase: number;
  /** The price that would hit it if the customer paid on the day. */
  priceIfPaidImmediatelyBase: number;
  /**
   * What one more day of credit adds to the *price*, at the target margin. The
   * exchange rate between "can we have another two weeks" and money.
   */
  costPerCreditDayBase: number;
  /**
   * What one more day of credit costs in interest alone, before the margin is
   * put back on top.
   *
   * Both numbers are correct and they are not the same number, which is the
   * problem this field solves. A reviewer reading "cost of credit 2.5M over
   * 45.5 days" next to "one more day costs 68.5K" divides the first pair, gets
   * 54.9K, and concludes one of the tiles is wrong - because nothing on the
   * card said one was interest and the other was price. Now the tile can show
   * its own working.
   */
  interestPerCreditDayBase: number;

  /** Everything below is null until a price is actually proposed. */
  proposedPriceBase: number | null;
  /** Proposed price minus landed cost. The margin the old model reported. */
  grossMarginBase: number | null;
  grossMarginPct: number | null;
  /** Proposed price minus landed cost minus financing. What is actually kept. */
  netMarginBase: number | null;
  netMarginPct: number | null;
  /** Percentage points the credit terms take off the margin. */
  financingDragPct: number | null;
  meetsTarget: boolean;
  /** How far the proposed price is under what the target needs. Zero when it clears. */
  shortfallBase: number;
  /** Discount room: how far the price could fall and still hit the target. */
  headroomBase: number;
};

export function buildQuotePricing(input: {
  cost: PricingCostInput;
  installments: PaymentInstallment[];
  /** Days between the order and the goods landing. Part of everyone's credit period. */
  deliveryLagDays?: number;
  targetPct: number;
  financingRatePct?: number;
  /** The price on the table, when there is one. */
  proposedPriceBase?: number | null;
}): QuotePricing {
  const reportingCurrency = getReportingCurrency();
  const targetPct = normalizePricingPct(input.targetPct, 20);
  const financingRatePct = normalizeRatePct(input.financingRatePct);

  const goodsAmount = finiteOrNull(input.cost?.goodsAmount);
  const freightAmount = finiteOrNull(input.cost?.freightAmount);
  const dutyAmount = finiteOrNull(input.cost?.dutyAmount);
  const otherAmount = finiteOrNull(input.cost?.otherAmount);
  const hasExtras = freightAmount !== null || dutyAmount !== null || otherAmount !== null;
  const hasCost = goodsAmount !== null || hasExtras;

  const goodsBase = goodsAmount === null
    ? 0
    : sumMoneyInBase([{ amount: goodsAmount, currency: input.cost.goodsCurrency }]);
  const extrasBase = hasExtras
    ? sumMoneyInBase([{
      amount: (freightAmount || 0) + (dutyAmount || 0) + (otherAmount || 0),
      currency: input.cost.extrasCurrency || input.cost.goodsCurrency,
    }])
    : 0;
  const landedCostBase = goodsBase + extrasBase;

  // Asked of the currency rather than inferred from a zero, so a genuinely free
  // line is not confused with one that could not be converted.
  const extrasCurrency = input.cost?.extrasCurrency || input.cost?.goodsCurrency;
  const costUnavailable = (goodsAmount !== null && !hasExchangeRate(input.cost?.goodsCurrency))
    || (hasExtras && !hasExchangeRate(extrasCurrency));

  const creditDays = weightedCreditDays(input.installments || [], {
    deliveryLagDays: Math.max(0, Math.round(input.deliveryLagDays ?? 0)),
  });

  // Interest accrues on the money that is out the door - the landed cost - not
  // on the selling price. Charging the customer's margin to the overdraft would
  // inflate the financing cost by whatever the operator hopes to make, which is
  // both wrong and conveniently self-serving.
  const financingCostBase = landedCostBase * (financingRatePct / 100) * (creditDays / DAYS_PER_YEAR);
  const trueCostBase = landedCostBase + financingCostBase;

  // A 100% target has no price that satisfies it, so the divisor is floored.
  // normalizePricingPct already caps at 99; this is the belt to that brace.
  const marginDivisor = Math.max(0.01, 1 - targetPct / 100);
  const suggestedPriceBase = trueCostBase / marginDivisor;
  const priceIfPaidImmediatelyBase = landedCostBase / marginDivisor;

  const interestPerCreditDayBase = landedCostBase * (financingRatePct / 100) / DAYS_PER_YEAR;
  // Grossed up by the margin: an extra day costs interest, and holding the
  // target means charging for that interest too.
  const costPerCreditDayBase = interestPerCreditDayBase / marginDivisor;

  const proposedPriceBase = finiteOrNull(input.proposedPriceBase);
  const priced = proposedPriceBase !== null && proposedPriceBase > 0;

  // Every margin here is `price - cost`, so a cost of zero from a missing rate
  // makes all of them read as the whole price kept. Withheld rather than
  // computed, the same rule `hasCost` already applies to a cost never entered.
  const canJudge = priced && !costUnavailable;
  const grossMarginBase = canJudge ? proposedPriceBase - landedCostBase : null;
  const netMarginBase = canJudge ? proposedPriceBase - trueCostBase : null;
  const grossMarginPct = canJudge ? roundPct((grossMarginBase as number) / proposedPriceBase) : null;
  const netMarginPct = canJudge ? roundPct((netMarginBase as number) / proposedPriceBase) : null;

  return {
    reportingCurrency,
    hasCost,
    costUnavailable,
    goodsBase,
    extrasBase,
    landedCostBase,
    creditDays,
    financingRatePct,
    financingCostBase,
    trueCostBase,
    targetPct,
    suggestedPriceBase,
    priceIfPaidImmediatelyBase,
    costPerCreditDayBase,
    interestPerCreditDayBase,
    proposedPriceBase: priced ? proposedPriceBase : null,
    grossMarginBase,
    grossMarginPct,
    netMarginBase,
    netMarginPct,
    financingDragPct: priced && grossMarginPct !== null && netMarginPct !== null
      ? roundTo2(grossMarginPct - netMarginPct)
      : null,
    // Unknown is not a pass: an unpriced or uncosted quote never reports that it
    // meets the target, the same rule the order margin model follows.
    meetsTarget: canJudge && hasCost && netMarginPct !== null && netMarginPct >= targetPct,
    shortfallBase: canJudge && hasCost ? Math.max(0, suggestedPriceBase - proposedPriceBase) : 0,
    // Headroom is a recommendation to discount. It must never be derived from a
    // cost the product could not read.
    headroomBase: canJudge && hasCost ? Math.max(0, proposedPriceBase - suggestedPriceBase) : 0,
  };
}

/**
 * What the same order needs to sell for under several sets of terms.
 *
 * The table that makes the trade visible. A seller being pushed from net 30 to
 * net 60 can read what holding the margin would cost the customer, and decide
 * whether to ask for it or concede it deliberately rather than by default.
 */
export type CreditScenario = {
  label: string;
  creditDays: number;
  financingCostBase: number;
  suggestedPriceBase: number;
  /** Extra price needed against paying on the day. */
  premiumBase: number;
  /** The same premium as a share of the immediate-payment price. */
  premiumPct: number;
};

export function buildCreditScenarios(input: {
  landedCostBase: number;
  targetPct: number;
  financingRatePct?: number;
  /** Credit periods to draw. Defaults to the ones this trade actually argues over. */
  creditDayOptions?: number[];
}): CreditScenario[] {
  const targetPct = normalizePricingPct(input.targetPct, 20);
  const financingRatePct = normalizeRatePct(input.financingRatePct);
  const landedCostBase = Number.isFinite(input.landedCostBase) ? Math.max(0, input.landedCostBase) : 0;
  const marginDivisor = Math.max(0.01, 1 - targetPct / 100);
  const immediate = landedCostBase / marginDivisor;

  const options = (input.creditDayOptions && input.creditDayOptions.length > 0
    ? input.creditDayOptions
    : [0, 30, 45, 60, 90])
    .map((days) => Math.max(0, Math.round(days)))
    .filter((days, index, all) => all.indexOf(days) === index)
    .sort((left, right) => left - right);

  return options.map((creditDays) => {
    const financingCostBase = landedCostBase * (financingRatePct / 100) * (creditDays / DAYS_PER_YEAR);
    const suggestedPriceBase = (landedCostBase + financingCostBase) / marginDivisor;
    return {
      label: creditDays === 0 ? 'Paid on the day' : `Net ${creditDays}`,
      creditDays,
      financingCostBase,
      suggestedPriceBase,
      premiumBase: suggestedPriceBase - immediate,
      premiumPct: immediate > 0 ? roundTo2(((suggestedPriceBase - immediate) / immediate) * 100) : 0,
    };
  });
}

/**
 * The sentence a seller can take into the room.
 *
 * Returns an empty string when there is nothing honest to say - an uncosted
 * quote gets silence rather than a confident-sounding non-statement.
 */
export function describePricing(pricing: QuotePricing, formatMoney: (value: number) => string): string {
  if (!pricing.hasCost) return '';

  if (pricing.proposedPriceBase === null) {
    if (pricing.creditDays <= 0) {
      return `Quote ${formatMoney(pricing.suggestedPriceBase)} to keep ${pricing.targetPct}%.`;
    }
    return `Quote ${formatMoney(pricing.suggestedPriceBase)} to keep ${pricing.targetPct}% after `
      + `${pricing.creditDays} days of credit, which costs ${formatMoney(pricing.financingCostBase)} to carry.`;
  }

  if (pricing.meetsTarget) {
    return `Keeps ${pricing.netMarginPct}% after financing, against a ${pricing.targetPct}% target. `
      + `You can go as low as ${formatMoney(pricing.suggestedPriceBase)} and still hit it.`;
  }

  return `Keeps ${pricing.netMarginPct}% after financing, under the ${pricing.targetPct}% target. `
    + `${formatMoney(pricing.shortfallBase)} short - either price at ${formatMoney(pricing.suggestedPriceBase)} `
    + `or shorten the ${pricing.creditDays} days of credit.`;
}

function normalizePricingPct(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(99, Math.max(0, Math.round(parsed)));
}

/**
 * A facility rate, bounded at something a bank could plausibly charge.
 *
 * Capped at 100% rather than left open because this figure multiplies the whole
 * landed cost: a mistyped rate does not produce a slightly odd suggestion, it
 * produces a price nobody would ever quote, and the operator's first assumption
 * would be that the feature is broken.
 */
export function normalizeRatePct(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_FINANCING_ANNUAL_RATE_PCT;
  return Math.min(100, roundTo2(parsed));
}

function roundPct(ratio: number) {
  return Math.round(ratio * 100);
}

function roundTo2(value: number) {
  return Math.round(value * 100) / 100;
}

function finiteOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
