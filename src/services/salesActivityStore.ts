import { supabaseClient } from '../lib/supabaseClient.ts';
import { fetchAllRows } from './supabasePaging.ts';
import type { ClassifiedSalesActivity, SalesActivityType } from '../utils/salesActivityClassifier.ts';
import { normalizeActivityChannel, type ActivityChannel } from '../utils/activityChannel.ts';
import { invalidateWorkspaceCollection } from './workspaceDataCache.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';
import { compareBusinessDateDesc, isBusinessDateInRange, sanitizeBusinessDate } from '../utils/safeDate.ts';
import {
  buildIngestionSourceTags,
  parseIngestionSourceTags,
  type IngestionSourceType,
} from '../utils/ingestionSource.ts';
import { writeLocalRecords } from './localWriteGuard.ts';
import type { AnalyticsDataMode } from '../utils/productAnalytics.ts';

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
  activity_channel?: ActivityChannel | null;
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

/**
 * Everything captured on this device that the cloud has not accepted yet.
 *
 * Sample records are excluded rather than merely unsent: a demo touch is not
 * owed to anybody's account, and a record already carrying `pendingSync` from
 * before captures were tagged would otherwise be uploaded to the first real
 * workspace that signs in on this browser.
 */
export function listPendingSalesActivities(): SalesActivityRecord[] {
  return loadLocalActivities()
    .filter((record) => record.pendingSync)
    .filter((record) => record.source !== 'demo' && record.isSample !== true);
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

  if (synced > 0) invalidateWorkspaceCollection('activities');
  announcePendingSync();
  return { synced, remaining: listPendingSalesActivities().length, error };
}

export function filterSalesActivitiesByPeriod(
  activities: SalesActivityRecord[],
  period: { start: string; end: string }
) {
  return activities.filter((activity) => isBusinessDateInRange(activity.activityDate, period.start, period.end));
}

/**
 * Which workspace a capture belongs to.
 *
 * Every other store in this app tags its records at birth, and this one did not:
 * it wrote `source: 'user', isSample: false` on every touch, unconditionally.
 * The demo sandbox therefore produced captures that looked exactly like real
 * ones, and `isSampleRecord` in utils/sampleData.ts - which clears by `source`,
 * by `isSample`, by a `demo-` id or by a `demo-data` tag - matched none of them.
 * The sweep over SALES_ACTIVITY_STORAGE_KEY was already wired and already
 * asserted by the sample/live contract; what was missing was the label it sweeps
 * on. So anyone who tried the demo and then signed in on the same browser kept
 * every demo touch in their real workspace, on the product's own primary demo
 * path, and the "only records marked as demo are removed" banner was true only
 * because nothing had been marked.
 */
export type SalesActivityWorkspaceTag = { source?: 'demo' | 'user'; isSample?: boolean };

/**
 * Analytics, loaded only when there is a browser to load it in.
 *
 * `productAnalytics` imports `demoMode` and the Supabase client, both of which
 * read `import.meta.env` and exist only under Vite. A static import here put
 * that whole chain on the store's module graph, and the store is imported by
 * unit tests that run in plain node - `offlineCapture.test.mjs` stopped being
 * able to load at all.
 *
 * A dynamic import behind the window guard also keeps the rule the analytics
 * module states about itself: it must never block or break the workflow it sits
 * inside. Nothing here is awaited, and every failure ends in silence.
 */
function withAnalytics(use: (analytics: typeof import('../utils/productAnalytics.ts')) => void) {
  if (typeof window === 'undefined') return;
  void import('../utils/productAnalytics.ts').then(use).catch(() => {
    // A capture is never lost because a counter could not be incremented.
  });
}

/**
 * The two activation events a saved capture proves.
 *
 * Emitted from the store rather than from the page, because there are two save
 * handlers on Capture and both end here - and because neither of them emitted
 * anything at all. `capture_saved` had no call site in the app, which meant the
 * product's single most important action was unmeasured and the first two steps
 * of the onboarding funnel were permanently empty. The operator console draws
 * that funnel; four of its six rows could only ever read zero.
 *
 * `first_thread_linked` fires on the same rule `buildFirstWeekPath` uses to
 * tick step 2: a capture that names a customer has somewhere to live. An event
 * with a stricter rule than the checklist on screen would report a step as
 * undone while the operator is looking at a tick.
 *
 * `first_capture_saved` rides along with `capture_saved` automatically - see
 * ACTIVATION_OF in src/utils/activationEvents.ts.
 */
