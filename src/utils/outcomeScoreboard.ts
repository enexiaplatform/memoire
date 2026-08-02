import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { FORECAST_QUARTERS, quarterForDate, daysLeftInQuarter, type ForecastQuarter } from '../domain/commercialKernel/forecast.ts';
import { sumMoneyInBase } from './money.ts';
import { isValidBusinessDate, timestampToLocalDateKey, todayDateKey } from './safeDate.ts';

/**
 * The scoreboard: what last week and last month actually produced, against the
 * quarter and the year you are measured on.
 *
 * Review had everything except this. It opened on a list of threads at risk -
 * which is next week's work, and Today's job - then a commitment ledger, then
 * an activity recap counting calls and meetings. All of that answers "what did
 * I do". None of it answers the question somebody opens a review to ask: did
 * the period produce anything, and does the year still add up?
 *
 * Three deliberate choices about honesty.
 *
 * First, a period's result is what *closed* in it, dated by the outcome record,
 * not what the pipeline says it might be worth. A review that grades itself on
 * forecast is a review that can be passed by editing a probability.
 *
 * Second, the projection is arithmetic anyone can check - the rate achieved so
 * far in the quarter, carried to the end of it - and it is labelled as a pace,
 * never as a forecast. A cleverer model would be harder to argue with, which is
 * the opposite of what a number in a review needs to be.
 *
 * Third, with no target set there is no scoreboard, and it says so rather than
 * inventing one. "You won 320M" is a fact with no verdict attached; the verdict
 * is what the operator came for, and it needs a number they committed to.
 */

export type ScoreboardPeriodKind = 'week' | 'month';

export type ScoreboardRange = {
  kind: ScoreboardPeriodKind;
  label: string;
  start: string;
  end: string;
};

export type ScoreboardOutcomeTotals = {
  count: number;
  valueBase: number;
};

export type TargetProgress = {
  /** "Q3" or "FY2026". */
  label: string;
  target: number;
  /** Won and dated inside the window, in the base currency. */
  won: number;
  /** target - won. Positive means short. */
  gap: number;
  /** won / target. Null when no target is set. */
  attainment: number | null;
  daysElapsed: number;
  daysLeft: number;
  /**
   * Where the window lands if the rate achieved so far holds. Plain arithmetic,
   * stated as a pace rather than a forecast.
   */
  projected: number;
  /** What is needed per remaining week to close the gap. Zero when clear. */
  requiredPerWeek: number;
  /** Won so far, against where you should be by this point in the window. */
  onTrack: boolean;
};

export type OutcomeScoreboard = {
  period: ScoreboardRange;
  won: ScoreboardOutcomeTotals;
  lost: ScoreboardOutcomeTotals;
  /** Won as a share of everything decided in the period. Null with no decisions. */
  winRate: number | null;
  /** The same period, one week or one month earlier. */
  previousWon: ScoreboardOutcomeTotals;
  movement: {
    quotesSent: number;
    quotesAccepted: number;
    touches: number;
    accountsTouched: number;
    dealsDecided: number;
  };
  quarter: TargetProgress | null;
  year: TargetProgress | null;
  /** One sentence saying where this leaves the year. Never invented. */
  verdict: string;
  hasTargets: boolean;
};

export type ScoreboardTarget = {
  period: ForecastQuarter;
  fiscalYear: number;
  amount: number;
  fiscalYearStartMonth?: number;
};

export type ScoreboardInput = {
  period: ScoreboardRange;
  outcomes: OpportunityOutcomeRecord[];
  quotes: QuoteRecord[];
  activities: SalesActivityRecord[];
  targets: ScoreboardTarget[];
  /** Defaults to today. Injected in tests and when reviewing a past period. */
  today?: string;
  includeSampleRecords?: boolean;
};

