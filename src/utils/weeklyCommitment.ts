import type { ActionOutcomeRecord } from '../services/actionOutcomeStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { NextWeekPriority } from './weeklyBusinessReview.ts';
import {
  compareSafeBusinessDate,
  formatSafeBusinessDate,
  isBusinessDateInRange,
  isValidBusinessDate,
} from './safeDate.ts';

/**
 * The layer between recommendation and execution.
 *
 * Everything else in the weekly loop is derived from live state, which means
 * editing an opportunity silently rewrites last week's plan. This module is
 * the one place that stores what the user *chose*, frozen at the moment they
 * chose it. Labels are copied, not referenced, precisely so that later edits
 * to the underlying deal cannot retroactively change what was promised.
 *
 * Nothing here infers completion. Captured activity is surfaced as evidence
 * next to an item; only the user moves an item to completed / carried-over /
 * dropped.
 */

export const MAX_WEEKLY_COMMITMENTS = 5;

export type CommitmentSource = 'suggested' | 'user-added';

export type CommitmentResolution = 'completed' | 'carried-over' | 'dropped' | 'open';

export type WeeklyCommitmentItem = {
  id: string;
  /** Frozen at confirm time. Never rewritten by later opportunity edits. */
  label: string;
  detail: string;
  source: CommitmentSource;
  /** The NextWeekPriority this came from, when it was seeded from a suggestion. */
  suggestionId?: string;
  /** Why Memoire proposed it - carried so the snapshot stays explainable later. */
  suggestionReason?: string;
  editedFromSuggestion: boolean;
  linkedOpportunityId?: string;
  linkedContextId?: string;
  linkedAccountName?: string;
  resolution: CommitmentResolution;
  resolutionNote?: string;
  resolvedAt?: string;
};

export type RejectedSuggestion = {
  suggestionId: string;
  label: string;
};

