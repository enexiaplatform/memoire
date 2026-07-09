import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildProactiveNudges,
  classifyOpportunitySilence,
  formatNudgeDueDate,
  formatNudgeMoney,
} from '../src/utils/proactiveNudges.ts';

const today = '2026-06-30';

const revenueQuoteExpiring = {
  id: 'quote-expiring-1',
  accountName: 'Pymepharco',
  label: 'DCM comparison quote',
  amount: 300_000,
  currency: 'SGD',
  baseAmount: 6_000_000_000,
  status: 'Sent',
  risk: 'Quote expiring',
  nextAction: 'Follow up before quote expires.',
  dueDate: '2026-07-03',
  href: '/app/revenue',
  source: 'Quote',
};
const revenuePaymentOverdue = {
  ...revenueQuoteExpiring,
  id: 'quote-payment-1',
  accountName: 'DHG Pharma',
  label: 'Payment collection',
  amount: 100_000_000,
  currency: 'VND',
  baseAmount: 100_000_000,
  risk: 'Payment overdue',
  nextAction: 'Confirm payment owner and collection date.',
  dueDate: '2026-06-20',
};

const overdueOpportunity = {
  id: 'opp-overdue',
  accountName: 'DKSH',
  opportunityName: 'DCM comparison',
  stage: 'Proposal',
  estimatedValue: 200_000,
  currency: 'SGD',
  expectedClosePeriod: 'Q3',
  productOrSolution: 'DCM',
  decisionMaker: '',
  budgetOwner: '',
  procurementPath: '',
  technicalCriteria: '',
  nextAction: 'Confirm procurement path',
  nextActionDate: '2026-06-21',
  evidence: '',
  missingContext: '',
  objectionDebt: 'Lead time',
  forecastEvidenceCategory: 'Unsupported',
  decisionRecommendation: 'Rescue',
  status: 'Active',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
  storageMode: 'local',
};

const importedOnlyAccount = {
  id: 'acct-imported',
  accountName: 'Imported Shell Account',
  segment: '',
  industry: '',
  location: '',
  accountPotential: 'Unknown',
  relationshipStatus: 'New',
  keyStakeholders: [],
  notes: '',
  tags: [],
  sourceSystem: 'founder_core_fy26',
  externalSourceKey: 'import-1',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  storageMode: 'local',
};

const strategicAccount = {
  ...importedOnlyAccount,
  id: 'acct-strategic',
  accountName: 'Strategic Pharma',
  sourceSystem: '',
  externalSourceKey: '',
  fy26TargetSgd: 500_000,
};

const oldActivity = {
  id: 'activity-old',
  accountName: 'Strategic Pharma',
  opportunityName: '',
  contactName: '',
  stakeholderName: '',
  stakeholderRole: '',
  competitors: [],
  buyingSignals: [],
  risks: [],
  timelineSignals: [],
  nextActions: [],
  activityType: 'Customer meeting',
  summary: 'Old signal',
  nextAction: '',
  dueDate: '',
  tags: [],
  rawNote: 'Old signal',
  activityDate: '2026-05-01',
  linkedOpportunityId: '',
  linkedOpportunityName: '',
  linkedAccountName: '',
  linkStatus: 'Linked',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  storageMode: 'local',
};

const captureNeedsLink = {
  ...oldActivity,
  id: 'activity-unlinked',
  accountName: '',
  opportunityName: '',
  summary: 'Captured note needs linking',
  rawNote: 'Met Pymepharco with Ms. Nhu.',
  activityDate: '2026-06-29',
  linkStatus: 'Unlinked',
};

const objection = {
  id: 'obj-1',
  accountId: '',
  accountName: 'DKSH',
  opportunityId: overdueOpportunity.id,
  opportunityName: overdueOpportunity.opportunityName,
  stakeholderId: '',
  stakeholderName: '',
  sourceActivityId: '',
  objectionType: 'Lead time',
  objectionText: 'Lead time proof is missing.',
  impact: 'High',
  status: 'Open',
  requiredProof: 'Delivery timeline',
  responsePlan: 'Send delivery proof.',
  resolutionNote: '',
  dueDate: '2026-07-02',
  resolvedAt: '',
  tags: [],
  createdAt: '2026-06-28T00:00:00.000Z',
  updatedAt: '2026-06-28T00:00:00.000Z',
  storageMode: 'local',
};

