import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The first hour of somebody who already sells.
 *
 * Every other surface in this product assumes the book of customers exists.
 * Until 2026-08-03 the only ways to put it there were to type accounts one at a
 * time, or to import a pipeline CSV and let accounts appear as a by-product -
 * a name, and nothing else. A distributor with two hundred customers in a
 * spreadsheet had no first hour at all, and the trial ended on day one.
 *
 * What this pins is not "an import exists". It is the three things that make an
 * import trustworthy enough to run against a real book: the operator sees what
 * was read before anything is written, sameness is decided the way the rest of
 * the app decides it, and a value the product cannot read becomes an honest
 * blank rather than an invented one.
 */

const model = readFileSync('src/utils/accountCsvImport.ts', 'utf8');
const panel = readFileSync('src/features/accounts/AccountImportPanel.tsx', 'utf8');
const page = readFileSync('src/features/accounts/AccountsPage.tsx', 'utf8');
const store = readFileSync('src/services/accountStore.ts', 'utf8');

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};

const { parseAccountCsv, getImportableAccountRows } = await import('../src/utils/accountCsvImport.ts');
const { buildAccountAliasIndex } = await import('../src/utils/accountAliases.ts');
const { createAccounts, ACCOUNT_STORAGE_KEY } = await import('../src/services/accountStore.ts');

const existingAccount = (accountName) => ({
  id: accountName, accountName, segment: '', industry: '', location: '',
  accountPotential: 'Unknown', relationshipStatus: 'New', keyStakeholders: [], notes: '', tags: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', storageMode: 'local',
});

// 1. The route in exists, and it is reachable from the two places somebody
//    looks for it: the toolbar of the page they are on, and the empty state
//    that is the only thing a brand new workspace shows them.
{
  assert.match(page, /AccountImportPanel/, 'the Accounts page mounts the import panel');
  assert.match(page, /Import your customer list/, 'an empty workspace offers the import first');
  assert.match(panel, /accept="\.csv,text\/csv"/, 'a file can be uploaded, not only pasted');
  assert.match(panel, /ACCOUNT_CSV_TEMPLATE/, 'and there is a template to start from');
}

// 2. Nothing is written before it has been seen. The button that creates
//    records lives inside the branch that only renders once a preview exists,
//    and it says how many records it is about to create.
{
  const previewBlock = panel.slice(panel.indexOf('{parsed && summary && ('));
  assert.ok(previewBlock.length > 0, 'the preview is a conditional block');
  assert.match(previewBlock, /onClick=\{handleImport\}/, 'the create button is inside the preview block');
  assert.match(previewBlock, /Create \$\{importable\.length\} account\(s\)/, 'the button states the count it will write');
  assert.match(panel, /<PreviewTable rows=\{parsed\}/, 'the rows themselves are shown, not just a total');
  assert.match(panel, /ColumnMapping/, 'and the column mapping is on show, because a mis-read column is invisible afterwards');
}

// 3. Two spellings of one customer are one customer, decided by the same key
//    the rest of the app uses - and by the merges the operator has already
//    made. An import with its own idea of sameness spends the first hour
//    creating the duplicates the product spends its time merging.
{
  assert.match(model, /accountKey\(resolveAccountName\(name, aliases\)\)/, 'sameness is the app-wide key, after merge aliases');

  const punctuation = parseAccountCsv('Account\nVNVC.', [existingAccount('VNVC')]);
  assert.equal(punctuation.rows[0].isDuplicate, true, 'punctuation is not a different customer');

  const twice = parseAccountCsv('Account\nOrion Pharma\norion  pharma');
  assert.equal(twice.rows[0].isDuplicate, false);
  assert.equal(twice.rows[1].isDuplicate, true, 'the same name twice in one file is caught');

  const aliases = buildAccountAliasIndex([
    { id: 'm1', kind: 'merge', canonicalAccountName: 'DP Lab', mergedNames: ['DPLab Vietnam'] },
  ]);
  assert.equal(
    parseAccountCsv('Account\nDPLab Vietnam', [existingAccount('DP Lab')], {}, aliases).rows[0].isDuplicate,
    true,
    'a name the operator merged away does not come back on the next re-export',
  );

  const rows = parseAccountCsv('Account\nAlpha\nAlpha').rows;
  assert.equal(getImportableAccountRows(rows, { skipDuplicates: true }).length, 1, 'duplicates are excluded by default');
  assert.match(panel, /skipDuplicates, setSkipDuplicates\] = useState\(true\)/, 'and the default in the UI is to skip them');
}