export type WeeklyCommitmentSnapshot = {
  id: string;
  weekId: string;
  periodStart: string;
  periodEnd: string;
  /** Immutable. The moment the week was deliberately committed to. */
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
  items: WeeklyCommitmentItem[];
  /** The acceptance-rate denominator: shown, and consciously not chosen. */
  suggestedButRejected: RejectedSuggestion[];
  carriedFromWeekId?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

export type CommitmentSelection = {
  suggestionId?: string;
  label: string;
  detail?: string;
  linkedOpportunityId?: string;
  linkedContextId?: string;
  linkedAccountName?: string;
};

/**
 * Freeze a week. Selections carry the label the user actually confirmed -
 * edited or not - and every shown suggestion they did not pick is recorded so
 * rejection stays observable.
 */
export function buildWeeklyCommitmentSnapshot(input: {
  weekId: string;
  periodStart: string;
  periodEnd: string;
  suggestions: NextWeekPriority[];
  selections: CommitmentSelection[];
  carriedFromWeekId?: string;
  confirmedAt?: string;
  id?: string;
  createdAt?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): WeeklyCommitmentSnapshot {
  const now = input.confirmedAt || new Date().toISOString();
  const suggestionsById = new Map(input.suggestions.map((suggestion) => [suggestion.id, suggestion]));

  const items = input.selections
    .filter((selection) => selection.label.trim().length > 0)
    .slice(0, MAX_WEEKLY_COMMITMENTS)
    .map((selection, index) => {
      const suggestion = selection.suggestionId ? suggestionsById.get(selection.suggestionId) : undefined;
      const label = selection.label.trim();
      const detail = (selection.detail ?? suggestion?.detail ?? '').trim();

      return {
        id: `commitment-item-${input.weekId}-${index}`,
        label,
        detail,
        source: suggestion ? 'suggested' : 'user-added',
        suggestionId: suggestion?.id,
        suggestionReason: suggestion?.reason,
        editedFromSuggestion: Boolean(suggestion) && (label !== suggestion?.label.trim() || detail !== (suggestion?.detail || '').trim()),
        linkedOpportunityId: selection.linkedOpportunityId || undefined,
        linkedContextId: selection.linkedContextId || undefined,
        linkedAccountName: selection.linkedAccountName || undefined,
        resolution: 'open',
      } satisfies WeeklyCommitmentItem;
    });

  const acceptedSuggestionIds = new Set(
    items.map((item) => item.suggestionId).filter((id): id is string => Boolean(id)),
  );

  return {
    id: input.id || `weekly-commitment-${input.weekId}`,
    weekId: input.weekId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    confirmedAt: now,
    createdAt: input.createdAt || now,
    updatedAt: now,
    items,
    suggestedButRejected: input.suggestions
      .filter((suggestion) => !acceptedSuggestionIds.has(suggestion.id))
      .map((suggestion) => ({ suggestionId: suggestion.id, label: suggestion.label })),
    carriedFromWeekId: input.carriedFromWeekId,
    source: input.source,
    isSample: input.isSample,
  };
}

/**
 * Resolution is the only mutable part of a confirmed snapshot. Labels,
 * confirmedAt, and the rejection list stay exactly as frozen - this is what
 * makes the record historical truth rather than a re-derivation.
 */
export function resolveCommitmentItem(
  snapshot: WeeklyCommitmentSnapshot,
  itemId: string,
  resolution: CommitmentResolution,
  resolutionNote?: string,
): WeeklyCommitmentSnapshot {
  const now = new Date().toISOString();
  return {
    ...snapshot,
    updatedAt: now,
    items: snapshot.items.map((item) => (
      item.id === itemId
        ? {
          ...item,
          resolution,
          resolutionNote: resolutionNote ?? item.resolutionNote,
          resolvedAt: resolution === 'open' ? undefined : now,
        }
        : item
    )),
  };
}

export type CommitmentEvidence = {
  itemId: string;
  activityCount: number;
  lastTouchDate: string;
  summary: string;
};

export type UnplannedWork = {
  key: string;
  accountName: string;
  activityCount: number;
  summary: string;
};

export type CommitmentReconciliation = {
  weekId: string;
  committedCount: number;
  completedCount: number;
  carriedOverCount: number;
  droppedCount: number;
  openCount: number;
  /** Of the suggestions shown that week, how many became commitments. */
  suggestionsShown: number;
  suggestionsAccepted: number;
  suggestionsEdited: number;
  items: Array<WeeklyCommitmentItem & { evidence?: CommitmentEvidence }>;
  unplannedWork: UnplannedWork[];
};

/**
 * Plan versus actual, at the next review. Evidence is attached to items but
 * never promotes them: an item the user never resolved stays open even when
 * the ledger shows plenty of touches, because "I did something on that
 * account" is not the same claim as "I did what I committed to".
 */
export function reconcileWeeklyCommitment(input: {
  snapshot: WeeklyCommitmentSnapshot;
  activities: SalesActivityRecord[];
  actionOutcomes?: ActionOutcomeRecord[];
}): CommitmentReconciliation {
  const { snapshot } = input;
  const periodActivities = input.activities.filter((activity) => (
    isValidBusinessDate(activity.activityDate)
      && isBusinessDateInRange(activity.activityDate, snapshot.periodStart, snapshot.periodEnd)
  ));

  const claimedActivityIds = new Set<string>();
  const items = snapshot.items.map((item) => {
    const matches = periodActivities.filter((activity) => activityMatchesItem(activity, item));
    matches.forEach((activity) => claimedActivityIds.add(activity.id));
    if (matches.length === 0) return { ...item };

    const lastTouchDate = matches
      .map((activity) => activity.activityDate)
      .sort(compareSafeBusinessDate)
      .at(-1) || '';

    return {
      ...item,
      evidence: {
        itemId: item.id,
        activityCount: matches.length,
        lastTouchDate,
        summary: `${matches.length} captured touch${matches.length === 1 ? '' : 'es'}, last on ${formatSafeBusinessDate(lastTouchDate)}.`,
      },
    };
  });

  return {
    weekId: snapshot.weekId,
    committedCount: snapshot.items.length,
    completedCount: countResolution(snapshot, 'completed'),
    carriedOverCount: countResolution(snapshot, 'carried-over'),
    droppedCount: countResolution(snapshot, 'dropped'),
    openCount: countResolution(snapshot, 'open'),
    suggestionsShown: snapshot.suggestedButRejected.length
      + snapshot.items.filter((item) => item.source === 'suggested').length,
    suggestionsAccepted: snapshot.items.filter((item) => item.source === 'suggested').length,
    suggestionsEdited: snapshot.items.filter((item) => item.editedFromSuggestion).length,
    items,
    unplannedWork: buildUnplannedWork(periodActivities, claimedActivityIds),
  };
}

/**
 * Work that produced a customer touch but was not on the plan. Surfaced as
 * unplanned, never as a miss - the point is to show the gap between intent and
 * where the week actually went, not to score it.
 */
function buildUnplannedWork(
  periodActivities: SalesActivityRecord[],
  claimedActivityIds: Set<string>,
): UnplannedWork[] {
  const groups = new Map<string, { accountName: string; count: number }>();

  periodActivities
    .filter((activity) => !claimedActivityIds.has(activity.id))
    .filter((activity) => normalizeName(activity.accountName) || normalizeName(activity.linkedAccountName))
    .forEach((activity) => {
      const accountName = activity.linkedAccountName || activity.accountName;
      const key = normalizeName(accountName);
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }
      groups.set(key, { accountName, count: 1 });
    });

  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      accountName: group.accountName,
      activityCount: group.count,
      summary: `${group.count} touch${group.count === 1 ? '' : 'es'} captured, not on this week's plan.`,
    }))
    .sort((a, b) => b.activityCount - a.activityCount || a.accountName.localeCompare(b.accountName))
    .slice(0, 6);
}

