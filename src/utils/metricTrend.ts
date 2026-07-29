import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { buildActivityInsights } from './activityInsights.ts';
import { convertMoney } from './money.ts';
import type { PlanRecord } from './weeklyPlan.ts';
import {
  isBusinessDateInRange,
  isValidBusinessDate,
  sanitizeBusinessDate,
  timestampToLocalDateKey,
  todayDateKey,
} from './safeDate.ts';

/**
 * A direction, not a delta.
 *
 * The activity band already compares this period with the previous one, and one
 * bad week against one good week is weather. What a seller cannot see in that
 * comparison is the thing that actually matters: that the same number has been
 * sliding for a month. This reads several completed periods and will only use
 * the word "falling" when the records support it.
 *
 * Three rules that keep it from crying wolf:
 *
 *   1. The running period never votes. A Wednesday is not a bad week yet, and
 *      including a half-finished period is how a trend line reports a collapse
 *      every Monday morning (the same bug the momentum reading had to fix).
 *   2. Four completed periods minimum. Below that the direction is `unreadable`
 *      and says so rather than guessing.
 *   3. A direction has to clear a dead-band - a streak of three moves the same
 *      way, or a quarter's worth of change between the recent half and the prior
 *      half. Everything else is `steady`, which is usually the truth.
 */

export type TrendUnit = 'count' | 'percent' | 'money' | 'days';
export type TrendDirection = 'rising' | 'falling' | 'steady' | 'unreadable';
export type TrendSentiment = 'good' | 'bad' | 'neutral';

export type TrendPoint = {
  start: string;
  end: string;
  value: number | null;
  /** False for the period still running. Excluded from every judgement. */
  complete: boolean;
};

export type MetricTrend = {
  id: string;
  label: string;
  unit: TrendUnit;
  betterWhen: 'higher' | 'lower';
  points: TrendPoint[];
  latest: number | null;
  previous: number | null;
  direction: TrendDirection;
  /** Completed periods in a row moving the same way, ending at the newest. */
  streak: number;
  /** Recent half against the prior half, as a share. Null when unreadable. */
  changePct: number | null;
  sentiment: TrendSentiment;
  /** True when the direction cleared the dead-band and is worth saying. */
  notable: boolean;
  reading: string;
};

const DAY_MS = 86_400_000;

export const trendRules = {
  /** Completed periods needed before a direction may be named at all. */
  minimumPeriods: 4,
  /** Same-direction moves in a row that make a slide a slide. */
  streakThreshold: 3,
  /** Recent-half against prior-half change that counts on its own. */
  changeThreshold: 0.25,
  /**
   * Counts below this are too small for a percentage to mean anything. One deal
   * opened last week and none this week is a 100% collapse by arithmetic and
   * nothing at all in life; running it as a headline is how a panel teaches
   * people to ignore it. A run of three still counts at any volume, because
   * 3-2-1-0 is a real slide however small the numbers are.
   */
  minimumCountBase: 3,
} as const;

export function buildMetricTrend(input: {
  id: string;
  label: string;
  unit: TrendUnit;
  betterWhen?: 'higher' | 'lower';
  points: TrendPoint[];
}): MetricTrend {
  const betterWhen = input.betterWhen || 'higher';
  const complete = input.points.filter((point) => point.complete && point.value !== null) as (TrendPoint & { value: number })[];

  const latest = complete.length > 0 ? complete[complete.length - 1].value : null;
  const previous = complete.length > 1 ? complete[complete.length - 2].value : null;

  if (complete.length < trendRules.minimumPeriods) {
    return {
      ...input,
      betterWhen,
      latest,
      previous,
      direction: 'unreadable',
      streak: 0,
      changePct: null,
      sentiment: 'neutral',
      notable: false,
      reading: `${input.label}: ${complete.length} complete period${complete.length === 1 ? '' : 's'} recorded. A direction needs ${trendRules.minimumPeriods}.`,
    };
  }

  const values = complete.map((point) => point.value);
  const streak = trailingStreak(values);
  const changePct = halfOverHalfChange(values);

  const risingByStreak = streak >= trendRules.streakThreshold && values[values.length - 1] > values[values.length - 2];
  const fallingByStreak = streak >= trendRules.streakThreshold && values[values.length - 1] < values[values.length - 2];

  // A percentage needs a base worth taking a percentage of.
  const lowVolume = input.unit === 'count'
    && Math.max(mean(values.slice(-2)), mean(values.slice(-4, -2))) < trendRules.minimumCountBase;
  const risingByChange = !lowVolume && changePct !== null && changePct >= trendRules.changeThreshold;
  const fallingByChange = !lowVolume && changePct !== null && changePct <= -trendRules.changeThreshold;

  if (lowVolume && streak < trendRules.streakThreshold) {
    return {
      ...input,
      betterWhen,
      latest,
      previous,
      direction: 'unreadable',
      streak,
      changePct,
      sentiment: 'neutral',
      notable: false,
      reading: `${input.label} runs at ${Math.min(...values)}–${Math.max(...values)} a period. Too few to read a direction from.`,
    };
  }

  const direction: TrendDirection = risingByStreak || risingByChange
    ? 'rising'
    : fallingByStreak || fallingByChange
      ? 'falling'
      : 'steady';

  const notable = direction !== 'steady';
  const sentiment: TrendSentiment = !notable
    ? 'neutral'
    : (direction === 'rising') === (betterWhen === 'higher') ? 'good' : 'bad';

  return {
    ...input,
    betterWhen,
    latest,
    previous,
    direction,
    streak,
    changePct,
    sentiment,
    notable,
    reading: buildReading({
      label: input.label,
      unit: input.unit,
      direction,
      streak,
      changePct,
      latest,
      periods: complete.length,
    }),
  };
}

