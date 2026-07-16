import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The first real user opened a deal and faced a twenty-field CRM form plus nine
// stacked analysis panels, with no idea what to do first. The drawer now opens
// on a "do this first" head from the commercial-journey read-model, and folds
// the deep analysis away - the same altitude treatment Today got (S3).

const page = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');

// 1. The head is rendered in edit mode, from the shared journey snapshot.
assert.ok(page.includes('<DealFirstThingHead'), 'the drawer must render the first-thing head');
assert.ok(page.includes('function DealFirstThingHead'), 'the head component must exist');
assert.ok(page.includes('buildCommercialJourneySnapshot({'), 'the head must read the journey snapshot');
assert.ok(/Do this first/.test(page), 'the head leads with the first action');

// 2. The head sits ABOVE the CRM form and the deep analysis.
const headAt = page.indexOf('<DealFirstThingHead');
const formAt = page.indexOf('value={form.accountName}');
const analysisAt = page.indexOf('Full deal analysis');
assert.ok(headAt > 0 && formAt > headAt, 'the head must render before the CRM form fields');
assert.ok(analysisAt > headAt, 'the head must render before the deep analysis');

// 3. The nine deep panels are folded into one collapsible, not stacked open.
assert.ok(page.includes('Full deal analysis'), 'the deep panels must collapse behind a summary');
for (const panel of ['<StakeholderMap', '<MeddicLitePanel', '<OpportunityCommercialPanel', '<OpportunityOutcomeRetroPanel', '<LinkedActivitiesTimeline']) {
  const panelAt = page.indexOf(panel);
  assert.ok(panelAt > analysisAt, `${panel} must live inside the folded analysis, after the summary`);
}

// 4. The head shows the money-spine trio (money / risk / blocker) and next commitment.
for (const marker of ['snapshot.moneyStatus', 'snapshot.riskStatus', 'snapshot.blocker', 'snapshot.nextCommitment']) {
  assert.ok(page.includes(marker), `the head must surface ${marker}`);
}

console.log('Deal drawer altitude contract verified.');
