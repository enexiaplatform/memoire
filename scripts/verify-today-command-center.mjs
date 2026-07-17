import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildUnifiedTodayCommandCenter } from '../src/utils/todayCommandCenter.ts';
import { buildPipelineDefenseCenter } from '../src/utils/pipelineDefenseCenter.ts';

const now = '2026-06-21';
const brief = {
  id: 'brief-1', title: 'Review', weekLabel: 'Week', salesOwner: 'Seller', scope: 'Active pipeline',
  createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-21T00:00:00.000Z', storageMode: 'local',
  deals: [{
    id: 'deal-1', account: 'Pymepharco', opportunity: 'DCM comparison', pipelineContext: 'Stage: Proposal.',
    dealTruth: 'Proposal is under review.', riskType: ['Decision timeline'], evidence: ['Customer requested comparison.'],
    missingContext: ['Economic buyer'], objectionDebt: { objection: 'Technical comparison', evidence: 'Meeting note', requiredAction: 'Send proof', owner: 'Seller', status: 'Open' },
    forecastEvidenceCategory: 'Weak but recoverable', recommendedAction: 'Send DCM comparison quote',
    pipelineReviewAnswer: 'This deal needs rescue before review.', decisionRecommendation: 'Rescue',
    estimatedValue: 300_000, currency: 'SGD', nextActionDate: '2026-06-20', lastSignalDate: '2026-06-18',
  }],
};
const opportunity = {
  id: 'opp-1', accountName: 'DHG Pharma', opportunityName: 'Validation project', stage: 'Proposal', estimatedValue: 100_000,
  currency: 'USD', expectedClosePeriod: 'Q3', productOrSolution: 'Validation', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: 'Confirm validation review', nextActionDate: '2026-06-19', evidence: 'Customer reviewing', missingContext: '',
  objectionDebt: '', forecastEvidenceCategory: 'Weak but recoverable', decisionRecommendation: 'Monitor', status: 'Active',
  createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z', storageMode: 'local',
};
const activity = {
  id: 'activity-1', accountName: '', opportunityName: '', contactName: '', stakeholderName: '', stakeholderRole: '', competitors: [], buyingSignals: [], risks: [], timelineSignals: [], nextActions: [],
  activityType: 'Customer meeting', summary: 'Met a customer; entity link needs review.', nextAction: '', dueDate: '', tags: ['local-fallback'], rawNote: 'Met customer.', activityDate: '2026-06-20',
  linkedOpportunityId: '', linkedOpportunityName: '', linkedAccountName: '', linkStatus: 'Unlinked', createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z', storageMode: 'local',
};
const revenueAction = {
  id: 'quote-1', accountName: 'DKSH', label: 'Delivery quote', amount: 200_000, currency: 'SGD', baseAmount: 4_000_000_000,
  status: 'Pending delivery', risk: 'Delivery overdue', nextAction: 'Confirm delivery recovery date', dueDate: '2026-06-18', href: '/app/quotes', source: 'Quote',
};

// Pipeline health is measured from the live pipeline by the caller and injected
// - Today no longer scores the latest saved brief. This stands in for what
// DashboardPage passes from buildLivePipelineHealth.
const center = buildUnifiedTodayCommandCenter({
  briefs: [brief], revenueActions: [revenueAction], opportunities: [opportunity], activities: [activity], today: now,
  pipelineHealth: buildPipelineDefenseCenter(brief.deals, now),
});
assert.equal(center.hasMeaningfulData, true);
assert.equal(center.topActions.length, 3);
assert.deepEqual(center.topActions.map((action) => action.source), ['Revenue', 'Opportunity', 'Pipeline Defense']);
assert.equal(center.topActions[0].urgency, 'Critical');
assert.ok(center.topActions[0].dueDateLabel.includes('Jun 18, 2026'));
assert.ok(center.topActions[0].moneyLabel.includes('200,000 SGD'));
assert.ok(center.topActions[0].moneyLabel.includes('Base: VND'));
assert.equal(center.captureInbox[0].accountName, 'Needs confirmation');
assert.equal(center.overdueActions >= 3, true);

