import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  MAX_WEEKLY_COMMITMENTS,
  buildCarryOverSelections,
  buildWeeklyCommitmentSnapshot,
  reconcileWeeklyCommitment,
  resolveCommitmentItem,
} from '../src/utils/weeklyCommitment.ts';

// The layer between recommendation and execution. Every other weekly read-model
// is derived from live state, which means editing a deal silently rewrites last
// week's plan. These pin the one thing that must NOT be derived: what the user
// deliberately committed to, frozen at the moment they committed to it.

const suggestion = (id, label, extra = {}) => ({
  id, label, detail: `${label} detail`, href: '/app/opportunities', reason: `${label} reason`, ...extra,
});
const activity = (id, accountName, activityDate, linkedOpportunityId = '') => ({
  id, accountName, activityDate, linkedOpportunityId, linkedAccountName: '',
});
const week = { weekId: '2026-07-20', periodStart: '2026-07-20', periodEnd: '2026-07-26' };

// 1. Historical truth: a confirmed snapshot is frozen. This is the whole point
//    of the feature - buildCommitmentLedger cannot reconstruct past periods
//    because it reads mutable opportunity state; this record can, because it
//    copies the label instead of pointing at it.
{
  const snapshot = buildWeeklyCommitmentSnapshot({
    ...week,
    suggestions: [suggestion('s1', 'Unstick Acme', { linkedOpportunityId: 'opp-1' })],
    selections: [{ suggestionId: 's1', label: 'Unstick Acme', linkedOpportunityId: 'opp-1' }],
    confirmedAt: '2026-07-19T09:00:00.000Z',
  });
  const frozenLabel = snapshot.items[0].label;

  const resolved = resolveCommitmentItem(snapshot, snapshot.items[0].id, 'completed');
  assert.equal(resolved.confirmedAt, '2026-07-19T09:00:00.000Z', 'confirmedAt is immutable');
  assert.equal(resolved.items[0].label, frozenLabel, 'the committed label is immutable');
  assert.equal(resolved.items[0].suggestionReason, 'Unstick Acme reason', 'the original reason survives');
  assert.deepEqual(resolved.suggestedButRejected, snapshot.suggestedButRejected, 'the rejection list is immutable');
}

// 2. Recommendation and commitment stay separate: what was shown, what was
//    taken, and what was edited are each independently observable. Without the
//    rejection list, acceptance rate has no denominator.
{
  const suggestions = [suggestion('s1', 'A'), suggestion('s2', 'B'), suggestion('s3', 'C')];
  const snapshot = buildWeeklyCommitmentSnapshot({
    ...week,
    suggestions,
    selections: [
      { suggestionId: 's1', label: 'A' },
      { suggestionId: 's2', label: 'B, but only the pricing half' },
      { label: 'Something Memoire never proposed' },
    ],
  });
  const model = reconcileWeeklyCommitment({ snapshot, activities: [] });

  assert.equal(model.suggestionsShown, 3, 'all three suggestions counted as shown');
  assert.equal(model.suggestionsAccepted, 2, 'two suggestions became commitments');
  assert.equal(model.suggestionsEdited, 1, 'one was edited on the way in');
  assert.deepEqual(snapshot.suggestedButRejected.map((item) => item.suggestionId), ['s3'], 'rejection stays visible');
  assert.equal(snapshot.items[2].source, 'user-added', 'user-added work is not credited to the engine');
}

// 3. No inferred outcomes. Captured activity is evidence beside a commitment,
//    never a reason to close it - "I touched that account" is a different claim
//    from "I did what I said I would".
{
  const snapshot = buildWeeklyCommitmentSnapshot({
    ...week,
    suggestions: [],
    selections: [{ label: 'Unstick Acme', linkedOpportunityId: 'opp-1', linkedAccountName: 'Acme' }],
  });
  const model = reconcileWeeklyCommitment({
    snapshot,
    activities: [activity('a1', 'Acme', '2026-07-22', 'opp-1'), activity('a2', 'Acme', '2026-07-24', 'opp-1')],
  });

  assert.equal(model.items[0].evidence.activityCount, 2, 'evidence is attached');
  assert.equal(model.items[0].resolution, 'open', 'evidence never auto-completes a commitment');
  assert.equal(model.completedCount, 0);
  assert.equal(model.openCount, 1, 'an unresolved commitment stays honestly unresolved');
}

