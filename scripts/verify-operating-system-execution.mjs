import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOperatingContextCommandActions, buildTodayCommandCenter } from '../src/utils/salesCommandCenter.ts';

function operatingRecord(overrides = {}) {
  return {
    id: 'initiative-1',
    userId: 'user-1',
    contextType: 'initiative',
    title: 'Example must-win initiative',
    status: 'Active',
    period: 'Q3',
    owner: 'Owner',
    valueAtStake: 500_000,
    nextAction: 'Confirm the next customer milestone.',
    nextDate: '',
    summary: 'Example objective',
    payload: {},
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    storageMode: 'cloud',
    ...overrides,
  };
}

const [missingAction] = buildOperatingContextCommandActions([
  operatingRecord({ nextAction: '' }),
]);
assert.equal(missingAction.source, 'Operating System');
assert.equal(missingAction.priority, 'High');
assert.match(missingAction.title, /Define the next milestone/i);
assert.match(missingAction.href, /operating-system\?contextId=initiative-1/);

assert.equal(buildOperatingContextCommandActions([
  operatingRecord({ status: 'Completed' }),
]).length, 0, 'completed operating context should not create daily work');

const commandCenter = buildTodayCommandCenter({
  activities: [],
  opportunities: [],
  accounts: [],
  briefs: [],
  operatingContext: [operatingRecord({ nextAction: '' })],
  commercialActions: [{
    id: 'quote-expiring',
    accountName: 'Example Account',
    label: 'Example quote',
    amount: 100_000,
    currency: 'SGD',
    status: 'Quoted',
    risk: 'Quote expiring',
    nextAction: 'Confirm quote approval.',
    href: '/app/quotes',
    source: 'Quote',
  }],
});

assert.equal(commandCenter.hasAnyData, true);
assert.equal(commandCenter.operatingActions.length, 1);
assert.equal(commandCenter.priorityActions[0]?.source, 'Operating System');
assert.equal(commandCenter.dailyTimeblocks.find((block) => block.id === 'morning-triage')?.actions[0]?.source, 'Operating System');
assert.equal(commandCenter.dailyTimeblocks.find((block) => block.id === 'pipeline-defense')?.actions.length, 0);

const dashboard = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
assert.ok(dashboard.indexOf('<QuoteFollowUpCard') > dashboard.indexOf('More dashboard insights'), 'quote follow-up should be progressive disclosure');
assert.match(dashboard, /title="Operating priorities"/);

const app = readFileSync('src/App.tsx', 'utf8');
const workspace = readFileSync('src/services/workspaceData.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260618090000_founder_core_import_metadata.sql', 'utf8');
const importer = readFileSync('scripts/import-founder-core.mjs', 'utf8');
const store = readFileSync('src/services/operatingContextStore.ts', 'utf8');
assert.match(app, /path="operating-system"/);
assert.match(workspace, /loadOperatingContext/);
assert.match(migration, /alter table public\.operating_context enable row level security/);
assert.match(migration, /auth\.uid\(\)\) = user_id/);
assert.match(migration, /revoke all on table public\.import_batches, public\.import_row_results, public\.operating_context from anon/);
assert.doesNotMatch(importer, /console\.log\(`target: \$\{/);
assert.doesNotMatch(importer, /Target email fixed to/);
assert.match(importer, /'targetEmail', 'target_email', 'userId', 'user_id', 'backupPath'/);
assert.match(store, /\.eq\('user_id', userId\)/);
assert.match(store, /`\$\{OPERATING_CONTEXT_STORAGE_KEY\}:\$\{userId\}`/);
assert.doesNotMatch(store, /service_role|SUPABASE_SERVICE_ROLE_KEY/);

console.log('Operating System execution verification passed.');
