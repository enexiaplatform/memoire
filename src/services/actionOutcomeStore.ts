import type { OpportunityRecommendedAction } from '../utils/opportunityActionPlan';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';

export const ACTION_OUTCOME_STORAGE_KEY = 'memoire.actionOutcomes.v1';

export type ActionOutcomeStatus = 'Suggested' | 'Accepted' | 'Done' | 'Dismissed';

export type ActionOutcomeType =
  | 'Improved'
  | 'Worsened'
  | 'No change'
  | 'Still unclear'
  | 'Resolved'
  | 'Downgrade recommended';

export type ActionOutcomeRecord = {
  id: string;
  opportunityId: string;
  opportunityName: string;
  accountName: string;
  actionTitle: string;
  actionSourceType: string;
  status: ActionOutcomeStatus;
  outcomeType: ActionOutcomeType;
  outcomeNote: string;
  relatedStakeholderName?: string;
  relatedObjectionId?: string;
  relatedGap?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
};

export type ActionOutcomeInput = Omit<ActionOutcomeRecord, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const actionOutcomeTypes: ActionOutcomeType[] = [
  'Improved',
  'Worsened',
  'No change',
  'Still unclear',
  'Resolved',
  'Downgrade recommended',
];

export function loadActionOutcomes() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ACTION_OUTCOME_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeOutcome).filter(Boolean) as ActionOutcomeRecord[];
  } catch {
    return [];
  }
}

export function saveActionOutcomes(outcomes: ActionOutcomeRecord[]) {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(ACTION_OUTCOME_STORAGE_KEY, JSON.stringify(outcomes.map(sanitizeOutcome).filter(Boolean)));
    invalidateWorkspaceDataCache();
    return true;
  } catch {
    return false;
  }
}

export function upsertActionOutcome(input: ActionOutcomeInput) {
  const now = new Date().toISOString();
  const outcome: ActionOutcomeRecord = sanitizeOutcome({
    ...input,
    id: input.id || createOutcomeId(input.opportunityId, input.actionTitle),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }) as ActionOutcomeRecord;

  const existing = loadActionOutcomes();
  saveActionOutcomes([
    outcome,
    ...existing.filter((item) => item.id !== outcome.id),
  ]);
  return outcome;
}

export function createActionOutcomeFromRecommendedAction(
  action: OpportunityRecommendedAction,
  patch: Partial<ActionOutcomeInput> = {},
) {
  const status = patch.status || 'Accepted';
  const completedAt = patch.completedAt || (status === 'Done' ? todayKey() : undefined);
  return upsertActionOutcome({
    opportunityId: action.opportunityId,
    opportunityName: action.opportunityName,
    accountName: action.accountName,
    actionTitle: action.title,
    actionSourceType: action.sourceType,
    status,
    outcomeType: patch.outcomeType || (status === 'Dismissed' ? 'No change' : 'Still unclear'),
    outcomeNote: patch.outcomeNote || defaultOutcomeNote(status),
    relatedStakeholderName: action.relatedStakeholderName,
    relatedObjectionId: action.relatedObjectionId,
    relatedGap: action.relatedGap,
    completedAt,
    source: patch.source || 'user',
    isSample: patch.isSample === true,
  });
}

export function getActionOutcomesForOpportunity(
  outcomes: ActionOutcomeRecord[],
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
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function actionOutcomeMatchesAction(outcome: ActionOutcomeRecord, action: OpportunityRecommendedAction) {
  return (
    outcome.opportunityId === action.opportunityId &&
    normalize(outcome.actionTitle) === normalize(action.title) &&
    normalize(outcome.actionSourceType) === normalize(action.sourceType)
  );
}

export function getActionOutcomeForAction(outcomes: ActionOutcomeRecord[], action: OpportunityRecommendedAction) {
  return outcomes.find((outcome) => actionOutcomeMatchesAction(outcome, action));
}

function sanitizeOutcome(raw: Partial<ActionOutcomeRecord> | null): ActionOutcomeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.opportunityId || !raw.actionTitle) return null;
  const now = new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createOutcomeId(raw.opportunityId, raw.actionTitle),
    opportunityId: raw.opportunityId,
    opportunityName: raw.opportunityName || 'Untitled opportunity',
    accountName: raw.accountName || 'No account',
    actionTitle: raw.actionTitle,
    actionSourceType: raw.actionSourceType || 'MEDDIC Gap',
    status: isStatus(raw.status) ? raw.status : 'Accepted',
    outcomeType: isOutcomeType(raw.outcomeType) ? raw.outcomeType : 'Still unclear',
    outcomeNote: raw.outcomeNote || '',
    relatedStakeholderName: raw.relatedStakeholderName || undefined,
    relatedObjectionId: raw.relatedObjectionId || undefined,
    relatedGap: raw.relatedGap || undefined,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    completedAt: raw.completedAt || undefined,
    source: raw.source === 'demo' ? 'demo' : raw.source === 'user' ? 'user' : undefined,
    isSample: raw.isSample === true,
  };
}

function createOutcomeId(opportunityId: string, actionTitle: string) {
  return `outcome-${opportunityId}-${slugify(actionTitle)}-${Date.now()}`;
}

function defaultOutcomeNote(status: ActionOutcomeStatus) {
  if (status === 'Done') return 'Action completed. Outcome still needs review.';
  if (status === 'Dismissed') return 'Action dismissed or deprioritized.';
  return '';
}

function isStatus(value: unknown): value is ActionOutcomeStatus {
  return ['Suggested', 'Accepted', 'Done', 'Dismissed'].includes(String(value));
}

function isOutcomeType(value: unknown): value is ActionOutcomeType {
  return actionOutcomeTypes.includes(value as ActionOutcomeType);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function slugify(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'action';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
