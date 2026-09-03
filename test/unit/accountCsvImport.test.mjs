import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_CSV_TEMPLATE,
  getAccountCsvHeaders,
  getImportableAccountRows,
  parseAccountCsv,
  suggestAccountFieldMap,
  summarizeAccountCsvRows,
} from '../../src/utils/accountCsvImport.ts';
import { buildAccountAliasIndex } from '../../src/utils/accountAliases.ts';

/**
 * The first hour of somebody who already has a book of customers.
 *
 * The failure that matters here is not a crash - it is an import that quietly
 * creates a second "VNVC" because the file spelled it differently, or one that
 * reads "A" in a tier column as a potential this product does not have. Both
 * produce records that look imported and are wrong, and both are worse than a
 * row the operator has to fix by hand.
 */

const existing = (accountName) => ({
  id: accountName,
  accountName,
  segment: '',
  industry: '',
  location: '',
  accountPotential: 'Unknown',
  relationshipStatus: 'New',
  keyStakeholders: [],
  notes: '',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  storageMode: 'local',
});

describe('account CSV: reading the header', () => {
  test('recognises the column names a real export uses', () => {
    const map = suggestAccountFieldMap(['Customer', 'Vertical', 'City', 'Tier', 'Relationship', 'Contacts', 'Notes']);
    assert.equal(map.Customer, 'accountName');
    assert.equal(map.Vertical, 'segment');
    assert.equal(map.City, 'location');
    assert.equal(map.Tier, 'accountPotential');
    assert.equal(map.Relationship, 'relationshipStatus');
    assert.equal(map.Contacts, 'keyStakeholders');
    assert.equal(map.Notes, 'notes');
  });

  test('a field is claimed once, so a second candidate column is left alone', () => {
    // A sheet with both "Customer" and "Company" must not map both onto the
    // account name and let column order decide which one wins.
    const map = suggestAccountFieldMap(['Customer', 'Company']);
    assert.equal(map.Customer, 'accountName');
    assert.equal(map.Company, 'ignore');
  });

  test('an unknown column is ignored rather than guessed at', () => {
    const map = suggestAccountFieldMap(['Account', 'Internal Ref 4']);
    assert.equal(map.Account, 'accountName');
    assert.equal(map['Internal Ref 4'], 'ignore');
  });

  test('the shipped template parses with the mapping it was written for', () => {
    const headers = getAccountCsvHeaders(ACCOUNT_CSV_TEMPLATE);
    const result = parseAccountCsv(ACCOUNT_CSV_TEMPLATE);

    assert.deepEqual(headers[0], 'Account Name');
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows.length, 1);
    // The template names nobody: every free-text column is a <slot> the
    // operator replaces, and only the fixed-vocabulary columns carry a real
    // value. What is asserted here is that the columns still land in the right
    // fields and that the two multi-value columns still split.
    assert.equal(result.rows[0].input.accountName, '<company name>');
    assert.equal(result.rows[0].input.accountPotential, 'High');
    assert.equal(result.rows[0].input.relationshipStatus, 'Developing');
    assert.deepEqual(result.rows[0].input.keyStakeholders, ['<name> (<role>)', '<name> (<role>)']);
    assert.deepEqual(result.rows[0].input.tags, ['<tag>', '<tag>']);
  });
});

describe('account CSV: the same customer twice', () => {
  test('punctuation and diacritics are not a different customer', () => {
    const csv = [
      'Account,Segment',
      'VNVC.,Vaccine',
      'Cong ty Duoc,Pharma',
    ].join('\n');
    const result = parseAccountCsv(csv, [existing('VNVC'), existing('Công ty Dược')]);

    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].isDuplicate, true);
    assert.match(result.rows[0].duplicateReason, /already exists/);
    assert.match(result.rows[0].warnings.join(' '), /already in the workspace/);
    assert.equal(result.rows[1].isDuplicate, true, 'the accented spelling is the same account');
  });

  test('a name the operator already merged away comes back as the account they kept', () => {
    // Without this, re-exporting the same spreadsheet re-creates every account
    // the operator has spent time merging - and does it silently.
    const aliases = buildAccountAliasIndex([
      { id: 'm1', kind: 'merge', canonicalAccountName: 'DP Lab', mergedNames: ['DPLab Vietnam'] },
    ]);
    const csv = ['Account', 'DPLab Vietnam'].join('\n');

    assert.equal(parseAccountCsv(csv, [existing('DP Lab')]).rows[0].isDuplicate, false);
    assert.equal(parseAccountCsv(csv, [existing('DP Lab')], {}, aliases).rows[0].isDuplicate, true);
  });

  test('a name repeated inside the file is flagged on the second appearance only', () => {
    const csv = [
      'Account,Segment',
      'Orion Pharma,Pharma',
      'orion  pharma,Pharma',
    ].join('\n');
    const result = parseAccountCsv(csv);

    assert.equal(result.rows[0].isDuplicate, false);
    assert.equal(result.rows[1].isDuplicate, true);
    assert.match(result.rows[1].duplicateReason, /Repeated row/);
  });

  test('duplicates are excluded from what gets written unless asked for', () => {
    const csv = [
      'Account',
      'Orion Pharma',
      'Orion Pharma',
      '',
    ].join('\n');
    const result = parseAccountCsv(csv);

    assert.equal(getImportableAccountRows(result.rows, { skipDuplicates: true }).length, 1);
    assert.equal(getImportableAccountRows(result.rows, { skipDuplicates: false }).length, 2);
  });
});

