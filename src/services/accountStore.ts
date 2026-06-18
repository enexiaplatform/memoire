import { supabaseClient } from '../lib/supabaseClient';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import { reportWorkspaceSyncError } from './workspaceSyncStatus';

export const ACCOUNT_STORAGE_KEY = 'memoire.accounts.v1';

export const accountPotentials = ['High', 'Medium', 'Low', 'Unknown'] as const;
export const relationshipStatuses = ['New', 'Developing', 'Active', 'Dormant', 'At risk', 'Strong'] as const;

export type AccountPotential = (typeof accountPotentials)[number];
export type RelationshipStatus = (typeof relationshipStatuses)[number];

export interface AccountMemoryRecord {
  id: string;
  accountCode?: string;
  userId?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  accountName: string;
  segment: string;
  industry: string;
  location: string;
  accountPotential: AccountPotential;
  relationshipStatus: RelationshipStatus;
  keyStakeholders: string[];
  notes: string;
  tags: string[];
  territory?: string;
  stateProvince?: string;
  kaFlag?: boolean | null;
  priority?: string;
  fy26TargetSgd?: number | null;
  fy27TargetSgd?: number | null;
  accountMasterStage?: string;
  strategy?: string;
  strategyOwner?: string;
  nextFollowUp?: string;
  overdueStatus?: string;
  sourceSystem?: string;
  externalSourceKey?: string;
  createdAt: string;
  updatedAt: string;
  storageMode: 'local' | 'cloud';
}

export type AccountFormInput = Omit<AccountMemoryRecord, 'id' | 'accountCode' | 'userId' | 'createdAt' | 'updatedAt' | 'storageMode' | 'source' | 'isSample'>;

