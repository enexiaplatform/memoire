import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzePersonalSalesLearning } from '../src/utils/personalSalesLearning.ts';
import { buildPipelineDefenseCenter } from '../src/utils/pipelineDefenseCenter.ts';
import { buildUnifiedTodayCommandCenter } from '../src/utils/todayCommandCenter.ts';

const baseOpportunity = {
  id: 'opp-pyme-dcm',
  accountName: 'Pymepharco',
  opportunityName: 'DCM comparison',
  stage: 'Proposal',
  estimatedValue: 300_000,
  currency: 'SGD',
  expectedClosePeriod: 'Q3',
  productOrSolution: 'DCM',
  decisionMaker: '',
  budgetOwner: '',
  procurementPath: '',
  technicalCriteria: '',
  nextAction: 'Confirm procurement path',
  nextActionDate: '2026-07-03',
  evidence: 'Customer is evaluating DCM comparison.',
  missingContext: 'Procurement path',
  objectionDebt: 'Lead time',
  forecastEvidenceCategory: 'Defensible',
  decisionRecommendation: 'Defend',
  status: 'Active',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-21T00:00:00.000Z',
  storageMode: 'local',
};

const created = {
  id: 'outcome-1',
  userId: 'user-1',
  opportunityId: baseOpportunity.id,
  accountName: baseOpportunity.accountName,
  opportunityName: baseOpportunity.opportunityName,
  outcome: 'Lost',
  outcomeDate: '2026-06-28',
  finalAmount: baseOpportunity.estimatedValue,
  currency: baseOpportunity.currency,
  forecastEvidenceCategoryBeforeOutcome: baseOpportunity.forecastEvidenceCategory,
  decisionRecommendationBeforeOutcome: baseOpportunity.decisionRecommendation,
  stageBeforeOutcome: baseOpportunity.stage,
  reasonCategory: 'Timing',
  reasonText: 'Delivery timing could not be proven.',
  decisiveStakeholder: 'Procurement',
  objectionThatMattered: 'Lead time',
  evidenceThatWasMissing: 'Procurement path',
  lessonLearned: 'Prove delivery timeline before defending.',
  createdAt: '2026-06-28T00:00:00.000Z',
  updatedAt: '2026-06-28T00:00:00.000Z',
  storageMode: 'local',
};
assert.equal(created.opportunityId, baseOpportunity.id);
assert.equal(created.forecastEvidenceCategoryBeforeOutcome, 'Defensible');
assert.equal(created.decisionRecommendationBeforeOutcome, 'Defend');
assert.equal(created.stageBeforeOutcome, 'Proposal');

const outcomes = [
  created,
  {
    ...created,
    id: 'outcome-2',
    opportunityId: 'opp-dhg',
    accountName: 'DHG Pharma',
    opportunityName: 'Validation tender',
    outcome: 'Delayed',
    outcomeDate: '2026-06-24',
    reasonText: 'Procurement path was unknown.',
    evidenceThatWasMissing: 'Procurement path',
  },
  {
    ...created,
    id: 'outcome-3',
    opportunityId: 'opp-dksh',
    accountName: 'DKSH',
    opportunityName: 'RTU procurement',
    outcome: 'No decision',
    outcomeDate: '2026-06-20',
    reasonText: 'Lead time objection stalled decision.',
    evidenceThatWasMissing: 'Procurement path',
  },
];

const activeSimilarOpportunity = {
  ...baseOpportunity,
  id: 'opp-current',
  accountName: 'Current Pharma',
  opportunityName: 'Procurement review',
  forecastEvidenceCategory: 'Weak but recoverable',
  decisionRecommendation: 'Rescue',
};
const learning = analyzePersonalSalesLearning({
  outcomes,
  opportunities: [activeSimilarOpportunity],
});
assert.equal(learning.hasEnoughData, true);
assert.ok(learning.insights.some((insight) => insight.type === 'Evidence gap' && insight.pattern.includes('Procurement path')));
assert.ok(learning.insights.some((insight) => insight.type === 'Objection pattern' && insight.pattern.includes('Lead time')));
assert.ok(learning.insights.some((insight) => insight.type === 'Forecast overconfidence'));
assert.equal(learning.warnings.length, 1);
assert.ok(learning.warnings[0].warning.includes('resembles'));
assert.ok(learning.warnings[0].warning.includes('pattern observed') || learning.warnings[0].warning.includes('Pattern observed'));
assert.ok(learning.todayNudge.includes('Before review'));

