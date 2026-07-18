import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { OwnObligation } from './ownObligations.ts';
import {
  compareSafeBusinessDate,
  isBusinessDateInRange,
  isValidBusinessDate,
  sanitizeBusinessDate,
  todayDateKey,
} from './safeDate.ts';

/**
 * The week laid out as days.
 *
 * Two kinds of item sit side by side, and the difference matters. Derived items
 * are dated commitments that already exist in the workspace - a deal's next
 * action, a payment you owe - so the board can never quietly disagree with the
 * money spine. Personal items are the operator's own work (an internal report,
 * a claim to file) that no commercial record would ever produce.
 *
 * Checking a derived item records that you did your plan. It deliberately does
 * NOT write back into the deal: only a captured touch moves the deal, so the
 * board can be honest without becoming a second source of truth.
 */

export type PlanItemKind = 'deal' | 'obligation' | 'personal';

export type PlanItem = {
  id: string;
  /** Stable identity for a derived item, so a completion mark survives re-derivation. */
  derivedKey?: string;
  kind: PlanItemKind;
  date: string;
  /** Bracketed prefix shown before the label - the account, or a personal tag. */
  tag: string;
  label: string;
  done: boolean;
  doneAt?: string;
  /** Where to go to act on it. Empty for personal items. */
  href: string;
  overdue: boolean;
};

export type PlanDay = {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  isToday: boolean;
  isWeekend: boolean;
  items: PlanItem[];
  doneCount: number;
};

export type PlanBoard = {
  periodType: PlanPeriod;
  rangeStart: string;
  rangeEnd: string;
  days: PlanDay[];
  totalCount: number;
  doneCount: number;
  personalCount: number;
  derivedCount: number;
};

export type PlanPeriod = 'week' | 'month';

/** A user-authored plan item, and the completion marks for derived ones. */
export type PlanRecord = {
  id: string;
  date: string;
  label: string;
  tag: string;
  done: boolean;
  doneAt?: string;
  /** Set only on completion stubs for derived items. */
  derivedKey?: string;
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function buildPlanBoard(input: {
  periodType: PlanPeriod;
  anchorDate?: Date;
  opportunities: CrmLiteOpportunity[];
  obligations: OwnObligation[];
  records: PlanRecord[];
  today?: string;
}): PlanBoard {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const range = getPlanRange(input.periodType, input.anchorDate);

  const liveRecords = input.records.filter((record) => record.__deleted !== true);
  const completionByKey = new Map(
    liveRecords
      .filter((record) => record.derivedKey)
      .map((record) => [record.derivedKey as string, record]),
  );

  const derived = [
    ...buildDealItems(input.opportunities, range, today),
    ...buildObligationItems(input.obligations, range, today),
  ].map((item) => {
    const completion = completionByKey.get(item.derivedKey as string);
    return completion ? { ...item, done: completion.done, doneAt: completion.doneAt } : item;
  });

  const personal = liveRecords
    .filter((record) => !record.derivedKey)
    .filter((record) => isValidBusinessDate(record.date) && isBusinessDateInRange(record.date, range.start, range.end))
    .map((record) => ({
      id: record.id,
      kind: 'personal' as const,
      date: record.date,
      tag: record.tag,
      label: record.label,
      done: record.done,
      doneAt: record.doneAt,
      href: '',
      overdue: !record.done && compareSafeBusinessDate(record.date, today) < 0,
    }));

  const allItems = [...derived, ...personal];
  const days = buildDays(range, today).map((day) => {
    const items = allItems
      .filter((item) => item.date === day.date)
      // Open work first, then done - a finished item should never push a live
      // commitment out of sight at the top of a column.
      .sort((a, b) => Number(a.done) - Number(b.done) || a.tag.localeCompare(b.tag));
    return { ...day, items, doneCount: items.filter((item) => item.done).length };
  });

  return {
    periodType: input.periodType,
    rangeStart: range.start,
    rangeEnd: range.end,
    days,
    totalCount: allItems.length,
    doneCount: allItems.filter((item) => item.done).length,
    personalCount: personal.length,
    derivedCount: derived.length,
  };
}

function buildDealItems(opportunities: CrmLiteOpportunity[], range: PlanRange, today: string): PlanItem[] {
  return opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .filter((opportunity) => isValidBusinessDate(opportunity.nextActionDate))
    .filter((opportunity) => isBusinessDateInRange(opportunity.nextActionDate, range.start, range.end))
    .map((opportunity) => ({
      id: `deal-${opportunity.id}`,
      derivedKey: `deal:${opportunity.id}:${opportunity.nextActionDate}`,
      kind: 'deal' as const,
      date: opportunity.nextActionDate,
      tag: opportunity.accountName || 'Unknown account',
      label: opportunity.nextAction || 'Next action not written yet',
      done: false,
      href: '/app/opportunities',
      overdue: compareSafeBusinessDate(opportunity.nextActionDate, today) < 0,
    }));
}

function buildObligationItems(obligations: OwnObligation[], range: PlanRange, today: string): PlanItem[] {
  return obligations
    .filter((obligation) => isValidBusinessDate(obligation.dueDate))
    .filter((obligation) => isBusinessDateInRange(obligation.dueDate, range.start, range.end))
    .map((obligation) => ({
      id: `obligation-${obligation.id}`,
      derivedKey: `obligation:${obligation.id}:${obligation.dueDate}`,
      kind: 'obligation' as const,
      date: obligation.dueDate,
      tag: obligation.counterparty || 'You owe',
      label: obligation.label,
      done: false,
      href: obligation.href || '/app/revenue',
      overdue: compareSafeBusinessDate(obligation.dueDate, today) < 0,
    }));
}

type PlanRange = { start: string; end: string };

/**
 * Weeks run Monday to Sunday, matching the review week id so a plan week and a
 * commitment week are always the same seven days.
 */
export function getPlanRange(periodType: PlanPeriod, anchorDate = new Date()): PlanRange {
  const anchor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());

  if (periodType === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start: toDateKey(start), end: toDateKey(end) };
  }

  const day = anchor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(anchor);
  start.setDate(start.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toDateKey(start), end: toDateKey(end) };
}