// 4. Plan versus actual, including the work that was never on the plan.
//    Unplanned work is reported as unplanned, not scored as a miss.
{
  let snapshot = buildWeeklyCommitmentSnapshot({
    ...week,
    suggestions: [],
    selections: [{ label: 'Unstick Acme', linkedAccountName: 'Acme' }, { label: 'Call Beta' }, { label: 'Restart pilot' }],
  });
  snapshot = resolveCommitmentItem(snapshot, snapshot.items[0].id, 'completed');
  snapshot = resolveCommitmentItem(snapshot, snapshot.items[1].id, 'carried-over');
  snapshot = resolveCommitmentItem(snapshot, snapshot.items[2].id, 'dropped');

  const model = reconcileWeeklyCommitment({
    snapshot,
    activities: [
      activity('a1', 'Acme', '2026-07-21'),
      activity('a2', 'Zephyr', '2026-07-22'),
      activity('a3', 'Zephyr', '2026-07-23'),
      activity('a4', 'Acme', '2026-08-05'), // outside the committed period
    ],
  });

  assert.equal(model.committedCount, 3);
  assert.equal(model.completedCount, 1);
  assert.equal(model.carriedOverCount, 1);
  assert.equal(model.droppedCount, 1);
  assert.equal(model.unplannedWork.length, 1, 'only off-plan accounts are unplanned');
  assert.equal(model.unplannedWork[0].accountName, 'Zephyr');
  assert.equal(model.unplannedWork[0].activityCount, 2, 'activity outside the period is not counted');

  const carried = buildCarryOverSelections(snapshot);
  assert.deepEqual(carried.map((item) => item.label), ['Call Beta'], 'only carried items seed the next week');
}

// 5. The cap holds. This is a commitment layer, not a task manager.
{
  const snapshot = buildWeeklyCommitmentSnapshot({
    ...week,
    suggestions: [],
    selections: Array.from({ length: 9 }, (_, index) => ({ label: `Item ${index}` })),
  });
  assert.equal(MAX_WEEKLY_COMMITMENTS, 5);
  assert.equal(snapshot.items.length, 5, 'a week cannot hold more than five commitments');
}

// 6. Storage contract: the snapshot rides the existing JSON-collection pattern.
//    Vercel Hobby is at the 12-function cap, so a new endpoint is not an option.
{
  const cloudStore = readFileSync(new URL('../src/services/cloudJsonCollectionStore.ts', import.meta.url), 'utf8');
  assert.match(cloudStore, /'weekly_commitments'/, 'weekly_commitments is a registered JSON collection');

  const store = readFileSync(new URL('../src/services/weeklyCommitmentStore.ts', import.meta.url), 'utf8');
  assert.match(store, /loadWeeklyCommitmentsForWorkspace/, 'workspace load path exists');
  assert.match(store, /isUserSnapshot/, 'demo and sample snapshots never merge into a live workspace');

  const apiFunctions = readdirSync(new URL('../api/', import.meta.url))
    .filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(apiFunctions.length <= 12, `api/ must stay within the Hobby function cap (found ${apiFunctions.length})`);
}

