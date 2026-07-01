import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const landing = read('src/pages/LandingPage.tsx');
const demoEntry = read('src/features/demo/DemoEntryPage.tsx');
const demoGuide = read('src/features/demo/DemoGuidePage.tsx');
const demoJourney = read('src/utils/demoJourney.ts');
const onboarding = read('src/components/layout/OnboardingModal.tsx');
const checklist = read('src/utils/trialActivationChecklist.ts');
const pipelineCenter = read('src/utils/pipelineDefenseCenter.ts');
const opportunityMapper = read('src/utils/opportunityToPipelineBrief.ts');
const sampleData = read('src/utils/sampleData.ts');
const sidebar = read('src/components/layout/Sidebar.tsx');

for (const marker of [
  'Personal Pipeline Defense OS',
  'Never enter a pipeline review unprepared',
  'works beside your CRM',
  'messy notes and emails',
  'manager-ready answers',
  'defend, rescue, or downgrade',
]) {
  assert.ok(`${landing}\n${demoEntry}\n${demoGuide}`.includes(marker), `Public/demo positioning missing ${marker}`);
}

for (const forbidden of [
  'CRM replacement',
  'manage all your customer data',
  'full revenue platform',
]) {
  assert.equal(`${landing}\n${demoEntry}\n${demoGuide}`.includes(forbidden), false, `Public/demo copy still contains forbidden claim: ${forbidden}`);
}

for (const marker of [
  'What to show first',
  'What pain this proves',
  'Exact talk track',
  'What not to show',
  'Demo success criteria',
  'Open Today',
  'Top 3 actions',
  'Proactive Nudges',
  'Paste Email / Thread',
  'Copy manager brief',
  'MEDDIC Stakeholder Map',
  'Outcome Learning',
]) {
  assert.ok(demoGuide.includes(marker), `Demo guide missing ${marker}`);
}

for (const marker of [
  'review-today',
  'paste-evidence',
  'open-defense',
  'finish-review-pack',
  'Today - Capture - Pipeline Defense',
]) {
  assert.ok(`${demoJourney}\n${onboarding}`.includes(marker), `Demo/onboarding path missing ${marker}`);
}

assert.ok(checklist.indexOf('Capture first evidence') < checklist.indexOf('Review Today command center'), 'Onboarding checklist must point to Capture before Today');
assert.ok(checklist.indexOf('Review Today command center') < checklist.indexOf('Prepare Pipeline Defense Brief'), 'Onboarding checklist must point to Today before Pipeline Defense');
assert.equal(checklist.includes('Open Assets'), false, 'First-run checklist should not push starter assets before proof path');
assert.equal(checklist.includes('Open Opportunities'), false, 'First-run checklist should not push CRM-like opportunity setup before proof path');

const sampleOpportunityCount = (sampleData.match(/sampleOpportunity\(\{/g) || []).length;
const sampleAccountCount = (sampleData.match(/sampleAccount\(\{/g) || []).length;
assert.equal(sampleOpportunityCount >= 3 && sampleOpportunityCount <= 5, true, 'Demo sample data should have 3-5 meaningful opportunities');
assert.ok(sampleData.includes("decisionRecommendation: 'Defend'"), 'Demo needs a defendable deal');
assert.ok(sampleData.includes("decisionRecommendation: 'Rescue'"), 'Demo needs a rescue deal');
assert.ok(sampleData.includes("decisionRecommendation: 'Downgrade'"), 'Demo needs a downgrade/de-risk candidate');
assert.ok(/budget owner|Economic Buyer|procurement|decision committee|Champion/i.test(sampleData), 'Demo needs missing MEDDIC evidence');
assert.ok(sampleData.includes('sampleEmailThreadActivity') && sampleData.includes("sourceType: 'pasted-email'") && sampleData.includes('demo-pasted-email'), 'Demo needs a pasted email/thread example');
assert.ok((sampleData.match(/sampleActionOutcome\(\{/g) || []).length >= 1, 'Demo needs outcome learning examples');
assert.equal(sampleAccountCount <= 5, true, 'Demo should not contain large imported-only account noise');
assert.equal(sampleData.includes('imported-only'), false, 'Default demo should not include imported-only account noise');
assert.ok(sampleData.includes('generatePipelineDefenseBriefFromOpportunities(opportunities.slice(0, 5)'), 'Demo brief should be generated from the focused 3-5 opportunity set');
assert.ok(sampleData.includes('actionOutcomes'), 'Demo brief should include outcome learning inputs');

for (const marker of [
  'I can defend this deal',
  'I can rescue this deal only if',
  'I should downgrade or de-risk',
  'I do not have enough evidence to defend',
]) {
  assert.ok(`${pipelineCenter}\n${opportunityMapper}`.includes(marker), `Manager-ready copy missing ${marker}`);
}

assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 18, 'A new CRM navigation item was added.');

console.log('Product positioning and demo proof path regression verified.');
