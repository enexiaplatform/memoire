import type {
  CrmLiteOpportunity,
  DecisionRecommendation,
  ForecastEvidenceCategory,
  OpportunityStage,
  OpportunityStatus,
} from './opportunityStore.ts';
import { todayDateKey } from '../utils/safeDate.ts';
import {
  claimLocalCollectionForUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
  upsertCloudJsonCollection,
} from './cloudJsonCollectionStore.ts';
import { invalidateWorkspaceDataCache } from './workspaceDataCache.ts';
import { sanitizeBusinessDate } from '../utils/safeDate.ts';

export const OPPORTUNITY_OUTCOME_STORAGE_KEY = 'memoire.opportunityOutcomes.v1';

export const opportunityOutcomes = ['Won', 'Lost', 'No decision', 'Delayed'] as const;
export const opportunityOutcomeReasonCategories = [
  'Price',
  'Technical fit',
  'Procurement',
  'Budget',
  'Competitor',
  'Relationship',
  'Timing',
  'No decision',
  'Other',
] as const;

export type OpportunityOutcome = (typeof opportunityOutcomes)[number];
export type OpportunityOutcomeReasonCategory = (typeof opportunityOutcomeReasonCategories)[number];

export type OpportunityOutcomeRecord = {
  id: string;
  userId?: string;
  opportunityId: string;
  accountName: string;
  opportunityName: string;
  outcome: OpportunityOutcome;
  outcomeDate: string;
  finalAmount: number | null;
  currency: string;
  forecastEvidenceCategoryBeforeOutcome: ForecastEvidenceCategory;
  decisionRecommendationBeforeOutcome: DecisionRecommendation;
  stageBeforeOutcome: OpportunityStage;
  reasonCategory: OpportunityOutcomeReasonCategory;
  reasonText: string;
  decisiveStakeholder?: string;
  objectionThatMattered?: string;
  evidenceThatWasMissing?: string;
  lessonLearned?: string;
  createdAt: string;
  updatedAt: string;
  storageMode: 'local' | 'cloud';
  source?: 'demo' | 'user';
  isSample?: boolean;
};

export type OpportunityOutcomeInput = Omit<OpportunityOutcomeRecord, 'id' | 'createdAt' | 'updatedAt' | 'storageMode'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  storageMode?: 'local' | 'cloud';
};

export type OpportunityOutcomeDraft = Pick<
  OpportunityOutcomeRecord,
  | 'outcome'
  | 'outcomeDate'
  | 'finalAmount'
  | 'currency'
  | 'reasonCategory'
  | 'reasonText'
  | 'decisiveStakeholder'
  | 'objectionThatMattered'
  | 'evidenceThatWasMissing'
  | 'lessonLearned'
>;

export function buildOpportunityOutcomeDraft(opportunity: CrmLiteOpportunity, patch: Partial<OpportunityOutcomeDraft> = {}): OpportunityOutcomeDraft {
  return {
    outcome: patch.outcome || 'Won',
    outcomeDate: sanitizeBusinessDate(patch.outcomeDate) || todayDateKey(),
    finalAmount: typeof patch.finalAmount === 'number' ? patch.finalAmount : opportunity.estimatedValue,
    currency: patch.currency || opportunity.currency || 'VND',
    reasonCategory: patch.reasonCategory || 'Other',
    reasonText: patch.reasonText || '',
    decisiveStakeholder: patch.decisiveStakeholder || '',
    objectionThatMattered: patch.objectionThatMattered || '',
    evidenceThatWasMissing: patch.evidenceThatWasMissing || '',
    lessonLearned: patch.lessonLearned || '',
  };
}

export function loadOpportunityOutcomes() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OPPORTUNITY_OUTCOME_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeOpportunityOutcome).filter((record): record is OpportunityOutcomeRecord => Boolean(record));
  } catch {
    return [];
  }
}

