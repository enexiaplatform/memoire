import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

// The public demo is gone. It handed any visitor a fully populated sample
// workspace - a whole company's accounts, deals, orders and payment terms - and
// taught the wrong first move: browsing somebody else's data instead of
// capturing your own. The try-before-you-buy path is the trial on real work.
//
// What this file still guards is the half that mattered: the public positioning
// copy, and the in-app proof path that the demo used to walk people through.
const landing = read('src/pages/LandingPage.tsx');
const useCases = read('src/features/useCases/UseCasesPage.tsx');
const demoJourney = read('src/utils/demoJourney.ts');
const checklist = read('src/utils/trialActivationChecklist.ts');
const pipelineCenter = read('src/utils/pipelineDefenseCenter.ts');
const opportunityMapper = read('src/utils/opportunityToPipelineBrief.ts');
const sampleData = read('src/utils/sampleData.ts');
const sidebar = read('src/components/layout/Sidebar.tsx');

for (const marker of [
  'Personal Commercial Control Tower',
  'Never enter a pipeline review unprepared',
  'works beside your CRM',
  'messy notes and emails',
  'manager-ready answers',
  'defend, rescue, or downgrade',
]) {
  assert.ok(`${landing}\n${useCases}`.includes(marker), `Public positioning missing ${marker}`);
}

for (const forbidden of [
  'CRM replacement',
  'manage all your customer data',
  'full revenue platform',
]) {
  assert.equal(`${landing}\n${useCases}`.includes(forbidden), false, `Public copy still contains forbidden claim: ${forbidden}`);
}

// The demo guide's talk-track markers went with the page. What replaces them is
// the Use Cases page: the same job of showing a visitor which problem this
// solves, without loading a sample company into their browser to do it.
for (const marker of [
  'Use cases',
  'B2B sellers who answer for their own pipeline',
  'Founder-led sellers, consultants and agency owners',
  'Trading, distribution and supply',
  'Long-cycle sales with procurement and a committee',
  'Not what Memoire is for',
]) {
  assert.ok(useCases.includes(marker), `Use cases page missing ${marker}`);
}

// No public route may hand out a populated sample workspace again.
for (const file of ['src/pages/LandingPage.tsx', 'src/features/pricing/PricingPage.tsx', 'src/components/marketing/MarketingNav.tsx']) {
  // Matches a routed link only, so prose about the removed demo is fine.
  assert.equal(
    /to="\/demo"|href="\/demo"/.test(read(file)),
    false,
    `${file} still links to the removed public demo`,
  );
}

// The demo path, and the sentence that names it.
//
// The sentence used to be read out of `OnboardingModal.tsx`, which was deleted
// on 2026-08-14 as dead code - it mounted inactive and had never been shown to
// a new account. It is now `DEMO_JOURNEY_PATH_SUMMARY`, declared beside the
// steps it describes and rendered on the demo card, so this check reads one
// file instead of two and the string has a reader rather than only a test.
//
// The last two steps changed on 2026-09-16, when the Pipeline Defense brief was
// removed: both of them ended on that page, so a sandbox opened after the
// removal could have reached two of four and stopped. The path now ends where
// the product's own week ends - a promise recorded on the Plan, a week closed
// on Review - and every step is completed by doing the thing rather than by
// visiting a page.
for (const marker of [
  'review-today',
  'paste-evidence',
  'record-the-week',
  'finish-review',
  'Today - Capture - Plan - Review',
]) {
  assert.ok(demoJourney.includes(marker), `Demo path missing ${marker}`);
}
// Every step must be completable, which means something in the app has to mark
// it. The two that went dark did so because their only emitters lived on the
// deleted page and nobody noticed the card could no longer finish.
for (const [stepId, file] of [
  ['review-today', 'src/features/dashboard/DashboardPage.tsx'],
  ['paste-evidence', 'src/features/dailyCapture/DailyCapturePage.tsx'],
  ['record-the-week', 'src/features/plan/WeeklyPlanPage.tsx'],
  ['finish-review', 'src/features/reviews/WeeklyCommitmentPanel.tsx'],
]) {
  assert.ok(
    read(file).includes(`markDemoJourneyStepComplete('${stepId}'`),
    `demo step ${stepId} has no emitter in ${file} - the sandbox could never finish it`,
  );
}
assert.ok(
  read('src/components/demo/DemoJourneyCard.tsx').includes('DEMO_JOURNEY_PATH_SUMMARY'),
  'the demo path summary must be shown to the person in the demo, not just held for this contract',
);