const outcome = {
  id: 'outcome-1',
  opportunityId: 'past-1',
  accountName: 'Past Pharma',
  opportunityName: 'Procurement review',
  outcome: 'Lost',
  outcomeDate: '2026-06-20',
  finalAmount: 200_000,
  currency: 'SGD',
  forecastEvidenceCategoryBeforeOutcome: 'Defensible',
  decisionRecommendationBeforeOutcome: 'Defend',
  stageBeforeOutcome: 'Proposal',
  reasonCategory: 'Timing',
  reasonText: 'Procurement path was not proven.',
  decisiveStakeholder: 'Procurement',
  objectionThatMattered: 'Lead time',
  evidenceThatWasMissing: 'Procurement path',
  lessonLearned: 'Prove procurement path before defending.',
  createdAt: '2026-06-20T00:00:00.000Z',
  updatedAt: '2026-06-20T00:00:00.000Z',
  storageMode: 'local',
};
const outcomes = [
  outcome,
  { ...outcome, id: 'outcome-2', opportunityId: 'past-2', accountName: 'Past DHG', outcome: 'Delayed', outcomeDate: '2026-06-18' },
  { ...outcome, id: 'outcome-3', opportunityId: 'past-3', accountName: 'Past DKSH', outcome: 'No decision', outcomeDate: '2026-06-15' },
];

const deal = {
  id: 'deal-overdue',
  sourceOpportunityId: overdueOpportunity.id,
  account: overdueOpportunity.accountName,
  opportunity: overdueOpportunity.opportunityName,
  pipelineContext: 'Stage: Proposal.',
  dealTruth: 'Procurement path is unknown.',
  riskType: ['Procurement path unclear'],
  evidence: [],
  missingContext: ['Procurement path'],
  objectionDebt: {
    objection: 'Lead time',
    evidence: '',
    requiredAction: 'Send delivery proof.',
    owner: 'Seller',
    status: 'Open',
  },
  forecastEvidenceCategory: 'Unsupported',
  recommendedAction: 'Confirm procurement path',
  pipelineReviewAnswer: 'This deal cannot be defended until procurement path is proven.',
  decisionRecommendation: 'Rescue',
  estimatedValue: 200_000,
  currency: 'SGD',
  nextActionDate: '2026-06-21',
  lastSignalDate: '2026-05-01',
};
const brief = {
  id: 'brief-1',
  title: 'Review',
  weekLabel: 'Week',
  salesOwner: 'Seller',
  scope: 'Pipeline',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  storageMode: 'local',
  deals: [deal],
};

const center = buildProactiveNudges({
  briefs: [brief],
  revenueActions: [revenueQuoteExpiring, revenuePaymentOverdue, revenuePaymentOverdue],
  opportunities: [overdueOpportunity],
  activities: [oldActivity, captureNeedsLink],
  objections: [objection],
  accounts: [importedOnlyAccount, strategicAccount],
  quotes: [],
  opportunityOutcomes: outcomes,
  today,
});

assert.ok(center.allActiveNudges.some((nudge) => nudge.title === 'Next action overdue'), 'overdue next action should create nudge');
assert.ok(center.allActiveNudges.some((nudge) => nudge.title === 'Quote expiring soon'), 'quote expiring soon should create nudge');
assert.ok(center.allActiveNudges.some((nudge) => nudge.title === 'Payment overdue'), 'payment overdue should create nudge');
assert.ok(center.allActiveNudges.some((nudge) => nudge.title === 'Missing forecast evidence' || nudge.title === 'Evidence missing from manager brief'), 'missing evidence should create nudge');
assert.ok(center.allActiveNudges.some((nudge) => nudge.title === 'Capture needs confirmation'), 'capture confirmation should create nudge');
assert.ok(center.allActiveNudges.some((nudge) => nudge.title === 'No recent signal on important account'), 'strategic account with no recent signal should create nudge');
assert.ok(center.allActiveNudges.some((nudge) => nudge.title === 'Unresolved objection'), 'unresolved objection should create nudge');
assert.equal(center.todayNudges.length <= 5, true, 'Today should show max 5 active nudges');
assert.equal(center.todayNudges.filter((nudge) => nudge.source === 'outcome-learning').length <= 1, true, 'outcome-learning should be capped at one');
assert.equal(center.todayNudges.filter((nudge) => nudge.entityId === 'imported-account-hygiene').length <= 1, true, 'imported/account hygiene info should be capped at one');
assert.equal(center.hiddenImportedAccountCount, 1);
assert.equal(center.allActiveNudges.some((nudge) => nudge.accountName === importedOnlyAccount.accountName && nudge.urgency !== 'low'), false, 'imported-only account must not create urgent work');

