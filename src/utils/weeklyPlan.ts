import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
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
 * Two families of item sit side by side, and the difference matters. Derived
 * items are dated commitments that already exist in the workspace - a deal's
 * next action, a payment you owe, a next action captured against a touch - so
 * the board can never quietly disagree with the money spine. The seller records
 * a thing once, in Capture or on the deal, and the plan simply reflects it back.
 * Personal items are the operator's own work (an internal report, a claim to
 * file) that no commercial record would ever produce, typed straight onto a day.
 *
 * Checking a derived item records that you did your plan. It deliberately does
 * NOT write back into the deal: only a captured touch moves the deal, so the
 * board can be honest without becoming a second source of truth.
 */

export type PlanItemKind = 'deal' | 'obligation' | 'capture' | 'personal';

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
  /** Derived items that came from a captured touch, a subset of derivedCount. */
  captureCount: number;
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
  linkedOpportunityId?: string;
  linkedAccountName?: string;
  /**
   * The suggestion this record answers. Present whether the suggestion was
   * taken or refused, so acceptance rate has a denominator - the same
   * discipline the weekly commitment snapshot uses.
   */
  suggestionKey?: string;
  /** Shown, and consciously refused. Never re-suggested. */
  dismissed?: boolean;
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
  /**
   * Captured touches, so a next action written down with a due date lands on the
   * plan automatically - the seller records it once in Capture and never has to
   * copy it onto a day by hand. Optional so existing callers keep working.
   */
  activities?: SalesActivityRecord[];
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

  const dealItems = buildDealItems(input.opportunities, range, today);
  const personalRecordsInRange = liveRecords
    .filter((record) => !record.derivedKey)
    .filter((record) => record.dismissed !== true)
    .filter((record) => isValidBusinessDate(record.date) && isBusinessDateInRange(record.date, range.start, range.end));
  const captureItems = buildCaptureItems(input.activities || [], range, today, dealItems, personalRecordsInRange);

  const derived = [
    ...dealItems,
    ...buildObligationItems(input.obligations, range, today),
    ...captureItems,
  ].map((item) => {
    const completion = completionByKey.get(item.derivedKey as string);
    return completion ? { ...item, done: completion.done, doneAt: completion.doneAt } : item;
  });

  const personal = personalRecordsInRange
    .map((record) => ({
      id: record.id,
      kind: 'personal' as const,
      date: record.date,
      tag: record.tag,
      label: record.label,
      done: record.done,
      doneAt: record.doneAt,
      // A linked item deep-links to the exact record it belongs to, so the
      // board stays wired into the same data spine as everything else.
      href: record.linkedOpportunityId
        ? `/app/opportunities?opportunityId=${encodeURIComponent(record.linkedOpportunityId)}`
        : record.linkedAccountName
          ? `/app/accounts?accountName=${encodeURIComponent(record.linkedAccountName)}`
          : '',
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
    captureCount: captureItems.length,
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

/**
 * A next action captured against a touch, with a due date, becomes a plan item
 * on that day - automatically, so the seller who writes "send revised quote by
 * Friday" in Capture never has to re-type it onto Friday's column.
 *
 * Two things it deliberately does not do:
 *  - It does not duplicate a deal item. If the touch is linked to a deal and the
 *    deal already carries that same dated action, the deal item stands (it is the
 *    editable source of truth); the capture item steps aside.
 *  - It does not duplicate the operator's own hand-typed plan. If a personal item
 *    for the same account already sits on that day saying the same thing, the
 *    typed one wins - the seller planned it, the capture is just evidence.
 */
function buildCaptureItems(
  activities: SalesActivityRecord[],
  range: PlanRange,
  today: string,
  dealItems: PlanItem[],
  personalRecordsInRange: PlanRecord[],
): PlanItem[] {
  // A deal's dated action is keyed by account+date, so a linked capture with the
  // same account on the same day is recognised as the same commitment.
  const dealSignatures = new Set(
    dealItems.map((item) => `${normalizePlanText(item.tag)}|${item.date}`),
  );
  const personalByDate = new Map<string, { account: string; label: string }[]>();
  personalRecordsInRange.forEach((record) => {
    const list = personalByDate.get(record.date) || [];
    list.push({ account: normalizePlanText(record.tag), label: normalizePlanText(record.label) });
    personalByDate.set(record.date, list);
  });

  const items: PlanItem[] = [];
  const seenKeys = new Set<string>();

  activities.forEach((activity) => {
    const account = (activity.linkedAccountName || activity.accountName || '').trim() || 'Unknown account';
    const normalizedAccount = normalizePlanText(account);

    getDatedCaptureActions(activity).forEach((candidate) => {
      if (!isBusinessDateInRange(candidate.dueDate, range.start, range.end)) return;

      // The deal item is the editable copy; never show the same commitment twice.
      if (dealSignatures.has(`${normalizedAccount}|${candidate.dueDate}`)) return;

      // The operator already planned this by hand - keep their words, drop ours.
      const personalHere = personalByDate.get(candidate.dueDate) || [];
      const normalizedLabel = normalizePlanText(candidate.title);
      const duplicatedByHand = personalHere.some(
        (record) => record.account === normalizedAccount && labelsEquivalent(record.label, normalizedLabel),
      );
      if (duplicatedByHand) return;

      const derivedKey = buildCaptureDerivedKey(activity.id, candidate.dueDate, candidate.slot);
      if (seenKeys.has(derivedKey)) return;
      seenKeys.add(derivedKey);

      items.push({
        id: `capture-${activity.id}-${candidate.slot}`,
        derivedKey,
        kind: 'capture',
        date: candidate.dueDate,
        tag: account,
        label: condensePlanLabel(candidate.title),
        done: false,
        // Land on the exact touch that raised this, so its evidence is one click away.
        href: `/app/activity?activityId=${encodeURIComponent(activity.id)}`,
        overdue: compareSafeBusinessDate(candidate.dueDate, today) < 0,
      });
    });
  });

  return items;
}

/**
 * The one place the capture-item derived key is spelled, so the board that
 * writes a completion mark and anything measuring follow-through read the same
 * identity. Drift here would silently make "captured then done" uncountable.
 */
export function buildCaptureDerivedKey(activityId: string, dueDate: string, slot: string) {
  return `capture:${activityId}:${dueDate}:${slot}`;
}

/**
 * Every dated next action a touch carries: the headline nextAction with its
 * dueDate, plus each structured nextActions[] entry that has its own date. Slots
 * keep their derived keys stable so a completion mark survives a rebuild.
 * Exported so Capture can tell the seller, at save time, what just landed on the
 * plan - reading the same rule the board itself uses.
 */
export function getDatedCaptureActions(activity: SalesActivityRecord): { title: string; dueDate: string; slot: string }[] {
  const candidates: { title: string; dueDate: string; slot: string }[] = [];
  // The parser often writes the same next action into both the headline field
  // and the structured list; the same title on the same day is one commitment,
  // so it is counted once (the headline wins) rather than twice on the board,
  // in the scheduled confirmation, and in the follow-through funnel.
  const seen = new Set<string>();
  const add = (rawTitle: string, rawDueDate: string | undefined, slot: string) => {
    const title = (rawTitle || '').trim();
    if (!title || !isValidBusinessDate(rawDueDate)) return;
    const dueDate = sanitizeBusinessDate(rawDueDate);
    const signature = `${dueDate}|${title.toLowerCase()}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    candidates.push({ title, dueDate, slot });
  };

  add(activity.nextAction || '', activity.dueDate, 'main');
  (activity.nextActions || []).forEach((action, index) => add(action?.title || '', action?.dueDate, `n${index}`));
  return candidates;
}

/**
 * Two plan labels are "the same work" when one contains the other after
 * normalisation - deliberately strict, so a genuine second task is never hidden.
 */
function labelsEquivalent(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 6 && longer.includes(shorter);
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
  linkedOpportunityId?: string;
  linkedAccountName?: string;
  suggestionKey?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): PlanRecord {
  const now = new Date().toISOString();
  const { tag, label } = splitBracketTag(input.label, input.tag);
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: input.date,
    label,
    // A linked item wears its account as the tag - the same convention derived
    // deal items use - unless the operator wrote an explicit [Tag].
    tag: tag || input.linkedAccountName || '',
    done: false,
    linkedOpportunityId: input.linkedOpportunityId,
    linkedAccountName: input.linkedAccountName,
    suggestionKey: input.suggestionKey,
    createdAt: now,
    updatedAt: now,
    source: input.source,
    isSample: input.isSample,
  };
}

/**
 * A refused suggestion. Stored rather than forgotten so it is never proposed
 * again, and so "shown but not taken" stays countable.
 */
export function createDismissedSuggestionRecord(input: {
  suggestionKey: string;
  date: string;
  label: string;
  tag: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): PlanRecord {
  const now = new Date().toISOString();
  return {
    id: `plan-dismissed-${input.suggestionKey}`,
    date: input.date,
    label: input.label,
    tag: input.tag,
    done: false,
    suggestionKey: input.suggestionKey,
    dismissed: true,
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

export type PlanLinkOption = {
  key: string;
  kind: 'deal' | 'account';
  accountName: string;
  opportunityId?: string;
  display: string;
};

/**
 * Entity matches for the text the operator is typing into the composer, so a
 * personal item can be linked to the account or deal it belongs to instead of
 * living as loose text beside the data spine. Matching is by token: typing
 * "send quote apex" surfaces Apex Labs and its deals.
 */
export function buildPlanLinkOptions(input: {
  draft: string;
  opportunities: CrmLiteOpportunity[];
  accountNames: string[];
  limit?: number;
}): PlanLinkOption[] {
  const tokens = normalizePlanText(input.draft).split(/\s+/).filter((token) => token.length >= 2);
  if (tokens.length === 0) return [];
  const limit = input.limit ?? 4;
  const matches = (name: string) => {
    const normalized = normalizePlanText(name);
    return normalized.length > 0 && tokens.some((token) => normalized.includes(token));
  };

  const dealOptions = input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .filter((opportunity) => matches(opportunity.accountName) || matches(opportunity.opportunityName))
    .map((opportunity) => ({
      key: `deal-${opportunity.id}`,
      kind: 'deal' as const,
      accountName: opportunity.accountName,
      opportunityId: opportunity.id,
      display: `${opportunity.accountName || 'No account'} / ${opportunity.opportunityName || 'Untitled deal'}`,
    }));

  const dealAccounts = new Set(dealOptions.map((option) => normalizePlanText(option.accountName)));
  const accountOptions = [...new Map(
    input.accountNames
      .filter((name) => name.trim().length > 0)
      .map((name) => [normalizePlanText(name), name] as const),
  ).values()]
    .filter((name) => matches(name))
    // An account whose deal already matched is covered by the deal option.
    .filter((name) => !dealAccounts.has(normalizePlanText(name)))
    .map((name) => ({
      key: `account-${normalizePlanText(name)}`,
      kind: 'account' as const,
      accountName: name,
      display: name,
    }));

  return [...dealOptions, ...accountOptions].slice(0, limit);
}

function normalizePlanText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function planKindTone(kind: PlanItemKind) {
  return {
    deal: 'bg-blue-50 text-brand-blue',
    obligation: 'bg-amber-50 text-amber-800',
    capture: 'bg-emerald-50 text-emerald-700',
    personal: 'bg-gray-100 text-gray-600',
  }[kind];
}

/**
 * A captured next action is often a paragraph. A plan item has to be readable
 * at a glance in a narrow column, so take the first sentence and cap it - the
 * full text stays on the activity, which the item links back to.
 */
const MAX_LABEL_LENGTH = 80;

export function condensePlanLabel(rawLabel: string) {
  const trimmed = (rawLabel || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const firstSentence = /^(.+?[.!?])\s+\S/.exec(trimmed)?.[1] || trimmed;
  const candidate = firstSentence.replace(/[.\s]+$/, '');
  if (candidate.length <= MAX_LABEL_LENGTH) return candidate;

  const clipped = candidate.slice(0, MAX_LABEL_LENGTH);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).replace(/[,;:\s]+$/, '')}...`;
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
