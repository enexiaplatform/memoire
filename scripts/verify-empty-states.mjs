import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * What each room says when it is empty.
 *
 * A workspace on day one is eleven empty destinations, and an empty destination
 * is the most expensive screen this product has: it is the only one a new user
 * is guaranteed to see, and the one with nothing on it to work out what to do
 * next from. Two failures were live before 2026-08-03:
 *
 * - Activity drew its whole analytics dashboard over an empty set. A wall of
 *   zeros, em-dashes and "0% attached" is not an empty state; it reads as a
 *   verdict on the operator, and it names nothing to do about it.
 * - Opportunities offered four buttons, two of them identically primary, and
 *   one of them ("Start First Pipeline Review") led to a review of a pipeline
 *   that did not exist. Four doors is a decision the new user has no basis to
 *   make.
 *
 * The rule this pins is deliberately narrow, because it is the one that can be
 * checked and the one that matters: every destination that can be empty says so
 * in a sentence, and offers exactly one primary action that fills it. Anything
 * else on the screen is a quieter alternative, not a rival.
 */

/**
 * The destinations, the block that renders when each has nothing, and the route
 * or handler that fills it. `oneOf` for the two pages whose empty state offers
 * a choice of primary depending on state.
 */
const DESTINATIONS = [
  {
    id: 'today',
    file: 'src/features/dashboard/DashboardPage.tsx',
    marker: 'function TodayCommandEmptyState',
    says: /Capture one real customer interaction/,
    fills: /to="\/app\/capture"/,
  },
  {
    id: 'plan',
    file: 'src/features/plan/WeeklyPlanPage.tsx',
    marker: 'board.totalCount === 0 && suggestions.length === 0',
    says: /Nothing dated in this period yet/,
    fills: /to="\/app\/capture\?mode=quick"/,
  },
  {
    id: 'plan-history',
    file: 'src/features/calendar/SalesActivityCalendarPage.tsx',
    marker: 'function EmptyCalendarState',
    says: /No sales activities captured for this period/,
    fills: /to="\/app\/capture\?mode=quick"/,
  },
  {
    id: 'business-lens',
    file: 'src/features/business/BusinessLensPage.tsx',
    marker: 'function EmptyState',
    says: /Nothing to show yet/,
    fills: /to="\/app\/capture"/,
  },
  {
    id: 'review',
    file: 'src/features/reviews/SalesReviewsPage.tsx',
    marker: 'function EmptyReviewsState',
    says: /No activities captured for this period/,
    fills: /to="\/app\/capture"/,
  },
  {
    id: 'accounts',
    file: 'src/features/accounts/AccountsPage.tsx',
    marker: 'function EmptyState',
    says: /No accounts yet/,
    fills: /onClick=\{onImport\}/,
  },
  {
    id: 'opportunities',
    file: 'src/features/opportunities/OpportunitiesPage.tsx',
    marker: 'function EmptyState',
    says: /Import the deals you are already working/,
    fills: /onClick=\{onImport\}/,
  },
  {
    id: 'orders',
    file: 'src/features/revenue/RevenueViewPage.tsx',
    marker: 'function RevenueEmptyState',
    says: /No orders yet/,
    fills: /to="\/app\/opportunities"/,
  },
  {
    id: 'activity',
    file: 'src/features/activity/ActivityPage.tsx',
    marker: 'function ActivityEmptyState',
    says: /Nothing dated yet/,
    fills: /to="\/app\/capture\?mode=quick"/,
  },
  {
    id: 'business-vault',
    file: 'src/features/vault/BusinessVaultPage.tsx',
    marker: 'function EmptyState',
    says: /No lines recorded yet/,
    fills: /to="\/app\/opportunities"/,
  },
];

for (const destination of DESTINATIONS) {
  const source = readFileSync(destination.file, 'utf8');
  const start = source.indexOf(destination.marker);
  assert.ok(start >= 0, `${destination.id}: no empty state found in ${destination.file} (looked for ${destination.marker})`);

  // The block, bounded generously - these are all small components.
  const block = source.slice(start, start + 2200);

  assert.match(block, destination.says, `${destination.id}: the empty state does not say what is missing`);
  assert.match(block, destination.fills, `${destination.id}: the empty state does not offer the action that fills it`);

  // Exactly one primary. Every other affordance on an empty screen has to read
  // as an alternative, or the new user is choosing between equals with nothing
  // to choose on.
  const primaries = block.match(/bg-navy /g) || [];
  assert.equal(
    primaries.length,
    1,
    `${destination.id}: an empty state must offer exactly one primary action, found ${primaries.length}`,
  );
}

// The two destinations that cannot be empty, named so that "every destination"
// stays an honest claim rather than a list that quietly skipped the awkward ones.
{
  const ask = readFileSync('src/features/v31/AskMemoirePage.tsx', 'utf8');
  assert.match(ask, /placeholder="Ask about/, 'Ask is a question box: it is usable on an empty workspace, so it has no empty state');

  const settings = readFileSync('src/features/settings/SettingsPage.tsx', 'utf8');
  assert.ok(settings.length > 0, 'Settings is configuration, not records: there is nothing for it to be empty of');
}

// Activity's empty state has to actually be reachable. It is the one that
// replaced a rendered dashboard, so the branch matters as much as the copy.
{
  const activity = readFileSync('src/features/activity/ActivityPage.tsx', 'utf8');
  assert.match(
    activity,
    /if \(allEntries\.length === 0\) \{\s*return <ActivityEmptyState \/>;/,
    'Activity must show the empty state instead of a dashboard of zeros',
  );
  assert.ok(
    activity.indexOf('if (allEntries.length === 0)') > activity.indexOf('const allEntries = useMemo'),
    'and the check has to come after the hooks, not before them',
  );
}

console.log(`Empty states verified across ${DESTINATIONS.length} destinations: each says what is missing and offers exactly one way to fill it.`);
