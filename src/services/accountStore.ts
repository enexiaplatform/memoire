import { supabaseClient } from '../lib/supabaseClient.ts';
import { invalidateWorkspaceCollection } from './workspaceDataCache.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';
import { writeLocalRecords } from './localWriteGuard.ts';
import { fetchAllRows } from './supabasePaging.ts';

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
      invalidateWorkspaceCollection('accounts');
      return { account, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const account = createLocalAccount(normalized, userId || undefined);
      saveLocalAccountRecord(account);
      invalidateWorkspaceCollection('accounts');
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
  invalidateWorkspaceCollection('accounts');
  return { account, mode: 'local' };
}

/**
 * Creating a book of customers in one go.
 *
 * `createAccount` is right for the one account somebody types: it reloads the
 * cloud copy so the new account code cannot collide, then inserts. Called two
 * hundred times by a CSV import that is the wrong shape entirely - four hundred
 * round trips, several minutes, and a half-written workspace if the connection
 * drops in the middle. This reads once, allocates every code from that single
 * answer, and writes once.
 */
export async function createAccounts(
  inputs: AccountFormInput[],
  userId?: string | null
): Promise<{ accounts: AccountMemoryRecord[]; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = inputs.map(normalizeAccountInput).filter((input) => input.accountName);
  if (normalized.length === 0) return { accounts: [], mode: 'local' };

  if (canUseAccountCloudStore(userId)) {
    try {
      const cloudAccounts = await loadCloudAccounts(userId as string);
      const codes = allocateAccountCodes(cloudAccounts, normalized.length);
      const created = await createCloudAccounts(normalized, userId as string, codes);
      const localWrite = saveLocalAccountRecords(created.map((account) => ({ ...account, storageMode: 'local' as const })));
      invalidateWorkspaceCollection('accounts');
      return {
        accounts: created,
        mode: 'cloud',
        warning: localWrite?.ok === false ? localWrite.message : undefined,
      };
    } catch (error) {
      reportWorkspaceSyncError();
      debugAccountStore('cloud bulk create failed; local copies preserved', { message: getErrorMessage(error) });
      const local = createLocalAccounts(normalized, userId || undefined);
      invalidateWorkspaceCollection('accounts');
      return {
        accounts: local.accounts,
        mode: 'local',
        warning: local.write.ok === false
          ? local.write.message
          : 'Cloud sync issue - the imported accounts are saved on this device.',
      };
    }
  }

  const local = createLocalAccounts(normalized, userId || undefined);
  invalidateWorkspaceCollection('accounts');
  return {
    accounts: local.accounts,
    mode: 'local',
    warning: local.write.ok === false ? local.write.message : undefined,
  };
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
      invalidateWorkspaceCollection('accounts');
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
      invalidateWorkspaceCollection('accounts');
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
  invalidateWorkspaceCollection('accounts');
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
  invalidateWorkspaceCollection('accounts');
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
      writeLocalRecords(ACCOUNT_STORAGE_KEY, normalized.accounts);
    }
    return normalized.accounts;
  } catch {
    return [];
  }
}

function saveLocalAccountRecord(record: AccountMemoryRecord) {
  if (typeof localStorage === 'undefined') return;
  const next = [record, ...loadLocalAccounts().filter((item) => item.id !== record.id)];
  writeLocalRecords(ACCOUNT_STORAGE_KEY, next.sort(sortNewestFirst));
}

function saveLocalAccountRecords(records: AccountMemoryRecord[]) {
  if (typeof localStorage === 'undefined' || records.length === 0) return null;
  const ids = new Set(records.map((record) => record.id));
  const next = [...records, ...loadLocalAccounts().filter((item) => !ids.has(item.id))];
  return writeLocalRecords(ACCOUNT_STORAGE_KEY, next.sort(sortNewestFirst));
}

function deleteLocalAccount(accountId: string) {
  if (typeof localStorage === 'undefined') return;
  const next = loadLocalAccounts().filter((item) => item.id !== accountId);
  writeLocalRecords(ACCOUNT_STORAGE_KEY, next);
}

/**
 * Exactly the columns `rowToAccount` reads, and no others.
 *
 * `select('*')` shipped source_file, source_hash, source_row, source_sheet,
 * import_batch_id, source_capture_id, status, objections and pain_points on all
 * 1,083 rows, on every workspace load, for a mapper that reads none of them.
 * Anything added to the mapper has to be added here too - the list is the
 * contract between the two.
 */
