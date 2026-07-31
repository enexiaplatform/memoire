import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAccountAliasIndex, resolveAccountName } from '../src/utils/accountAliases.ts';
import { compareAccountNames, findSimilarAccountName } from '../src/utils/accountDuplicates.ts';
import { buildCoverageMatrix } from '../src/utils/coverageMatrix.ts';
import { buildActivityInsights } from '../src/utils/activityInsights.ts';
import { buildOperatorProfile } from '../src/utils/operatorProfile.ts';

/**
 * The account-link contract.
 *
 * An opportunity's link to a customer is the account *name*: records belong to
 * the same customer because their names resolve to the same key. That makes two
 * things load-bearing, and this file pins both.
 *
 * First, the name must be hard to get wrong at the point of entry - a free-text
 * field where one slip creates a second customer is a field that silently splits
 * a customer's deals, touches, coverage row and contact rhythm.
 *
 * Second, a merge the user has already made must reach every surface that groups
 * by account. Merging records an alias and rewrites nothing, which is the right
 * call - but it means each surface has to apply it, and the ones that did not
 * drew a merged customer twice.
 */

const opp = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'DP Lab', opportunityName: 'Deal',
  stage: 'Proposal', estimatedValue: 100, currency: 'VND', status: 'Active', brand: 'Tailin',
  createdAt: '2026-01-01', updatedAt: '2026-01-01', storageMode: 'local', ...patch,
});

const activity = (patch = {}) => ({
  id: `a-${Math.random().toString(36).slice(2)}`, accountName: 'DP Lab', linkedAccountName: 'DP Lab',
  linkedOpportunityId: '', activityType: 'Customer meeting', activityDate: '2026-06-01',
  nextAction: '', dueDate: '', nextActions: [], summary: '', tags: [], rawNote: '', ...patch,
});

const merge = (canonical, mergedNames) => ({
  id: `merge-${canonical}`, kind: 'merge', canonicalAccountName: canonical, mergedNames,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
});

