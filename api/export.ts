import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, authToken } = req.body;
  if (!userId || !authToken) return res.status(400).json({ error: 'Auth required' });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${authToken}` } } }
  );

  try {
    const [captures, entities, relationships] = await Promise.all([
      supabase.from('captures').select('*').eq('user_id', userId),
      supabase.from('entities').select('*').eq('user_id', userId),
      supabase.from('relationships').select('*').eq('user_id', userId)
    ]);

    if (captures.error) throw captures.error;
    if (entities.error) throw entities.error;
    if (relationships.error) throw relationships.error;

    res.json({
      timestamp: new Date().toISOString(),
      user_id: userId,
      data: {
        captures: captures.data || [],
        entities: entities.data || [],
        relationships: relationships.data || []
      }
    });

  } catch (err: any) {
    console.error('Export failed:', err);
    res.status(500).json({ error: 'Data extraction failed' });
  }
}
