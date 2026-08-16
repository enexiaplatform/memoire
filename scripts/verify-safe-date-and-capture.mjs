import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifySalesActivity, extractCompetitors, extractDueDate } from '../src/utils/salesActivityClassifier.ts';
import {
  compareSafeBusinessDate,
  formatSafeBusinessDate,
  isBusinessDateOverdue,
  isValidBusinessDate,
  sanitizeBusinessDate,
  todayDateKey,
  toLocalDateKey,
  timestampToLocalDateKey,
} from '../src/utils/safeDate.ts';

assert.equal(isValidBusinessDate('2000-01-01'), true);
assert.equal(isValidBusinessDate('1999-12-31'), false);
assert.equal(isValidBusinessDate('1900-02-01'), false);
assert.equal(isValidBusinessDate('2026-02-31'), false);
assert.equal(sanitizeBusinessDate('1900-01-12'), '');
assert.equal(formatSafeBusinessDate(''), 'No due date');
assert.equal(formatSafeBusinessDate('1900-02-01'), 'Needs date correction');
assert.equal(isBusinessDateOverdue('1900-02-01', '2026-06-18'), false);
assert.ok(compareSafeBusinessDate('1900-02-01', '2026-06-18') > 0);

// todayDateKey / toLocalDateKey must use the LOCAL calendar day, never UTC.
// A late-evening timestamp in UTC+ zones (or early-morning in UTC- zones)
// is the case where toISOString().slice(0,10) silently returns the wrong day.
assert.match(todayDateKey(), /^\d{4}-\d{2}-\d{2}$/);
{
  const local = todayDateKey();
  const parts = [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, '0'), String(new Date().getDate()).padStart(2, '0')].join('-');
  assert.equal(local, parts, 'todayDateKey must equal the local calendar day');
}
{
  // A fixed instant: 2026-03-10T23:30 local. toLocalDateKey must read the local day,
  // regardless of what the UTC date would be.
  const d = new Date(2026, 2, 10, 23, 30, 0);
  assert.equal(toLocalDateKey(d), '2026-03-10', 'toLocalDateKey must use local Y/M/D');
  assert.equal(toLocalDateKey(new Date(2026, 0, 1, 0, 15, 0)), '2026-01-01');
}
{
  // timestampToLocalDateKey: date-only keys pass through; ISO timestamps convert
  // to the local calendar day; junk yields empty.
  assert.equal(timestampToLocalDateKey('2026-06-18'), '2026-06-18');
  assert.equal(timestampToLocalDateKey(''), '');
  assert.equal(timestampToLocalDateKey(undefined), '');
  assert.equal(timestampToLocalDateKey('not-a-date'), '');
  const localKeyOfInstant = toLocalDateKey(new Date('2026-06-18T09:00:00.000Z'));
  assert.equal(timestampToLocalDateKey('2026-06-18T09:00:00.000Z'), localKeyOfInstant);
  assert.match(timestampToLocalDateKey(new Date().toISOString()), /^\d{4}-\d{2}-\d{2}$/);
}
assert.equal(extractDueDate('Send quote by 02/31/2026', '2026-02-01'), '');

const note = 'Met Pymepharco today with Ms. Nhu. They are evaluating Merck EM RTU. Need to send DCM comparison quote by next Friday. Tender decision expected end of July.';
const result = classifySalesActivity(note, '2026-06-18');

// The opening sentence AND the one carrying the promise. Keeping only the first
// threw away the half somebody comes back for - on a note whose commitment the
// rules could not otherwise read, the summary was the last trace of it.
assert.equal(
  result.summary,
  'Met Pymepharco today with Ms. Nhu. Need to send DCM comparison quote by next Friday.',
);
assert.equal(result.accountName, 'Pymepharco');
assert.equal(result.contactName, 'Ms. Nhu');
assert.equal(result.opportunityName, '');
assert.equal(result.nextAction, 'Send DCM comparison quote');
assert.equal(result.dueDate, '2026-06-19');
assert.ok(result.timelineSignals.includes('Tender decision expected end of July'));
assert.ok(!JSON.stringify(result).includes('1900-'));

// A deadline written as a month name. Outside day/month-number countries this
// is how a promise is written in an email, and the parser could read none of
// it: "send a revised quote by 21 August" produced a next action with no date,
// so nothing reached the Plan and nothing was watched - while the capture
// screen told the operator their commitment had landed.
{
  assert.equal(extractDueDate('send a revised quote by 21 August', '2026-08-16'), '2026-08-21');
  assert.equal(extractDueDate('close it before Sept 3', '2026-08-16'), '2026-09-03');
  assert.equal(extractDueDate('due March 2nd 2027', '2026-08-16'), '2027-03-02');
  // A month already gone means next year - a note written in December asking for
  // the 5th of January is not asking for eleven months ago.
  assert.equal(extractDueDate('confirm by 5 January', '2026-12-20'), '2027-01-05');
  // A month and a year with no day in it is a timeline signal, not a deadline.
  assert.equal(extractDueDate('tender decision is expected March 2027', '2026-08-16'), '');
  // "may" is the commonest modal verb in a sales note before it is a month.
  assert.equal(extractDueDate('they may 3 or 4 units', '2026-08-16'), '');
  assert.equal(extractDueDate('ship by May 3', '2026-01-10'), '2026-05-03');
  // The formats that already worked keep working, in their existing order.
  assert.equal(extractDueDate('send it 2026-09-30', '2026-08-16'), '2026-09-30');
  assert.equal(extractDueDate('send it 12/08/2026', '2026-08-16'), '2026-08-12', 'slash dates stay day-first');
  assert.equal(extractDueDate('send it next Tuesday', '2026-08-16'), '2026-08-18');
}