// 1. The deal form offers what the workspace knows instead of asking the seller
//    to retype a customer, and says something when the name is a near-miss.
{
  const page = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
  for (const marker of ['<SuggestInput', 'label="Account"', 'checkAccountName', '<AccountNameNotice']) {
    assert.ok(page.includes(marker), `the deal form lost its account-identity wiring: ${marker}`);
  }

  // The check itself lives in the util both entry points share. It used to be
  // defined inside this page, which is why the Accounts page - the one place a
  // customer is created deliberately - had no check at all.
  const duplicates = readFileSync('src/utils/accountDuplicates.ts', 'utf8');
  for (const marker of ['export function checkAccountName', 'findSimilarAccountName', 'compareAccountNames']) {
    assert.ok(duplicates.includes(marker), `the shared account-name check lost: ${marker}`);
  }
  assert.ok(
    !page.includes('function checkAccountName'),
    'the deal form must use the shared check, not keep a second copy of the matching rules',
  );
  assert.ok(
    !/<Field label="Account"/.test(page),
    'the account field must not go back to being a bare text input',
  );

  // Every path that persists the panel's form runs through one guard. The
  // outcome retro writes `{ ...editingOpportunity, ...form }`, so it carries the
  // typed account name too - guarding only the Save button left it able to
  // create the duplicate silently.
  assert.ok(page.includes('const holdForAccountNameCheck'), 'the save guard must exist');
  const guardedCalls = page.match(/if \(holdForAccountNameCheck\(/g) || [];
  assert.ok(
    guardedCalls.length >= 2,
    `every write path must run the guard (found ${guardedCalls.length} call sites, expected both save paths)`,
  );
  const retroIndex = page.indexOf('const handleSaveOpportunityOutcome');
  assert.ok(
    page.slice(retroIndex, retroIndex + 600).includes('holdForAccountNameCheck'),
    'the outcome retro writes the typed account name and must be guarded too',
  );
}

// 1b. Creating an account is the one place a duplicate customer is made on
//     purpose, and it was the one place nothing asked. The guard interrupts
//     once; a second save means the seller meant it.
{
  const accounts = readFileSync('src/features/accounts/AccountsPage.tsx', 'utf8');
  for (const marker of ['checkAccountName', '<NewAccountNameNotice', 'accountNameConfirmed']) {
    assert.ok(accounts.includes(marker), `the account form lost its duplicate guard: ${marker}`);
  }

  const saveIndex = accounts.indexOf('const handleSave = async');
  const saveBody = accounts.slice(saveIndex, accounts.indexOf('const handleDelete', saveIndex));
  assert.ok(
    saveBody.includes('checkAccountName'),
    'the account save path must run the duplicate check, not only render a notice',
  );
  assert.ok(
    saveBody.indexOf('checkAccountName') < saveBody.indexOf('createAccount'),
    'the check must run before the record is created',
  );

  // A near-miss is checked against every name the workspace holds, not only
  // against other account rows: the commonest duplicate is a company that
  // already exists as a deal.
  assert.match(
    accounts,
    /knownAccountNames = useMemo\(\(\) => Array\.from\(new Set\(\[[\s\S]{0,400}?opportunities\.map/,
    'the known-name list must include deals, not just account records',
  );
}

// 2. One typeahead, not two. The capture panel had its own copy; a second
//    implementation is a second set of matching rules to disagree with.
{
  const capture = readFileSync('src/features/dailyCapture/DailyCapturePage.tsx', 'utf8');
  assert.ok(capture.includes('SuggestInput'), 'Quick Capture still uses the shared suggest input');
  assert.ok(
    !capture.includes('function QuickSuggestInput'),
    'Quick Capture must not reintroduce its own typeahead',
  );
}

// 3. A one-letter slip is caught for asking, and never for merging. The two
//    thresholds are deliberately different: a question costs a glance, a wrong
//    merge buries a customer's history under a name they do not recognise.
{
  assert.equal(compareAccountNames('Trust Farma', 'Trust Farm'), null);
  const similar = findSimilarAccountName('Trust Farma', ['Euvipharm', 'Trust Farm', 'VNVC']);
  assert.equal(similar?.name, 'Trust Farm');
  assert.equal(findSimilarAccountName('MDL', ['MDK']), null, 'short names differ by one letter legitimately');
  assert.equal(findSimilarAccountName('Trust Farm', ['Trust Farm']), null, 'a known name is not its own near-miss');
}

// 4. Merges are loaded once, with the rest of the workspace, so no surface has
//    to fetch them separately and end up being the one that forgot.
{
  const workspace = readFileSync('src/services/workspaceData.ts', 'utf8');
  for (const marker of ['accountMerges: AccountMergeRecord[]', 'loadAccountMergesForWorkspace']) {
    assert.ok(workspace.includes(marker), `the workspace load lost the merges: ${marker}`);
  }
}

// 5. A merge reaches every surface that groups by account.
{
  const aliases = buildAccountAliasIndex([merge('DP Lab', ['DPLab'])]);
  assert.equal(resolveAccountName('DPLab', aliases), 'DP Lab');

  const opportunities = [opp({ accountName: 'DP Lab', brand: 'Tailin' }), opp({ accountName: 'DPLab', brand: 'Biomedia' })];
  const matrix = buildCoverageMatrix({ opportunities, accountAliases: aliases });
  assert.equal(matrix.rows.length, 1, 'the Vault matrix draws a merged customer once');
  assert.equal(matrix.rows[0].brandsTouched, 2);

  const activities = [
    activity({ accountName: 'DP Lab', linkedAccountName: 'DP Lab', activityDate: '2026-06-01' }),
    activity({ accountName: 'DPLab', linkedAccountName: 'DPLab', activityDate: '2026-06-02' }),
  ];
  const insights = buildActivityInsights({
    activities, planRecords: [], range: { start: '2026-06-01', end: '2026-06-07' },
    today: '2026-06-03', accountAliases: aliases,
  });
  assert.equal(insights.coverage.accountsTouched, 1, 'the activity band counts a merged customer once');

  const profile = buildOperatorProfile({
    opportunities: [], opportunityOutcomes: [], quotes: [],
    activities: ['2026-06-01', '2026-06-05', '2026-06-09', '2026-06-13'].map((date, index) => activity({
      id: `a${index}`,
      accountName: index % 2 === 0 ? 'DP Lab' : 'DPLab',
      linkedAccountName: index % 2 === 0 ? 'DP Lab' : 'DPLab',
      activityDate: date,
    })),
    today: '2026-07-01',
    accountAliases: aliases,
  });
  assert.equal(profile.unusuallyQuiet.length, 1, 'a merged customer has one contact rhythm');
  assert.equal(profile.unusuallyQuiet[0].account, 'DP Lab');
}

// 6. Two spellings of one name are one customer even with no merge recorded,
//    because `accountKey` already says they are the same account.
{
  const matrix = buildCoverageMatrix({
    opportunities: [opp({ accountName: 'VNVC', brand: 'Tailin' }), opp({ accountName: 'vnvc.', brand: 'Biomedia' })],
  });
  assert.equal(matrix.rows.length, 1);
}

// 7. Merging still rewrites nothing. It records an alias, which is what keeps it
//    reversible - the moment it edits deals, "undo the merge" stops being true.
{
  const store = readFileSync('src/services/accountMergeStore.ts', 'utf8');
  assert.ok(
    !store.includes('opportunityStore') && !store.includes('updateOpportunity'),
    'a merge must not rewrite opportunity records',
  );
}

console.log('Account link contract verified.');