export function buildOutcomeScoreboard(input: ScoreboardInput): OutcomeScoreboard {
  const today = input.today || todayDateKey();
  const includeSamples = input.includeSampleRecords !== false;
  const outcomes = input.outcomes.filter((outcome) => includeSamples || !outcome.isSample);

  const inPeriod = outcomes.filter((outcome) => inRange(outcome.outcomeDate, input.period.start, input.period.end));
  const won = totals(inPeriod.filter((outcome) => outcome.outcome === 'Won'));
  const lost = totals(inPeriod.filter((outcome) => outcome.outcome === 'Lost'));

  const previousRange = shiftRange(input.period);
  const previousWon = totals(outcomes.filter((outcome) =>
    outcome.outcome === 'Won' && inRange(outcome.outcomeDate, previousRange.start, previousRange.end)));

  const decided = won.count + lost.count;

  const periodQuotes = input.quotes.filter((quote) =>
    quote.__deleted !== true && inRange(quote.quoteDate, input.period.start, input.period.end));
  const periodActivities = input.activities.filter((activity) =>
    inRange(activity.activityDate, input.period.start, input.period.end));

  const fiscalYearStartMonth = input.targets.find((target) => target.fiscalYearStartMonth)?.fiscalYearStartMonth || 1;
  const todayDate = new Date(`${today}T00:00:00Z`);
  const currentQuarter = quarterForDate(todayDate, fiscalYearStartMonth);
  const fiscalYear = fiscalYearForDate(todayDate, fiscalYearStartMonth);

  const quarterWindow = quarterWindowFor(currentQuarter, fiscalYear, fiscalYearStartMonth);
  const yearWindow = yearWindowFor(fiscalYear, fiscalYearStartMonth);

  const quarterTarget = input.targets
    .filter((target) => target.fiscalYear === fiscalYear && target.period === currentQuarter)
    .reduce((sum, target) => sum + target.amount, 0);
  const yearTarget = input.targets
    .filter((target) => target.fiscalYear === fiscalYear)
    .reduce((sum, target) => sum + target.amount, 0);

  const wonInQuarter = totals(outcomes.filter((outcome) =>
    outcome.outcome === 'Won' && inRange(outcome.outcomeDate, quarterWindow.start, quarterWindow.end)));
  const wonInYear = totals(outcomes.filter((outcome) =>
    outcome.outcome === 'Won' && inRange(outcome.outcomeDate, yearWindow.start, yearWindow.end)));

  const quarter = quarterTarget > 0
    ? buildProgress({
      label: `${currentQuarter} FY${fiscalYear}`,
      target: quarterTarget,
      won: wonInQuarter.valueBase,
      start: quarterWindow.start,
      end: quarterWindow.end,
      today,
      daysLeftOverride: daysLeftInQuarter(todayDate, fiscalYearStartMonth),
    })
    : null;

  const year = yearTarget > 0
    ? buildProgress({
      label: `FY${fiscalYear}`,
      target: yearTarget,
      won: wonInYear.valueBase,
      start: yearWindow.start,
      end: yearWindow.end,
      today,
    })
    : null;

  return {
    period: input.period,
    won,
    lost,
    winRate: decided > 0 ? won.count / decided : null,
    previousWon,
    movement: {
      quotesSent: periodQuotes.length,
      quotesAccepted: periodQuotes.filter((quote) => quote.status === 'Accepted').length,
      touches: periodActivities.length,
      accountsTouched: new Set(periodActivities.map((activity) => (activity.accountName || '').trim().toLowerCase()).filter(Boolean)).size,
      dealsDecided: decided,
    },
    quarter,
    year,
    verdict: buildVerdict({ quarter, year, won, period: input.period }),
    hasTargets: quarter !== null || year !== null,
  };
}

function buildProgress(input: {
  label: string;
  target: number;
  won: number;
  start: string;
  end: string;
  today: string;
  daysLeftOverride?: number;
}): TargetProgress {
  const totalDays = Math.max(1, daysBetween(input.start, input.end) + 1);
  const elapsed = Math.min(totalDays, Math.max(0, daysBetween(input.start, input.today) + 1));
  const daysLeft = input.daysLeftOverride ?? Math.max(0, totalDays - elapsed);
  const gap = input.target - input.won;
  const weeksLeft = Math.max(1, daysLeft / 7);

  return {
    label: input.label,
    target: input.target,
    won: input.won,
    gap,
    attainment: input.target > 0 ? input.won / input.target : null,
    daysElapsed: elapsed,
    daysLeft,
    projected: elapsed > 0 ? (input.won / elapsed) * totalDays : 0,
    requiredPerWeek: gap > 0 ? gap / weeksLeft : 0,
    // The pace test everyone applies in their head: are you at least as far
    // through the number as you are through the calendar?
    onTrack: input.target > 0 && input.won / input.target >= elapsed / totalDays,
  };
}

