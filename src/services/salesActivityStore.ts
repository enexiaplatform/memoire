import { supabaseClient } from '../lib/supabaseClient';
import type { ClassifiedSalesActivity, SalesActivityType } from '../utils/salesActivityClassifier';

export interface SalesActivityRecord extends ClassifiedSalesActivity {
  id: string;
  userId?: string;
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
  summary: string | null;
  next_action: string | null;
  due_date: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

const TABLE_NAME = 'sales_activities';
const LOCAL_STORAGE_KEY = 'memoire.salesActivities.v1';

export function canUseSalesActivityCloudStore(userId?: string | null) {
  return Boolean(userId && supabaseClient);
}

export async function loadSalesActivities(userId?: string | null): Promise<SalesActivityRecord[]> {
  if (canUseSalesActivityCloudStore(userId)) {
    try {
      return await loadCloudActivities(userId as string);
    } catch (error) {
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
      return { record, mode: 'cloud' };
    } catch (error) {
      const record = createLocalActivity(activity);
      saveLocalActivityRecord(record);
      return {
        record,
        mode: 'local',
        warning: `Cloud save failed, local copy preserved: ${getErrorMessage(error)}`,
      };
    }
  }

  const record = createLocalActivity(activity);
  saveLocalActivityRecord(record);
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
    return;
  }

  deleteLocalActivity(activity.id);
}

function loadLocalActivities(): SalesActivityRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<SalesActivityRecord>[];
    return parsed
      .filter((item) => item.id && item.rawNote && item.activityDate)
      .map<SalesActivityRecord>((item) => ({
        id: item.id || createId(),
        userId: item.userId,
        accountName: item.accountName || '',
        opportunityName: item.opportunityName || '',
        activityType: item.activityType || 'Other',
        summary: item.summary || item.rawNote || '',
        nextAction: item.nextAction || '',
        dueDate: item.dueDate || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
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
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next.sort(sortNewestFirst)));
  }
}

function deleteLocalActivity(activityId: string) {
  if (typeof localStorage === 'undefined') return;
  const next = loadLocalActivities().filter((item) => item.id !== activityId);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
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
    createdAt: timestamp,
    updatedAt: timestamp,
    storageMode: 'local',
  };
}

function rowToRecord(row: SalesActivityRow): SalesActivityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    activityDate: row.activity_date,
    rawNote: row.raw_note,
    activityType: row.activity_type || 'Other',
    accountName: row.account_name || '',
    opportunityName: row.opportunity_name || '',
    summary: row.summary || row.raw_note,
    nextAction: row.next_action || '',
    dueDate: row.due_date || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
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
    summary: activity.summary,
    next_action: activity.nextAction || null,
    due_date: activity.dueDate || null,
    tags: activity.tags,
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function debugSalesActivityStore(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[SalesActivityStore] ${message}`, context || {});
  }
}
