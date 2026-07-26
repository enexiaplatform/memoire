import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildManagerReadyDealBrief, buildPipelineDefenseCenter } from '../src/utils/pipelineDefenseCenter.ts';

const deal = (id, overrides = {}) => ({
  id,
  account: 'Pymepharco',
  opportunity: `Opportunity ${id}`,
  pipelineContext: 'Stage: Proposal.',
  dealTruth: 'Customer is reviewing the proposal.',
  riskType: [],
  evidence: ['Customer confirmed proposal review.'],
  missingContext: [],
  objectionDebt: { objection: 'Commercial terms', evidence: 'Customer note', requiredAction: 'Confirm terms', owner: 'Sales owner', status: 'Open' },
  forecastEvidenceCategory: 'Defensible',
  recommendedAction: 'Confirm decision with the customer.',
  pipelineReviewAnswer: 'I can defend the current position with customer-confirmed evidence.',
  decisionRecommendation: 'Defend',
  estimatedValue: 300_000,
  currency: 'SGD',
  nextActionDate: '2026-06-30',
  lastSignalDate: '2026-06-20',
  ...overrides,
});

const deals = [
  deal('defend'),
  deal('rescue', { decisionRecommendation: 'Rescue', forecastEvidenceCategory: 'Weak but recoverable' }),
  deal('downgrade', { decisionRecommendation: 'Downgrade', forecastEvidenceCategory: 'Unsupported' }),
  deal('missing', { decisionRecommendation: 'Monitor', missingContext: ['Economic buyer'] }),
  deal('silent', { decisionRecommendation: 'Monitor', lastSignalDate: '2026-04-01' }),
];
const center = buildPipelineDefenseCenter(deals, '2026-06-21');
assert.deepEqual(center.groups.map((group) => group.category), [
  'Defend now', 'Rescue before review', 'Downgrade / de-risk', 'Missing evidence', 'No recent signal',
]);
assert.equal(center.groups.reduce((total, group) => total + group.items.length, 0), deals.length);
assert.equal(new Set(center.groups.flatMap((group) => group.items.map((item) => item.deal.id))).size, deals.length);
assert.equal(center.defendableDeals, 1);
assert.equal(center.rescueDeals, 1);
assert.equal(center.downgradeCandidates, 1);

const managerBrief = buildManagerReadyDealBrief(deals[0], '2026-06-21');
for (const label of ['Forecast position:', 'Current decision:', 'Evidence supporting forecast:', 'Missing MEDDIC context:', 'Objection debt:', 'Next action:', 'Due date:', 'Pipeline review answer:']) {
  assert.ok(managerBrief.copyText.includes(label), `Manager brief missing ${label}`);
}
assert.ok(managerBrief.moneyLabel.includes('300,000 SGD'));
assert.ok(managerBrief.moneyLabel.includes('Base: VND'));
assert.ok(managerBrief.dueDateLabel.includes('Jun 30, 2026'));

const guarded = buildManagerReadyDealBrief(deal('guarded', {
  account: '', opportunity: '', estimatedValue: null, currency: '', nextActionDate: '', evidence: [], pipelineReviewAnswer: '',
}), '2026-06-21');
assert.equal(guarded.account, 'Needs confirmation');
assert.equal(guarded.opportunity, 'Needs confirmation');
assert.ok(guarded.moneyLabel.includes('Missing evidence'));
assert.ok(guarded.copyText.includes('Data quality: Needs confirmation'));

const centerSource = readFileSync('src/utils/pipelineDefenseCenter.ts', 'utf8');
// Money goes through the one shared formatter (formatMoneyWithBase), which owns
// the item-currency + reporting-currency composition. This used to assert the
// hand-rolled pair here, which is how a mislabelled conversion could diverge
// between surfaces.
assert.ok(centerSource.includes('formatMoneyWithBase'));
assert.ok(centerSource.includes('formatSafeBusinessDate'));

const page = readFileSync('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx', 'utf8');
for (const marker of ['Personal Commercial Control Tower', 'What can I defend?', 'What must I rescue?', 'What must I downgrade?', 'What evidence is missing?', 'Copy manager brief', 'Pipeline review answer']) {
  assert.ok(page.includes(marker), `Pipeline Defense center missing: ${marker}`);
}

const dashboard = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
for (const marker of ['Forecast-defense readiness', 'Review readiness', 'Defendable deals', 'Rescue deals', 'Downgrade candidates', 'Top 3 missing evidence gaps']) {
  assert.ok(dashboard.includes(marker), `Today defense readiness missing: ${marker}`);
}

const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
// Navigation is owned by src/config/featureRegistry.ts and enforced by
// scripts/verify-navigation-contract.mjs. This check only guards the boundary
// that matters here: the rail must not hard-code its own destinations, because
// that is how a seventh one used to appear without anyone deciding to add it.
assert.ok(sidebar.includes("from '../../config/featureRegistry'"), 'Sidebar must render navigation from the feature registry');
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 0, 'A navigation item was hard-coded into the Sidebar instead of declared in the feature registry.');
// Pipeline Defense is an artifact produced by Review, not a destination. It is
// reachable from the Review > Pipeline Defense tab and by deep link; a separate
// rail entry was what made it read as a second product with its own mental
// model on top of the review the seller was already doing.
assert.equal(
  (sidebar.match(/pipeline-defense/g) || []).length,
  0,
  'Pipeline Defense must not be a navigation destination',
);
const reviewPage = readFileSync('src/features/reviews/SalesReviewsPage.tsx', 'utf8');
for (const marker of [
  'PipelineDefenseArtifactSection',
  'Generate / view Pipeline Defense Brief',
  'to="/app/pipeline-defense"',
]) {
  assert.ok(reviewPage.includes(marker), `Review must own the Pipeline Defense artifact: ${marker}`);
}
const appSource = readFileSync('src/App.tsx', 'utf8');
assert.ok(
  appSource.includes('<Route path="pipeline-defense" element={<PipelineReviewDefenseBriefPage />} />'),
  'the Pipeline Defense route must stay live for deep links and shared briefs',
);

console.log('Pipeline Defense center regression verified: an artifact of Review, not a destination.');