type AccountRow = {
  id: string;
  account_code?: string | null;
  user_id: string;
  account_name?: string | null;
  name?: string | null;
  segment: string | null;
  industry: string | null;
  location: string | null;
  account_potential: string | null;
  relationship_status: string | null;
  key_stakeholders: string[] | null;
  notes: string | null;
  tags: string[] | null;
  summary?: string | null;
  territory?: string | null;
  state_province?: string | null;
  ka_flag?: boolean | null;
  priority?: string | null;
  fy26_target_sgd?: number | string | null;
  fy27_target_sgd?: number | string | null;
  account_master_stage?: string | null;
  strategy?: string | null;
  strategy_owner?: string | null;
  next_follow_up?: string | null;
  overdue_status?: string | null;
  source_system?: string | null;
  external_source_key?: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE_NAME = 'accounts';

export const emptyAccountInput: AccountFormInput = {
  accountName: '',
  segment: '',
  industry: '',
  location: '',
  accountPotential: 'Unknown',
  relationshipStatus: 'New',
  keyStakeholders: [],
  notes: '',
  tags: [],
};

export function canUseAccountCloudStore(userId?: string | null) {
  return Boolean(userId && supabaseClient);
}

export async function loadAccounts(userId?: string | null): Promise<AccountMemoryRecord[]> {
  if (canUseAccountCloudStore(userId)) {
    try {
      return await loadCloudAccounts(userId as string);
    } catch (error) {
      reportWorkspaceSyncError();
      debugAccountStore('cloud load failed; falling back to local', { message: getErrorMessage(error) });
      return loadLocalAccounts();
    }
  }

  return loadLocalAccounts();
}

export async function createAccount(
  input: AccountFormInput,
  userId?: string | null
): Promise<{ account: AccountMemoryRecord; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeAccountInput(input);

  if (canUseAccountCloudStore(userId)) {
    try {
      const cloudAccounts = await loadCloudAccounts(userId as string);
      const accountCode = getNextAccountCode(cloudAccounts);
      const account = await createCloudAccount(normalized, userId as string, accountCode);
      saveLocalAccountRecord({ ...account, storageMode: 'local' });
      invalidateWorkspaceDataCache();
      return { account, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const account = createLocalAccount(normalized, userId || undefined);
      saveLocalAccountRecord(account);
      invalidateWorkspaceDataCache();
      debugAccountStore('cloud create failed; local copy preserved', { message: getErrorMessage(error) });
      return {
        account,
        mode: 'local',
        warning: 'Cloud sync issue - your local copy is preserved.',
      };
    }
  }

  const account = createLocalAccount(normalized, userId || undefined);
  saveLocalAccountRecord(account);
  invalidateWorkspaceDataCache();
  return { account, mode: 'local' };
}

export async function updateAccount(
  account: AccountMemoryRecord,
  input: AccountFormInput,
  userId?: string | null
): Promise<{ account: AccountMemoryRecord; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeAccountInput(input);

  if (account.storageMode === 'cloud' && canUseAccountCloudStore(userId)) {
    try {
      const updated = await updateCloudAccount(account.id, normalized, userId as string);
      updated.accountCode ||= account.accountCode;
      saveLocalAccountRecord({ ...updated, storageMode: 'local' });
      invalidateWorkspaceDataCache();
      return { account: updated, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const localCopy = {
        ...account,
        ...normalized,
        updatedAt: new Date().toISOString(),
        storageMode: 'local' as const,
      };
      saveLocalAccountRecord(localCopy);
      invalidateWorkspaceDataCache();
      debugAccountStore('cloud update failed; local copy preserved', { message: getErrorMessage(error) });
      return {
        account: localCopy,
        mode: 'local',
        warning: 'Cloud sync issue - your local copy is preserved.',
      };
    }
  }

  const updated = {
    ...account,
    ...normalized,
    updatedAt: new Date().toISOString(),
    storageMode: 'local' as const,
  };
  saveLocalAccountRecord(updated);
  invalidateWorkspaceDataCache();
  return { account: updated, mode: 'local' };
}

export async function deleteAccount(account: AccountMemoryRecord, userId?: string | null) {
  if (account.storageMode === 'cloud' && canUseAccountCloudStore(userId)) {
    const { error } = await supabaseClient!
      .from(TABLE_NAME)
      .delete()
      .eq('id', account.id)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
  }

  deleteLocalAccount(account.id);
  invalidateWorkspaceDataCache();
}

export function accountToFormInput(account: AccountMemoryRecord): AccountFormInput {
  return {
    accountName: account.accountName,
    segment: account.segment,
    industry: account.industry,
    location: account.location,
    accountPotential: account.accountPotential,
    relationshipStatus: account.relationshipStatus,
    keyStakeholders: account.keyStakeholders,
    notes: account.notes,
    tags: account.tags,
  };
}

function loadLocalAccounts(): AccountMemoryRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<AccountMemoryRecord>[];
    const accounts = parsed
      .filter((item) => item.id && item.accountName)
      .map<AccountMemoryRecord>((item) => ({
        id: item.id || createId(),
        accountCode: normalizeAccountCode(item.accountCode),
        userId: item.userId,
        source: normalizeSource(item.source),
        isSample: item.isSample === true,
        accountName: item.accountName || '',
        segment: item.segment || '',
        industry: item.industry || '',
        location: item.location || '',
        accountPotential: normalizePotential(item.accountPotential),
        relationshipStatus: normalizeRelationshipStatus(item.relationshipStatus),
        keyStakeholders: Array.isArray(item.keyStakeholders) ? item.keyStakeholders : [],
        notes: item.notes || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        territory: item.territory || '',
        stateProvince: item.stateProvince || '',
        kaFlag: item.kaFlag ?? null,
        priority: item.priority || '',
        fy26TargetSgd: normalizeNumber(item.fy26TargetSgd),
        fy27TargetSgd: normalizeNumber(item.fy27TargetSgd),
        accountMasterStage: item.accountMasterStage || '',
        strategy: item.strategy || '',
        strategyOwner: item.strategyOwner || '',
        nextFollowUp: item.nextFollowUp || '',
        overdueStatus: item.overdueStatus || '',
        sourceSystem: item.sourceSystem || '',
        externalSourceKey: item.externalSourceKey || '',
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        storageMode: 'local',
      }))
      .sort(sortNewestFirst);
    const normalized = ensureAccountCodes(accounts);
    if (normalized.changed) {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(normalized.accounts));
    }
    return normalized.accounts;
  } catch {
    return [];
  }
}

