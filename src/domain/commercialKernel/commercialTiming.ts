import { isValidBusinessDate } from '../../utils/safeDate.ts';
import type { CommercialCommitment } from './types.ts';
import type { CommercialEvidence } from './commercialEvidence.ts';
import type { OutcomeRequirement } from './outcomeRequirement.ts';
import type { CrmLiteOpportunity } from '../../services/opportunityStore.ts';

/** One operator-confirmed temporal assertion, never a calculated date. The
 * three kinds reference the canonical owner of a date instead of copying it. */
export type CommercialTimingAssertion = {
  id: string;
  userId: string | null;
  opportunityId: string;
  requirementId: string;
  kind: 'target_anchor' | 'duration' | 'commitment_link';
  basis: string;
  lifecycle: 'active' | 'retired';
  durationDays: number | null;
  durationUnit: 'calendar_days' | 'business_days' | null;
  epistemic: 'supported' | 'assumed' | null;
  sourceKind: 'contract' | 'customer_or_supplier' | 'internal_sla' | 'planning_assumption' | null;
  sourceReference: string | null;
  evidenceId: string | null;
  commitmentId: string | null;
  sourceType: 'manual';
  createdAt: string;
  updatedAt: string;
  isSample?: boolean;
};

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
  && isValidBusinessDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
export function isCommercialTimingAssertion(value: unknown): value is CommercialTimingAssertion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as CommercialTimingAssertion;
  if (!nonempty(r.id) || r.id.length > 200 || (r.userId !== null && !nonempty(r.userId))
    || !nonempty(r.opportunityId) || !nonempty(r.requirementId) || !nonempty(r.basis) || r.basis.length > 1000
    || !['active', 'retired'].includes(r.lifecycle) || r.sourceType !== 'manual'
    || !instant(r.createdAt) || !instant(r.updatedAt) || Date.parse(r.updatedAt) < Date.parse(r.createdAt)) return false;
  if (r.kind === 'target_anchor') return r.durationDays == null && r.durationUnit == null && r.epistemic == null
    && r.sourceKind == null && r.sourceReference == null && r.evidenceId == null && r.commitmentId == null;
  if (r.kind === 'commitment_link') return nonempty(r.commitmentId) && r.durationDays == null && r.durationUnit == null
    && r.epistemic == null && r.sourceKind == null && r.sourceReference == null && r.evidenceId == null;
  if (r.kind !== 'duration') return false;
  if (!Number.isInteger(r.durationDays) || (r.durationDays as number) < 0 || (r.durationDays as number) > 3650
    || !['calendar_days', 'business_days'].includes(r.durationUnit || '') || r.commitmentId != null) return false;
  if (r.epistemic === 'assumed') return r.sourceKind === 'planning_assumption' && r.sourceReference == null && r.evidenceId == null;
  return r.epistemic === 'supported' && ['contract', 'customer_or_supplier', 'internal_sla'].includes(r.sourceKind || '')
    && nonempty(r.sourceReference) && (r.evidenceId == null || nonempty(r.evidenceId));
}

export type TimingReferenceIndex = {
  opportunities: CrmLiteOpportunity[];
  requirements: OutcomeRequirement[];
  commitments: CommercialCommitment[];
  evidence: CommercialEvidence[];
};

/** Shared command/restore preflight. Historical rows retain their endpoints;
 * only active rows with active endpoints enter the current projection. */
export function validateTimingAssertions(assertions: CommercialTimingAssertion[], refs: TimingReferenceIndex): void {
  const opportunities = new Map(refs.opportunities.map(r => [r.id, r]));
  const requirements = new Map(refs.requirements.map(r => [r.id, r]));
  const commitments = new Map(refs.commitments.map(r => [r.id, r]));
  const evidence = new Map(refs.evidence.map(r => [r.id, r]));
  const ids = new Set<string>();
  const anchors = new Set<string>();
  const links = new Set<string>();
  for (const row of assertions) {
    if (!isCommercialTimingAssertion(row)) throw new Error('Invalid commercial timing assertion.');
    if (ids.has(row.id)) throw new Error('Duplicate timing identity.');
    ids.add(row.id);
    const opportunity = opportunities.get(row.opportunityId), requirement = requirements.get(row.requirementId);
    if (!opportunity || !requirement || (opportunity.userId ?? null) !== row.userId || requirement.userId !== row.userId
      || requirement.opportunityId !== row.opportunityId || Boolean(opportunity.isSample) !== Boolean(row.isSample)
      || Boolean(requirement.isSample) !== Boolean(row.isSample)) throw new Error('Timing must reference a Requirement in this Opportunity and workspace.');
    if (row.kind === 'commitment_link') {
      const commitment = commitments.get(row.commitmentId!);
      if (!commitment || commitment.userId !== row.userId || commitment.opportunityId !== row.opportunityId
        || commitment.accountId !== requirement.accountId
        || Boolean(commitment.isSample) !== Boolean(row.isSample)) throw new Error('Timing Commitment is missing or belongs to another Opportunity.');
    }
    if (row.evidenceId) {
      const item = evidence.get(row.evidenceId);
      if (!item || item.userId !== row.userId || item.accountId !== requirement.accountId
        || (item.opportunityId && item.opportunityId !== row.opportunityId)
        || Boolean(item.isSample) !== Boolean(row.isSample)) throw new Error('Timing Evidence is missing or outside this Opportunity.');
    }
    if (row.lifecycle !== 'active' || requirement.lifecycle !== 'active') continue;
    if (row.kind === 'target_anchor') {
      if (requirement.role !== 'required_now') throw new Error('Only a required-now outcome may anchor the close target.');
      const key = JSON.stringify([row.userId, row.opportunityId, Boolean(row.isSample)]);
      if (anchors.has(key)) throw new Error('Only one current close-target anchor is allowed per Opportunity.');
      anchors.add(key);
    }
    if (row.kind === 'commitment_link') {
      const key = JSON.stringify([row.userId, row.requirementId, row.commitmentId]);
      if (links.has(key)) throw new Error('This Commitment is already linked to the Requirement.');
      links.add(key);
    }
  }
}
