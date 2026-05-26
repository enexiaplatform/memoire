import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import {
  emptyObjectionInput,
  type ObjectionFormInput,
  type ObjectionImpact,
  type ObjectionRecord,
  type ObjectionStatus,
  type ObjectionType,
} from '../services/objectionStore';

export type ObjectionCandidate = {
  objectionType: ObjectionType;
  objectionText: string;
  impact: ObjectionImpact;
  reason: string;
  requiredProof: string;
};

export function classifyObjectionType(text: string): ObjectionType {
  const lower = text.toLowerCase();
  if (/lead time|delivery|deliver|timeline|shipment|late|delay/.test(lower)) return 'Lead time';
  if (/price|expensive|cost|discount|quotation|quote too high/.test(lower)) return 'Price';
  if (/budget|approval|funding/.test(lower)) return 'Budget';
  if (/iq\/oq\/pq|iq|oq|pq|validation|compliance|gmp|eugmp|eu-gmp/.test(lower)) return 'Compliance / validation';
  if (/document|certificate|paperwork|dossier|proof/.test(lower)) return 'Documentation';
  if (/support|service|local support|after-sales|after sales/.test(lower)) return 'Local support';
  if (/competitor|steris|biom[eé]rieux|vendor|other vendor/.test(lower)) return 'Competitor';
  if (/procurement|tender|bid|purchase process|po\b/.test(lower)) return 'Procurement';
  if (/technical|fit|spec|criteria|workflow|integration/.test(lower)) return 'Technical fit';
  if (/trust|relationship|confidence|risk/.test(lower)) return 'Trust / relationship';
  if (/timing|next quarter|this quarter|schedule|calendar/.test(lower)) return 'Timing';
  return 'Other';
}

export function detectObjectionCandidatesFromActivity(activity: SalesActivityRecord): ObjectionCandidate[] {
  const text = [
    activity.rawNote,
    activity.summary,
    activity.risks?.join(' '),
    activity.competitors?.join(' '),
  ].join(' ');
  const candidates: ObjectionCandidate[] = [];

  const signalPatterns: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /worried|concern|lăn tăn|hesitat|block|risk|unclear|not confirmed|still in the loop/i, reason: 'risk or concern language was captured' },
    { pattern: /lead time|delivery|timeline|delay/i, reason: 'lead time or timing concern was captured' },
    { pattern: /competitor|STERIS|BioM[eé]rieux|other vendor/i, reason: 'competitor pressure was captured' },
    { pattern: /procurement|tender|committee|approval path/i, reason: 'procurement uncertainty was captured' },
    { pattern: /validation|documentation|IQ\/OQ\/PQ|proof|compliance/i, reason: 'proof or validation requirement was captured' },
    { pattern: /support|local support|service/i, reason: 'support confidence concern was captured' },
  ];

  const matched = signalPatterns.find((item) => item.pattern.test(text));
  if (matched || activity.activityType === 'Objection handling' || (activity.risks || []).length > 0 || (activity.competitors || []).length > 0) {
    const objectionType = classifyObjectionType(text);
    candidates.push({
      objectionType,
      objectionText: buildCandidateText(activity, objectionType),
      impact: (activity.risks || []).length > 0 || objectionType === 'Competitor' || objectionType === 'Procurement' ? 'Medium' : 'Unknown',
      reason: matched?.reason || 'activity contains objection-handling context',
      requiredProof: inferRequiredProof(text, objectionType),
    });
  }

  return candidates.slice(0, 3);
}

export function buildObjectionFromActivity(
  activity: SalesActivityRecord,
  opportunity?: CrmLiteOpportunity,
  stakeholder?: StakeholderRecord,
): ObjectionFormInput {
  const candidate = detectObjectionCandidatesFromActivity(activity)[0];
  const type = candidate?.objectionType || classifyObjectionType(`${activity.rawNote} ${activity.summary}`);
  return {
    ...emptyObjectionInput,
    accountName: opportunity?.accountName || activity.linkedAccountName || activity.accountName || '',
    opportunityId: opportunity?.id || activity.linkedOpportunityId || '',
    opportunityName: opportunity?.opportunityName || activity.linkedOpportunityName || activity.opportunityName || '',
    stakeholderId: stakeholder?.id || '',
    stakeholderName: stakeholder?.name || activity.stakeholderName || activity.contactName || '',
    sourceActivityId: activity.id,
    objectionType: type,
    objectionText: candidate?.objectionText || buildCandidateText(activity, type),
    impact: candidate?.impact || 'Medium',
    status: 'Open',
    requiredProof: candidate?.requiredProof || inferRequiredProof(activity.rawNote, type),
    responsePlan: activity.nextAction || '',
    dueDate: activity.dueDate || '',
    tags: ['from-capture', normalizeTag(type)],
  };
}

