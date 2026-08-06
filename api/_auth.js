import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from './_env.js';

export function getBearerToken(headers) {
  const raw = headers?.authorization ?? headers?.Authorization;
  if (typeof raw !== 'string') return '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

/**
 * Verifies a caller's token and binds it to the account they claim to be.
 *
 * The binding is mandatory, not opportunistic. This used to skip the comparison
 * whenever `expectedUserId` was not a string - so a request that simply omitted
 * `userId`, or sent it as a number or an object, was verified against nothing
 * and came back authorised. Every caller then went on to use that same unbound
 * value in a service-role query. Nothing exploitable was reachable through it
 * today, but "the check is skipped when the attacker controls the shape of the
 * input" is not a property to leave in an auth helper.
 *
 * Callers that genuinely only want "who is this token" pass
 * `{ requireUserId: false }` and read the id off the returned user.
 */
export async function verifyUserToken(authToken, expectedUserId, { requireUserId = true } = {}) {
  if (typeof authToken !== 'string' || !authToken.trim()) return null;
  if (requireUserId && (typeof expectedUserId !== 'string' || !expectedUserId.trim())) return null;

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
