import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { FORECAST_QUARTERS, quarterForDate, daysLeftInQuarter, type ForecastQuarter } from '../domain/commercialKernel/forecast.ts';
import { sumMoneyInBase } from './money.ts';
import { isValidBusinessDate, timestampToLocalDateKey, todayDateKey } from './safeDate.ts';
import { normalizeEntityName } from './accountIdentity.ts';
import { countOutOfOfficeDays, isInPersonChannel } from './activityChannel.ts';
import { summariseCaptureDepth } from './captureDepth.ts';

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
  /**
   * The same period counted twice: once as it happened, and once after the
   * question "of that, how much was real".
   *
   * Every figure on a scoreboard has a soft version and a hard one, and a
   * review that only shows the soft one measures effort while sounding like it
   * measures progress. "Four deals created" is a number anybody can produce in
   * an afternoon; "of which one is qualified" is the number that predicts next
   * quarter. Both are shown, always as a pair, so neither can be read alone.
   *
   * Null when the workspace has no deals to score - an empty pair is not a
   * finding about the period, and drawing "0 of 0 qualified" would read as one.
   */
  quality: ScoreboardQuality | null;
  /** One sentence saying where this leaves the year. Never invented. */
  verdict: string;
  hasTargets: boolean;
};

export type ScoreboardQuality = {
  /** Open deals in the book right now. Not period-bound: a pipeline is a stock, not a flow. */
  activeDeals: number;
  /** Of those, deals clearing the forecast gate with no blocker. */
  qualifiedDeals: number;
  /** Of those, deals with no champion or no economic buyer. */
  blockedDeals: number;
  /** Of those, deals staged above what the evidence supports. */
  overStatedDeals: number;
  /** Touches in the period. */
  touches: number;
  /**
   * Of those, the ones that cost travel - a visit either way, or an event.
   *
   * Counted rather than inferred: only a touch whose channel says so is
   * included, so this rises as the habit of recording it does. It is a floor,
   * never a claim about the rest.
   */
  inPersonTouches: number;
  /** Distinct days in the period marked as not working. Context for a thin week. */
  daysOutOfOffice: number;
  /**
   * Touches that record that something happened without recording what.
   *
   * The other half of `touches`, and the reason a raw touch count is not a
   * measure of anything: a month of "followed up" is a full ledger and an empty
   * memory. Counted, never blocked - see `captureDepth`.
   */
  thinTouches: number;
  /** Median words per touch in the period. Survives one very long note. */
  medianTouchWords: number;
};

export type ScoreboardTarget = {
  period: ForecastQuarter;
  fiscalYear: number;
  amount: number;
  fiscalYearStartMonth?: number;
};

/**
 * A deal closed without anybody writing the retro.
 *
 * The scoreboard counts outcome records, and only the close-out flow writes
 * one - so a pipeline imported from a CRM with its Won and Lost rows, or a deal
 * closed before the retro existed, produced "Nothing closed this week" over a
 * workspace holding a won deal. The Dashboard already refuses to do that, in
 * `bucketClosedDeals`: "a dashboard that reports zero revenue to an operator
 * looking at their own won deals is simply wrong about the business, and it is
 * the kind of wrong that ends trust in every other number on the page."
 *
 * Same rule here, so the two pages cannot disagree: the deal says *what*
 * closed, the retro says *how much* when there is one, and the forecast stands
 * in when there is not. Derived at read time - nothing is written, and the day
 * somebody records the retro their figure takes over.
 */
