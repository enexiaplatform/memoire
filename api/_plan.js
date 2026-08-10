import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from './_env.js';

/**
 * Server-side mirror of src/utils/entitlement.ts. Keep the two in step.
 *
 * Read this before trusting it: **no endpoint calls this file yet.** It is the
 * shape the server gate will take, not a gate that is currently closed. An
 * earlier version of this module mirrored a free tier with capture and record
 * ceilings that nothing enforced either, which is how limits nobody applied
 * ended up quoted on the pricing page - so the status is stated here rather
 * than implied by the file existing.
 *
 * The real boundary is RLS. Almost every write in this product goes from the
 * browser straight to PostgREST, not through `api/`, so a check here can only
 * cover the handful of endpoints that do server work. Until there are policies
 * that read `subscription_status`, the trial is a product gate, not a paywall.
 */

/** Marketing copy quotes this. The Lemon Squeezy variant is configured to match. */
export const TRIAL_DAYS = 7;

/** Must equal LEGACY_ACCESS_BEFORE in src/utils/entitlement.ts. */
export const LEGACY_ACCESS_BEFORE = '2026-08-10T00:00:00.000Z';

const PAID_TIERS = new Set(['personal', 'team']);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reads the subscription the browser is working under, using the caller's own
 * token so RLS applies.
 *
 * Fails closed on tier and open on everything a bad value could break: an
 * unreadable profile is treated as unsubscribed, but a malformed trial date
 * still grants access rather than locking somebody out over a timestamp.
 */
export async function getPlanContext(authToken, userId, { checkoutOpen = false } = {}) {
  const client = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: `Bearer ${authToken}` } } },
  );

  const { data: profile } = await client
    .from('user_profiles')
    .select('subscription_tier, subscription_status, subscription_trial_ends_at, created_at')
    .eq('id', userId)
    .single();

  const open = (state, extra = {}) => ({
    state,
    tier: profile?.subscription_tier ?? 'free',
    daysLeft: 0,
    trialEndsAt: null,
    writeAllowed: true,
    searchAllowed: true,
    ...extra,
  });

  if (PAID_TIERS.has(profile?.subscription_tier)) {
    const endsAt = profile?.subscription_trial_ends_at ?? null;
    if (profile?.subscription_status === 'on_trial') {
      const remainingMs = endsAt ? Date.parse(endsAt) - Date.now() : Number.NaN;
      return open('trial', {
        daysLeft: Number.isFinite(remainingMs) ? Math.max(0, Math.ceil(remainingMs / DAY_MS)) : 0,
        trialEndsAt: endsAt,
      });
    }
    return open('paid', { trialEndsAt: endsAt });
  }

  const created = profile?.created_at ? Date.parse(profile.created_at) : Number.NaN;
  if (Number.isFinite(created) && created < Date.parse(LEGACY_ACCESS_BEFORE)) {
    return open('legacy');
  }

  // Nothing to buy means nothing to withhold.
  if (!checkoutOpen) return open('unbilled');

  return {
    state: 'needs_trial',
    tier: 'free',
    daysLeft: 0,
    trialEndsAt: null,
    writeAllowed: false,
    searchAllowed: false,
  };
}

export function planLimitExceeded(res, message) {
  return res.status(403).json({ error: message, code: 'plan_limit' });
}
