import { supabaseClient } from '../lib/supabaseClient';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import { reportWorkspaceSyncError } from './workspaceSyncStatus';

export const STAKEHOLDER_STORAGE_KEY = 'memoire.stakeholders.v1';

export const stakeholderRoles = [
  'Champion',
  'Economic Buyer',
  'Technical Buyer',
  'Procurement',
  'User',
  'Coach',
  'Blocker',
  'Decision Committee',
  'Unknown',
] as const;

export const influenceLevels = ['High', 'Medium', 'Low', 'Unknown'] as const;
export const relationshipStrengths = ['Strong', 'Developing', 'Weak', 'Unknown'] as const;
export const stakeholderStances = ['Supportive', 'Neutral', 'Resistant', 'Unknown'] as const;

export type StakeholderRole = (typeof stakeholderRoles)[number];
export type InfluenceLevel = (typeof influenceLevels)[number];
export type RelationshipStrength = (typeof relationshipStrengths)[number];
export type StakeholderStance = (typeof stakeholderStances)[number];

export interface StakeholderRecord {
  id: string;
  userId?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  accountId: string;
  accountName: string;
  opportunityId: string;
  opportunityName: string;
  name: string;
  roleTitle: string;
  stakeholderRole: StakeholderRole;
  influenceLevel: InfluenceLevel;
  relationshipStrength: RelationshipStrength;
  stance: StakeholderStance;
  email: string;
  phone: string;
  notes: string;
  tags: string[];
  lastInteractionDate: string;
  createdAt: string;
  updatedAt: string;
  storageMode: 'local' | 'cloud';
}

export type StakeholderFormInput = Omit<StakeholderRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'storageMode' | 'source' | 'isSample'>;

type StakeholderRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  account_name: string | null;
  opportunity_id: string | null;
  opportunity_name: string | null;
  name: string;
  role_title: string | null;
  stakeholder_role: string | null;
  influence_level: string | null;
  relationship_strength: string | null;
  stance: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[] | null;
  last_interaction_date: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE_NAME = 'stakeholders';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const emptyStakeholderInput: StakeholderFormInput = {
  accountId: '',
  accountName: '',
  opportunityId: '',
  opportunityName: '',
  name: '',
  roleTitle: '',
  stakeholderRole: 'Unknown',
  influenceLevel: 'Unknown',
  relationshipStrength: 'Unknown',
  stance: 'Unknown',
  email: '',
  phone: '',
  notes: '',
  tags: [],
  lastInteractionDate: '',
};

export function canUseStakeholderCloudStore(userId?: string | null) {
  return Boolean(userId && supabaseClient);
}

export async function loadStakeholders(userId?: string | null): Promise<StakeholderRecord[]> {
  if (canUseStakeholderCloudStore(userId)) {
    try {
      return await loadCloudStakeholders(userId as string);
    } catch (error) {
      reportWorkspaceSyncError();
      debugStakeholderStore('cloud load failed; falling back to local', { message: getErrorMessage(error) });
      return loadLocalStakeholders();
    }
  }
  return loadLocalStakeholders();
}

