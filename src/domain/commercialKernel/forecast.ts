import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { ResolvedThread } from './deriveThreads.ts';
import { convertMoney, BASE_CURRENCY, type SupportedCurrency } from '../../utils/money.ts';

/**
 * Forecast coverage: "am I going to make the number, and is there still time?"
 *
 * A control tower that cannot answer this is a log, not a tower. Memoire could
 * say what was going silent deal by deal and had nothing to say about the
 * quarter as a whole - which is the question a seller is actually judged on.
 *
 * Two deliberate departures from how a spreadsheet does this.
 *
 * First, nothing new has to be typed. Opportunities already carry
 * `quarterValues` and `pipelineProbability` from the CSV import, and until now
 * no surface read either of them: 122 opportunities in a real workspace held a
 * full quarter split that the product simply ignored. Coverage reads what is
 * already there and falls back to stage defaults where it is missing.
 *
 * Second, and the part a spreadsheet cannot do: a declared probability is a
 * claim, and Memoire knows whether the claim is still supported. A deal marked
 * 90% that nobody has touched in six weeks, with no open commitment and no
 * stage evidence, is not 90%. Coverage therefore reports two numbers side by
 * side - what you have declared, and what the evidence still supports - and the
 * gap between them is the honest part of the forecast conversation.
 */

export const FORECAST_QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
export type ForecastQuarter = (typeof FORECAST_QUARTERS)[number];

/**
 * Stage defaults, used only when an opportunity carries no probability of its
 * own. Conservative on purpose: a forecast that starts optimistic and has to be
 * argued down is worse than one that has to be argued up.
 */
const STAGE_PROBABILITY: Record<string, number> = {
  lead: 10,
  discovery: 10,
  qualification: 25,
  qualified: 25,
  'technical discussion': 40,
  demo: 40,
  proposal: 50,
  negotiation: 75,
  procurement: 75,
  won: 100,
  lost: 0,
  'on hold': 10,
  paused: 10,
  archived: 0,
};

export function declaredProbability(opportunity: CrmLiteOpportunity): number {
  if (opportunity.status === 'Won') return 100;
  if (opportunity.status === 'Lost') return 0;

  const stated = opportunity.pipelineProbability;
  if (typeof stated === 'number' && Number.isFinite(stated)) {
    return Math.min(100, Math.max(0, stated));
  }
  return STAGE_PROBABILITY[opportunity.stage.trim().toLowerCase()] ?? 10;
}

/** Why a declared probability was marked down, in the user's words. */
export type ProbabilityPenalty = {
  reason: string;
  /** Multiplier applied, e.g. 0.7 means "cut by 30%". */
  factor: number;
};

export const evidenceThresholds = {
  /** Days of silence before a declared probability stops being believable. */
  silentDays: 21,
  /** Days of silence at which it is discounted hardest. */
  longSilentDays: 45,
} as const;

/**
 * Marks a declared probability **down** where the evidence no longer supports
 * it. Never up.
 *
 * The asymmetry is the whole point. A machine may tell you your forecast is
 * softer than you think; it may not tell you a deal is better than you think,
 * because the seller is the one holding the evidence for optimism. Raising a
 * number automatically would also make the feature impossible to trust in a
 * review - the one place it has to survive being questioned.
 */
export function evidenceAdjustedProbability(
  opportunity: CrmLiteOpportunity,
  thread: ResolvedThread | undefined,
  thresholds = evidenceThresholds,
): { probability: number; declared: number; penalties: ProbabilityPenalty[] } {
  const declared = declaredProbability(opportunity);
  const penalties: ProbabilityPenalty[] = [];

  // A closed deal is a fact, not a forecast.
  if (opportunity.status !== 'Active') {
    return { probability: declared, declared, penalties };
  }

  const quiet = thread?.daysSinceActivity ?? null;
  if (quiet !== null && quiet >= thresholds.longSilentDays) {
    penalties.push({ reason: `No contact for ${quiet} days`, factor: 0.5 });
  } else if (quiet !== null && quiet >= thresholds.silentDays) {
    penalties.push({ reason: `No contact for ${quiet} days`, factor: 0.75 });
  }

  if (thread && thread.openCommitmentCount === 0) {
    penalties.push({ reason: 'No open commitment to move it', factor: 0.8 });
  }

  if (!opportunity.evidence?.trim()) {
    penalties.push({ reason: 'No recorded evidence for this stage', factor: 0.8 });
  }

  const probability = penalties.reduce(
    (value, penalty) => value * penalty.factor,
    declared,
  );

  return { probability: Math.round(probability), declared, penalties };
}