const ACCOUNT_COLUMNS =
  'id,user_id,account_code,account_name,name,segment,industry,location,'
  + 'account_potential,relationship_status,key_stakeholders,notes,summary,tags,'
  + 'territory,state_province,ka_flag,priority,fy26_target_sgd,fy27_target_sgd,'
  + 'account_master_stage,strategy,strategy_owner,next_follow_up,overdue_status,'
  + 'source_system,external_source_key,created_at,updated_at';

async function loadCloudAccounts(userId: string): Promise<AccountMemoryRecord[]> {
  // Paged, because an unbounded select stops at PostgREST's 1000-row cap and
  // returns 200. This book holds 1,086 accounts; the app showed the first
  // thousand of them and called that the customer list.
  const data = await fetchAllRows((from, to) => supabaseClient!
    .from(TABLE_NAME)
    .select(ACCOUNT_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    // The tiebreaker, not decoration: this workspace imported 1,080 accounts in
    // one batch and they all share an `updated_at`. See `fetchAllRows`.
    .order('id', { ascending: true })
    .range(from, to));

  // The projected column list is not a literal type, so the client hands back
  // its generic row shape; the cast is the same one `select('*')` was getting.
  return ensureAccountCodes((data as unknown as AccountRow[]).map(rowToAccount)).accounts;
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

async function createCloudAccounts(inputs: AccountFormInput[], userId: string, codes: string[]) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .insert(inputs.map((input, index) => accountToInsert(input, userId, codes[index])))
    .select('*');

  if (error) {
    const fallback = await supabaseClient!
      .from(TABLE_NAME)
      .insert(inputs.map((input) => accountToInsertWithLegacyColumns(input, userId)))
      .select('*');

    if (fallback.error) throw new Error(fallback.error.message);
    return ((fallback.data || []) as AccountRow[]).map((row, index) => ({
      ...rowToAccount(row),
      accountCode: codes[index],
    }));
  }

  return ((data || []) as AccountRow[]).map((row, index) => {
    const created = rowToAccount(row);
    return { ...created, accountCode: created.accountCode || codes[index] };
  });
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

function createLocalAccounts(inputs: AccountFormInput[], userId?: string) {
  const existing = loadLocalAccounts();
  const codes = allocateAccountCodes(existing, inputs.length);
  const timestamp = new Date().toISOString();
  const accounts = inputs.map<AccountMemoryRecord>((input, index) => ({
    ...input,
    id: createId(),
    accountCode: codes[index],
    userId,
    source: 'user',
    isSample: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    storageMode: 'local',
  }));

  const write = writeLocalRecords(ACCOUNT_STORAGE_KEY, [...accounts, ...existing].sort(sortNewestFirst));
  return { accounts, write };
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
    // The KA mark was read back from the row and never written to it, so it
    // could only ever arrive by import. Now that the account form can set it,
    // leaving it out here would save a checkbox that silently does nothing -
    // the worst version of this bug, because the interface would say it saved.
    ka_flag: input.kaFlag ?? null,
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
  return allocateAccountCodes(accounts, 1)[0];
}

/**
 * `count` free codes in one pass. Calling the single-code version in a loop
 * would hand out the same number every time, because nothing it reads has
 * changed yet.
 */
function allocateAccountCodes(accounts: AccountMemoryRecord[], count: number) {
  const used = new Set(
    accounts
      .map((account) => parseAccountCode(account.accountCode))
      .filter((value): value is number => value !== null),
  );

  const codes: string[] = [];
  let candidate = 1;
  while (codes.length < count) {
    while (used.has(candidate)) candidate += 1;
    if (candidate > 9999) throw new Error('Account code limit reached.');
    used.add(candidate);
    codes.push(formatAccountCode(candidate));
  }

  return codes;
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
  // Optional chaining because this only ever runs from a catch block, and
  // outside Vite `import.meta.env` is undefined - a debug line that throws
  // would turn a recoverable sync failure into an unhandled error.
  if (import.meta.env?.DEV) {
    console.debug(`[AccountStore] ${message}`, context || {});
  }
}