function saveLocalAccountRecord(record: AccountMemoryRecord) {
  if (typeof localStorage === 'undefined') return;
  const next = [record, ...loadLocalAccounts().filter((item) => item.id !== record.id)];
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(next.sort(sortNewestFirst)));
}

function deleteLocalAccount(accountId: string) {
  if (typeof localStorage === 'undefined') return;
  const next = loadLocalAccounts().filter((item) => item.id !== accountId);
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(next));
}

async function loadCloudAccounts(userId: string): Promise<AccountMemoryRecord[]> {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ensureAccountCodes(((data || []) as AccountRow[]).map(rowToAccount)).accounts;
}

async function createCloudAccount(input: AccountFormInput, userId: string, accountCode: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .insert(accountToInsert(input, userId, accountCode))
    .select('*')
    .single();

  if (error) {
    const fallback = await supabaseClient!
      .from(TABLE_NAME)
      .insert(accountToInsertWithLegacyColumns(input, userId))
      .select('*')
      .single();

    if (fallback.error) throw new Error(fallback.error.message);
    return { ...rowToAccount(fallback.data as AccountRow), accountCode };
  }

  const created = rowToAccount(data as AccountRow);
  return { ...created, accountCode: created.accountCode || accountCode };
}

async function updateCloudAccount(accountId: string, input: AccountFormInput, userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .update(accountToUpdate(input))
    .eq('id', accountId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    const fallback = await supabaseClient!
      .from(TABLE_NAME)
      .update(accountToUpdateWithLegacyColumns(input))
      .eq('id', accountId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (fallback.error) throw new Error(fallback.error.message);
    return rowToAccount(fallback.data as AccountRow);
  }

  return rowToAccount(data as AccountRow);
}

function createLocalAccount(input: AccountFormInput, userId?: string): AccountMemoryRecord {
  const timestamp = new Date().toISOString();
  return {
    ...input,
    id: createId(),
    accountCode: getNextAccountCode(loadLocalAccounts()),
    userId,
    source: 'user',
    isSample: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    storageMode: 'local',
  };
}

function rowToAccount(row: AccountRow): AccountMemoryRecord {
  return {
    id: row.id,
    accountCode: normalizeAccountCode(row.account_code),
    userId: row.user_id,
    source: 'user',
    isSample: false,
    accountName: row.account_name || row.name || '',
    segment: row.segment || '',
    industry: row.industry || '',
    location: row.location || '',
    accountPotential: normalizePotential(row.account_potential),
    relationshipStatus: normalizeRelationshipStatus(row.relationship_status),
    keyStakeholders: Array.isArray(row.key_stakeholders) ? row.key_stakeholders : [],
    notes: row.notes || row.summary || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    territory: row.territory || '',
    stateProvince: row.state_province || '',
    kaFlag: row.ka_flag ?? null,
    priority: row.priority || '',
    fy26TargetSgd: normalizeNumber(row.fy26_target_sgd),
    fy27TargetSgd: normalizeNumber(row.fy27_target_sgd),
    accountMasterStage: row.account_master_stage || '',
    strategy: row.strategy || '',
    strategyOwner: row.strategy_owner || '',
    nextFollowUp: row.next_follow_up || '',
    overdueStatus: row.overdue_status || '',
    sourceSystem: row.source_system || '',
    externalSourceKey: row.external_source_key || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode: 'cloud',
  };
}

function accountToInsert(input: AccountFormInput, userId: string, accountCode: string) {
  const timestamp = new Date().toISOString();
  return {
    ...accountToRow(input),
    account_code: accountCode,
    user_id: userId,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function accountToInsertWithLegacyColumns(input: AccountFormInput, userId: string) {
  const timestamp = new Date().toISOString();
  return {
    ...accountToRow(input),
    user_id: userId,
    created_at: timestamp,
    updated_at: timestamp,
    name: input.accountName,
    summary: input.notes || null,
    status: 'active',
    pain_points: [],
    objections: [],
  };
}

function accountToUpdate(input: AccountFormInput) {
  return {
    ...accountToRow(input),
    updated_at: new Date().toISOString(),
  };
}

function accountToUpdateWithLegacyColumns(input: AccountFormInput) {
  return {
    ...accountToUpdate(input),
    name: input.accountName,
    summary: input.notes || null,
  };
}

function accountToRow(input: AccountFormInput) {
  return {
    account_name: input.accountName,
    segment: input.segment || null,
    industry: input.industry || null,
    location: input.location || null,
    account_potential: input.accountPotential,
    relationship_status: input.relationshipStatus,
    key_stakeholders: input.keyStakeholders,
    notes: input.notes || null,
    tags: input.tags,
  };
}

function normalizeAccountInput(input: AccountFormInput): AccountFormInput {
  return {
    ...emptyAccountInput,
    ...input,
    accountName: input.accountName.trim(),
    accountPotential: normalizePotential(input.accountPotential),
    relationshipStatus: normalizeRelationshipStatus(input.relationshipStatus),
    keyStakeholders: input.keyStakeholders.map((item) => item.trim()).filter(Boolean),
    tags: input.tags.map((item) => item.trim()).filter(Boolean),
  };
}

function normalizePotential(value: unknown): AccountPotential {
  return accountPotentials.includes(value as AccountPotential) ? value as AccountPotential : 'Unknown';
}

function normalizeRelationshipStatus(value: unknown): RelationshipStatus {
  return relationshipStatuses.includes(value as RelationshipStatus) ? value as RelationshipStatus : 'New';
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSource(value: unknown): AccountMemoryRecord['source'] {
  return value === 'demo' ? 'demo' : value === 'user' ? 'user' : undefined;
}

export function getAccountCode(account: AccountMemoryRecord) {
  return normalizeAccountCode(account.accountCode) || 'ACC-UNASSIGNED';
}

function getNextAccountCode(accounts: AccountMemoryRecord[]) {
  const used = new Set(
    accounts
      .map((account) => parseAccountCode(account.accountCode))
      .filter((value): value is number => value !== null),
  );

  for (let index = 1; index <= 9999; index += 1) {
    if (!used.has(index)) return formatAccountCode(index);
  }

  throw new Error('Account code limit reached.');
}

function ensureAccountCodes(accounts: AccountMemoryRecord[]) {
  const used = new Set<number>();
  let changed = false;
  const ordered = [...accounts].sort((left, right) =>
    `${left.createdAt}-${left.id}`.localeCompare(`${right.createdAt}-${right.id}`),
  );

  ordered.forEach((account) => {
    const parsed = parseAccountCode(account.accountCode);
    if (parsed && !used.has(parsed)) {
      account.accountCode = formatAccountCode(parsed);
      used.add(parsed);
      return;
    }

    let next = 1;
    while (used.has(next) && next <= 9999) next += 1;
    if (next > 9999) throw new Error('Account code limit reached.');
    account.accountCode = formatAccountCode(next);
    used.add(next);
    changed = true;
  });

  return { accounts: [...accounts].sort(sortNewestFirst), changed };
}

function normalizeAccountCode(value: unknown) {
  const parsed = parseAccountCode(value);
  return parsed ? formatAccountCode(parsed) : '';
}

function parseAccountCode(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = /^ACC-(\d{1,4})$/i.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 && number <= 9999 ? number : null;
}

function formatAccountCode(value: number) {
  return `ACC-${String(value).padStart(4, '0')}`;
}

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sortNewestFirst(a: AccountMemoryRecord, b: AccountMemoryRecord) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function debugAccountStore(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[AccountStore] ${message}`, context || {});
  }
}
