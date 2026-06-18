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

const expectedExportTables = [
  'user_profiles',
  'usage_monthly',
  'sales_activities',
  'accounts',
  'opportunities',
  'stakeholders',
  'objections',
  'pipeline_defense_briefs',
  'review_packs',
  'sales_assets',
  'action_outcomes',
  'deals',
  'captures',
  'entities',
  'relationships',
  'contacts',
  'interactions',
  'actions',
];

const exportApi = read('api/export.ts');
requireIncludes(exportApi, 'export const exportTables', 'export table contract must be exported for runtime verification');
requireIncludes(exportApi, 'export function findExportContamination', 'export contamination guard must be exported for runtime verification');
requireIncludes(exportApi, "verifyUserToken(authToken, userId)", 'export API must verify the token belongs to the requested user');
requireIncludes(exportApi, 'getSupabaseAnonKey()', 'export API must query through the authenticated anon client for RLS');
requireIncludes(exportApi, '.eq(ownerColumn, userId)', 'export API must filter every table by owner column');
requireIncludes(exportApi, 'findExportContamination(results, userId)', 'export API must run contamination guard before responding');
requireIncludes(exportApi, 'Export contamination guard blocked response', 'export API must log blocked contamination');
requireIncludes(exportApi, 'Export failed integrity checks', 'export API must fail closed on contamination');
requireIncludes(exportApi, 'manifest', 'export API must return a manifest');
requireIncludes(exportApi, 'owner_column', 'export manifest must expose owner columns');
for (const table of expectedExportTables) {
  requireIncludes(exportApi, `'${table}'`, `export API missing table ${table}`);
}

const exportTab = read('src/features/settings/ExportTab.tsx');
requireIncludes(exportTab, "fetch('/api/export'", 'settings export UI must call signed-in cloud export endpoint');
requireIncludes(exportTab, 'if (response.ok)', 'settings export UI must branch on cloud export response');
requireIncludes(exportTab, 'throw new Error(errorMessage)', 'settings export UI must stop export when cloud export fails');
requireIncludes(exportTab, 'cloudData', 'settings export UI must include cloudData when export succeeds');

const deleteAccount = read('api/delete-account.ts');
requireIncludes(deleteAccount, 'supabaseUser.auth.getUser()', 'delete-account must fetch the authenticated user before deletion');
requireIncludes(deleteAccount, 'authData.user.id !== userId', 'delete-account must block mismatched user IDs');
requireIncludes(deleteAccount, "res.status(403).json({ error: 'Forbidden' })", 'delete-account must return 403 for mismatched user IDs');
requireIncludes(deleteAccount, 'getSupabaseServiceRoleKey()', 'delete-account service-role use must stay isolated after user verification');
requireIncludes(deleteAccount, 'supabase.auth.admin.deleteUser(userId)', 'delete-account must delete only the verified userId');

const authProvider = read('src/auth/AuthProvider.tsx');
for (const marker of [
  'clearDemoWorkspaceForAccount',
  'await clearDemoWorkspaceForAccount();',
  'completePendingCloudWorkspace(nextSession?.user ?? null)',
  'window.localStorage.removeItem(PIPELINE_AUTH_REDIRECT_KEY)',
]) {
  requireIncludes(authProvider, marker, `auth provider missing demo/account cleanup marker: ${marker}`);
}

const demoMode = read('src/lib/demoMode.ts');
for (const marker of [
  'DEMO_WORKSPACE_KEY',
  'SAMPLE_DATA_FLAG_KEY',
  'clearDemoWorkspaceMode()',
  'clearSampleDataset',
  'Demo cleanup must never block a successful account authentication',
]) {
  requireIncludes(demoMode, marker, `demo mode cleanup missing marker: ${marker}`);
}

const cloudJson = read('src/services/cloudJsonCollectionStore.ts');
for (const marker of [
  "record.source !== 'demo'",
  'record.isSample !== true',
  'payload: { id: recordId, updatedAt: now, __deleted: true }',
  "window.localStorage.setItem(getOwnerKey(table), userId)",
  'claimLocalCollectionForUser',
  "eventName: 'cloud_json_sync_failed'",
]) {
  requireIncludes(cloudJson, marker, `cloud JSON store missing isolation marker: ${marker}`);
}

const reviewPacks = read('src/utils/reviewPacks.ts');
for (const marker of [
  "source?: 'demo' | 'user'",
  'isSample?: boolean',
  'local.filter(isUserReviewPack)',
  "pack.source === 'demo'",
  'pack.isSample === true',
  'deleteCloudJsonRecordForCurrentUser',
]) {
  requireIncludes(reviewPacks, marker, `review pack store missing demo isolation marker: ${marker}`);
}

const cloudMigration = read('supabase/migrations/20260615132000_cloud_browser_collections.sql');
for (const table of ['review_packs', 'sales_assets', 'action_outcomes']) {
  requireIncludes(cloudMigration, `CREATE TABLE public.${table}`, `cloud migration missing table ${table}`);
  requireIncludes(cloudMigration, `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`, `cloud migration missing RLS for ${table}`);
}
requireIncludes(cloudMigration, 'PRIMARY KEY (user_id, id)', 'cloud migration must key records by user_id and id');
requireIncludes(cloudMigration, 'WITH CHECK ((SELECT auth.uid()) = user_id)', 'cloud migration must enforce user_id WITH CHECK');
requireIncludes(cloudMigration, 'REVOKE ALL ON TABLE public.review_packs, public.sales_assets, public.action_outcomes FROM anon', 'cloud migration must revoke anon access');

const qaDoc = read('docs/qa/two-account-data-isolation-qa-2026-06-16.md');
for (const qaId of ['QA-01', 'QA-08', 'QA-11', 'QA-13', 'QA-17']) {
  requireIncludes(qaDoc, qaId, `two-account QA doc missing ${qaId}`);
}

const coverageDoc = read('docs/qa/data-isolation-contract-coverage-2026-06-17.md');
for (const marker of ['A3 remains open', 'A4 remains open', 'scripts/verify-data-isolation-contract.mjs']) {
  requireIncludes(coverageDoc, marker, `data isolation coverage doc missing ${marker}`);
}

const runtimeCoverageDoc = read('docs/qa/data-isolation-runtime-contract-coverage-2026-06-17.md');
for (const marker of [
  'scripts/verify-data-isolation-runtime-contract.mjs',
  'owner_mismatch',
  'row_not_object',
  'A3 and A4 remain open',
]) {
  requireIncludes(runtimeCoverageDoc, marker, `data isolation runtime coverage doc missing ${marker}`);
}

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-data-isolation-contract.mjs', 'release gate does not reference data isolation verifier');
requireIncludes(releaseGate, 'scripts/verify-data-isolation-runtime-contract.mjs', 'release gate does not reference data isolation runtime verifier');

const packet = read('docs/product/cohort-release-evidence-packet-2026-06-17.md');
requireIncludes(packet, 'scripts/verify-data-isolation-contract.mjs', 'cohort packet does not reference data isolation verifier');
requireIncludes(packet, 'scripts/verify-data-isolation-runtime-contract.mjs', 'cohort packet does not reference data isolation runtime verifier');

const packageJson = read('package.json');
requireIncludes(packageJson, '"verify:data-isolation-runtime"', 'package.json missing verify:data-isolation-runtime script');
requireIncludes(packageJson, 'npm run verify:data-isolation-runtime', 'npm run check does not include data isolation runtime verifier');

if (failures.length > 0) {
  console.error('Data isolation contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Data isolation contract verification passed.');
