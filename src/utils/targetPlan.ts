import type { ForecastQuarter, QuarterCoverage } from '../domain/commercialKernel/forecast.ts';
import type { CoverageGap } from './coverageMatrix.ts';
import { formatCompactBaseAmount } from './money.ts';
import type { OperatorEconomics } from './operatorProfile.ts';

/**
 * What the number actually asks of you.
 *
 * Coverage answers "am I going to make it". It stops exactly where the useful
 * part starts, because a shortfall expressed in money is not something a person
 * can do on a Tuesday. This turns the same gap into the arithmetic behind it -
 * how much pipeline, how many deals, how many quotes, per week, from here - and
 * does it with the seller's own rates rather than a textbook's.
 *
 * The most valuable line it produces is usually the discouraging one. If your
 * own median deal takes 71 days and the quarter has 40 left, then no deal opened
 * today is this quarter's revenue, and every hour spent prospecting for the
 * current number is an hour not spent on the deals that can still close. A
 * target calculator that cannot say that is a calculator that helps you miss.
 *
 * Nothing here estimates. Every rate comes from `OperatorEconomics`, which
 * returns null below its own minimum sample, and a null rate produces a null
 * requirement and a named entry in `missing` - never a default, never a
 * benchmark, never a number the user cannot trace to their own closed deals.
 */

export type TargetRouteId = 'recover' | 'accelerate' | 'whitespace' | 'open';

export type TargetRoute = {
  id: TargetRouteId;
  label: string;
  detail: string;
  /** Value this route could realistically contribute, where it is knowable. */
  valueBase: number | null;
  href: string;
};

export type TargetPlan = {
  hasTarget: boolean;
  quarter: ForecastQuarter | null;
  target: number;
  committed: number;
  /** Weighted at the probability the evidence still supports, not as declared. */
  supported: number;
  /** Positive means short. */
  gap: number;
  daysLeft: number | null;
  weeksLeft: number | null;
  /** Deals that must actually close Won to cover the gap. */
  winsNeeded: number | null;
  /** Pipeline value the gap implies at your own win rate. */
  pipelineNeededBase: number | null;
  /** That pipeline expressed as a number of deals at your median deal size. */
  dealsNeeded: number | null;
  dealsPerWeek: number | null;
  quotesNeeded: number | null;
  quotesPerWeek: number | null;
  /** Your own median cycle is longer than the quarter has left. */
  tooLateForNewPipeline: boolean;
  routes: TargetRoute[];
  /** Readings the plan needs and does not have, in the user's words. */
  missing: string[];
  reading: string;
};

const EMPTY_PLAN: TargetPlan = {
  hasTarget: false,
  quarter: null,
  target: 0,
  committed: 0,
  supported: 0,
  gap: 0,
  daysLeft: null,
  weeksLeft: null,
  winsNeeded: null,
  pipelineNeededBase: null,
  dealsNeeded: null,
  dealsPerWeek: null,
  quotesNeeded: null,
  quotesPerWeek: null,
  tooLateForNewPipeline: false,
  routes: [],
  missing: [],
  reading: 'Set a quarterly target and Memoire can work backwards from it to what this week has to contain.',
};

export function buildTargetPlan(input: {
  /** The quarter now running, from the coverage report. */
  quarter: QuarterCoverage | undefined;
  economics: OperatorEconomics;
  /** Value already declared that the evidence no longer supports. */
  unsupportedValueBase?: number;
  unsupportedDealCount?: number;
  /** Customers who already buy and carry only part of the range. */
  whitespace?: CoverageGap[];
}): TargetPlan {
  const quarter = input.quarter;
  if (!quarter || quarter.target <= 0) return EMPTY_PLAN;

  const { winRate, medianDealValueBase, medianCycleDays, quoteToWinRate } = input.economics;
  const gap = quarter.gap;
  const daysLeft = quarter.daysLeft;
  const weeksLeft = daysLeft === null ? null : Math.max(Math.ceil(daysLeft / 7), 1);

  const missing: string[] = [];
  if (winRate === null) missing.push('your win rate');
  if (medianDealValueBase === null) missing.push('your typical deal size');
  if (medianCycleDays === null) missing.push('your sales cycle');
  if (quoteToWinRate === null) missing.push('how often a quote of yours converts');

  const short = gap > 0;
  const winsNeeded = short && medianDealValueBase ? Math.ceil(gap / medianDealValueBase) : short ? null : 0;
  const pipelineNeededBase = short && winRate ? gap / winRate : short ? null : 0;
  const dealsNeeded = pipelineNeededBase !== null && medianDealValueBase
    ? Math.ceil(pipelineNeededBase / medianDealValueBase)
    : short ? null : 0;
  const quotesNeeded = winsNeeded !== null && quoteToWinRate
    ? Math.ceil(winsNeeded / quoteToWinRate)
    : short ? null : 0;

  const perWeek = (total: number | null) => (
    total === null || weeksLeft === null ? null : Math.round((total / weeksLeft) * 10) / 10
  );

  // The whole point of holding the cycle: new pipeline that cannot close inside
  // the quarter is next quarter's work, however much of it you open this week.
  const tooLateForNewPipeline = short
    && medianCycleDays !== null
    && daysLeft !== null
    && medianCycleDays > daysLeft;

  return {
    hasTarget: true,
    quarter: quarter.quarter,
    target: quarter.target,
    committed: quarter.committed,
    supported: quarter.weightedSupported,
    gap,
    daysLeft,
    weeksLeft,
    winsNeeded,
    pipelineNeededBase,
    dealsNeeded,
    dealsPerWeek: perWeek(dealsNeeded),
    quotesNeeded,
    quotesPerWeek: perWeek(quotesNeeded),
    tooLateForNewPipeline,
    routes: buildRoutes({
      short,
      tooLateForNewPipeline,
      unsupportedValueBase: input.unsupportedValueBase || 0,
      unsupportedDealCount: input.unsupportedDealCount || 0,
      openPipeline: quarter.openPipeline,
      whitespace: input.whitespace || [],
      medianCycleDays,
      daysLeft,
    }),
    missing,
    reading: buildReading({
      short,
      gap,
      daysLeft,
      weeksLeft,
      dealsNeeded,
      dealsPerWeek: perWeek(dealsNeeded),
      tooLateForNewPipeline,
      medianCycleDays,
      missing,
      coverage: quarter.coverage,
    }),
  };
}

