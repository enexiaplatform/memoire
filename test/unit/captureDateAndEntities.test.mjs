import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifySalesActivity,
  commitmentScope,
  extractDueDate,
  suggestOpportunityFromNote,
} from '../../src/utils/salesActivityClassifier.ts';
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

describe('a deadline is read off the promise, not off the story', () => {
  const SATURDAY = '2026-08-15';

  test('the day the call happened is not the day the quote is due', () => {
    // "Called Minh at Dai Viet Steel today. ... I need to send the quote before
    // Friday." came out dated today, because the whole note was scanned and the
    // `today` describing the call matched first. The plan then showed the
    // commitment on the wrong day, which is the one thing this product sells.
    const note = 'Called Minh at Dai Viet Steel today. They are interested in 12 tons of steel tube. I need to send the quote before Friday.';
    assert.equal(extractDueDate(commitmentScope(note), SATURDAY), '2026-08-21');
  });

  test('"before Friday" is a deadline, and Friday is the next one', () => {
    // 15 August 2026 is itself a Saturday, so the answer must be the 21st.
    assert.equal(extractDueDate('send it before Friday', SATURDAY), '2026-08-21');
    assert.equal(extractDueDate('reply ahead of Monday', SATURDAY), '2026-08-17');
    assert.equal(extractDueDate('deliver no later than Wednesday', SATURDAY), '2026-08-19');
  });

  test('a note that only narrates has no deadline in it', () => {
    assert.equal(commitmentScope('Met the buyer today.'), '');
    assert.equal(extractDueDate(commitmentScope('Met the buyer today.'), SATURDAY), '');
  });

  test('a promise made for today still reads as today', () => {
    assert.equal(extractDueDate(commitmentScope('Need to send the quote today.'), SATURDAY), '2026-08-15');
  });

  test('the scope starts at the promise, wherever it sits in the paragraph', () => {
    const note = 'Met the buyer today. Need to clarify the tender timeline next week.';
    assert.equal(extractDueDate(commitmentScope(note), SATURDAY), '2026-08-22');
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

  test('a bare first name in front of a company is a person', () => {
    // Most of the world writes "Called Minh at Dai Viet Steel", not "Ms. Minh".
    // Requiring the honorific left the note with no contact and, worse, filed
    // "Minh at Dai Viet Steel" as the customer - so the next note naming a
    // different colleague at the same company opened a second account.
    const resolution = resolve('Called Minh at Dai Viet Steel today. Need to send the quote before Friday.');
    assert.equal(resolution.contactName, 'Minh');
    assert.equal(resolution.accountName, 'Dai Viet Steel');
  });

  test('the same shape with "from" reads the same way', () => {
    const resolution = resolve('Met Sarah from Northwind Logistics yesterday about the renewal.');
    assert.equal(resolution.contactName, 'Sarah');
    assert.equal(resolution.accountName, 'Northwind Logistics');
  });

  test('a time is not a company, so the name in front of it is not a contact', () => {
    assert.equal(resolve('Called Minh at 9am to reschedule.').contactName, '');
  });
});

describe('the summary keeps the part somebody comes back for', () => {
  test('the sentence carrying the promise survives alongside the opening one', () => {
    const note = 'Called Minh at Dai Viet Steel today. They are interested in 12 tons. I need to send the quote before Friday.';
    const summary = classifySalesActivity(note, '2026-08-15').summary;
    assert.match(summary, /Called Minh at Dai Viet Steel today/);
    assert.match(summary, /send the quote before Friday/);
  });

  test('a note the rules could not read is kept whole, not cut to its first sentence', () => {
    // Compressing to the opening sentence only works because the structured
    // fields hold the rest. With nothing extracted, the summary is the record,
    // and the promise was in the sentence being thrown away.
    const note = 'Gọi cho anh Minh bên Thép Đại Việt, báo giá khoảng 250 triệu. Hẹn gửi báo giá trước thứ Sáu tuần này.';
    const result = classifySalesActivity(note, '2026-08-15');
    assert.equal(result.accountName, '', 'precondition: the rules read nothing out of this note');
    assert.match(result.summary, /Hẹn gửi báo giá trước thứ Sáu/);
  });
});

describe('a description of somebody is not a customer', () => {
  const resolve = (rawNote) => resolveCaptureEntities({ rawNote, accounts: [], opportunities: [] });

  test('"the buyer" does not become an account', () => {
    // The pattern carried `/i`, which made its leading `[A-Z]` decorative. A
    // phantom account then counted as a customer on the dashboard, produced its
    // own thread, and generated its own weekly suggestions.
    assert.equal(resolve('Met the buyer today.').accountName, '');
  });

  test('a properly capitalised company still resolves', () => {
    assert.equal(resolve('Met Acme Corp today').accountName, 'Acme Corp');
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

describe('a slash between two numbers is not always a date', () => {
  /**
   * The slash branch is the only one in `extractDueDate` with no keyword in
   * front of it, so it read any `n/m` in the promise as a deadline - and in this
   * trade `3/4` is a pipe size. Each note below is a real commitment, so it
   * reached the Plan carrying a date nobody wrote, months in the past, already
   * overdue on arrival.
   */
  test('a dimension inside a promise does not become a deadline', () => {
    assert.equal(extractDueDate('Need to send the quote for the 3/4 inch butterfly valve.', ANCHOR), '');
    assert.equal(extractDueDate('I will confirm the 1/2 inch fittings price.', ANCHOR), '');
    assert.equal(extractDueDate('Ship the 5/8" hose next.', ANCHOR), '');
    assert.equal(extractDueDate('Quote 2/3 of the order.', ANCHOR), '');
  });

  test('and the whole classifier no longer invents one either', () => {
    const note = 'Need to send the quote for the 3/4 inch butterfly valve.';
    assert.equal(classifySalesActivity(note, ANCHOR).dueDate, '');
  });

  test('a pair that carries a year, or a half over 12, is a date whatever follows', () => {
    assert.equal(extractDueDate('deliver 3/4/2027 as agreed', ANCHOR), '2027-04-03');
    assert.equal(extractDueDate('deliver 21/8', ANCHOR), '2026-08-21');
  });

  test('a bare date with no preposition still reads, which is why the test is on what follows', () => {
    // "chase invoice 03/09" has no keyword in front of it and is a date; a
    // keyword requirement would have thrown it away.
    assert.equal(extractDueDate('chase invoice 03/09', ANCHOR), '2026-09-03');
  });
});
