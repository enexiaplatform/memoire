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

/**
 * Source with every comment removed.
 *
 * An "it must include X" marker can be satisfied by a comment that merely
 * mentions X - the trap this repo has hit before. An "it must NOT include X"
 * marker has the mirror-image trap, and it bites immediately: the comment
 * explaining why a line was deleted names the deleted line, so the check fails
 * on its own explanation and the only way to pass is to stop explaining.
 *
 * Block comments cover JSX `{/* … *\/}` too, since that is a block comment in
 * braces. Line comments are matched only where `//` opens the line, so a URL in
 * a string is left alone.
 */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

function requireExcludes(text, marker, label) {
  if (code(text).includes(marker)) fail(label);
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
  // A route change has to move focus, not just the scroll position. Without
  // this, activating a rail link left focus on that link: the next Tab carried
  // on through the rail instead of entering the page that had just replaced
  // itself, and nothing announced the navigation at all. `main` had carried
  // tabIndex={-1} the whole time; nothing was sending anyone to it.
  'ref={mainRef}',
  'mainRef.current?.focus();',
  // Never on arrival - that focus belongs to the browser, and taking it would
  // fight the skip link on the one load where the skip link matters most.
  'if (isFirstRender.current) {',
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
  // The rail is one landmark with a name, now that it is a single flat list
  // rather than three conditionally-disclosed tiers.
  'aria-label="Primary"',
]) {
  requireIncludes(sidebar, marker, `Sidebar accessibility marker missing: ${marker}`);
}

const topNav = read('src/components/layout/TopNav.tsx');
for (const marker of [
  'onOpenMenu',
  'title="Open navigation"',
  'DataModePill',
  "isLoading={loading || syncStatus.state === 'checking'}",
  'hasSampleData={demoActive}',
]) {
  requireIncludes(topNav, marker, `TopNav accessibility/data-mode marker missing: ${marker}`);
}

/**
 * One question, one answer.
 *
 * "Are my records reaching the cloud?" is asked by a chip in the top bar and
 * again by a chip on Today, and for a while the two were computed from
 * different inputs and disagreed on screen. The top bar fed it `profileError` -
 * a failed read of the `user_profiles` row, which holds a display name - so a
 * single slow row (5s timeout, no retry) painted the global chip red for the
 * rest of the session under the words "new changes may remain only in this
 * browser", while Today's chip, two inches below, read "Cloud + browser".
 *
 * Today had the mirror-image fault: an explicit `syncError={... : null}` means
 * "I checked and it is fine", which outranks the global status, so the one
 * screen a seller opens first was asserting all-clear over every sync failure
 * reported by anything else.
 *
 * Neither surface knows more than `useWorkspaceSyncStatus`, so neither may
 * overrule it. `undefined` is the only permitted way to decline to answer.
 */
requireExcludes(
  topNav,
  'profileError',
  'TopNav feeds a profile-row failure into the sync chip again - profileError is not a sync error',
);
requireExcludes(
  topNav,
  'cloudAvailable',
  'TopNav overrides cloudAvailable again - the top bar knows nothing useWorkspaceSyncStatus does not',
);

const profileTab = read('src/features/settings/ProfileTab.tsx');
for (const marker of [
  'profileError',
  '{profileError} Your records are unaffected',
  'role="alert"',
]) {
  requireIncludes(profileTab, marker, `ProfileTab must own the profile-read failure: ${marker}`);
}

const dashboardPage = read('src/features/dashboard/DashboardPage.tsx');
requireIncludes(
  dashboardPage,
  "syncError={message.startsWith('Cloud sync issue') ? message : undefined}",
  "Today's data-mode chip must decline with undefined, never assert null over a real sync error",
);
requireExcludes(
  dashboardPage,
  'cloudAvailable={isSupabaseConfigured}',
  'Today claims cloudAvailable from a build-time constant again - it is true in production whatever the cloud is doing',
);

const protectedRoute = read('src/components/layout/ProtectedRoute.tsx');
for (const marker of [
  'const [slowLoad, setSlowLoad] = useState(false);',
  'window.setTimeout(() => setSlowLoad(true), 9000)',
  'Loading fallback',
  'Memoire is taking longer than expected.',
  'Retry',
  'Sign out',
  'Open Demo Workspace',
  "window.location.replace('/app/today')",
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
  "window.location.replace('/app/today')",
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
  // Inert unless configured, and fire-and-forget. The endpoint is read into a
  // local first so the reporter also survives an environment with no
  // `import.meta.env` - it is called from inside every `catch` in the app, and
  // a reporter that throws from there hides the failure it was reporting.
  'VITE_CLIENT_LOG_ENDPOINT',
  'if (!endpoint) return',
  'fetch(endpoint',
  '.catch(() => undefined)',
  'cloud_json_sync_failed',
  'pipeline_defense_cloud_sync_failed',
  'client_render_error',
  // A write this browser refused: the record did not land locally either.
  'local_write_failed',
]) {
  requireIncludes(clientTelemetry, marker, `client telemetry marker missing: ${marker}`);
}

const appErrorBoundary = read('src/components/common/AppErrorBoundary.tsx');
for (const marker of [
  'static getDerivedStateFromError',
  'componentDidCatch',
  "eventName: 'client_render_error'",
  'role="alert"',
  'Reload page',
  'Go to Today',
  'A newer version of Memoire is available',
]) {
  requireIncludes(appErrorBoundary, marker, `app error boundary marker missing: ${marker}`);
}

const appRoot = read('src/App.tsx');
requireIncludes(appRoot, '<AppErrorBoundary>', 'App root should wrap routes in AppErrorBoundary');

const clientLogApi = read('api/client-log.ts');
requireIncludes(clientLogApi, "'client_render_error'", 'client-log API should allowlist client_render_error');

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
  // The app no longer calls any AI service: answers and capture parsing are
  // rule-based on-device, so the honest-state markers assert that, not a fallback.
  ['src/features/v31/AskMemoirePage.tsx', 'Answered from your workspace using rules - nothing was sent to an AI service.'],
  ['src/features/v31/AskMemoirePage.tsx', 'There is not enough recorded yet to answer that from your workspace.'],
  ['src/features/dailyCapture/DailyCapturePage.tsx', 'On-device parsing'],
  ['src/features/dailyCapture/DailyCapturePage.tsx', 'nothing is sent to an AI service'],
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
