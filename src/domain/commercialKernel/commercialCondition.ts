import { projectCurrentEvidence, type CommercialEvidence } from './commercialEvidence.ts';
import { sourceTypes, type SourceMetadata } from './types.ts';
import { isValidBusinessDate } from '../../utils/safeDate.ts';

export const conditionCategories = ['commercial', 'technical', 'financial', 'decision', 'delivery', 'other'] as const;
export const conditionIntents = ['assumed', 'hypothesis'] as const;
export const conditionLifecycles = ['active', 'retired'] as const;
export const conditionAssessments = ['supports', 'contradicts'] as const;
export type ConditionIntent = typeof conditionIntents[number];
export type ConditionState = 'supported' | 'assumed' | 'hypothesis' | 'contradicted' | 'unknown';

/** Owned by the condition aggregate: an assessment, never a copy of evidence.
 * Explicit replacement is proposition-specific; a newer independent source
 * must not erase a conflict. Links are appended, never silently rewritten. */
export type ConditionEvidenceLink = {
  evidenceId: string;
  assessment: typeof conditionAssessments[number];
  recordedAt: string;
  supersedesEvidenceId?: string | null;
};
export type CommercialCondition = SourceMetadata & {
  id: string;
  userId: string | null;
  accountId: string;
  opportunityId?: string | null;
  statement: string;
  conditionCategory: typeof conditionCategories[number];
  intent: ConditionIntent;
  lifecycle: typeof conditionLifecycles[number];
  /** Omitted when the business-effective day is not known. */
  validFrom?: string | null;
  createdAt: string;
  updatedAt: string;
  isSample?: boolean;
  evidenceLinks: ConditionEvidenceLink[];
};

const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)
  && isValidBusinessDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
/** Strict codec boundary: no invented IDs, dates, meaning or provenance. */
export function isCommercialCondition(value: unknown): value is CommercialCondition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as CommercialCondition;
  if (!nonempty(r.id) || r.id.length > 200 || !nonempty(r.accountId) || !nonempty(r.statement) || r.statement.length > 1000
    || !(r.userId === null || nonempty(r.userId)) || (r.opportunityId != null && !nonempty(r.opportunityId))
    || !conditionCategories.includes(r.conditionCategory) || !conditionIntents.includes(r.intent)
    || !conditionLifecycles.includes(r.lifecycle) || !sourceTypes.includes(r.sourceType)
    || !instant(r.createdAt) || !instant(r.updatedAt) || Date.parse(r.updatedAt) < Date.parse(r.createdAt)
    || (r.validFrom != null && !isValidBusinessDate(r.validFrom))
    || (r.sourceId != null && typeof r.sourceId !== 'string') || (r.sourceUrl != null && typeof r.sourceUrl !== 'string')
    || (r.sourceUpdatedAt != null && !instant(r.sourceUpdatedAt))
    || !Array.isArray(r.evidenceLinks) || r.evidenceLinks.length > 200) return false;
  const seen = new Set<string>();
  const replaced = new Set<string>();
  for (const link of r.evidenceLinks) {
    if (!link || typeof link !== 'object' || Array.isArray(link)
      || Object.keys(link).some(key => !['evidenceId','assessment','recordedAt','supersedesEvidenceId'].includes(key))
      || !nonempty(link.evidenceId) || seen.has(link.evidenceId)
      || !conditionAssessments.includes(link.assessment) || !instant(link.recordedAt) || Date.parse(link.recordedAt) < Date.parse(r.createdAt)
      || (link.supersedesEvidenceId != null && (!seen.has(link.supersedesEvidenceId) || replaced.has(link.supersedesEvidenceId)))) return false;
    seen.add(link.evidenceId);
    if (link.supersedesEvidenceId) replaced.add(link.supersedesEvidenceId);
  }
  return true;
}

export function evidenceMatchesCondition(condition: CommercialCondition, evidence: CommercialEvidence): boolean {
  return condition.userId === evidence.userId && Boolean(condition.isSample) === Boolean(evidence.isSample)
    && (condition.accountId === evidence.accountId || (!evidence.accountId && Boolean(condition.opportunityId) && evidence.opportunityId === condition.opportunityId))
    && (!evidence.opportunityId || evidence.opportunityId === condition.opportunityId);
}
export type ConditionReading = {
  condition: CommercialCondition;
  state: Exclude<ConditionState, 'unknown'>;
  supporting: CommercialEvidence[];
  conflicting: CommercialEvidence[];
  historical: CommercialEvidence[];
  unresolvedEvidenceIds: string[];
};
/** Build once per workspace, O(evidence + conditions + links). No per-card scans. */
export function projectCommercialConditions(conditions: CommercialCondition[], evidence: CommercialEvidence[]) {
  const byId = new Map(evidence.map(e => [e.id, e]));
  const supersession = projectCurrentEvidence(evidence, 'same_source');
  const readings = new Map<string, ConditionReading>();
  for (const condition of conditions) {
    const reading: ConditionReading = { condition, state: condition.intent, supporting: [], conflicting: [], historical: [], unresolvedEvidenceIds: [] };
    const replaced = new Set(condition.evidenceLinks.map(link => link.supersedesEvidenceId).filter(Boolean));
    for (const link of condition.evidenceLinks) {
      const item = byId.get(link.evidenceId);
      if (!item || !evidenceMatchesCondition(condition, item)) { reading.unresolvedEvidenceIds.push(link.evidenceId); continue; }
      if (replaced.has(item.id) || supersession.supersededIds.has(item.id)) reading.historical.push(item);
      else if (link.assessment === 'supports') reading.supporting.push(item);
      else reading.conflicting.push(item);
    }
    reading.state = reading.conflicting.length ? 'contradicted' : reading.supporting.length ? 'supported' : condition.intent;
    readings.set(condition.id, reading);
  }
  return readings;
}
/** Absence is not an invented persisted "unknown" proposition. */
export function conditionStateFor(readings: Map<string, ConditionReading>, id: string): ConditionState {
  return readings.get(id)?.state ?? 'unknown';
}
