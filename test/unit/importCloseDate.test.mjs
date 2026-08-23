import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseCsvCloseDate, parseOpportunityCsv } from '../../src/utils/opportunityCsvImport.ts';

describe('a close date out of a CRM export', () => {
  test('the ISO form every export writes', () => {
    assert.equal(parseCsvCloseDate('2026-03-06'), '2026-03-06');
    assert.equal(parseCsvCloseDate('2026-03-06T00:00:00Z'), '2026-03-06');
  });

  test('a part above twelve can only be a day', () => {
    assert.equal(parseCsvCloseDate('19/06/2026'), '2026-06-19');
    assert.equal(parseCsvCloseDate('06/19/2026'), '2026-06-19');
  });

  test('an ambiguous pair is read day-first, like the date inputs beside it', () => {
    assert.equal(parseCsvCloseDate('06/03/2026'), '2026-03-06');
  });

  test('month names in either order', () => {
    assert.equal(parseCsvCloseDate('14 May 2026'), '2026-05-14');
    assert.equal(parseCsvCloseDate('May 14, 2026'), '2026-05-14');
  });

  test('a quarter is not a date and is not guessed at', () => {
    assert.equal(parseCsvCloseDate('Q3 2026'), '');
    assert.equal(parseCsvCloseDate('FY27'), '');
    assert.equal(parseCsvCloseDate('next quarter'), '');
    assert.equal(parseCsvCloseDate(''), '');
  });

  test('an impossible date is refused rather than rolled over', () => {
    assert.equal(parseCsvCloseDate('2026-02-31'), '');
  });
});

describe('importing a book that already has history', () => {
  const csv = [
    'Account Name,Opportunity Name,Stage,Value,Currency,Close Date,Status',
    'Amorim Cork,Compressed air leak programme,Won,74000,EUR,2026-05-14,Won',
    'Sonae MC,Store refrigeration pilot,Lost,145000,EUR,2026-04-02,Lost',
    'Gallo Vidro,Furnace ORC feasibility,Discovery,540000,EUR,2027-01-31,Active',
  ].join('\n');

  test('a closed deal carries the day it closed', () => {
    const result = parseOpportunityCsv(csv);
    const won = result.rows.find((row) => row.input.accountName === 'Amorim Cork');
    const lost = result.rows.find((row) => row.input.accountName === 'Sonae MC');
    assert.equal(won.input.closedOn, '2026-05-14');
    assert.equal(lost.input.closedOn, '2026-04-02');
  });

  test('an open deal keeps its close date as a forecast, not a fact', () => {
    // On an open deal the same column is when we *expect* to close, and
    // stamping that on the record as a close date would date an order that
    // does not exist yet.
    const result = parseOpportunityCsv(csv);
    const open = result.rows.find((row) => row.input.accountName === 'Gallo Vidro');
    assert.equal(open.input.closedOn, undefined);
    assert.equal(open.input.expectedClosePeriod, '2027-01-31');
  });
});