const empty = buildUnifiedTodayCommandCenter({ briefs: [], revenueActions: [], opportunities: [], activities: [], today: now });
assert.equal(empty.hasMeaningfulData, false);
assert.equal(empty.topActions.length, 0);

const app = readFileSync('src/App.tsx', 'utf8');
assert.ok(app.includes('<Route path="today" element={<TodayPage />} />'));
// /app/dashboard is the master chart/report view; Today stays the action view.
assert.ok(app.includes('<Route path="dashboard" element={<MasterDashboardPage />} />'));
assert.ok(app.includes('<Route index element={<Navigate to="/app/today" replace />} />'));

const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
// Three tiers mirroring the operating loop: daily loop, then Pipeline & Money,
// then Review & Learn (where Pipeline Defense lives as the review artifact).
const navOrder = ['/app/today', '/app/dashboard', '/app/capture', '/app/activity', '/app/ask', '/app/opportunities', '/app/accounts', '/app/revenue', '/app/weekly-brief', '/app/pipeline-defense'];
navOrder.forEach((route, index) => {
  const location = sidebar.indexOf(`to: '${route}'`);
  assert.ok(location >= 0, `Sidebar missing ${route}`);
  if (index > 0) assert.ok(location > sidebar.indexOf(`to: '${navOrder[index - 1]}'`), `Sidebar order incorrect for ${route}`);
});
// 16 = 5 daily loop + 3 Pipeline & Money + 6 Review & Learn + founder Import Review + Settings.
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 16, 'A new CRM navigation item was added.');

const todayPage = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
// The named sections all still exist on Today.
for (const section of ['Forecast-defense readiness', 'Top 3 Today Actions', 'Pipeline Review Readiness', 'Commercial Risk', 'Capture Inbox']) {
  assert.ok(todayPage.includes(section), `Today missing ${section}`);
}
// Altitude: the action tier (cockpit -> brief -> top 3 -> nudges) renders
// first, then a "Supporting detail" divider, then the reference scoreboards.
// Asserted on the JSX usage sites (not display text, which also appears in the
// function definitions) so the order reflects what actually renders.
const renderOrder = [
  '<BusinessCockpitStrip',
  '<MorningBriefCard',
  '<TodayTopThreeActions',
  '<ProactiveNudgesPanel',
  'Supporting detail',
  '<ForecastDefenseReadiness',
  '<PipelineGlanceSection',
  '<TodayPipelineReadiness',
  '<TodayCommercialRisk',
  '<TodayCaptureInbox',
];
renderOrder.forEach((marker, index) => {
  const at = todayPage.indexOf(marker);
  assert.ok(at >= 0, `Today render missing ${marker}`);
  if (index > 0) assert.ok(at > todayPage.indexOf(renderOrder[index - 1]), `Today render order incorrect at ${marker}`);
});
// The measured-history panel folds into the supporting-execution details block,
// below the action tier - not a first-screen section.
assert.ok(
  todayPage.indexOf('<FollowUpImpactPanel') > todayPage.indexOf('Supporting execution detail'),
  'FollowUpImpactPanel must fold into Supporting execution detail',
);

const model = readFileSync('src/utils/todayCommandCenter.ts', 'utf8');
// Money goes through the shared formatMoneyWithBase (which owns the item +
// reporting-currency composition), not a hand-rolled pair per surface.
for (const helper of ['formatSafeBusinessDate', 'formatMoneyWithBase', 'isBusinessDateOverdue']) {
  assert.ok(model.includes(helper), `Today command model missing ${helper}`);
}
for (const [file, marker] of [
  ['src/features/revenue/RevenueViewPage.tsx', 'Commercial risk detail'],
  ['src/features/reviews/SalesReviewsPage.tsx', 'Weekly Business Review'],
  ['src/features/operatingSystem/OperatingSystemPage.tsx', 'Supporting drill-down'],
]) assert.ok(readFileSync(file, 'utf8').includes(marker), `${file} still competes with Today.`);

console.log('One Today command center regression verified.');
