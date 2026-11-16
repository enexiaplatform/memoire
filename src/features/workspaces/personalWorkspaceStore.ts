import { nativeWorkspacesEnabled } from '../../services/activeWorkspaceScope';
import { supabaseAccountClient as supabaseClient } from '../../lib/supabaseClient';
import { fetchAllRows } from '../../services/supabasePaging';
import type { CopyCategory } from './workspaceCopy';

export type PersonalWorkspace = { id: string; name: string; created_at: string };
export type CommercialRecordCategory = 'opportunities' | 'quotes' | 'orders' | 'activities';
export type WorkspaceRecordCategory = CopyCategory | CommercialRecordCategory;

export type PersonalWorkspaceRecord = {
  id: string;
  category: WorkspaceRecordCategory;
  account_id: string | null;
  name: string;
  details: Record<string, unknown>;
};

export async function listPersonalWorkspaces(userId: string) {
  const client = supabaseClient;
  if (!client) throw new Error('Workspace storage is unavailable.');
  return fetchAllRows<PersonalWorkspace>((from, to) => client.from('memoire_personal_workspaces')
    .select('id, name, created_at').eq('user_id', userId).order('created_at').order('id').range(from, to) as never);
}

export async function createPersonalWorkspace(input: { id: string; name: string; sourceId: string | null; categories: CopyCategory[] }) {
  if (!supabaseClient) throw new Error('Workspace storage is unavailable.');
  const { data, error } = await supabaseClient.rpc(nativeWorkspacesEnabled ? 'memoire_create_native_workspace' : 'memoire_create_personal_workspace', {
    p_id: input.id, p_name: input.name, p_source_id: input.sourceId, p_options: input.categories,
  }).single();
  if (error?.code === '23505') throw new Error('A workspace already uses this name.');
  if (error || !data || typeof data !== 'object' || !('id' in data) || data.id !== input.id) throw new Error('Workspace creation could not be confirmed. Retry to check the same request.');
  return data as PersonalWorkspace;
}

export async function loadPersonalWorkspaceRecords(userId: string, workspaceId: string) {
  const client = supabaseClient;
  if (!client) throw new Error('Workspace storage is unavailable.');
  return fetchAllRows<PersonalWorkspaceRecord>((from, to) => client.from('memoire_personal_workspace_records')
    .select('id, category, account_id, name, details').eq('user_id', userId).eq('workspace_id', workspaceId)
    .order('category').order('name').order('id').range(from, to).setHeader('x-memoire-workspace', workspaceId) as never);
}

export async function savePersonalWorkspaceRecord(
  userId: string, workspaceId: string,
  record: Omit<PersonalWorkspaceRecord, 'id'>, id: string, editing: boolean,
) {
  if (!supabaseClient) throw new Error('Workspace storage is unavailable.');
  const table = supabaseClient.from('memoire_personal_workspace_records');
  const values = { name: record.name.trim(), details: record.details, account_id: record.account_id };
  const write = editing
    ? table.update(values).eq('user_id', userId).eq('workspace_id', workspaceId).eq('id', id)
    : table.upsert({ ...values, id, user_id: userId, workspace_id: workspaceId, category: record.category }, { onConflict: 'id', ignoreDuplicates: true });
  const result = await write.select('id, category, account_id, name, details')
    .setHeader('x-memoire-workspace', workspaceId).maybeSingle();
  if (result.error) throw new Error('The change could not be saved.');
  if (result.data) return result.data as PersonalWorkspaceRecord;
  if (!editing) {
    const { data, error } = await supabaseClient.from('memoire_personal_workspace_records')
      .select('id, category, account_id, name, details').eq('user_id', userId).eq('workspace_id', workspaceId)
      .eq('id', id).setHeader('x-memoire-workspace', workspaceId).single();
    if (!error && data?.category === record.category) return data as PersonalWorkspaceRecord;
  }
  throw new Error('The change could not be confirmed.');
}
