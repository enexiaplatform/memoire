import { supabaseClient } from '../lib/supabaseClient';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import { reportWorkspaceSyncError } from './workspaceSyncStatus';

export const OBJECTION_STORAGE_KEY = 'memoire.objections.v1';

export const objectionTypes = [
  'Price',
  'Lead time',
  'Technical fit',
  'Documentation',
  'Local support',
  'Compliance / validation',
  'Competitor',
  'Budget',
  'Procurement',
  'Timing',
  'Trust / relationship',
  'Other',
] as const;

export const objectionImpacts = ['High', 'Medium', 'Low', 'Unknown'] as const;
export const objectionStatuses = ['Open', 'Addressed', 'Resolved', 'Parked'] as const;

export type ObjectionType = (typeof objectionTypes)[number];
export type ObjectionImpact = (typeof objectionImpacts)[number];
export type ObjectionStatus = (typeof objectionStatuses)[number];

export interface ObjectionRecord {
  id: string;
  userId?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  accountId: string;
  accountName: string;
  opportunityId: string;
  opportunityName: string;
  stakeholderId: string;
  stakeholderName: string;
  sourceActivityId: string;
  objectionType: ObjectionType;
  objectionText: string;
  impact: ObjectionImpact;
  status: ObjectionStatus;
  requiredProof: string;
  responsePlan: string;
  resolutionNote: string;
  dueDate: string;
  resolvedAt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  storageMode: 'local' | 'cloud';
}

export type ObjectionFormInput = Omit<ObjectionRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'storageMode' | 'source' | 'isSample'>;

type ObjectionRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  account_name: string | null;
  opportunity_id: string | null;
  opportunity_name: string | null;
  stakeholder_id: string | null;
  stakeholder_name: string | null;
  source_activity_id: string | null;
  objection_type: string | null;
  objection_text: string;
  impact: string | null;
  status: string | null;
  required_proof: string | null;
  response_plan: string | null;
  resolution_note: string | null;
  due_date: string | null;
  resolved_at: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

const TABLE_NAME = 'objections';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const emptyObjectionInput: ObjectionFormInput = {
  accountId: '',
  accountName: '',
  opportunityId: '',
  opportunityName: '',
  stakeholderId: '',
  stakeholderName: '',
  sourceActivityId: '',
  objectionType: 'Other',
  objectionText: '',
  impact: 'Unknown',
  status: 'Open',
  requiredProof: '',
  responsePlan: '',
  resolutionNote: '',
  dueDate: '',
  resolvedAt: '',
  tags: [],
};

export function canUseObjectionCloudStore(userId?: string | null) {
  return Boolean(userId && supabaseClient);
}

export async function loadObjections(userId?: string | null): Promise<ObjectionRecord[]> {
  if (canUseObjectionCloudStore(userId)) {
    try {
      return await loadCloudObjections(userId as string);
    } catch (error) {
      reportWorkspaceSyncError();
      debugObjectionStore('cloud load failed; falling back to local', { message: getErrorMessage(error) });
      return loadLocalObjections();
    }
  }
  return loadLocalObjections();
}

