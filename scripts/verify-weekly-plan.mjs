import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  buildPlanBoard,
  createDerivedCompletionRecord,
  createPersonalPlanRecord,
  getPlanRange,
} from '../src/utils/weeklyPlan.ts';

// The plan board is the week laid out as days. Two kinds of item share a
// column: commitments already dated in the workspace, and the operator's own
// work. These pin the boundary between them - the board may never become a
// second source of truth for a deal.

const opportunity = (id, accountName, nextAction, nextActionDate, status = 'Active') => ({
  id, accountName, nextAction, nextActionDate, status,
  opportunityName: `${accountName} deal`, stage: 'Qualified', estimatedValue: 1000, currency: 'VND',
});
const obligation = (id, label, counterparty, dueDate) => ({
  id, label, counterparty, dueDate, kind: 'payment', amount: 1000, currency: 'VND',
  amountBase: 1000, daysUntilDue: 1, status: 'upcoming', href: '/app/revenue',
});
const anchor = new Date(2026, 6, 22); // Wed of the Mon 2026-07-20 week

// 1. The plan week is the review week. If these ever diverged, "this week's
//    commitments" and "this week's plan" would silently mean different days.
{
  const planRange = getPlanRange('week', anchor);
  assert.equal(planRange.start, '2026-07-20', 'plan weeks start Monday');
  assert.equal(planRange.end, '2026-07-26', 'plan weeks end Sunday');

  const habit = readFileSync(new URL('../src/utils/pipelineReviewHabit.ts', import.meta.url), 'utf8');
  assert.match(habit, /const mondayOffset = day === 0 \? -6 : 1 - day;/, 'the review week id also starts Monday');
}

// 2. Derived items come from the workspace, and only from live commitments.
{
  const board = buildPlanBoard({
    periodType: 'week',
    anchorDate: anchor,
    opportunities: [
      opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20'),
      opportunity('o2', 'ACS', 'Outside the week', '2026-08-11'),
      opportunity('o3', 'KN', 'Already closed', '2026-07-21', 'Won'),
      opportunity('o4', 'DCL', 'No date at all', ''),
    ],
    obligations: [obligation('e1', 'VAT payment', 'Tax office', '2026-07-23')],
    records: [],
    today: '2026-07-22',
  });

  assert.equal(board.derivedCount, 2, 'only the in-period, active, dated commitments derive');
  const monday = board.days.find((day) => day.date === '2026-07-20');
  assert.equal(monday.items[0].tag, 'MDL', 'the account becomes the tag');
  assert.equal(monday.items[0].label, 'Connect Mr. Tinh');
  assert.equal(board.days.find((day) => day.date === '2026-07-23').items[0].kind, 'obligation');
}

