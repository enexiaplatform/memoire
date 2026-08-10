import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The trial is the only thing between a signed-in account and the whole
 * product, so its edges are exercised rather than asserted about.
 *
 * Three rules it must never break:
 *   1. Nobody is locked out of a product they have no way to buy.
 *   2. Nobody who signed up before Memoire charged is cut off without a word.
 *   3. Nobody is ever stopped from exporting their own work.
 *
 * This imports the shipped modules rather than re-implementing them. Node
 * strips the types on the way in, so a change to the real rule is a change to
 * what runs here - a copy of the logic would drift and keep passing.
 */

const { TRIAL_DAYS, LEGACY_ACCESS_BEFORE, resolveEntitlement, describeTrialRemaining } =
  await import('../src/utils/entitlement.ts');
const { subscriptionStateFor } = await import('../api/_lemonsqueezy.js');

const DAY_MS = 86_400_000;
const now = new Date('2026-09-01T00:00:00.000Z');
const inDays = (n) => new Date(now.getTime() + n * DAY_MS).toISOString();

assert.equal(TRIAL_DAYS, 7, 'trial length changed - the marketing pages and the Lemon Squeezy variant say seven days');

const account = (over = {}) => ({
  subscription_tier: 'free',
  subscription_status: 'free',
  created_at: '2026-08-20T00:00:00.000Z',
  subscription_trial_ends_at: null,
  ...over,
});

// ── The webhook's half: what Lemon Squeezy statuses become ──────────────────

// 1. on_trial must stay distinct from active. Folding them together is what
//    made it impossible to tell somebody paying from somebody about to be
//    charged, and it is the whole reason this column exists.
{
  const trial = subscriptionStateFor({ status: 'on_trial', variant_id: '1', trial_ends_at: inDays(5) });
  assert.equal(trial.subscription_status, 'on_trial');
  assert.equal(trial.subscription_tier, 'personal');
  assert.equal(trial.subscription_trial_ends_at, inDays(5), 'the trial end date must survive the webhook');

  const active = subscriptionStateFor({ status: 'active', variant_id: '1', trial_ends_at: inDays(5) });
  assert.equal(active.subscription_status, 'active');
  assert.equal(active.subscription_trial_ends_at, null, 'an active subscription is no longer on trial');
}

// 2. past_due keeps access - Lemon Squeezy is still retrying the card, and
//    locking the operator out mid-retry punishes them for a bank's timing.
{
  const pastDue = subscriptionStateFor({ status: 'past_due', variant_id: '1' });
  assert.equal(pastDue.subscription_tier, 'personal', 'past_due must not drop the tier');
}

// 3. cancelled keeps its tier until Lemon Squeezy sends the expiry, and carries
//    the date access actually stops.
{
  const cancelled = subscriptionStateFor({ status: 'cancelled', variant_id: '1', trial_ends_at: inDays(3) });
  assert.equal(cancelled.subscription_status, 'cancelled');
  assert.equal(cancelled.subscription_tier, 'personal');
  assert.equal(cancelled.subscription_trial_ends_at, inDays(3));

  const expired = subscriptionStateFor({ status: 'expired', variant_id: '1' });
  assert.deepEqual(expired, { subscription_status: 'free', subscription_tier: 'free', subscription_trial_ends_at: null });
}

// ── The client's half: what those columns permit ────────────────────────────

// 4. A trial has full access and counts down from Lemon Squeezy's date.
{
  const trial = resolveEntitlement(
    account({ subscription_tier: 'personal', subscription_status: 'on_trial', subscription_trial_ends_at: inDays(3) }),
    { now, checkoutOpen: true },
  );
  assert.equal(trial.state, 'trial');
  assert.equal(trial.canWrite, true);
  assert.equal(trial.canSearch, true);
  assert.equal(trial.daysLeft, 3);
  assert.equal(describeTrialRemaining(trial), '3 days left');
}

