import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Memoire is a Personal Commercial Control Tower with exactly six primary
// destinations. This contract is the guard against the failure mode that
// produced the previous surface sprawl: a page reappears in the rail, the
// product stops being describable in one sentence, and nobody notices because
// each individual addition looked reasonable.

const registry = readFileSync('src/config/featureRegistry.ts', 'utf8');
const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
const tabBar = readFileSync('src/components/layout/MobileTabBar.tsx', 'utf8');
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

// 2. The rail renders from the registry, not from a hand-maintained list, and
// every rail item belongs to exactly one declared group.
//
// The rail is grouped by the question each block answers (run the week / the
// records / workspace tools) rather than by registry status, so "primary" and
// "global" items are interleaved by design. That makes this check stronger than
// the old two-tier one, not weaker: the set of items in the rail must be
// exactly the primary destinations plus the global surfaces that have a route,
// with nothing added and nothing dropped.
{
  assert.ok(
    sidebar.includes("from '../../config/featureRegistry'"),
    'Sidebar must render navigation from the feature registry',
  );
  assert.ok(sidebar.includes('navigationGroups'), 'Sidebar must render navigationGroups');

  const groupBlock = registry.match(/const NAVIGATION_GROUP_IDS[\s\S]*?\n\];/);
  assert.ok(groupBlock, 'featureRegistry must declare NAVIGATION_GROUP_IDS');
  const railIds = [...groupBlock[0].matchAll(/itemIds: \[([^\]]*)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/'([a-z-]+)'/g)].map((item) => item[1]));

  assert.equal(new Set(railIds).size, railIds.length, 'a rail item appears in two groups');
  assert.deepEqual(
    [...railIds].sort(),
    [
      'accounts', 'activity', 'business-lens', 'business-vault', 'money',
      'opportunities', 'review', 'search-insights', 'settings', 'timeline', 'today',
    ],
    'the rail is the six primary destinations plus the five routed global surfaces - no more, no less',
  );

  // No hard-coded nav target may sneak in beside the registry - that is exactly
  // how a seventh destination used to appear without anyone deciding to add it.
  // The phone tab bar is held to the same rule; it is navigation too.
  for (const [name, source] of [['Sidebar', sidebar], ['MobileTabBar', tabBar]]) {
    const hardCoded = [
      ...[...source.matchAll(/to="(\/app\/[a-z-]+)"/g)].map((match) => match[1]),
      ...[...source.matchAll(/to: '(\/app\/[a-z-]+)'/g)].map((match) => match[1]),
    ];
    assert.deepEqual(hardCoded, [], `${name} hard-codes nav routes outside the registry: ${hardCoded.join(', ')}`);
  }

  // The phone gets a subset of the same rail, declared in the same file.
  const mobileBlock = registry.match(/export const MOBILE_TAB_IDS = \[([\s\S]*?)\] as const;/);
  assert.ok(mobileBlock, 'featureRegistry must declare MOBILE_TAB_IDS');
  const mobileIds = [...mobileBlock[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
  assert.ok(mobileIds.length <= 4, 'the tab bar holds four destinations plus More - five is already a crowd');
  for (const id of mobileIds) {
    assert.ok(railIds.includes(id), `mobile tab ${id} is not in the rail`);
  }
  assert.ok(tabBar.includes('mobileTabs'), 'MobileTabBar must render the registry list');
}

// 3. Retired destinations stay retired - checked by id rather than by label.
//
// This used to grep the Sidebar for label strings, which stopped meaning
// anything once the rail rendered from the registry, and it could not survive a
// rename: on 2026-08-02 `timeline` was renamed "Plan" and `business-lens` was
// renamed "Dashboard", both names previously belonging to retired pages. A name
// coming back is not a page coming back. What must never come back is the
// retired *surface*, so the check is on the record that owns it: these ids may
// keep their routes, and must never become visible in navigation.
for (const retiredId of [
  'dashboard',
  'pipeline-defense',
  'playbook',
  'assets',
  'stakeholders',
  'objections',
  'quotes',
  'operating-system',
  'plan',
  'founder-import',
  'cohort-console',
]) {
  const record = registry.match(new RegExp(`id: '${retiredId}',[\\s\\S]*?navVisible: (true|false)`));
  assert.ok(record, `feature registry lost its record for ${retiredId}`);
  assert.equal(
    record[1],
    'false',
    `retired or operator-only surface is back in the navigation rail: ${retiredId}`,
  );
}

// 4. Capture, Search & Insights, Activity, the Dashboard lens, the Business
// Vault and Settings stay globally reachable - and the three lenses stay lenses.
// Activity, the Dashboard lens and the Vault are ways of seeing the six
// destinations, not seventh, eighth and ninth places to work: none owns a
// record, all three read what the six already wrote, and all three may sit
// anywhere in the rail. None may ever appear in PRIMARY_DESTINATION_IDS.
//
// Note that the Dashboard lens sits in the rail's first group, above two
// primary destinations. Position in the rail is about how the operator reads
// it; status is about what it is allowed to do. Only the second is a contract.
{
  assert.ok(topNav.includes('to="/app/capture"'), 'Capture must stay a global action in the top bar');
  const globals = registry.match(/export const globalActions[\s\S]*?\]\.map/);
  assert.ok(globals, 'featureRegistry must declare globalActions');
  for (const id of ['capture', 'search-insights', 'activity', 'business-lens', 'business-vault', 'settings']) {
    assert.ok(globals[0].includes(`'${id}'`), `global action missing from registry: ${id}`);
  }

  const primaries = registry.match(/export const PRIMARY_DESTINATION_IDS = \[([\s\S]*?)\] as const;/);
  for (const lens of ['business-vault', 'activity', 'business-lens']) {
    assert.equal(
      primaries[1].includes(lens),
      false,
      `${lens} is a lens over the six destinations and must not become a primary one`,
    );
  }
}

