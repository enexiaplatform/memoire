import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord, StakeholderRole } from '../services/stakeholderStore';

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

const strategicRoles: StakeholderRole[] = ['Champion', 'Economic buyer', 'Technical buyer', 'Procurement', 'Decision maker'];

export function analyzeStakeholderCoverage(stakeholders: StakeholderRecord[], opportunity?: CrmLiteOpportunity | null): StakeholderCoverage {
  const relevant = opportunity ? getStakeholdersForOpportunity(stakeholders, opportunity) : stakeholders;
  const hasRole = (role: StakeholderRole) => relevant.some((stakeholder) => stakeholder.stakeholderRole === role);
  const blockerExists = relevant.some((stakeholder) => stakeholder.stakeholderRole === 'Blocker' || stakeholder.stance === 'Resistant');
  const allNeutralOrUnknown = relevant.length > 0 && relevant.every((stakeholder) => stakeholder.stance === 'Neutral' || stakeholder.stance === 'Unknown');

  const coverage = {
    missingChampion: !hasRole('Champion'),
    missingEconomicBuyer: !hasRole('Economic buyer'),
    missingProcurement: !hasRole('Procurement'),
    missingTechnicalBuyer: !hasRole('Technical buyer'),
    blockerExists,
    decisionMakerUnknown: !opportunity?.decisionMaker && !hasRole('Decision maker'),
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
    const key = `${candidate.accountName.toLowerCase()}::${candidate.name.toLowerCase()}`;
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
  const accountNames = new Set(stakeholders.map((stakeholder) => stakeholder.accountName).filter(Boolean));
  const accountsWithMissingChampion = Array.from(accountNames).filter((accountName) => (
    !getStakeholdersForAccount(stakeholders, accountName).some((stakeholder) => stakeholder.stakeholderRole === 'Champion')
  )).length;
  const opportunitiesWithStakeholderRisk = opportunities.filter((opportunity) => (
    analyzeStakeholderCoverage(stakeholders, opportunity).warnings.length > 0
  )).length;

  return {
    totalStakeholders: stakeholders.length,
    champions: stakeholders.filter((stakeholder) => stakeholder.stakeholderRole === 'Champion').length,
    economicBuyers: stakeholders.filter((stakeholder) => stakeholder.stakeholderRole === 'Economic buyer').length,
    blockers: stakeholders.filter((stakeholder) => stakeholder.stakeholderRole === 'Blocker' || stakeholder.stance === 'Resistant').length,
    highInfluence: stakeholders.filter((stakeholder) => stakeholder.influenceLevel === 'High').length,
    accountsWithMissingChampion,
    opportunitiesWithStakeholderRisk,
    strategicMapped: stakeholders.filter((stakeholder) => strategicRoles.includes(stakeholder.stakeholderRole)).length,
  };
}

function sameText(a: string, b: string) {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}
