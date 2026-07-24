import type { SalesActivityRecord } from '../services/salesActivityStore';
import { classifyBusinessDomain, type BusinessDomain } from './businessDomain.ts';
import { buildCaptureDerivedKey, getDatedCaptureActions, type PlanRecord } from './weeklyPlan.ts';
import {
  compareSafeBusinessDate,
  isBusinessDateInRange,
  isValidBusinessDate,
  sanitizeBusinessDate,
  todayDateKey,
} from './safeDate.ts';

/**
 * What the ledger says about how the period was actually worked - derived, never
 * stored, and computed from the same records the timeline shows plus the plan's
 * own completion marks. The point is that a capture is not just filed: it is read
 * back as cadence, as effort mix, and - closing the loop with Plan - as whether
 * the next actions written down were actually done.
 */

export type ActivityMomentum = {
  current: number;
  previous: number;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
};

export type EffortMixRow = {
  domain: BusinessDomain;
  count: number;
  share: number;
};

/**
 * Follow-through is only fair to measure on work whose day has arrived. An
 * action captured today for next Friday is not a miss, so it sits in notYetDue
 * and stays out of the rate entirely - otherwise a productive week of capturing
 * would read as 0%, which is the opposite of the truth.
 */
export type FollowThrough = {
  /** Dated next actions captured on touches in this period. */
  committed: number;
  /** Of those, marked done on the plan (including ones finished early). */
  done: number;
  /** Dated next actions now past due and still not done. */
  openOverdue: number;
  /** Actions whose day has come: done + openOverdue. The rate's denominator. */
  settled: number;
  /** Captured, dated, and still ahead of their day - not judged yet. */
  notYetDue: number;
  /** done / settled, or null while nothing has come due. */
  rate: number | null;
};

export type QuietAccount = {
  account: string;
  lastTouch: string;
  daysSinceTouch: number;
};

export type ActivityCoverage = {
  accountsTouched: number;
  opportunitiesTouched: number;
  followUps: number;
  objections: number;
};

export type ActivityInsights = {
  total: number;
  momentum: ActivityMomentum;
  activeDays: number;
  busiestDay: { date: string; count: number } | null;
  effortMix: EffortMixRow[];
  topActivityType: { type: string; count: number } | null;
  topAccount: { account: string; count: number } | null;
  followThrough: FollowThrough;
  quietAccounts: QuietAccount[];
  coverage: ActivityCoverage;
  headline: string;
};

const DAY_MS = 86_400_000;
const QUIET_MIN_DAYS = 14;
const QUIET_MAX_DAYS = 60;

export function buildActivityInsights(input: {
  /** Every activity in the workspace - momentum and quiet accounts read beyond the period. */
  activities: SalesActivityRecord[];
  /** The plan's records, so follow-through can see what was ticked done. */
  planRecords: PlanRecord[];
  range: { start: string; end: string };
  today?: string;
}): ActivityInsights {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const inPeriod = input.activities.filter((activity) => isBusinessDateInRange(activity.activityDate, input.range.start, input.range.end));

  const momentum = buildMomentum(input.activities, input.range);
  const dayCounts = countByDay(inPeriod);
  const busiestDay = topEntry(dayCounts);
  const effortMix = buildEffortMix(inPeriod);
  const topActivityType = topEntry(countBy(inPeriod, (activity) => activity.activityType || 'Other'));
  const topAccount = topEntry(countBy(
    inPeriod.filter((activity) => accountOf(activity)),
    (activity) => accountOf(activity),
  ));
  const followThrough = buildFollowThrough(inPeriod, input.planRecords, today);
  const quietAccounts = buildQuietAccounts(input.activities, today);
  const coverage = buildCoverage(inPeriod);

  return {
    total: inPeriod.length,
    momentum,
    activeDays: dayCounts.size,
    busiestDay: busiestDay ? { date: busiestDay.key, count: busiestDay.count } : null,
    effortMix,
    topActivityType: topActivityType ? { type: topActivityType.key, count: topActivityType.count } : null,
    topAccount: topAccount ? { account: topAccount.key, count: topAccount.count } : null,
    followThrough,
    quietAccounts,
    coverage,
    headline: buildHeadline({ total: inPeriod.length, momentum, followThrough, topAccount, quietAccounts }),
  };
}

function buildCoverage(activities: SalesActivityRecord[]): ActivityCoverage {
  return {
    accountsTouched: new Set(activities.map(accountOf).filter(Boolean).map((name) => name.toLowerCase())).size,
    opportunitiesTouched: new Set(
      activities.map((activity) => (activity.linkedOpportunityName || activity.opportunityName || '').trim()).filter(Boolean).map((name) => name.toLowerCase()),
    ).size,
    followUps: activities.filter((activity) => activity.activityType === 'Follow-up').length,
    objections: activities.filter((activity) => activity.activityType === 'Objection handling').length,
  };
}

function buildMomentum(activities: SalesActivityRecord[], range: { start: string; end: string }): ActivityMomentum {
  const lengthDays = daysBetween(range.start, range.end) + 1;
  const prevEnd = shiftDateKey(range.start, -1);
  const prevStart = shiftDateKey(prevEnd, -(lengthDays - 1));
  const current = activities.filter((activity) => isBusinessDateInRange(activity.activityDate, range.start, range.end)).length;
  const previous = activities.filter((activity) => isBusinessDateInRange(activity.activityDate, prevStart, prevEnd)).length;
  const deltaPct = previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
  const direction: ActivityMomentum['direction'] = current > previous ? 'up' : current < previous ? 'down' : 'flat';
  return { current, previous, deltaPct, direction };
}

