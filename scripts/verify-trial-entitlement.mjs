import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The trial is the only thing between a signed-in account and the whole
 * product, so its edges are exercised rather than asserted about.
 *
 * Two rules it must never break:
 *   1. Nobody loses access they already had.
 *   2. Nobody is locked out of a product they have no way to buy.
 *
 * This imports the shipped module rather than re-implementing it. Node strips
 * the types on the way in, so a change to the real rule is a change to what
 * runs here - a copy of the logic would drift and keep passing.
 */

const { TRIAL_DAYS, TRIAL_MODEL_START, resolveEntitlement, describeTrialRemaining } =
  await import('../src/utils/entitlement.ts');

const DAY_MS = 86_400_000;
const start = Date.parse(TRIAL_MODEL_START);
const day = (n) => new Date(start + n * DAY_MS);

assert.equal(TRIAL_DAYS, 7, 'trial length changed - the marketing pages say seven days');
assert.ok(Number.isFinite(start), 'TRIAL_MODEL_START must be a parseable instant');

const free = (createdAt) => ({ subscription_tier: 'free', created_at: createdAt });

// 1. A new account gets its full window, and the boundary falls where it should.
{
  const fresh = free(TRIAL_MODEL_START);
  assert.equal(resolveEntitlement(fresh, { now: day(0), checkoutOpen: true }).state, 'trial');
  assert.equal(resolveEntitlement(fresh, { now: day(6.9), checkoutOpen: true }).state, 'trial', 'day seven is still trial');
  assert.equal(resolveEntitlement(fresh, { now: day(7.1), checkoutOpen: true }).state, 'expired');
  assert.equal(resolveEntitlement(fresh, { now: day(0), checkoutOpen: true }).daysLeft, 7);
  assert.equal(resolveEntitlement(fresh, { now: day(6.5), checkoutOpen: true }).daysLeft, 1, 'the last part-day reads as one, never zero');
}

// 2. THE REGRESSION THIS EXISTS FOR. Accounts that predate the trial must not
//    open already expired - counting from created_at alone would have shut out
//    every existing user the moment this deployed. These two timestamps are the
//    real ones from the two free accounts in production when it shipped.
for (const createdAt of ['2026-07-11T08:58:13.112Z', '2026-07-31T09:10:29.895Z']) {
  const existing = free(createdAt);
  assert.equal(
    resolveEntitlement(existing, { now: day(0), checkoutOpen: true }).state,
    'trial',
    `an account created ${createdAt} must still get a full window`,
  );
  assert.equal(resolveEntitlement(existing, { now: day(6.9), checkoutOpen: true }).state, 'trial');
  assert.equal(resolveEntitlement(existing, { now: day(7.1), checkoutOpen: true }).state, 'expired');
}

// 3. THE OTHER ONE. An ended trial must not lock anybody out while checkout is
//    shut, because there would be no way to buy their way back in.
{
  const ended = free(TRIAL_MODEL_START);
  const shut = resolveEntitlement(ended, { now: day(30), checkoutOpen: false });
  assert.equal(shut.state, 'trial', 'trial must stay open while checkout cannot take money');
  assert.equal(shut.canWrite, true);
  assert.equal(shut.canSearch, true);

  const open = resolveEntitlement(ended, { now: day(30), checkoutOpen: true });
  assert.equal(open.state, 'expired');
  assert.equal(open.canWrite, false);
  assert.equal(open.canSearch, false);
}

// 4. `checkoutOpen` defaults to closed, so a caller that forgets it fails safe
//    towards the operator rather than towards the paywall.
{
  const ended = free(TRIAL_MODEL_START);
  assert.equal(resolveEntitlement(ended, { now: day(30) }).state, 'trial', 'omitting checkoutOpen must not expire anyone');
  assert.equal(resolveEntitlement(ended).state, 'trial', 'the no-options call must not expire anyone either');
}