// 4. A value this product does not have becomes the honest default. The
//    alternative - mapping "Platinum" onto whichever relationship is closest -
//    puts a fact on the page that nobody typed and nobody can trace.
{
  const result = parseAccountCsv('Account,Potential,Relationship\nAlpha,HIGH,strong\nBeta,A,Platinum');
  assert.equal(result.rows[0].input.accountPotential, 'High', 'case is not a different answer');
  assert.equal(result.rows[1].input.accountPotential, 'Unknown');
  assert.equal(result.rows[1].input.relationshipStatus, 'New');
  assert.match(model, /const POTENTIALS: readonly string\[\] = accountPotentials/, 'the option lists come from the store, so they cannot drift');
  assert.match(model, /const RELATIONSHIPS: readonly string\[\] = relationshipStatuses/);

  const noName = parseAccountCsv('Account,Segment\n,Pharma\nAlpha,Pharma');
  assert.equal(noName.rows[0].isValid, false, 'a row with no name is shown but not written');
  assert.match(noName.rows[0].warnings.join(' '), /No account name/);
  assert.equal(getImportableAccountRows(noName.rows, { skipDuplicates: true }).length, 1);
}

// 5. Two hundred accounts is one read and one write. `createAccount` reloads
//    the whole cloud copy before every insert so the account code cannot
//    collide; called in a loop that is four hundred round trips and a
//    half-written workspace if the connection drops in the middle.
{
  assert.doesNotMatch(
    panel,
    /for \(const .* of importable|importable\.map\(async|await createAccount\(/,
    'the panel must not create accounts one at a time',
  );
  assert.match(panel, /await createAccounts\(/, 'it hands the whole batch to the store');
  assert.match(store, /function allocateAccountCodes/, 'codes for a batch are allocated from one read');
  assert.match(store, /getNextAccountCode\(accounts: AccountMemoryRecord\[\]\) \{\s*return allocateAccountCodes/, 'the single-account path uses the same allocator');

  values.clear();
  const inputs = Array.from({ length: 120 }, (_, index) => ({
    accountName: `Bulk Account ${index}`,
    segment: '', industry: '', location: '',
    accountPotential: 'Unknown', relationshipStatus: 'New',
    keyStakeholders: [], notes: '', tags: [],
  }));
  const created = await createAccounts(inputs);
  assert.equal(created.accounts.length, 120, 'every valid row is created');
  assert.equal(created.warning, undefined, 'and the local write reported no failure');

  const codes = created.accounts.map((account) => account.accountCode);
  assert.equal(new Set(codes).size, 120, 'every account gets its own code - a loop over the single-create path would repeat one');

  const stored = JSON.parse(globalThis.localStorage.getItem(ACCOUNT_STORAGE_KEY) || '[]');
  assert.equal(stored.length, 120, 'and all of them survived to storage');

  const second = await createAccounts([{
    accountName: 'Later Account', segment: '', industry: '', location: '',
    accountPotential: 'Unknown', relationshipStatus: 'New', keyStakeholders: [], notes: '', tags: [],
  }]);
  assert.ok(
    !codes.includes(second.accounts[0].accountCode),
    'a later batch does not reuse a code the first batch took',
  );

  const blank = await createAccounts([{
    accountName: '   ', segment: '', industry: '', location: '',
    accountPotential: 'Unknown', relationshipStatus: 'New', keyStakeholders: [], notes: '', tags: [],
  }]);
  assert.equal(blank.accounts.length, 0, 'a nameless row never reaches storage, whatever the caller passed');
}

// 6. A browser that refuses the write says so. An import is exactly when the
//    5MB ceiling is reached, and a silent failure here loses the whole book.
{
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
  const result = await createAccounts([{
    accountName: 'Quota Account', segment: '', industry: '', location: '',
    accountPotential: 'Unknown', relationshipStatus: 'New', keyStakeholders: [], notes: '', tags: [],
  }]);
  globalThis.localStorage.setItem = original;

  assert.ok(result.warning, 'a refused write is reported to the caller, not swallowed');
  assert.match(panel, /result\.warning/, 'and the panel shows it instead of claiming success');
}

console.log('Account import verified: previewed before it is written, duplicates decided the app-wide way, unreadable values kept honest, and a whole book written in one pass.');
