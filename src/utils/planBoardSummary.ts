import { ACTIVITY_CHANNELS, type ActivityChannel } from './activityChannel.ts';
import type { PlanBoard } from './weeklyPlan';

/**
 * The week summary strip over the plan board: how much of it is done, how the
 * work is spread across kinds of day, and how much of it arrived on its own
 * from the records versus was typed onto a day by hand.
 *
 * Read from the board the page is already drawing, never from a second
 * derivation, so the strip cannot disagree with the columns underneath it.
 */

export const NOT_STATED_CHANNEL = 'Not stated';

export type PlanChannelSlice = {
  channel: ActivityChannel | typeof NOT_STATED_CHANNEL;
  count: number;
};

export type PlanBoardSummary = {
  total: number;
  done: number;
  /** Whole percent done, or null on a period with nothing on it. */
  donePercent: number | null;
  /**
   * Points up or down on the period before, or null when there is nothing to
   * compare - an empty last week is not a baseline of zero.
   */
  deltaPoints: number | null;
  /** Channels in the fixed ACTIVITY_CHANNELS order, unstated last, empty ones dropped. */
  channelMix: PlanChannelSlice[];
  /** Lines the records put there: a deal's next action, a promise in a capture, money owed. */
  fromRecords: number;
  /** Lines the operator typed onto a day. */
  addedByHand: number;
};

export function summarisePlanBoard(board: PlanBoard, previous?: PlanBoard | null): PlanBoardSummary {
  const items = board.days.flatMap((day) => day.items);
  const total = items.length;
  const done = items.filter((item) => item.done).length;
  const donePercent = total === 0 ? null : Math.round((done / total) * 100);

  let deltaPoints: number | null = null;
  if (previous && donePercent !== null) {
    const previousItems = previous.days.flatMap((day) => day.items);
    if (previousItems.length > 0) {
      const previousPercent = Math.round((previousItems.filter((item) => item.done).length / previousItems.length) * 100);
      deltaPoints = donePercent - previousPercent;
    }
  }

  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = item.channel || NOT_STATED_CHANNEL;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const channelMix: PlanChannelSlice[] = [
    ...ACTIVITY_CHANNELS.map((spec): PlanChannelSlice => ({ channel: spec.channel, count: counts.get(spec.channel) || 0 })),
    { channel: NOT_STATED_CHANNEL, count: counts.get(NOT_STATED_CHANNEL) || 0 } satisfies PlanChannelSlice,
  ].filter((slice) => slice.count > 0);

  const addedByHand = items.filter((item) => item.kind === 'personal').length;

  return {
    total,
    done,
    donePercent,
    deltaPoints,
    channelMix,
    fromRecords: total - addedByHand,
    addedByHand,
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

/** ISO-8601 week number: weeks start Monday, week 1 holds the year's first Thursday. */
export function isoWeekNumber(dateKey: string): number {
  const { year, month, day } = parts(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/**
 * The eyebrow over the week: "Week 38 · 14–20 September", or the month name on
 * the month board. Spelled out rather than handed to a locale formatter, so the
 * same week reads the same on every device the operator opens it on.
 */
export function formatPlanPeriodEyebrow(board: Pick<PlanBoard, 'periodType' | 'rangeStart' | 'rangeEnd'>): string {
  const start = parts(board.rangeStart);
  const end = parts(board.rangeEnd);
  if (!start.year || !end.year) return '';
  if (board.periodType === 'month') return `${MONTHS[start.month - 1]} ${start.year}`;
  const range = start.month === end.month
    ? `${start.day}–${end.day} ${MONTHS[end.month - 1]}`
    : `${start.day} ${MONTHS[start.month - 1]} – ${end.day} ${MONTHS[end.month - 1]}`;
  return `Week ${isoWeekNumber(board.rangeStart)} · ${range}`;
}