// 3. Completion is stored against the derived identity, never written back onto
//    the deal. Rescheduling the deal is a new commitment and starts open again.
{
  const opp = opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20');
  const seed = buildPlanBoard({
    periodType: 'week', anchorDate: anchor, opportunities: [opp], obligations: [], records: [], today: '2026-07-22',
  });
  const item = seed.days.find((day) => day.date === '2026-07-20').items[0];
  const completion = createDerivedCompletionRecord(item, true);

  assert.ok(completion.derivedKey.includes('2026-07-20'), 'the completion key carries the date it was promised for');
  assert.equal(completion.done, true);
  assert.ok(completion.doneAt, 'a tick records when it happened');

  const ticked = buildPlanBoard({
    periodType: 'week', anchorDate: anchor, opportunities: [opp], obligations: [], records: [completion], today: '2026-07-22',
  });
  assert.equal(ticked.days.find((day) => day.date === '2026-07-20').items[0].done, true);

  const moved = buildPlanBoard({
    periodType: 'week',
    anchorDate: anchor,
    opportunities: [opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-22')],
    obligations: [],
    records: [completion],
    today: '2026-07-22',
  });
  assert.equal(moved.doneCount, 0, 'a rescheduled commitment is not pre-ticked by the old plan');
}

// 3b. A tick made in the demo sandbox is tagged as sample data. Without this,
//     signing in on the same browser would pull demo ticks into a live plan.
{
  const opp = opportunity('o1', 'MDL', 'Connect Mr. Tinh', '2026-07-20');
  const seed = buildPlanBoard({
    periodType: 'week', anchorDate: anchor, opportunities: [opp], obligations: [], records: [], today: '2026-07-22',
  });
  const item = seed.days.find((day) => day.date === '2026-07-20').items[0];

  const demoTick = createDerivedCompletionRecord(item, true, { source: 'demo', isSample: true });
  assert.equal(demoTick.source, 'demo');
  assert.equal(demoTick.isSample, true);

  const liveTick = createDerivedCompletionRecord(item, true, { source: 'user', isSample: false });
  assert.equal(liveTick.isSample, false, 'a live tick is not marked as sample data');

  const page = readFileSync(new URL('../src/features/plan/WeeklyPlanPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /source: sampleDataActive \? 'demo' : 'user'/, 'the page tags records by workspace mode');
}

// 4. Personal work is first-class but distinguishable, and the bracket the
//    operator already writes is read as the tag.
{
  const board = buildPlanBoard({
    periodType: 'week',
    anchorDate: anchor,
    opportunities: [],
    obligations: [],
    records: [
      createPersonalPlanRecord({ date: '2026-07-20', label: '[Internal] Submit KPI' }),
      createPersonalPlanRecord({ date: '2026-07-21', label: 'Business trip claim' }),
    ],
    today: '2026-07-22',
  });

  assert.equal(board.personalCount, 2);
  const kpi = board.days.find((day) => day.date === '2026-07-20').items[0];
  assert.equal(kpi.kind, 'personal');
  assert.equal(kpi.tag, 'Internal');
  assert.equal(kpi.label, 'Submit KPI');
  assert.equal(kpi.href, '', 'a personal item has nowhere commercial to link to');
}

// 5. The page never writes back onto the deal - the whole reason the board can
//    be checked off without lying to the rest of the app.
{
  const page = readFileSync(new URL('../src/features/plan/WeeklyPlanPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /updateOpportunity|saveOpportunity|deleteOpportunity/, 'the plan board must not mutate opportunities');
  assert.match(page, /does not change the deal/, 'the page says so to the operator');
  assert.match(page, /isSample: sampleDataActive/, 'demo plan items are tagged at birth');
}

// 6. Storage contract: another JSON collection, no new API function.
{
  const cloudStore = readFileSync(new URL('../src/services/cloudJsonCollectionStore.ts', import.meta.url), 'utf8');
  assert.match(cloudStore, /'plan_items'/, 'plan_items is a registered JSON collection');

  const apiFunctions = readdirSync(new URL('../api/', import.meta.url))
    .filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(apiFunctions.length <= 12, `api/ must stay within the Hobby function cap (found ${apiFunctions.length})`);
}

// 7. The sidebar has no collapse control, and Plan is reachable.
{
  const sidebar = readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(sidebar, /ChevronDown/, 'the review tier no longer collapses');
  assert.doesNotMatch(sidebar, /REVIEW_TIER_COLLAPSED_KEY/, 'the collapse preference is gone');
  assert.match(sidebar, /to: '\/app\/plan'/, 'Plan is in the sidebar');

  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /path="plan"/, 'the plan route is registered');
}

// 8. Instrumentation ships with the feature.
{
  const analytics = readFileSync(new URL('../src/utils/productAnalytics.ts', import.meta.url), 'utf8');
  ['weekly_plan_opened', 'weekly_plan_item_added', 'weekly_plan_item_checked'].forEach((eventName) => {
    assert.match(analytics, new RegExp(`'${eventName}'`), `${eventName} is a tracked funnel event`);
  });
}

console.log('Weekly plan board contract verified.');
