import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from './_env.js';

interface ApiRequest {
  method?: string;
  body?: {
    userId?: unknown;
    authToken?: unknown;
  };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, authToken } = req.body || {};
  if (!userId || !authToken) return res.status(400).json({ error: 'Auth required' });
  if (typeof userId !== 'string' || typeof authToken !== 'string') {
    return res.status(400).json({ error: 'Invalid auth payload' });
  }

  const supabase = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: `Bearer ${authToken}` } } }
  );

  try {
    const [captures, entities, relationships, accounts, contacts, opportunities, interactions, actions] = await Promise.all([
      supabase.from('captures').select('*').eq('user_id', userId),
      supabase.from('entities').select('*').eq('user_id', userId),
      supabase.from('relationships').select('*').eq('user_id', userId),
      supabase.from('accounts').select('*').eq('user_id', userId),
      supabase.from('contacts').select('*').eq('user_id', userId),
      supabase.from('opportunities').select('*').eq('user_id', userId),
      supabase.from('interactions').select('*').eq('user_id', userId),
      supabase.from('actions').select('*').eq('user_id', userId)
    ]);

    if (captures.error) throw captures.error;
    if (entities.error) throw entities.error;
    if (relationships.error) throw relationships.error;
    if (accounts.error) throw accounts.error;
    if (contacts.error) throw contacts.error;
    if (opportunities.error) throw opportunities.error;
    if (interactions.error) throw interactions.error;
    if (actions.error) throw actions.error;

    res.json({
      timestamp: new Date().toISOString(),
      user_id: userId,
      data: {
        captures: captures.data || [],
        entities: entities.data || [],
        relationships: relationships.data || [],
        accounts: accounts.data || [],
        contacts: contacts.data || [],
        opportunities: opportunities.data || [],
        interactions: interactions.data || [],
        actions: actions.data || []
      }
    });

  } catch (err) {
    console.error('Export failed:', err);
    res.status(500).json({ error: 'Data extraction failed' });
  }
}
