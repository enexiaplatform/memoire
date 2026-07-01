import {
  claimLocalCollectionForUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
  upsertCloudJsonCollection,
} from './cloudJsonCollectionStore';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import { sanitizeBusinessDate } from '../utils/safeDate.ts';

export const NUDGE_STORAGE_KEY = 'memoire.nudges.v1';

export const nudgeSources = [
  'pipeline-defense',
  'revenue',
  'opportunity',
  'capture',
  'outcome-learning',
  'stakeholder',
  'objection',
] as const;

export const nudgeEntityTypes = [
  'opportunity',
  'account',
  'quote',
  'activity',
  'stakeholder',
  'objection',
  'system',
] as const;

export const nudgeUrgencies = ['critical', 'high', 'medium', 'low'] as const;
export const nudgeStatuses = ['active', 'dismissed', 'snoozed', 'done'] as const;

export type NudgeSource = (typeof nudgeSources)[number];
export type NudgeEntityType = (typeof nudgeEntityTypes)[number];
export type NudgeUrgency = (typeof nudgeUrgencies)[number];
export type NudgeStatus = (typeof nudgeStatuses)[number];

export type NudgeRecord = {
  id: string;
  userId?: string;
  source: NudgeSource;
  entityType: NudgeEntityType;
  entityId?: string;
  accountName?: string;
  opportunityName?: string;
  title: string;
  reason: string;
  recommendedAction: string;
  urgency: NudgeUrgency;
  dueDate?: string;
  moneyAmount?: number;
  moneyCurrency?: string;
  status: NudgeStatus;
  snoozedUntil?: string;
  createdAt: string;
  updatedAt: string;
  storageMode: 'local' | 'cloud';
  isSample?: boolean;
  __deleted?: boolean;
};

export type NudgeInput = Omit<NudgeRecord, 'createdAt' | 'updatedAt' | 'storageMode'> & {
  createdAt?: string;
  updatedAt?: string;
  storageMode?: 'local' | 'cloud';
};

export function loadNudges(userId?: string): NudgeRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeNudge).filter((item): item is NudgeRecord => Boolean(item));
  } catch {
    return [];
  }
}

export async function loadNudgesForUser(userId: string) {
  const local = loadNudges(userId);
  try {
    const cloud = await loadCloudJsonCollection<NudgeRecord>('nudges', userId);
    const recordsToMerge = claimLocalCollectionForUser('nudges', userId) ? local : [];
    const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
      .map(sanitizeNudge)
      .filter((item): item is NudgeRecord => Boolean(item));
    persistNudges(merged, userId, false);
    await upsertCloudJsonCollection('nudges', userId, merged);
    return merged;
  } catch {
    return local;
  }
}

export function saveNudges(nudges: NudgeRecord[], userId?: string) {
  return persistNudges(nudges, userId, true);
}

export function upsertNudgeState(nudge: NudgeRecord, patch: Partial<Pick<NudgeRecord, 'status' | 'snoozedUntil'>>, userId?: string) {
  const now = new Date().toISOString();
  const next = sanitizeNudge({
    ...nudge,
    userId: userId || nudge.userId,
    status: patch.status || nudge.status,
    snoozedUntil: patch.snoozedUntil === undefined ? nudge.snoozedUntil : sanitizeBusinessDate(patch.snoozedUntil),
    updatedAt: now,
    createdAt: nudge.createdAt || now,
    storageMode: nudge.storageMode || 'local',
  }) as NudgeRecord;
  const saved = [next, ...loadNudges(userId).filter((item) => item.id !== next.id)];
  saveNudges(saved, userId);
  return next;
}

export function markNudgeDone(nudge: NudgeRecord, userId?: string) {
  return upsertNudgeState(nudge, { status: 'done', snoozedUntil: '' }, userId);
}

export function dismissNudge(nudge: NudgeRecord, userId?: string) {
  return upsertNudgeState(nudge, { status: 'dismissed', snoozedUntil: '' }, userId);
}

export function snoozeNudge(nudge: NudgeRecord, snoozedUntil: string, userId?: string) {
  return upsertNudgeState(nudge, { status: 'snoozed', snoozedUntil }, userId);
}

export function clearDismissedNudges(userId?: string) {
  const next = loadNudges(userId).filter((nudge) => nudge.status !== 'dismissed');
  saveNudges(next, userId);
  return next;
}

export function clearAllNudges(userId?: string) {
  saveNudges([], userId);
  return [];
}

function persistNudges(nudges: NudgeRecord[], userId: string | undefined, syncCloud: boolean) {
  if (typeof localStorage === 'undefined') return false;
  try {
    const sanitized = nudges.map(sanitizeNudge).filter((item): item is NudgeRecord => Boolean(item));
    localStorage.setItem(storageKey(userId), JSON.stringify(sanitized));
    if (syncCloud) syncCloudJsonCollectionForCurrentUser('nudges', sanitized);
    invalidateWorkspaceDataCache();
    return true;
  } catch {
    return false;
  }
}

function sanitizeNudge(raw: Partial<NudgeRecord> | null): NudgeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  const reason = String(raw.reason || '').trim();
  const recommendedAction = String(raw.recommendedAction || '').trim();
  if (!raw.id || !title || !reason || !recommendedAction) return null;
  const now = new Date().toISOString();
  return {
    id: String(raw.id),
    userId: typeof raw.userId === 'string' ? raw.userId : undefined,
    source: nudgeSources.includes(raw.source as NudgeSource) ? raw.source as NudgeSource : 'pipeline-defense',
    entityType: nudgeEntityTypes.includes(raw.entityType as NudgeEntityType) ? raw.entityType as NudgeEntityType : 'system',
    entityId: typeof raw.entityId === 'string' ? raw.entityId : '',
    accountName: typeof raw.accountName === 'string' ? raw.accountName.trim() : '',
    opportunityName: typeof raw.opportunityName === 'string' ? raw.opportunityName.trim() : '',
    title,
    reason,
    recommendedAction,
    urgency: nudgeUrgencies.includes(raw.urgency as NudgeUrgency) ? raw.urgency as NudgeUrgency : 'medium',
    dueDate: sanitizeBusinessDate(raw.dueDate),
    moneyAmount: normalizeNumber(raw.moneyAmount),
    moneyCurrency: typeof raw.moneyCurrency === 'string' ? raw.moneyCurrency.trim().toUpperCase() : '',
    status: nudgeStatuses.includes(raw.status as NudgeStatus) ? raw.status as NudgeStatus : 'active',
    snoozedUntil: sanitizeBusinessDate(raw.snoozedUntil),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    storageMode: raw.storageMode === 'cloud' ? 'cloud' : 'local',
    isSample: raw.isSample === true,
    __deleted: raw.__deleted === true,
  };
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function storageKey(userId?: string) {
  return `${NUDGE_STORAGE_KEY}:${userId || 'guest'}`;
}
