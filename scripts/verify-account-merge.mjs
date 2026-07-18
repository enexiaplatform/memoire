import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { compareAccountNames, findDuplicateAccountGroups, pairKey } from '../src/utils/accountDuplicates.ts';

/**
 * Merging two accounts is a claim about the user's customers, so the bar is
 * precision, not recall: a missed duplicate is an inconvenience, a false one
 * buries a customer's history under a name they do not recognise.
 */

// 1. Precision. Companies that merely share a word are never proposed.
{
  for (const [left, right] of [
    ['Apex Labs', 'Northstar Foods'],
    ['Apex Labs', 'Apex Foods'],
    ['Vietnam Airlines', 'Vietnam Post'],
    ['Summit Diagnostics', 'Summit Pharma'],
    ['Ltd', 'Co'],
  ]) {
    assert.equal(compareAccountNames(left, right), null, `must not propose ${left} = ${right}`);
  }
}

// 2. Recall on the two cases the canonical resolver genuinely cannot collapse.
{
  assert.equal(compareAccountNames('Apex Labs', 'Apex Labs Ltd').confidence, 'certain');
  assert.equal(compareAccountNames('Apex Labs', 'Apex Labs JSC').confidence, 'certain');
  assert.equal(compareAccountNames('VNVC', 'VNVC Vietnam').confidence, 'likely');
}

// 3. A refusal sticks. The same discipline the plan suggestions use: a question
//    the user has answered is never asked again.
{
  const accounts = [
    { id: 'a1', accountName: 'VNVC' },
    { id: 'a2', accountName: 'VNVC Vietnam' },
  ];
  const before = findDuplicateAccountGroups({ accounts, opportunities: [], activities: [] });
  assert.equal(before.length, 1);

  const after = findDuplicateAccountGroups({
    accounts,
    opportunities: [],
    activities: [],
    dismissedPairs: [pairKey('VNVC', 'VNVC Vietnam')],
  });
  assert.equal(after.length, 0, 'a dismissed pair never returns');

  const merged = findDuplicateAccountGroups({
    accounts,
    opportunities: [],
    activities: [],
    resolvedNames: ['VNVC Vietnam'],
  });
  assert.equal(merged.length, 0, 'a merged-away name is never proposed again');
}

// 4. Every proposal carries the evidence for judging it.
{
  const [group] = findDuplicateAccountGroups({
    accounts: [{ id: 'a1', accountName: 'Apex Labs' }, { id: 'a2', accountName: 'Apex Labs Ltd' }],
    opportunities: [{ accountName: 'Apex Labs' }],
    activities: [{ accountName: 'Apex Labs Ltd', activityDate: '2026-07-15' }],
  });
  assert.ok(group.reason.length > 0, 'the rule that fired is stated');
  group.members.forEach((member) => {
    assert.equal(typeof member.opportunityCount, 'number');
    assert.equal(typeof member.activityCount, 'number');
  });
}

// 5. A merge is a decision, not a rewrite. Nothing in the merge path may edit
//    an opportunity or activity - that is what keeps it reversible.
{
  const store = readFileSync(new URL('../src/services/accountMergeStore.ts', import.meta.url), 'utf8');
  assert.ok(
    !/opportunityStore|salesActivityStore|accountStore/.test(store),
    'the merge store never writes to the records it describes',
  );
  assert.match(store, /'account_merges'/, 'merges ride the JSON-collection pattern');

  const page = readFileSync(new URL('../src/features/accounts/AccountsPage.tsx', import.meta.url), 'utf8');
  const mergeHandler = page.slice(page.indexOf('const handleMergeAccounts'), page.indexOf('const handleDismissDuplicate'));
  assert.ok(
    !/deleteAccount|updateAccount|saveAccount\b/.test(mergeHandler),
    'merging deletes and edits nothing - the losing record survives so undo is possible',
  );
  assert.match(page, /handleUndoMerge/, 'a merge can be undone');
}

// 6. The merge actually moves the numbers. Without alternate names reaching
//    buildAccountMemory it would be cosmetic: one row fewer, same split memory.
{
  const memory = readFileSync(new URL('../src/utils/accountMemory.ts', import.meta.url), 'utf8');
  assert.match(memory, /alternateNames: string\[\] = \[\]/, 'account memory accepts merged names');
  assert.match(memory, /alternateNames\.some\(/, 'and matches deals and activities against them');

  const page = readFileSync(new URL('../src/features/accounts/AccountsPage.tsx', import.meta.url), 'utf8');
  const buildCalls = page.match(/buildAccountMemory\(/g) || [];
  const withAlternates = page.match(/alternateNamesFor\(/g) || [];
  assert.ok(
    withAlternates.length >= buildCalls.length,
    `every account-memory build passes merged names (${buildCalls.length} builds, ${withAlternates.length} alternate lookups)`,
  );
}

// 7. No new endpoint. Vercel Hobby caps api/ at 12 functions.
{
  const apiFunctions = readdirSync(new URL('../api/', import.meta.url))
    .filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(apiFunctions.length <= 12, `api/ must stay within the Hobby cap (found ${apiFunctions.length})`);
}

console.log('Account merge contract verified.');
