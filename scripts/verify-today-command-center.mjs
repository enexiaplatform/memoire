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
assert.ok(app.includes('<Route index element={<Navigate to="/app/today" replace />} />'));
// Today is the action surface and the landing. The old Dashboard page was the
// reporting rival to it and is gone; what survives of it is Review > Analytics
// and the read-only Business lens, which took the name "Dashboard" in the rail
// on 2026-08-02. The old URL therefore lands on that lens - what matters here
// is that it still resolves, and that it does not land back on Today as a
// second reporting surface competing with the action list.
assert.ok(app.includes('<Route path="dashboard" element={<LegacyRedirect to="/app/business" />} />'));

const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
// Navigation is owned by src/config/featureRegistry.ts and enforced by
// scripts/verify-navigation-contract.mjs. This check only guards the boundary
// that matters here: the rail must not hard-code its own destinations, because
// that is how a seventh one used to appear without anyone deciding to add it.
assert.ok(sidebar.includes("from '../../config/featureRegistry'"), 'Sidebar must render navigation from the feature registry');
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 0, 'A navigation item was hard-coded into the Sidebar instead of declared in the feature registry.');

const todayPage = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
// The named sections all still exist on Today.
for (const section of ['Forecast-defense readiness', 'What Memoire would start with', 'Pipeline Review Readiness', 'Commercial Risk', 'Capture Inbox']) {
  assert.ok(todayPage.includes(section), `Today missing ${section}`);
}
// Altitude: the action tier (cockpit -> brief -> commitments -> top 3 ->
// watch-list) renders first, then the fold, then the reference scoreboards.
// Asserted on the JSX usage sites (not display text, which also appears in the
// function definitions) so the order reflects what actually renders.
const renderOrder = [
  '<BusinessCockpitStrip',
  '<MorningBriefCard',
  '<CommitmentLedgerPanel',
  '<TodayTopThreeActions',
  '<ProactiveNudgesPanel',
  'The rest of the watch-list',
  '<CommercialRiskPanel',
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

// Step 3 is one panel. It used to be four - the nudge watch-list, "Going
// silent", the commitment ledger and a grid of quietest threads - all derived
// from the same records, three of them answering "what has gone quiet". A
// workspace with one struggling customer printed that customer four times under
// a single heading, which is the specific thing operators call "over and busy".
for (const secondReading of ['<CommercialRiskPanel', '<ThreadQuickLook']) {
  assert.ok(
    todayPage.indexOf(secondReading) > todayPage.indexOf('The rest of the watch-list'),
    `${secondReading} is a second reading of the watch-list and must sit inside the fold`,
  );
}

// The measured-history panel folds into the second details block, below the
// action tier - not a first-screen section.
assert.ok(
  todayPage.indexOf('<FollowUpImpactPanel') > todayPage.indexOf('Everything else Memoire tracks'),
  'FollowUpImpactPanel must fold into the second drawer',
);

const model = readFileSync('src/utils/todayCommandCenter.ts', 'utf8');
// Money goes through the shared formatMoneyWithBase (which owns the item +
// reporting-currency composition), not a hand-rolled pair per surface.
for (const helper of ['formatSafeBusinessDate', 'formatMoneyWithBase', 'isBusinessDateOverdue']) {
  assert.ok(model.includes(helper), `Today command model missing ${helper}`);
}
// Every other surface defers the priority order to Today in its own copy, so
// nothing else reads as a second place to decide what to do now.
for (const [file, marker] of [
  ['src/features/revenue/RevenueViewPage.tsx', 'Today owns the priority order'],
  ['src/features/reviews/SalesReviewsPage.tsx', 'Today remains the daily command center'],
  ['src/features/operatingSystem/OperatingSystemPage.tsx', 'Today stays the'],
  ['src/features/reviews/ReviewAnalyticsSection.tsx', 'For what to do next, use Today'],
]) assert.ok(readFileSync(file, 'utf8').includes(marker), `${file} still competes with Today.`);

console.log('One Today command center regression verified.');
