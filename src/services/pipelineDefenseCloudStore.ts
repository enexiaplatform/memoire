import { supabaseClient } from '../lib/supabaseClient';
import type { PipelineDefenseBrief, PipelineDefenseBriefStore } from '../utils/pipelineDefenseStorage';
import { reportClientOperationalEvent } from './clientTelemetry';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';

type PipelineDefenseBriefRow = {
  id: string;
  user_id: string;
  title: string;
  week_label: string | null;
  sales_owner: string | null;
  scope: string | null;
  deals: PipelineDefenseBrief['deals'];
  created_at: string;
  updated_at: string;
};

const TABLE_NAME = 'pipeline_defense_briefs';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canUsePipelineDefenseCloudStore() {
  return Boolean(supabaseClient);
}

export async function loadCloudBriefs(userId: string): Promise<PipelineDefenseBrief[]> {
  if (!supabaseClient) return [];
  debugCloudSync('cloud load started');

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    reportPipelineDefenseCloudFailure('load', error);
    throw new Error(error.message);
  }
  const briefs = (data || []).map(rowToBrief);
  debugCloudSync('cloud load completed', { count: briefs.length });
  return briefs;
}

export async function saveCloudBrief(brief: PipelineDefenseBrief, userId: string): Promise<PipelineDefenseBrief> {
  if (isUuid(brief.id)) {
    return updateCloudBrief(brief);
  }
  return createCloudBrief(brief, userId);
}

export async function createCloudBrief(brief: PipelineDefenseBrief, userId: string): Promise<PipelineDefenseBrief> {
  if (!supabaseClient) throw new Error('Cloud sync unavailable.');
  debugCloudSync('cloud create started');

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .insert(briefToInsert(brief, userId))
    .select('*')
    .single();

  if (error) {
    reportPipelineDefenseCloudFailure('create', error);
    throw new Error(error.message);
  }
  const created = rowToBrief(data as PipelineDefenseBriefRow);
  invalidateWorkspaceDataCache();
  debugCloudSync('cloud create completed');
  return created;
}

export async function updateCloudBrief(brief: PipelineDefenseBrief): Promise<PipelineDefenseBrief> {
  if (!supabaseClient) throw new Error('Cloud sync unavailable.');
  if (!isUuid(brief.id)) throw new Error('Brief has not been synced to cloud yet.');
  debugCloudSync('cloud update started');

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .update(briefToUpdate(brief))
    .eq('id', brief.id)
    .select('*')
    .single();

  if (error) {
    reportPipelineDefenseCloudFailure('update', error);
    throw new Error(error.message);
  }
  const updated = rowToBrief(data as PipelineDefenseBriefRow);
  invalidateWorkspaceDataCache();
  debugCloudSync('cloud update completed');
  return updated;
}

export async function deleteCloudBrief(briefId: string) {
  if (!supabaseClient || !isUuid(briefId)) return;
  debugCloudSync('cloud delete started');

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .delete()
    .eq('id', briefId);

  if (error) {
    reportPipelineDefenseCloudFailure('delete', error);
    throw new Error(error.message);
  }
  invalidateWorkspaceDataCache();
  debugCloudSync('cloud delete completed');
}

export async function syncLocalBriefsToCloud(localStore: PipelineDefenseBriefStore, userId: string): Promise<PipelineDefenseBriefStore> {
  debugCloudSync('local migration started', { count: localStore.briefs.length });
  const existingCloudBriefs = await loadCloudBriefs(userId);
  const existingIds = new Set(existingCloudBriefs.map((brief) => brief.id));
  const migratedBriefs: PipelineDefenseBrief[] = [];

  for (const brief of localStore.briefs) {
    const title = existingIds.has(brief.id) ? `Migrated - ${brief.title}` : brief.title;
    const migrated = await createCloudBrief({ ...brief, title }, userId);
    migratedBriefs.push(migrated);
  }

  const briefs = [...migratedBriefs, ...existingCloudBriefs];
  return {
    activeBriefId: migratedBriefs[0]?.id || existingCloudBriefs[0]?.id || '',
    briefs,
  };
}

export function hasCloudBriefId(brief: PipelineDefenseBrief | null) {
  return Boolean(brief?.id && isUuid(brief.id));
}

function rowToBrief(row: PipelineDefenseBriefRow): PipelineDefenseBrief {
  return {
    id: row.id,
    title: row.title,
    weekLabel: row.week_label || 'Current Week',
    salesOwner: row.sales_owner && row.sales_owner !== 'Henry' ? row.sales_owner : 'Sales owner',
    scope: row.scope || 'Demo review pipeline',
    deals: Array.isArray(row.deals) ? row.deals : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function briefToInsert(brief: PipelineDefenseBrief, userId: string) {
  return {
    user_id: userId,
    title: brief.title,
    week_label: brief.weekLabel,
    sales_owner: brief.salesOwner,
    scope: brief.scope,
    deals: brief.deals,
    created_at: brief.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function briefToUpdate(brief: PipelineDefenseBrief) {
  return {
    title: brief.title,
    week_label: brief.weekLabel,
    sales_owner: brief.salesOwner,
    scope: brief.scope,
    deals: brief.deals,
    updated_at: new Date().toISOString(),
  };
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function debugCloudSync(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[PipelineDefenseCloudSync] ${message}`, context || {});
  }
}

function reportPipelineDefenseCloudFailure(
  operation: 'load' | 'create' | 'update' | 'delete',
  error: unknown,
) {
  reportClientOperationalEvent({
    eventName: 'pipeline_defense_cloud_sync_failed',
    component: 'pipelineDefenseCloudStore',
    operation,
    table: TABLE_NAME,
    severity: 'error',
    error,
  });
}