// A competitor is a name, not the word after "versus". `/i` on the pattern made
// its leading `[A-Z]` meaningless - the same bug the account patterns were
// fixed for - so "our lead time is 10 weeks versus the local supplier" recorded
// a competitor called "the", on the deal and in every count derived from it.
{
  assert.deepEqual(
    extractCompetitors('our lead time is 10 weeks versus the local supplier at 6 weeks'),
    [],
    'an article after "versus" is not a competitor',
  );
  assert.deepEqual(extractCompetitors('Slower compared to the incumbent supplier.'), []);
  assert.deepEqual(extractCompetitors('We are measured against Q3 target.'), []);
  // ...and the names that are names still land, including two-word ones the
  // old ALL-CAPS-only tail could not hold.
  assert.deepEqual(extractCompetitors('They are comparing us against Nordic Freight.'), ['Nordic Freight']);
  assert.deepEqual(extractCompetitors('We are competing against SAP on this one.'), ['SAP']);
  assert.deepEqual(extractCompetitors('Shortlist is us vs. Acme Industrial.'), ['Acme Industrial']);
  assert.deepEqual(extractCompetitors('Incumbent Vendor is still in the loop.'), ['Incumbent Vendor']);
}

// An ambiguous slash date is read the way the operator's own machine writes
// dates. Day-first was assumed for everybody, which is right for most of the
// world and four months wrong for a seller in Chicago - the same failure the
// comment in `readSlashDate` describes, pointed the other way. The hint is the
// browser locale and it is scoped to a browser: Node reports `en-US` on its own
// `navigator`, and these scripts and the prerender step run there.
{
  const source = readFileSync('src/utils/salesActivityClassifier.ts', 'utf8');
  assert.ok(source.includes('function prefersMonthFirstDates()'), 'the month-first hint must exist');
  assert.ok(
    /typeof window === 'undefined'/.test(source.slice(source.indexOf('function prefersMonthFirstDates()'), source.indexOf('function readSlashDate'))),
    'the locale hint must only apply in a browser, or the contracts and the prerender flip with it',
  );
  // Unambiguous parts are unchanged by any of it.
  assert.equal(extractDueDate('send it 25/12/2026', '2026-08-01'), '2026-12-25');
  assert.equal(extractDueDate('send it 12/08/2026', '2026-08-01'), '2026-08-12', 'day-first stays the default off-browser');
}

// The customer in a note, when the sentence is written the way people write it.
{
  const accountOf = (note) => classifySalesActivity(note, '2026-08-16').accountName;

  // A contact introduced with their job title. The company follows the role,
  // not the name, and the note attached to nobody until it did.
  assert.equal(
    accountOf('Met Kenji Sato, procurement manager at Sakura Manufacturing, on site today.'),
    'Sakura Manufacturing',
  );
  assert.equal(
    accountOf('Met Sarah Doyle, the operations manager of Bayside Freight, yesterday.'),
    'Bayside Freight',
  );

  // The weak fallback used to read to the end of the sentence, so these two
  // proposed "Northstar Foods went out yesterday" and "John, our own logistics
  // lead, about the shipment" - both created as customers, each with a thread
  // and a merge candidate of its own.
  assert.equal(accountOf('Quote for Northstar Foods went out yesterday.'), 'Northstar Foods');
  assert.equal(accountOf('Received the revised pricing from Kessler Antriebe this week.'), 'Kessler Antriebe');
  assert.equal(
    accountOf('Spoke with John, our own logistics lead, about the shipment.'),
    '',
    'a colleague named after "with" is not a customer',
  );
  assert.equal(accountOf('Met the buyer today and agreed nothing.'), '', 'an article is not a company');

  // ...and the shapes that already worked still do.
  assert.equal(accountOf('Called Aiko Tanaka at Meridian Logistics today about the tender.'), 'Meridian Logistics');
  assert.equal(accountOf('Meeting with Pan-Asia Components tomorrow about phase 2.'), 'Pan-Asia Components');
}

// The note printed on the product's own landing page, which a buyer reads
// before they sign up. It advertises the account, the person, the objection and
// the next action coming out of that sentence; three of the four came out empty
// - the em-dash form of "Called <Customer>" attached to nobody, a person named
// by what they did was not read at all, and a promise written as a gerund
// ("Sending the proof Friday") produced no action and no date. A demo the
// product cannot reproduce on its own screen is the first thing a new operator
// finds out.
{
  const landing = classifySalesActivity(
    'Called Halden Industrial - Dana Reyes likes the proposal but procurement wants a 3-week lead time guarantee. Sending the support proof Friday. ~96k, 50% with PO.',
    '2026-08-16',
  );
  assert.equal(landing.accountName, 'Halden Industrial');
  assert.equal(landing.contactName, 'Dana Reyes');
  assert.equal(landing.nextAction, 'Send the support proof Friday');
  assert.equal(landing.dueDate, '2026-08-21', 'Friday, from inside the promise');
  assert.ok(landing.risks.includes('Lead time concern'));

  // The bare weekday counts inside the promise and nowhere else: across a whole
  // note it is as often the day the meeting happened.
  const narration = classifySalesActivity('Met them Friday and it went well.', '2026-08-16');
  assert.equal(narration.dueDate, '', 'a weekday in the narration is not a deadline');
}

console.log('Safe date and capture extraction regression verified.');
