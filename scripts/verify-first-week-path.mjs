import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildFirstWeekPath } from '../src/utils/firstWeekPath.ts';

// The First Week Path is the ONLY onboarding mechanism for a real workspace.
// Six overlapping ones used to compete for "the first thing to do"; this
// contract keeps that consolidation from unravelling.

const activity = (patch = {}) => ({
  id: `a-${Math.random().toString(36).slice(2)}`, accountName: 'Apex', opportunityName: 'Deal',
  activityType: 'Meeting', summary: 'x', nextAction: '', dueDate: '', tags: [],
  buyingSignals: [], risks: [], timelineSignals: [], competitors: [],
  linkedOpportunityId: '', linkedOpportunityName: '', linkedAccountName: '', linkStatus: 'Unlinked',
  rawNote: 'x', activityDate: '2026-07-10', createdAt: '', updatedAt: '', storageMode: 'local', ...patch,
});
const opportunity = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'Apex', opportunityName: 'Deal', stage: 'Proposal',
  estimatedValue: 1000, currency: 'USD', expectedClosePeriod: 'Q3', productOrSolution: '', decisionMaker: '',
  budgetOwner: '', procurementPath: '', technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '',
  missingContext: '', objectionDebt: '', forecastEvidenceCategory: '', decisionRecommendation: 'Monitor',
  status: 'Active', createdAt: '', updatedAt: '', storageMode: 'local', ...patch,
});
const brief = (patch = {}) => ({
  id: `b-${Math.random().toString(36).slice(2)}`, title: 'Brief', weekLabel: 'W', salesOwner: 'S', scope: 'x',
  createdAt: '', updatedAt: '', storageMode: 'local', deals: [{ id: 'd1' }], ...patch,
});

// 1. The five-step journey, in order: capture, link, commit, close, review.
{
  const path = buildFirstWeekPath({ activities: [], opportunities: [], briefs: [] });
  assert.equal(path.done, 0);
  assert.equal(path.total, 5);
  assert.equal(path.complete, false);
  assert.deepEqual(
    path.steps.map((step) => step.id),
    ['capture', 'link', 'commit', 'close', 'review'],
    'the path is record once, give it a home, promise, keep the promise, look back',
  );
  assert.equal(path.nextStep?.id, 'capture', 'the first missing step is capture');
}

// 2. Sample and demo records never advance a real workspace.
{
  const path = buildFirstWeekPath({
    activities: [],
    opportunities: [],
    briefs: [brief({ isSample: true })],
    commitments: [{ done: true, isSample: true }, { status: 'completed', source: 'demo' }],
  });
  assert.equal(path.steps.find((s) => s.id === 'review')?.done, false, 'a sample brief is not a real review');
  assert.equal(path.steps.find((s) => s.id === 'commit')?.done, false, 'a demo commitment is not a real promise');
  assert.equal(path.steps.find((s) => s.id === 'close')?.done, false, 'a demo completion is not a kept promise');
}

// 3. Steps advance in order and next points at the first gap.
{
  const captured = buildFirstWeekPath({
    activities: [activity({ accountName: '' })],
    opportunities: [],
    briefs: [],
  });
  assert.equal(captured.nextStep?.id, 'link', 'a capture linked to nothing is the silence Memoire watches for');

  const linked = buildFirstWeekPath({ activities: [activity()], opportunities: [], briefs: [] });
  assert.equal(linked.nextStep?.id, 'commit', 'after linking, the next commitment is the gap');

  const committed = buildFirstWeekPath({
    activities: [activity({ nextAction: 'Send revised quote' })],
    opportunities: [opportunity()],
    briefs: [],
  });
  assert.equal(committed.nextStep?.id, 'close', 'a promise made is not yet a promise kept');
}

// 4. All five real milestones: the path completes and the strip folds away.
{
  const path = buildFirstWeekPath({
    activities: [activity({ nextAction: 'Send revised quote' })],
    opportunities: [opportunity()],
    briefs: [brief()],
    commitments: [{ status: 'completed' }],
  });
  assert.equal(path.done, 5);
  assert.equal(path.complete, true);
  assert.equal(path.nextStep, null, 'a completed path has no next step');
}

// 5. The strip is wired into Today: only while incomplete and not dismissed,
// above the first collapsed drawer, and it reuses the checklist dismissal.
const today = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
assert.ok(today.includes('<FirstWeekPathStrip'), 'Today must render the strip');
assert.ok(
  today.includes('!sampleDataActive && !firstWeekPath.complete && !trialChecklistState.dismissedAt'),
  'the strip must be gated on real-workspace, incomplete, and not-dismissed',
);
assert.ok(
  today.indexOf('<FirstWeekPathStrip') < today.indexOf('The rest of the watch-list'),
  'the strip renders in the action tier, above the first collapsed drawer',
);
assert.ok(today.includes('dismissTrialActivationChecklist()'), 'dismiss reuses the checklist state, no new store');

// 6. The competing onboarding mechanisms are gone, and Today no longer asks a
// new user to configure a sales system before experiencing any value.
for (const removed of [
  'src/features/onboarding/QuickStartSetupPage.tsx',
  'src/features/onboarding/SalesOperatingSetupPage.tsx',
  'src/features/onboarding/FirstPipelineReviewFlow.tsx',
]) {
  assert.equal(existsSync(removed), false, `a competing onboarding surface is back: ${removed}`);
}
for (const gone of [
  'SalesOperatingSetupCta',
  'PipelineReviewHabitCard',
  'TrialActivationChecklistCard',
  'FirstPipelineReviewCta',
  'Start quick setup',
]) {
  assert.equal(today.includes(gone), false, `a retired onboarding mechanism is back on Today: ${gone}`);
}

console.log('First Week Path contract verified: one onboarding path, five steps, sample data excluded.');
