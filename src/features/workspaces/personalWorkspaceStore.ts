import { supabaseClient } from '../../lib/supabaseClient';
import { fetchAllRows } from '../../services/supabasePaging';
import type { CopyCategory } from './workspaceCopy';

export type PersonalWorkspace = { id: string; name: string; created_at: string };
export type PersonalWorkspaceRecord = {
  id: string;
  category: CopyCategory;
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
  const { data, error } = await supabaseClient.rpc('memoire_create_personal_workspace', {
    p_id: input.id, p_name: input.name, p_source_id: input.sourceId, p_options: input.categories,
  });
  if (error?.code === '23505') throw new Error('A workspace already uses this name.');
  if (error || !data || data.id !== input.id) throw new Error('Workspace creation could not be confirmed. Retry to check the same request.');
  return data as PersonalWorkspace;
}

export async function loadPersonalWorkspaceRecords(userId: string, workspaceId: string) {
  const client = supabaseClient;
  if (!client) throw new Error('Workspace storage is unavailable.');
  return fetchAllRows<PersonalWorkspaceRecord>((from, to) => client.from('memoire_personal_workspace_records')
    .select('id, category, name, details').eq('user_id', userId).eq('workspace_id', workspaceId)
    .order('category').order('name').order('id').range(from, to).setHeader('x-memoire-workspace', workspaceId) as never);
}

export async function renamePersonalWorkspaceRecord(userId: string, workspaceId: string, id: string, name: string) {
  if (!supabaseClient) throw new Error('Workspace storage is unavailable.');
  const { data, error } = await supabaseClient.from('memoire_personal_workspace_records')
    .update({ name: name.trim() }).eq('user_id', userId).eq('workspace_id', workspaceId).eq('id', id)
    .select('id, category, name, details').setHeader('x-memoire-workspace', workspaceId).single();
  if (error || !data) throw new Error('The change could not be saved.');
  return data as PersonalWorkspaceRecord;
}
