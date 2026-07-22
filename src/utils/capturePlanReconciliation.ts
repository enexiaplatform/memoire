import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { OwnObligation } from './ownObligations.ts';
import {
  buildPlanBoard,
  condensePlanLabel,
  createDerivedCompletionRecord,
  getDatedCaptureActions,
  type PlanItem,
  type PlanRecord,
} from './weeklyPlan.ts';
import { sameAccount } from './accountIdentity.ts';
import { compareSafeBusinessDate, formatSafeBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * The two halves of "record it once" at the moment a capture is saved.
 *
 * Forward: a dated next action the touch carries has just landed on the plan by
 * itself, so Capture can say so instead of leaving the seller to wonder.
 *
 * Backward: the touch is often the very thing an open plan item was waiting for,
 * so Capture can offer to tick that item done - closing the loop from the place
 * the work was actually recorded, never auto-checking it.
 */

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type ScheduledPlanEntry = {
  label: string;
  dueDate: string;
  dueDateLabel: string;
  weekdayLabel: string;
  overdue: boolean;
};

/**
 * What this capture just put on the plan: every next action it carries that has
 * a valid due date. Regardless of how far out - the plan will show it when the
 * seller reaches that week.
 */
export function getCaptureScheduledEntries(activity: SalesActivityRecord, today?: string): ScheduledPlanEntry[] {
  const todayKey = sanitizeBusinessDate(today) || todayDateKey();
  return getDatedCaptureActions(activity).map((candidate) => ({
    label: condensePlanLabel(candidate.title),
    dueDate: candidate.dueDate,
    dueDateLabel: formatSafeBusinessDate(candidate.dueDate),
    weekdayLabel: weekdayLabelFor(candidate.dueDate),
    overdue: compareSafeBusinessDate(candidate.dueDate, todayKey) < 0,
  }));
}

export type ClosablePlanItem = {
  item: PlanItem;
  weekdayLabel: string;
  dueDateLabel: string;
  reason: string;
};

/**
 * Open plan items on the same account whose date sits within a few days of the
 * captured touch - the ones this touch most likely just satisfied. Deals and the
 * operator's own items only; a capture-derived item is never offered as its own
 * closer. Suggests; never auto-checks.
 */
export function findClosablePlanItems(input: {
  activity: SalesActivityRecord;
  opportunities: CrmLiteOpportunity[];
  obligations?: OwnObligation[];
  records: PlanRecord[];
  today?: string;
  windowDays?: number;
}): ClosablePlanItem[] {
  const account = (input.activity.linkedAccountName || input.activity.accountName || '').trim();
  if (!account) return [];
  const touchDate = sanitizeBusinessDate(input.activity.activityDate) || sanitizeBusinessDate(input.today) || todayDateKey();
  const windowDays = input.windowDays ?? 3;

  // A month around the touch, so an item a day or two either side of a week
  // boundary is still found. Activities are deliberately NOT fed in: we match
  // against plan items that already existed, not this capture's own new item.
  const board = buildPlanBoard({
    periodType: 'month',
    anchorDate: new Date(`${touchDate}T00:00:00`),
    opportunities: input.opportunities,
    obligations: input.obligations || [],
    records: input.records,
    today: input.today,
  });

  return board.days
    .flatMap((day) => day.items.map((item) => ({ item, weekdayLabel: day.weekdayLabel })))
    .filter(({ item }) => !item.done)
    .filter(({ item }) => item.kind === 'deal' || item.kind === 'personal')
    .filter(({ item }) => Boolean(item.tag) && sameAccount(item.tag, account))
    .filter(({ item }) => Math.abs(dayDelta(item.date, touchDate)) <= windowDays)
    .sort((left, right) => Math.abs(dayDelta(left.item.date, touchDate)) - Math.abs(dayDelta(right.item.date, touchDate)))
    .slice(0, 3)
    .map(({ item, weekdayLabel }) => ({
      item,
      weekdayLabel,
      dueDateLabel: formatSafeBusinessDate(item.date),
      reason: closeReason(item, touchDate),
    }));
}

/**
 * The record to save to mark a closable item done - a completion stub for a
 * derived (deal) item, or the flipped record for the operator's own item. Mirrors
 * exactly what the plan board does when the same box is ticked there, so the two
 * surfaces can never disagree about what "done" means.
 */
export function planItemDoneRecord(
  item: PlanItem,
  records: PlanRecord[],
  options: { source?: 'demo' | 'user'; isSample?: boolean } = {},
): PlanRecord | null {
  const now = new Date().toISOString();
  if (item.kind === 'personal') {
    const existing = records.find((record) => record.id === item.id);
    if (!existing) return null;
    return { ...existing, done: true, doneAt: now, updatedAt: now };
  }

  const existing = records.find((record) => record.derivedKey === item.derivedKey);
  return createDerivedCompletionRecord(item, true, { existing, source: options.source, isSample: options.isSample });
}

function closeReason(item: PlanItem, touchDate: string) {
  const delta = dayDelta(item.date, touchDate);
  if (delta === 0) return 'Planned for today, and you just logged a touch on it.';
  if (delta > 0) return `Planned for ${formatSafeBusinessDate(item.date)} - your touch may have handled it early.`;
  return `Was due ${formatSafeBusinessDate(item.date)} - this touch looks like it closed it out.`;
}

function dayDelta(fromDateKey: string, toDateKey: string) {
  const from = Date.parse(`${fromDateKey}T00:00:00Z`);
  const to = Date.parse(`${toDateKey}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((from - to) / 86_400_000);
}

function weekdayLabelFor(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '' : WEEKDAY_LABELS[parsed.getDay()];
}
