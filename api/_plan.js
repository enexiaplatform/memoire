import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from './_env.js';

/**
 * Server-side mirror of src/utils/entitlement.ts. Keep the two in step.
 *
 * Read this before trusting it: **no endpoint calls this file yet.** It is the
 * shape the server gate will take, not a gate that is currently closed. The
 * previous version of this module mirrored a free tier with capture and record
 * ceilings that nothing enforced either, which is how a limit nobody applied
 * ended up quoted on the pricing page - so the status is stated here rather
 * than implied by the file existing.
 *
 * The real boundary is RLS. Almost every write in this product goes from the
 * browser straight to PostgREST, not through `api/`, so a check here can only
 * cover the handful of endpoints that do server work. Until there are policies
 * that know about trial expiry, the trial is a product gate, not a paywall.
 */

export const TRIAL_DAYS = 7;

/** Must equal TRIAL_MODEL_START in src/utils/entitlement.ts. */
export const TRIAL_MODEL_START = '2026-08-10T00:00:00.000Z';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAID_TIERS = new Set(['personal', 'team']);

/**
 * Reads the user's subscription tier and account age using the caller's own
 * token (RLS applies), and derives the trial window from them.
 *
 * Fails closed on tier and open on dates: an unreadable profile is treated as
 * unsubscribed, but an unparseable `created_at` starts a fresh window rather
 * than locking somebody out over a malformed timestamp.
 */
export async function getPlanContext(authToken, userId) {
  const client = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: `Bearer ${authToken}` } } },
  );

  const { data: profile } = await client
    .from('user_profiles')
    .select('subscription_tier, created_at')
    .eq('id', userId)
    .single();

  const tier = PAID_TIERS.has(profile?.subscription_tier) ? profile.subscription_tier : 'free';
  if (tier !== 'free') {
    return { tier, state: 'paid', daysLeft: 0, trialEndsAt: null, writeAllowed: true, searchAllowed: true };
  }

  const modelStart = Date.parse(TRIAL_MODEL_START);
  const created = profile?.created_at ? Date.parse(profile.created_at) : Number.NaN;
  const start = Number.isFinite(created) ? Math.max(created, modelStart) : modelStart;
  const endsAt = start + TRIAL_DAYS * DAY_MS;
  const remainingMs = endsAt - Date.now();

  if (remainingMs <= 0) {
    return {
      tier,
      state: 'expired',
      daysLeft: 0,
      trialEndsAt: new Date(endsAt).toISOString(),
      writeAllowed: false,
      searchAllowed: false,
    };
  }

  return {
    tier,
    state: 'trial',
    daysLeft: Math.ceil(remainingMs / DAY_MS),
    trialEndsAt: new Date(endsAt).toISOString(),
    writeAllowed: true,
    searchAllowed: true,
  };
}

export function planLimitExceeded(res, message) {
  return res.status(403).json({ error: message, code: 'plan_limit' });
}
