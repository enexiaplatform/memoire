import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { extractDueDate, suggestOpportunityFromNote } from '../../src/utils/salesActivityClassifier.ts';
import { resolveCaptureEntities } from '../../src/utils/captureEntityResolution.ts';
import { formatCount, formatBytes } from '../../src/utils/numberFormat.ts';

const ANCHOR = '2026-08-07';

describe('a slash date in a note is read the way the operator wrote it', () => {
  test('day first, matching the date inputs beside it', () => {
    // "12/08/2026" was read as December 8th while the date input two inches
    // away rendered 7 August 2026 as "07/08/2026". Four months apart, on a
    // product whose promise is that a deal will not go quiet on you.
    assert.equal(extractDueDate('Next action: send quotation by 12/08/2026', ANCHOR), '2026-08-12');
  });

  test('a first part above 12 can only be a day', () => {
    assert.equal(extractDueDate('follow up 25/12/2026', ANCHOR), '2026-12-25');
  });

  test('a second part above 12 can only be a month, so the pair is month-first', () => {
    // A note is not a form, and people paste both orders.
    assert.equal(extractDueDate('follow up 12/25/2026', ANCHOR), '2026-12-25');
  });

  test('a missing year takes the activity date\'s year', () => {
    assert.equal(extractDueDate('chase invoice 03/09', ANCHOR), '2026-09-03');
  });

  test('a two-digit year is this century', () => {
    assert.equal(extractDueDate('deliver by 15/06/27', ANCHOR), '2027-06-15');
  });

  test('an ISO date still wins outright', () => {
    assert.equal(extractDueDate('due 2026-11-30 at the latest', ANCHOR), '2026-11-30');
  });

  test('an impossible date is refused rather than rounded into a real one', () => {
    assert.equal(extractDueDate('by 45/99/2026', ANCHOR), '');
  });
});

describe('the named person in a note', () => {
  const resolve = (rawNote) => resolveCaptureEntities({ rawNote, accounts: [], opportunities: [] });

  test('the commonest sentence a seller writes resolves to somebody', () => {
    // The lookahead used to demand "at"/"from", a comma or a full stop right
    // behind the name, so "Ms. Huyen is the buyer" resolved to nobody.
    assert.equal(resolve('Ms. Huyen is the buyer.').contactName, 'Ms. Huyen');
  });

  test('a name followed by a place still resolves, and stops at the place', () => {
    assert.equal(resolve('Called Ms. Huyen at Rohto about the quotation').contactName, 'Ms. Huyen');
  });

  test('a multi-part name is kept whole', () => {
    assert.equal(resolve('Met Mr. Nguyen Van An from Pymepharco yesterday.').contactName, 'Mr. Nguyen Van An');
  });

  test('an ordinary sentence with no honorific names nobody', () => {
    assert.equal(resolve('Sent the revised pricing sheet through.').contactName, '');
  });
});

describe('a note is not matched to a deal by accident', () => {
  test('a deal with no account name does not match every note ever typed', () => {
    // `normalize('')` is `''`, and every string contains the empty string. That
    // scored 2 - the acceptance threshold - for any deal with a blank account,
    // so an unrelated deal was offered first and labelled High confidence.
    const blankAccount = {
      id: 'opp-1',
      accountName: '',
      opportunityName: 'Vemedim / MicronView',
      productOrSolution: '',
      stage: 'Discovery',
    };

    assert.equal(suggestOpportunityFromNote('Called Ms. Huyen at Rohto about the BAS Pro quotation', [blankAccount]), null);
  });

  test('a deal the note actually names is still matched', () => {
    const real = {
      id: 'opp-2',
      accountName: 'Rohto',
      opportunityName: 'Rohto BAS Pro',
      productOrSolution: 'BAS Pro',
      stage: 'Proposal',
    };

    assert.equal(suggestOpportunityFromNote('Called Ms. Huyen at Rohto about the BAS Pro quotation', [real])?.id, 'opp-2');
  });
});

describe('a count is written the same way as money', () => {
  test('English separators, whatever the machine locale', () => {
    // A Vietnamese machine rendered "CUSTOMERS 1.010" beside "117,400 SGD" on
    // the same screen. "1.010" reads as one-point-oh-one.
    assert.equal(formatCount(1010), '1,010');
    assert.equal(formatCount(1738), '1,738');
  });

  test('a missing count is zero, not NaN', () => {
    assert.equal(formatCount(null), '0');
    assert.equal(formatCount(Number.NaN), '0');
  });

  test('bytes climb past MB, so a 10 GB quota is not "10277.2 MB"', () => {
    assert.equal(formatBytes(10_777_216_000), '10 GB');
    assert.equal(formatBytes(98_304), '96 KB');
    assert.equal(formatBytes(0), '0 B');
  });
});