function buildEffortMix(activities: SalesActivityRecord[]): EffortMixRow[] {
  if (activities.length === 0) return [];
  const counts = countBy(activities, (activity) => classifyBusinessDomain(activity));
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain: domain as BusinessDomain, count, share: count / activities.length }))
    .sort((left, right) => right.count - left.count);
}

function buildFollowThrough(periodActivities: SalesActivityRecord[], planRecords: PlanRecord[], today: string): FollowThrough {
  const doneKeys = new Set(
    planRecords
      .filter((record) => record.__deleted !== true && record.derivedKey && record.done)
      .map((record) => record.derivedKey as string),
  );

  let committed = 0;
  let done = 0;
  let openOverdue = 0;

  periodActivities.forEach((activity) => {
    getDatedCaptureActions(activity).forEach((candidate) => {
      committed += 1;
      const key = buildCaptureDerivedKey(activity.id, candidate.dueDate, candidate.slot);
      if (doneKeys.has(key)) {
        done += 1;
      } else if (compareSafeBusinessDate(candidate.dueDate, today) < 0) {
        openOverdue += 1;
      }
    });
  });

  // Only work whose day has arrived is judged: an action still ahead of its due
  // date is neither kept nor missed yet.
  const settled = done + openOverdue;
  return {
    committed,
    done,
    openOverdue,
    settled,
    notYetDue: committed - settled,
    rate: settled === 0 ? null : done / settled,
  };
}

function buildQuietAccounts(activities: SalesActivityRecord[], today: string): QuietAccount[] {
  const lastTouchByAccount = new Map<string, { account: string; lastTouch: string }>();
  activities.forEach((activity) => {
    const account = accountOf(activity);
    if (!account || !isValidBusinessDate(activity.activityDate)) return;
    const key = account.toLowerCase();
    const existing = lastTouchByAccount.get(key);
    if (!existing || compareSafeBusinessDate(activity.activityDate, existing.lastTouch) > 0) {
      lastTouchByAccount.set(key, { account, lastTouch: activity.activityDate });
    }
  });

  return [...lastTouchByAccount.values()]
    .map((entry) => ({ ...entry, daysSinceTouch: daysBetween(entry.lastTouch, today) }))
    .filter((entry) => entry.daysSinceTouch >= QUIET_MIN_DAYS && entry.daysSinceTouch <= QUIET_MAX_DAYS)
    .sort((left, right) => right.daysSinceTouch - left.daysSinceTouch)
    .slice(0, 4)
    .map((entry) => ({ account: entry.account, lastTouch: entry.lastTouch, daysSinceTouch: entry.daysSinceTouch }));
}

function buildHeadline(input: {
  total: number;
  momentum: ActivityMomentum;
  followThrough: FollowThrough;
  topAccount: { key: string; count: number } | null;
  quietAccounts: QuietAccount[];
}): string {
  if (input.total === 0) {
    return 'No activity captured in this period yet. Capture a touch and this reads back your cadence and follow-through.';
  }

  const parts: string[] = [];
  const trend = input.momentum.deltaPct === null
    ? ''
    : input.momentum.direction === 'up'
      ? `, up ${input.momentum.deltaPct}% on the previous period`
      : input.momentum.direction === 'down'
        ? `, down ${Math.abs(input.momentum.deltaPct)}% on the previous period`
        : ', level with the previous period';
  parts.push(`${input.total} ${input.total === 1 ? 'touch' : 'touches'} captured${trend}.`);

  const { committed, done, settled, notYetDue, rate } = input.followThrough;
  if (committed > 0) {
    if (rate === null) {
      // Everything captured is still ahead of its day - nothing to judge yet.
      parts.push(`${committed} captured next ${committed === 1 ? 'action is' : 'actions are'} on the plan, none due yet.`);
    } else {
      const ratePct = Math.round(rate * 100);
      const ahead = notYetDue > 0 ? ` ${notYetDue} still ahead.` : '';
      parts.push(`You've closed ${done} of the ${settled} that came due (${ratePct}%).${ahead}`);
    }
  }

  if (input.quietAccounts.length > 0) {
    const [first] = input.quietAccounts;
    parts.push(`${input.quietAccounts.length} ${input.quietAccounts.length === 1 ? 'account is' : 'accounts are'} going quiet - ${first.account} has been silent ${first.daysSinceTouch} days.`);
  }

  return parts.join(' ');
}

function accountOf(activity: SalesActivityRecord) {
  return (activity.linkedAccountName || activity.accountName || '').trim();
}

function countByDay(activities: SalesActivityRecord[]) {
  return countBy(
    activities.filter((activity) => isValidBusinessDate(activity.activityDate)),
    (activity) => sanitizeBusinessDate(activity.activityDate),
  );
}

function countBy<T>(items: T[], keyOf: (item: T) => string) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = keyOf(item);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function topEntry(counts: Map<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  counts.forEach((count, key) => {
    if (!best || count > best.count) best = { key, count };
  });
  return best;
}

function daysBetween(fromDateKey: string, toDateKey: string) {
  const from = Date.parse(`${sanitizeBusinessDate(fromDateKey)}T00:00:00Z`);
  const to = Date.parse(`${sanitizeBusinessDate(toDateKey)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / DAY_MS);
}

function shiftDateKey(dateKey: string, days: number) {
  const base = Date.parse(`${sanitizeBusinessDate(dateKey)}T00:00:00Z`);
  if (Number.isNaN(base)) return dateKey;
  const shifted = new Date(base + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}