/**
 * Carry-over seeding: items the user explicitly carried become next week's
 * starting selections, tagged with the week they came from so a repeatedly
 * carried item is visible as a pattern rather than looking new each time.
 */
export function buildCarryOverSelections(snapshot: WeeklyCommitmentSnapshot): CommitmentSelection[] {
  return snapshot.items
    .filter((item) => item.resolution === 'carried-over')
    .map((item) => ({
      label: item.label,
      detail: item.detail,
      linkedOpportunityId: item.linkedOpportunityId,
      linkedContextId: item.linkedContextId,
      linkedAccountName: item.linkedAccountName,
    }));
}

export function commitmentResolutionLabel(resolution: CommitmentResolution) {
  return {
    completed: 'Completed',
    'carried-over': 'Carried over',
    dropped: 'Dropped',
    open: 'Open',
  }[resolution];
}

export function commitmentResolutionTone(resolution: CommitmentResolution) {
  return {
    completed: 'bg-emerald-50 text-emerald-700',
    'carried-over': 'bg-amber-50 text-amber-800',
    dropped: 'bg-gray-100 text-gray-600',
    open: 'bg-blue-50 text-brand-blue',
  }[resolution];
}

function countResolution(snapshot: WeeklyCommitmentSnapshot, resolution: CommitmentResolution) {
  return snapshot.items.filter((item) => item.resolution === resolution).length;
}

function activityMatchesItem(activity: SalesActivityRecord, item: WeeklyCommitmentItem) {
  if (item.linkedOpportunityId && activity.linkedOpportunityId === item.linkedOpportunityId) return true;
  const itemAccount = normalizeName(item.linkedAccountName);
  if (!itemAccount) return false;
  return normalizeName(activity.accountName) === itemAccount
    || normalizeName(activity.linkedAccountName) === itemAccount;
}

function normalizeName(value?: string) {
  return (value || '').trim().toLowerCase();
}
