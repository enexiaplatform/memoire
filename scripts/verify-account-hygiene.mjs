import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyAccountEngagement,
  isDefaultAccountStatus,
  loadAccountHygienePreferences,
  setAccountArchived,
  setAccountStrategic,
} from '../src/utils/accountHygiene.ts';
import { buildUnifiedTodayCommandCenter } from '../src/utils/todayCommandCenter.ts';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};

const account = (id, overrides = {}) => ({
  id, accountName: `Account ${id}`, segment: '', industry: '', location: '', accountPotential: 'Unknown', relationshipStatus: 'New',
  keyStakeholders: [], notes: '', tags: [], sourceSystem: 'founder_core_fy26', createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z', storageMode: 'local', ...overrides,
});
const emptyImport = account('empty', { accountName: 'Searchable Empty Import' });
const emptyClassification = classifyAccountEngagement({ account: emptyImport, today: '2026-06-21' });
assert.equal(emptyClassification.status, 'Imported only');
assert.equal(emptyClassification.followUpDue, false);
assert.equal(isDefaultAccountStatus(emptyClassification.status), false);

const opportunity = {
  id: 'opp-1', accountName: 'Active Pharma', opportunityName: 'Validation', status: 'Active', nextAction: 'Confirm review', nextActionDate: '2026-06-20',
};
const activeAccount = account('active', { accountName: 'Active Pharma' });
const activeClassification = classifyAccountEngagement({ account: activeAccount, opportunities: [opportunity], today: '2026-06-21' });
assert.equal(activeClassification.status, 'Needs follow-up');
assert.equal(activeClassification.followUpDue, true);
assert.equal(isDefaultAccountStatus(activeClassification.status), true);

const strategicAccount = account('strategic', { accountName: 'Strategic Pharma', fy26TargetSgd: 500_000 });
const strategicClassification = classifyAccountEngagement({ account: strategicAccount, today: '2026-06-21' });
assert.equal(strategicClassification.status, 'Strategic');
assert.equal(isDefaultAccountStatus(strategicClassification.status), true);

const userId = 'm69-verifier';
let preferences = setAccountArchived(emptyImport.id, true, userId);
assert.equal(classifyAccountEngagement({ account: emptyImport, preference: preferences[0] }).status, 'Archived');
preferences = setAccountArchived(emptyImport.id, false, userId);
assert.equal(classifyAccountEngagement({ account: emptyImport, preference: preferences[0] }).status, 'Imported only');
preferences = setAccountStrategic(emptyImport.id, true, userId);
assert.equal(classifyAccountEngagement({ account: emptyImport, preference: preferences[0] }).status, 'Strategic');
assert.equal(loadAccountHygienePreferences(userId).length, 1);

const today = buildUnifiedTodayCommandCenter({
  briefs: [], revenueActions: [], opportunities: [], activities: [], accounts: [emptyImport], quotes: [], today: '2026-06-21',
});
assert.equal(today.hasMeaningfulData, false);
assert.equal(today.topActions.length, 0);
assert.equal(today.importedAccountsHidden, 1);

const page = readFileSync('src/features/accounts/AccountsPage.tsx', 'utf8');
for (const marker of [
  "useState<HygieneFilter>('Active work')", 'if (searchText) return searchable.includes(searchText);', 'Imported account — no sales memory yet',
  'Capture update', 'Create opportunity', 'Mark strategic', 'Archive account', 'Unarchive account', 'No pipeline evidence',
]) assert.ok(page.includes(marker), `Accounts hygiene UI missing: ${marker}`);
for (const filter of ['Active', 'Needs follow-up', 'Strategic', 'Dormant', 'Imported only', 'Archived', 'All']) {
  assert.ok(page.includes(filter), `Account filter missing: ${filter}`);
}

const dashboard = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
assert.ok(dashboard.includes('imported accounts are available in search but hidden from active work.'));
const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 12, 'A new CRM navigation item was added.');

console.log('Account archive and empty-state hygiene regression verified.');
