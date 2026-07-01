import { readFileSync } from 'node:fs';
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

const dashboard = read('src/features/dashboard/DashboardPage.tsx');
for (const marker of [
  'loadReviewPacksForWorkspace',
  'hasLocalSampleData',
  'Import CSV',
  'Try demo first',
  'Add Opportunity',
  'Open Pipeline Defense',
  'Latest saved review pack',
  'Open Latest Review Pack',
  'Trial activation checklist',
  'Start with a CSV import, demo sandbox, or one manual opportunity, then generate a Pipeline Defense Brief.',
]) {
  requireIncludes(dashboard, marker, `dashboard activation surface missing marker: ${marker}`);
}

const opportunities = read('src/features/opportunities/OpportunitiesPage.tsx');
for (const marker of [
  'const [searchParams, setSearchParams] = useSearchParams();',
  "searchParams.get('import') === 'csv'",
  'openCsvImport();',
  "searchParams.get('new') === '1'",
  'openAddPanel();',
  'setSearchParams({}, { replace: true });',
  'markTrialActivationChecklistItemComplete(\'load-demo-or-import-csv\')',
  'markTrialActivationChecklistItemComplete(\'generate-defense-brief\')',
  "trackProductEvent('pipeline_defense_brief_created'",
  'Generate Pipeline Defense Brief',
  'Ready to create a new Pipeline Defense Brief.',
]) {
  requireIncludes(opportunities, marker, `opportunities activation entry missing marker: ${marker}`);
}

const trialChecklist = read('src/utils/trialActivationChecklist.ts');
for (const marker of [
  'TRIAL_ACTIVATION_CHECKLIST_KEY',
  "'load-demo-or-import-csv'",
  "'review-opportunity'",
  "'capture-update'",
  "'import-starter-asset-pack'",
  "'generate-defense-brief'",
  "'copy-manager-summary'",
  'title: \'Capture first evidence\'',
  'href: \'/app/capture?mode=email\'',
  'title: \'Review Today command center\'',
  'title: \'Prepare Pipeline Defense Brief\'',
  'description: \'Open the review artifact and check defend, rescue, downgrade, MEDDIC, and missing evidence.\'',
  'title: \'Copy manager-ready answer\'',
  'href: \'/app/pipeline-defense\'',
]) {
  requireIncludes(trialChecklist, marker, `trial activation checklist missing marker: ${marker}`);
}

const reviewPacks = read('src/utils/reviewPacks.ts');
for (const marker of [
  'export async function loadReviewPacksForUser(userId: string)',
  "loadCloudJsonCollection<ReviewPackSnapshot>('review_packs', userId)",
  "claimLocalCollectionForUser('review_packs', userId) ? local.filter(isUserReviewPack) : []",
  'mergeCloudJsonRecords(recordsToMerge, cloud)',
  'await upsertCloudJsonCollection(\'review_packs\', userId, merged)',
  'export async function loadReviewPacksForWorkspace(userId?: string | null, sampleDataActive = false)',
  'if (!userId || sampleDataActive) return loadReviewPacks();',
  'return await loadReviewPacksForUser(userId);',
  'return loadReviewPacks();',
  'export function saveReviewPack(pack: ReviewPackSnapshot, options: { syncCloud?: boolean } = {})',
  'if (options.syncCloud !== false) deleteCloudJsonRecordForCurrentUser(\'review_packs\', packId);',
  'pack.managerSummary || \'No manager summary captured.\'',
]) {
  requireIncludes(reviewPacks, marker, `review pack store missing activation marker: ${marker}`);
}

const pipelineDefense = read('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx');
for (const marker of [
  'loadReviewPacksForWorkspace(user?.id, sampleDataActive)',
  'const sampleDataActive = hasLocalSampleData();',
  'const cloudSyncReady = Boolean(user && !sampleDataActive',
  "trackProductEvent('pipeline_defense_brief_created', sampleDataActive ? 'demo-local' : 'cloud-browser')",
  "trackProductEvent('pipeline_defense_brief_created', sampleDataActive ? 'demo-local' : 'browser-only')",
  'source: sampleDataActive ? \'demo\' : \'user\'',
  'isSample: sampleDataActive',
  'setReviewPacks(saveReviewPack(pack, { syncCloud: !sampleDataActive }))',
  "setReviewPackMessage(isAuthenticated && !sampleDataActive ? 'Review pack saved and syncing to your workspace.' : 'Review pack saved in this browser.')",
  "trackProductEvent('review_pack_saved', sampleDataActive ? 'demo-local' : isAuthenticated ? 'cloud-browser' : 'browser-only')",
  'setReviewPacks(updateReviewPack(currentWeekReviewPack.id, pack, { syncCloud: !sampleDataActive }))',
  'setReviewPacks(deleteReviewPack(packId, { syncCloud: !sampleDataActive }))',
  'Save Review Pack',
  'Saved Review Packs',
  'to={`/app/pipeline-defense/review-pack/${pack.id}`}',
]) {
  requireIncludes(pipelineDefense, marker, `Pipeline Defense activation flow missing marker: ${marker}`);
}

const reviewPackPage = read('src/features/pipeline/PipelineReviewPackPage.tsx');
for (const marker of [
  'loadReviewPacksForWorkspace(user?.id, hasLocalSampleData())',
  'Checking this browser and your workspace sync.',
  'Review pack not found',
  'This saved snapshot may have been deleted from your workspace.',
  'Copy Manager Summary',
  'Copy Review Pack Markdown',
  "markPipelineReviewHabitStepComplete('copiedManagerSummaryAt')",
  'deleteReviewPack(pack.id, { syncCloud: !sampleDataActive });',
  "navigate('/app/pipeline-defense');",
]) {
  requireIncludes(reviewPackPage, marker, `direct Review Pack page missing activation marker: ${marker}`);
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

if (failures.length > 0) {
  console.error('Activation workflow contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Activation workflow contract verification passed.');