/**
 * The amount an opportunity places in each quarter, in the base currency.
 *
 * Uses the imported quarter split when there is one, because that is the
 * seller's own judgement about when the money lands. Falls back to putting the
 * whole value in the quarter named by `expectedClosePeriod`, and finally to the
 * current quarter - never silently dropping an opportunity out of the forecast
 * just because its dating is untidy.
 */
export function quarterAmounts(
  opportunity: CrmLiteOpportunity,
  currentQuarter: ForecastQuarter,
): Record<ForecastQuarter, number> {
  const currency = (opportunity.currency || BASE_CURRENCY) as SupportedCurrency;
  // An unrecognised currency converts to null. Treating that as zero would drop
  // the opportunity out of the forecast silently, so it is carried at face
  // value instead - visibly wrong beats invisibly missing.
  const toBase = (value: number) => convertMoney(value, currency, BASE_CURRENCY) ?? value;

  const split = opportunity.quarterValues;
  const result = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 } as Record<ForecastQuarter, number>;
  let placed = false;

  if (split && typeof split === 'object') {
    for (const quarter of FORECAST_QUARTERS) {
      const raw = (split as Record<string, unknown>)[quarter];
      // The imported split stores an explicit null for an empty quarter, and
      // Number(null) is 0 rather than NaN - so nulls have to be skipped before
      // the finite check, or every blank quarter would read as a real zero.
      if (raw === null || raw === undefined || raw === '') continue;
      const amount = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(amount) && amount !== 0) {
        result[quarter] = toBase(amount);
        placed = true;
      }
    }
  }

  if (placed) return result;

  const total = opportunity.fy26Value ?? opportunity.estimatedValue ?? 0;
  if (!total) return result;

  result[quarterFromPeriodLabel(opportunity.expectedClosePeriod) || currentQuarter] = toBase(total);
  return result;
}

/** Reads "Q3", "Q3 FY26", "2026-Q2" and similar. Null when there is no quarter in it. */
export function quarterFromPeriodLabel(label?: string | null): ForecastQuarter | null {
  if (!label) return null;
  const match = /q\s*([1-4])/i.exec(label);
  return match ? (`Q${match[1]}` as ForecastQuarter) : null;
}

/**
 * The quarter a date falls in, given the month the fiscal year starts.
 * Defaults to a calendar year; a company running April-March passes 4.
 */
export function quarterForDate(date: Date, fiscalYearStartMonth = 1): ForecastQuarter {
  const month = date.getMonth() + 1;
  const offset = (month - fiscalYearStartMonth + 12) % 12;
  return FORECAST_QUARTERS[Math.floor(offset / 3)];
}

/** Days remaining in the quarter that `date` falls in. */
export function daysLeftInQuarter(date: Date, fiscalYearStartMonth = 1): number {
  const month = date.getMonth() + 1;
  const offset = (month - fiscalYearStartMonth + 12) % 12;
  const quarterIndex = Math.floor(offset / 3);
  const startMonthOffset = quarterIndex * 3;

  // Walk forward to the first day of the following quarter.
  const monthsIntoQuarter = offset - startMonthOffset;
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + (3 - monthsIntoQuarter), 1));
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.max(0, Math.round((end.getTime() - today) / 86_400_000));
}

export type ForecastTarget = {
  quarter: ForecastQuarter;
  amount: number;
};

export type QuarterCoverage = {
  quarter: ForecastQuarter;
  isCurrent: boolean;
  /** Days remaining. Null for a quarter that is not the current one. */
  daysLeft: number | null;
  target: number;
  /** Already won. */
  committed: number;
  /** Open pipeline at full value, unweighted. */
  openPipeline: number;
  /** Weighted at the probability the seller declared. */
  weightedDeclared: number;
  /** Weighted at the probability the evidence still supports. */
  weightedSupported: number;
  /** target - committed - weightedSupported. Positive means short. */
  gap: number;
  /** committed + weightedSupported, over target. Null when no target is set. */
  coverage: number | null;
  opportunityCount: number;
};

