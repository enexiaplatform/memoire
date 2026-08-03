import { supabaseClient } from '../lib/supabaseClient.ts';
import type { ClassifiedSalesActivity, SalesActivityType } from '../utils/salesActivityClassifier.ts';
import { invalidateWorkspaceDataCache } from './workspaceDataCache.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';
import { compareSafeBusinessDate, isBusinessDateInRange, sanitizeBusinessDate } from '../utils/safeDate.ts';
import {
  buildIngestionSourceTags,
  parseIngestionSourceTags,
  type IngestionSourceType,
} from '../utils/ingestionSource.ts';
import { writeLocalRecords } from './localWriteGuard.ts';

export interface SalesActivityRecord extends ClassifiedSalesActivity {
  id: string;
  userId?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  linkedOpportunityId: string;
  linkedOpportunityName: string;
  linkedAccountName: string;
  linkStatus: 'Unlinked' | 'Suggested' | 'Linked' | 'Ignored';
  createdAt: string;
  updatedAt: string;
  storageMode: 'local' | 'cloud';
  /**
   * Captured while the cloud write could not be made, and still owed to it.
   *
   * This flag is the whole offline queue. There is no second list of things to
   * send, because a second list is a second source of truth: it can hold an
   * entry for a record that was deleted, or miss one that was written, and the
   * bug that produces is a capture that never arrives with nothing anywhere
   * saying so. The record itself is the queue entry.
   */
  pendingSync?: boolean;
}

type SalesActivityRow = {
  id: string;
  user_id: string;
  activity_date: string;
  raw_note: string;
  activity_type: SalesActivityType;
  account_name: string | null;
  opportunity_name: string | null;
  contact_name?: string | null;
  stakeholder_name?: string | null;
  stakeholder_role?: string | null;
  competitors?: string[] | null;
  buying_signals?: string[] | null;
  risks?: string[] | null;
  timeline_signals?: string[] | null;
  next_actions?: ClassifiedSalesActivity['nextActions'] | null;
  summary: string | null;
  next_action: string | null;
  due_date: string | null;
  tags: string[] | null;
  linked_opportunity_id: string | null;
  linked_opportunity_name: string | null;
  linked_account_name: string | null;
  link_status: SalesActivityRecord['linkStatus'] | null;
  created_at: string;
  updated_at: string;
};

export type SalesActivityLinkInput = {
  linkedOpportunityId?: string;
  linkedOpportunityName?: string;
  linkedAccountName?: string;
  linkStatus: SalesActivityRecord['linkStatus'];
};

const TABLE_NAME = 'sales_activities';
export const SALES_ACTIVITY_STORAGE_KEY = 'memoire.salesActivities.v1';

export function canUseSalesActivityCloudStore(userId?: string | null) {
  return Boolean(userId && supabaseClient);
}

export async function loadSalesActivities(userId?: string | null): Promise<SalesActivityRecord[]> {
  if (canUseSalesActivityCloudStore(userId)) {
    try {
      const cloud = await loadCloudActivities(userId as string);
      return mergePendingIntoCloud(cloud, listPendingSalesActivities());
    } catch (error) {
      reportWorkspaceSyncError();
      debugSalesActivityStore('cloud load failed; falling back to local', { message: getErrorMessage(error) });
      return loadLocalActivities();
    }
  }

  return loadLocalActivities();
}

/**
 * What the workspace shows when the cloud has the account's records and this
 * device is still holding some of them.
 *
 * A capture made with no network lives only here. Returning the cloud answer on
 * its own - which is what `loadSalesActivities` did until 2026-08-03 - makes
 * that capture vanish from every surface the moment the connection comes back,
 * while the record sits in localStorage forever with nothing pointing at it.
 * For a product whose promise is that nothing goes silent, that is the worst
 * bug it can have.
 *
 * The pending copy wins on a clash of ids: it is the one the operator typed
 * and has not seen confirmed.
 */
export function mergePendingIntoCloud(
  cloud: SalesActivityRecord[],
  pending: SalesActivityRecord[],
): SalesActivityRecord[] {
  if (pending.length === 0) return cloud;
  const pendingIds = new Set(pending.map((record) => record.id));
  return [...pending, ...cloud.filter((record) => !pendingIds.has(record.id))].sort(sortNewestFirst);
}

