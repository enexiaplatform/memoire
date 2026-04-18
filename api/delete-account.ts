import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, authToken } = req.body;
  if (!userId || !authToken) return res.status(400).json({ error: 'Auth required' });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Need service role to delete user entirely
  );

  try {
    // With service_role and ON DELETE CASCADE on the schema, deleting the user from auth.users
    // will delete all their data in capturing tables automatically if foreign keys are set up.
    // Ensure we delete from auth schema
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) throw error;

    res.json({ success: true });

  } catch (err: any) {
    console.error('Delete user failed:', err);
    res.status(500).json({ error: 'Deletion failed' });
  }
}
