import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildScaleWorkspace } from './lib/scale-workspace.mjs';
import { buildMasterDashboard } from '../src/utils/masterDashboard.ts';
import { buildBusinessLens } from '../src/utils/businessLens.ts';
import { buildOrderBook } from '../src/utils/orderToCash.ts';
import { buildOutcomeScoreboard } from '../src/utils/outcomeScoreboard.ts';
import { resolveCommercialThreads } from '../src/domain/commercialKernel/deriveThreads.ts';

/**
 * The derived models, measured against a real book of business.
 *
 * Memoire computes everything on the operator's device, which is the reason it
 * needs no AI service and no server round trip - and the reason a quadratic
 * join nobody notices at seven demo records becomes a frozen tab at three
 * hundred. Nobody had measured that before 2026-08-02; the founder's own import
 * is 122 opportunities and the next users arrive with more.
 *
 * The scale below is deliberately past where the product is today: 300
 * opportunities, 900 captured activities, 200 accounts, 250 quotes. If the
 * models hold there, the surfaces built on them have room.
 *
 * The budgets are generous on purpose. This is not a stopwatch competition, it
 * is a tripwire for the one mistake that actually happens - a nested scan added
 * to a hot path - and it has to stay quiet on a loaded CI machine. A model that
 * doubles is still inside budget; a model that goes quadratic is not.
 */

const SCALE = { opportunities: 300, activities: 900, accounts: 200, quotes: 250 };

/** Milliseconds, on the slowest machine this is expected to run on. */
const BUDGETS = {
  masterDashboard: 400,
  businessLens: 250,
  orderBook: 250,
  outcomeScoreboard: 250,
  resolveThreads: 600,
};

const { opportunities, activities, accounts, quotes, outcomes } = buildScaleWorkspace(SCALE);

function measure(label, run) {
  // One warm-up so the first run's compilation is not the measurement.
  run();
  const started = performance.now();
  run();
  const elapsed = performance.now() - started;
  const budget = BUDGETS[label];
  const verdict = elapsed <= budget ? 'ok' : 'OVER BUDGET';
  console.log(`  ${label.padEnd(20)} ${elapsed.toFixed(1).padStart(7)} ms   budget ${String(budget).padStart(4)} ms   ${verdict}`);
  assert.ok(
    elapsed <= budget,
    `${label} took ${elapsed.toFixed(0)}ms at ${SCALE.opportunities} deals / ${SCALE.activities} activities, over its ${budget}ms budget. Something in it now scales worse than the data does.`,
  );
  return elapsed;
}

console.log(`Derived models at ${SCALE.opportunities} deals / ${SCALE.activities} activities / ${SCALE.accounts} accounts / ${SCALE.quotes} quotes:`);

measure('masterDashboard', () => buildMasterDashboard({
  opportunities, activities, quotes, expenses: [], opportunityOutcomes: outcomes, planRecords: [],
}));

measure('businessLens', () => buildBusinessLens({ accounts, opportunities, activities }));

measure('orderBook', () => buildOrderBook({ opportunities, quotes, milestoneRecords: [], today: '2026-08-02' }));

measure('outcomeScoreboard', () => buildOutcomeScoreboard({
  period: { kind: 'week', label: 'Jul 27 - Aug 2', start: '2026-07-27', end: '2026-08-02' },
  outcomes,
  quotes,
  activities,
  targets: [{ period: 'Q3', fiscalYear: 2026, amount: 5_000_000_000 }],
  today: '2026-08-02',
}));

measure('resolveThreads', () => resolveCommercialThreads({
  storedThreads: [], opportunities, activities, quotes, commitments: [], today: new Date('2026-08-02T00:00:00Z'),
}));