export async function loadOpportunityOutcomesForUser(userId: string) {
  const local = loadOpportunityOutcomes();
  const cloud = await loadCloudJsonCollection<OpportunityOutcomeRecord>('opportunity_outcomes', userId);
  const recordsToMerge = claimLocalCollectionForUser('opportunity_outcomes', userId) ? local : [];
  const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
    .map(sanitizeOpportunityOutcome)
    .filter((record): record is OpportunityOutcomeRecord => Boolean(record));
  persistOpportunityOutcomes(merged, false);
  await upsertCloudJsonCollection('opportunity_outcomes', userId, merged);
  return merged;
}

export function saveOpportunityOutcomes(outcomes: OpportunityOutcomeRecord[]) {
  return persistOpportunityOutcomes(outcomes, true);
}

function persistOpportunityOutcomes(outcomes: OpportunityOutcomeRecord[], syncCloud: boolean) {
  if (typeof window === 'undefined') return false;
  try {
    const sanitized = outcomes
      .map(sanitizeOpportunityOutcome)
      .filter((record): record is OpportunityOutcomeRecord => Boolean(record));
    window.localStorage.setItem(OPPORTUNITY_OUTCOME_STORAGE_KEY, JSON.stringify(sanitized));
    if (syncCloud) syncCloudJsonCollectionForCurrentUser('opportunity_outcomes', sanitized);
    invalidateWorkspaceDataCache();
    return true;
  } catch {
    return false;
  }
}

export function upsertOpportunityOutcome(input: OpportunityOutcomeInput) {
  const now = new Date().toISOString();
  const record = sanitizeOpportunityOutcome({
    ...input,
    id: input.id || createOpportunityOutcomeId(input.opportunityId, input.outcome),
    createdAt: input.createdAt || now,
    updatedAt: now,
    storageMode: input.storageMode || 'local',
  }) as OpportunityOutcomeRecord;

  const existing = loadOpportunityOutcomes();
  saveOpportunityOutcomes([
    record,
    ...existing.filter((item) => item.id !== record.id),
  ]);
  return record;
}

export function createOpportunityOutcomeFromOpportunity(
  opportunity: CrmLiteOpportunity,
  draft: OpportunityOutcomeDraft,
  userId?: string | null,
) {
  return upsertOpportunityOutcome({
    userId: userId || opportunity.userId,
    opportunityId: opportunity.id,
    accountName: opportunity.accountName,
    opportunityName: opportunity.opportunityName,
    outcome: draft.outcome,
    outcomeDate: draft.outcomeDate,
    finalAmount: draft.finalAmount,
    currency: draft.currency,
    forecastEvidenceCategoryBeforeOutcome: opportunity.forecastEvidenceCategory,
    decisionRecommendationBeforeOutcome: opportunity.decisionRecommendation,
    stageBeforeOutcome: opportunity.stage,
    reasonCategory: draft.reasonCategory,
    reasonText: draft.reasonText,
    decisiveStakeholder: draft.decisiveStakeholder,
    objectionThatMattered: draft.objectionThatMattered,
    evidenceThatWasMissing: draft.evidenceThatWasMissing,
    lessonLearned: draft.lessonLearned,
    source: opportunity.source || 'user',
    isSample: opportunity.isSample === true,
  });
}

export function getOpportunityOutcomesForOpportunity(
  outcomes: OpportunityOutcomeRecord[],
  opportunity: { id?: string; accountName?: string; opportunityName?: string },
) {
  const opportunityId = opportunity.id || '';
  const accountName = normalize(opportunity.accountName || '');
  const opportunityName = normalize(opportunity.opportunityName || '');

  return outcomes
    .filter((outcome) => (
      (opportunityId && outcome.opportunityId === opportunityId) ||
      (
        normalize(outcome.accountName) === accountName &&
        normalize(outcome.opportunityName) === opportunityName
      )
    ))
    .sort((left, right) => right.outcomeDate.localeCompare(left.outcomeDate) || right.updatedAt.localeCompare(left.updatedAt));
}

