import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import { accountKey, sameAccount } from './accountIdentity.ts';
import { resolveAccountName, type AccountAliasIndex } from './accountAliases.ts';
import { classifyBusinessDomain, type BusinessDomain } from './businessDomain.ts';
import { readDomain } from './planWorkKind.ts';
import type { OwnObligation } from './ownObligations.ts';
import {
  buildPlanBoard,
  getDatedCaptureActions,
  type PlanItem,
  type PlanRecord,
} from './weeklyPlan.ts';
import {
  compareSafeBusinessDate,
  isBusinessDateInRange,
  isValidBusinessDate,
  sanitizeBusinessDate,
  todayDateKey,
} from './safeDate.ts';

/**
 * The activity ledger: every dated thing in the workspace, each one resolved to
 * the single specific thing it is about.
 *
 * Memoire already had both halves of this - captured touches under Timeline >
 * History, dated work under Timeline > Upcoming - and neither could answer the
 * question an operator actually asks at the end of a month: *what did all of
 * this add up to, and who was it for*. A calendar answers "when"; it cannot
 * answer "how much of my February went to Cobetter, and how much of it went to
 * nothing at all".
 *
 * The shape is borrowed from the one CRM that has already been wrong about this
 * for twenty-five years and fixed it. Salesforce models activity as two record
 * types - a Task (dated work, has a status) and an Event (something that
 * happened at a time) - and gives both a pair of polymorphic pointers rather
 * than a lookup field per object: `WhoId`, the person, and `WhatId`, the record
 * it is *related to*. The activity timeline then splits on state, not on type:
 * Open Activities above, Activity History below. Two consequences of that design
 * are the reason it is worth copying:
 *
 *   1. Every activity is about exactly one thing, and that thing is typed. You
 *      can group a year of work by what it served without inventing a taxonomy.
 *   2. An activity related to nothing is visibly related to nothing. In
 *      Salesforce those are the rows nobody can report on; here they are the
 *      most valuable rows on the page, because each one is a customer the
 *      operator is already working who has no account, no deal and no money
 *      attached - which is the exact leak this product exists to close.
 *
 * The mapping onto records Memoire already owns:
 *
 *   Salesforce Event  -> a captured touch (SalesActivityRecord). It happened.
 *   Salesforce Task   -> a plan item (PlanItem). It is dated and has a checkbox.
 *   WhoId             -> the stakeholder or contact named on the touch.
 *   WhatId            -> `relatedTo`, below: an opportunity, an account, a line
 *                        you carry, one of the seven internal domains, or - the
 *                        interesting case - an unresolved name.
 *   Subject           -> the one line that says what the work was.
 *   Open / History    -> `bucket`, derived from state, exactly as Salesforce does.
 *
 * Derived on every read from the same records the rest of the app writes, so
 * this file owns nothing and can never disagree with the money spine. In
 * particular the task side calls `buildPlanBoard`, the same function the plan
 * board renders from, rather than re-deriving dated work its own way - two
 * derivations of "what is on my week" is how a product starts telling an
 * operator two different numbers.
 */

/** What kind of pointer `relatedTo` is - Salesforce's WhatId, made explicit. */
export type ActivityRelationType =
  /** A named deal. The strongest link there is. */
  | 'opportunity'
  /** A customer that exists as an account, but no specific deal. */
  | 'account'
  /** A line you carry: work that serves a principal, not a customer. */
  | 'brand'
  /** Your own machinery, bucketed into one of the seven business domains. */
  | 'internal'
  /** A name the operator wrote that the workspace does not know yet. */
  | 'unresolved';

/** A touch that happened, or dated work that may or may not be done. */
export type ActivityKind = 'event' | 'task';

export type ActivityState = 'done' | 'open' | 'overdue';

/** Salesforce's split: open activities above, activity history below. */
export type ActivityBucket = 'open' | 'history';

/** Where the row came from. Provenance, not purpose. */
export type ActivityOrigin = 'capture' | 'deal' | 'obligation' | 'typed';

export type ActivityRelation = {
  type: ActivityRelationType;
  /** The account, the brand, the domain, or the raw name as written. */
  name: string;
  /** Where to go to work on the thing itself. Empty when there is nowhere yet. */
  href: string;
};

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  date: string;
  /** The one line that says what this was. Salesforce calls it the Subject. */
  subject: string;
  relatedTo: ActivityRelation;
  /** The person, when the record named one. Salesforce's WhoId. */
  who: string;
  /** Activity type for a touch, work kind for a task. */
  type: string;
  domain: BusinessDomain;
  state: ActivityState;
  bucket: ActivityBucket;
  origin: ActivityOrigin;
  /** Where to open the record this row was derived from. */
  href: string;
  /** A touch that wrote down a dated next action. */
  hasNextAction: boolean;
  /** Monday of the week this falls in, for weekly rollups. */
  weekStart: string;
  /** 0 = Sunday, matching Date#getDay, so weekday shapes are cheap. */
  weekday: number;
};

