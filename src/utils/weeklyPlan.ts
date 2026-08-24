import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { OwnObligation } from './ownObligations.ts';
import type { BusinessDomain } from './businessDomain.ts';
import { classifyPlanWork, summarisePlanWork, type PlanWorkKind, type PlanWorkSplit } from './planWorkKind.ts';
import {
  addMonthsClamped,
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
  /**
   * The day this was actually promised for, when it was promised before the
   * period on screen and carried forward onto today.
   *
   * Every source on this board was filtered by `isBusinessDateInRange`, so a
   * promise dated outside the visible week was dropped outright - and `overdue`
   * could therefore only ever mean "earlier this week". A workspace owing seven
   * promises from March to July opened Plan and saw one item and the words
   * "0 / 1 done": the surface whose whole job is working out the week could not
   * show the work that was already late.
   */
  carriedFrom?: string;
  /** Customer work, work for a line you carry, or your own machinery. */
  workKind: PlanWorkKind;
  /** The line served, for principal work. Empty otherwise. */
  workBrand: string;
  /** Which of the seven domains internal work belongs to. Null for the rest. */
  workDomain: BusinessDomain | null;
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
  /**
   * The week split by who the work is for. Provenance ("where did this item
   * come from") and purpose ("who is it for") are different questions, and the
   * board previously only answered the first.
   */
  workSplit: PlanWorkSplit;
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
   * The line this work serves, when it serves one rather than a customer.
   * Researching a principal or building its presentation has a real owner; it
   * simply is not a customer, and without this field all of it read as
   * unattached admin.
   */
  linkedBrand?: string;
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

/**
 * How far back an unkept promise still belongs on the board.
 *
 * A year. Beyond that it is history rather than work, and carrying it forward
 * for ever would make the board unreadable instead of honest.
 */
const CARRY_FORWARD_LOOKBACK_DAYS = 365;

function shiftDateKey(date: string, days: number) {
  const parsed = parseDateKey(date);
  parsed.setDate(parsed.getDate() + days);
  return toDateKey(parsed);
}

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
  /**
   * The lines you carry, so a tag naming one is read as work for that
   * principal rather than as unattached admin. Optional: a workspace with no
   * brands classifies exactly as it did before.
   */
  brands?: string[];
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

  // Who the workspace already knows, so a bracket tag can be read as a
  // customer, as a line you carry, or as neither.
  const workContext = {
    brands: input.brands || [],
    accountNames: [...new Set([
      ...input.opportunities.map((opportunity) => opportunity.accountName),
      ...(input.activities || []).map((activity) => activity.linkedAccountName || activity.accountName),
    ].filter(Boolean))],
  };

  const withWork = (
    item: UnclassifiedPlanItem,
    links?: { linkedOpportunityId?: string; linkedAccountName?: string; linkedBrand?: string },
  ): PlanItem => {
    const work = classifyPlanWork({ tag: item.tag, label: item.label, ...links }, workContext);
    return { ...item, workKind: work.kind, workBrand: work.brand, workDomain: work.domain };
  };

  const personal = personalRecordsInRange
    .map((record) => withWork({
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
          : record.linkedBrand
            ? `/app/opportunities?brandOnly=${encodeURIComponent(record.linkedBrand)}`
            : '',
      overdue: !record.done && compareSafeBusinessDate(record.date, today) < 0,
    }, {
      linkedOpportunityId: record.linkedOpportunityId,
      linkedAccountName: record.linkedAccountName,
      linkedBrand: record.linkedBrand,
    }));

  /**
   * Promises made before this period and never kept.
   *
   * Only when today is on the board: paging back to March, or forward to
   * October, is a deliberate look at that period and injecting this week's
   * backlog into it would be a different lie. On the current period they belong
   * on today, which is the day they can still be acted on - the same thing
   * every planning tool on earth does, and the thing this board was not doing
   * while the panel directly above it listed seven overdue promises.
   */
  const todayOnBoard = isBusinessDateInRange(today, range.start, range.end);
  const carried = todayOnBoard ? buildCarriedForwardItems({
    opportunities: input.opportunities,
    obligations: input.obligations,
    activities: input.activities || [],
    liveRecords,
    completionByKey,
    rangeStart: range.start,
    today,
  }).map((item) => withWork(item)) : [];

  const allItems = [...derived.map((item) => withWork(item)), ...personal, ...carried];
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
    workSplit: summarisePlanWork(allItems.map((item) => ({
      kind: item.workKind,
      brand: item.workBrand,
      domain: item.workDomain,
    }))),
  };
}

