import assert from 'node:assert/strict';
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

console.log('Performance budget verified: the derived models hold at a real book of business.');