/** Everything captured on this device that the cloud has not accepted yet. */
export function listPendingSalesActivities(): SalesActivityRecord[] {
  return loadLocalActivities().filter((record) => record.pendingSync);
}

export const PENDING_SYNC_CHANGED_EVENT = 'memoire:pending-sync-changed';

function announcePendingSync() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PENDING_SYNC_CHANGED_EVENT, {
    detail: { pending: listPendingSalesActivities().length },
  }));
}

/**
 * Sends what was captured offline, once there is somewhere to send it.
 *
 * Each record is sent on its own and removed from the local copy only after
 * the cloud has confirmed it. A batch insert would be faster and would lose
 * everything on one bad row; here a note the server rejects stays on the
 * device, still visible, still counted as waiting, instead of disappearing
 * with the rest of the batch.
 */
export async function flushPendingSalesActivities(
  userId?: string | null
): Promise<{ synced: number; remaining: number; error?: string }> {
  const pending = listPendingSalesActivities();
  if (pending.length === 0) return { synced: 0, remaining: 0 };
  if (!canUseSalesActivityCloudStore(userId)) return { synced: 0, remaining: pending.length };

  let synced = 0;
  let error: string | undefined;

  for (const record of pending) {
    try {
      await createCloudActivity(record, userId as string, {
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
      deleteLocalActivity(record.id);
      synced += 1;
    } catch (sendError) {
      error = getErrorMessage(sendError);
      reportWorkspaceSyncError();
      debugSalesActivityStore('pending capture could not be sent; it stays on the device', { message: error });
      break;
    }
  }

  if (synced > 0) invalidateWorkspaceDataCache();
  announcePendingSync();
  return { synced, remaining: listPendingSalesActivities().length, error };
}

export function filterSalesActivitiesByPeriod(
  activities: SalesActivityRecord[],
  period: { start: string; end: string }
) {
  return activities.filter((activity) => isBusinessDateInRange(activity.activityDate, period.start, period.end));
}

export async function saveSalesActivity(
  activity: ClassifiedSalesActivity,
  userId?: string | null
): Promise<{ record: SalesActivityRecord; mode: 'local' | 'cloud'; warning?: string }> {
  if (canUseSalesActivityCloudStore(userId)) {
    try {
      const record = await createCloudActivity(activity, userId as string);
      invalidateWorkspaceDataCache();
      return { record, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      // Owed to the cloud, not merely saved locally. Without the flag this
      // capture is indistinguishable from one made while signed out, and
      // nothing would ever send it.
      const record = { ...createLocalActivity(activity), pendingSync: true };
      saveLocalActivityRecord(record);
      invalidateWorkspaceDataCache();
      announcePendingSync();
      debugSalesActivityStore('cloud save failed; local copy preserved', { message: getErrorMessage(error) });
      return {
        record,
        mode: 'local',
        warning: 'Saved on this device. Memoire will send it when the connection is back.',
      };
    }
  }

  const record = createLocalActivity(activity);
  saveLocalActivityRecord(record);
  invalidateWorkspaceDataCache();
  return { record, mode: 'local' };
}

export async function deleteSalesActivity(activity: SalesActivityRecord, userId?: string | null) {
  if (activity.storageMode === 'cloud' && canUseSalesActivityCloudStore(userId)) {
    const { error } = await supabaseClient!
      .from(TABLE_NAME)
      .delete()
      .eq('id', activity.id)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    invalidateWorkspaceDataCache();
    return;
  }

  deleteLocalActivity(activity.id);
  invalidateWorkspaceDataCache();
}

export async function updateSalesActivityLink(
  activity: SalesActivityRecord,
  link: SalesActivityLinkInput,
  userId?: string | null
): Promise<SalesActivityRecord> {
  const timestamp = new Date().toISOString();
  const updated: SalesActivityRecord = {
    ...activity,
    linkedOpportunityId: link.linkStatus === 'Linked' ? link.linkedOpportunityId || '' : '',
    linkedOpportunityName: link.linkStatus === 'Linked' ? link.linkedOpportunityName || '' : '',
    linkedAccountName: link.linkStatus === 'Linked' ? link.linkedAccountName || '' : '',
    linkStatus: link.linkStatus,
    updatedAt: timestamp,
  };

  if (activity.storageMode === 'cloud' && canUseSalesActivityCloudStore(userId)) {
    const { data, error } = await supabaseClient!
      .from(TABLE_NAME)
      .update({
        linked_opportunity_id: updated.linkedOpportunityId || null,
        linked_opportunity_name: updated.linkedOpportunityName || null,
        linked_account_name: updated.linkedAccountName || null,
        link_status: updated.linkStatus,
        updated_at: timestamp,
      })
      .eq('id', activity.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    invalidateWorkspaceDataCache();
    return rowToRecord(data as SalesActivityRow);
  }

  saveLocalActivityRecord({ ...updated, storageMode: 'local' });
  invalidateWorkspaceDataCache();
  return { ...updated, storageMode: 'local' };
}

export type SalesActivityScheduleInput = {
  nextAction?: string;
  dueDate?: string;
  nextActions?: ClassifiedSalesActivity['nextActions'];
};

/**
 * Rewrites a touch's dated next actions - the write behind dragging a capture
 * item to another day, or editing its wording, on the Timeline board. The board
 * derives from the activity, so rescheduling has to land here: writing the new
 * date anywhere else would create a second copy of the commitment that the
 * activity itself would quietly contradict.
 */
export async function updateSalesActivitySchedule(
  activity: SalesActivityRecord,
  changes: SalesActivityScheduleInput,
  userId?: string | null
): Promise<SalesActivityRecord> {
  const timestamp = new Date().toISOString();
  const updated: SalesActivityRecord = {
    ...activity,
    nextAction: changes.nextAction !== undefined ? changes.nextAction : activity.nextAction,
    dueDate: changes.dueDate !== undefined ? sanitizeBusinessDate(changes.dueDate) : activity.dueDate,
    nextActions: changes.nextActions !== undefined ? normalizeNextActions(changes.nextActions) : activity.nextActions,
    updatedAt: timestamp,
  };

  if (activity.storageMode === 'cloud' && canUseSalesActivityCloudStore(userId)) {
    const { data, error } = await supabaseClient!
      .from(TABLE_NAME)
      .update({
        next_action: updated.nextAction || null,
        due_date: sanitizeBusinessDate(updated.dueDate) || null,
        next_actions: normalizeNextActions(updated.nextActions),
        updated_at: timestamp,
      })
      .eq('id', activity.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    invalidateWorkspaceDataCache();
    return rowToRecord(data as SalesActivityRow);
  }

  saveLocalActivityRecord({ ...updated, storageMode: 'local' });
  invalidateWorkspaceDataCache();
  return { ...updated, storageMode: 'local' };
}

function loadLocalActivities(): SalesActivityRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(SALES_ACTIVITY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<SalesActivityRecord>[];
    return parsed
      .filter((item) => item.id && item.rawNote)
      .map<SalesActivityRecord>((item) => {
        const sourceMetadata = parseActivitySourceMetadata(item);
        return ({
        id: item.id || createId(),
        userId: item.userId,
        source: normalizeSource(item.source),
        isSample: item.isSample === true,
        accountName: item.accountName || '',
        opportunityName: item.opportunityName || '',
        contactName: item.contactName || '',
        stakeholderName: item.stakeholderName || '',
        stakeholderRole: item.stakeholderRole || '',
        competitors: normalizeStringArray(item.competitors),
        buyingSignals: normalizeStringArray(item.buyingSignals),
        risks: normalizeStringArray(item.risks),
        timelineSignals: normalizeStringArray(item.timelineSignals),
        nextActions: normalizeNextActions(item.nextActions),
        activityType: item.activityType || 'Other',
        summary: item.summary || item.rawNote || '',
        nextAction: item.nextAction || '',
        dueDate: sanitizeBusinessDate(item.dueDate),
        tags: Array.isArray(item.tags) ? item.tags : [],
        sourceType: sourceMetadata.sourceType,
        sourceLabel: sourceMetadata.sourceLabel,
        sourceTimestamp: sourceMetadata.sourceTimestamp,
        sourceHash: sourceMetadata.sourceHash,
        originalExcerpt: sourceMetadata.originalExcerpt,
        linkedOpportunityId: item.linkedOpportunityId || '',
        linkedOpportunityName: item.linkedOpportunityName || '',
        linkedAccountName: item.linkedAccountName || '',
        linkStatus: normalizeLinkStatus(item.linkStatus),
        rawNote: item.rawNote || '',
        activityDate: sanitizeBusinessDate(item.activityDate),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        storageMode: 'local',
        pendingSync: item.pendingSync === true,
      });
      })
      .sort(sortNewestFirst);
  } catch {
    return [];
  }
}

function saveLocalActivityRecord(record: SalesActivityRecord) {
  const next = [record, ...loadLocalActivities().filter((item) => item.id !== record.id)];
  if (typeof localStorage !== 'undefined') {
    writeLocalRecords(SALES_ACTIVITY_STORAGE_KEY, next.sort(sortNewestFirst));
  }
}

function deleteLocalActivity(activityId: string) {
  if (typeof localStorage === 'undefined') return;
  const next = loadLocalActivities().filter((item) => item.id !== activityId);
  writeLocalRecords(SALES_ACTIVITY_STORAGE_KEY, next);
}

async function loadCloudActivities(userId: string): Promise<SalesActivityRecord[]> {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data || []) as SalesActivityRow[]).map(rowToRecord);
}

async function createCloudActivity(
  activity: ClassifiedSalesActivity,
  userId: string,
  timestamps?: { createdAt: string; updatedAt: string },
) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .insert(activityToInsert(activity, userId, timestamps))
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToRecord(data as SalesActivityRow);
}

function createLocalActivity(activity: ClassifiedSalesActivity): SalesActivityRecord {
  const timestamp = new Date().toISOString();
  const tags = mergeActivitySourceTags(activity.tags, activity);
  return {
    ...activity,
    activityDate: sanitizeBusinessDate(activity.activityDate),
    dueDate: sanitizeBusinessDate(activity.dueDate),
    nextActions: normalizeNextActions(activity.nextActions),
    tags,
    id: createId(),
    source: 'user',
    isSample: false,
    linkedOpportunityId: '',
    linkedOpportunityName: '',
    linkedAccountName: '',
    linkStatus: 'Unlinked',
    createdAt: timestamp,
    updatedAt: timestamp,
    storageMode: 'local',
  };
}

function rowToRecord(row: SalesActivityRow): SalesActivityRecord {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const sourceMetadata = parseIngestionSourceTags(tags);
  return {
    id: row.id,
    userId: row.user_id,
    source: 'user',
    isSample: false,
    activityDate: sanitizeBusinessDate(row.activity_date),
    rawNote: row.raw_note,
    activityType: row.activity_type || 'Other',
    accountName: row.account_name || '',
    opportunityName: row.opportunity_name || '',
    contactName: row.contact_name || '',
    stakeholderName: row.stakeholder_name || '',
    stakeholderRole: row.stakeholder_role || '',
    competitors: normalizeStringArray(row.competitors),
    buyingSignals: normalizeStringArray(row.buying_signals),
    risks: normalizeStringArray(row.risks),
    timelineSignals: normalizeStringArray(row.timeline_signals),
    nextActions: normalizeNextActions(row.next_actions),
    summary: row.summary || row.raw_note,
    nextAction: row.next_action || '',
    dueDate: sanitizeBusinessDate(row.due_date),
    tags,
    sourceType: sourceMetadata.sourceType,
    sourceLabel: sourceMetadata.sourceLabel,
    sourceHash: sourceMetadata.sourceHash,
    linkedOpportunityId: row.linked_opportunity_id || '',
    linkedOpportunityName: row.linked_opportunity_name || '',
    linkedAccountName: row.linked_account_name || '',
    linkStatus: normalizeLinkStatus(row.link_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode: 'cloud',
  };
}

function activityToInsert(
  activity: ClassifiedSalesActivity,
  userId: string,
  // A capture that waited three days offline was made three days ago. Stamping
  // it with the moment it finally sent would put it at the top of the activity
  // log under today's date and quietly rewrite when the customer was seen.
  timestamps?: { createdAt: string; updatedAt: string },
) {
  const timestamp = new Date().toISOString();
  return {
    user_id: userId,
    activity_date: sanitizeBusinessDate(activity.activityDate) || null,
    raw_note: activity.rawNote,
    activity_type: activity.activityType,
    account_name: activity.accountName || null,
    opportunity_name: activity.opportunityName || null,
    contact_name: activity.contactName || null,
    stakeholder_name: activity.stakeholderName || null,
    stakeholder_role: activity.stakeholderRole || null,
    competitors: normalizeStringArray(activity.competitors),
    buying_signals: normalizeStringArray(activity.buyingSignals),
    risks: normalizeStringArray(activity.risks),
    timeline_signals: normalizeStringArray(activity.timelineSignals),
    next_actions: normalizeNextActions(activity.nextActions),
    summary: activity.summary,
    next_action: activity.nextAction || null,
    due_date: sanitizeBusinessDate(activity.dueDate) || null,
    tags: mergeActivitySourceTags(activity.tags, activity),
    linked_opportunity_id: null,
    linked_opportunity_name: null,
    linked_account_name: null,
    link_status: 'Unlinked',
    created_at: timestamps?.createdAt || timestamp,
    updated_at: timestamps?.updatedAt || timestamp,
  };
}

function mergeActivitySourceTags(tags: string[], activity: Partial<ClassifiedSalesActivity>) {
  const baseTags = Array.isArray(tags) ? tags : [];
  if (!activity.sourceType || !activity.sourceLabel || !activity.sourceHash) return baseTags;
  const sourceTags = buildIngestionSourceTags({
    sourceType: activity.sourceType,
    sourceLabel: activity.sourceLabel,
    safeHash: activity.sourceHash,
  });
  return Array.from(new Set([
    ...baseTags.filter((tag) => !tag.startsWith('source:') && !tag.startsWith('source-label:') && !tag.startsWith('source-hash:')),
    ...sourceTags,
  ]));
}

function parseActivitySourceMetadata(item: Partial<SalesActivityRecord | ClassifiedSalesActivity>) {
  const fromTags = parseIngestionSourceTags(item.tags);
  return {
    sourceType: normalizeIngestionSourceType(item.sourceType) || fromTags.sourceType,
    sourceLabel: item.sourceLabel || fromTags.sourceLabel || '',
    sourceTimestamp: sanitizeBusinessDate(item.sourceTimestamp),
    sourceHash: item.sourceHash || fromTags.sourceHash || '',
    originalExcerpt: item.originalExcerpt || '',
  };
}

function normalizeIngestionSourceType(value: unknown): IngestionSourceType | undefined {
  const parsed = parseIngestionSourceTags([`source:${String(value || '')}`]).sourceType;
  return parsed;
}

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sortNewestFirst(a: SalesActivityRecord, b: SalesActivityRecord) {
  return compareSafeBusinessDate(b.activityDate, a.activityDate) || b.createdAt.localeCompare(a.createdAt);
}

function normalizeLinkStatus(value: unknown): SalesActivityRecord['linkStatus'] {
  return ['Unlinked', 'Suggested', 'Linked', 'Ignored'].includes(value as string)
    ? value as SalesActivityRecord['linkStatus']
    : 'Unlinked';
}

function normalizeSource(value: unknown): SalesActivityRecord['source'] {
  return value === 'demo' ? 'demo' : value === 'user' ? 'user' : undefined;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))).slice(0, 12);
}

function normalizeNextActions(value: unknown): ClassifiedSalesActivity['nextActions'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const action = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
      const title = typeof action.title === 'string' ? action.title.trim() : '';
      if (!title) return null;
      const dueDate = sanitizeBusinessDate(action.dueDate);
      const owner = typeof action.owner === 'string' ? action.owner.trim() : '';
      const sourceText = typeof action.sourceText === 'string' ? action.sourceText.trim() : '';
      return {
        title,
        ...(dueDate ? { dueDate } : {}),
        ...(owner ? { owner } : {}),
        ...(sourceText ? { sourceText } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 8) as ClassifiedSalesActivity['nextActions'];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function debugSalesActivityStore(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[SalesActivityStore] ${message}`, context || {});
  }
}