export type CoverageReport = {
  quarters: QuarterCoverage[];
  currentQuarter: ForecastQuarter;
  hasTargets: boolean;
  /**
   * How much weighted value the declared numbers claim but the evidence does
   * not support, across the whole year. The honest part of the conversation.
   */
  unsupportedValue: number;
  /** Deals contributing most of that gap, worst first. */
  unsupportedDeals: {
    opportunityId: string;
    accountName: string;
    opportunityName: string;
    declared: number;
    supported: number;
    valueAtRisk: number;
    reasons: string[];
  }[];
};

export function buildCoverage(input: {
  opportunities: CrmLiteOpportunity[];
  threads: ResolvedThread[];
  targets: ForecastTarget[];
  today?: Date;
  fiscalYearStartMonth?: number;
  includeSampleRecords?: boolean;
}): CoverageReport {
  const today = input.today || new Date();
  const fiscalStart = input.fiscalYearStartMonth || 1;
  const currentQuarter = quarterForDate(today, fiscalStart);
  const includeSamples = input.includeSampleRecords === true;

  const threadByOpportunity = new Map<string, ResolvedThread>();
  for (const thread of input.threads) {
    if (thread.opportunityId) threadByOpportunity.set(thread.opportunityId, thread);
  }

  const targetByQuarter = new Map<ForecastQuarter, number>();
  for (const target of input.targets) targetByQuarter.set(target.quarter, target.amount);

  const blank = () => ({
    committed: 0, openPipeline: 0, weightedDeclared: 0, weightedSupported: 0, count: 0,
  });
  const totals: Record<ForecastQuarter, ReturnType<typeof blank>> = {
    Q1: blank(), Q2: blank(), Q3: blank(), Q4: blank(),
  };

  const unsupportedDeals: CoverageReport['unsupportedDeals'] = [];
  let unsupportedValue = 0;

  for (const opportunity of input.opportunities) {
    if (!includeSamples && opportunity.isSample) continue;
    if (opportunity.status === 'Lost') continue;

    const amounts = quarterAmounts(opportunity, currentQuarter);
    const total = FORECAST_QUARTERS.reduce((sum, quarter) => sum + amounts[quarter], 0);
    if (total === 0) continue;

    const { probability, declared, penalties } = evidenceAdjustedProbability(
      opportunity,
      threadByOpportunity.get(opportunity.id),
    );

    for (const quarter of FORECAST_QUARTERS) {
      const amount = amounts[quarter];
      if (amount === 0) continue;

      const bucket = totals[quarter];
      bucket.count += 1;

      if (opportunity.status === 'Won') {
        bucket.committed += amount;
        continue;
      }

      bucket.openPipeline += amount;
      bucket.weightedDeclared += amount * (declared / 100);
      bucket.weightedSupported += amount * (probability / 100);
    }

    if (opportunity.status === 'Active' && penalties.length > 0 && probability < declared) {
      const atRisk = total * ((declared - probability) / 100);
      unsupportedValue += atRisk;
      unsupportedDeals.push({
        opportunityId: opportunity.id,
        accountName: opportunity.accountName,
        opportunityName: opportunity.opportunityName,
        declared,
        supported: probability,
        valueAtRisk: atRisk,
        reasons: penalties.map((penalty) => penalty.reason),
      });
    }
  }

  const quarters: QuarterCoverage[] = FORECAST_QUARTERS.map((quarter) => {
    const bucket = totals[quarter];
    const target = targetByQuarter.get(quarter) ?? 0;
    const isCurrent = quarter === currentQuarter;
    const forecast = bucket.committed + bucket.weightedSupported;

    return {
      quarter,
      isCurrent,
      daysLeft: isCurrent ? daysLeftInQuarter(today, fiscalStart) : null,
      target,
      committed: bucket.committed,
      openPipeline: bucket.openPipeline,
      weightedDeclared: bucket.weightedDeclared,
      weightedSupported: bucket.weightedSupported,
      gap: target > 0 ? target - forecast : 0,
      coverage: target > 0 ? forecast / target : null,
      opportunityCount: bucket.count,
    };
  });

  return {
    quarters,
    currentQuarter,
    hasTargets: targetByQuarter.size > 0,
    unsupportedValue,
    unsupportedDeals: unsupportedDeals
      .sort((left, right) => right.valueAtRisk - left.valueAtRisk)
      .slice(0, 8),
  };
}
