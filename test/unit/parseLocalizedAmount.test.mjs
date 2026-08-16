import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalizedAmount } from '../../src/utils/numberFormat.ts';

/**
 * An amount as somebody's spreadsheet wrote it.
 *
 * The importer assumed the Anglo convention, so a German export of eighty-five
 * thousand euros arrived as 85.0005 and a Swedish one and a quarter million
 * arrived as nothing at all.
 */
describe('parseLocalizedAmount', () => {
  test('reads the comma-decimal convention half the world writes money in', () => {
    assert.equal(parseLocalizedAmount('85.000,50'), 85000.5);
    assert.equal(parseLocalizedAmount('1.250.000'), 1250000);
    assert.equal(parseLocalizedAmount('12,5'), 12.5);
    assert.equal(parseLocalizedAmount('1 234 567,89'), 1234567.89, 'a space is a grouping separator too');
  });

  test('reads the dot-decimal convention', () => {
    assert.equal(parseLocalizedAmount('55,000.75'), 55000.75);
    assert.equal(parseLocalizedAmount('1.25'), 1.25);
    assert.equal(parseLocalizedAmount('120000'), 120000);
  });

  test('three digits after the last separator is grouping, not a decimal', () => {
    // The rule a person uses reading it: "1.250" is one thousand two hundred
    // and fifty, "1.25" is one and a quarter.
    assert.equal(parseLocalizedAmount('1.250'), 1250);
    assert.equal(parseLocalizedAmount('1,250'), 1250);
  });

  test('currency symbols, spaces and accounting negatives', () => {
    assert.equal(parseLocalizedAmount('€ 96 000,00'), 96000);
    assert.equal(parseLocalizedAmount('$55,000'), 55000);
    assert.equal(parseLocalizedAmount('(2,500.00)'), -2500, 'a bracketed figure is negative in an export');
    assert.equal(parseLocalizedAmount('-1.500,25'), -1500.25);
  });

  test('nothing readable is null, never zero', () => {
    // Zero would be a number the row does not have, and "Missing value." is the
    // warning the operator needs instead.
    assert.equal(parseLocalizedAmount(''), null);
    assert.equal(parseLocalizedAmount('   '), null);
    assert.equal(parseLocalizedAmount('n/a'), null);
    assert.equal(parseLocalizedAmount(undefined), null);
    assert.equal(parseLocalizedAmount(42), 42, 'a number passes through');
  });
});