export async function createObjection(input: ObjectionFormInput, userId?: string | null): Promise<{ objection: ObjectionRecord; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeObjectionInput(input);
  if (canUseObjectionCloudStore(userId)) {
    try {
      const objection = await createCloudObjection(normalized, userId as string);
      saveLocalObjectionRecord({ ...objection, storageMode: 'local' });
      invalidateWorkspaceDataCache();
      return { objection, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const objection = createLocalObjection(normalized, userId || undefined);
      saveLocalObjectionRecord(objection);
      invalidateWorkspaceDataCache();
      debugObjectionStore('cloud create failed; local copy preserved', { message: getErrorMessage(error) });
      return { objection, mode: 'local', warning: 'Cloud sync issue - your local copy is preserved.' };
    }
  }

  const objection = createLocalObjection(normalized, userId || undefined);
  saveLocalObjectionRecord(objection);
  invalidateWorkspaceDataCache();
  return { objection, mode: 'local' };
}

export async function updateObjection(objection: ObjectionRecord, input: ObjectionFormInput, userId?: string | null): Promise<{ objection: ObjectionRecord; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeObjectionInput(input);
  if (objection.storageMode === 'cloud' && canUseObjectionCloudStore(userId)) {
    try {
      const updated = await updateCloudObjection(objection.id, normalized, userId as string);
      saveLocalObjectionRecord({ ...updated, storageMode: 'local' });
      invalidateWorkspaceDataCache();
      return { objection: updated, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const localCopy = { ...objection, ...normalized, updatedAt: new Date().toISOString(), storageMode: 'local' as const };
      saveLocalObjectionRecord(localCopy);
      invalidateWorkspaceDataCache();
      debugObjectionStore('cloud update failed; local copy preserved', { message: getErrorMessage(error) });
      return { objection: localCopy, mode: 'local', warning: 'Cloud sync issue - your local copy is preserved.' };
    }
  }

  const updated = { ...objection, ...normalized, updatedAt: new Date().toISOString(), storageMode: 'local' as const };
  saveLocalObjectionRecord(updated);
  invalidateWorkspaceDataCache();
  return { objection: updated, mode: 'local' };
}

export async function deleteObjection(objection: ObjectionRecord, userId?: string | null) {
  if (objection.storageMode === 'cloud' && canUseObjectionCloudStore(userId)) {
    const { error } = await supabaseClient!
      .from(TABLE_NAME)
      .delete()
      .eq('id', objection.id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
  deleteLocalObjection(objection.id);
  invalidateWorkspaceDataCache();
}

export function objectionToFormInput(objection: ObjectionRecord): ObjectionFormInput {
  return {
    accountId: objection.accountId,
    accountName: objection.accountName,
    opportunityId: objection.opportunityId,
    opportunityName: objection.opportunityName,
    stakeholderId: objection.stakeholderId,
    stakeholderName: objection.stakeholderName,
    sourceActivityId: objection.sourceActivityId,
    objectionType: objection.objectionType,
    objectionText: objection.objectionText,
    impact: objection.impact,
    status: objection.status,
    requiredProof: objection.requiredProof,
    responsePlan: objection.responsePlan,
    resolutionNote: objection.resolutionNote,
    dueDate: objection.dueDate,
    resolvedAt: objection.resolvedAt,
    tags: objection.tags,
  };
}

function loadLocalObjections(): ObjectionRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(OBJECTION_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<ObjectionRecord>[];
    return parsed
      .filter((item) => item.id && item.objectionText)
      .map<ObjectionRecord>((item) => ({
        id: item.id || createId(),
        userId: item.userId,
        source: item.source === 'demo' ? 'demo' : item.source === 'user' ? 'user' : undefined,
        isSample: item.isSample === true,
        accountId: item.accountId || '',
        accountName: item.accountName || '',
        opportunityId: item.opportunityId || '',
        opportunityName: item.opportunityName || '',
        stakeholderId: item.stakeholderId || '',
        stakeholderName: item.stakeholderName || '',
        sourceActivityId: item.sourceActivityId || '',
        objectionType: normalizeType(item.objectionType),
        objectionText: item.objectionText || '',
        impact: normalizeImpact(item.impact),
        status: normalizeStatus(item.status),
        requiredProof: item.requiredProof || '',
        responsePlan: item.responsePlan || '',
        resolutionNote: item.resolutionNote || '',
        dueDate: item.dueDate || '',
        resolvedAt: item.resolvedAt || '',
        tags: normalizeTags(item.tags),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        storageMode: 'local',
      }))
      .sort(sortNewestFirst);
  } catch {
    return [];
  }
}

function saveLocalObjectionRecord(record: ObjectionRecord) {
  if (typeof localStorage === 'undefined') return;
  const next = [record, ...loadLocalObjections().filter((item) => item.id !== record.id)];
  localStorage.setItem(OBJECTION_STORAGE_KEY, JSON.stringify(next.sort(sortNewestFirst)));
}

function deleteLocalObjection(objectionId: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OBJECTION_STORAGE_KEY, JSON.stringify(loadLocalObjections().filter((item) => item.id !== objectionId)));
}

async function loadCloudObjections(userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data || []) as ObjectionRow[]).map(rowToObjection);
}

async function createCloudObjection(input: ObjectionFormInput, userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .insert(objectionToInsert(input, userId))
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToObjection(data as ObjectionRow);
}