function trackCaptureSaved(record: SalesActivityRecord, demoOnly: boolean, dataMode: AnalyticsDataMode) {
  if (demoOnly) return;
  withAnalytics(({ trackProductEvent, trackFirstTimeEvent }) => {
    trackProductEvent('capture_saved', dataMode);
    if (record.accountName?.trim() || record.opportunityName?.trim()) {
      trackFirstTimeEvent('first_thread_linked', dataMode);
    }
  });
}

export async function saveSalesActivity(
  activity: ClassifiedSalesActivity,
  // Explicitly passed rather than optional, so the required tag can follow it.
  // Every caller already supplies it; `undefined` still means "no account".
  userId: string | null | undefined,
  // Required, deliberately. It defaulted to `{}` for one revision and that is
  // the same bug in a politer form: a caller that forgets it silently writes a
  // live record, which is exactly what every caller was doing before. Making
  // the compiler ask the question is the only version of this that cannot rot.
  workspace: SalesActivityWorkspaceTag,
): Promise<{ record: SalesActivityRecord; mode: 'local' | 'cloud'; warning?: string }> {
  // A sample capture never reaches the account, whatever id it was handed.
  // Callers already pass `undefined` for the user in demo mode, so this is a
  // second lock on the same door - but it is the door that decides whether a
  // stranger's demo lands in a paying workspace, and `pendingSync` below would
  // otherwise queue a demo touch for upload the moment a connection returned.
  const demoOnly = workspace.isSample === true || workspace.source === 'demo';

  if (!demoOnly && canUseSalesActivityCloudStore(userId)) {
    try {
      const record = await createCloudActivity(activity, userId as string);
      invalidateWorkspaceCollection('activities');
      trackCaptureSaved(record, demoOnly, 'cloud-synced');
      return { record, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      // Owed to the cloud, not merely saved locally. Without the flag this
      // capture is indistinguishable from one made while signed out, and
      // nothing would ever send it.
      const record = { ...createLocalActivity(activity, workspace), pendingSync: true };
      saveLocalActivityRecord(record);
      invalidateWorkspaceCollection('activities');
      announcePendingSync();
      debugSalesActivityStore('cloud save failed; local copy preserved', { message: getErrorMessage(error) });
      trackCaptureSaved(record, demoOnly, 'sync-failed');
      return {
        record,
        mode: 'local',
        warning: 'Saved on this device. Memoire will send it when the connection is back.',
      };
    }
  }

  const record = createLocalActivity(activity, workspace);
  saveLocalActivityRecord(record);
  invalidateWorkspaceCollection('activities');
  trackCaptureSaved(record, demoOnly, 'browser-only');
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
    invalidateWorkspaceCollection('activities');
    return;
  }

  deleteLocalActivity(activity.id);
  invalidateWorkspaceCollection('activities');
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

  // Step 2 of the first-week path, from the other direction: an existing
  // capture being attached by hand. The auto-link on save covers the common
  // case; this covers the one where somebody goes back and links it themselves,
  // and there are five call sites that write a link across three pages - which
  // is exactly why this sits here and not on any of them.
  if (link.linkStatus === 'Linked' && activity.isSample !== true && activity.source !== 'demo') {
    withAnalytics(({ trackFirstTimeEvent }) => trackFirstTimeEvent('first_thread_linked'));
  }

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
    invalidateWorkspaceCollection('activities');
    return rowToRecord(data as SalesActivityRow);
  }

  saveLocalActivityRecord({ ...updated, storageMode: 'local' });
  invalidateWorkspaceCollection('activities');
  return { ...updated, storageMode: 'local' };
}

export type SalesActivityDetailsInput = {
  nextAction?: string;
  dueDate?: string;
  /**
   * How the touch happened. Editable after the fact because the rules only ever
   * guessed it from the note, and a guess the operator can see but not correct
   * is worse than no guess at all.
   */
  activityChannel?: ActivityChannel | '';
  nextActions?: ClassifiedSalesActivity['nextActions'];
  /**
   * Who the touch is about and who it is with.
   *
   * These belong to the touch, not to the deal, which is exactly why the plan
   * board is allowed to write them: correcting the customer on a capture fixes
   * one record's own reading of itself, where correcting the customer on a deal
   * would move an entire opportunity.
   */
  accountName?: string;
  stakeholderName?: string;
  stakeholderRole?: string;
  linkedAccountName?: string;
  linkedOpportunityId?: string;
  linkedOpportunityName?: string;
  linkStatus?: SalesActivityRecord['linkStatus'];
};

