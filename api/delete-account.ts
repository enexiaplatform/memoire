import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';

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

  const supabaseUser = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: `Bearer ${authToken}` } } }
  );

  const { data: authData, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !authData.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (authData.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const supabase = createClient(
    getSupabaseUrl(),
    getSupabaseServiceRoleKey() // Need service role to delete user entirely
  );

  try {
    // With service_role and ON DELETE CASCADE on the schema, deleting the user from auth.users
    // will delete all their data in capturing tables automatically if foreign keys are set up.
    // Ensure we delete from auth schema
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) throw error;

    res.json({ success: true });

  } catch (err) {
    console.error('Delete user failed:', err);
    res.status(500).json({ error: 'Deletion failed' });
  }
}
