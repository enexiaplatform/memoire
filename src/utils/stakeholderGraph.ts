import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { normalizeEntityName } from './accountIdentity.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord, StakeholderRole } from '../services/stakeholderStore';
import { normalizeMeddicRole } from './meddicStakeholderMap.ts';

export type StakeholderCoverage = {
  missingChampion: boolean;
  missingEconomicBuyer: boolean;
  missingProcurement: boolean;
  missingTechnicalBuyer: boolean;
  blockerExists: boolean;
  decisionMakerUnknown: boolean;
  allNeutralOrUnknown: boolean;
  warnings: string[];
};

export type StakeholderCandidate = {
  id: string;
  name: string;
  accountName: string;
  opportunityName: string;
  opportunityId: string;
  lastInteractionDate: string;
  notes: string;
};

const strategicRoles: StakeholderRole[] = ['Champion', 'Economic Buyer', 'Technical Buyer', 'Procurement', 'Decision Committee'];

export function analyzeStakeholderCoverage(stakeholders: StakeholderRecord[], opportunity?: CrmLiteOpportunity | null): StakeholderCoverage {
  const relevant = opportunity ? getStakeholdersForOpportunity(stakeholders, opportunity) : stakeholders;
  const hasRole = (role: string) => relevant.some((stakeholder) => normalizeMeddicRole(stakeholder.stakeholderRole) === normalizeMeddicRole(role));
  const blockerExists = relevant.some((stakeholder) => normalizeMeddicRole(stakeholder.stakeholderRole) === 'Blocker' || stakeholder.stance === 'Resistant');
  const allNeutralOrUnknown = relevant.length > 0 && relevant.every((stakeholder) => stakeholder.stance === 'Neutral' || stakeholder.stance === 'Unknown');

  const coverage = {
    missingChampion: !hasRole('Champion'),
    missingEconomicBuyer: !hasRole('Economic Buyer'),
    missingProcurement: !hasRole('Procurement'),
    missingTechnicalBuyer: !hasRole('Technical Buyer'),
    blockerExists,
    decisionMakerUnknown: !opportunity?.decisionMaker && !hasRole('Economic Buyer') && !hasRole('Decision Committee'),
    allNeutralOrUnknown,
    warnings: [] as string[],
  };

  if (coverage.missingChampion) coverage.warnings.push('No champion identified.');
  if (coverage.missingEconomicBuyer) coverage.warnings.push('Economic buyer unknown.');
  if (coverage.missingProcurement) coverage.warnings.push('Procurement not mapped.');
  if (coverage.missingTechnicalBuyer) coverage.warnings.push('Technical buyer not mapped.');
  if (coverage.blockerExists) coverage.warnings.push('Blocker or resistant stakeholder exists.');
  if (coverage.decisionMakerUnknown) coverage.warnings.push('Decision maker unknown.');
  if (coverage.allNeutralOrUnknown) coverage.warnings.push('All mapped stakeholders are neutral or unknown.');

  return coverage;
}

export function getStakeholdersForAccount(stakeholders: StakeholderRecord[], account: { id?: string; accountName?: string } | string) {
  const accountName = typeof account === 'string' ? account : account.accountName || '';
  const accountId = typeof account === 'string' ? '' : account.id || '';
  return stakeholders.filter((stakeholder) => (
    (accountId && stakeholder.accountId === accountId) ||
    sameText(stakeholder.accountName, accountName)
  ));
}

export function getStakeholdersForOpportunity(stakeholders: StakeholderRecord[], opportunity: CrmLiteOpportunity | { id?: string; opportunityName?: string; accountName?: string }) {
  return stakeholders.filter((stakeholder) => (
    (opportunity.id && stakeholder.opportunityId === opportunity.id) ||
    (
      sameText(stakeholder.opportunityName, opportunity.opportunityName || '') &&
      (!opportunity.accountName || sameText(stakeholder.accountName, opportunity.accountName))
    ) ||
    (!stakeholder.opportunityName && opportunity.accountName && sameText(stakeholder.accountName, opportunity.accountName))
  ));
}