/**
 * Rewrites what a touch says about itself - its dated next actions, the customer
 * it is about, the person it was with, and the deal it points at.
 *
 * This is the write behind dragging a capture item to another day, editing its
 * wording, or opening it on the plan board and correcting its details. The board
 * derives from the activity, so every one of those has to land here: writing any
 * of it anywhere else would create a second copy of the commitment that the
 * activity itself would quietly contradict.
 *
 * Every field is optional and `undefined` means "leave it alone", so a caller
 * changing only the date cannot blank a stakeholder it never looked at.
 */
export async function updateSalesActivityDetails(
  activity: SalesActivityRecord,
  changes: SalesActivityDetailsInput,
  userId?: string | null
): Promise<SalesActivityRecord> {
  const timestamp = new Date().toISOString();
  const linkStatus = changes.linkStatus !== undefined ? changes.linkStatus : activity.linkStatus;
  const updated: SalesActivityRecord = {
    ...activity,
    nextAction: changes.nextAction !== undefined ? changes.nextAction : activity.nextAction,
    dueDate: changes.dueDate !== undefined ? sanitizeBusinessDate(changes.dueDate) : activity.dueDate,
    nextActions: changes.nextActions !== undefined ? normalizeNextActions(changes.nextActions) : activity.nextActions,
    activityChannel: changes.activityChannel !== undefined
      ? normalizeActivityChannel(changes.activityChannel)
      : activity.activityChannel,
    accountName: changes.accountName !== undefined ? changes.accountName : activity.accountName,
    stakeholderName: changes.stakeholderName !== undefined ? changes.stakeholderName : activity.stakeholderName,
    stakeholderRole: changes.stakeholderRole !== undefined ? changes.stakeholderRole : activity.stakeholderRole,
    linkedAccountName: changes.linkedAccountName !== undefined ? changes.linkedAccountName : activity.linkedAccountName,
    linkedOpportunityId: changes.linkedOpportunityId !== undefined ? changes.linkedOpportunityId : activity.linkedOpportunityId,
    linkedOpportunityName: changes.linkedOpportunityName !== undefined ? changes.linkedOpportunityName : activity.linkedOpportunityName,
    linkStatus,
    updatedAt: timestamp,
  };

  if (activity.storageMode === 'cloud' && canUseSalesActivityCloudStore(userId)) {
    const { data, error } = await supabaseClient!
      .from(TABLE_NAME)
      .update({
        next_action: updated.nextAction || null,
        due_date: sanitizeBusinessDate(updated.dueDate) || null,
        next_actions: normalizeNextActions(updated.nextActions),
        activity_channel: normalizeActivityChannel(updated.activityChannel) || null,
        account_name: updated.accountName || null,
        stakeholder_name: updated.stakeholderName || null,
        stakeholder_role: updated.stakeholderRole || null,
        linked_account_name: updated.linkedAccountName || null,
        linked_opportunity_id: updated.linkedOpportunityId || null,
        linked_opportunity_name: updated.linkedOpportunityName || null,
        link_status: updated.linkStatus,
        updated_at: timestamp,
      })
      .eq('id', activity.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    invalidateWorkspaceCollection('activities');
    return rowToRecord(data as SalesActivityRow);
  }

  saveLocalActivityRecord({ ...updated, storageMode: 'local' });
  invalidateWorkspaceCollection('activities');
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
        activityChannel: normalizeActivityChannel(item.activityChannel),
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
  // Paged: see `fetchAllRows`. Activity is the fastest-growing table here, so
  // this is the one that would have met the cap next.
  const data = await fetchAllRows<SalesActivityRow>((from, to) => supabaseClient!
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false })
    // `activity_date` is a DATE and a day holds many touches, so the pair above
    // is not a total order. See `fetchAllRows`.
    .order('id', { ascending: true })
    .range(from, to) as never);

  return data.map(rowToRecord);
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

function createLocalActivity(
  activity: ClassifiedSalesActivity,
  workspace: SalesActivityWorkspaceTag = {},
): SalesActivityRecord {
  const timestamp = new Date().toISOString();
  const tags = mergeActivitySourceTags(activity.tags, activity);
  return {
    ...activity,
    activityDate: sanitizeBusinessDate(activity.activityDate),
    dueDate: sanitizeBusinessDate(activity.dueDate),
    nextActions: normalizeNextActions(activity.nextActions),
    tags,
    id: createId(),
    source: workspace.source ?? 'user',
    isSample: workspace.isSample === true,
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
    activityChannel: normalizeActivityChannel(row.activity_channel),
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
    // Written as null rather than '' when unstated, so "not stated" is one value
    // in the database instead of two that every query would have to test for.
    activity_channel: normalizeActivityChannel(activity.activityChannel) || null,
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
  return compareBusinessDateDesc(a.activityDate, b.activityDate) || b.createdAt.localeCompare(a.createdAt);
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