const silentOpportunity = {
  ...overdueOpportunity,
  id: 'opp-silent',
  accountName: 'Strategic Pharma',
  opportunityName: 'Silent renewal',
  nextAction: 'Reconfirm renewal scope',
  nextActionDate: '',
  forecastEvidenceCategory: 'Defensible',
  decisionRecommendation: 'Defend',
  createdAt: '2026-04-01T00:00:00.000Z',
};
const warmingOpportunity = {
  ...silentOpportunity,
  id: 'opp-warming',
  accountName: 'Fresh Pharma',
  opportunityName: 'Fresh intro',
  nextAction: '',
  createdAt: '2026-06-22T00:00:00.000Z',
};
const recentTouchOpportunity = {
  ...silentOpportunity,
  id: 'opp-recent-touch',
  accountName: 'Active Pharma',
  opportunityName: 'Active expansion',
};
const plannedOpportunity = {
  ...silentOpportunity,
  id: 'opp-planned',
  accountName: 'Planned Pharma',
  opportunityName: 'Planned rollout',
  nextActionDate: '2026-07-08',
};
const recentTouchActivity = {
  ...oldActivity,
  id: 'activity-recent-touch',
  accountName: 'Active Pharma',
  activityDate: '2026-06-28',
};

const silenceCenter = buildProactiveNudges({
  opportunities: [silentOpportunity, warmingOpportunity, recentTouchOpportunity, plannedOpportunity],
  activities: [oldActivity, recentTouchActivity],
  today,
  limit: 20,
});
const goingSilent = silenceCenter.allActiveNudges.find((nudge) => nudge.title === 'Deal going silent');
assert.ok(goingSilent, 'active deal with no scheduled next action and no touch for 14+ days should create a going-silent nudge');
assert.equal(goingSilent.entityId, 'opp-silent');
assert.equal(goingSilent.urgency, 'critical');
assert.ok(goingSilent.reason.includes('No customer touch since'), 'going-silent reason should name the last touch date');
assert.ok(goingSilent.recommendedAction.includes('Reconfirm renewal scope'), 'going-silent nudge should reuse the planned next action');
const warmingSilence = silenceCenter.allActiveNudges.find((nudge) => nudge.entityId === 'opp-warming');
assert.ok(warmingSilence, 'untouched opportunity older than 7 days should create a silence-risk nudge');
assert.equal(warmingSilence.title, 'Silence risk');
assert.equal(warmingSilence.urgency, 'high');
assert.ok(warmingSilence.reason.includes('created on'), 'silence-risk reason should fall back to the created date when no touch exists');
assert.equal(
  silenceCenter.allActiveNudges.some((nudge) => nudge.entityId === 'opp-recent-touch' && (nudge.title === 'Silence risk' || nudge.title === 'Deal going silent')),
  false,
  'a deal touched within 7 days must not be flagged as silent',
);
assert.equal(
  silenceCenter.allActiveNudges.some((nudge) => nudge.entityId === 'opp-planned' && (nudge.title === 'Silence risk' || nudge.title === 'Deal going silent')),
  false,
  'a deal with a scheduled next action must not be flagged as silent',
);
assert.equal(
  center.allActiveNudges.some((nudge) => nudge.entityId === overdueOpportunity.id && (nudge.title === 'Silence risk' || nudge.title === 'Deal going silent')),
  false,
  'an overdue next action already has its own nudge and must not double-fire as silence',
);

