import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_TYPO_MAX_DISTANCE,
  compareAccountNames,
  findDuplicateAccountGroups,
  findSimilarAccountName,
  pairKey,
} from '../../src/utils/accountDuplicates.ts';

const base = { opportunities: [], activities: [] };

test('a one-letter slip is caught for asking, though never for merging', () => {
  // The exact case from the deal form: "Trust Farma" typed over a workspace that
  // already has "Trust Farm" with deals on it.
  assert.equal(compareAccountNames('Trust Farma', 'Trust Farm'), null, 'too risky to merge on');

  const similar = findSimilarAccountName('Trust Farma', ['Euvipharm', 'Trust Farm', 'VNVC']);
  assert.equal(similar.name, 'Trust Farm');
  assert.equal(similar.distance, 1);
});

test('the nearest name wins when several are close', () => {
  const similar = findSimilarAccountName('Bidipharm', ['Bidiphar', 'Bidipharma']);
  assert.equal(similar.name, 'Bidiphar');
  assert.equal(similar.distance, 1);
});

test('short names are left alone, because one letter really does separate them', () => {
  assert.equal(findSimilarAccountName('MDL', ['MDK', 'MDF']), null);
  assert.equal(findSimilarAccountName('VNVC', ['VNVA']), null);
});

test('a name that is already known is not offered as its own near-miss', () => {
  assert.equal(findSimilarAccountName('Trust Farm', ['Trust Farm']), null);
  assert.equal(findSimilarAccountName('trust  farm.', ['Trust Farm']), null, 'the same key is not a near-miss');
});

test('genuinely different customers are not offered', () => {
  assert.equal(findSimilarAccountName('Euvipharm', ['Trust Farm', 'VNVC', 'Northstar Foods']), null);
  assert.equal(
    findSimilarAccountName('Apex Labs', ['Orion Pharma']),
    null,
    `more than ${ACCOUNT_TYPO_MAX_DISTANCE} edits apart`,
  );
});

test('the same name with a different legal form is certain', () => {
  const match = compareAccountNames('Apex Labs', 'Apex Labs Ltd');
  assert.equal(match.confidence, 'certain');
});

test('punctuation-only differences are certain', () => {
  assert.equal(compareAccountNames('VNVC', 'VNVC.').confidence, 'certain');
});

test('the same name written with and without a space is certain', () => {
  // Taken from a real weekly plan: the same customer appears as "[DP Lab]" on
  // one line and "[DPLab]" two lines later.
  assert.equal(compareAccountNames('DP Lab', 'DPLab').confidence, 'certain');
  assert.equal(compareAccountNames('NamKhoa', 'Nam Khoa').confidence, 'certain');
  assert.equal(compareAccountNames('DHG Pharma', 'DHGPharma').confidence, 'certain');
});

test('closing a space does not merge genuinely different companies', () => {
  assert.equal(compareAccountNames('DP Lab', 'DP Labs Vietnam Distribution'), null);
  assert.equal(compareAccountNames('Nam Khoa', 'Nam Long'), null);
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
