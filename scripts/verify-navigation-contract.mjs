import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Memoire is a Personal Commercial Control Tower with exactly six primary
// destinations. This contract is the guard against the failure mode that
// produced the previous surface sprawl: a page reappears in the rail, the
// product stops being describable in one sentence, and nobody notices because
// each individual addition looked reasonable.

const registry = readFileSync('src/config/featureRegistry.ts', 'utf8');
const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
const topNav = readFileSync('src/components/layout/TopNav.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');

// 1. Exactly six primary destinations, in the approved order.
{
  const block = registry.match(/export const PRIMARY_DESTINATION_IDS = \[([\s\S]*?)\] as const;/);
  assert.ok(block, 'featureRegistry must declare PRIMARY_DESTINATION_IDS');
  const ids = [...block[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
  assert.deepEqual(
    ids,
    ['today', 'accounts', 'opportunities', 'money', 'timeline', 'review'],
    'the six primary destinations, in order, are the product',
  );
}

// 2. The rail renders from the registry, not from a hand-maintained list.
{
  assert.ok(
    sidebar.includes("from '../../config/featureRegistry'"),
    'Sidebar must render navigation from the feature registry',
  );
  assert.ok(sidebar.includes('primaryNavigation'), 'Sidebar must render primaryNavigation');
  assert.ok(sidebar.includes('globalActions'), 'Sidebar must render globalActions');

  // No hard-coded nav target may sneak in beside the registry - that is exactly
  // how a seventh destination used to appear without anyone deciding to add it.
  const hardCoded = [
    ...[...sidebar.matchAll(/to="(\/app\/[a-z-]+)"/g)].map((match) => match[1]),
    ...[...sidebar.matchAll(/to: '(\/app\/[a-z-]+)'/g)].map((match) => match[1]),
  ];
  assert.deepEqual(hardCoded, [], `Sidebar hard-codes nav routes outside the registry: ${hardCoded.join(', ')}`);
}

// 3. Retired destinations are gone from the rail.
for (const retired of [
  'Dashboard',
  'Pipeline Defense',
  'Playbook',
  'Assets',
  'Stakeholders',
  'Objections',
  'Quotes',
  'Operating System',
  'Ask Memoire',
  'Business Review',
  'Plan',
  'Activity',
]) {
  assert.equal(
    new RegExp(`label: '${retired}'`).test(sidebar),
    false,
    `retired destination is back in the navigation rail: ${retired}`,
  );
}

// 4. Capture, Search & Insights, the Business Vault and Settings stay globally
// reachable - and the Vault stays global. It is a way of seeing the six
// destinations, not a seventh place to work, so it may live in the rail's
// second tier and must never appear in PRIMARY_DESTINATION_IDS.
{
  assert.ok(topNav.includes('to="/app/capture"'), 'Capture must stay a global action in the top bar');
  const globals = registry.match(/export const globalActions[\s\S]*?\]\.map/);
  assert.ok(globals, 'featureRegistry must declare globalActions');
  for (const id of ['capture', 'search-insights', 'business-vault', 'settings']) {
    assert.ok(globals[0].includes(`'${id}'`), `global action missing from registry: ${id}`);
  }

  const primaries = registry.match(/export const PRIMARY_DESTINATION_IDS = \[([\s\S]*?)\] as const;/);
  assert.equal(
    primaries[1].includes('business-vault'),
    false,
    'the Business Vault must not become a seventh primary destination',
  );
}

// 5. Every primary destination has a route, and every retired destination still
// resolves. Deep links, bookmarks and shared links must never 404.
{
  for (const route of ['today', 'accounts', 'opportunities', 'revenue', 'timeline', 'reviews']) {
    assert.ok(
      new RegExp(`<Route path="${route}"`).test(app),
      `primary destination has no route: /app/${route}`,
    );
  }

  for (const legacy of [
    'dashboard',
    'plan',
    'activity',
    'calendar',
    'weekly-brief',
    'onboarding/pipeline-review',
    'onboarding/sales-operating-setup',
    'onboarding/quick-start',
    'journey',
    'history',
    'entities',
    'deals',
    'search',
  ]) {
    assert.ok(
      new RegExp(`<Route path="${legacy}"`).test(app),
      `legacy route removed instead of redirected: /app/${legacy}`,
    );
  }

  for (const contextual of [
    'quotes',
    'stakeholders',
    'objections',
    'operating-system',
    'pipeline-defense',
    'playbook',
    'assets',
    'imports',
  ]) {
    assert.ok(
      new RegExp(`<Route path="${contextual}"`).test(app),
      `contextual or hidden surface lost its route: /app/${contextual}`,
    );
  }
}

// 6. Redirects preserve query strings. A plain <Navigate> would drop the record
// id that Today, Timeline and Search put on these links.
{
  assert.ok(app.includes('function LegacyRedirect'), 'App must define a query-preserving legacy redirect');
  assert.ok(
    app.includes('location.search') && app.includes('location.hash'),
    'legacy redirects must carry the query string and hash through',
  );
  for (const legacy of ['plan', 'activity', 'calendar', 'dashboard', 'weekly-brief', 'history']) {
    assert.ok(
      new RegExp(`<Route path="${legacy}" element={<LegacyRedirect`).test(app),
      `legacy route ${legacy} uses a redirect that drops its query string`,
    );
  }
}

// 7. The retired persona system and the retired onboarding surfaces are gone.
for (const removed of [
  'src/utils/workspaceLens.ts',
  'src/features/onboarding/QuickStartSetupPage.tsx',
  'src/features/onboarding/SalesOperatingSetupPage.tsx',
  'src/features/onboarding/FirstPipelineReviewFlow.tsx',
]) {
  assert.equal(existsSync(removed), false, `retired surface reintroduced: ${removed}`);
}

// 8. Hidden libraries are gated on real workspace evidence, not on a toggle.
{
  assert.ok(existsSync('src/config/libraryActivation.ts'), 'library activation gate must exist');
  const gate = readFileSync('src/config/libraryActivation.ts', 'utf8');
  assert.ok(gate.includes('MIN_REAL_COMMERCIAL_EVENTS'), 'gate must state its event threshold');
  assert.ok(gate.includes("source !== 'demo'"), 'demo records must never satisfy the gate');
  assert.ok(app.includes('<LibraryGate'), 'Playbook and Assets must render behind the gate');
}

// 9. Money is a commercial-flow surface, not an accounting product.
{
  const money = readFileSync('src/features/revenue/RevenueViewPage.tsx', 'utf8');
  assert.ok(
    money.includes('BUSINESS_ACCOUNTING_ENABLED'),
    'expenses and profit-and-loss must sit behind the accounting flag',
  );
  const flags = readFileSync('src/config/featureFlags.ts', 'utf8');
  assert.ok(
    flags.includes("VITE_ENABLE_BUSINESS_ACCOUNTING === 'true'"),
    'the accounting flag must default to off',
  );
}

console.log('Navigation contract verified: six primary destinations, four global surfaces, no orphaned deep links.');