// 4b. The Business lens is a lens because it writes nothing. If an action button
// ever appears on it, it has become a place to work and the argument for keeping
// it out of the primary rail collapses.
{
  const page = readFileSync('src/features/business/BusinessLensPage.tsx', 'utf8');
  for (const writer of ['createOpportunity', 'updateOpportunity', 'createAccount', 'updateAccount', 'savePlanItem', 'deletePlanItem']) {
    assert.equal(
      page.includes(writer),
      false,
      `the Business lens must not write records - found ${writer}. A lens that writes is a seventh destination.`,
    );
  }
  assert.ok(
    page.includes('buildMasterDashboard') && page.includes('buildBusinessLens'),
    'the Business lens must read the derived models rather than recomputing the business',
  );
}

// 4bb. No destination may render nothing because there is no account.
//
// The Business lens returned `null` when `isAuthenticated` was false, and the
// result was a white page - no skeleton, no empty state - for every session
// without a Supabase user: the whole public demo, and any browser-only
// workspace. It was one of eleven rail items and it was blank for exactly the
// people the demo exists to convince.
//
// Whether a session may reach /app at all is ProtectedRoute's decision, made
// once for every destination. A second authentication test inside a page can
// only disagree with the first one, and this is what disagreeing looks like.
// Reading local records never needs an account; Memoire runs browser-only by
// design.
{
  const surfaces = [
    ['Today', 'src/features/dashboard/DashboardPage.tsx'],
    ['Accounts', 'src/features/accounts/AccountsPage.tsx'],
    ['Opportunities', 'src/features/opportunities/OpportunitiesPage.tsx'],
    ['Orders', 'src/features/revenue/RevenueViewPage.tsx'],
    ['Plan', 'src/features/timeline/TimelinePage.tsx'],
    ['Review', 'src/features/reviews/SalesReviewsPage.tsx'],
    ['Capture', 'src/features/dailyCapture/DailyCapturePage.tsx'],
    ['Search & Insights', 'src/features/v31/AskMemoirePage.tsx'],
    ['Activity', 'src/features/activity/ActivityPage.tsx'],
    ['Dashboard lens', 'src/features/business/BusinessLensPage.tsx'],
    ['Business Vault', 'src/features/vault/BusinessVaultPage.tsx'],
    ['Settings', 'src/features/settings/SettingsPage.tsx'],
  ];

  // Any early return that hinges on being signed in. Written as patterns rather
  // than one regex so the failure message can name the shape that was found.
  const bailouts = [
    /!isAuthenticated\)\s*return null/,
    /!isAuthenticated\)\s*\{\s*return null/,
    /!user\)\s*return null/,
    /!session\)\s*return null/,
  ];

  for (const [label, file] of surfaces) {
    assert.ok(existsSync(file), `${label} lost its page file: ${file}`);
    const source = readFileSync(file, 'utf8');
    for (const bailout of bailouts) {
      assert.equal(
        bailout.test(source),
        false,
        `${label} renders nothing when signed out (${file}). Route access is ProtectedRoute's decision; a page that reads local records must render for a browser-only workspace.`,
      );
    }
  }
}

// 4c. The phone is navigable without opening anything.
//
// The rail behind a hamburger was the whole of mobile navigation: three taps to
// change destination, and the drawer closed over the page you had just asked
// for. The tab bar is the fix, so it is a contract rather than a style choice -
// and the main column has to leave room for it, or the last row of every page
// sits under it.
{
  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  assert.ok(shell.includes('<MobileTabBar'), 'the phone must have a tab bar, not only a drawer');
  assert.match(
    shell.match(/<main[\s\S]*?className="([^"]*)"/)[1],
    /pb-16[\s\S]*lg:pb-0/,
    'the main column must clear the tab bar at phone width and not at desktop width',
  );

  // The drawer is still the way to reach everything else, so it must still be
  // openable, and it must not trap a keyboard user behind it when it is shut.
  assert.ok(tabBar.includes('onOpenMenu'), 'the tab bar must be able to open the full rail');
  assert.ok(sidebar.includes('inert='), 'the closed drawer must leave the tab order');
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
  for (const legacy of ['plan', 'calendar', 'dashboard', 'weekly-brief', 'history']) {
    assert.ok(
      new RegExp(`<Route path="${legacy}" element={<LegacyRedirect`).test(app),
      `legacy route ${legacy} uses a redirect that drops its query string`,
    );
  }

  // /app/activity now renders the Activity lens, but the deep link that carries a
  // record id predates it and is still generated by Today, Search and the daily
  // digest. A row id is a request for a record, so it must keep forwarding to the
  // touch in Timeline > History rather than landing on a dashboard.
  assert.ok(
    app.includes('function ActivityRouteEntry'),
    '/app/activity must route through an entry that can forward a record deep link',
  );
  const activityEntry = app.match(/function ActivityRouteEntry\(\)[\s\S]*?\n}/);
  assert.ok(activityEntry, 'ActivityRouteEntry must be readable');
  assert.ok(
    activityEntry[0].includes("has('activityId')") && activityEntry[0].includes('<LegacyRedirect'),
    '/app/activity?activityId=... must still open the touch in Timeline > History',
  );
  assert.ok(activityEntry[0].includes('<ActivityPage />'), '/app/activity must render the Activity lens');
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

console.log('Navigation contract verified: six primary destinations, six global surfaces, no orphaned deep links.');
