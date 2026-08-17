import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { parseCsvRows, splitCsvLine } from '../../src/utils/csvParse.ts';
import { parseOpportunityCsv } from '../../src/utils/opportunityCsvImport.ts';

/**
 * The reader used to treat a quote as a delimiter wherever it appeared, so an
 * inch mark - the character an industrial distributor writes constantly -
 * opened a quoted field that never closed and swallowed the rest of the file.
 * These are mostly about that, because it is the one that loses customers.
 */

describe('csv reader: quotes where quotes are not delimiters', () => {
  test('an inch mark mid-field is content, not syntax', () => {
    const rows = parseCsvRows('Truong Son,5" butterfly valve,85000');
    assert.deepEqual(rows, [['Truong Son', '5" butterfly valve', '85000']]);
  });

  test('one inch mark does not swallow the rows beneath it', () => {
    const rows = parseCsvRows([
      'Truong Son,5" butterfly valve,85000',
      'Beinco,Standard pump,42000',
    ].join('\n'));

    assert.equal(rows.length, 2, 'the second customer must survive the first row');
    assert.deepEqual(rows[1], ['Beinco', 'Standard pump', '42000']);
  });

  test('a properly quoted field still carries commas and newlines', () => {
    const rows = parseCsvRows('Acme,"Hanoi, Vietnam","line one\nline two",7');
    assert.deepEqual(rows, [['Acme', 'Hanoi, Vietnam', 'line one\nline two', '7']]);
  });

  test('a doubled quote inside a quoted field is one literal quote', () => {
    assert.deepEqual(parseCsvRows('a,"He said ""go""",c'), [['a', 'He said "go"', 'c']]);
  });

  test('a doubled quote outside a quoted field stays two characters', () => {
    // The brief importer's copy collapsed this to one, unconditionally.
    assert.deepEqual(parseCsvRows('a,b""c'), [['a', 'b""c']]);
  });

  test('a closed quoted field cannot be re-opened by a later stray quote', () => {
    assert.deepEqual(parseCsvRows('"a" b " c,next'), [['a b " c', 'next']]);
  });

  test('CR, LF and CRLF all end a row', () => {
    assert.deepEqual(parseCsvRows('a,b\r\nc,d\ne,f\rg,h'), [
      ['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'],
    ]);
  });

  test('splitCsvLine trims values and keeps quoted commas', () => {
    assert.deepEqual(splitCsvLine('  Acme , "Hanoi, VN" , 3'), ['Acme', 'Hanoi, VN', '3']);
  });
});

describe('opportunity import: the row that used to disappear', () => {
  test('an inch mark keeps every row, every amount and every currency', () => {
    const csv = [
      'Account,Opportunity,Amount,Currency',
      'Truong Son,5" butterfly valve,85000,EUR',
      'Beinco,Standard pump,42000,EUR',
    ].join('\n');

    const result = parseOpportunityCsv(csv, [], {});

    assert.deepEqual(result.errors, []);
    assert.equal(result.rows.length, 2, 'the import used to collapse these into one');

    const [first, second] = result.rows;
    assert.equal(first.input.accountName, 'Truong Son');
    assert.equal(first.input.opportunityName, '5" butterfly valve');
    assert.equal(first.input.estimatedValue, 85_000, 'the value used to be lost entirely');
    assert.equal(first.input.currency, 'EUR', 'and the currency used to fall back to the default');

    assert.equal(second.input.accountName, 'Beinco');
    assert.equal(second.input.estimatedValue, 42_000);
  });
});