async function updateCloudObjection(objectionId: string, input: ObjectionFormInput, userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .update(objectionToUpdate(input))
    .eq('id', objectionId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToObjection(data as ObjectionRow);
}

function createLocalObjection(input: ObjectionFormInput, userId?: string): ObjectionRecord {
  const timestamp = new Date().toISOString();
  return {
    ...input,
    id: createId(),
    userId,
    source: 'user',
    isSample: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    storageMode: 'local',
  };
}

function rowToObjection(row: ObjectionRow): ObjectionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    source: 'user',
    isSample: false,
    accountId: row.account_id || '',
    accountName: row.account_name || '',
    opportunityId: row.opportunity_id || '',
    opportunityName: row.opportunity_name || '',
    stakeholderId: row.stakeholder_id || '',
    stakeholderName: row.stakeholder_name || '',
    sourceActivityId: row.source_activity_id || '',
    objectionType: normalizeType(row.objection_type),
    objectionText: row.objection_text || '',
    impact: normalizeImpact(row.impact),
    status: normalizeStatus(row.status),
    requiredProof: row.required_proof || '',
    responsePlan: row.response_plan || '',
    resolutionNote: row.resolution_note || '',
    dueDate: row.due_date || '',
    resolvedAt: row.resolved_at || '',
    tags: normalizeTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode: 'cloud',
  };
}

function objectionToInsert(input: ObjectionFormInput, userId: string) {
  const timestamp = new Date().toISOString();
  return { user_id: userId, ...objectionToRow(input), created_at: timestamp, updated_at: timestamp };
}

function objectionToUpdate(input: ObjectionFormInput) {
  return { ...objectionToRow(input), updated_at: new Date().toISOString() };
}

function objectionToRow(input: ObjectionFormInput) {
  return {
    account_id: toUuidOrNull(input.accountId),
    account_name: input.accountName || null,
    opportunity_id: toUuidOrNull(input.opportunityId),
    opportunity_name: input.opportunityName || null,
    stakeholder_id: toUuidOrNull(input.stakeholderId),
    stakeholder_name: input.stakeholderName || null,
    source_activity_id: toUuidOrNull(input.sourceActivityId),
    objection_type: input.objectionType,
    objection_text: input.objectionText,
    impact: input.impact,
    status: input.status,
    required_proof: input.requiredProof || null,
    response_plan: input.responsePlan || null,
    resolution_note: input.resolutionNote || null,
    due_date: input.dueDate || null,
    resolved_at: input.resolvedAt || null,
    tags: normalizeTags(input.tags),
  };
}

function normalizeObjectionInput(input: ObjectionFormInput): ObjectionFormInput {
  return {
    ...emptyObjectionInput,
    ...input,
    accountName: input.accountName.trim(),
    opportunityName: input.opportunityName.trim(),
    stakeholderName: input.stakeholderName.trim(),
    objectionType: normalizeType(input.objectionType),
    objectionText: input.objectionText.trim(),
    impact: normalizeImpact(input.impact),
    status: normalizeStatus(input.status),
    requiredProof: input.requiredProof.trim(),
    responsePlan: input.responsePlan.trim(),
    resolutionNote: input.resolutionNote.trim(),
    tags: normalizeTags(input.tags),
  };
}

function normalizeType(value: unknown): ObjectionType {
  return objectionTypes.includes(value as ObjectionType) ? value as ObjectionType : 'Other';
}

function normalizeImpact(value: unknown): ObjectionImpact {
  return objectionImpacts.includes(value as ObjectionImpact) ? value as ObjectionImpact : 'Unknown';
}

function normalizeStatus(value: unknown): ObjectionStatus {
  return objectionStatuses.includes(value as ObjectionStatus) ? value as ObjectionStatus : 'Open';
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))).slice(0, 12);
}

function toUuidOrNull(value?: string | null) {
  const trimmed = (value || '').trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sortNewestFirst(a: ObjectionRecord, b: ObjectionRecord) {
  const statusRank = (value: ObjectionStatus) => value === 'Open' ? 0 : value === 'Addressed' ? 1 : value === 'Parked' ? 2 : 3;
  return statusRank(a.status) - statusRank(b.status) || b.updatedAt.localeCompare(a.updatedAt);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function debugObjectionStore(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[ObjectionStore] ${message}`, context || {});
  }
}
