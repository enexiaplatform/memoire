import { supabaseClient } from '../lib/supabaseClient';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import { reportWorkspaceSyncError } from './workspaceSyncStatus';

export const OPERATING_CONTEXT_STORAGE_KEY = 'memoire.operatingContext.v1';
export const operatingContextTypes = ['initiative', 'play'] as const;

export type OperatingContextType = (typeof operatingContextTypes)[number];

export type OperatingContextRecord = {
  id: string;
  userId?: string;
  contextType: OperatingContextType;
  title: string;
  status: string;
  period: string;
  owner: string;
  valueAtStake: number | null;
  nextAction: string;
  nextDate: string;
  summary: string;
  payload: Record<string, unknown>;
  sourceSystem?: string;
  externalSourceKey?: string;
  createdAt: string;
  updatedAt: string;
  storageMode: 'local' | 'cloud';
};

export type OperatingContextFormInput = Pick<
  OperatingContextRecord,
  'contextType' | 'title' | 'status' | 'period' | 'owner' | 'valueAtStake' | 'nextAction' | 'nextDate' | 'summary' | 'payload'
>;

type OperatingContextRow = {
  id: string;
  user_id: string;
  context_type: string;
  title: string;
  status: string | null;
  period: string | null;
  owner: string | null;
  value_at_stake: number | string | null;
  next_action: string | null;
  next_date: string | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  source_system?: string | null;
  external_source_key?: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE_NAME = 'operating_context';

export const emptyOperatingContextInput: OperatingContextFormInput = {
  contextType: 'initiative',
  title: '',
  status: 'Active',
  period: '',
  owner: '',
  valueAtStake: null,
  nextAction: '',
  nextDate: '',
  summary: '',
  payload: {},
};

export async function loadOperatingContext(userId?: string | null): Promise<OperatingContextRecord[]> {
  if (userId && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from(TABLE_NAME)
        .select('id,user_id,context_type,title,status,period,owner,value_at_stake,next_action,next_date,summary,payload,source_system,external_source_key,created_at,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) throw new Error(error.message);
      return ((data || []) as OperatingContextRow[]).map(rowToOperatingContext);
    } catch (error) {
      reportWorkspaceSyncError();
      debugOperatingContext('cloud load failed; falling back to user-scoped local copy', error);
      return loadLocalOperatingContext(userId);
    }
  }

  return loadLocalOperatingContext(userId || 'guest');
}

export async function createOperatingContext(
  input: OperatingContextFormInput,
  userId?: string | null,
): Promise<{ record: OperatingContextRecord; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeInput(input);
  if (userId && supabaseClient) {
    try {
      const timestamp = new Date().toISOString();
      const { data, error } = await supabaseClient
        .from(TABLE_NAME)
        .insert({
          ...inputToRow(normalized),
          user_id: userId,
          source_system: 'memoire',
          external_source_key: `memoire:${createId()}`,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      const record = rowToOperatingContext(data as OperatingContextRow);
      saveLocalOperatingContext(record, userId);
      invalidateWorkspaceDataCache();
      return { record, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const record = createLocalOperatingContext(normalized, userId || 'guest');
      saveLocalOperatingContext(record, userId || 'guest');
      invalidateWorkspaceDataCache();
      debugOperatingContext('cloud create failed; local copy preserved', error);
      return { record, mode: 'local', warning: 'Cloud sync issue - your local copy is preserved.' };
    }
  }

  const scope = userId || 'guest';
  const record = createLocalOperatingContext(normalized, scope);
  saveLocalOperatingContext(record, scope);
  invalidateWorkspaceDataCache();
  return { record, mode: 'local' };
}

export async function updateOperatingContext(
  record: OperatingContextRecord,
  input: OperatingContextFormInput,
  userId?: string | null,
): Promise<{ record: OperatingContextRecord; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeInput(input);
  if (record.storageMode === 'cloud' && userId && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from(TABLE_NAME)
        .update({ ...inputToRow(normalized), updated_at: new Date().toISOString() })
        .eq('id', record.id)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      const updated = rowToOperatingContext(data as OperatingContextRow);
      saveLocalOperatingContext(updated, userId);
      invalidateWorkspaceDataCache();
      return { record: updated, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const localCopy = toLocalRecord(record, normalized, userId);
      saveLocalOperatingContext(localCopy, userId);
      invalidateWorkspaceDataCache();
      debugOperatingContext('cloud update failed; local copy preserved', error);
      return { record: localCopy, mode: 'local', warning: 'Cloud sync issue - your local copy is preserved.' };
    }
  }

  const scope = userId || record.userId || 'guest';
  const updated = toLocalRecord(record, normalized, scope);
  saveLocalOperatingContext(updated, scope);
  invalidateWorkspaceDataCache();
  return { record: updated, mode: 'local' };
}

export async function deleteOperatingContext(record: OperatingContextRecord, userId?: string | null) {
  if (record.storageMode === 'cloud' && userId && supabaseClient) {
    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .delete()
      .eq('id', record.id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  deleteLocalOperatingContext(record.id, userId || record.userId || 'guest');
  invalidateWorkspaceDataCache();
}

export function operatingContextToForm(record: OperatingContextRecord): OperatingContextFormInput {
  return {
    contextType: record.contextType,
    title: record.title,
    status: record.status,
    period: record.period,
    owner: record.owner,
    valueAtStake: record.valueAtStake,
    nextAction: record.nextAction,
    nextDate: record.nextDate,
    summary: record.summary,
    payload: record.payload,
  };
}

export function isOperatingContextClosed(record: OperatingContextRecord) {
  return /complete|completed|done|closed|cancel|lost/i.test(record.status);
}

function rowToOperatingContext(row: OperatingContextRow): OperatingContextRecord {
  return {
    id: row.id,
    userId: row.user_id,
    contextType: normalizeContextType(row.context_type),
    title: row.title || '',
    status: row.status || '',
    period: row.period || '',
    owner: row.owner || '',
    valueAtStake: normalizeNumber(row.value_at_stake),
    nextAction: row.next_action || '',
    nextDate: normalizeDate(row.next_date),
    summary: row.summary || '',
    payload: isObject(row.payload) ? row.payload : {},
    sourceSystem: row.source_system || '',
    externalSourceKey: row.external_source_key || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode: 'cloud',
  };
}

function inputToRow(input: OperatingContextFormInput) {
  return {
    context_type: input.contextType,
    title: input.title,
    status: input.status || null,
    period: input.period || null,
    owner: input.owner || null,
    value_at_stake: input.valueAtStake,
    next_action: input.nextAction || null,
    next_date: input.nextDate || null,
    summary: input.summary || null,
    payload: input.payload,
  };
}

function normalizeInput(input: OperatingContextFormInput): OperatingContextFormInput {
  return {
    contextType: normalizeContextType(input.contextType),
    title: input.title.trim(),
    status: input.status.trim(),
    period: input.period.trim(),
    owner: input.owner.trim(),
    valueAtStake: normalizeNumber(input.valueAtStake),
    nextAction: input.nextAction.trim(),
    nextDate: normalizeDate(input.nextDate),
    summary: input.summary.trim(),
    payload: isObject(input.payload) ? input.payload : {},
  };
}

function createLocalOperatingContext(input: OperatingContextFormInput, userId: string): OperatingContextRecord {
  const timestamp = new Date().toISOString();
  return {
    ...input,
    id: createId(),
    userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    storageMode: 'local',
  };
}

function toLocalRecord(record: OperatingContextRecord, input: OperatingContextFormInput, userId: string): OperatingContextRecord {
  return {
    ...record,
    ...input,
    userId,
    updatedAt: new Date().toISOString(),
    storageMode: 'local',
  };
}

function localStorageKey(userId: string) {
  return `${OPERATING_CONTEXT_STORAGE_KEY}:${userId}`;
}

function loadLocalOperatingContext(userId: string): OperatingContextRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(localStorageKey(userId));
    if (!raw) return [];
    const records = JSON.parse(raw) as OperatingContextRecord[];
    return Array.isArray(records)
      ? records.map((record) => ({ ...record, storageMode: 'local' as const })).sort(sortNewestFirst)
      : [];
  } catch {
    return [];
  }
}

function saveLocalOperatingContext(record: OperatingContextRecord, userId: string) {
  if (typeof localStorage === 'undefined') return;
  const next = [record, ...loadLocalOperatingContext(userId).filter((item) => item.id !== record.id)];
  localStorage.setItem(localStorageKey(userId), JSON.stringify(next.sort(sortNewestFirst)));
}

function deleteLocalOperatingContext(recordId: string, userId: string) {
  if (typeof localStorage === 'undefined') return;
  const next = loadLocalOperatingContext(userId).filter((item) => item.id !== recordId);
  localStorage.setItem(localStorageKey(userId), JSON.stringify(next));
}

function normalizeContextType(value: unknown): OperatingContextType {
  return value === 'play' ? 'play' : 'initiative';
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: unknown) {
  if (typeof value !== 'string') return '';
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `operating-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortNewestFirst(left: OperatingContextRecord, right: OperatingContextRecord) {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function debugOperatingContext(message: string, error: unknown) {
  if (!import.meta.env.DEV) return;
  console.debug('[OperatingContext]', message, {
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}
