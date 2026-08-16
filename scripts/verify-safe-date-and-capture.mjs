import assert from 'node:assert/strict';
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

console.log('Safe date and capture extraction regression verified.');
