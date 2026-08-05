import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  BASE_CURRENCY,
  convertMoney,
  formatCompactCurrencyAmount,
  formatCurrencyAmount,
  formatMoneyWithBase,
  sumMoney,
} from '../src/utils/money.ts';

// The first real user reported "200.000 SGD · 4.000.000.000 SGD (Base: SGD)":
// convertMoney defaulted to the VND rate anchor while the formatters labelled
// the result with the reporting currency. The number was VND; the label was not.
// In these scripts there is no localStorage, so the reporting currency is the
// default (VND) - the assertions below pin the mechanism, not one user's setting.

// 1. Conversion defaults to the reporting currency, never a mismatched anchor.
{
  // Reporting currency here is the default (VND), so SGD converts up into VND.
  assert.equal(convertMoney(200_000, 'SGD'), 4_000_000_000, '200k SGD is 4bn VND at the pinned rate');
  // ...and the same value asked for explicitly in SGD stays 200k - the identity
  // that was broken when the default target and the label disagreed.
  assert.equal(convertMoney(200_000, 'SGD', 'SGD'), 200_000);
  assert.equal(convertMoney(1, 'VND', 'VND'), 1);
}

// 2. An unsupported currency is excluded, not silently treated as the anchor.
// ('XYZ' stands in for any code outside SUPPORTED_CURRENCIES.)
assert.equal(convertMoney(100, 'XYZ'), null);
assert.equal(sumMoney([{ amount: 100, currency: 'XYZ' }, { amount: 5, currency: 'VND' }]), 5);

// 3. Money formats in English, whatever the machine locale. The browser locale
// rendered Vietnamese units ("Tr", "N") inside English copy.
{
  const compact = formatCompactCurrencyAmount(4_000_000_000, 'VND');
  assert.ok(/^4B VND$/.test(compact), `compact must use English units, got: ${compact}`);
  assert.equal(/Tr|N\b/.test(compact), false, 'Vietnamese compact units must not appear');

  const full = formatCurrencyAmount(200_000, 'SGD');
  assert.equal(full, '200,000 SGD', 'grouping must be English (comma), not locale-dependent');
}

// 4. formatMoneyWithBase never prints a converted figure under a wrong label.
{
  // Source == reporting: no echo of the same number under a "base" label.
  const same = formatMoneyWithBase(650_000_000, 'VND');
  assert.equal(same, '650,000,000 VND', 'same-currency money must not repeat itself');
  assert.equal(same.includes('Base:'), false);

  // Source != reporting: the converted figure carries the currency it is in.
  const converted = formatMoneyWithBase(200_000, 'SGD');
  assert.ok(converted.startsWith('200,000 SGD · '), `must lead with the deal's own currency, got: ${converted}`);
  assert.ok(converted.includes('4,000,000,000 VND'), `converted figure must be VND-labelled, got: ${converted}`);
  assert.equal(/4,000,000,000 SGD/.test(converted), false, 'the reported bug: a VND figure labelled SGD');

  // Unsupported currency: honest, not a fabricated conversion.
  assert.equal(formatMoneyWithBase(100, 'XYZ'), '100 XYZ · Needs confirmation');
}

// 5. BASE_CURRENCY stays the rate anchor only; the module says so.
{
  assert.equal(BASE_CURRENCY, 'VND');
  const money = readFileSync('src/utils/money.ts', 'utf8');
  assert.ok(/exchange-rate anchor/i.test(money), 'BASE_CURRENCY must be documented as the rate anchor, not the display basis');
  assert.equal(money.includes('new Intl.NumberFormat(undefined'), false, 'money must not format with the machine locale');
  assert.ok(money.includes("const MONEY_LOCALE = 'en'"), 'the money locale must be pinned');
}

// 6. The four surfaces share one money formatter - the duplication is how the
// mislabel reached Today, nudges, Pipeline Defense, and retros at once.
for (const [file, label] of [
  ['src/utils/todayCommandCenter.ts', 'Today'],
  ['src/utils/pipelineDefenseCenter.ts', 'Pipeline Defense'],
  ['src/utils/proactiveNudges.ts', 'nudges'],
  ['src/utils/personalSalesLearning.ts', 'outcome retros'],
]) {
  const source = readFileSync(file, 'utf8');
  assert.ok(source.includes('formatMoneyWithBase'), `${label} must use the shared money formatter`);
  assert.equal(/formatBaseCurrencyAmount\(convert/.test(source), false, `${label} must not hand-roll the item · base concatenation`);
}

// 7. Settings is now the only place the reporting currency is chosen. Quick
// Setup used to offer a second, staler copy of the same question; it was one of
// six competing onboarding mechanisms and is gone.
{
  const settings = readFileSync('src/features/settings/SettingsPage.tsx', 'utf8');
  assert.ok(
    settings.includes('getReportingCurrency()') && settings.includes('saveReportingCurrencyPreference('),
    'Settings must own the reporting-currency choice',
  );
  assert.equal(
    existsSync('src/features/onboarding/QuickStartSetupPage.tsx'),
    false,
    'a second place to set reporting currency is back',
  );
}

// 8. The choice survives the browser it was made in, and never claims to have
// saved when it did not.
//
// It lived only in localStorage, and `setReportingCurrency` swallowed the
// QuotaExceededError a full workspace produces - so the select showed SGD, the
// next load showed VND, and nothing said why.
{
  const money = readFileSync('src/utils/money.ts', 'utf8');
  assert.ok(
    /export function setReportingCurrency\(currency: string\): boolean/.test(money),
    'the local write must report whether it landed',
  );
  assert.equal(
    /catch \{\s*\/\/ ignore storage failures/.test(money),
    false,
    'a refused preference write must never be swallowed',
  );

  const preferences = readFileSync('src/services/workspacePreferences.ts', 'utf8');
  assert.ok(preferences.includes("from(TABLE_NAME)"), 'the durable copy must live on the account row');
  assert.ok(
    preferences.includes('reporting_currency') && preferences.includes('opening_cash_balance'),
    'both reporting preferences must be persisted to the account',
  );
  assert.ok(
    preferences.includes('export async function hydrateWorkspacePreferences'),
    'the browser cache must be fillable from the account',
  );

  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  assert.ok(
    shell.includes('hydrateWorkspacePreferences'),
    'preferences must be hydrated before a page paints a money value',
  );

  const migration = readFileSync('supabase/migrations/20260805090000_workspace_reporting_preferences.sql', 'utf8');
  for (const column of ['reporting_currency', 'opening_cash_balance', 'daily_digest_enabled']) {
    assert.ok(
      new RegExp(`GRANT UPDATE \\([^)]*${column}`, 's').test(migration),
      `${column} must be client-writable, or the save fails silently on the grant`,
    );
  }
}

console.log('Currency and locale contract verified.');