// 5. Paid tiers ignore the window entirely, however old the account is.
for (const tier of ['personal', 'team']) {
  const paid = { subscription_tier: tier, created_at: '2026-04-18T16:44:16.750Z' };
  const result = resolveEntitlement(paid, { now: day(999), checkoutOpen: true });
  assert.equal(result.state, 'paid', `${tier} must never expire`);
  assert.equal(result.canWrite, true);
  assert.equal(result.canSearch, true);
}

// 6. No profile - demo, local-only, or still loading - is permissive. A
//    workspace that locks itself during its own loading order is a bug.
{
  const none = resolveEntitlement(null, { now: day(999), checkoutOpen: true });
  assert.equal(none.state, 'unbilled');
  assert.equal(none.canWrite, true);
  assert.equal(none.canSearch, true);
}

// 7. Export survives every state. An expired trial holds nobody's data hostage.
{
  const states = [
    resolveEntitlement(null, { now: day(0) }),
    resolveEntitlement(free(TRIAL_MODEL_START), { now: day(30), checkoutOpen: true }),
    resolveEntitlement(free(TRIAL_MODEL_START), { now: day(1), checkoutOpen: true }),
    resolveEntitlement({ subscription_tier: 'personal', created_at: TRIAL_MODEL_START }, { now: day(30), checkoutOpen: true }),
  ];
  for (const state of states) assert.equal(state.canExport, true, 'export must survive every entitlement state');
}

// 8. A malformed created_at starts a fresh window rather than locking someone
//    out over a bad timestamp.
for (const bad of ['not-a-date', '', null, undefined]) {
  assert.equal(resolveEntitlement(free(bad), { now: day(1), checkoutOpen: true }).state, 'trial', `created_at ${String(bad)} must not expire an account`);
}

// 9. The banner copy never prints "0 days left".
{
  assert.equal(describeTrialRemaining(resolveEntitlement(free(TRIAL_MODEL_START), { now: day(6.5), checkoutOpen: true })), 'Last day');
  assert.equal(describeTrialRemaining(resolveEntitlement(free(TRIAL_MODEL_START), { now: day(30), checkoutOpen: false })), 'Last day', 'the held-open state must not read as zero');
  assert.equal(describeTrialRemaining(resolveEntitlement(free(TRIAL_MODEL_START), { now: day(1), checkoutOpen: true })), '6 days left');
  assert.equal(describeTrialRemaining(resolveEntitlement({ subscription_tier: 'personal', created_at: TRIAL_MODEL_START })), '', 'paid accounts print nothing');
}

// 10. The server mirror must agree on both constants and keep both safeguards.
{
  const server = readFileSync('api/_plan.js', 'utf8');
  assert.ok(server.includes(`export const TRIAL_DAYS = ${TRIAL_DAYS};`), 'api/_plan.js trial length drifted from the client rule');
  assert.ok(server.includes(`'${TRIAL_MODEL_START}'`), 'api/_plan.js trial model start drifted from the client rule');
  assert.ok(/Math\.max\(created, modelStart\)/.test(server), 'api/_plan.js lost the retroactive-expiry floor');
}

// 11. The dead free tier must stay dead: it advertised limits nothing enforced.
assert.equal(
  existsSync('src/hooks/usePlanLimits.ts'),
  false,
  'usePlanLimits.ts is back - it declared capture and record limits that no code applied',
);

// 12. The gates are actually wired. A rule nothing consults is the exact
//     failure this whole module replaced.
{
  const capture = readFileSync('src/features/dailyCapture/DailyCapturePage.tsx', 'utf8');
  assert.ok(capture.includes('if (!entitlement.canWrite) {'), 'capture no longer checks canWrite before saving');

  const ask = readFileSync('src/features/v31/AskMemoirePage.tsx', 'utf8');
  assert.ok(ask.includes('if (!canSearch) {'), 'Search & Insights no longer checks canSearch before answering');

  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  assert.ok(shell.includes('<TrialStatusBanner />'), 'the workspace no longer tells anyone their trial is ending');
}

console.log('Trial entitlement contract verified (12 groups, against the shipped module).');
