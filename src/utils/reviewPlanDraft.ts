import type { PlanRecord } from './weeklyPlan.ts';
import { normalizeSearchText } from './textSearch.ts';

export type ReviewPlanOrigin = { proposalId: string; sourceRecordIds: string[] };
export type ReviewPlanHandoff = ReviewPlanOrigin & { scope: string };

export function readReviewPlanOrigin(value: unknown): ReviewPlanOrigin | undefined {
  if (!value || typeof value !== 'object') return;
  const { proposalId, sourceRecordIds } = value as Partial<ReviewPlanOrigin>;
  const boundedId = (id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()) && id.length <= 300;
  if (!boundedId(proposalId) || !Array.isArray(sourceRecordIds) || !sourceRecordIds.length
      || sourceRecordIds.length > 50 || !sourceRecordIds.every(boundedId)) return;
  return { proposalId, sourceRecordIds: [...new Set(sourceRecordIds)] };
}

export function readReviewPlanHandoff(state: unknown): ReviewPlanHandoff | undefined {
  if (!state || typeof state !== 'object' || !('reviewPlanDraft' in state)) return;
  const value = state.reviewPlanDraft;
  const origin = readReviewPlanOrigin(value);
  const scope = (value as Partial<ReviewPlanHandoff> | null)?.scope;
  if (origin && typeof scope === 'string' && scope.length <= 300) return { ...origin, scope };
}

export function matchingReviewPlanItem(
  records: readonly PlanRecord[],
  candidate: Pick<PlanRecord, 'label' | 'date' | 'tag' | 'linkedOpportunityId' | 'linkedAccountName' | 'reviewProposal'>,
  sampleWorkspace: boolean,
) {
  const normalized = normalizeSearchText(candidate.label);
  return records.find(row => !row.__deleted && !row.dismissed
    && Boolean(row.isSample || row.source === 'demo') === sampleWorkspace
    && ((candidate.reviewProposal && row.reviewProposal?.proposalId === candidate.reviewProposal.proposalId)
      || (!row.done && row.date === candidate.date
        && (row.linkedOpportunityId || '') === (candidate.linkedOpportunityId || '')
        && normalizeSearchText(row.linkedAccountName || row.tag) === normalizeSearchText(candidate.linkedAccountName || candidate.tag)
        && normalizeSearchText(row.label) === normalized)));
}

export function reviewPlanStatus(record: PlanRecord, linkedActivityId?: string) {
  if (!record.done) return 'planned';
  return record.completionRevision && linkedActivityId && record.completionActivityId === linkedActivityId
    ? 'verified_done' : 'reported_done';
}