function buildRoutes(input: {
  short: boolean;
  tooLateForNewPipeline: boolean;
  unsupportedValueBase: number;
  unsupportedDealCount: number;
  openPipeline: number;
  whitespace: CoverageGap[];
  medianCycleDays: number | null;
  daysLeft: number | null;
}): TargetRoute[] {
  if (!input.short) return [];
  const routes: TargetRoute[] = [];

  // Ordered by how fast the money can arrive, not by how much of it there is.
  // Value you have already claimed is the cheapest to recover, because the deal
  // exists and only its evidence has gone missing.
  if (input.unsupportedValueBase > 0) {
    routes.push({
      id: 'recover',
      label: 'Put the evidence back under what you already forecast',
      detail: `${input.unsupportedDealCount} deal${input.unsupportedDealCount === 1 ? '' : 's'} in this quarter are counted at a probability the records no longer support. That is forecast you already have, waiting on a touch.`,
      valueBase: input.unsupportedValueBase,
      href: '/app/opportunities?filter=needsAction',
    });
  }

  if (input.openPipeline > 0) {
    routes.push({
      id: 'accelerate',
      label: 'Move what is already in the quarter',
      detail: input.tooLateForNewPipeline
        ? 'On your own cycle, this is the only pipeline that can still close in time. Everything opened from here is next quarter.'
        : 'Deals already landing in this quarter, ranked by what is stuck.',
      valueBase: input.openPipeline,
      href: '/app/opportunities',
    });
  }

  if (input.whitespace.length > 0) {
    const lines = input.whitespace.reduce((sum, gap) => sum + gap.missingBrands.length, 0);
    routes.push({
      id: 'whitespace',
      label: 'The shortest new conversations you have',
      detail: `${input.whitespace.length} customer${input.whitespace.length === 1 ? '' : 's'} who already buy from you have never been offered ${lines} of your lines. A line missing at a customer who trusts you is a shorter conversation than a new logo.`,
      valueBase: null,
      href: '/app/vault',
    });
  }

  if (!input.tooLateForNewPipeline) {
    routes.push({
      id: 'open',
      label: 'Open new deals',
      detail: input.medianCycleDays !== null && input.daysLeft !== null
        ? `Your median deal takes ${Math.round(input.medianCycleDays)} days and the quarter has ${input.daysLeft} left, so a deal opened now can still land.`
        : 'New pipeline, at the weekly rate above.',
      valueBase: null,
      href: '/app/capture?mode=quick',
    });
  }

  return routes;
}

function buildReading(input: {
  short: boolean;
  gap: number;
  daysLeft: number | null;
  weeksLeft: number | null;
  dealsNeeded: number | null;
  dealsPerWeek: number | null;
  tooLateForNewPipeline: boolean;
  medianCycleDays: number | null;
  missing: string[];
  coverage: number | null;
}) {
  if (!input.short) {
    const pct = input.coverage === null ? null : Math.round(input.coverage * 100);
    return pct === null
      ? 'The quarter is covered by what is already committed and supported.'
      : `The quarter is covered: ${pct}% of target between what is won and what the evidence still supports.`;
  }

  const parts: string[] = [];
  parts.push(`Short by ${formatMoney(input.gap)}${input.daysLeft === null ? '' : ` with ${input.daysLeft} days left`}.`);

  if (input.dealsNeeded !== null && input.dealsPerWeek !== null) {
    parts.push(`On your own win rate and deal size that is ${input.dealsNeeded} more deal${input.dealsNeeded === 1 ? '' : 's'} in play - about ${input.dealsPerWeek} a week from here.`);
  } else if (input.missing.length > 0) {
    parts.push(`Memoire cannot turn that into a weekly number yet: it still needs ${joinWords(input.missing)}. Record the outcome of the deals you close and it fills in.`);
  }

  if (input.tooLateForNewPipeline && input.medianCycleDays !== null && input.daysLeft !== null) {
    parts.push(`Your median deal takes ${Math.round(input.medianCycleDays)} days and only ${input.daysLeft} remain, so new pipeline opened now belongs to next quarter. This quarter has to come out of what is already in it.`);
  }

  return parts.join(' ');
}

/** "a, b and c". Exported so the panel lists the same gaps the same way. */
export function joinWords(values: string[]) {
  if (values.length <= 1) return values[0] || '';
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/** Currency-labelled, for the same reason the profile's readings are. */
function formatMoney(value: number) {
  return formatCompactBaseAmount(value);
}
