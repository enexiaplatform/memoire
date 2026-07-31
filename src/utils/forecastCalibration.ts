import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { CrmLiteOpportunity, ForecastEvidenceCategory } from '../services/opportunityStore.ts';
import { sumMoneyInBase } from './money.ts';

export const FORECAST_CALIBRATION_MIN_SAMPLE = 3;

export const forecastEvidenceCategoryOrder: ForecastEvidenceCategory[] = [
  'Defensible',
  'Weak but recoverable',
  'Hope-based',
  'Unsupported',
];

export type ForecastCalibrationRow = {
  category: ForecastEvidenceCategory;
  closed: number;
  won: number;
  lost: number;
  stalled: number;
  winRate: number | null;
  sufficientSample: boolean;
  activeDeals: number;
  activePipelineBase: number;
  calibratedValueBase: number | null;
};

export type ForecastCalibrationWarning = {
  id: string;
  message: string;
};

export type ForecastCalibration = {
  totalClosed: number;
  hasEnoughData: boolean;
  rows: ForecastCalibrationRow[];
  warnings: ForecastCalibrationWarning[];
  calibratedPipelineBase: number | null;
  unratedActiveDeals: number;
  headline: string;
};

type ForecastCalibrationInput = {
  outcomes: OpportunityOutcomeRecord[];
  opportunities: CrmLiteOpportunity[];
};

/**
 * Personal forecast calibration: when this seller labels a deal
 * "Defensible", how often do they actually win it? Win rates come only
 * from their own closed outcomes (the pre-outcome evidence category is
 * snapshotted on every outcome record), and are applied to the live
 * pipeline as a calibrated expected value. Below the minimum sample a
 * category stays explicitly unrated - history, not prediction.
 */
export function buildForecastCalibration(input: ForecastCalibrationInput): ForecastCalibration {
  const closedOutcomes = dedupeByOpportunity(input.outcomes);
  const activeOpportunities = input.opportunities.filter((opportunity) => opportunity.status === 'Active');

  const rows = forecastEvidenceCategoryOrder.map((category) => {
    const categoryOutcomes = closedOutcomes.filter((outcome) => outcome.forecastEvidenceCategoryBeforeOutcome === category);
    const won = categoryOutcomes.filter((outcome) => outcome.outcome === 'Won').length;
    const lost = categoryOutcomes.filter((outcome) => outcome.outcome === 'Lost').length;
    const stalled = categoryOutcomes.length - won - lost;
    const sufficientSample = categoryOutcomes.length >= FORECAST_CALIBRATION_MIN_SAMPLE;
    const winRate = categoryOutcomes.length > 0 ? won / categoryOutcomes.length : null;

    const activeInCategory = activeOpportunities.filter((opportunity) => opportunity.forecastEvidenceCategory === category);
    const activePipelineBase = sumBaseValue(activeInCategory);

    return {
      category,
      closed: categoryOutcomes.length,
      won,
      lost,
      stalled,
      winRate,
      sufficientSample,
      activeDeals: activeInCategory.length,
      activePipelineBase,
      calibratedValueBase: sufficientSample && winRate !== null ? activePipelineBase * winRate : null,
    };
  });

  const ratedRows = rows.filter((row) => row.calibratedValueBase !== null);
  const calibratedPipelineBase = ratedRows.length > 0
    ? ratedRows.reduce((total, row) => total + (row.calibratedValueBase || 0), 0)
    : null;
  const unratedActiveDeals = rows
    .filter((row) => row.calibratedValueBase === null)
    .reduce((total, row) => total + row.activeDeals, 0);

  const warnings = buildCalibrationWarnings(rows);
  const totalClosed = closedOutcomes.length;
  const hasEnoughData = totalClosed >= FORECAST_CALIBRATION_MIN_SAMPLE;

  return {
    totalClosed,
    hasEnoughData,
    rows,
    warnings,
    calibratedPipelineBase,
    unratedActiveDeals,
    headline: buildHeadline({ hasEnoughData, totalClosed, rows, warnings }),
  };
}

export function formatWinRate(winRate: number | null) {
  if (winRate === null) return 'No history';
  return `${Math.round(winRate * 100)}%`;
}

/**
 * The bands a declared probability is grouped into. Coarse on purpose: a seller
 * types round numbers, and pretending to distinguish 65% from 70% would be
 * reading precision into a habit.
 */
