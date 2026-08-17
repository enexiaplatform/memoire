import assert from 'node:assert/strict';
import { readdirSync, readFileSync as readSourceFile } from 'node:fs';
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

// 1c. The account panel used to report "12 contacts | 34 activities" and keep
//     deals, touches, quotes and outcomes in four separate boxes. A count is
//     not a memory: the question walking into a meeting is what happened here
//     and in what order.
{
  const timeline = readFileSync('src/utils/accountTimeline.ts', 'utf8');
  for (const marker of ['export function buildAccountTimeline', 'activityEntries', 'opportunityEntries', 'quoteEntries', 'outcomeEntries']) {
    assert.ok(timeline.includes(marker), `the account history lost a source: ${marker}`);
  }

  // Every row must reach the record behind it, or the history becomes a second
  // copy of the data instead of a way into it.
  assert.equal(
    (timeline.match(/href: `\/app\//g) || []).length,
    4,
    'every timeline source must link back to its own record',
  );

  const accounts = readFileSync('src/features/accounts/AccountsPage.tsx', 'utf8');
  assert.ok(accounts.includes('<AccountHistorySection'), 'the account panel must render the history');
  assert.ok(accounts.includes('buildAccountTimeline'), 'the history must come from the shared builder');
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

/**
 * One rule decides that two spellings are the same customer.
 *
 * `accountIdentity.ts` was extracted so that "every surface counts the same
 * relationships" - its own words. Six files had quietly kept their own
 * `toLowerCase().trim()` anyway: proactiveNudges, followUpFromOpportunity,
 * followUpImpact, commercialJourney, activityIndex and captureNudges, plus an
 * inline pair in businessCockpit.
 *
 * That key is diacritic- and punctuation-sensitive, so in this book the ordinary
 * spelling difference broke the link. The sharpest consequence was in
 * `classifyOpportunitySilence`: an activity on "Cong ty Duoc Pham Cuu Long" did
 * not reach a deal filed as "CÔNG TY DƯỢC PHẨM CỬU LONG", so a deal met
 * yesterday reported "silent, 108 days quiet" and raised a critical "Deal going
 * silent" nudge saying no touch had ever been recorded. A false alarm is what
 * teaches an operator to stop reading the true ones.
 *
 * Comments are stripped first: every one of those files now explains this in
 * prose that contains the offending expression.
 */
{
  const collect = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return collect(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

  // Matched on the lowercase applied *directly to a name*, not on the two things
  // merely appearing in the same file. The looser version flagged seventeen more
  // files that lowercase a status or a tag and happen to mention accountName
  // elsewhere, which is how a check becomes noise and then becomes ignored.
  const namedFieldLowercase = new RegExp(
    '(accountName|opportunityName|stakeholderName|linkedAccountName|linkedOpportunityName)'
    + '[^;\\n]{0,30}\\)?\\.trim\\(\\)\\.toLowerCase\\(\\)',
  );

  const offenders = [...collect('src/utils'), ...collect('src/features')]
    .filter((file) => {
      const code = readSourceFile(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return namedFieldLowercase.test(code);
    });

  assert.deepEqual(
    offenders,
    [],
    'these match customer names with a local lowercase instead of '
    + `normalizeEntityName, so a diacritic or a full stop breaks the link: ${offenders.join(', ')}`,
  );

  /**
   * The same rule, hidden one level down.
   *
   * The check above looks for the lowercase applied straight to a name field, and
   * `salesCommandCenter` slipped past it by putting the expression in a helper
   * called `normalizeName` and calling *that* on the names. Seven more files were
   * doing the same. So a normaliser whose whole body is a bare
   * `trim().toLowerCase()` is itself the finding, whatever it is called.
   *
   * Enum normalisers - normalizeStage, normalizeStatus, normalizeHorizon - do not
   * match: they map to a fixed list rather than returning the lowercase, so their
   * bodies are more than this one expression.
   */
  const bareLowercaseHelper = /function\s+normalize[A-Za-z]*\s*\([^)]*\)\s*\{\s*return\s+[^;]*\.trim\(\)\.toLowerCase\(\)\s*;\s*\}/;

  const helperOffenders = [...collect('src/utils'), ...collect('src/features')]
    .filter((file) => {
      const code = readSourceFile(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return bareLowercaseHelper.test(code);
    });

  assert.deepEqual(
    helperOffenders,
    [],
    'these define a name normaliser whose whole body is a bare lowercase; it '
    + `must delegate to normalizeEntityName: ${helperOffenders.join(', ')}`,
  );

  /**
   * And the third disguise: a *comparison* helper.
   *
   * `sameText`, `sameName` - two arguments, lowercased and compared, returning a
   * boolean rather than a key. Neither of the checks above sees it: the
   * lowercase is applied to a parameter called `a`, not to a field called
   * accountName, and the function is not named normalize-anything.
   *
   * Four files hid here, and one of them compares *people*:
   * `meddicStakeholderMap.sameText` attaches an objection to the person who
   * raised it and their activities to them, so "Nguyễn Văn Đức" and
   * "Nguyen Van Duc" - one champion typed twice - left that champion looking
   * untouched and unchallenged, which is the evidence the "Champion missing" and
   * "Economic buyer unknown" nudges are built on.
   */
  const bareLowercaseComparison =
    /function\s+\w+\s*\([^)]*\)\s*\{\s*return\s+[^;]*\.trim\(\)\.toLowerCase\(\)\s*===\s*[^;]*\.trim\(\)\.toLowerCase\(\)\s*;?\s*\}/;

  const comparisonOffenders = [...collect('src/utils'), ...collect('src/features')]
    .filter((file) => {
      const code = readSourceFile(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return bareLowercaseComparison.test(code);
    });

  assert.deepEqual(
    comparisonOffenders,
    [],
    'these compare two names by lowercasing both; the comparison must go '
    + `through normalizeEntityName: ${comparisonOffenders.join(', ')}`,
  );

  /**
   * And the fourth: no `.trim()` at all.
   *
   * All three checks above key on `.trim().toLowerCase()`. Seven more sites just
   * wrote `.toLowerCase()` on the name and were invisible to every one of them -
   * including `normalizeDuplicateKey`, the function that decides an imported row
   * is a duplicate, which let a differently-accented spelling through as a new
   * opportunity at the exact moment the operator was being shown a duplicate
   * check.
   *
   * So this one matches a lowercase on a *name-bearing expression*, with or
   * without the trim.
   *
   * A bare `.name` is not enough to go on: `file.name.toLowerCase()` on an
   * uploaded zip is not a customer, and flagging it would put a permanent false
   * positive in the check. The receivers that do carry a person's name are
   * listed instead.
   */
  const NAME_FIELDS = 'accountName|opportunityName|stakeholderName|contactName'
    + '|linkedAccountName|linkedOpportunityName'
    + '|(?:stakeholder|person|contact|candidate|account|memory|node)\\.name';
  const nameLowercase = new RegExp(
    `(?:${NAME_FIELDS})\\s*(?:\\|\\|\\s*''\\s*)?\\)?\\s*\\.\\s*(?:trim\\(\\)\\s*\\.\\s*)?toLowerCase\\(\\)`,
  );

  const lowercaseOffenders = [...collect('src/utils'), ...collect('src/features')]
    .filter((file) => {
      const code = readSourceFile(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return nameLowercase.test(code);
    });

  assert.deepEqual(
    lowercaseOffenders,
    [],
    'these lowercase a name instead of folding it with normalizeEntityName, so '
    + `a diacritic makes two records of one: ${lowercaseOffenders.join(', ')}`,
  );
}

console.log('Account link contract verified, and names are matched in exactly one way.');
