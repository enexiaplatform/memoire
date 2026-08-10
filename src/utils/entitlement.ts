import type { UserProfile } from '../types';

/**
 * What an account is allowed to do, and for how much longer.
 *
 * This replaced a free tier that never existed. A `PLAN_LIMITS` table in
 * `src/hooks/usePlanLimits.ts` declared 30 captures a month and 50 records, the
 * billing tab quoted those numbers, and the landing page advertised them - but
 * the hook was imported by nothing, `api/_plan.js` was called by no endpoint,
 * and `usage_monthly` was never written to. Every signed-in account had
 * everything. A limit nobody enforces is a lie with a number in it, so the hook
 * is gone rather than repointed.
 *
 * So the trial is derived, not declared, and there is exactly one function that
 * decides. Two properties matter:
 *
 * 1. **No migration.** `user_profiles.created_at` already exists and is already
 *    readable by `authenticated`, so the trial window is arithmetic on a column
 *    the profile query already returns. Nothing is written when a trial starts
 *    or ends, which means there is no state to get out of sync and no backfill
 *    to run for accounts that existed before this shipped.
 * 2. **Nobody loses access retroactively.** Counting from `created_at` alone
 *    would have expired every existing account the moment this deployed - two
 *    of them signed up weeks earlier and would have found the door locked with
 *    no warning and no chance to subscribe. The window therefore starts at the
 *    *later* of the account's creation and the day the trial model shipped.
 *
 * The honest limit of this module: it decides what the interface offers, not
 * what the database permits. Direct writes still go to Supabase under RLS,
 * which does not know about trials, so this is a product gate rather than a
 * security boundary. Closing that gap means RLS policies, and until they exist
 * nothing here should be described as a paywall.
 */

export const TRIAL_DAYS = 7;

/**
 * The day the trial replaced the free tier.
 *
 * Accounts created before this get their full seven days starting here rather
 * than a window that closed before they were told it opened. Moving this date
 * forward would hand everybody a fresh trial, so it is a constant, not a knob.
 */
export const TRIAL_MODEL_START = '2026-08-10T00:00:00.000Z';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tiers that have been paid for. Mirrors PAID_TIERS in api/_plan.js. */
const PAID_TIERS = new Set(['personal', 'team']);

export type EntitlementState =
  /** Demo sandbox or local-only use: there is no account, so there is nothing to bill. */
  | 'unbilled'
  /** A live subscription, including one cancelled but not yet expired. */
  | 'paid'
  /** Inside the trial window. */
  | 'trial'
  /** The trial window has closed and no subscription replaced it. */
  | 'expired';

export type Entitlement = {
  state: EntitlementState;
  /** Whole days remaining, rounded up, so the last day reads "1 day left" not "0". */
  daysLeft: number;
  /** End of the trial window as an ISO instant. Null when no trial applies. */
  trialEndsAt: string | null;
  /** Capture, and anything that creates a record. */
  canWrite: boolean;
  /** Search & Insights. */
  canSearch: boolean;
  /**
   * Always true. An expired trial stops you adding to the workspace; it must
   * never stop you taking your own work out of it.
   */
  canExport: true;
};

function startOfTrial(createdAt: string | undefined | null): number {
  const modelStart = Date.parse(TRIAL_MODEL_START);
  const created = createdAt ? Date.parse(createdAt) : Number.NaN;
  // An unparseable created_at means we cannot prove the account is old, so it
  // is treated as new: a fresh window is the generous reading, and the
  // alternative is locking somebody out over a malformed timestamp.
  if (!Number.isFinite(created)) return modelStart;
  return Math.max(created, modelStart);
}

/**
 * Resolves what this account may do right now.
 *
 * `profile` is null while the profile is still loading, and for demo or
 * local-only use. All three are treated as `unbilled` - permissive - because
 * the alternative is a workspace that locks itself for a moment on every load.
 */
export function resolveEntitlement(
  profile: Pick<UserProfile, 'subscription_tier' | 'created_at'> | null,
  { now = new Date(), checkoutOpen = false }: { now?: Date; checkoutOpen?: boolean } = {},
): Entitlement {
  if (!profile) {
    return { state: 'unbilled', daysLeft: 0, trialEndsAt: null, canWrite: true, canSearch: true, canExport: true };
  }

  if (PAID_TIERS.has(profile.subscription_tier)) {
    return { state: 'paid', daysLeft: 0, trialEndsAt: null, canWrite: true, canSearch: true, canExport: true };
  }

  const endsAt = startOfTrial(profile.created_at) + TRIAL_DAYS * DAY_MS;
  const remainingMs = endsAt - now.getTime();
  const trialEndsAt = new Date(endsAt).toISOString();

  if (remainingMs <= 0) {
    // The one case where an ended trial does not close anything: there is no
    // way to buy yet. Taking the workspace away from somebody who cannot pay
    // for its return is an outage we inflicted, not a limit they hit.
    if (!checkoutOpen) {
      return { state: 'trial', daysLeft: 0, trialEndsAt, canWrite: true, canSearch: true, canExport: true };
    }
    return { state: 'expired', daysLeft: 0, trialEndsAt, canWrite: false, canSearch: false, canExport: true };
  }

  return {
    state: 'trial',
    daysLeft: Math.ceil(remainingMs / DAY_MS),
    trialEndsAt,
    canWrite: true,
    canSearch: true,
    canExport: true,
  };
}

/** "3 days left", "Last day" - what a banner can print directly. */
export function describeTrialRemaining(entitlement: Entitlement): string {
  if (entitlement.state !== 'trial') return '';
  // daysLeft is 0 only in the held-open case above, where the window has passed
  // but checkout cannot take the money. "Last day" is the honest thing to show:
  // it is true, and it does not promise days that are not coming.
  if (entitlement.daysLeft <= 1) return 'Last day';
  return `${entitlement.daysLeft} days left`;
}