export const PROBABILITY_BANDS = [
  { id: '0-25', label: 'Up to 25%', min: 0, max: 25 },
  { id: '26-50', label: '26-50%', min: 26, max: 50 },
  { id: '51-75', label: '51-75%', min: 51, max: 75 },
  { id: '76-100', label: 'Over 75%', min: 76, max: 100 },
] as const;

export type ProbabilityCalibrationRow = {
  bandId: string;
  label: string;
  /** The midpoint of what the seller claimed, to compare against reality. */
  claimed: number;
  closed: number;
  won: number;
  actualWinRate: number | null;
  sufficientSample: boolean;
  /** Positive means they won more often than they said. */
  gap: number | null;
  verdict: 'optimistic' | 'pessimistic' | 'calibrated' | 'unrated';
};

export type ProbabilityCalibration = {
  rows: ProbabilityCalibrationRow[];
  totalClosed: number;
  hasEnoughData: boolean;
  headline: string;
};

/**
 * Was the number right?
 *
 * The evidence-category calibration above asks whether a *label* holds up. This
 * asks the blunter question: when this seller wrote 70% on a deal, how often did
 * they actually win it. It is the one number a CRM will not give a solo seller,
 * because a CRM has no reason to hold the seller to what they said.
 *
 * It reads the probability snapshotted on the outcome record. A live deal's
 * probability moves as it progresses, so reading it after the fact would grade
 * the seller against a number they only reached at the end - which would make
 * everyone look perfectly calibrated and the whole exercise worthless.
 */
export function buildProbabilityCalibration(input: {
  outcomes: OpportunityOutcomeRecord[];
}): ProbabilityCalibration {
  const closed = dedupeByOpportunity(input.outcomes)
    .filter((outcome) => outcome.outcome === 'Won' || outcome.outcome === 'Lost')
    .map((outcome) => ({ outcome, probability: outcome.pipelineProbabilityBeforeOutcome }))
    // Deals closed before the probability was snapshotted simply have no
    // answer. Guessing one would fabricate the track record this exists to
    // measure.
    .filter((entry): entry is { outcome: OpportunityOutcomeRecord; probability: number } => (
      typeof entry.probability === 'number'
    ));

  const rows = PROBABILITY_BANDS.map((band) => {
    const inBand = closed.filter((entry) => entry.probability >= band.min && entry.probability <= band.max);
    const won = inBand.filter((entry) => entry.outcome.outcome === 'Won').length;
    const sufficientSample = inBand.length >= FORECAST_CALIBRATION_MIN_SAMPLE;
    const actualWinRate = inBand.length > 0 ? won / inBand.length : null;
    const claimed = (band.min + band.max) / 2;
    const gap = sufficientSample && actualWinRate !== null ? actualWinRate * 100 - claimed : null;

    return {
      bandId: band.id,
      label: band.label,
      claimed,
      closed: inBand.length,
      won,
      actualWinRate,
      sufficientSample,
      gap,
      verdict: verdictFor(gap),
    };
  });

  const totalClosed = closed.length;
  return {
    rows,
    totalClosed,
    hasEnoughData: totalClosed >= FORECAST_CALIBRATION_MIN_SAMPLE,
    headline: buildProbabilityHeadline(rows, totalClosed),
  };
}

/**
 * Ten points either way is noise at these sample sizes. Beyond it, the seller
 * is reliably telling themselves something.
 */
const CALIBRATION_TOLERANCE = 10;

function verdictFor(gap: number | null): ProbabilityCalibrationRow['verdict'] {
  if (gap === null) return 'unrated';
  if (gap < -CALIBRATION_TOLERANCE) return 'optimistic';
  if (gap > CALIBRATION_TOLERANCE) return 'pessimistic';
  return 'calibrated';
}