describe('account CSV: reading the cells', () => {
  test('a potential the product does not have becomes the honest default', () => {
    const csv = [
      'Account,Potential,Relationship',
      'Alpha,HIGH,strong',
      'Beta,A,Platinum',
    ].join('\n');
    const result = parseAccountCsv(csv);

    assert.equal(result.rows[0].input.accountPotential, 'High', 'case is not a different answer');
    assert.equal(result.rows[0].input.relationshipStatus, 'Strong');
    assert.equal(result.rows[1].input.accountPotential, 'Unknown', '"A" is not a tier this product has');
    assert.equal(result.rows[1].input.relationshipStatus, 'New');
  });

  test('contacts split on semicolons and keep the commas inside a role', () => {
    const csv = [
      'Account,Contacts',
      'Alpha,"Ms. Lan (QA, Head); Mr. Minh"',
    ].join('\n');
    const result = parseAccountCsv(csv);

    assert.deepEqual(result.rows[0].input.keyStakeholders, ['Ms. Lan (QA, Head)', 'Mr. Minh']);
  });

  test('quoted fields, escaped quotes and CRLF survive the reader', () => {
    const csv = 'Account,Notes\r\n"Alpha ""HQ""","Tender, then delivery"\r\n';
    const result = parseAccountCsv(csv);

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].input.accountName, 'Alpha "HQ"');
    assert.equal(result.rows[0].input.notes, 'Tender, then delivery');
  });

  test('a row with no name is kept in the preview but cannot be imported', () => {
    const csv = [
      'Account,Segment',
      ',Pharma',
      'Alpha,Pharma',
    ].join('\n');
    const result = parseAccountCsv(csv);

    assert.equal(result.rows[0].isValid, false);
    assert.match(result.rows[0].warnings.join(' '), /No account name/);
    assert.equal(getImportableAccountRows(result.rows, { skipDuplicates: true }).length, 1);
  });

  test('an explicit mapping overrides what the header text suggests', () => {
    const csv = [
      'Name,Detail',
      'Alpha,Pharma',
    ].join('\n');
    const result = parseAccountCsv(csv, [], { Name: 'accountName', Detail: 'industry' });

    assert.equal(result.rows[0].input.industry, 'Pharma');
    assert.equal(result.rows[0].input.segment, '');
  });

  test('a column mapped to ignore is not written anywhere', () => {
    const csv = [
      'Account,Notes',
      'Alpha,Internal only',
    ].join('\n');
    const result = parseAccountCsv(csv, [], { Account: 'accountName', Notes: 'ignore' });

    assert.equal(result.rows[0].input.notes, '');
    assert.equal(result.rows[0].raw.Notes, 'Internal only', 'the cell is still shown in the preview');
  });
});

describe('account CSV: what the operator is told before writing', () => {
  test('empty input and a header-only file both say what to do next', () => {
    assert.match(parseAccountCsv('   ').errors[0], /Paste or upload/);
    assert.match(parseAccountCsv('Account,Segment').errors[0], /header row and at least one/);
  });

  test('the summary separates what will be created from what will not', () => {
    const csv = [
      'Account,Segment',
      'Alpha,Pharma',
      'Alpha,Pharma',
      ',Pharma',
      'Beta,',
    ].join('\n');
    const summary = summarizeAccountCsvRows(parseAccountCsv(csv).rows);

    assert.deepEqual(
      { total: summary.total, importable: summary.importable, duplicates: summary.duplicates, invalid: summary.invalid },
      { total: 4, importable: 2, duplicates: 1, invalid: 1 },
    );
  });

  test('a row with no segment or industry is imported, and says so', () => {
    const result = parseAccountCsv(['Account', 'Alpha'].join('\n'));
    assert.equal(result.rows[0].isValid, true);
    assert.match(result.rows[0].warnings.join(' '), /No segment or industry/);
  });
});