export type ActivityLedgerContext = {
  /**
   * Customers the *business* knows: an account record, or a deal naming them.
   *
   * Deliberately not "every account name that appears anywhere", which would
   * include the names written on the activities being classified. That set is
   * circular - a customer becomes known by virtue of the operator having typed
   * them - and it is exactly the reasoning that hides the leak this page exists
   * to show. A touch is evidence of work, not evidence of a record.
   */
  accountNames: string[];
  /** Lines carried, read off the opportunities that name one. */
  brands: string[];
};

const DAY_MS = 86_400_000;

/**
 * Bracket tags that classify a row rather than name anything. Kept in step with
 * `planTagAccounts`, which refuses to propose these as accounts for the same
 * reason: "New Customer" is a category, and treating it as an unresolved
 * customer would put a permanent phantom at the top of every leaderboard.
 */
const CATEGORY_TAGS = new Set([
  'internal',
  'new customer',
  'new customers',
  'personal',
  'admin',
  'todo',
  'to do',
  'misc',
  'other',
  'general',
  'you owe',
]);

export function buildActivityLedgerContext(input: {
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
}): ActivityLedgerContext {
  return {
    accountNames: unique([
      ...input.accounts.map((account) => account.accountName),
      ...input.opportunities.map((opportunity) => opportunity.accountName),
    ]),
    brands: unique(input.opportunities.map((opportunity) => opportunity.brand || '')),
  };
}

export function buildActivityLedger(input: {
  activities: SalesActivityRecord[];
  planRecords: PlanRecord[];
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
  obligations?: OwnObligation[];
  /** Merged customer names, so one customer is one subject here. */
  accountAliases?: AccountAliasIndex;
  range: { start: string; end: string };
  today?: string;
}): ActivityEntry[] {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const range = {
    start: sanitizeBusinessDate(input.range.start),
    end: sanitizeBusinessDate(input.range.end),
  };
  const context = buildActivityLedgerContext(input);

  const events = input.activities
    .filter((activity) => isBusinessDateInRange(activity.activityDate, range.start, range.end))
    .map((activity) => buildEventEntry(activity, context, input.accountAliases));

  const tasks = collectPlanItems({
    range,
    today,
    opportunities: input.opportunities,
    obligations: input.obligations || [],
    activities: input.activities,
    planRecords: input.planRecords,
    brands: context.brands,
  }).map((item) => buildTaskEntry(item, context, input.accountAliases));

  return [...events, ...tasks].sort(
    (left, right) => compareSafeBusinessDate(right.date, left.date) || left.subject.localeCompare(right.subject),
  );
}

/**
 * The dated work in the range, taken from the plan board rather than re-derived.
 *
 * `buildPlanBoard` works a calendar month at a time, so a range spanning three
 * months is three board builds and a filter. That is deliberately more work than
 * writing a second derivation here: the alternative was two functions answering
 * "what is on my week", drifting apart the first time one of them learned
 * something the other did not.
 */
function collectPlanItems(input: {
  range: { start: string; end: string };
  today: string;
  opportunities: CrmLiteOpportunity[];
  obligations: OwnObligation[];
  activities: SalesActivityRecord[];
  planRecords: PlanRecord[];
  brands: string[];
}): PlanItem[] {
  const seen = new Set<string>();
  const items: PlanItem[] = [];

  monthAnchorsBetween(input.range.start, input.range.end).forEach((anchorDate) => {
    const board = buildPlanBoard({
      periodType: 'month',
      anchorDate,
      opportunities: input.opportunities,
      obligations: input.obligations,
      activities: input.activities,
      records: input.planRecords,
      brands: input.brands,
      today: input.today,
    });

    board.days.forEach((day) => {
      if (!isBusinessDateInRange(day.date, input.range.start, input.range.end)) return;
      day.items.forEach((item) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        items.push(item);
      });
    });
  });

  return items;
}

/**
 * A captured touch's WhatId. Exported for the same reason the plan item's
 * resolver is: Timeline > History draws this chip on every card, and it has to be
 * the identical answer the ledger counts with or the two disagree on one screen.
 */