function buildProbabilityHeadline(rows: ProbabilityCalibrationRow[], totalClosed: number) {
  if (totalClosed < FORECAST_CALIBRATION_MIN_SAMPLE) {
    return `Not enough closed deals with a probability on them yet (${totalClosed}). Set a probability on your deals and record the outcome when they close, and this becomes your own track record.`;
  }

  const worst = rows
    .filter((row) => row.verdict === 'optimistic')
    .sort((left, right) => (left.gap as number) - (right.gap as number))[0];

  if (worst) {
    return `When you said ${worst.label.toLowerCase()}, you won ${formatWinRate(worst.actualWinRate)} of the time (${worst.won} of ${worst.closed}). That band is running about ${Math.abs(Math.round(worst.gap as number))} points optimistic.`;
  }

  const pessimistic = rows
    .filter((row) => row.verdict === 'pessimistic')
    .sort((left, right) => (right.gap as number) - (left.gap as number))[0];

  if (pessimistic) {
    return `Deals you called ${pessimistic.label.toLowerCase()} actually closed ${formatWinRate(pessimistic.actualWinRate)} of the time. You are marking yourself down - the pipeline is worth more than you are forecasting.`;
  }

  return 'Your declared probabilities are holding up against what actually closed. Keep judging deals the same way.';
}

function buildCalibrationWarnings(rows: ForecastCalibrationRow[]): ForecastCalibrationWarning[] {
  const warnings: ForecastCalibrationWarning[] = [];
  const rated = rows.filter((row) => row.sufficientSample && row.winRate !== null);

  // Inversion: a weaker evidence label out-performing a stronger one means
  // the seller's labels do not mean what they think they mean.
  for (let strong = 0; strong < rated.length; strong += 1) {
    for (let weak = strong + 1; weak < rated.length; weak += 1) {
      const strongRow = rated[strong];
      const weakRow = rated[weak];
      if (forecastEvidenceCategoryOrder.indexOf(strongRow.category) < forecastEvidenceCategoryOrder.indexOf(weakRow.category)
        && (weakRow.winRate as number) > (strongRow.winRate as number)) {
        warnings.push({
          id: `inversion-${slugify(strongRow.category)}-${slugify(weakRow.category)}`,
          message: `Your "${weakRow.category}" deals win more often (${formatWinRate(weakRow.winRate)}) than your "${strongRow.category}" deals (${formatWinRate(strongRow.winRate)}). The labels may not match reality - review what evidence you require before calling a deal ${strongRow.category.toLowerCase()}.`,
        });
      }
    }
  }

  const defensible = rated.find((row) => row.category === 'Defensible');
  if (defensible && (defensible.winRate as number) < 0.5) {
    warnings.push({
      id: 'defensible-below-half',
      message: `Deals you called "Defensible" closed Won only ${formatWinRate(defensible.winRate)} of the time (${defensible.won} of ${defensible.closed}). Tighten what counts as defensible evidence before the next review.`,
    });
  }

  return warnings;
}

function buildHeadline(input: {
  hasEnoughData: boolean;
  totalClosed: number;
  rows: ForecastCalibrationRow[];
  warnings: ForecastCalibrationWarning[];
}) {
  if (!input.hasEnoughData) {
    return `Calibration needs at least ${FORECAST_CALIBRATION_MIN_SAMPLE} closed outcomes (you have ${input.totalClosed}). Log outcomes when deals close and this becomes your personal win-rate history.`;
  }
  if (input.warnings.length > 0) {
    return input.warnings[0].message;
  }
  const defensible = input.rows.find((row) => row.category === 'Defensible' && row.sufficientSample);
  if (defensible && defensible.winRate !== null) {
    return `When you call a deal "Defensible", you win ${formatWinRate(defensible.winRate)} of the time (${defensible.won} of ${defensible.closed}). Your labels are holding up - keep requiring the same evidence.`;
  }
  return 'Win-rate history is building per evidence category. Categories below the minimum sample stay unrated.';
}

/** Latest outcome per opportunity wins: re-closed deals should not double count. */
function dedupeByOpportunity(outcomes: OpportunityOutcomeRecord[]) {
  const byOpportunity = new Map<string, OpportunityOutcomeRecord>();
  [...outcomes]
    .sort((a, b) => a.outcomeDate.localeCompare(b.outcomeDate) || a.updatedAt.localeCompare(b.updatedAt))
    .forEach((outcome) => {
      byOpportunity.set(outcome.opportunityId || `${outcome.accountName}|${outcome.opportunityName}`, outcome);
    });
  return Array.from(byOpportunity.values());
}

function sumBaseValue(opportunities: CrmLiteOpportunity[]) {
  return sumMoneyInBase(opportunities.map((opportunity) => ({
    amount: opportunity.estimatedValue ?? opportunity.fy26Value ?? 0,
    currency: opportunity.currency,
  })));
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
