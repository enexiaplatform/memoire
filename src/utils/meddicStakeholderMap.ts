import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { ObjectionRecord } from '../services/objectionStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import type {
  InfluenceLevel,
  RelationshipStrength,
  StakeholderRecord,
  StakeholderRole,
  StakeholderStance,
} from '../services/stakeholderStore.ts';
import { formatSafeBusinessDate, isBusinessDateOverdue, sanitizeBusinessDate } from './safeDate.ts';

export const meddicStakeholderRoles = [
  'Champion',
  'Economic Buyer',
  'Technical Buyer',
  'Procurement',
  'User',
  'Coach',
  'Blocker',
  'Decision Committee',
  'Unknown',
] as const;

export type MeddicStakeholderRole = (typeof meddicStakeholderRoles)[number];
export type MeddicStakeholderConfidence = 'confirmed' | 'inferred' | 'missing' | 'needs confirmation';

export type MeddicStakeholderMapItem = {
  stakeholderId?: string;
  accountName: string;
  opportunityName?: string;
  name: string;
  title?: string;
  role: MeddicStakeholderRole;
  influenceLevel: InfluenceLevel;
  relationshipStrength: RelationshipStrength;
  stance: StakeholderStance;
  lastInteractionDate: string;
  evidenceNote: string;
  openObjection?: string;
  nextAction?: string;
  confidence: MeddicStakeholderConfidence;
};

export type MeddicMissingRole = {
  role: MeddicStakeholderRole;
  reason: string;
};

export type MeddicStakeholderMap = {
  opportunityId: string;
  accountName: string;
  opportunityName: string;
  items: MeddicStakeholderMapItem[];
  missingRoles: MeddicMissingRole[];
  relationshipRisks: string[];
  objectionRisks: string[];
  stakeholderNextActions: {
    stakeholderName: string;
    action: string;
    dueDate: string;
    overdue: boolean;
  }[];
  briefStatusLines: string[];
  hasConfirmedChampion: boolean;
  hasConfirmedEconomicBuyer: boolean;
  hasProcurementPath: boolean;
  hasTechnicalBuyerOrUser: boolean;
};

export function buildMeddicStakeholderMap(input: {
  opportunity: CrmLiteOpportunity;
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
  today?: string;
}): MeddicStakeholderMap {
  const opportunity = input.opportunity;
  const today = sanitizeBusinessDate(input.today) || new Date().toISOString().slice(0, 10);
  const relatedStakeholders = (input.stakeholders || []).filter((stakeholder) => matchesOpportunity(stakeholder, opportunity));
  const relatedObjections = (input.objections || []).filter((objection) => matchesOpportunity(objection, opportunity));
  const relatedActivities = (input.activities || []).filter((activity) => matchesActivity(activity, opportunity));
  const items = relatedStakeholders.map((stakeholder) => mapStakeholder(stakeholder, relatedObjections, relatedActivities));
  const confirmedRoles = new Set(items.filter((item) => item.confidence === 'confirmed').map((item) => item.role));
  const knownRoles = new Set(items.filter((item) => item.confidence !== 'missing').map((item) => item.role));
  const hasProcurementPath = Boolean(opportunity.procurementPath.trim()) || confirmedRoles.has('Procurement');
  const hasTechnicalBuyerOrUser = confirmedRoles.has('Technical Buyer') || confirmedRoles.has('User') || Boolean(opportunity.technicalCriteria.trim());
  const missingRoles = buildMissingRoles({
    opportunity,
    confirmedRoles,
    knownRoles,
    hasProcurementPath,
    hasTechnicalBuyerOrUser,
  });
  const relationshipRisks = buildRelationshipRisks(items);
  const objectionRisks = buildObjectionRisks(items, relatedObjections);
  const stakeholderNextActions = buildStakeholderNextActions(items, relatedObjections, today);

  return {
    opportunityId: opportunity.id,
    accountName: opportunity.accountName || 'Needs confirmation',
    opportunityName: opportunity.opportunityName || 'Needs confirmation',
    items,
    missingRoles,
    relationshipRisks,
    objectionRisks,
    stakeholderNextActions,
    briefStatusLines: buildBriefStatusLines({ opportunity, items, missingRoles, hasProcurementPath, hasTechnicalBuyerOrUser }),
    hasConfirmedChampion: confirmedRoles.has('Champion'),
    hasConfirmedEconomicBuyer: confirmedRoles.has('Economic Buyer'),
    hasProcurementPath,
    hasTechnicalBuyerOrUser,
  };
}

export function normalizeMeddicRole(role: unknown): MeddicStakeholderRole {
  if (role === 'Economic buyer' || role === 'Decision maker') return 'Economic Buyer';
  if (role === 'Technical buyer' || role === 'Legal / QA / Compliance') return 'Technical Buyer';
  if (role === 'Influencer') return 'Coach';
  return meddicStakeholderRoles.includes(role as MeddicStakeholderRole) ? role as MeddicStakeholderRole : 'Unknown';
}

