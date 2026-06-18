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

const appShell = read('src/components/layout/AppShell.tsx');
for (const marker of [
  '<a href="#app-main-content" className="skip-link">',
  'Skip to main content',
  'id="app-main-content"',
  'tabIndex={-1}',
  'aria-label="Memoire workspace"',
  '<Suspense fallback={<AppContentLoading />}>',
  'aria-label="Loading workspace"',
]) {
  requireIncludes(appShell, marker, `AppShell accessibility marker missing: ${marker}`);
}

const css = read('src/index.css');
for (const marker of [
  '.skip-link {',
  'position: fixed;',
  'transform: translateY(-150%);',
  '.skip-link:focus',
  'transform: translateY(0);',
  'outline: 3px solid rgba(25, 118, 210, 0.35);',
]) {
  requireIncludes(css, marker, `skip-link CSS marker missing: ${marker}`);
}

const sidebar = read('src/components/layout/Sidebar.tsx');
for (const marker of [
  'const closeOnEscape = (event: KeyboardEvent) => {',
  "if (event.key === 'Escape') onClose();",
  "window.addEventListener('keydown', closeOnEscape);",
  "return () => window.removeEventListener('keydown', closeOnEscape);",
  'aria-label="Close navigation"',
  'title="Close navigation"',
  'onFocus={() => prefetchAppRoute(item.to)}',
  'More tools',
]) {
  requireIncludes(sidebar, marker, `Sidebar accessibility marker missing: ${marker}`);
}

const topNav = read('src/components/layout/TopNav.tsx');
for (const marker of [
  'onOpenMenu',
  'title="Open navigation"',
  'DataModePill',
  'syncError={profileError || syncStatus.message}',
  'cloudAvailable={syncStatus.state !== \'error\'}',
]) {
  requireIncludes(topNav, marker, `TopNav accessibility/data-mode marker missing: ${marker}`);
}

const protectedRoute = read('src/components/layout/ProtectedRoute.tsx');
for (const marker of [
  'const [slowLoad, setSlowLoad] = useState(false);',
  'window.setTimeout(() => setSlowLoad(true), 9000)',
  'Loading fallback',
  'Memoire is taking longer than expected.',
  'Retry',
  'Sign out',
  'Open Demo Workspace',
  "window.location.replace('/app/dashboard')",
]) {
  requireIncludes(protectedRoute, marker, `ProtectedRoute slow fallback marker missing: ${marker}`);
}

const routeFallback = read('src/features/v31/RouteLoadingFallback.tsx');
for (const marker of [
  'Loading fallback',
  'Memoire is taking longer than expected.',
  'Retry',
  'Sign out',
  'Open Demo Workspace',
  "window.location.replace('/app/dashboard')",
]) {
  requireIncludes(routeFallback, marker, `RouteLoadingFallback marker missing: ${marker}`);
}

const slowHook = read('src/features/v31/useSlowLoadingFallback.ts');
for (const marker of [
  'export function useSlowLoadingFallback(loading: boolean, timeoutMs = 9000)',
  'window.setTimeout(() => setSlow(true), timeoutMs)',
  'window.clearTimeout(timer)',
]) {
  requireIncludes(slowHook, marker, `slow loading hook marker missing: ${marker}`);
}

const exportTab = read('src/features/settings/ExportTab.tsx');
for (const marker of [
  'Cloud export was unavailable. Please retry before relying on this export.',
  'Account deletion failed.',
  'Account deletion failed. Contact support if the issue continues.',
  'setExportError',
  'Keep this file secure because it may contain customer and pipeline information.',
]) {
  requireIncludes(exportTab, marker, `ExportTab failure-state marker missing: ${marker}`);
}

const clientTelemetry = read('src/services/clientTelemetry.ts');
for (const marker of [
  'export function reportClientOperationalEvent',
  "fetch('/api/client-log'",
  'cloud_json_sync_failed',
  'pipeline_defense_cloud_sync_failed',
]) {
  requireIncludes(clientTelemetry, marker, `client telemetry marker missing: ${marker}`);
}

const cloudJsonStore = read('src/services/cloudJsonCollectionStore.ts');
for (const marker of [
  'reportClientOperationalEvent({',
  "eventName: 'cloud_json_sync_failed'",
  "severity: 'error'",
]) {
  requireIncludes(cloudJsonStore, marker, `cloud JSON failure marker missing: ${marker}`);
}

const pipelineCloudStore = read('src/services/pipelineDefenseCloudStore.ts');
for (const marker of [
  'reportClientOperationalEvent({',
  "eventName: 'pipeline_defense_cloud_sync_failed'",
  "severity: 'error'",
]) {
  requireIncludes(pipelineCloudStore, marker, `pipeline cloud failure marker missing: ${marker}`);
}

for (const [file, marker] of [
  ['src/features/v31/AskMemoirePage.tsx', 'Ask endpoint unavailable - showing a local rule-based answer.'],
  ['src/features/v31/AskMemoirePage.tsx', 'Ask Memoire could not reach the configured endpoint. Local rules are still available.'],
  ['src/features/dailyCapture/DailyCapturePage.tsx', 'AI Assist failed. Local rules are still available.'],
  ['src/features/dailyCapture/DailyCapturePage.tsx', 'AI Assist is not configured on the server. Local rules are still available.'],
]) {
  requireIncludes(read(file), marker, `${file} missing AI failure fallback marker: ${marker}`);
}

const qaDoc = read('docs/qa/accessibility-failure-state-qa-2026-06-17.md');
for (const marker of [
  'C6 accessibility and slow/failure-state readiness',
  'C6 requires a manual browser pass on protected production or preview',
  'Skip to main content',
  'main` landmark has a stable `id`, label, and focus target',
  'Mobile navigation can be closed with `Escape` when open.',
  'C6-01',
  'C6-02',
  'C6-03',
  'C6-04',
  'C6-05',
  'C6-06',
  'C6-07',
  'C6-08',
  'C6-09',
  'C6-10',
  'C6-11',
  'C6-12',
  'C6-13',
  'C6-14',
  'C6-15',
  'C6-16',
  'C6-17',
  'C6 can move from missing to operational evidence only when:',
  'C6 remains open until the matrix passes against protected production or preview.',
]) {
  requireIncludes(qaDoc, marker, `accessibility QA doc missing marker: ${marker}`);
}

const coverageDoc = read('docs/qa/accessibility-failure-state-contract-coverage-2026-06-17.md');
for (const marker of [
  'C6 remains open',
  'R12 remains open',
  'scripts/verify-accessibility-failure-state-contract.mjs',
  'Runtime Evidence Still Required',
]) {
  requireIncludes(coverageDoc, marker, `accessibility contract coverage doc missing marker: ${marker}`);
}

const packageJson = read('package.json');
requireIncludes(packageJson, '"verify:accessibility-failure-state"', 'package.json missing verify:accessibility-failure-state script');
requireIncludes(packageJson, 'npm run verify:accessibility-failure-state', 'npm run check does not include accessibility verifier');

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-accessibility-failure-state-contract.mjs', 'release gate does not reference accessibility verifier');

const roadmap = read('docs/product/commercialization-roadmap-2026-06-16.md');
requireIncludes(roadmap, 'npm run verify:accessibility-failure-state', 'roadmap does not reference accessibility verifier');

if (failures.length > 0) {
  console.error('Accessibility/failure-state contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Accessibility/failure-state contract verification passed.');
