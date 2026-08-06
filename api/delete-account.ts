import { createClient } from '@supabase/supabase-js';
import { verifyUserToken } from './_auth.js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import { enforceRateLimit, rateLimitExceeded } from './_rateLimit.js';

/**
 * The one endpoint here that destroys data, and the only one whose mistakes
 * cannot be undone.
 *
 * It used to hand-roll the token check that api/_auth.js already owns - the same
 * three steps, written out again, and therefore a second place to keep correct.
 * It now shares the helper, which also means it inherits the mandatory
 * token-to-account binding rather than repeating a version of it.
 */

interface ApiRequest {
  method?: string;
  body?: {
    userId?: unknown;
    authToken?: unknown;
  };
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId: claimedUserId, authToken } = req.body || {};
  if (!claimedUserId || !authToken) return res.status(400).json({ error: 'Auth required' });
  if (typeof claimedUserId !== 'string' || typeof authToken !== 'string') {
    return res.status(400).json({ error: 'Invalid auth payload' });
  }

  // Deleting an account is a once-ever action, so anything past the first
  // attempt or two in an hour is a retry loop or somebody probing with stolen
  // tokens. Applied before the token is verified, because verification is
  // itself a call to Supabase.
  const rateLimit = enforceRateLimit(req, 'delete-account', claimedUserId, 3, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimitExceeded(res, rateLimit, 'Too many deletion attempts. Please try again later.');
  }

  const user = await verifyUserToken(authToken, claimedUserId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(
    getSupabaseUrl(),
    getSupabaseServiceRoleKey() // Need service role to delete user entirely
  );

  try {
    // With service_role and ON DELETE CASCADE on the schema, deleting the user from auth.users
    // will delete all their data in capturing tables automatically if foreign keys are set up.
    // The id comes off the verified user rather than the request body: this call
    // is irreversible and runs with a key that has no RLS beneath it.
    const { error } = await supabase.auth.admin.deleteUser(user.id);

    if (error) throw error;

    res.json({ success: true });

  } catch (err) {
    console.error('Delete user failed:', err);
    res.status(500).json({ error: 'Deletion failed' });
  }
}
