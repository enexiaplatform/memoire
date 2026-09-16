// Fixtures below are denominated in VND; see the helper for why this is
// pinned rather than rewritten.
import './lib/pin-reporting-currency.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
// The brief carries the deal's own currency and the converted figure beside
// it. The "(Base: VND)" wrapper is gone - the ISO code already says it - so
// this pins the shape that matters: two figures, the second one in VND.
assert.match(managerBrief.moneyLabel, /300,000 SGD · [\d,.]+ VND$/);
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

// The engine outlived its page.
//
// `buildPipelineDefenseCenter` answers four questions - what can I defend, what
// must I rescue, what must I downgrade, what evidence is missing - and until
// 2026-09-16 those answers were drawn twice: once on Today, and once on a
// Pipeline Defense brief you had to write and keep current. No workspace ever
// saved a brief, and the route had not been opened since 2026-07-27, so the
// document went and the engine stayed. These assertions now pin the two places
// the answers are actually read.

// 1. Today shows the readiness figures, which is where the engine has always
// had a reader with no authoring step in front of it.
const dashboard = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
for (const marker of ['Forecast-defense readiness', 'Review readiness', 'Defendable deals', 'Rescue deals', 'Downgrade candidates', 'Top 3 missing evidence gaps']) {
  assert.ok(dashboard.includes(marker), `Today defense readiness missing: ${marker}`);
}

// 2. The per-deal reading is on the deal. A deal's own drawer runs the same
// rules and says what it would suggest and why, so the operator never has to
// open a second surface to find out whether this one is defensible.
const opportunities = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
for (const marker of ['analyzePipelineDefenseDeal(deal)', 'mapOpportunitiesToPipelineDefenseDeals']) {
  assert.ok(opportunities.includes(marker), `the deal record must read the defense rules: ${marker}`);
}

// 3. The artifact layer stays gone. Not a taste call: it was a document that
// restated records the operator had already written, and then asked them to
// keep the restatement current.
for (const gone of [
  'src/features/pipeline/PipelineReviewDefenseBriefPage.tsx',
  'src/features/pipeline/PipelineReviewPackPage.tsx',
  'src/features/pipeline/SharedBriefPage.tsx',
  'src/features/pipeline/PipelineDefensePrintableBrief.tsx',
]) {
  assert.equal(existsSync(gone), false, `${gone} is back - the brief was removed for having no reader`);
}

// 4. The rail never carried it and still must not.
const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
// Navigation is owned by src/config/featureRegistry.ts and enforced by
// scripts/verify-navigation-contract.mjs. This check only guards the boundary
// that matters here: the rail must not hard-code its own destinations, because
// that is how a seventh one used to appear without anyone deciding to add it.
assert.ok(sidebar.includes("from '../../config/featureRegistry'"), 'Sidebar must render navigation from the feature registry');
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 0, 'A navigation item was hard-coded into the Sidebar instead of declared in the feature registry.');
assert.equal(
  (sidebar.match(/pipeline-defense/g) || []).length,
  0,
  'Pipeline Defense must not be a navigation destination',
);

// 5. Old links still land somewhere true rather than on a 404. A deep link into
// a deal keeps its deal.
const appSource = readFileSync('src/App.tsx', 'utf8');
assert.ok(
  appSource.includes('<Route path="pipeline-defense" element={<LegacyPipelineDefenseRedirect />} />'),
  'the retired Pipeline Defense route must redirect, not disappear',
);

console.log('Pipeline Defense rules verified: an engine behind Today and the deal, with no artifact to maintain.');
