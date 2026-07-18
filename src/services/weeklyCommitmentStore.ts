import type { WeeklyCommitmentSnapshot } from '../utils/weeklyCommitment';
import {
  claimLocalCollectionForUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
  upsertCloudJsonCollection,
} from './cloudJsonCollectionStore';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';

export const WEEKLY_COMMITMENT_STORAGE_KEY = 'memoire.weeklyCommitments.v1';
export const WEEKLY_COMMITMENTS_UPDATED_EVENT = 'memoire:weekly-commitments-updated';

/**
 * Local-first, cloud-merged, one snapshot per week. Deliberately reuses the
 * review-pack storage pattern rather than adding an endpoint - the API surface
 * is at its function cap, and a weekly commitment is just another JSON
 * collection.
 */
export function loadWeeklyCommitments(): WeeklyCommitmentSnapshot[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(WEEKLY_COMMITMENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeSnapshot)
      .filter((snapshot): snapshot is WeeklyCommitmentSnapshot => Boolean(snapshot))
      .sort((a, b) => b.weekId.localeCompare(a.weekId));
  } catch {
    return [];
  }
}

export async function loadWeeklyCommitmentsForUser(userId: string) {
  const local = loadWeeklyCommitments();
  const cloud = await loadCloudJsonCollection<WeeklyCommitmentSnapshot>('weekly_commitments', userId);
  const recordsToMerge = claimLocalCollectionForUser('weekly_commitments', userId)
    ? local.filter(isUserSnapshot)
    : [];
  const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
    .map(sanitizeSnapshot)
    .filter((snapshot): snapshot is WeeklyCommitmentSnapshot => Boolean(snapshot));
  persistWeeklyCommitments(merged, false);
  await upsertCloudJsonCollection('weekly_commitments', userId, merged);
  return merged;
}

export async function loadWeeklyCommitmentsForWorkspace(userId?: string | null, sampleDataActive = false) {
  if (!userId || sampleDataActive) return loadWeeklyCommitments();
  try {
    return await loadWeeklyCommitmentsForUser(userId);
  } catch {
    return loadWeeklyCommitments();
  }
}

export function getWeeklyCommitmentForWeek(weekId: string, snapshots = loadWeeklyCommitments()) {
  return snapshots.find((snapshot) => snapshot.weekId === weekId) || null;
}

/**
 * One snapshot per week. Re-confirming replaces the week's record - the caller
 * is responsible for making that an explicit user action, never a side effect
 * of rendering the review.
 */
export function saveWeeklyCommitment(
  snapshot: WeeklyCommitmentSnapshot,
  options: { syncCloud?: boolean } = {},
): WeeklyCommitmentSnapshot[] {
  const existing = loadWeeklyCommitments().filter((item) => item.weekId !== snapshot.weekId);
  return persistWeeklyCommitments([snapshot, ...existing], options.syncCloud);
}

function persistWeeklyCommitments(snapshots: WeeklyCommitmentSnapshot[], syncCloud = true) {
  const sanitized = snapshots
    .map(sanitizeSnapshot)
    .filter((snapshot): snapshot is WeeklyCommitmentSnapshot => Boolean(snapshot))
    .sort((a, b) => b.weekId.localeCompare(a.weekId));

  if (canUseStorage()) {
    window.localStorage.setItem(WEEKLY_COMMITMENT_STORAGE_KEY, JSON.stringify(sanitized));
    if (syncCloud) syncCloudJsonCollectionForCurrentUser('weekly_commitments', sanitized);
    invalidateWorkspaceDataCache();
    window.dispatchEvent(new CustomEvent(WEEKLY_COMMITMENTS_UPDATED_EVENT, { detail: sanitized }));
  }
  return sanitized;
}

function sanitizeSnapshot(value: unknown): WeeklyCommitmentSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<WeeklyCommitmentSnapshot>;
  if (typeof candidate.weekId !== 'string' || !candidate.weekId) return null;
  const now = new Date().toISOString();

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `weekly-commitment-${candidate.weekId}`,
    weekId: candidate.weekId,
    periodStart: normalizeString(candidate.periodStart),
    periodEnd: normalizeString(candidate.periodEnd),
    confirmedAt: typeof candidate.confirmedAt === 'string' && candidate.confirmedAt ? candidate.confirmedAt : now,
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : now,
    items: Array.isArray(candidate.items)
      ? candidate.items.map(sanitizeItem).filter((item): item is WeeklyCommitmentSnapshot['items'][number] => Boolean(item))
      : [],
    suggestedButRejected: Array.isArray(candidate.suggestedButRejected)
      ? candidate.suggestedButRejected
        .filter((item): item is { suggestionId: string; label: string } => (
          Boolean(item) && typeof item === 'object'
            && typeof (item as { suggestionId?: unknown }).suggestionId === 'string'
            && typeof (item as { label?: unknown }).label === 'string'
        ))
        .map((item) => ({ suggestionId: item.suggestionId, label: item.label }))
      : [],
    carriedFromWeekId: typeof candidate.carriedFromWeekId === 'string' ? candidate.carriedFromWeekId : undefined,
    source: candidate.source === 'demo' ? 'demo' : candidate.source === 'user' ? 'user' : undefined,
    isSample: candidate.isSample === true,
  };
}

function sanitizeItem(value: unknown): WeeklyCommitmentSnapshot['items'][number] | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<WeeklyCommitmentSnapshot['items'][number]>;
  const label = normalizeString(candidate.label);
  if (!label) return null;

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `commitment-item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label,
    detail: normalizeString(candidate.detail),
    source: candidate.source === 'suggested' ? 'suggested' : 'user-added',
    suggestionId: typeof candidate.suggestionId === 'string' ? candidate.suggestionId : undefined,
    suggestionReason: typeof candidate.suggestionReason === 'string' ? candidate.suggestionReason : undefined,
    editedFromSuggestion: candidate.editedFromSuggestion === true,
    linkedOpportunityId: typeof candidate.linkedOpportunityId === 'string' ? candidate.linkedOpportunityId : undefined,
    linkedContextId: typeof candidate.linkedContextId === 'string' ? candidate.linkedContextId : undefined,
    linkedAccountName: typeof candidate.linkedAccountName === 'string' ? candidate.linkedAccountName : undefined,
    resolution: candidate.resolution === 'completed' || candidate.resolution === 'carried-over' || candidate.resolution === 'dropped'
      ? candidate.resolution
      : 'open',
    resolutionNote: typeof candidate.resolutionNote === 'string' ? candidate.resolutionNote : undefined,
    resolvedAt: typeof candidate.resolvedAt === 'string' ? candidate.resolvedAt : undefined,
  };
}

function isUserSnapshot(snapshot: WeeklyCommitmentSnapshot) {
  return snapshot.source !== 'demo' && snapshot.isSample !== true;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