export function resolveActivitySubject(
  activity: SalesActivityRecord,
  context: ActivityLedgerContext,
  aliases?: AccountAliasIndex,
): ActivityRelation {
  const opportunityName = (activity.linkedOpportunityName || activity.opportunityName || '').trim();
  if (activity.linkedOpportunityId && opportunityName) {
    return {
      type: 'opportunity',
      name: opportunityName,
      href: `/app/opportunities?opportunityId=${encodeURIComponent(activity.linkedOpportunityId)}`,
    };
  }

  const account = resolveAccountName(activity.linkedAccountName || activity.accountName || '', aliases);
  if (account) return relationForName(account, context);

  // A touch that named nobody is not an unresolved customer - there is no name to
  // resolve. It is work on the business, bucketed by what the note was about.
  return { type: 'internal', name: classifyBusinessDomain(activity), href: '' };
}

function buildEventEntry(
  activity: SalesActivityRecord,
  context: ActivityLedgerContext,
  aliases?: AccountAliasIndex,
): ActivityEntry {
  const date = sanitizeBusinessDate(activity.activityDate);
  const relatedTo = resolveActivitySubject(activity, context, aliases);

  return {
    id: `event-${activity.id}`,
    kind: 'event',
    date,
    subject: (activity.summary || activity.rawNote || 'Touch captured').trim(),
    relatedTo,
    who: (activity.stakeholderName || activity.contactName || '').trim(),
    type: activity.activityType || 'Other',
    domain: classifyBusinessDomain(activity),
    // A touch is something that already happened. There is no open state for it,
    // which is exactly why Salesforce files completed activity as history.
    state: 'done',
    bucket: 'history',
    origin: 'capture',
    href: `/app/timeline?view=history&activityId=${encodeURIComponent(activity.id)}`,
    hasNextAction: getDatedCaptureActions(activity).length > 0,
    weekStart: weekStartOf(date),
    weekday: weekdayOf(date),
  };
}

function buildTaskEntry(
  item: PlanItem,
  context: ActivityLedgerContext,
  aliases?: AccountAliasIndex,
): ActivityEntry {
  const state: ActivityState = item.done ? 'done' : item.overdue ? 'overdue' : 'open';

  return {
    id: `task-${item.id}`,
    kind: 'task',
    date: sanitizeBusinessDate(item.date),
    subject: item.label,
    relatedTo: resolvePlanItemSubject(item, context, aliases),
    // A plan item has no participant field. Inventing one from the label would
    // put parsed noise in a column the operator reads as fact.
    who: '',
    type: planItemTypeLabel(item),
    domain: taskDomain(item),
    state,
    bucket: state === 'done' ? 'history' : 'open',
    origin: planItemOrigin(item),
    href: item.href,
    hasNextAction: false,
    weekStart: weekStartOf(item.date),
    weekday: weekdayOf(item.date),
  };
}

/**
 * A plan item's WhatId. Exported because the plan board draws the same answer on
 * every note: the calendar's whole claim is that each line points at one
 * specific thing, and it can only make that claim honestly if it reads the same
 * resolver the Activity ledger counts with.
 *
 * The plan board already asked the harder question - is this work for a
 * customer, for a line you carry, or for your own machinery - so this reads that
 * answer rather than guessing again. The one thing it adds is the distinction
 * the board does not need and this page lives on: internal work whose bracket
 * tag names *something*, just not something the workspace knows yet. That is a
 * customer with no account, not admin, and calling it admin is what made half
 * this operator's week read as unattributable.
 */
