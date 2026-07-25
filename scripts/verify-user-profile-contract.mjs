import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The operator's own name, and the boundary around the row it lives on.
//
// user_profiles carries the billing state on the same row as the display name.
// Before this contract, authenticated held a blanket UPDATE grant over that row,
// so a signed-in user could have written their own subscription_tier. Nothing
// was bypassed yet - no paywall is mounted - but the hole was invisible from the
// application code, which is exactly why it needs a check rather than a comment.

const migrations = readdirSync('supabase/migrations')
  .filter((file) => file.endsWith('.sql'))
  .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
  .join('\n');

// 1. Clients may write the display name and nothing else on that row.
{
  assert.match(
    migrations,
    /grant update \(display_name\) on table public\.user_profiles to authenticated/i,
    'authenticated must hold a column-level UPDATE grant on display_name',
  );
  assert.match(
    migrations,
    /revoke insert, update, delete[\s\S]{0,80}?on table public\.user_profiles from authenticated/i,
    'the blanket write grants on user_profiles must be revoked from authenticated',
  );
  assert.match(
    migrations,
    /revoke all on table public\.user_profiles from anon/i,
    'anon must hold nothing on user_profiles',
  );
}

// 2. The billing columns are never written from the browser. Only the Stripe
//    webhook and the billing endpoint touch them, under service_role.
{
  const clientSource = ['src/auth/AuthProvider.tsx', 'src/features/settings/ProfileTab.tsx']
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  for (const column of ['subscription_tier', 'subscription_status', 'stripe_customer_id']) {
    assert.equal(
      clientSource.includes(column),
      false,
      `${column} must never be written from the browser - it is billing state`,
    );
  }
}

// 3. A name is written to both places it is read from. Signup puts it in the
//    auth user's metadata; the app reads the profile row first. Writing one and
//    not the other is how a changed name silently reverts on reload.
{
  const provider = readFileSync('src/auth/AuthProvider.tsx', 'utf8');
  const updateBlock = provider.slice(
    provider.indexOf('updateDisplayName: async'),
    provider.indexOf('resendSignupConfirmation: async'),
  );
  assert.ok(updateBlock.length > 0, 'AuthProvider must expose updateDisplayName');
  assert.match(updateBlock, /from\('user_profiles'\)[\s\S]{0,120}update\(\{ display_name/, 'it must write the profile row');
  assert.match(updateBlock, /auth\.updateUser\(\{ data: \{ display_name/, 'it must write the auth metadata too');
}

// 4. The tab is reachable, and email/password stay in the auth flow where they
//    are verified rather than being edited as if they were profile fields.
{
  const settings = readFileSync('src/features/settings/SettingsPage.tsx', 'utf8');
  assert.match(settings, /<ProfileTab \/>/, 'Settings must render the profile tab');

  const tab = readFileSync('src/features/settings/ProfileTab.tsx', 'utf8');
  assert.equal(/type="password"/.test(tab), false, 'the profile tab must not edit passwords');
  assert.equal(/updateUser\(\{ email/.test(tab), false, 'the profile tab must not change the email address');
}

console.log('User profile contract verified.');
