import type { PlanRecord } from '../utils/weeklyPlan';
import {
  claimLocalCollectionForUser,
  deleteCloudJsonRecordForCurrentUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
  upsertCloudJsonCollection,
} from './cloudJsonCollectionStore';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';

export const PLAN_ITEM_STORAGE_KEY = 'memoire.planItems.v1';
export const PLAN_ITEMS_UPDATED_EVENT = 'memoire:plan-items-updated';

/**
 * Holds the two things the plan board owns and nothing else: the operator's own
 * plan items, and the completion marks for items derived from the workspace.
 * Everything else the board shows is derived live, so this store can never
 * drift from the money spine.
 */
export function loadPlanItems(): PlanRecord[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(PLAN_ITEM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizePlanRecord)
      .filter((record): record is PlanRecord => Boolean(record))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export async function loadPlanItemsForUser(userId: string) {
  const local = loadPlanItems();
  const cloud = await loadCloudJsonCollection<PlanRecord>('plan_items', userId);
  const recordsToMerge = claimLocalCollectionForUser('plan_items', userId) ? local.filter(isUserRecord) : [];
  const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
    .map(sanitizePlanRecord)
    .filter((record): record is PlanRecord => Boolean(record));
  persistPlanItems(merged, false);
  await upsertCloudJsonCollection('plan_items', userId, merged);
  return merged;
}

export async function loadPlanItemsForWorkspace(userId?: string | null, sampleDataActive = false) {
  if (!userId || sampleDataActive) return loadPlanItems();
  try {
    return await loadPlanItemsForUser(userId);
  } catch {
    return loadPlanItems();
  }
}

export function savePlanItem(record: PlanRecord, options: { syncCloud?: boolean } = {}): PlanRecord[] {
  const existing = loadPlanItems().filter((item) => item.id !== record.id);
  return persistPlanItems([record, ...existing], options.syncCloud);
}

export function deletePlanItem(recordId: string, options: { syncCloud?: boolean } = {}): PlanRecord[] {
  const records = persistPlanItems(loadPlanItems().filter((item) => item.id !== recordId), options.syncCloud);
  if (options.syncCloud !== false) deleteCloudJsonRecordForCurrentUser('plan_items', recordId);
  return records;
}

function persistPlanItems(records: PlanRecord[], syncCloud = true) {
  const sanitized = records
    .map(sanitizePlanRecord)
    .filter((record): record is PlanRecord => Boolean(record))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (canUseStorage()) {
    window.localStorage.setItem(PLAN_ITEM_STORAGE_KEY, JSON.stringify(sanitized));
    if (syncCloud) syncCloudJsonCollectionForCurrentUser('plan_items', sanitized);
    invalidateWorkspaceDataCache();
    window.dispatchEvent(new CustomEvent(PLAN_ITEMS_UPDATED_EVENT, { detail: sanitized }));
  }
  return sanitized;
}

function sanitizePlanRecord(value: unknown): PlanRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PlanRecord>;
  const date = typeof candidate.date === 'string' ? candidate.date : '';
  const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
  if (!date || !label) return null;
  const now = new Date().toISOString();

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    label,
    tag: typeof candidate.tag === 'string' ? candidate.tag.trim() : '',
    done: candidate.done === true,
    doneAt: typeof candidate.doneAt === 'string' ? candidate.doneAt : undefined,
    derivedKey: typeof candidate.derivedKey === 'string' ? candidate.derivedKey : undefined,
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : now,
    source: candidate.source === 'demo' ? 'demo' : candidate.source === 'user' ? 'user' : undefined,
    isSample: candidate.isSample === true,
  };
}

function isUserRecord(record: PlanRecord) {
  return record.source !== 'demo' && record.isSample !== true;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