/** A board item before it has been asked who it is for. */
type UnclassifiedPlanItem = Omit<PlanItem, 'workKind' | 'workBrand' | 'workDomain'>;

/**
 * Everything promised before the visible period and still open, moved onto
 * today so it can be acted on.
 *
 * Built by running the same four builders over the year before the period and
 * keeping what is not done. The item keeps its real due day in `carriedFrom`
 * so the board can say when it was owed rather than pretending it was always
 * for today.
 */
function buildCarriedForwardItems(input: {
  opportunities: CrmLiteOpportunity[];
  obligations: OwnObligation[];
  activities: SalesActivityRecord[];
  liveRecords: PlanRecord[];
  completionByKey: Map<string, PlanRecord>;
  rangeStart: string;
  today: string;
}): UnclassifiedPlanItem[] {
  const carryRange: PlanRange = {
    start: shiftDateKey(input.rangeStart, -CARRY_FORWARD_LOOKBACK_DAYS),
    end: shiftDateKey(input.rangeStart, -1),
  };
  if (compareSafeBusinessDate(carryRange.start, carryRange.end) > 0) return [];

  const dealItems = buildDealItems(input.opportunities, carryRange, input.today);
  const personalRecords = input.liveRecords
    .filter((record) => !record.derivedKey)
    .filter((record) => record.dismissed !== true && record.done !== true)
    .filter((record) => isValidBusinessDate(record.date) && isBusinessDateInRange(record.date, carryRange.start, carryRange.end));

  const derived = [
    ...dealItems,
    ...buildObligationItems(input.obligations, carryRange, input.today),
    ...buildCaptureItems(input.activities, carryRange, input.today, dealItems, personalRecords),
  ].map((item) => {
    const completion = input.completionByKey.get(item.derivedKey as string);
    return completion ? { ...item, done: completion.done, doneAt: completion.doneAt } : item;
  });

  const personal: UnclassifiedPlanItem[] = personalRecords.map((record) => ({
    id: record.id,
    kind: 'personal' as const,
    date: record.date,
    tag: record.tag,
    label: record.label,
    done: record.done,
    doneAt: record.doneAt,
    href: record.linkedOpportunityId
      ? `/app/opportunities?opportunityId=${encodeURIComponent(record.linkedOpportunityId)}`
      : record.linkedAccountName
        ? `/app/accounts?accountName=${encodeURIComponent(record.linkedAccountName)}`
        : '',
    overdue: true,
  }));

  return [...derived, ...personal]
    // Done work stays where it was done. Only an open promise is still work.
    .filter((item) => !item.done)
    .map((item) => ({ ...item, carriedFrom: item.date, date: input.today, overdue: true }))
    // Oldest promise first: it has been waiting longest.
    .sort((left, right) => compareSafeBusinessDate(left.carriedFrom || '', right.carriedFrom || ''));
}

function buildDealItems(opportunities: CrmLiteOpportunity[], range: PlanRange, today: string): UnclassifiedPlanItem[] {
  return opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .filter((opportunity) => isValidBusinessDate(opportunity.nextActionDate))
    .filter((opportunity) => isBusinessDateInRange(opportunity.nextActionDate, range.start, range.end))
    .map((opportunity) => ({
      id: `deal-${opportunity.id}`,
      derivedKey: buildDealDerivedKey(opportunity.id, opportunity.nextActionDate),
      kind: 'deal' as const,
      date: opportunity.nextActionDate,
      tag: opportunity.accountName || 'Unknown account',
      label: opportunity.nextAction || 'Next action not written yet',
      done: false,
      href: '/app/opportunities',
      overdue: compareSafeBusinessDate(opportunity.nextActionDate, today) < 0,
    }));
}