// 7. Sample/live separation. A commitment confirmed in the demo sandbox is
//    tagged at birth, so signing in on the same browser cannot pull demo
//    promises into a real workspace.
{
  const snapshot = buildWeeklyCommitmentSnapshot({
    ...week,
    suggestions: [],
    selections: [{ label: 'Demo commitment' }],
    source: 'demo',
    isSample: true,
  });
  assert.equal(snapshot.source, 'demo');
  assert.equal(snapshot.isSample, true);

  const panel = readFileSync(new URL('../src/features/reviews/WeeklyCommitmentPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /source: sampleDataActive \? 'demo' : 'user'/, 'the panel tags demo snapshots at confirm time');
  assert.match(panel, /isSample: sampleDataActive/, 'the panel marks demo snapshots as sample data');
}

// 8. Instrumentation ships with the feature, not after it. Without these four
//    events the stop conditions for further planning work cannot be evaluated.
//     Declaring the event is not the same as emitting it: the stop conditions
//     read counts, so each one is asserted at its call site too.
{
  const analytics = readFileSync(new URL('../src/utils/productAnalytics.ts', import.meta.url), 'utf8');
  const surfaces = [
    '../src/features/reviews/WeeklyCommitmentPanel.tsx',
    '../src/features/dashboard/CommittedWeekStrip.tsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

  [
    'weekly_commitment_confirmed',
    'weekly_commitment_edited',
    'weekly_commitment_resolved',
    'weekly_commitment_reconciliation_viewed',
  ].forEach((eventName) => {
    assert.match(analytics, new RegExp(`'${eventName}'`), `${eventName} is a tracked funnel event`);
    assert.match(
      surfaces,
      new RegExp(`trackProductEvent\\('${eventName}'\\)`),
      `${eventName} is actually emitted by a commitment surface`,
    );
  });
}

// 9. Every suggestion still explains itself, all the way into the snapshot.
{
  const businessReview = readFileSync(new URL('../src/utils/weeklyBusinessReview.ts', import.meta.url), 'utf8');
  const priorityBlock = businessReview.slice(businessReview.indexOf('function buildNextWeekPriorities'));
  const pushCount = (priorityBlock.match(/priorities\.push\(/g) || []).length;
  const reasonCount = (priorityBlock.match(/\n\s+reason:/g) || []).length;
  assert.equal(reasonCount, pushCount, 'every next-week priority carries its source signal');
}

// 10. The commitment is visible during the week, not only at planning and
//     review time - and the strip that shows it can only tick items off. If it
//     could edit a label the snapshot would stop being historical truth.
{
  const strip = readFileSync(new URL('../src/features/dashboard/CommittedWeekStrip.tsx', import.meta.url), 'utf8');

  assert.match(strip, /getCurrentPipelineReviewWeekId\(\)/, 'the strip reads the current week, not the week being planned');
  assert.match(strip, /getWeeklyCommitmentForWeek/, 'the strip reads the frozen snapshot');
  assert.match(strip, /if \(!snapshot \|\| snapshot\.items\.length === 0\) return null;/, 'no confirmed week renders nothing at all');
  assert.match(strip, /resolveCommitmentItem\(current, itemId, done \? 'completed' : 'open'\)/, 'ticking an item only moves its resolution');
  assert.match(strip, /trackProductEvent\('weekly_commitment_resolved'\)/, 'resolving from the strip is instrumented');

  assert.ok(
    !/buildWeeklyCommitmentSnapshot|buildNextWeekPriorities/.test(strip),
    'the strip never builds or re-ranks commitments - it only displays the frozen one',
  );
  assert.ok(
    !/<input[^>]*type="text"/.test(strip),
    'the strip offers no text entry: labels are frozen at confirm time',
  );

  [
    ['../src/features/dashboard/DashboardPage.tsx', 'Today'],
    ['../src/features/dashboard/MasterDashboardPage.tsx', 'Dashboard'],
  ].forEach(([path, surface]) => {
    const page = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(page, /<CommittedWeekStrip/, `${surface} renders the committed-week strip`);
    assert.match(page, /sampleDataActive=\{sampleDataActive\}/, `${surface} passes the data mode through to the strip`);
  });
}

console.log('Weekly commitment snapshot contract verified.');