function buildVerdict(input: {
  quarter: TargetProgress | null;
  year: TargetProgress | null;
  won: ScoreboardOutcomeTotals;
  period: ScoreboardRange;
}): string {
  const periodWord = input.period.kind === 'week' ? 'week' : 'month';

  if (!input.quarter && !input.year) {
    return input.won.count > 0
      ? `You closed ${input.won.count} deal${input.won.count === 1 ? '' : 's'} this ${periodWord}. Set a quarterly target and this becomes a score rather than a number.`
      : `Nothing closed this ${periodWord}. Set a quarterly target and this page can tell you whether that matters.`;
  }

  const window = input.quarter || (input.year as TargetProgress);
  const percent = Math.round((window.attainment || 0) * 100);
  const projectedPercent = window.target > 0 ? Math.round((window.projected / window.target) * 100) : 0;

  if (window.gap <= 0) {
    return `${window.label} is covered at ${percent}% with ${window.daysLeft} day${window.daysLeft === 1 ? '' : 's'} left. What closes from here is upside.`;
  }

  if (window.daysLeft <= 0) {
    return `${window.label} closed at ${percent}% of target. That number is now history - the next one starts today.`;
  }

  return `${window.label} is at ${percent}% with ${window.daysLeft} day${window.daysLeft === 1 ? '' : 's'} left. At this quarter's rate you land at ${projectedPercent}%.`;
}

function totals(records: OpportunityOutcomeRecord[]): ScoreboardOutcomeTotals {
  return {
    count: records.length,
    valueBase: sumMoneyInBase(records.map((record) => ({
      amount: typeof record.finalAmount === 'number' ? record.finalAmount : 0,
      currency: record.currency || 'VND',
    }))),
  };
}

function inRange(value: unknown, start: string, end: string): boolean {
  const date = isValidBusinessDate(value) ? value : timestampToLocalDateKey(value);
  if (!isValidBusinessDate(date)) return false;
  return date >= start && date <= end;
}

/** The same window, one period earlier. Used for the "vs last" comparison. */
function shiftRange(range: ScoreboardRange): { start: string; end: string } {
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);

  if (range.kind === 'week') {
    start.setUTCDate(start.getUTCDate() - 7);
    end.setUTCDate(end.getUTCDate() - 7);
    return { start: dateKey(start), end: dateKey(end) };
  }

  const previousMonthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const previousMonthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
  return { start: dateKey(previousMonthStart), end: dateKey(previousMonthEnd) };
}

function quarterWindowFor(quarter: ForecastQuarter, fiscalYear: number, fiscalYearStartMonth: number) {
  const index = FORECAST_QUARTERS.indexOf(quarter);
  const startMonth = fiscalYearStartMonth - 1 + index * 3;
  const start = new Date(Date.UTC(fiscalYear, startMonth, 1));
  const end = new Date(Date.UTC(fiscalYear, startMonth + 3, 0));
  return { start: dateKey(start), end: dateKey(end) };
}

function yearWindowFor(fiscalYear: number, fiscalYearStartMonth: number) {
  const start = new Date(Date.UTC(fiscalYear, fiscalYearStartMonth - 1, 1));
  const end = new Date(Date.UTC(fiscalYear, fiscalYearStartMonth + 11, 0));
  return { start: dateKey(start), end: dateKey(end) };
}

/**
 * The fiscal year a date belongs to. For a company running April-March, January
 * 2027 is still FY2026 - so the year target does not reset three months early.
 */
function fiscalYearForDate(date: Date, fiscalYearStartMonth: number): number {
  const month = date.getUTCMonth() + 1;
  return month >= fiscalYearStartMonth ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
