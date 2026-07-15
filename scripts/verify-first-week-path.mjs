import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFirstWeekPath } from '../src/utils/firstWeekPath.ts';

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

// 1. Empty workspace: nothing done, capture is the next step.
{
  const path = buildFirstWeekPath({ activities: [], opportunities: [], briefs: [] });
  assert.equal(path.done, 0);
  assert.equal(path.total, 3);
  assert.equal(path.complete, false);
  assert.equal(path.nextStep?.id, 'capture', 'the first missing step is capture');
}

// 2. The starter sample brief does NOT count as a prepared review.
{
  const path = buildFirstWeekPath({ activities: [], opportunities: [], briefs: [brief({ isSample: true })] });
  assert.equal(path.steps.find((s) => s.id === 'review')?.done, false, 'a sample brief is not a real review');
}

// 3. Steps advance in order and next points at the first gap.
{
  const captured = buildFirstWeekPath({ activities: [activity()], opportunities: [], briefs: [] });
  assert.equal(captured.done, 1);
  assert.equal(captured.nextStep?.id, 'organize', 'after capture, organize is next');

  const organized = buildFirstWeekPath({ activities: [activity()], opportunities: [opportunity()], briefs: [] });
  assert.equal(organized.done, 2);
  assert.equal(organized.nextStep?.id, 'review', 'after organize, review is next');
}

// 4. All three real milestones: the path completes and the strip folds away.
{
  const path = buildFirstWeekPath({ activities: [activity()], opportunities: [opportunity()], briefs: [brief()] });
  assert.equal(path.done, 3);
  assert.equal(path.complete, true);
  assert.equal(path.nextStep, null, 'a completed path has no next step');
}

// 5. The strip is wired into Today: only while incomplete and not dismissed,
// above the Supporting detail divider, and it reuses the checklist dismissal.
const today = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
assert.ok(today.includes('<FirstWeekPathStrip'), 'Today must render the strip');
assert.ok(
  today.includes('!sampleDataActive && !firstWeekPath.complete && !trialChecklistState.dismissedAt'),
  'the strip must be gated on real-workspace, incomplete, and not-dismissed',
);
assert.ok(
  today.indexOf('<FirstWeekPathStrip') < today.indexOf('Supporting detail'),
  'the strip renders in the action tier, above the supporting-detail divider',
);
assert.ok(today.includes('dismissTrialActivationChecklist()'), 'dismiss reuses the checklist state, no new store');

console.log('First Week Path contract verified.');
