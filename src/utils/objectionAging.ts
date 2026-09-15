import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ObjectionRecord, ObjectionStatus, ObjectionType } from '../services/objectionStore';
import { normalizeEntityName } from './accountIdentity.ts';
import { convertMoney } from './money.ts';
import { compareSafeBusinessDate, sanitizeBusinessDate, timestampToLocalDateKey, todayDateKey } from './safeDate.ts';

/**
 * Objection debt read as an aging ledger.
 *
 * The ledger listed objections newest first, which is the order they were
 * written in and the opposite of the order they cost money in. An objection
 * nobody has answered for four weeks is the one quietly rotting the deal, and
 * newest-first put it at the bottom of the page. So the reading is by age: how
 * long each has been owed, how much deal is riding on it, and which kind of
 * objection is sitting longest.
 */

/** Days open before an objection reads as ageing - the product's going-quiet line. */
export const OBJECTION_AGING_DAYS = 14;
/** Days open before it reads as urgent debt. */
export const OBJECTION_URGENT_DAYS = 21;
/** Days during which an objection is simply new. */
export const OBJECTION_NEW_DAYS = 2;

export type ObjectionAgeTone = 'new' | 'fresh' | 'aging' | 'urgent';

export type AgedObjection = {
  objection: ObjectionRecord;
  /** Whole days since it was raised, or null when the record has no readable date. */
  ageDays: number | null;
  tone: ObjectionAgeTone;
  /** Past its own due date while still owed. */
  pastDue: boolean;
  /** The deal it hangs on, when the ledger can find it. */
  opportunity: CrmLiteOpportunity | null;
  /** That deal's value in the reporting currency; null when there is no deal or no rate. */
  atStake: number | null;
};

export type ObjectionTypeAging = {
  type: ObjectionType;
  count: number;
  averageAgeDays: number;
};

/**
 * Debt is what `getOpenObjectionDebt` already calls debt: Open, and Addressed
 * but not yet resolved. Parked is a decision to wait and Resolved is paid.
 */
export function isObjectionDebt(status: ObjectionStatus) {
  return status === 'Open' || status === 'Addressed';
}

export function objectionAgeDays(objection: Pick<ObjectionRecord, 'createdAt'>, today = todayDateKey()): number | null {
  const raised = timestampToLocalDateKey(objection.createdAt);
  if (!raised) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${raised}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

export function ageObjections(input: {
  objections: ObjectionRecord[];
  opportunities: CrmLiteOpportunity[];
  today?: string;
}): AgedObjection[] {
  const today = input.today || todayDateKey();
  const byId = new Map(input.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const byName = new Map<string, CrmLiteOpportunity>();
  input.opportunities.forEach((opportunity) => {
    const key = `${normalizeEntityName(opportunity.accountName || '')}|${normalizeEntityName(opportunity.opportunityName || '')}`;
    if (!byName.has(key)) byName.set(key, opportunity);
  });

  return input.objections.map((objection) => {
    const opportunity = (objection.opportunityId && byId.get(objection.opportunityId))
      || (objection.opportunityName
        ? byName.get(`${normalizeEntityName(objection.accountName || '')}|${normalizeEntityName(objection.opportunityName)}`)
        : undefined)
      || null;
    const ageDays = objectionAgeDays(objection, today);
    const due = sanitizeBusinessDate(objection.dueDate);
    const pastDue = Boolean(isObjectionDebt(objection.status) && due && compareSafeBusinessDate(due, today) < 0);
    const converted = opportunity ? convertMoney(opportunity.estimatedValue, opportunity.currency) : null;

    return {
      objection,
      ageDays,
      tone: ageTone(ageDays, pastDue),
      pastDue,
      opportunity,
      atStake: converted !== null && converted > 0 ? converted : null,
    };
  });
}

function ageTone(ageDays: number | null, pastDue: boolean): ObjectionAgeTone {
  if (pastDue) return 'urgent';
  if (ageDays === null) return 'fresh';
  if (ageDays >= OBJECTION_URGENT_DAYS) return 'urgent';
  if (ageDays >= OBJECTION_AGING_DAYS) return 'aging';
  if (ageDays <= OBJECTION_NEW_DAYS) return 'new';
  return 'fresh';
}

/**
 * Oldest debt first. Undated records go last - an objection with no readable
 * date cannot be the oldest one, and sorting it first would put a data problem
 * above the objection that is genuinely rotting.
 */
export function compareByDebtAge(left: AgedObjection, right: AgedObjection) {
  if (left.ageDays === null && right.ageDays === null) return 0;
  if (left.ageDays === null) return 1;
  if (right.ageDays === null) return -1;
  return right.ageDays - left.ageDays || (right.atStake ?? 0) - (left.atStake ?? 0);
}

/**
 * The kinds of objection still owed, longest-waiting first.
 *
 * Ordered by average age rather than count, because the question the cards
 * answer is "which kind am I leaving to rot" - three fresh price objections are
 * a normal week, two lead-time objections a month old are a problem.
 */
export function summariseObjectionTypes(aged: AgedObjection[], limit = 4): ObjectionTypeAging[] {
  const groups = new Map<ObjectionType, { count: number; ageTotal: number; dated: number }>();
  aged
    .filter((item) => isObjectionDebt(item.objection.status))
    .forEach((item) => {
      const group = groups.get(item.objection.objectionType) || { count: 0, ageTotal: 0, dated: 0 };
      group.count += 1;
      if (item.ageDays !== null) {
        group.ageTotal += item.ageDays;
        group.dated += 1;
      }
      groups.set(item.objection.objectionType, group);
    });

  return Array.from(groups.entries())
    .map(([type, group]) => ({
      type,
      count: group.count,
      averageAgeDays: group.dated === 0 ? 0 : Math.round(group.ageTotal / group.dated),
    }))
    .sort((left, right) => right.averageAgeDays - left.averageAgeDays || right.count - left.count || left.type.localeCompare(right.type))
    .slice(0, limit);
}

/**
 * The deal value riding on open debt, counted once per deal. Two objections on
 * one quote do not put the quote at stake twice.
 */
export function valueAtStake(aged: AgedObjection[]): { total: number; deals: number } {
  const seen = new Map<string, number>();
  aged
    .filter((item) => isObjectionDebt(item.objection.status))
    .forEach((item) => {
      if (item.opportunity && item.atStake !== null) seen.set(item.opportunity.id, item.atStake);
    });
  return { total: Array.from(seen.values()).reduce((sum, value) => sum + value, 0), deals: seen.size };
}