// 5. A trial with an unusable end date still works. "NaN days left" would be
//    worse than no countdown, and losing access over a bad string is worse still.
for (const bad of [null, undefined, 'not-a-date']) {
  const odd = resolveEntitlement(
    account({ subscription_tier: 'personal', subscription_status: 'on_trial', subscription_trial_ends_at: bad }),
    { now, checkoutOpen: true },
  );
  assert.equal(odd.state, 'trial', `trial_ends_at ${String(bad)} must not remove access`);
  assert.equal(odd.canWrite, true);
  assert.equal(Number.isFinite(odd.daysLeft), true, 'daysLeft must always be a number');
}

// 6. RULE ONE. Nobody is gated while checkout is shut, because no card can be
//    taken then - it would be an outage we caused, not a limit anybody hit.
{
  const stranded = account({ created_at: '2026-08-20T00:00:00.000Z' });
  const shut = resolveEntitlement(stranded, { now, checkoutOpen: false });
  assert.equal(shut.canWrite, true, 'a closed checkout must never gate a workspace');
  assert.equal(shut.canSearch, true);

  const open = resolveEntitlement(stranded, { now, checkoutOpen: true });
  assert.equal(open.state, 'needs_trial');
  assert.equal(open.canWrite, false);
  assert.equal(open.canSearch, false);
}

// 7. checkoutOpen defaults to closed, so a caller that forgets it fails towards
//    the operator rather than towards the paywall.
{
  assert.equal(resolveEntitlement(account(), { now }).canWrite, true, 'omitting checkoutOpen must not gate anyone');
  assert.equal(resolveEntitlement(account()).canWrite, true, 'the no-options call must not gate anyone either');
}

// 8. RULE TWO. Accounts from before Memoire charged keep access. These are the
//    real creation timestamps of the two free accounts in production.
{
  assert.ok(LEGACY_ACCESS_BEFORE, 'legacy access was removed - existing accounts would be cut off without a word');
  for (const createdAt of ['2026-07-11T08:58:13.112Z', '2026-07-31T09:10:29.895Z']) {
    const legacy = resolveEntitlement(account({ created_at: createdAt }), { now, checkoutOpen: true });
    assert.equal(legacy.state, 'legacy', `the account created ${createdAt} must keep access`);
    assert.equal(legacy.canWrite, true);
    assert.equal(legacy.canSearch, true);
  }
  // Someone who signed up after the change does not get it.
  const newcomer = resolveEntitlement(account({ created_at: '2026-08-20T00:00:00.000Z' }), { now, checkoutOpen: true });
  assert.equal(newcomer.state, 'needs_trial', 'legacy access must not leak to accounts created after the change');
}

// 9. An unreadable created_at is not legacy - the generous reading there would
//    hand free access to any malformed timestamp.
{
  const broken = resolveEntitlement(account({ created_at: 'not-a-date' }), { now, checkoutOpen: true });
  assert.equal(broken.state, 'needs_trial');
}

// 10. Paid and cancelled-but-not-expired both keep working.
{
  const paid = resolveEntitlement(
    account({ subscription_tier: 'personal', subscription_status: 'active' }),
    { now, checkoutOpen: true },
  );
  assert.equal(paid.state, 'paid');
  assert.equal(paid.canWrite, true);
  assert.equal(paid.endingSoon, false);

  const cancelled = resolveEntitlement(
    account({ subscription_tier: 'personal', subscription_status: 'cancelled' }),
    { now, checkoutOpen: true },
  );
  assert.equal(cancelled.state, 'paid', 'cancelling is not losing access today');
  assert.equal(cancelled.canWrite, true);
  assert.equal(cancelled.endingSoon, true, 'the screen has to be able to say it is ending');
}

// 11. No profile - demo, local-only, or still loading - is permissive. A
//     workspace that locks itself during its own loading order is a bug.
{
  const none = resolveEntitlement(null, { now, checkoutOpen: true });
  assert.equal(none.state, 'unbilled');
  assert.equal(none.canWrite, true);
  assert.equal(none.canSearch, true);
}

