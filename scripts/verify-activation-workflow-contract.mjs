import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return readFileSync(resolve(root, file), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function requireIncludes(text, marker, label) {
  if (!text.includes(marker)) fail(label);
}

function requireExcludes(text, marker, label) {
  if (text.includes(marker)) fail(label);
}

// Today is the activation surface. The trial checklist, the "latest saved
// review pack" card and the CSV/demo triage that used to live beside it were
// four more onboarding mechanisms competing with the First Week Path; the path
// replaced all of them, so this contract follows activation to where it went.
const dashboard = read('src/features/dashboard/DashboardPage.tsx');
for (const marker of [
  'hasLocalSampleData',
  'buildFirstWeekPath',
  '<FirstWeekPathStrip',
  'Capture your first activity',
  'See it working with demo data',
  'Have a pipeline already? Import a CSV',
]) {
  requireIncludes(dashboard, marker, `Today activation surface missing marker: ${marker}`);
}
for (const retired of ['Trial activation checklist', 'Latest saved review pack', 'Open Latest Review Pack']) {
  if (dashboard.includes(retired)) {
    fail(`a retired activation mechanism is back on Today: ${retired}`);
  }
}

const opportunities = read('src/features/opportunities/OpportunitiesPage.tsx');
for (const marker of [
  'const [searchParams, setSearchParams] = useSearchParams();',
  "searchParams.get('import') === 'csv'",
  'openCsvImport();',
  "searchParams.get('new') === '1'",
  // The call gained a seed argument when the coverage matrix started linking
  // here: an empty customer x line square opens this form with both already
  // filled in. The marker pins the new shape and the two params it carries, so
  // the Vault's only call to action cannot be broken from this side without
  // the contract saying so.
  'openAddPanel({',
  "accountName: searchParams.get('account') || undefined,",
  "brand: searchParams.get('brand') || undefined,",
  'setSearchParams({}, { replace: true });',
  'markTrialActivationChecklistItemComplete(\'load-demo-or-import-csv\')',
]) {
  requireIncludes(opportunities, marker, `opportunities activation entry missing marker: ${marker}`);
}

// Two of this checklist's six steps ended on the Pipeline Defense brief, and
// both went with it on 2026-09-16. A step nobody can complete is worse than a
// missing one - it holds the checklist at four of six forever - so the
// contract now also states what must not come back.
const trialChecklist = read('src/utils/trialActivationChecklist.ts');
for (const marker of [
  'TRIAL_ACTIVATION_CHECKLIST_KEY',
  "'load-demo-or-import-csv'",
  "'review-opportunity'",
  "'capture-update'",
  "'import-starter-asset-pack'",
  'title: \'Capture first evidence\'',
  'href: \'/app/capture?mode=email\'',
  'title: \'Review Today command center\'',
]) {
  requireIncludes(trialChecklist, marker, `trial activation checklist missing marker: ${marker}`);
}
for (const retired of [
  "'generate-defense-brief'",
  "'copy-manager-summary'",
  '/app/pipeline-defense',
]) {
  requireExcludes(trialChecklist, retired, `the checklist offers a step nobody can finish: ${retired}`);
}

// The activation artifact is gone.
//
// Three surfaces stood here: the Review Pack store, the Pipeline Defense brief
// page that wrote to it, and the direct review-pack route that read one back.
// All three were removed on 2026-09-16. They were not removed on taste: the
// `pipeline_defense_briefs` and `review_packs` tables held zero rows across
// every workspace, and the route had not been opened since 2026-07-27. What
// they were guarding - that a demo record can never reach a live workspace, and
// that a signed-in user finds their own work when they come back - still holds,
// and is pinned against the stores that do hold rows by
// `scripts/verify-data-isolation-contract.mjs` and
// `scripts/verify-sample-live-separation.mjs`.
//
// What activation needs from this file now is that the loop still closes and is
// still measured: confirming the week is the act that ends a review, and it is
// the only emitter of `review_completed`. Without that the admin funnel draws a
// "Ran a review" step that can only read zero, which is the failure this file
// exists to prevent.
const weeklyCommitmentPanel = read('src/features/reviews/WeeklyCommitmentPanel.tsx');
for (const marker of [
  'const confirmWeek = useCallback(',
  "source: sampleDataActive ? 'demo' : 'user'",
  'isSample: sampleDataActive',
  "trackProductEvent('review_completed', sampleDataActive ? 'demo-local' : undefined)",
]) {
  requireIncludes(weeklyCommitmentPanel, marker, `weekly commitment activation flow missing marker: ${marker}`);
}
for (const gone of [
  'src/utils/reviewPacks.ts',
  'src/features/pipeline/PipelineReviewDefenseBriefPage.tsx',
  'src/features/pipeline/PipelineReviewPackPage.tsx',
]) {
  if (existsSync(resolve(root, gone))) {
    fail(`${gone} is back - a saved activation artifact must earn its place with rows, not intent`);
  }
}

const firstRunDoc = read('docs/product/first-run-activation-hardening-2026-06-16.md');
for (const marker of [
  'The intended first activation path is:',
  'Import a CSV, add one opportunity, or open the demo sandbox.',
  'Generate a Pipeline Defense Brief.',
  'Save or copy a review-ready outcome.',
  'Operational proof still depends on the Session 4 two-account QA matrix.',
  '`?import=csv` opens the CSV importer as a one-shot entry point.',
  '`?new=1` opens the add-opportunity panel as a one-shot entry point.',
]) {
  requireIncludes(firstRunDoc, marker, `first-run activation doc missing marker: ${marker}`);
}

const reliabilityDoc = read('docs/product/core-workflow-reliability-pass-2026-06-16.md');
for (const marker of [
  'Import or add pipeline -> create Pipeline Defense Brief -> save Review Pack -> return later and find the Review Pack.',
  'loadReviewPacksForWorkspace(userId, sampleDataActive)',
  'Signed-in non-demo workspace: load and merge cloud Review Packs with safe local fallback.',
  'Dashboard Return Path',
  'Pipeline Defense Return Path',
  'Direct Review Pack Route',
  'Demo Review Pack Cloud Contamination Guard',
  'full cohort workflow still needs a real browser test with a signed-in user',
]) {
  requireIncludes(reliabilityDoc, marker, `core workflow reliability doc missing marker: ${marker}`);
}

const coverageDoc = read('docs/product/activation-workflow-contract-coverage-2026-06-17.md');
for (const marker of [
  'A10 remains open',
  'scripts/verify-activation-workflow-contract.mjs',
  'scripts/verify-cloud-json-runtime-contract.mjs',
  'Runtime Evidence Still Required',
  'Signed-in activation QA',
]) {
  requireIncludes(coverageDoc, marker, `activation coverage doc missing marker: ${marker}`);
}

const cloudRuntimeDoc = read('docs/product/cloud-json-runtime-contract-coverage-2026-06-17.md');
for (const marker of [
  'A10 remains open',
  'Newer local records win',
  'Different-owner local collections are not claimed',
  'npm run verify:cloud-json-runtime',
]) {
  requireIncludes(cloudRuntimeDoc, marker, `cloud JSON runtime coverage doc missing marker: ${marker}`);
}

const packageJson = read('package.json');
requireIncludes(packageJson, '"verify:activation-workflow"', 'package.json missing verify:activation-workflow script');
requireIncludes(packageJson, 'npm run verify:activation-workflow', 'npm run check does not include activation workflow verifier');
requireIncludes(packageJson, '"verify:cloud-json-runtime"', 'package.json missing verify:cloud-json-runtime script');
requireIncludes(packageJson, 'npm run verify:cloud-json-runtime', 'npm run check does not include cloud JSON runtime verifier');

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-activation-workflow-contract.mjs', 'release gate does not reference activation workflow verifier');
requireIncludes(releaseGate, 'scripts/verify-cloud-json-runtime-contract.mjs', 'release gate does not reference cloud JSON runtime verifier');

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
requireIncludes(packet, 'scripts/verify-activation-workflow-contract.mjs', 'cohort packet does not reference activation workflow verifier');
requireIncludes(packet, 'scripts/verify-cloud-json-runtime-contract.mjs', 'cohort packet does not reference cloud JSON runtime verifier');

// The rail no longer discloses progressively. It used to hide a "Review &
// Learn" tier until the first saved brief, which meant the navigation a user
// learned on Monday was not the navigation they had on Friday. Six destinations
// are few enough to show all of them, all the time; what is *gated* now is the
// Playbook and Asset library, and that gate is on real workspace evidence
// rather than on a first-run milestone.
//
// The rail is now rendered from `navigationGroups`, which is assembled in the
// registry from the same primary destinations and global actions - grouped by
// the question each block answers rather than by registry status.
// verify-navigation-contract.mjs pins the membership of that list exactly; what
// matters here is only that nothing is hidden behind a milestone.
const sidebarNav = read('src/components/layout/Sidebar.tsx');
requireIncludes(sidebarNav, 'navigationGroups', 'Sidebar must render the full rail from the registry');
requireExcludes(sidebarNav, 'firstWeek', 'the rail must not gate destinations on a first-run milestone');
for (const retired of ['hasFirstSavedBrief', 'reviewTierUnlocked', 'Review & Learn']) {
  if (sidebarNav.includes(retired)) {
    fail(`progressive disclosure is back in the navigation rail: ${retired}`);
  }
}

const libraryGate = read('src/config/libraryActivation.ts');
requireIncludes(libraryGate, 'MIN_REAL_COMMERCIAL_EVENTS', 'library activation must state its evidence threshold');
requireIncludes(libraryGate, 'decidedOpportunityCount', 'library activation must require a decided opportunity');
requireIncludes(libraryGate, 'repeatedObjectionCount', 'library activation must require a repeated objection');

if (failures.length > 0) {
  console.error('Activation workflow contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Activation workflow contract verification passed.');