const lowData = analyzePersonalSalesLearning({ outcomes: outcomes.slice(0, 2), opportunities: [activeSimilarOpportunity] });
assert.equal(lowData.hasEnoughData, false);
assert.equal(lowData.warnings.length, 0);
assert.equal(lowData.weeklyBriefSection.lowDataMessage, 'Learning will improve after more closed outcomes');

const deal = {
  id: 'deal-current',
  sourceOpportunityId: activeSimilarOpportunity.id,
  account: activeSimilarOpportunity.accountName,
  opportunity: activeSimilarOpportunity.opportunityName,
  pipelineContext: 'Stage: Proposal.',
  dealTruth: 'Procurement path is unknown.',
  riskType: ['Procurement path unclear'],
  evidence: ['Customer is evaluating.'],
  missingContext: ['Procurement path'],
  objectionDebt: {
    objection: 'Lead time',
    evidence: 'Customer asked about delivery.',
    requiredAction: 'Prove delivery timeline.',
    owner: 'Seller',
    status: 'Open',
  },
  forecastEvidenceCategory: 'Weak but recoverable',
  recommendedAction: 'Confirm procurement path',
  pipelineReviewAnswer: 'This deal needs rescue before review.',
  decisionRecommendation: 'Rescue',
  estimatedValue: 300_000,
  currency: 'SGD',
  nextActionDate: '2026-07-03',
  lastSignalDate: '2026-06-28',
};
const center = buildPipelineDefenseCenter([deal], '2026-06-30', outcomes);
assert.equal(center.items[0].learningWarning?.matchedOutcomes >= 2, true);
assert.ok(center.items[0].copyText.includes('Outcome learning risk signal'));
assert.ok(center.items[0].moneyLabel.includes('300,000 SGD'));
assert.ok(center.items[0].moneyLabel.includes('Base: VND'));
assert.ok(center.items[0].dueDateLabel.includes('Jul 3, 2026'));

const today = buildUnifiedTodayCommandCenter({
  briefs: [{
    id: 'brief-1',
    title: 'Review',
    weekLabel: 'Week',
    salesOwner: 'Seller',
    scope: 'Pipeline',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    storageMode: 'local',
    deals: [deal],
  }],
  revenueActions: [],
  opportunities: [activeSimilarOpportunity],
  activities: [],
  opportunityOutcomes: outcomes,
  today: '2026-06-30',
});
assert.ok(today.learningNudge.includes('Before review'));
assert.equal((today.learningNudge.match(/Before review/g) || []).length, 1);

const opportunityStore = readFileSync('src/services/opportunityOutcomeStore.ts', 'utf8');
for (const marker of [
  'forecastEvidenceCategoryBeforeOutcome',
  'decisionRecommendationBeforeOutcome',
  'stageBeforeOutcome',
  'storageMode',
  'opportunity_outcomes',
  'createOpportunityOutcomeFromOpportunity',
  'opportunityOutcomeToOpportunityStatus',
]) assert.ok(opportunityStore.includes(marker), `Outcome store missing ${marker}`);

const opportunityUi = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
for (const marker of [
  'Record win/loss/delay retro',
  'Why did this happen?',
  'Which stakeholder mattered',
  'Which objection mattered?',
  'What evidence was missing?',
  'What should I do differently next time?',
  'Previous forecast snapshot',
]) assert.ok(opportunityUi.includes(marker), `Opportunity outcome UI missing ${marker}`);

const pipelineUi = readFileSync('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx', 'utf8');
assert.ok(pipelineUi.includes('Outcome learning risk signal'));
assert.ok(pipelineUi.includes('Record outcome retro'));

const todayUi = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
assert.ok(todayUi.includes('Personal learning from outcomes'));

const weeklyBrief = readFileSync('src/features/reviews/SalesReviewsPage.tsx', 'utf8');
assert.ok(weeklyBrief.includes('Personal learning from outcomes'));
assert.ok(weeklyBrief.includes('Learning will improve after more closed outcomes') || weeklyBrief.includes('lowDataMessage'));

const playbook = readFileSync('src/utils/salesPlaybook.ts', 'utf8');
assert.ok(playbook.includes('buildOutcomeLearningPatterns'));
assert.ok(playbook.includes('analyzePersonalSalesLearning'));

const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 16, 'A new CRM navigation item was added.');

console.log('Win/loss closed-loop learning regression verified.');
