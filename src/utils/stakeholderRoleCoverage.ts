import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import { normalizeEntityName } from './accountIdentity.ts';
import { normalizeMeddicRole } from './meddicStakeholderMap.ts';
import { sumMoney } from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * Who you know at each customer, laid out against the roles a decision needs.
 *
 * The Stakeholders page was a list of people, which answers "who is this". The
 * question an operator brings to it before a review is the other one: at each
 * account, which of the buying roles has a name against it and which does not.
 * A list can only answer that one card at a time, and the gap - the Economic
 * Buyer nobody has met - never appears in a list at all, because a list only
 * shows what exists.
 *
 * The five columns are the product's own strategic roles, the same set
 * `stakeholderGraph` counts coverage over. Blocker, Coach and User are real
 * roles and stay on the record; they are not columns because an account is not
 * missing something when it has no blocker.
 */

export const COVERAGE_ROLES = ['Champion', 'Economic Buyer', 'Technical Buyer', 'Procurement', 'Decision Committee'] as const;
export type CoverageRole = (typeof COVERAGE_ROLES)[number];

/** Days without an interaction before a named person reads as going quiet. */
export const PERSON_QUIET_DAYS = 14;
/** And before it reads as gone quiet - the same 30 days an account is judged by. */
export const PERSON_SILENT_DAYS = 30;

export type RoleCoverageCell = {
  role: CoverageRole;
  /** Most recently spoken to first, so the name shown is the live contact. */
  people: StakeholderRecord[];
};

export type RoleCoverageRow = {
  key: string;
  accountName: string;
  openDealCount: number;
  /** In the reporting currency. Deals in a currency with no rate add nothing. */
  openValue: number;
  cells: RoleCoverageCell[];
  covered: number;
  gaps: number;
  /** People at this customer whose role nobody has recorded. */
  unknownRoles: number;
};

export type RoleCoverageMatrix = {
  rows: RoleCoverageRow[];
  totalPeople: number;
  /** People anywhere in the book with role Unknown. */
  unknownRoles: number;
  /** Accounts (in the matrix) with nobody recorded as Economic Buyer. */
  missingEconomicBuyer: number;
  /** People with no account at all, who can appear in no row. */
  unattached: number;
};

export function buildRoleCoverageMatrix(input: {
  stakeholders: StakeholderRecord[];
  opportunities: CrmLiteOpportunity[];
}): RoleCoverageMatrix {
  const rowsByKey = new Map<string, { accountName: string; people: StakeholderRecord[]; deals: CrmLiteOpportunity[] }>();
  const rowFor = (name: string) => {
    const key = normalizeEntityName(name);
    if (!key) return null;
    let row = rowsByKey.get(key);
    if (!row) {
      // Kept in the spelling first seen, like every other account grouping.
      row = { accountName: name.trim(), people: [], deals: [] };
      rowsByKey.set(key, row);
    }
    return row;
  };

  // The universe is the one summarizeStakeholderCoverage uses: every customer a
  // person is recorded at, plus every customer with a live deal. The second half
  // is the point - an account with an open deal and nobody named is the worst
  // row on the page, and building rows from people alone would leave it out.
  input.stakeholders.forEach((person) => { rowFor(person.accountName || '')?.people.push(person); });
  input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .forEach((opportunity) => { rowFor(opportunity.accountName || '')?.deals.push(opportunity); });

  const rows: RoleCoverageRow[] = Array.from(rowsByKey.entries()).map(([key, row]) => {
    const cells = COVERAGE_ROLES.map((role) => ({
      role,
      people: row.people
        .filter((person) => normalizeMeddicRole(person.stakeholderRole) === role)
        .sort(byMostRecentInteraction),
    }));
    const covered = cells.filter((cell) => cell.people.length > 0).length;
    return {
      key,
      accountName: row.accountName,
      openDealCount: row.deals.length,
      openValue: sumMoney(row.deals.map((deal) => ({ amount: deal.estimatedValue, currency: deal.currency }))),
      cells,
      covered,
      gaps: COVERAGE_ROLES.length - covered,
      unknownRoles: row.people.filter((person) => normalizeMeddicRole(person.stakeholderRole) === 'Unknown').length,
    };
  });

  // Live money first, because that is where a missing name costs something;
  // then the widest gap; then the name, so the order is stable between loads.
  rows.sort((left, right) => (
    right.openValue - left.openValue
    || right.openDealCount - left.openDealCount
    || right.gaps - left.gaps
    || left.accountName.localeCompare(right.accountName)
  ));

  return {
    rows,
    totalPeople: input.stakeholders.length,
    unknownRoles: input.stakeholders.filter((person) => normalizeMeddicRole(person.stakeholderRole) === 'Unknown').length,
    missingEconomicBuyer: rows.filter((row) => row.cells[1].people.length === 0).length,
    unattached: input.stakeholders.filter((person) => !normalizeEntityName(person.accountName || '')).length,
  };
}

/** Whole days since this person was last spoken to, or null when nobody wrote it down. */
export function daysSinceInteraction(person: Pick<StakeholderRecord, 'lastInteractionDate'>, today = todayDateKey()): number | null {
  const date = sanitizeBusinessDate(person.lastInteractionDate);
  if (!date) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

/**
 * The half-line under a name: what the record says about how this person leans.
 *
 * One qualifier, the most telling one present - a stated influence, then a
 * stance, then how strong the relationship is - so a cell never becomes a
 * sentence. A person who has gone quiet says that instead, because it is the
 * one thing about them that needs doing something about.
 */
export function describeCoveragePerson(
  person: StakeholderRecord,
  today = todayDateKey(),
): { text: string; quiet: 'none' | 'quiet' | 'silent' } {
  const days = daysSinceInteraction(person, today);
  if (days !== null && days >= PERSON_QUIET_DAYS) {
    return { text: `Quiet ${days}d`, quiet: days >= PERSON_SILENT_DAYS ? 'silent' : 'quiet' };
  }
  const qualifier = person.influenceLevel === 'High' || person.influenceLevel === 'Medium'
    ? `${person.influenceLevel} influence`
    : person.stance && person.stance !== 'Unknown'
      ? person.stance
      : person.relationshipStrength && person.relationshipStrength !== 'Unknown'
        ? person.relationshipStrength
        : '';
  return { text: [(person.roleTitle || '').trim(), qualifier].filter(Boolean).join(' · '), quiet: 'none' };
}

function byMostRecentInteraction(left: StakeholderRecord, right: StakeholderRecord) {
  const a = sanitizeBusinessDate(left.lastInteractionDate);
  const b = sanitizeBusinessDate(right.lastInteractionDate);
  if (a && b) return b.localeCompare(a);
  if (a) return -1;
  if (b) return 1;
  return left.name.localeCompare(right.name);
}
