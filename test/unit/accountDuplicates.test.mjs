import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAccountNames, findDuplicateAccountGroups, pairKey } from '../../src/utils/accountDuplicates.ts';

const base = { opportunities: [], activities: [] };

test('the same name with a different legal form is certain', () => {
  const match = compareAccountNames('Apex Labs', 'Apex Labs Ltd');
  assert.equal(match.confidence, 'certain');
});

test('punctuation-only differences are certain', () => {
  assert.equal(compareAccountNames('VNVC', 'VNVC.').confidence, 'certain');
});

test('one name being the other plus a word or two is likely, not certain', () => {
  const match = compareAccountNames('VNVC', 'VNVC Vietnam');
  assert.equal(match.confidence, 'likely');
});

test('different companies are never proposed', () => {
  assert.equal(compareAccountNames('Apex Labs', 'Northstar Foods'), null);
  assert.equal(compareAccountNames('Apex Labs', 'Apex Foods'), null);
  assert.equal(compareAccountNames('Summit Diagnostics', 'Summit Pharma'), null);
});

test('a shared first word alone is not enough', () => {
  // Real, common, and genuinely separate customers.
  assert.equal(compareAccountNames('Vietnam Airlines', 'Vietnam Post'), null);
});

test('an extra name far longer than the first is not a match', () => {
  assert.equal(compareAccountNames('Apex', 'Apex Labs Vietnam Distribution Partner'), null);
});

test('legal-form-only names produce no match', () => {
  assert.equal(compareAccountNames('Ltd', 'Co'), null);
});

test('groups carry the evidence behind them', () => {
  const groups = findDuplicateAccountGroups({
    accounts: [
      { id: 'a1', accountName: 'Apex Labs' },
      { id: 'a2', accountName: 'Apex Labs Ltd' },
    ],
    opportunities: [{ accountName: 'Apex Labs' }, { accountName: 'Apex Labs' }, { accountName: 'Apex Labs Ltd' }],
    activities: [
      { accountName: 'Apex Labs', activityDate: '2026-07-10' },
      { accountName: 'Apex Labs Ltd', activityDate: '2026-07-15' },
    ],
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].confidence, 'certain');
  const [first, second] = groups[0].members;
  assert.equal(first.accountName, 'Apex Labs');
  assert.equal(first.opportunityCount, 2, 'the busier record sorts first');
  assert.equal(second.opportunityCount, 1);
  assert.equal(second.lastTouchDate, '2026-07-15');
});

test('already-merged names are never proposed again', () => {
  const groups = findDuplicateAccountGroups({
    ...base,
    accounts: [
      { id: 'a1', accountName: 'Apex Labs' },
      { id: 'a2', accountName: 'Apex Labs Ltd' },
    ],
    resolvedNames: ['Apex Labs Ltd'],
  });
  assert.equal(groups.length, 0);
});

test('a rejected pair is never asked twice', () => {
  const groups = findDuplicateAccountGroups({
    ...base,
    accounts: [
      { id: 'a1', accountName: 'VNVC' },
      { id: 'a2', accountName: 'VNVC Vietnam' },
    ],
    dismissedPairs: [pairKey('VNVC', 'VNVC Vietnam')],
  });
  assert.equal(groups.length, 0);
});

test('a single account never forms a group', () => {
  const groups = findDuplicateAccountGroups({ ...base, accounts: [{ id: 'a1', accountName: 'Apex Labs' }] });
  assert.equal(groups.length, 0);
});

test('certain groups outrank likely ones', () => {
  const groups = findDuplicateAccountGroups({
    ...base,
    accounts: [
      { id: 'a1', accountName: 'VNVC' },
      { id: 'a2', accountName: 'VNVC Vietnam' },
      { id: 'a3', accountName: 'Apex Labs' },
      { id: 'a4', accountName: 'Apex Labs JSC' },
    ],
  });
  assert.equal(groups.length, 2);
  assert.equal(groups[0].confidence, 'certain');
  assert.equal(groups[1].confidence, 'likely');
});
