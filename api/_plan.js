import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from './_env.js';

// Server-side mirror of src/hooks/usePlanLimits.ts PLAN_LIMITS.
// Keep these values in sync with the client.
export const FREE_CAPTURES_PER_MONTH = 30;

const PAID_TIERS = new Set(['personal', 'team']);

/**
 * Reads the user's subscription tier and current-month capture usage
 * using the caller's own token (RLS applies).
 * Fails closed: if the profile cannot be read, the user is treated as free.
 */
export async function getPlanContext(authToken, userId) {
  const client = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: `Bearer ${authToken}` } } },
  );

  const { data: profile } = await client
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();

  const tier = PAID_TIERS.has(profile?.subscription_tier) ? profile.subscription_tier : 'free';
  if (tier !== 'free') {
    return { tier, capturesThisMonth: 0, aiSearchAllowed: true, captureAllowed: true };
  }

  const monthStr = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const { data: usage } = await client
    .from('usage_monthly')
    .select('capture_count')
    .eq('user_id', userId)
    .eq('month', monthStr)
    .single();

  const capturesThisMonth = usage?.capture_count || 0;
  return {
    tier,
    capturesThisMonth,
    aiSearchAllowed: false,
    captureAllowed: capturesThisMonth < FREE_CAPTURES_PER_MONTH,
  };
}

export function planLimitExceeded(res, message) {
  return res.status(403).json({ error: message, code: 'plan_limit' });
}