function buildReading(input: {
  label: string;
  unit: TrendUnit;
  direction: TrendDirection;
  streak: number;
  changePct: number | null;
  latest: number | null;
  periods: number;
}) {
  const value = formatValue(input.latest, input.unit);
  if (input.direction === 'steady') {
    return `${input.label} is holding around ${value} across the last ${input.periods} periods.`;
  }

  const word = input.direction === 'rising' ? 'up' : 'down';
  // A streak is the stronger statement, so it is the one that gets said. The
  // percentage is the fallback for a move that was big without being a run.
  if (input.streak >= trendRules.streakThreshold) {
    return `${input.label} has moved ${word} ${input.streak} periods in a row, now ${value}.`;
  }
  const pct = Math.abs(Math.round((input.changePct || 0) * 100));
  return `${input.label} is ${word} ${pct}% against the periods before it, now ${value}.`;
}

/** Consecutive strictly-monotonic moves at the end of the series. */
function trailingStreak(values: number[]) {
  if (values.length < 2) return 0;
  const rising = values[values.length - 1] > values[values.length - 2];
  let streak = 0;
  for (let index = values.length - 1; index > 0; index -= 1) {
    const moved = rising ? values[index] > values[index - 1] : values[index] < values[index - 1];
    if (!moved) break;
    streak += 1;
  }
  return streak;
}

/**
 * The recent half against the half before it. Two periods a side is enough to
 * stop one exceptional week from setting the direction, and short enough that a
 * real change is not averaged away for a month.
 */
function halfOverHalfChange(values: number[]) {
  if (values.length < 4) return null;
  const recent = mean(values.slice(-2));
  const prior = mean(values.slice(-4, -2));
  if (prior === 0) return null;
  return (recent - prior) / Math.abs(prior);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatValue(value: number | null, unit: TrendUnit) {
  if (value === null) return '—';
  if (unit === 'percent') return `${Math.round(value * 100)}%`;
  if (unit === 'money') return Math.round(value).toLocaleString('en-US');
  if (unit === 'days') return `${Math.round(value)} day${Math.round(value) === 1 ? '' : 's'}`;
  return String(Math.round(value * 10) / 10);
}

/** Monday-anchored weeks, oldest first, ending with the week now running. */
export function buildWeeklyPeriods(weeks: number, today: string) {
  const anchor = mondayOf(today);
  const periods: { start: string; end: string; complete: boolean }[] = [];
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const start = shiftDateKey(anchor, -offset * 7);
    const end = shiftDateKey(start, 6);
    periods.push({ start, end, complete: offset > 0 });
  }
  return periods;
}

/**
 * The standard set of trends for one operator. Every metric here is one the
 * seller controls week to week; a number they cannot move within a week (cash
 * collected, say) would only teach them to ignore the panel.
 */
export function buildOperatorTrends(input: {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  quotes: QuoteRecord[];
  planRecords: PlanRecord[];
  weeks?: number;
  today?: string;
}): MetricTrend[] {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const periods = buildWeeklyPeriods(input.weeks || 8, today);

  const countIn = (dates: string[], start: string, end: string) =>
    dates.filter((date) => isBusinessDateInRange(date, start, end)).length;

  const activityDates = input.activities.map((activity) => sanitizeBusinessDate(activity.activityDate));
  const opportunityDates = input.opportunities.map((opportunity) => timestampToLocalDateKey(opportunity.createdAt));
  const quoteDates = input.quotes.map((quote) => sanitizeBusinessDate(quote.quoteDate));

  return [
    buildMetricTrend({
      id: 'touches',
      label: 'Touches captured',
      unit: 'count',
      points: periods.map((period) => ({
        ...period,
        value: countIn(activityDates, period.start, period.end),
      })),
    }),
    buildMetricTrend({
      id: 'followThrough',
      label: 'Follow-through',
      unit: 'percent',
      points: periods.map((period) => ({
        ...period,
        // Deliberately the same builder the activity band uses rather than a
        // second implementation of the same rate. Two versions of "did you do
        // what you said" would eventually disagree, and the one on this panel
        // would be the one nobody could check.
        value: buildActivityInsights({
          activities: input.activities,
          planRecords: input.planRecords,
          range: { start: period.start, end: period.end },
          today,
        }).followThrough.rate,
      })),
    }),
    buildMetricTrend({
      id: 'newDeals',
      label: 'New deals opened',
      unit: 'count',
      points: periods.map((period) => ({
        ...period,
        value: countIn(opportunityDates, period.start, period.end),
      })),
    }),
    buildMetricTrend({
      id: 'quotes',
      label: 'Quotes issued',
      unit: 'count',
      points: periods.map((period) => ({
        ...period,
        value: countIn(quoteDates, period.start, period.end),
      })),
    }),
    buildMetricTrend({
      id: 'wonValue',
      label: 'Value won',
      unit: 'money',
      points: periods.map((period) => ({
        ...period,
        value: input.opportunityOutcomes
          .filter((outcome) => outcome.outcome === 'Won' && isBusinessDateInRange(outcome.outcomeDate, period.start, period.end))
          .reduce((sum, outcome) => sum + (convertMoney(outcome.finalAmount, outcome.currency) || 0), 0),
      })),
    }),
  ];
}

function mondayOf(dateKey: string) {
  const value = sanitizeBusinessDate(dateKey);
  if (!isValidBusinessDate(value)) return dateKey;
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay();
  return new Date(date.getTime() - ((day + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

function shiftDateKey(dateKey: string, days: number) {
  const base = Date.parse(`${sanitizeBusinessDate(dateKey)}T00:00:00Z`);
  if (Number.isNaN(base)) return dateKey;
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}