export function deriveStakeholderCandidatesFromActivities(activities: SalesActivityRecord[]) {
  const candidates = new Map<string, StakeholderCandidate>();
  activities.forEach((activity) => {
    const candidate = deriveStakeholderCandidateFromCapture(activity);
    if (!candidate) return;
    // Canonical on both halves, or the same person captured with and without
    // their accents is offered twice as a new stakeholder to create.
    const key = `${normalizeEntityName(candidate.accountName)}::${normalizeEntityName(candidate.name)}`;
    if (!candidates.has(key)) candidates.set(key, candidate);
  });
  return Array.from(candidates.values());
}

export function deriveStakeholderCandidateFromCapture(activity: SalesActivityRecord): StakeholderCandidate | null {
  const name = activity.contactName || activity.stakeholderName;
  if (!name) return null;
  return {
    id: `${activity.id}-${name}`,
    name,
    accountName: activity.linkedAccountName || activity.accountName,
    opportunityName: activity.linkedOpportunityName || activity.opportunityName,
    opportunityId: activity.linkedOpportunityId || '',
    lastInteractionDate: activity.activityDate,
    notes: activity.summary,
  };
}

export function getStakeholderRisks(stakeholders: StakeholderRecord[], opportunity: CrmLiteOpportunity) {
  return analyzeStakeholderCoverage(stakeholders, opportunity).warnings;
}

export function summarizeStakeholderCoverage(stakeholders: StakeholderRecord[], opportunities: CrmLiteOpportunity[]) {
  /**
   * Which accounts are supposed to have a champion.
   *
   * This used to be "every account name that appears on a stakeholder row",
   * which quietly excludes exactly the accounts most likely to be missing one.
   * On the imported book the stakeholder rows carry no account name at all, so
   * the set was empty and the tile read MISSING CHAMPION 0 beside CHAMPIONS 1 -
   * "nothing to worry about" and "one champion across your whole book", side by
   * side, both from the same function.
   *
   * An account with an open deal needs a champion whether or not anybody has
   * been recorded against it, so the universe comes from the deals as well.
   */
  const accountNames = new Set([
    ...stakeholders.map((stakeholder) => stakeholder.accountName),
    ...opportunities.filter((opportunity) => opportunity.status === 'Active').map((opportunity) => opportunity.accountName),
  ].filter(Boolean));
  const accountsWithMissingChampion = Array.from(accountNames).filter((accountName) => (
    !getStakeholdersForAccount(stakeholders, accountName).some((stakeholder) => stakeholder.stakeholderRole === 'Champion')
  )).length;
  /**
   * Stakeholders nobody can attribute. They count towards "Total" and towards
   * nothing else - not coverage, not risk - so without naming them the totals
   * and the coverage tiles look like they are describing different books.
   */
  const unattachedStakeholders = stakeholders.filter((stakeholder) => !stakeholder.accountName.trim()).length;
  const opportunitiesWithStakeholderRisk = opportunities.filter((opportunity) => (
    analyzeStakeholderCoverage(stakeholders, opportunity).warnings.length > 0
  )).length;

  return {
    totalStakeholders: stakeholders.length,
    champions: stakeholders.filter((stakeholder) => stakeholder.stakeholderRole === 'Champion').length,
    economicBuyers: stakeholders.filter((stakeholder) => normalizeMeddicRole(stakeholder.stakeholderRole) === 'Economic Buyer').length,
    blockers: stakeholders.filter((stakeholder) => normalizeMeddicRole(stakeholder.stakeholderRole) === 'Blocker' || stakeholder.stance === 'Resistant').length,
    highInfluence: stakeholders.filter((stakeholder) => stakeholder.influenceLevel === 'High').length,
    accountsWithMissingChampion,
    unattachedStakeholders,
    opportunitiesWithStakeholderRisk,
    strategicMapped: stakeholders.filter((stakeholder) => strategicRoles.includes(normalizeMeddicRole(stakeholder.stakeholderRole) as StakeholderRole)).length,
  };
}

/** The canonical fold - see accountIdentity.ts. This decides which stakeholders
 * belong to an account and to a deal, so a diacritic emptied the map. */
function sameText(a: string, b: string) {
  const left = normalizeEntityName(a);
  const right = normalizeEntityName(b);
  return Boolean(left && right && left === right);
}
