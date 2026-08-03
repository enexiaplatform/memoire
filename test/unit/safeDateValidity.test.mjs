import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isValidBusinessDate, formatSafeBusinessDate } from '../../src/utils/safeDate.ts';

/**
 * `isValidBusinessDate` decides whether a stored string is a real date, and
 * almost every dated thing in the product asks it - which is why it was one of
 * the most expensive functions in a profile, and why it stopped allocating a
 * `Date` per call on 2026-08-02 to answer "does the 31st of February exist".
 *
 * Rewriting a correctness function for speed is exactly the change that quietly
 * breaks a calendar, so the calendar is pinned here: month lengths, all three
 * leap-year rules, and the boundaries the old implementation enforced.
 */

describe('business date validity', () => {
  test('accepts real dates and the formats the product stores', () => {
    for (const value of ['2026-01-01', '2026-07-04', '2026-12-31', '2000-01-01', ' 2026-07-04 ']) {
      assert.equal(isValidBusinessDate(value), true, `${value} is a real date`);
    }
  });

  test('rejects days a month does not have', () => {
    for (const value of ['2026-02-29', '2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31', '2026-01-32']) {
      assert.equal(isValidBusinessDate(value), false, `${value} does not exist`);
    }
  });

  test('every month keeps its own length', () => {
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    lengths.forEach((length, index) => {
      const month = String(index + 1).padStart(2, '0');
      assert.equal(isValidBusinessDate(`2026-${month}-${String(length).padStart(2, '0')}`), true);
      assert.equal(isValidBusinessDate(`2026-${month}-${String(length + 1).padStart(2, '0')}`), false);
    });
  });

  test('all three leap-year rules, not just the first one', () => {
    assert.equal(isValidBusinessDate('2024-02-29'), true, 'divisible by four is a leap year');
    assert.equal(isValidBusinessDate('2100-02-29'), false, 'a century is not, unless');
    assert.equal(isValidBusinessDate('2000-02-29'), true, '...it is divisible by four hundred');
    assert.equal(isValidBusinessDate('2026-02-29'), false, 'an ordinary year has no 29th');
  });

  test('rejects impossible months and days outright', () => {
    for (const value of ['2026-00-10', '2026-13-01', '2026-01-00']) {
      assert.equal(isValidBusinessDate(value), false, `${value} is not a date`);
    }
  });

  test('rejects anything before the floor, and anything that is not a date key', () => {
    assert.equal(isValidBusinessDate('1999-12-31'), false, 'below MIN_BUSINESS_DATE');
    for (const value of ['', 'not-a-date', '2026/07/04', '04-07-2026', '2026-7-4', 42, null, undefined, {}]) {
      assert.equal(isValidBusinessDate(value), false, `${JSON.stringify(value)} is not a date key`);
    }
  });

  test('formatting still reads a valid date and labels the rest', () => {
    assert.equal(formatSafeBusinessDate('2026-07-04'), 'Jul 4, 2026');
    assert.equal(formatSafeBusinessDate(''), 'No due date');
    assert.equal(formatSafeBusinessDate('2026-02-29'), 'Needs date correction');
    // The shared formatter is reused across calls; this is here so a future
    // caching change cannot make the second call disagree with the first.
    assert.equal(formatSafeBusinessDate('2026-01-15'), formatSafeBusinessDate('2026-01-15'));
    assert.notEqual(formatSafeBusinessDate('2026-01-15'), formatSafeBusinessDate('2026-01-16'));
  });
});
