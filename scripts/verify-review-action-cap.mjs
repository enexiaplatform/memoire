import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The first real user saw "865 recommended actions" on the Business Review -
// every imported deal generating several generic actions. That number describes
// the data volume, not the work. The review now headlines DEALS needing action.
//
// Asserted structurally: weeklyExecutionReview reaches the Supabase-backed
// action-outcome store transitively, so it does not load in a node contract.

const review = readFileSync('src/utils/weeklyExecutionReview.ts', 'utf8');
const page = readFileSync('src/features/reviews/SalesReviewsPage.tsx', 'utf8');

// 1. The summary exposes the distinct-deal count, derived from opportunityId.
assert.ok(/dealsNeedingActionCount:\s*number/.test(review), 'the summary type must carry dealsNeedingActionCount');
assert.ok(
  /dealsNeedingActionCount:\s*new Set\(recommendedActions\.map\(\(action\) => action\.opportunityId\)\)\.size/.test(review),
  'the deal count must be distinct opportunityIds, not the raw action total',
);
// The raw count is retained (used elsewhere as a gate) but is no longer the headline.
assert.ok(review.includes('recommendedActionsCount: recommendedActions.length'), 'the raw count stays available for gating');

// 2. The review page headlines "Deals needing action", not the raw count.
assert.ok(page.includes('summary.dealsNeedingActionCount'), 'the metric must show the deal count');
assert.ok(page.includes('Deals needing action'), 'the metric must be labelled by deals, not raw actions');
assert.equal(
  page.includes('label="Recommended" value={summary.recommendedActionsCount}'),
  false,
  'the raw-action-count metric card must be gone',
);

// 3. The visible deal-action list stays capped (it always was) - this slice is
//    about the headline number, not re-capping the already-limited lists.
assert.ok(page.includes('limit: 6'), 'the period deal actions stay capped at 6');

console.log('Review action cap contract verified.');