assert.ok(checklist.indexOf('Capture first evidence') < checklist.indexOf('Review Today command center'), 'Onboarding checklist must point to Capture before Today');
assert.equal(checklist.includes('Prepare Pipeline Defense Brief'), false, 'the retired brief must not come back as an onboarding step');
assert.equal(checklist.includes('Open Assets'), false, 'First-run checklist should not push starter assets before proof path');
assert.equal(checklist.includes('Open Opportunities'), false, 'First-run checklist should not push CRM-like opportunity setup before proof path');

const sampleOpportunityCount = (sampleData.match(/sampleOpportunity\(\{/g) || []).length;
const sampleAccountCount = (sampleData.match(/sampleAccount\(\{/g) || []).length;
assert.equal(sampleOpportunityCount >= 3 && sampleOpportunityCount <= 7, true, 'Demo sample data should have 3-5 active opportunities plus at most one won and one lost outcome');
assert.ok(sampleData.includes("decisionRecommendation: 'Defend'"), 'Demo needs a defendable deal');
assert.ok(sampleData.includes("decisionRecommendation: 'Rescue'"), 'Demo needs a rescue deal');
assert.ok(sampleData.includes("status: 'Won'"), 'Demo needs one won outcome so win/loss review surfaces have data');
assert.ok(sampleData.includes("status: 'Lost'"), 'Demo needs one lost outcome so win/loss review surfaces have data');
assert.ok(sampleData.includes("decisionRecommendation: 'Downgrade'"), 'Demo needs a downgrade/de-risk candidate');
assert.ok(/budget owner|Economic Buyer|procurement|decision committee|Champion/i.test(sampleData), 'Demo needs missing MEDDIC evidence');
assert.ok(sampleData.includes('sampleEmailThreadActivity') && sampleData.includes("sourceType: 'pasted-email'") && sampleData.includes('demo-pasted-email'), 'Demo needs a pasted email/thread example');
assert.ok((sampleData.match(/sampleActionOutcome\(\{/g) || []).length >= 1, 'Demo needs outcome learning examples');
assert.equal(sampleAccountCount <= 5, true, 'Demo should not contain large imported-only account noise');
assert.equal(sampleData.includes('imported-only'), false, 'Default demo should not include imported-only account noise');
// The demo used to seed a Pipeline Defense brief over the first five deals.
// That surface is gone; what the brief said about each deal - defend, rescue,
// downgrade, missing evidence - is a field on the deal itself and is asserted
// above, so the sandbox still shows all four states without a document.
assert.equal(sampleData.includes('generatePipelineDefenseBriefFromOpportunities'), false, 'the demo must not seed a brief for a surface that no longer exists');
assert.ok(sampleData.includes('actionOutcomes'), 'Demo needs outcome learning inputs');

for (const marker of [
  'I can defend this deal',
  'I can rescue this deal only if',
  'I should downgrade or de-risk',
  'I do not have enough evidence to defend',
]) {
  assert.ok(`${pipelineCenter}\n${opportunityMapper}`.includes(marker), `Manager-ready copy missing ${marker}`);
}

// Navigation is owned by src/config/featureRegistry.ts and enforced by
// scripts/verify-navigation-contract.mjs. This check only guards the boundary
// that matters here: the rail must not hard-code its own destinations, because
// that is how a seventh one used to appear without anyone deciding to add it.
assert.ok(sidebar.includes("from '../../config/featureRegistry'"), 'Sidebar must render navigation from the feature registry');
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 0, 'A navigation item was hard-coded into the Sidebar instead of declared in the feature registry.');

console.log('Product positioning and demo proof path regression verified.');