export function shiftPlanAnchor(anchorDate: Date, periodType: PlanPeriod, direction: -1 | 1) {
  const next = new Date(anchorDate);
  if (periodType === 'month') {
    next.setMonth(next.getMonth() + direction);
    return next;
  }
  next.setDate(next.getDate() + direction * 7);
  return next;
}

export function formatPlanRangeLabel(board: PlanBoard) {
  if (board.periodType === 'month') {
    return formatMonthLabel(board.rangeStart);
  }
  return `${formatDayLabel(board.rangeStart)} - ${formatDayLabel(board.rangeEnd)}`;
}

function buildDays(range: PlanRange, today: string) {
  const days: Omit<PlanDay, 'items' | 'doneCount'>[] = [];
  const cursor = parseDateKey(range.start);
  const last = parseDateKey(range.end);

  while (cursor.getTime() <= last.getTime()) {
    const date = toDateKey(cursor);
    const weekday = cursor.getDay();
    days.push({
      date,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      dayLabel: formatDayLabel(date),
      isToday: date === today,
      isWeekend: weekday === 0 || weekday === 6,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export function createPersonalPlanRecord(input: {
  date: string;
  label: string;
  tag?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): PlanRecord {
  const now = new Date().toISOString();
  const { tag, label } = splitBracketTag(input.label, input.tag);
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: input.date,
    label,
    tag,
    done: false,
    createdAt: now,
    updatedAt: now,
    source: input.source,
    isSample: input.isSample,
  };
}

/**
 * "[Internal] Submit KPI" is how the operator already writes these, so the
 * bracket is read as the tag rather than left inside the label.
 */
export function splitBracketTag(rawLabel: string, explicitTag?: string) {
  const trimmed = rawLabel.trim();
  const match = /^\[([^\]]{1,40})\]\s*(.+)$/.exec(trimmed);
  if (match && !explicitTag) {
    return { tag: match[1].trim(), label: match[2].trim() };
  }
  return { tag: (explicitTag || '').trim(), label: trimmed };
}

/**
 * Completion of a derived item is stored as its own small record keyed by the
 * derived identity, so nothing is written back onto the deal or the expense.
 */
export function createDerivedCompletionRecord(
  item: PlanItem,
  done: boolean,
  options: { existing?: PlanRecord; source?: 'demo' | 'user'; isSample?: boolean } = {},
): PlanRecord {
  const now = new Date().toISOString();
  const { existing } = options;
  return {
    id: existing?.id || `plan-done-${item.derivedKey}`,
    date: item.date,
    label: item.label,
    tag: item.tag,
    done,
    doneAt: done ? now : undefined,
    derivedKey: item.derivedKey,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    // Tagged at birth, like every other record the demo sandbox can create:
    // a tick made against sample data must never merge into a live workspace.
    source: existing?.source ?? options.source,
    isSample: existing?.isSample ?? options.isSample,
  };
}

export function planKindTone(kind: PlanItemKind) {
  return {
    deal: 'bg-blue-50 text-brand-blue',
    obligation: 'bg-amber-50 text-amber-800',
    personal: 'bg-gray-100 text-gray-600',
  }[kind];
}

function formatDayLabel(dateKey: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parseDateKey(dateKey));
  } catch {
    return dateKey;
  }
}

function formatMonthLabel(dateKey: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(parseDateKey(dateKey));
  } catch {
    return dateKey;
  }
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
