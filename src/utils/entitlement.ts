import type { UserProfile } from '../types';

/**
 * What an account is allowed to do, and what it should be told about why.
 *
 * ## The model
 *
 * The trial is Lemon Squeezy's, not ours. The operator enters a card, Lemon
 * Squeezy holds the first payment for seven days and reports the subscription
 * as `on_trial` with a `trial_ends_at`, then charges and flips it to `active`.
 * Cancelling before that date charges nothing. This module reads the result; it
 * does not decide it.
 *
 * That is a deliberate move away from what came first here, which counted seven
 * days from `created_at` and asked for no card. Both are defensible products,
 * but only one of them converts on its own, and the founder chose that one.
 * What survived the change is the shape: one function decides, everything else
 * asks it.
 *
 * ## What it refuses to do
 *
 * 1. **Lock anyone out while checkout is shut.** No card can be taken with
 *    `BILLING_CHECKOUT_ENABLED` off, so gating an account then would be an
 *    outage we caused rather than a limit anybody hit. `checkoutOpen` defaults
 *    to false so a caller that forgets it fails towards the operator.
 * 2. **Cut off accounts that predate the change.** They signed up under a
 *    product that asked nothing of them; taking their workspace away without
 *    warning is not a pricing decision, it is a broken promise. See
 *    LEGACY_ACCESS_BEFORE - it is a knob, and it is the founder's to turn.
 * 3. **Stop anyone exporting.** A lapsed subscription stops you adding to the
 *    workspace. It must never stop you taking your own work out of it.
 *
 * ## The honest limit
 *
 * This decides what the interface offers, not what the database permits. Writes
 * go from the browser to PostgREST under RLS, which knows nothing about
 * subscriptions, so this is a product gate rather than a security boundary.
 * Closing that gap means RLS policies; until they exist, nothing here should be
 * described as a paywall.
 */

/** Marketing copy quotes this. Lemon Squeezy is configured to match it. */
export const TRIAL_DAYS = 7;

/**
 * The monthly price of the `personal` plan, in USD.
 *
 * The number itself is quoted as `$10` in prose on two marketing pages, which
 * is fine - prose is written for a reader. This constant exists because the
 * same number now also goes out as a machine-readable `Offer` in the landing
 * page's JSON-LD, and a structured price that disagrees with the visible price
 * is the one kind of mismatch Google penalises outright. One constant, and
 * `scripts/verify-seo-contract.mjs` checks the prose still agrees with it.
 */
export const PERSONAL_MONTHLY_PRICE_USD = 10;

/**
 * Accounts created before this keep full access without a subscription.
 *
 * They signed up when the product asked for no card and enforced no limits.
 * Gating them retroactively would be the first thing they ever heard from us
 * about money. Set this to null once they have been contacted and converted -
 * that is a commercial decision, not a code cleanup.
 */
export const LEGACY_ACCESS_BEFORE: string | null = '2026-08-10T00:00:00.000Z';

const PAID_TIERS = new Set(['personal', 'team']);
const DAY_MS = 24 * 60 * 60 * 1000;

export type EntitlementState =
  /** Demo sandbox, local-only use, or a profile still loading. Nothing to bill. */
  | 'unbilled'
  /** Signed up, no subscription, and checkout is open: needs to start a trial. */
  | 'needs_trial'
  /** Lemon Squeezy reports `on_trial`. Full access, and a card is on file. */
  | 'trial'
  /** A live or cancelled-but-not-yet-expired subscription. */
  | 'paid'
  /** Created before the trial model. Full access, by decision rather than payment. */
  | 'legacy';

export type Entitlement = {
  state: EntitlementState;
  /** Whole days until the card is charged. Zero unless `state` is 'trial'. */
  daysLeft: number;
  /** When the trial ends, straight from Lemon Squeezy. Null when there is no trial. */
  trialEndsAt: string | null;
  /** True while the subscription is cancelled but the paid period has not run out. */
  endingSoon: boolean;
  /** Capture, and anything that creates a record. */
  canWrite: boolean;
  /** Search & Insights. */
  canSearch: boolean;
  /** Always true. See the note above. */
  canExport: true;
};

const OPEN = (state: EntitlementState, extra: Partial<Entitlement> = {}): Entitlement => ({
  state,
  daysLeft: 0,
  trialEndsAt: null,
  endingSoon: false,
  canWrite: true,
  canSearch: true,
  canExport: true,
  ...extra,
});

type ProfileFacts = Pick<
  UserProfile,
  'subscription_tier' | 'subscription_status' | 'created_at'
> & { subscription_trial_ends_at?: string | null };

/**
 * Resolves what this account may do right now.
 *
 * `profile` is null while it is still loading, and for demo or local-only use.
 * All of those are permissive, because a workspace that locks itself during its
 * own loading order is a bug rather than a policy.
 */
export function resolveEntitlement(
  profile: ProfileFacts | null,
  { now = new Date(), checkoutOpen = false }: { now?: Date; checkoutOpen?: boolean } = {},
): Entitlement {
  if (!profile) return OPEN('unbilled');

  if (PAID_TIERS.has(profile.subscription_tier)) {
    const endsAt = profile.subscription_trial_ends_at ?? null;

    if (profile.subscription_status === 'on_trial') {
      const remainingMs = endsAt ? Date.parse(endsAt) - now.getTime() : Number.NaN;
      return OPEN('trial', {
        // A trial with no usable end date still has access; it just has nothing
        // to count down. Showing "NaN days" would be worse than showing none.
        daysLeft: Number.isFinite(remainingMs) ? Math.max(0, Math.ceil(remainingMs / DAY_MS)) : 0,
        trialEndsAt: endsAt,
      });
    }

    return OPEN('paid', {
      trialEndsAt: endsAt,
      endingSoon: profile.subscription_status === 'cancelled',
    });
  }

  // No subscription from here down.

  if (LEGACY_ACCESS_BEFORE && isBefore(profile.created_at, LEGACY_ACCESS_BEFORE)) {
    return OPEN('legacy');
  }

  // Nothing to buy means nothing to withhold.
  if (!checkoutOpen) return OPEN('unbilled');

  return {
    state: 'needs_trial',
    daysLeft: 0,
    trialEndsAt: null,
    endingSoon: false,
    canWrite: false,
    canSearch: false,
    canExport: true,
  };
}

/**
 * True only when `value` is a date we can read and it precedes `cutoff`.
 *
 * An unreadable `created_at` is not treated as legacy: the generous reading
 * there would hand free access to anyone whose timestamp failed to parse, and
 * the ungenerous one only asks them to start a trial they can start.
 */
function isBefore(value: string | undefined | null, cutoff: string): boolean {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed < Date.parse(cutoff);
}

/** "3 days left", "Last day" - what a banner can print directly. */
export function describeTrialRemaining(entitlement: Entitlement): string {
  if (entitlement.state !== 'trial') return '';
  if (entitlement.daysLeft <= 1) return 'Last day';
  return `${entitlement.daysLeft} days left`;
}
