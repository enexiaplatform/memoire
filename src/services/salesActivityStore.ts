import { supabaseClient } from '../lib/supabaseClient';
import type { ClassifiedSalesActivity, SalesActivityType } from '../utils/salesActivityClassifier';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import { reportWorkspaceSyncError } from './workspaceSyncStatus';

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
      return await loadCloudActivities(userId as string);
    } catch (error) {
      reportWorkspaceSyncError();
      debugSalesActivityStore('cloud load failed; falling back to local', { message: getErrorMessage(error) });
      return loadLocalActivities();
    }
  }

  return loadLocalActivities();
}

export function filterSalesActivitiesByPeriod(
  activities: SalesActivityRecord[],
  period: { start: string; end: string }
) {
  return activities.filter((activity) => activity.activityDate >= period.start && activity.activityDate <= period.end);
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
      const record = createLocalActivity(activity);
      saveLocalActivityRecord(record);
      invalidateWorkspaceDataCache();
      debugSalesActivityStore('cloud save failed; local copy preserved', { message: getErrorMessage(error) });
      return {
        record,
        mode: 'local',
        warning: 'Cloud sync issue - your local copy is preserved.',
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

function loadLocalActivities(): SalesActivityRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(SALES_ACTIVITY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<SalesActivityRecord>[];
    return parsed
      .filter((item) => item.id && item.rawNote && item.activityDate)
      .map<SalesActivityRecord>((item) => ({
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
        dueDate: item.dueDate || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        linkedOpportunityId: item.linkedOpportunityId || '',
        linkedOpportunityName: item.linkedOpportunityName || '',
        linkedAccountName: item.linkedAccountName || '',
        linkStatus: normalizeLinkStatus(item.linkStatus),
        rawNote: item.rawNote || '',
        activityDate: item.activityDate || new Date().toISOString().slice(0, 10),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        storageMode: 'local',
      }))
      .sort(sortNewestFirst);
  } catch {
    return [];
  }
}

function saveLocalActivityRecord(record: SalesActivityRecord) {
  const next = [record, ...loadLocalActivities().filter((item) => item.id !== record.id)];
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SALES_ACTIVITY_STORAGE_KEY, JSON.stringify(next.sort(sortNewestFirst)));
  }
}

function deleteLocalActivity(activityId: string) {
  if (typeof localStorage === 'undefined') return;
  const next = loadLocalActivities().filter((item) => item.id !== activityId);
  localStorage.setItem(SALES_ACTIVITY_STORAGE_KEY, JSON.stringify(next));
}

async function loadCloudActivities(userId: string): Promise<SalesActivityRecord[]> {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return ((data || []) as SalesActivityRow[]).map(rowToRecord);
}

async function createCloudActivity(activity: ClassifiedSalesActivity, userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .insert(activityToInsert(activity, userId))
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToRecord(data as SalesActivityRow);
}

function createLocalActivity(activity: ClassifiedSalesActivity): SalesActivityRecord {
  const timestamp = new Date().toISOString();
  return {
    ...activity,
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
  return {
    id: row.id,
    userId: row.user_id,
    source: 'user',
    isSample: false,
    activityDate: row.activity_date,
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
    dueDate: row.due_date || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    linkedOpportunityId: row.linked_opportunity_id || '',
    linkedOpportunityName: row.linked_opportunity_name || '',
    linkedAccountName: row.linked_account_name || '',
    linkStatus: normalizeLinkStatus(row.link_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode: 'cloud',
  };
}

function activityToInsert(activity: ClassifiedSalesActivity, userId: string) {
  const timestamp = new Date().toISOString();
  return {
    user_id: userId,
    activity_date: activity.activityDate,
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
    due_date: activity.dueDate || null,
    tags: activity.tags,
    linked_opportunity_id: null,
    linked_opportunity_name: null,
    linked_account_name: null,
    link_status: 'Unlinked',
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sortNewestFirst(a: SalesActivityRecord, b: SalesActivityRecord) {
  return `${b.activityDate}-${b.createdAt}`.localeCompare(`${a.activityDate}-${a.createdAt}`);
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
      const dueDate = typeof action.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(action.dueDate) ? action.dueDate : '';
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
