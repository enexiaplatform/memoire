import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildScaleWorkspace } from './lib/scale-workspace.mjs';
import { buildLivePipelineHealth } from '../src/utils/livePipelineHealth.ts';
import { buildActivityLedger } from '../src/utils/activityLedger.ts';
import {
  activitiesForOpportunityBroad,
  activitiesForOpportunityStrict,
} from '../src/utils/activityIndex.ts';

/**
 * The three ways this product got slow, and the shape of each one.
 *
 * `verify:performance-budget` measures the derived models and would have caught
 * none of these, because none of them lives in a model - they live in how the
 * surfaces call them. Measured 2026-08-03 at 300 deals / 900 activities:
 *
 * - Today took 6.8 seconds. `buildLivePipelineHealth` mapped every active deal
 *   through a mapper that regenerated the workspace-wide playbook, and that
 *   playbook reviews every deal in the book. 270 deals meant 270 passes over
 *   270 deals: about seventy-three thousand MEDDIC reviews to draw one page.
 * - Two joins answered "which touches belong to this deal" by filtering all 900
 *   activities, once per deal, normalising strings as they went.
 * - Activity took 8.4 seconds building a century of calendar days, constructing
 *   a fresh `Intl.DateTimeFormat` for each one.
 *
 * What is measured below is not milliseconds - a loaded CI box makes those
 * meaningless. It is the exponent: double the book, and honest work roughly
 * doubles. Quadratic work quadruples, and that is what these assertions catch.
 */

const small = buildScaleWorkspace({ opportunities: 100, activities: 300, accounts: 70, quotes: 80 });
const large = buildScaleWorkspace({ opportunities: 200, activities: 600, accounts: 140, quotes: 160 });

function measure(run) {
  run();
  const started = performance.now();
  run();
  return performance.now() - started;
}

/**
 * How much slower the doubled workspace is. Linear work lands near 2, and the
 * ceiling is deliberately loose: it is separating 2 from 4, not 2 from 2.5.
 */
function growth(label, run, ceiling) {
  const at100 = measure(() => run(small));
  const at200 = measure(() => run(large));
  // A run too fast to time reliably cannot produce a meaningful ratio.
  const ratio = at100 < 1 ? 1 : at200 / at100;
  console.log(
    `  ${label.padEnd(28)} ${at100.toFixed(1).padStart(7)} ms -> ${at200.toFixed(1).padStart(7)} ms` +
    `   x${ratio.toFixed(1)}   ceiling x${ceiling}`,
  );
  assert.ok(
    ratio <= ceiling,
    `${label} grew ${ratio.toFixed(1)}x when the workspace doubled (ceiling ${ceiling}x). `
    + 'Something in it now scales worse than the data does - look for work being repeated per record '
    + 'that only depends on the workspace as a whole.',
  );
}

console.log('Growth when the book of business doubles (100 -> 200 deals):');

// 1. Today's heaviest model. This is the one that was quadratic.
growth('livePipelineHealth', (workspace) => buildLivePipelineHealth({
  opportunities: workspace.opportunities,
  activities: workspace.activities,
  quotes: workspace.quotes,
  opportunityOutcomes: workspace.outcomes,
  today: '2026-08-03',
}), 3);

// 2. The activity ledger over the whole workspace, which the Activity page
//    needs to answer "when was this customer last touched at all".
growth('activityLedger (all time)', (workspace) => buildActivityLedger({
  activities: workspace.activities,
  planRecords: [],
  opportunities: workspace.opportunities,
  accounts: workspace.accounts,
  obligations: [],
  today: '2026-08-03',
  range: { start: '2026-01-01', end: '2026-12-31' },
}), 3);

// 3. The two joins, asked the question they are asked in real use: once per
//    opportunity, over the whole activity list.
growth('activities per deal (broad)', (workspace) => {
  workspace.opportunities.forEach((opportunity) => activitiesForOpportunityBroad(opportunity, workspace.activities));
}, 3.5);

growth('activities per deal (strict)', (workspace) => {
  workspace.opportunities.forEach((opportunity) => activitiesForOpportunityStrict(opportunity, workspace.activities));
}, 3.5);

// 4. The shapes themselves, pinned in source. A ratio can be argued with on a
//    noisy machine; these cannot.
{
  const brief = readFileSync('src/utils/opportunityToPipelineBrief.ts', 'utf8');
  const health = readFileSync('src/utils/livePipelineHealth.ts', 'utf8');
  const page = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
  const playbook = readFileSync('src/utils/salesPlaybook.ts', 'utf8');
  const plan = readFileSync('src/utils/weeklyPlan.ts', 'utf8');
  const activityPage = readFileSync('src/features/activity/ActivityPage.tsx', 'utf8');

  assert.match(
    brief,
    /export function mapOpportunitiesToPipelineDefenseDeals/,
    'mapping a whole book is a function, so callers stop writing the loop that repeats the shared work',
  );
  assert.match(playbook, /patterns\?: SalesPlaybookPattern\[\]/, 'the workspace-wide playbook can be passed in');
  assert.match(brief, /patterns: playbookPatterns/, 'and the per-deal mapper uses it instead of regenerating');

  // The consumers must not reach for the per-deal mapper at all. That is the
  // loop, and the loop is where the repeated work lives.
  for (const [label, source] of [['livePipelineHealth', health], ['OpportunitiesPage', page]]) {
    assert.doesNotMatch(
      source,
      /mapOpportunityToPipelineDefenseDeal/,
      `${label} must map the book through mapOpportunitiesToPipelineDefenseDeals, not one deal at a time`,
    );
  }
  // And the one loop that remains - inside the plural function - hands the
  // shared answer down rather than letting each deal recompute it.
  const pluralBody = brief.slice(brief.indexOf('export function mapOpportunitiesToPipelineDefenseDeals'));
  const loop = pluralBody.slice(pluralBody.indexOf('opportunities.map('));
  assert.match(loop.slice(0, 400), /playbookPatterns,/, 'the shared playbook is passed into every deal');

  assert.match(
    plan,
    /const dayLabelFormatter = new Intl\.DateTimeFormat/,
    'the day-label formatter is built once, not once per day in the range',
  );
  assert.doesNotMatch(
    plan.replace(/const \w+Formatter = new Intl\.DateTimeFormat[^;]*;/g, ''),
    /new Intl\.DateTimeFormat/,
    'no remaining per-call Intl construction in the plan board',
  );
  assert.doesNotMatch(
    activityPage,
    /start: '2000-01-01', end: '2100-12-31'/,
    'the all-time ledger asks for the span the records occupy, not a century of empty calendar',
  );
}

console.log('Surface scale verified: doubling the book roughly doubles the work, and the shapes that made it quadratic are gone.');