// 12. RULE THREE. Export survives every state there is.
{
  const everyState = [
    resolveEntitlement(null, { now }),
    resolveEntitlement(account(), { now, checkoutOpen: true }),
    resolveEntitlement(account({ created_at: '2026-07-11T08:58:13.112Z' }), { now, checkoutOpen: true }),
    resolveEntitlement(account({ subscription_tier: 'personal', subscription_status: 'on_trial', subscription_trial_ends_at: inDays(2) }), { now, checkoutOpen: true }),
    resolveEntitlement(account({ subscription_tier: 'personal', subscription_status: 'active' }), { now, checkoutOpen: true }),
  ];
  assert.equal(new Set(everyState.map((s) => s.state)).size, 5, 'the states under test must all be distinct');
  for (const state of everyState) {
    assert.equal(state.canExport, true, `export must survive ${state.state}`);
  }
}

// 13. The banner never prints "0 days left", and says nothing when there is no trial.
{
  const lastDay = resolveEntitlement(
    account({ subscription_tier: 'personal', subscription_status: 'on_trial', subscription_trial_ends_at: inDays(0.5) }),
    { now, checkoutOpen: true },
  );
  assert.equal(describeTrialRemaining(lastDay), 'Last day');
  assert.equal(describeTrialRemaining(resolveEntitlement(account({ subscription_tier: 'personal', subscription_status: 'active' }), { now })), '');
  assert.equal(describeTrialRemaining(resolveEntitlement(account(), { now, checkoutOpen: true })), '');
}

// 14. The server mirror agrees on the constants that decide who gets in.
{
  const server = readFileSync('api/_plan.js', 'utf8');
  assert.ok(server.includes(`export const TRIAL_DAYS = ${TRIAL_DAYS};`), 'api/_plan.js trial length drifted from the client rule');
  assert.ok(server.includes(`'${LEGACY_ACCESS_BEFORE}'`), 'api/_plan.js legacy cutoff drifted from the client rule');
  assert.ok(/if \(!checkoutOpen\) return open\('unbilled'\);/.test(server), 'api/_plan.js lost the closed-checkout safeguard');
}

// 15. The dead free tier stays dead: it advertised limits nothing enforced.
assert.equal(
  existsSync('src/hooks/usePlanLimits.ts'),
  false,
  'usePlanLimits.ts is back - it declared capture and record limits that no code applied',
);

// 16. The gates are actually wired. A rule nothing consults is the exact
//     failure this whole module replaced.
{
  const capture = readFileSync('src/features/dailyCapture/DailyCapturePage.tsx', 'utf8');
  assert.ok(capture.includes('if (!entitlement.canWrite) {'), 'capture no longer checks canWrite before saving');

  const ask = readFileSync('src/features/v31/AskMemoirePage.tsx', 'utf8');
  assert.ok(ask.includes('if (!canSearch) {'), 'Search & Insights no longer checks canSearch before answering');

  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  assert.ok(shell.includes('<TrialStatusBanner />'), 'the workspace no longer tells anyone what their subscription is doing');
}

// 17. The trial column has to survive the round trip: written by the webhook,
//     readable by the browser. user_profiles grants are column-scoped, so a
//     migration that adds the column without the grant leaves it invisible.
{
  const migration = readFileSync('supabase/migrations/20260810120000_subscription_trial_ends_at.sql', 'utf8');
  assert.ok(/add column if not exists subscription_trial_ends_at/.test(migration), 'the trial column migration lost its column');
  assert.ok(
    /grant select \(subscription_trial_ends_at\) on public\.user_profiles to authenticated/.test(migration),
    'user_profiles grants are column-scoped - without this grant the client cannot read the trial end date',
  );
  assert.equal(
    /grant update \(subscription_trial_ends_at\)/.test(migration),
    false,
    'the browser must never be able to move its own trial end date',
  );
}

console.log('Trial entitlement contract verified (17 groups, against the shipped modules).');
