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
for (const panel of ['<StakeholderMap', '<MeddicLitePanel', '<OpportunityCommercialPanel', '<LinkedActivitiesTimeline']) {
  const panelAt = page.indexOf(panel);
  assert.ok(panelAt > analysisAt, `${panel} must live inside the folded analysis, after the summary`);
}

// 3b. The close-out is the one exception, and only while a deal is being closed.
//
// It was folded away with the rest, which produced the worst outcome altitude
// can produce: picking Won or Lost failed the save with a message pointing at a
// form inside a section that was shut, so the deal could not be closed at all
// and nothing on screen said how.
//
// Being outside the fold turned out not to be enough on its own. It first went
// beside Status, near the top of a drawer four screens tall, while the save
// that demands it prints its refusal at the very bottom - and the founder
// reported the form as missing a second time, from the bottom of the drawer,
// looking at the message that named it. So the requirement is stronger than
// "not folded": the closing copy renders **between the fold and the save**, so
// the demand and the answer occupy one viewport. The folded copy is still
// skipped rather than rendered twice - two of the same form on one drawer is
// two drafts of the same reason.
{
  const closingAt = page.indexOf('const closingThisDeal');
  assert.ok(closingAt > 0, 'the drawer must know when a deal is being closed');
  assert.match(
    page,
    /form\.status === 'Won' \|\| form\.status === 'Lost'/,
    'the close-out surfaces on the status the operator picked, not on a saved record',
  );

  const foldEnd = page.indexOf('</details>', analysisAt);
  const saveAt = page.indexOf("'Save Opportunity'");
  assert.ok(foldEnd > analysisAt, 'the deep analysis fold must close');
  assert.ok(saveAt > foldEnd, 'the save button sits after the fold');

  const retroRenders = page.split('<OpportunityOutcomeRetroPanel').length - 1;
  assert.equal(retroRenders, 2, 'exactly two render sites: one beside the save while closing, one inside the fold otherwise');

  const foldedCopy = page.indexOf('<OpportunityOutcomeRetroPanel');
  const closingCopy = page.lastIndexOf('<OpportunityOutcomeRetroPanel');
  assert.ok(foldedCopy > analysisAt && foldedCopy < foldEnd, 'the filed-away copy stays inside the fold');
  assert.ok(
    closingCopy > foldEnd && closingCopy < saveAt,
    'the closing copy renders outside the fold and above the save it is a condition of',
  );
  assert.match(page, /currentOpportunity && !closingThisDeal && \(/, 'the folded copy is skipped while the close-out is open');
}

// 4. The head shows the money-spine trio (money / risk / blocker) and next commitment.
for (const marker of ['snapshot.moneyStatus', 'snapshot.riskStatus', 'snapshot.blocker', 'snapshot.nextCommitment']) {
  assert.ok(page.includes(marker), `the head must surface ${marker}`);
}

console.log('Deal drawer altitude contract verified.');