function buildObligationItems(obligations: OwnObligation[], range: PlanRange, today: string): UnclassifiedPlanItem[] {
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
  dealItems: UnclassifiedPlanItem[],
  personalRecordsInRange: PlanRecord[],
): UnclassifiedPlanItem[] {
  // A deal's dated actions, grouped by account and day, so a capture can be
  // compared against them by wording. Matching on account+date alone would hide
  // genuinely different work: a deal saying "send the quote" on Friday would
  // silently swallow a captured "prepare the demo environment" for the same
  // account that Friday, and the seller would watch something they recorded
  // disappear.
  const dealLabelsByAccountDate = new Map<string, string[]>();
  dealItems.forEach((item) => {
    const key = `${normalizePlanText(item.tag)}|${item.date}`;
    const list = dealLabelsByAccountDate.get(key) || [];
    list.push(normalizePlanText(item.label));
    dealLabelsByAccountDate.set(key, list);
  });
  const personalByDate = new Map<string, { account: string; label: string }[]>();
  personalRecordsInRange.forEach((record) => {
    const list = personalByDate.get(record.date) || [];
    list.push({ account: normalizePlanText(record.tag), label: normalizePlanText(record.label) });
    personalByDate.set(record.date, list);
  });

  const items: UnclassifiedPlanItem[] = [];
  const seenKeys = new Set<string>();

  activities.forEach((activity) => {
    const account = (activity.linkedAccountName || activity.accountName || '').trim() || 'Unknown account';
    const normalizedAccount = normalizePlanText(account);

    getDatedCaptureActions(activity).forEach((candidate) => {
      if (!isBusinessDateInRange(candidate.dueDate, range.start, range.end)) return;

      const normalizedLabel = normalizePlanText(candidate.title);

      // The deal item is the editable copy of the same commitment, so it wins -
      // but only when it really is the same wording, not merely the same account
      // on the same day.
      const dealLabelsHere = dealLabelsByAccountDate.get(`${normalizedAccount}|${candidate.dueDate}`) || [];
      if (dealLabelsHere.some((label) => labelsEquivalent(label, normalizedLabel))) return;

      // The operator already planned this by hand - keep their words, drop ours.
      const personalHere = personalByDate.get(candidate.dueDate) || [];
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
        href: `/app/timeline?view=history&activityId=${encodeURIComponent(activity.id)}`,
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
 * Where a board item's date and wording actually live, so dragging it to
 * another day or editing it in place writes into the record that owns it - the
 * plan record for personal items, the deal for deal items, the captured touch
 * for capture items. Obligations reschedule only when the quote or expense
 * behind them changes, so they report no write target.
 */
export type PlanItemWriteTarget =
  | { kind: 'personal'; recordId: string }
  | { kind: 'deal'; opportunityId: string }
  | { kind: 'capture'; activityId: string; slot: string }
  | { kind: 'obligation' };

export function getPlanItemWriteTarget(item: PlanItem): PlanItemWriteTarget {
  if (item.kind === 'personal') return { kind: 'personal', recordId: item.id };
  if (item.kind === 'deal') return { kind: 'deal', opportunityId: item.id.slice('deal-'.length) };
  if (item.kind === 'capture') {
    // Activity ids may themselves contain dashes; the slot never does, so the
    // last dash is the only safe split point.
    const body = item.id.slice('capture-'.length);
    const lastDash = body.lastIndexOf('-');
    return { kind: 'capture', activityId: body.slice(0, lastDash), slot: body.slice(lastDash + 1) };
  }
  return { kind: 'obligation' };
}

/** The derived key a deal item will carry once its next action moves to `date`. */
export function buildDealDerivedKey(opportunityId: string, date: string) {
  return `deal:${opportunityId}:${date}`;
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

/**
 * One period back or forward.
 *
 * The month step goes through `addMonthsClamped` - see safeDate.ts for what
 * `setMonth` does on the 31st and why every month-paging control in the product
 * had the same bug.
 *
 * The week step needs no such care: `setDate` overflowing a month boundary is
 * exactly what advancing seven days means.
 */
export function shiftPlanAnchor(anchorDate: Date, periodType: PlanPeriod, direction: -1 | 1) {
  if (periodType === 'month') return addMonthsClamped(anchorDate, direction);
  const next = new Date(anchorDate);
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
  linkedBrand?: string;
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
    // A linked item wears its account - or the line it serves - as the tag,
    // the same convention derived deal items use, unless the operator wrote an
    // explicit [Tag].
    tag: tag || input.linkedAccountName || input.linkedBrand || '',
    done: false,
    linkedOpportunityId: input.linkedOpportunityId,
    linkedAccountName: input.linkedAccountName,
    linkedBrand: input.linkedBrand,
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

/**
 * The record that flips a board item's tick, whichever family it belongs to.
 *
 * Personal items are their own record and are edited in place; derived items
 * keep the deal, the quote and the expense untouched and store a completion
 * stub instead. Every surface with a checkbox on it has to know that difference,
 * and each one that re-derived the rule was one more place it could drift - so
 * the rule is written once here and Today and the plan board both call it.
 *
 * Returns null when a personal item has no record behind it, which can only
 * happen if the board and the store are momentarily out of step.
 */
export function createPlanItemToggleRecord(
  item: PlanItem,
  done: boolean,
  records: PlanRecord[],
  options: { source?: 'demo' | 'user'; isSample?: boolean } = {},
): PlanRecord | null {
  const now = new Date().toISOString();

  if (item.kind === 'personal') {
    const existing = records.find((record) => record.id === item.id);
    if (!existing) return null;
    return { ...existing, done, doneAt: done ? now : undefined, updatedAt: now };
  }

  const existing = records.find((record) => record.derivedKey === item.derivedKey);
  return createDerivedCompletionRecord(item, done, {
    existing,
    source: options.source,
    isSample: options.isSample,
  });
}

/**
 * What a link option is called on screen.
 *
 * The stored kind stays `'deal'` because it keys saved plan records and
 * renaming it would orphan every one of them. The *label* is "Opportunity",
 * which is what the rail, the route and the record page all call it - a badge
 * reading DEAL beside a nav item reading Opportunities is the product
 * disagreeing with itself about what its own records are named.
 */
export function planLinkKindLabel(kind: PlanLinkOption['kind']) {
  return kind === 'deal' ? 'Opportunity' : kind;
}

export type PlanLinkOption = {
  key: string;
  kind: 'deal' | 'account' | 'brand';
  accountName: string;
  opportunityId?: string;
  brand?: string;
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
  /**
   * The lines you carry. Typing "research sartorius" should offer the Sartorius
   * line, because that work has an owner even though it has no customer.
   */
  brands?: string[];
  limit?: number;
}): PlanLinkOption[] {
  const query = normalizePlanText(input.draft);
  const tokens = query.split(/\s+/).filter((token) => token.length >= 2);
  if (tokens.length === 0) return [];
  // Six rather than four: two rows are now reserved for the customer, and a
  // four-row list spent all of them on deals the moment an account had several.
  const limit = input.limit ?? 6;

  /**
   * The tokens that actually distinguish one customer from another.
   *
   * Nearly every company in this book is registered as "CÔNG TY TNHH ...", so a
   * matcher that treats `cong`, `ty` and `tnhh` as evidence says every customer
   * matches every query - and with six slots on screen, the one the operator
   * typed loses them to whoever happened to be loaded first. That is the
   * "I searched for it and it is not there" bug: it was there, in position
   * forty.
   */
  const distinctive = tokens.filter((token) => !PLAN_LINK_STOP_TOKENS.has(token));
  const searchTokens = distinctive.length > 0 ? distinctive : tokens;

  /**
   * How well a name answers what was typed, or 0 for no match at all.
   *
   * Ordered by how much of the typed text the name accounts for: the whole
   * phrase beats several words, several words beat one. Shorter names break
   * ties, because a query that matches both "Samil" and "Samil Pharmaceutical
   * Vietnam JSC" is more likely to have meant the shorter, and the longer one is
   * still one row down.
   */
  const scoreName = (name: string) => {
    const normalized = normalizePlanText(name);
    if (!normalized) return 0;
    const matched = searchTokens.filter((token) => normalized.includes(token));
    if (matched.length === 0) return 0;
    const phraseBonus = query.length >= 3 && normalized.includes(query) ? 1000 : 0;
    const coverage = matched.reduce((total, token) => total + token.length, 0);
    return phraseBonus + matched.length * 20 + coverage - Math.min(normalized.length / 10, 9);
  };

  const dealOptions = input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .map((opportunity) => ({
      score: Math.max(scoreName(opportunity.accountName), scoreName(opportunity.opportunityName)),
      option: {
        key: `deal-${opportunity.id}`,
        kind: 'deal' as const,
        accountName: opportunity.accountName,
        opportunityId: opportunity.id,
        display: `${opportunity.accountName || 'No account'} / ${opportunity.opportunityName || 'Untitled opportunity'}`,
      },
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.option);

  const accountOptions = [...new Map(
    input.accountNames
      .filter((name) => name.trim().length > 0)
      .map((name) => [normalizePlanText(name), name] as const),
  ).values()]
    .map((name) => ({
      score: scoreName(name),
      option: {
        key: `account-${normalizePlanText(name)}`,
        kind: 'account' as const,
        accountName: name,
        display: name,
      },
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.option);

  const brandOptions = [...new Set((input.brands || []).map((brand) => brand.trim()).filter(Boolean))]
    .map((brand) => ({
      score: scoreName(brand),
      option: {
        key: `brand-${normalizePlanText(brand)}`,
        kind: 'brand' as const,
        accountName: '',
        brand,
        display: brand,
      },
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.option);

  // The customer is always offered, even when its deals matched too.
  //
  // Excluding it "because a deal already covers it" was wrong in the one case
  // that matters most: a customer with four live deals filled every slot with
  // deals, so the account itself - the right link for "restart the thread that
  // went quiet", which is about the relationship and not about one line item -
  // became unreachable the moment a customer got busy enough to need it.
  //
  // Two account rows are reserved rather than merely ordered first, so a
  // customer with many deals still shows both kinds of link at once.
  const RESERVED_ACCOUNT_ROWS = 2;
  const reservedAccounts = accountOptions.slice(0, RESERVED_ACCOUNT_ROWS);
  const remainingAccounts = accountOptions.slice(RESERVED_ACCOUNT_ROWS);
  return [...reservedAccounts, ...dealOptions, ...remainingAccounts, ...brandOptions].slice(0, limit);
}

/**
 * The composer text with the customer's name taken out of it, once that name has
 * become a link.
 *
 * Picking "CÔNG TY TNHH SAMIL PHARMACEUTICAL" from the list used to leave the
 * word the operator typed to find it - "Samil" - sitting in the text box, so the
 * saved line read "Samil" *and* wore a Samil chip. The name is now recorded
 * twice, in two forms that can disagree, and the board reads as a stutter. The
 * link is the customer; the text should be the work.
 *
 * Only words that belong to the picked name are removed, so "Send price + CoA
 * for Pymepharco" keeps everything except the customer.
 */
export function stripPlanLinkFromDraft(draft: string, linkedName: string): string {
  const nameTokens = new Set(normalizePlanText(linkedName).split(/\s+/).filter(Boolean));
  if (nameTokens.size === 0) return draft.trim();

  const wordKey = (word: string) => normalizePlanText(word).replace(/[^a-z0-9]/g, '');
  const kept = draft.split(/\s+/).filter((word) => {
    const key = wordKey(word);
    return key.length === 0 || !nameTokens.has(key);
  });

  // Connectives and stray punctuation are left dangling by the removal - "Send
  // price for", "Follow up -" - and reading one back is worse than nothing.
  const danglingAtEnd = () => {
    const last = kept[kept.length - 1];
    const key = wordKey(last);
    return key.length === 0 || DANGLING_WORDS.has(key);
  };
  while (kept.length > 0 && danglingAtEnd()) kept.pop();

  return kept.join(' ').replace(/\s+([,.;:])/g, '$1').trim();
}

const DANGLING_WORDS = new Set(['for', 'to', 'with', 'at', 'of', 'cho', 'voi', 'den', 'tai', 'cua', 'and', 'va']);

/**
 * Words that appear in a company's legal name and tell you nothing about which
 * company it is. Deliberately only the legal-form boilerplate - a trade word
 * like "duoc" or "thiet bi" narrows a book of pharma and instrument customers
 * usefully, and dropping it would throw away a real signal.
 */
const PLAN_LINK_STOP_TOKENS = new Set([
  'cong', 'ty', 'tnhh', 'mtv', 'cp', 'co', 'phan', 'chi', 'nhanh', 'lien', 'doanh',
  'tap', 'doan', 'the', 'and', 'ltd', 'llc', 'jsc', 'inc', 'corp', 'company', 'joint', 'stock',
]);

function normalizePlanText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * The colour a board tag wears, by who the work is for rather than by where the
 * item came from. Provenance is already legible from the item itself; what an
 * operator wants to read across a whole week is the mix - blue customer, violet
 * principal, grey their own machinery - in the same colours the order book and
 * the brand rollup already use for the same ideas.
 */
export function planWorkTone(item: Pick<PlanItem, 'workKind'>) {
  return {
    customer: 'bg-blue-50 text-brand-blue',
    principal: 'bg-violet-50 text-violet-700',
    internal: 'bg-gray-100 text-gray-600',
  }[item.workKind];
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

/**
 * Constructed once. `Intl.DateTimeFormat` costs about a millisecond to build
 * and nothing to reuse, and `buildDays` calls this for every day in a range -
 * so the Activity page's "everything ever" query was constructing several
 * thousand identical formatters and spending 4.8 seconds doing it, which was
 * the whole of that page's cold load. Same mistake, same fix, as `money.ts`
 * and `safeDate.ts`.
 */
const dayLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

function formatDayLabel(dateKey: string) {
  try {
    return dayLabelFormatter.format(parseDateKey(dateKey));
  } catch {
    return dateKey;
  }
}

function formatMonthLabel(dateKey: string) {
  try {
    return monthLabelFormatter.format(parseDateKey(dateKey));
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
