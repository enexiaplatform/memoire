import { createClient } from '@supabase/supabase-js';
import { verifyUserToken } from './_auth.js';
import { getSupabaseAnonKey, getSupabaseUrl } from './_env.js';

interface ApiRequest {
  method?: string;
  body?: { userId?: unknown; authToken?: unknown };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
}

export type ExportResult = {
  table: string;
  ownerColumn: 'id' | 'user_id';
  data: unknown[];
  warning: string;
};

export const exportTables = [
  { table: 'user_profiles', ownerColumn: 'id' },
  { table: 'usage_monthly', ownerColumn: 'user_id' },
  { table: 'sales_activities', ownerColumn: 'user_id' },
  { table: 'accounts', ownerColumn: 'user_id' },
  { table: 'opportunities', ownerColumn: 'user_id' },
  { table: 'stakeholders', ownerColumn: 'user_id' },
  { table: 'objections', ownerColumn: 'user_id' },
  { table: 'pipeline_defense_briefs', ownerColumn: 'user_id' },
  { table: 'review_packs', ownerColumn: 'user_id' },
  { table: 'sales_assets', ownerColumn: 'user_id' },
  { table: 'action_outcomes', ownerColumn: 'user_id' },
  { table: 'weekly_commitments', ownerColumn: 'user_id' },
  { table: 'plan_items', ownerColumn: 'user_id' },
  { table: 'deals', ownerColumn: 'user_id' },
  { table: 'captures', ownerColumn: 'user_id' },
  { table: 'entities', ownerColumn: 'user_id' },
  { table: 'relationships', ownerColumn: 'user_id' },
  { table: 'contacts', ownerColumn: 'user_id' },
  { table: 'interactions', ownerColumn: 'user_id' },
  { table: 'actions', ownerColumn: 'user_id' },
] as const;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, authToken } = req.body || {};
  if (typeof userId !== 'string' || typeof authToken !== 'string') {
    return res.status(400).json({ error: 'Authentication required.' });
  }

  const user = await verifyUserToken(authToken, userId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: `Bearer ${authToken}` } } },
  );

  const results = await Promise.all(exportTables.map(async ({ table, ownerColumn }) => {
    const { data, error } = await supabase.from(table).select('*').eq(ownerColumn, userId);
    const rows = Array.isArray(data) ? data : [];
    return {
      table,
      ownerColumn,
      data: rows,
      warning: error ? `${table}: ${error.message}` : '',
    };
  }));

  const contamination = findExportContamination(results, userId);
  if (contamination.length > 0) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Export contamination guard blocked response',
      userId,
      contamination,
    }));
    return res.status(500).json({ error: 'Export failed integrity checks. Please contact support before using this export.' });
  }

  const warnings = results.map((result) => result.warning).filter(Boolean);
  const data = Object.fromEntries(results.map((result) => [result.table, result.data]));
  const manifest = {
    complete: warnings.length === 0,
    table_count: results.length,
    row_count: results.reduce((total, result) => total + result.data.length, 0),
    tables: Object.fromEntries(results.map((result) => [result.table, {
      owner_column: result.ownerColumn,
      rows: result.data.length,
      warning: result.warning || undefined,
    }])),
  };

  return res.status(200).json({
    exported_at: new Date().toISOString(),
    user_id: userId,
    manifest,
    data,
    warnings,
  });
}

export function findExportContamination(
  results: ExportResult[],
  userId: string,
) {
  return results.flatMap((result) => {
    if (result.warning) return [];
    return result.data.flatMap((row, index) => {
      if (!row || typeof row !== 'object') {
        return [{ table: result.table, index, reason: 'row_not_object' }];
      }
      const owner = (row as Record<string, unknown>)[result.ownerColumn];
      return owner === userId ? [] : [{
        table: result.table,
        index,
        ownerColumn: result.ownerColumn,
        reason: 'owner_mismatch',
      }];
    });
  });
}