assert.equal(classifyOpportunitySilence(silentOpportunity, [oldActivity], today).status, 'silent');
assert.equal(classifyOpportunitySilence(silentOpportunity, [oldActivity], today).lastTouchDate, oldActivity.activityDate);
assert.equal(classifyOpportunitySilence(warmingOpportunity, [], today).status, 'at-risk');
assert.equal(classifyOpportunitySilence(recentTouchOpportunity, [recentTouchActivity], today).status, 'quiet-ok');
assert.equal(classifyOpportunitySilence(plannedOpportunity, [], today).status, 'planned');
assert.equal(classifyOpportunitySilence({ ...silentOpportunity, status: 'Won' }, [oldActivity], today).status, 'inactive');

const opportunitiesUi = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
for (const marker of ['classifyOpportunitySilence', "'goingSilent'", 'Going silent', 'Quiet ${row.silence.daysQuiet}d']) {
  assert.ok(opportunitiesUi.includes(marker), `Opportunities silence rollup missing ${marker}`);
}

const duplicateKeys = new Set();
for (const nudge of center.allActiveNudges) {
  const key = `${nudge.source}|${nudge.entityType}|${nudge.entityId}|${nudge.reason.toLowerCase()}`;
  assert.equal(duplicateKeys.has(key), false, `duplicate nudge found: ${key}`);
  duplicateKeys.add(key);
}

const dismissTarget = center.allActiveNudges.find((nudge) => nudge.title === 'Payment overdue');
assert.ok(dismissTarget, 'dismiss target missing');
assert.equal(buildProactiveNudges({
  revenueActions: [revenuePaymentOverdue],
  persistedNudges: [{ ...dismissTarget, status: 'dismissed' }],
  today,
}).todayNudges.length, 0, 'dismiss should hide nudge');
assert.equal(buildProactiveNudges({
  revenueActions: [revenuePaymentOverdue],
  persistedNudges: [{ ...dismissTarget, status: 'done' }],
  today,
}).todayNudges.length, 0, 'done should hide nudge');
assert.equal(buildProactiveNudges({
  revenueActions: [revenuePaymentOverdue],
  persistedNudges: [{ ...dismissTarget, status: 'snoozed', snoozedUntil: '2026-07-01' }],
  today,
}).todayNudges.length, 0, 'snooze should hide until snoozedUntil');
assert.equal(buildProactiveNudges({
  revenueActions: [revenuePaymentOverdue],
  persistedNudges: [{ ...dismissTarget, status: 'snoozed', snoozedUntil: today }],
  today,
}).todayNudges.length, 1, 'snoozed nudge should reappear on snoozedUntil');

assert.ok(formatNudgeDueDate(dismissTarget).includes('Jun 20, 2026'));
assert.ok(formatNudgeMoney(dismissTarget).includes('Base: VND'));

const engine = readFileSync('src/utils/proactiveNudges.ts', 'utf8');
for (const helper of ['formatSafeBusinessDate', 'formatCurrencyAmount', 'formatBaseCurrencyAmount', 'isBusinessDateOverdue', 'classifyAccountEngagement', 'analyzePersonalSalesLearning']) {
  assert.ok(engine.includes(helper), `proactive nudge engine missing ${helper}`);
}

const store = readFileSync('src/services/nudgeStore.ts', 'utf8');
for (const marker of ['pipeline-defense', 'outcome-learning', 'snoozedUntil', 'dismissed', 'done', 'storageMode']) {
  assert.ok(store.includes(marker), `nudge store missing ${marker}`);
}
assert.equal(/push|email|notification/i.test(store), false, 'nudge store should not add push/email notification behavior');

const todayUi = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
for (const marker of ['Proactive Nudges', 'Mark done', 'Dismiss', 'Snooze tomorrow', 'Snooze next week', 'Clear dismissed local nudges', 'Clear all local nudge state']) {
  assert.ok(todayUi.includes(marker), `Today proactive nudge UI missing ${marker}`);
}

const pipelineUi = readFileSync('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx', 'utf8');
assert.ok(pipelineUi.includes('Proactive nudge'), 'Pipeline Defense should show per-opportunity proactive nudges');

const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 14, 'A new CRM navigation item was added.');

console.log('Proactive nudge engine regression verified.');
