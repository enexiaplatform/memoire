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
assert.ok(centerSource.includes('formatCurrencyAmount'));
assert.ok(centerSource.includes('formatBaseCurrencyAmount'));
assert.ok(centerSource.includes('formatSafeBusinessDate'));

const page = readFileSync('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx', 'utf8');
for (const marker of ['Personal Pipeline Defense OS', 'What can I defend?', 'What must I rescue?', 'What must I downgrade?', 'What evidence is missing?', 'Copy manager brief', 'Pipeline review answer']) {
  assert.ok(page.includes(marker), `Pipeline Defense center missing: ${marker}`);
}

const dashboard = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
for (const marker of ['Forecast-defense readiness', 'Review readiness', 'Defendable deals', 'Rescue deals', 'Downgrade candidates', 'Top 3 missing evidence gaps']) {
  assert.ok(dashboard.includes(marker), `Today defense readiness missing: ${marker}`);
}

const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 18, 'A new CRM navigation item was added.');
assert.equal((sidebar.match(/to: '\/app\/pipeline-defense'/g) || []).length, 1);

console.log('Pipeline Defense center regression verified.');