export function opportunityOutcomeToOpportunityStatus(outcome: OpportunityOutcome): OpportunityStatus {
  if (outcome === 'Won') return 'Won';
  if (outcome === 'Lost') return 'Lost';
  return 'On hold';
}

export function opportunityOutcomeToOpportunityStage(outcome: OpportunityOutcome, fallback: OpportunityStage): OpportunityStage {
  if (outcome === 'Won') return 'Won';
  if (outcome === 'Lost') return 'Lost';
  if (outcome === 'Delayed' || outcome === 'No decision') return 'On hold';
  return fallback;
}

function sanitizeOpportunityOutcome(raw: Partial<OpportunityOutcomeRecord> | null): OpportunityOutcomeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.opportunityId || !raw.accountName || !raw.opportunityName) return null;
  const now = new Date().toISOString();
  const outcome = isOutcome(raw.outcome) ? raw.outcome : 'No decision';

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createOpportunityOutcomeId(raw.opportunityId, outcome),
    userId: raw.userId || undefined,
    opportunityId: raw.opportunityId,
    accountName: raw.accountName,
    opportunityName: raw.opportunityName,
    outcome,
    outcomeDate: sanitizeBusinessDate(raw.outcomeDate) || now.slice(0, 10),
    finalAmount: typeof raw.finalAmount === 'number' && Number.isFinite(raw.finalAmount) ? raw.finalAmount : null,
    currency: raw.currency || 'VND',
    forecastEvidenceCategoryBeforeOutcome: isForecastEvidenceCategory(raw.forecastEvidenceCategoryBeforeOutcome)
      ? raw.forecastEvidenceCategoryBeforeOutcome
      : 'Weak but recoverable',
    decisionRecommendationBeforeOutcome: isDecisionRecommendation(raw.decisionRecommendationBeforeOutcome)
      ? raw.decisionRecommendationBeforeOutcome
      : 'Monitor',
    stageBeforeOutcome: isOpportunityStage(raw.stageBeforeOutcome) ? raw.stageBeforeOutcome : 'Discovery',
    reasonCategory: isReasonCategory(raw.reasonCategory) ? raw.reasonCategory : 'Other',
    reasonText: raw.reasonText || '',
    decisiveStakeholder: cleanOptional(raw.decisiveStakeholder),
    objectionThatMattered: cleanOptional(raw.objectionThatMattered),
    evidenceThatWasMissing: cleanOptional(raw.evidenceThatWasMissing),
    lessonLearned: cleanOptional(raw.lessonLearned),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    storageMode: raw.storageMode === 'cloud' ? 'cloud' : 'local',
    source: raw.source === 'demo' ? 'demo' : raw.source === 'user' ? 'user' : undefined,
    isSample: raw.isSample === true,
  };
}

function createOpportunityOutcomeId(opportunityId: string, outcome: OpportunityOutcome) {
  return `opp-outcome-${opportunityId}-${slugify(outcome)}-${Date.now()}`;
}

function isOutcome(value: unknown): value is OpportunityOutcome {
  return opportunityOutcomes.includes(value as OpportunityOutcome);
}

function isReasonCategory(value: unknown): value is OpportunityOutcomeReasonCategory {
  return opportunityOutcomeReasonCategories.includes(value as OpportunityOutcomeReasonCategory);
}

function isForecastEvidenceCategory(value: unknown): value is ForecastEvidenceCategory {
  return ['Defensible', 'Weak but recoverable', 'Hope-based', 'Unsupported'].includes(String(value));
}

function isDecisionRecommendation(value: unknown): value is DecisionRecommendation {
  return ['Defend', 'Downgrade', 'Rescue', 'Monitor', 'Deprioritize'].includes(String(value));
}

function isOpportunityStage(value: unknown): value is OpportunityStage {
  return ['Lead', 'Discovery', 'Qualification', 'Technical discussion', 'Demo', 'Proposal', 'Negotiation', 'Procurement', 'Won', 'Lost', 'On hold'].includes(String(value));
}

function cleanOptional(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function slugify(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) || 'outcome';
}