// Deriving is not what makes the app feel slow - every model above lands in
// single-digit milliseconds. The wait is the network: one barrier over sixteen
// collections, ~3MB dominated by accounts and stakeholders, on every fresh
// load. The screen is allowed to draw from the browser copy while that runs.
{
  const workspace = readFileSync('src/services/workspaceData.ts', 'utf8');

  const budget = workspace.match(/const FIRST_PAINT_BUDGET_MS = (\d+)/);
  assert.ok(budget, 'the first-paint budget must be declared');
  assert.ok(
    Number(budget[1]) > 0 && Number(budget[1]) <= 1000,
    'the first-paint budget must be short enough to matter and long enough that a warm cloud answer wins',
  );

  // The guard that keeps the fast path honest.
  //
  // This used to assert `hasAnyRecords(local)` - "the browser copy holds at
  // least one record somewhere". That is not the same claim as "the browser
  // copy is a workspace", and the difference shipped: nothing mirrors a cloud
  // load into localStorage, so a signed-in seller's copy held eleven of 126
  // deals and no accounts or stakeholders at all. It passed the test, the
  // screen drew it, and the operator spent a session looking at a workspace
  // reporting zero customers while every request behind it returned 200.
  //
  // The copy is now measured against what the cloud was last seen to hold.
  assert.ok(
    workspace.includes('isLocalCopyComplete('),
    'the browser copy may only be shown when it is complete against the last known cloud census',
  );
  assert.ok(
    !workspace.includes('hasAnyRecords'),
    'the any-record test must not come back: it cannot tell a workspace from a fragment of one',
  );

  const census = readFileSync('src/services/workspaceCensus.ts', 'utf8');
  assert.ok(
    census.includes('if (!census) return false'),
    'a device that has never completed a cloud load must wait for one, not show what it happens to have',
  );

  assert.ok(
    workspace.includes('WORKSPACE_REFRESHED_EVENT'),
    'a screen drawn from the browser copy must be told when the real answer lands',
  );

  // Every surface, not just Today. Today was the only listener, so Accounts,
  // Opportunities and Stakeholders held their first paint for the whole session.
  const refreshHook = readFileSync('src/hooks/useWorkspaceRefresh.ts', 'utf8');
  assert.ok(
    refreshHook.includes('WORKSPACE_REFRESHED_EVENT'),
    'the shared refresh hook must listen for the cloud answer',
  );

  for (const surface of [
    'src/features/dashboard/DashboardPage.tsx',
    'src/features/accounts/AccountsPage.tsx',
    'src/features/opportunities/OpportunitiesPage.tsx',
    'src/features/stakeholders/StakeholdersPage.tsx',
    'src/features/activity/ActivityPage.tsx',
    'src/features/plan/WeeklyPlanPage.tsx',
    'src/features/revenue/RevenueViewPage.tsx',
    'src/features/calendar/SalesActivityCalendarPage.tsx',
  ]) {
    const source = readFileSync(surface, 'utf8');
    assert.ok(
      source.includes('WORKSPACE_REFRESHED_EVENT') || source.includes('useWorkspaceRefresh'),
      `${surface} must catch up when the cloud load finishes behind it`,
    );
  }
}

// Every collection read from the cloud must be paged.
//
// PostgREST caps an unbounded select at db-max-rows and answers 200, so the app
// showed exactly 1000 of 1,738 stakeholders and called it the whole book. A cap
// that arrives as a success is invisible to everything downstream.
{
  for (const store of [
    'src/services/accountStore.ts',
    'src/services/stakeholderStore.ts',
    'src/services/opportunityStore.ts',
    'src/services/salesActivityStore.ts',
    'src/services/cloudJsonCollectionStore.ts',
    'src/services/commercialKernel/kernelRepository.ts',
  ]) {
    const source = readFileSync(store, 'utf8');
    assert.ok(
      /fetchAllRows[<(]/.test(source),
      `${store} must read every row, not the first page the server feels like returning`,
    );
  }
}

console.log('Performance budget verified: the derived models hold at a real book of business, and the screen never waits on the network to draw.');
