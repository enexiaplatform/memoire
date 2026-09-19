import { sourceTypes, type SourceMetadata } from './types.ts';
import { isValidBusinessDate } from '../../utils/safeDate.ts';
import { projectCommercialConditions, type CommercialCondition, type ConditionReading, type ConditionState } from './commercialCondition.ts';
import type { CommercialEvidence } from './commercialEvidence.ts';

export const requirementRoles = ['required_now', 'required_later', 'context'] as const;
export type RequirementRole = typeof requirementRoles[number];
export type OutcomeRequirement = SourceMetadata & {
  id: string; userId: string | null; accountId: string; opportunityId: string;
  /** What must be known or true; this is not an asserted Condition. */
  expectedOutcome: string;
  question: string | null;
  conditionId: string | null;
  role: RequirementRole;
  lifecycle: 'active' | 'retired';
  createdAt: string; updatedAt: string; isSample?: boolean;
};
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)
  && isValidBusinessDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
export function isOutcomeRequirement(value: unknown): value is OutcomeRequirement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as OutcomeRequirement;
  return nonempty(r.id) && r.id.length <= 200 && (r.userId === null || nonempty(r.userId))
    && nonempty(r.accountId) && nonempty(r.opportunityId)
    && nonempty(r.expectedOutcome) && r.expectedOutcome.length <= 1000
    && (r.question === null || (nonempty(r.question) && r.question.length <= 1000))
    && (r.conditionId === null || nonempty(r.conditionId))
    && requirementRoles.includes(r.role) && ['active', 'retired'].includes(r.lifecycle)
    && sourceTypes.includes(r.sourceType) && (r.sourceId == null || typeof r.sourceId === 'string')
    && (r.sourceUrl == null || typeof r.sourceUrl === 'string')
    && (r.sourceUpdatedAt == null || instant(r.sourceUpdatedAt))
    && instant(r.createdAt) && instant(r.updatedAt) && Date.parse(r.updatedAt) >= Date.parse(r.createdAt);
}
export type RequirementReading = {
  requirement: OutcomeRequirement;
  condition: CommercialCondition | null;
  conditionState: ConditionState;
  resolution: 'resolved' | 'unresolved' | 'conflicted';
  sourceEvidenceIds: string[];
  reasonCode: 'REQUIREMENT_UNKNOWN' | 'REQUIREMENT_ASSUMED' | 'REQUIREMENT_HYPOTHESIS' | 'REQUIREMENT_CONTRADICTED' | 'REQUIREMENT_RESOLVED';
};
/** One indexed projection for a book; no persisted health flag or fake unknown Condition. */
export function projectOutcomeRequirements(requirements: OutcomeRequirement[], conditions: CommercialCondition[], evidence: CommercialEvidence[]): RequirementReading[] {
  const byCondition = projectCommercialConditions(conditions, evidence);
  return requirements.map(requirement => {
    const candidate: ConditionReading | undefined = requirement.conditionId ? byCondition.get(requirement.conditionId) : undefined;
    const reading = candidate && candidate.condition.lifecycle === 'active'
      && candidate.condition.userId === requirement.userId
      && Boolean(candidate.condition.isSample) === Boolean(requirement.isSample)
      && candidate.condition.accountId === requirement.accountId
      && (!candidate.condition.opportunityId || candidate.condition.opportunityId === requirement.opportunityId)
      ? candidate : undefined;
    const conditionState = reading?.state || 'unknown';
    const reasonCode = ({ unknown: 'REQUIREMENT_UNKNOWN', assumed: 'REQUIREMENT_ASSUMED', hypothesis: 'REQUIREMENT_HYPOTHESIS',
      contradicted: 'REQUIREMENT_CONTRADICTED', supported: 'REQUIREMENT_RESOLVED' } as const)[conditionState];
    return { requirement, condition: reading?.condition || null, conditionState,
      resolution: conditionState === 'supported' ? 'resolved' as const : conditionState === 'contradicted' ? 'conflicted' as const : 'unresolved' as const,
      sourceEvidenceIds: reading ? [...reading.supporting, ...reading.conflicting].map(e => e.id) : [], reasonCode };
  });
}

/** Opportunity-local ordering. No numeric score, deadline, or inferred authority. */
export function nextBestQuestion(readings: RequirementReading[]): RequirementReading | null {
  const roleOrder: Record<RequirementRole, number> = { required_now: 0, required_later: 1, context: 2 };
  const stateOrder: Record<ConditionState, number> = { contradicted: 0, unknown: 1, assumed: 2, hypothesis: 3, supported: 4 };
  return readings.filter(r => r.requirement.lifecycle === 'active' && r.resolution !== 'resolved')
    .sort((a,b) => roleOrder[a.requirement.role] - roleOrder[b.requirement.role]
      || stateOrder[a.conditionState] - stateOrder[b.conditionState]
      || a.requirement.createdAt.localeCompare(b.requirement.createdAt)
      || a.requirement.id.localeCompare(b.requirement.id))[0] || null;
}
export function requirementQuestion(reading: RequirementReading): string {
  return reading.requirement.question || `Confirm whether: ${reading.requirement.expectedOutcome}`;
}