export function resolvePlanItemSubject(
  item: PlanItem,
  context: ActivityLedgerContext,
  aliases?: AccountAliasIndex,
): ActivityRelation {
  // An obligation is money or goods *you* owe. Its counterparty is a vendor, a
  // principal, or an expense category - never a customer you forgot to create.
  // Resolving it by the tag rules put "Tools & software" on the board as a
  // missing account, which is both false and the fastest way to teach an
  // operator to ignore the amber chip: it would cry wolf on every recurring
  // cost. It keeps the counterparty as its label and resolves to the domain the
  // money belongs to. A principal you owe is still the principal.
  if (item.kind === 'obligation') {
    const brand = context.brands.find((candidate) => sameAccount(candidate, item.tag));
    if (brand) {
      return { type: 'brand', name: brand, href: `/app/opportunities?brandOnly=${encodeURIComponent(brand)}` };
    }
    return { type: 'internal', name: taskDomain(item), href: item.href };
  }

  if (item.workKind === 'customer') {
    const opportunityId = readOpportunityId(item.href);
    if (opportunityId) {
      return {
        type: 'opportunity',
        name: item.tag || 'Deal',
        href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunityId)}`,
      };
    }
    return relationForName(resolveAccountName(item.tag, aliases), context);
  }

  if (item.workKind === 'principal' && item.workBrand) {
    return {
      type: 'brand',
      name: item.workBrand,
      href: `/app/opportunities?brandOnly=${encodeURIComponent(item.workBrand)}`,
    };
  }

  const tag = (item.tag || '').trim();
  if (tag && !CATEGORY_TAGS.has(accountKey(tag))) {
    return { type: 'unresolved', name: tag, href: '' };
  }

  return { type: 'internal', name: item.workDomain || readDomain(`${tag} ${item.label}`), href: '' };
}

/**
 * A customer name, resolved as far as the workspace can take it: a real account
 * if one exists under any spelling, otherwise a name still waiting to become one.
 */
function relationForName(name: string, context: ActivityLedgerContext): ActivityRelation {
  const trimmed = (name || '').trim();
  if (!trimmed) return { type: 'internal', name: 'Internal', href: '' };

  if (CATEGORY_TAGS.has(accountKey(trimmed))) {
    return { type: 'internal', name: readDomain(trimmed), href: '' };
  }

  const brand = context.brands.find((candidate) => sameAccount(candidate, trimmed));
  const known = context.accountNames.find((candidate) => sameAccount(candidate, trimmed));

  // A name that is both a customer and a line you carry is read as the customer:
  // the work has a buyer, and the buyer is the side that pays.
  if (known) {
    return {
      type: 'account',
      name: known,
      href: `/app/accounts?accountName=${encodeURIComponent(known)}`,
    };
  }
  if (brand) {
    return { type: 'brand', name: brand, href: `/app/opportunities?brandOnly=${encodeURIComponent(brand)}` };
  }

  return { type: 'unresolved', name: trimmed, href: '' };
}

/**
 * Which of the seven domains a piece of dated work belongs to.
 *
 * `readDomain` exists to bucket *internal* work and falls back to Internal when
 * no keyword matches - correct for its own job, wrong here. A deal's next action
 * reading "tender review follow-up" hits none of the keywords, so the whole
 * customer-facing half of the week was landing in Internal and the effort mix
 * reported an operator spending their days on admin. Work with a customer or a
 * line behind it is Sales unless a keyword says otherwise.
 */
function taskDomain(item: PlanItem): BusinessDomain {
  const read = item.workDomain || readDomain(`${item.tag} ${item.label}`);
  if (read !== 'Internal') return read;

  // Nothing in the wording said what this was, so fall back on what the record
  // already proves. An obligation is money or goods you owe - "Money" whatever
  // it is called - and work with a customer or a line behind it is Sales. Only
  // an item with neither is genuinely admin.
  if (item.kind === 'obligation') return 'Money';
  return item.workKind === 'internal' ? 'Internal' : 'Sales';
}

function planItemTypeLabel(item: PlanItem) {
  if (item.kind === 'deal') return 'Deal next action';
  if (item.kind === 'obligation') return 'Obligation';
  if (item.kind === 'capture') return 'Captured next action';
  return 'Typed plan item';
}

function planItemOrigin(item: PlanItem): ActivityOrigin {
  if (item.kind === 'deal') return 'deal';
  if (item.kind === 'obligation') return 'obligation';
  if (item.kind === 'capture') return 'capture';
  return 'typed';
}

function readOpportunityId(href: string) {
  const match = /opportunityId=([^&]+)/.exec(href || '');
  return match ? decodeURIComponent(match[1]) : '';
}

/** One anchor per calendar month touched by the range, earliest first. */
function monthAnchorsBetween(start: string, end: string): Date[] {
  if (!isValidBusinessDate(start) || !isValidBusinessDate(end)) return [];
  const first = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return [];

  const anchors: Date[] = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  // Twelve years of months is far past any range the UI offers; the cap exists
  // so a corrupt date can never spin this loop forever.
  for (let guard = 0; guard < 144; guard += 1) {
    if (cursor.getFullYear() > last.getFullYear()
      || (cursor.getFullYear() === last.getFullYear() && cursor.getMonth() > last.getMonth())) break;
    anchors.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return anchors;
}

export function weekStartOf(dateKey: unknown) {
  const date = sanitizeBusinessDate(dateKey);
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) return date;
  const day = new Date(parsed).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return new Date(parsed + mondayOffset * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOf(dateKey: unknown) {
  const parsed = Date.parse(`${sanitizeBusinessDate(dateKey)}T00:00:00Z`);
  return Number.isNaN(parsed) ? 0 : new Date(parsed).getUTCDay();
}

export function relationTypeLabel(type: ActivityRelationType) {
  return {
    opportunity: 'Opportunity',
    account: 'Account',
    brand: 'Brand line',
    internal: 'Internal',
    unresolved: 'Not linked yet',
  }[type];
}

/** True when the row is attached to something the business can report on. */
export function isAttached(entry: ActivityEntry) {
  return entry.relatedTo.type === 'opportunity'
    || entry.relatedTo.type === 'account'
    || entry.relatedTo.type === 'brand';
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => (value || '').trim()).filter(Boolean))];
}