export async function createStakeholder(input: StakeholderFormInput, userId?: string | null): Promise<{ stakeholder: StakeholderRecord; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeStakeholderInput(input);
  if (canUseStakeholderCloudStore(userId)) {
    try {
      const stakeholder = await createCloudStakeholder(normalized, userId as string);
      saveLocalStakeholderRecord({ ...stakeholder, storageMode: 'local' });
      invalidateWorkspaceDataCache();
      return { stakeholder, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const stakeholder = createLocalStakeholder(normalized, userId || undefined);
      saveLocalStakeholderRecord(stakeholder);
      invalidateWorkspaceDataCache();
      debugStakeholderStore('cloud create failed; local copy preserved', { message: getErrorMessage(error) });
      return { stakeholder, mode: 'local', warning: 'Cloud sync issue - your local copy is preserved.' };
    }
  }
  const stakeholder = createLocalStakeholder(normalized, userId || undefined);
  saveLocalStakeholderRecord(stakeholder);
  invalidateWorkspaceDataCache();
  return { stakeholder, mode: 'local' };
}

export async function updateStakeholder(stakeholder: StakeholderRecord, input: StakeholderFormInput, userId?: string | null): Promise<{ stakeholder: StakeholderRecord; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeStakeholderInput(input);
  if (stakeholder.storageMode === 'cloud' && canUseStakeholderCloudStore(userId)) {
    try {
      const updated = await updateCloudStakeholder(stakeholder.id, normalized, userId as string);
      saveLocalStakeholderRecord({ ...updated, storageMode: 'local' });
      invalidateWorkspaceDataCache();
      return { stakeholder: updated, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const localCopy = { ...stakeholder, ...normalized, updatedAt: new Date().toISOString(), storageMode: 'local' as const };
      saveLocalStakeholderRecord(localCopy);
      invalidateWorkspaceDataCache();
      debugStakeholderStore('cloud update failed; local copy preserved', { message: getErrorMessage(error) });
      return { stakeholder: localCopy, mode: 'local', warning: 'Cloud sync issue - your local copy is preserved.' };
    }
  }
  const updated = { ...stakeholder, ...normalized, updatedAt: new Date().toISOString(), storageMode: 'local' as const };
  saveLocalStakeholderRecord(updated);
  invalidateWorkspaceDataCache();
  return { stakeholder: updated, mode: 'local' };
}

export async function deleteStakeholder(stakeholder: StakeholderRecord, userId?: string | null) {
  if (stakeholder.storageMode === 'cloud' && canUseStakeholderCloudStore(userId)) {
    const { error } = await supabaseClient!
      .from(TABLE_NAME)
      .delete()
      .eq('id', stakeholder.id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
  deleteLocalStakeholder(stakeholder.id);
  invalidateWorkspaceDataCache();
}

export function stakeholderToFormInput(stakeholder: StakeholderRecord): StakeholderFormInput {
  return {
    accountId: stakeholder.accountId,
    accountName: stakeholder.accountName,
    opportunityId: stakeholder.opportunityId,
    opportunityName: stakeholder.opportunityName,
    name: stakeholder.name,
    roleTitle: stakeholder.roleTitle,
    stakeholderRole: stakeholder.stakeholderRole,
    influenceLevel: stakeholder.influenceLevel,
    relationshipStrength: stakeholder.relationshipStrength,
    stance: stakeholder.stance,
    email: stakeholder.email,
    phone: stakeholder.phone,
    notes: stakeholder.notes,
    tags: stakeholder.tags,
    lastInteractionDate: stakeholder.lastInteractionDate,
  };
}

function loadLocalStakeholders(): StakeholderRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STAKEHOLDER_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<StakeholderRecord>[];
    return parsed
      .filter((item) => item.id && item.name)
      .map<StakeholderRecord>((item) => ({
        id: item.id || createId(),
        userId: item.userId,
        source: item.source === 'demo' ? 'demo' : item.source === 'user' ? 'user' : undefined,
        isSample: item.isSample === true,
        accountId: item.accountId || '',
        accountName: item.accountName || '',
        opportunityId: item.opportunityId || '',
        opportunityName: item.opportunityName || '',
        name: item.name || '',
        roleTitle: item.roleTitle || '',
        stakeholderRole: normalizeRole(item.stakeholderRole),
        influenceLevel: normalizeInfluence(item.influenceLevel),
        relationshipStrength: normalizeRelationship(item.relationshipStrength),
        stance: normalizeStance(item.stance),
        email: item.email || '',
        phone: item.phone || '',
        notes: item.notes || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        lastInteractionDate: item.lastInteractionDate || '',
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        storageMode: 'local',
      }))
      .sort(sortNewestFirst);
  } catch {
    return [];
  }
}

function saveLocalStakeholderRecord(record: StakeholderRecord) {
  if (typeof localStorage === 'undefined') return;
  const next = [record, ...loadLocalStakeholders().filter((item) => item.id !== record.id)];
  localStorage.setItem(STAKEHOLDER_STORAGE_KEY, JSON.stringify(next.sort(sortNewestFirst)));
}

function deleteLocalStakeholder(stakeholderId: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STAKEHOLDER_STORAGE_KEY, JSON.stringify(loadLocalStakeholders().filter((item) => item.id !== stakeholderId)));
}

async function loadCloudStakeholders(userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data || []) as StakeholderRow[]).map(rowToStakeholder);
}

