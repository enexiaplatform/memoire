import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from './_env.js';

export function getBearerToken(headers) {
  const raw = headers?.authorization ?? headers?.Authorization;
  if (typeof raw !== 'string') return '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function verifyUserToken(authToken, expectedUserId) {
  if (typeof authToken !== 'string' || !authToken.trim()) return null;

  const client = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: `Bearer ${authToken}` } } },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  if (typeof expectedUserId === 'string' && data.user.id !== expectedUserId) return null;
  return data.user;
}