export function deriveOutcomesFromClosedDeals(
  opportunities: ClosedDealInput[],
  outcomes: OpportunityOutcomeRecord[],
): OpportunityOutcomeRecord[] {
  const recorded = new Set(outcomes.map((outcome) => outcome.opportunityId));
  return opportunities
    .filter((deal) => (deal.status === 'Won' || deal.status === 'Lost') && !recorded.has(deal.id))
    .map((deal) => {
      /**
       * The day the deal actually closed.
       *
       * This used to read `deal.expectedCloseDate` and fall back to
       * `updatedAt`. There is no `expectedCloseDate` on an opportunity - the
       * field is `expectedClosePeriod` - and because the input type declared it
       * optional, TypeScript could not see that the branch was dead. Every
       * derived close date was therefore the day the record was last edited.
       *
       * On the Porto book that meant a scoreboard headed "Closed this week"
       * counting eight deals closed between 6 March and 4 August: their
       * `updated_at` was 23 August 23:24 UTC, which in the operator's own
       * timezone is the 24th, so the whole six months landed inside the week
       * they happened to be edited in. A review exists to say what the week
       * produced, and it was answering with the edit log.
       *
       * `closedOn` is the fact and leads. `expectedClosePeriod` is second and
       * only when it parses as a real date - on a closed deal that is the CRM
       * convention, and it is often "Q3 2026", which is not a day. The record's
       * last edit stays last, because it is the only thing always present.
       */
      const closedOn = isValidBusinessDate(deal.closedOn || '')
        ? String(deal.closedOn)
        : isValidBusinessDate(deal.expectedClosePeriod || '')
          ? String(deal.expectedClosePeriod)
          : timestampToLocalDateKey(deal.updatedAt) || todayDateKey();
      return {
        id: `derived-outcome-${deal.id}`,
        opportunityId: deal.id,
        accountName: deal.accountName || '',
        opportunityName: deal.opportunityName || '',
        outcome: deal.status as OpportunityOutcomeRecord['outcome'],
        outcomeDate: closedOn,
        finalAmount: typeof deal.estimatedValue === 'number' ? deal.estimatedValue : null,
        currency: deal.currency || '',
        forecastEvidenceCategoryBeforeOutcome: deal.forecastEvidenceCategory,
        decisionRecommendationBeforeOutcome: deal.decisionRecommendation,
        stageBeforeOutcome: deal.stage,
        pipelineProbabilityBeforeOutcome: null,
        // Left empty on purpose: this is a close with no reason behind it, and
        // the learning surfaces read `reasonText` to decide what can be learned
        // from. Counting the money must not invent an explanation for it.
        reasonCategory: 'Other' as OpportunityOutcomeRecord['reasonCategory'],
        reasonText: '',
        createdAt: deal.updatedAt || `${closedOn}T00:00:00.000Z`,
        updatedAt: deal.updatedAt || `${closedOn}T00:00:00.000Z`,
        storageMode: 'local' as const,
        ...(deal.isSample ? { isSample: true } : {}),
        ...(deal.source === 'demo' ? { source: 'demo' as const } : {}),
      };
    });
}

type ClosedDealInput = {
  id: string;
  accountName?: string;
  opportunityName?: string;
  status: string;
  stage: OpportunityOutcomeRecord['stageBeforeOutcome'];
  estimatedValue?: number | null;
  currency?: string;
  /** The day it was won or lost, when that is known. See the derivation above. */
  closedOn?: string;
  /** Often a quarter label rather than a day; read only when it is a real date. */
  expectedClosePeriod?: string;
  updatedAt?: string;
  forecastEvidenceCategory: OpportunityOutcomeRecord['forecastEvidenceCategoryBeforeOutcome'];
  decisionRecommendation: OpportunityOutcomeRecord['decisionRecommendationBeforeOutcome'];
  isSample?: boolean;
  source?: string;
};

export type ScoreboardInput = {
  period: ScoreboardRange;
  outcomes: OpportunityOutcomeRecord[];
  quotes: QuoteRecord[];
  activities: SalesActivityRecord[];
  targets: ScoreboardTarget[];
  /**
   * Qualification scores for the open book, keyed by opportunity id. Optional:
   * without them the quality pair is simply absent rather than reported as zero.
   */
  qualification?: Map<string, { backsForecast: boolean; blockers: unknown[]; stageGap: number }>;
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
    quality: buildQuality(input.qualification, periodActivities),
    movement: {
      quotesSent: periodQuotes.length,
      quotesAccepted: periodQuotes.filter((quote) => quote.status === 'Accepted').length,
      touches: periodActivities.length,
      // Counted on the canonical key: a lowercase alone left "CÔNG TY X" and
      // "Cong ty X" as two accounts touched, inflating the one number on this
      // scoreboard that says how much of the book was worked.
      accountsTouched: new Set(periodActivities.map((activity) => normalizeEntityName(activity.accountName || '')).filter(Boolean)).size,
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

/**
 * The hard half of each pair.
 *
 * Deal counts read the whole open book rather than the period, on purpose: a
 * pipeline is a stock and asking "how many qualified deals were created in the
 * last seven days" produces zero most weeks, which says nothing about whether
 * the book is any good.
 */
function buildQuality(
  qualification: ScoreboardInput['qualification'],
  periodActivities: SalesActivityRecord[],
): ScoreboardQuality | null {
  if (!qualification || qualification.size === 0) return null;
  const scores = [...qualification.values()];
  const depth = summariseCaptureDepth(periodActivities);
  return {
    activeDeals: scores.length,
    qualifiedDeals: scores.filter((score) => score.backsForecast).length,
    blockedDeals: scores.filter((score) => score.blockers.length > 0).length,
    overStatedDeals: scores.filter((score) => score.stageGap > 0).length,
    touches: periodActivities.length,
    inPersonTouches: periodActivities.filter((activity) => isInPersonChannel(activity.activityChannel)).length,
    daysOutOfOffice: countOutOfOfficeDays(periodActivities),
    thinTouches: depth.thin,
    medianTouchWords: depth.medianWords,
  };
}