export function getObjectionsForAccount(objections: ObjectionRecord[], account: { id?: string; accountName?: string } | string) {
  const accountId = typeof account === 'string' ? '' : account.id || '';
  const accountName = normalizeName(typeof account === 'string' ? account : account.accountName || '');
  return objections.filter((objection) => (
    (accountId && objection.accountId === accountId) ||
    (accountName && normalizeName(objection.accountName) === accountName)
  ));
}

export function getObjectionsForOpportunity(objections: ObjectionRecord[], opportunity: CrmLiteOpportunity | { id?: string; opportunityName?: string; accountName?: string }) {
  const opportunityName = normalizeName(opportunity.opportunityName || '');
  const accountName = normalizeName(opportunity.accountName || '');
  return objections.filter((objection) => (
    (opportunity.id && objection.opportunityId === opportunity.id) ||
    (opportunityName && normalizeName(objection.opportunityName) === opportunityName && (!accountName || normalizeName(objection.accountName) === accountName))
  ));
}

export function analyzeObjectionLedger(objections: ObjectionRecord[]) {
  const open = objections.filter((objection) => objection.status === 'Open');
  const addressed = objections.filter((objection) => objection.status === 'Addressed');
  const resolved = objections.filter((objection) => objection.status === 'Resolved');
  const typeCounts = countBy(objections.map((objection) => objection.objectionType));
  const mostCommonType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
  const opportunitiesWithOpenObjectionDebt = new Set(open.map((objection) => `${normalizeName(objection.accountName)}|${normalizeName(objection.opportunityName)}`).filter((key) => key !== '|')).size;

  return {
    totalObjections: objections.length,
    openObjections: open.length,
    highImpactOpenObjections: open.filter((objection) => objection.impact === 'High').length,
    addressedButUnresolved: addressed.length,
    resolvedObjections: resolved.length,
    mostCommonType,
    opportunitiesWithOpenObjectionDebt,
  };
}

export function getOpenObjectionDebt(objections: ObjectionRecord[]) {
  return objections.filter((objection) => objection.status === 'Open' || objection.status === 'Addressed');
}

export function summarizeObjectionsForPipeline(objections: ObjectionRecord[]) {
  const open = getOpenObjectionDebt(objections);
  if (open.length === 0) return '';
  return open
    .map((objection) => `${objection.objectionType}: ${objection.objectionText}${objection.requiredProof ? ` Required proof: ${objection.requiredProof}` : ''}`)
    .join('\n');
}

export function objectionStatusTone(status: ObjectionStatus): 'green' | 'amber' | 'red' | 'gray' {
  if (status === 'Resolved') return 'green';
  if (status === 'Addressed') return 'amber';
  if (status === 'Parked') return 'gray';
  return 'red';
}

function buildCandidateText(activity: SalesActivityRecord, objectionType: ObjectionType) {
  const risks = activity.risks || [];
  const competitors = activity.competitors || [];
  if (risks.length > 0) return risks.join('; ');
  if (competitors.length > 0) return `Competitor pressure: ${competitors.join(', ')}`;
  if (activity.summary) return activity.summary;
  return `${objectionType} objection captured from activity.`;
}

function inferRequiredProof(text: string, objectionType: ObjectionType) {
  const lower = text.toLowerCase();
  if (objectionType === 'Lead time') return 'Provide confirmed delivery timeline or local availability proof.';
  if (objectionType === 'Price' || objectionType === 'Budget') return 'Prepare value proof, revised quote, or budget approval path.';
  if (objectionType === 'Documentation') return 'Send required documentation, certificates, or customer-ready proof pack.';
  if (objectionType === 'Compliance / validation') return 'Provide validation evidence, IQ/OQ/PQ support, or compliance references.';
  if (objectionType === 'Local support') return 'Provide local support plan, SLA, owner, and escalation path.';
  if (objectionType === 'Competitor') return 'Prepare differentiator proof against the named competitor.';
  if (objectionType === 'Procurement') return 'Clarify procurement path, tender timing, and committee owner.';
  if (/proof|evidence|reference/.test(lower)) return 'Collect the requested proof or reference before the next customer touch.';
  return 'Define the proof or response needed to close this objection.';
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTag(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