export function toStakeholderRole(role: MeddicStakeholderRole): StakeholderRole {
  return role as StakeholderRole;
}

export function getStakeholderNextActionFromNotes(notes = '') {
  const match = notes.match(/(?:^|\n)\s*next action\s*:\s*(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function setStakeholderNextActionInNotes(notes: string, nextAction: string) {
  const trimmed = notes.trim();
  const cleanAction = nextAction.trim();
  const withoutExisting = trimmed
    .split('\n')
    .filter((line) => !/^\s*next action\s*:/i.test(line))
    .join('\n')
    .trim();
  return [withoutExisting, cleanAction ? `Next action: ${cleanAction}` : ''].filter(Boolean).join('\n');
}

export function stripStakeholderNextActionFromNotes(notes = '') {
  return notes
    .split('\n')
    .filter((line) => !/^\s*next action\s*:/i.test(line))
    .join('\n')
    .trim();
}

export function formatMeddicStakeholderDate(value: string) {
  return formatSafeBusinessDate(value);
}

function mapStakeholder(
  stakeholder: StakeholderRecord,
  objections: ObjectionRecord[],
  activities: SalesActivityRecord[],
): MeddicStakeholderMapItem {
  const role = normalizeMeddicRole(stakeholder.stakeholderRole);
  const openObjection = objections.find((objection) => (
    objection.status === 'Open' &&
    (
      sameText(objection.stakeholderName, stakeholder.name) ||
      sameText(objection.accountName, stakeholder.accountName) ||
      sameText(objection.opportunityName, stakeholder.opportunityName)
    )
  ));
  const latestActivity = activities
    .filter((activity) => sameText(activity.contactName || activity.stakeholderName, stakeholder.name))
    .sort((left, right) => right.activityDate.localeCompare(left.activityDate))[0];
  const evidenceNote = stripStakeholderNextActionFromNotes(stakeholder.notes) || latestActivity?.summary || '';
  const nextAction = getStakeholderNextActionFromNotes(stakeholder.notes) || openObjection?.responsePlan || openObjection?.requiredProof || '';

  return {
    stakeholderId: stakeholder.id,
    accountName: stakeholder.accountName || 'Needs confirmation',
    opportunityName: stakeholder.opportunityName || '',
    name: stakeholder.name,
    title: stakeholder.roleTitle,
    role,
    influenceLevel: stakeholder.influenceLevel,
    relationshipStrength: stakeholder.relationshipStrength,
    stance: stakeholder.stance,
    lastInteractionDate: sanitizeBusinessDate(stakeholder.lastInteractionDate || latestActivity?.activityDate),
    evidenceNote,
    openObjection: openObjection?.objectionText,
    nextAction,
    confidence: getRoleConfidence(stakeholder, role),
  };
}

function getRoleConfidence(stakeholder: StakeholderRecord, role: MeddicStakeholderRole): MeddicStakeholderConfidence {
  if (role === 'Unknown') return 'needs confirmation';
  if (stakeholder.tags.includes('role-inferred')) return 'inferred';
  if (stakeholder.tags.includes('role-confirmed')) return 'confirmed';
  if (/confirmed|owns budget|signs off|champion|procurement owner|technical owner/i.test(stakeholder.notes)) return 'confirmed';
  return 'needs confirmation';
}

function buildMissingRoles(input: {
  opportunity: CrmLiteOpportunity;
  confirmedRoles: Set<MeddicStakeholderRole>;
  knownRoles: Set<MeddicStakeholderRole>;
  hasProcurementPath: boolean;
  hasTechnicalBuyerOrUser: boolean;
}) {
  const missing: MeddicMissingRole[] = [];
  if (!input.confirmedRoles.has('Champion')) {
    missing.push({
      role: 'Champion',
      reason: input.knownRoles.has('Champion') ? 'Champion exists but role is not confirmed.' : 'No confirmed champion mapped.',
    });
  }
  if (!input.confirmedRoles.has('Economic Buyer') && !input.opportunity.budgetOwner.trim() && !input.opportunity.decisionMaker.trim()) {
    missing.push({
      role: 'Economic Buyer',
      reason: input.knownRoles.has('Economic Buyer') ? 'Economic buyer exists but role is not confirmed.' : 'No confirmed economic buyer or budget owner mapped.',
    });
  }
  if (!input.hasProcurementPath) {
    missing.push({
      role: 'Procurement',
      reason: input.knownRoles.has('Procurement') ? 'Procurement owner exists but path is not confirmed.' : 'No named procurement owner or path captured.',
    });
  }
  if (!input.hasTechnicalBuyerOrUser) {
    missing.push({
      role: 'Technical Buyer',
      reason: input.knownRoles.has('Technical Buyer') ? 'Technical buyer exists but role is not confirmed.' : 'No confirmed technical buyer/user or technical criteria captured.',
    });
  }
  return missing;
}

function buildRelationshipRisks(items: MeddicStakeholderMapItem[]) {
  return [
    ...items.filter((item) => item.role === 'Blocker' || item.stance === 'Resistant').map((item) => `${item.name} is a blocker/resistant stakeholder.`),
    ...items.filter((item) => item.influenceLevel === 'High' && (item.relationshipStrength === 'Weak' || item.stance === 'Unknown')).map((item) => `${item.name} has high influence but weak/unknown relationship.`),
    items.length > 0 && items.every((item) => item.stance === 'Neutral' || item.stance === 'Unknown') ? 'No supportive stakeholder is confirmed.' : '',
  ].filter(Boolean);
}

function buildObjectionRisks(items: MeddicStakeholderMapItem[], objections: ObjectionRecord[]) {
  return [
    ...items.filter((item) => item.openObjection).map((item) => `${item.name}: ${item.openObjection}`),
    ...objections.filter((objection) => objection.status === 'Open' && !objection.stakeholderName).map((objection) => `${objection.objectionType}: ${objection.objectionText}`),
  ].filter(Boolean).slice(0, 5);
}

function buildStakeholderNextActions(items: MeddicStakeholderMapItem[], objections: ObjectionRecord[], today: string) {
  const fromItems = items.flatMap((item) => item.nextAction ? [{
    stakeholderName: item.name,
    action: item.nextAction,
    dueDate: '',
    overdue: false,
  }] : []);
  const fromObjections = objections.filter((objection) => objection.status === 'Open' && (objection.responsePlan || objection.requiredProof)).map((objection) => ({
    stakeholderName: objection.stakeholderName || objection.accountName || 'Needs confirmation',
    action: objection.responsePlan || objection.requiredProof,
    dueDate: sanitizeBusinessDate(objection.dueDate),
    overdue: isBusinessDateOverdue(objection.dueDate, today),
  }));
  return [...fromObjections, ...fromItems].slice(0, 6);
}

function buildBriefStatusLines(input: {
  opportunity: CrmLiteOpportunity;
  items: MeddicStakeholderMapItem[];
  missingRoles: MeddicMissingRole[];
  hasProcurementPath: boolean;
  hasTechnicalBuyerOrUser: boolean;
}) {
  const findRole = (role: MeddicStakeholderRole) => input.items.find((item) => item.role === role);
  const champion = findRole('Champion');
  const buyer = findRole('Economic Buyer');
  const technical = findRole('Technical Buyer') || findRole('User');
  return [
    formatRoleStatus('Champion', champion, 'No champion mapped yet.'),
    formatRoleStatus('Economic Buyer', buyer, input.opportunity.budgetOwner || input.opportunity.decisionMaker
      ? `Budget/decision owner field exists: ${input.opportunity.budgetOwner || input.opportunity.decisionMaker}. Role still needs confirmation.`
      : 'No economic buyer mapped yet.'),
    input.hasProcurementPath
      ? `Procurement: ${input.opportunity.procurementPath ? 'path captured' : 'owner mapped'}; verify owner/date before review.`
      : 'Procurement: missing. No named procurement owner yet.',
    input.hasTechnicalBuyerOrUser
      ? formatRoleStatus('Technical buyer/user', technical, input.opportunity.technicalCriteria || 'Technical criteria captured.')
      : 'Technical buyer/user: missing. No confirmed technical evaluator or user proof.',
    ...input.missingRoles.map((item) => `Missing evidence: ${item.role} — ${item.reason}`),
  ].filter(Boolean);
}

function formatRoleStatus(label: string, item: MeddicStakeholderMapItem | undefined, fallback: string) {
  if (!item) return `${label}: ${fallback}`;
  if (item.confidence === 'confirmed') return `${label}: confirmed — ${item.name}${item.evidenceNote ? ` (${firstSentence(item.evidenceNote)})` : ''}.`;
  if (item.confidence === 'inferred') return `${label}: inferred — ${item.name}. Needs confirmation before defending.`;
  return `${label}: needs confirmation. ${item.name} is known contact but role is not confirmed.`;
}

function matchesOpportunity(
  item: { accountName?: string; opportunityName?: string; opportunityId?: string },
  opportunity: CrmLiteOpportunity,
) {
  return (
    (item.opportunityId && item.opportunityId === opportunity.id) ||
    (sameText(item.opportunityName || '', opportunity.opportunityName) && sameText(item.accountName || '', opportunity.accountName)) ||
    (!item.opportunityName && sameText(item.accountName || '', opportunity.accountName))
  );
}

function matchesActivity(activity: SalesActivityRecord, opportunity: CrmLiteOpportunity) {
  return (
    activity.linkedOpportunityId === opportunity.id ||
    sameText(activity.linkedOpportunityName || activity.opportunityName, opportunity.opportunityName) ||
    sameText(activity.linkedAccountName || activity.accountName, opportunity.accountName)
  );
}

function sameText(a = '', b = '') {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

function firstSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed;
}