async function createCloudStakeholder(input: StakeholderFormInput, userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .insert(stakeholderToInsert(input, userId))
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToStakeholder(data as StakeholderRow);
}

async function updateCloudStakeholder(stakeholderId: string, input: StakeholderFormInput, userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .update(stakeholderToUpdate(input))
    .eq('id', stakeholderId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToStakeholder(data as StakeholderRow);
}

function createLocalStakeholder(input: StakeholderFormInput, userId?: string): StakeholderRecord {
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

function rowToStakeholder(row: StakeholderRow): StakeholderRecord {
  return {
    id: row.id,
    userId: row.user_id,
    source: 'user',
    isSample: false,
    accountId: row.account_id || '',
    accountName: row.account_name || '',
    opportunityId: row.opportunity_id || '',
    opportunityName: row.opportunity_name || '',
    name: row.name || '',
    roleTitle: row.role_title || '',
    stakeholderRole: normalizeRole(row.stakeholder_role),
    influenceLevel: normalizeInfluence(row.influence_level),
    relationshipStrength: normalizeRelationship(row.relationship_strength),
    stance: normalizeStance(row.stance),
    email: row.email || '',
    phone: row.phone || '',
    notes: row.notes || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    lastInteractionDate: row.last_interaction_date || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode: 'cloud',
  };
}

function stakeholderToInsert(input: StakeholderFormInput, userId: string) {
  return { user_id: userId, ...stakeholderToRow(input), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

function stakeholderToUpdate(input: StakeholderFormInput) {
  return { ...stakeholderToRow(input), updated_at: new Date().toISOString() };
}

function stakeholderToRow(input: StakeholderFormInput) {
  return {
    account_id: toUuidOrNull(input.accountId),
    account_name: input.accountName || null,
    opportunity_id: toUuidOrNull(input.opportunityId),
    opportunity_name: input.opportunityName || null,
    name: input.name,
    role_title: input.roleTitle || null,
    stakeholder_role: input.stakeholderRole,
    influence_level: input.influenceLevel,
    relationship_strength: input.relationshipStrength,
    stance: input.stance,
    email: input.email || null,
    phone: input.phone || null,
    notes: input.notes || null,
    tags: input.tags,
    last_interaction_date: input.lastInteractionDate || null,
  };
}

function toUuidOrNull(value?: string | null) {
  const trimmed = (value || '').trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeStakeholderInput(input: StakeholderFormInput): StakeholderFormInput {
  return {
    ...input,
    accountName: input.accountName.trim(),
    opportunityName: input.opportunityName.trim(),
    name: input.name.trim(),
    roleTitle: input.roleTitle.trim(),
    stakeholderRole: normalizeRole(input.stakeholderRole),
    influenceLevel: normalizeInfluence(input.influenceLevel),
    relationshipStrength: normalizeRelationship(input.relationshipStrength),
    stance: normalizeStance(input.stance),
    email: input.email.trim(),
    phone: input.phone.trim(),
    notes: input.notes.trim(),
    tags: normalizeTags(input.tags),
  };
}

function normalizeRole(value: unknown): StakeholderRole {
  if (value === 'Economic buyer' || value === 'Decision maker') return 'Economic Buyer';
  if (value === 'Technical buyer' || value === 'Legal / QA / Compliance') return 'Technical Buyer';
  if (value === 'Influencer') return 'Coach';
  return stakeholderRoles.includes(value as StakeholderRole) ? value as StakeholderRole : 'Unknown';
}

function normalizeInfluence(value: unknown): InfluenceLevel {
  return influenceLevels.includes(value as InfluenceLevel) ? value as InfluenceLevel : 'Unknown';
}

function normalizeRelationship(value: unknown): RelationshipStrength {
  return relationshipStrengths.includes(value as RelationshipStrength) ? value as RelationshipStrength : 'Unknown';
}

function normalizeStance(value: unknown): StakeholderStance {
  return stakeholderStances.includes(value as StakeholderStance) ? value as StakeholderStance : 'Unknown';
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
}

function sortNewestFirst(a: StakeholderRecord, b: StakeholderRecord) {
  return `${b.updatedAt}-${b.createdAt}`.localeCompare(`${a.updatedAt}-${a.createdAt}`);
}

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function debugStakeholderStore(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[StakeholderStore] ${message}`, context || {});
  }
}
