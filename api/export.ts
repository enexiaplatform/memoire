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

const exportTables = [
  'sales_activities',
  'accounts',
  'opportunities',
  'stakeholders',
  'objections',
  'pipeline_defense_briefs',
  'captures',
  'entities',
  'relationships',
  'contacts',
  'interactions',
  'actions',
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

  const results = await Promise.all(exportTables.map(async (table) => {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
    return {
      table,
      data: data || [],
      warning: error ? `${table}: ${error.message}` : '',
    };
  }));

  const warnings = results.map((result) => result.warning).filter(Boolean);
  const data = Object.fromEntries(results.map((result) => [result.table, result.data]));

  return res.status(200).json({
    exported_at: new Date().toISOString(),
    user_id: userId,
    data,
    warnings,
  });
}
