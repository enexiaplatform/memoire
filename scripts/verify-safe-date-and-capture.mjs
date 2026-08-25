import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { classifySalesActivity, extractCompetitors, extractDueDate } from '../src/utils/salesActivityClassifier.ts';
import {
  addMonthsClamped,
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
// Month paging must clamp the day rather than overflow it. `setMonth` on the
// 31st asks for the 31st of a month that may have 30 days and JavaScript rolls
// it into the month after that, so the Plan, the Calendar and the Reviews recap
// all skipped a month forward and refused to move back.
{
  const key = (date) => toLocalDateKey(date);
  assert.equal(key(addMonthsClamped(new Date(2026, 7, 31), 1)), '2026-09-30', 'August 31 forward is September, not October');
  assert.equal(key(addMonthsClamped(new Date(2026, 2, 31), 1)), '2026-04-30', 'March 31 forward is April, not May');
  assert.equal(key(addMonthsClamped(new Date(2026, 2, 31), -1)), '2026-02-28', 'March 31 back is February, not March again');
  assert.equal(key(addMonthsClamped(new Date(2028, 2, 31), -1)), '2028-02-29', 'and a leap February keeps its 29th');
  assert.equal(key(addMonthsClamped(new Date(2026, 0, 31), -1)), '2025-12-31', 'across a year boundary');
  assert.equal(key(addMonthsClamped(new Date(2026, 11, 31), 1)), '2027-01-31');
  // A day that exists in both months is preserved, because the callers that page
  // by day and week read it.
  assert.equal(key(addMonthsClamped(new Date(2026, 7, 15), 1)), '2026-09-15');
}

// And no month-paging control may go back to the raw `setMonth`.
{
  const monthPagers = [
    'src/utils/weeklyPlan.ts',
    'src/features/calendar/SalesActivityCalendarPage.tsx',
    'src/features/reviews/SalesReviewsPage.tsx',
  ];
  for (const file of monthPagers) {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.equal(
      /\.setMonth\(/.test(code),
      false,
      `${file} must page months through addMonthsClamped, not setMonth`,
    );
  }
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
  // A pipe size is not a deadline. This trade writes 3/4, 1/2 and 5/8 constantly,
  // and each of these notes is a real commitment, so the invented date reached
  // the Plan already months overdue while capture reported success.
  assert.equal(extractDueDate('send the quote for the 3/4 inch valve', '2026-08-16'), '');
  assert.equal(extractDueDate('ship the 5/8" hose', '2026-08-16'), '');
  assert.equal(extractDueDate('deliver 2/3 of the order', '2026-08-16'), '');
  // Only the ambiguous small-number pair is refused, and only before a unit.
  assert.equal(extractDueDate('deliver 3/4/2027 as agreed', '2026-08-16'), '2027-04-03');
  assert.equal(extractDueDate('chase invoice 03/09', '2026-08-16'), '2026-09-03');
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

// A verb behind a negation is a report of what did not happen. Found by keeping
// a month of ordinary notes: "Emailed Bayside Freight about the telematics
// rollout. No reply yet." produced a commitment called "reply yet", dated, on
// the Plan, waiting to be chased.
{
  const nextActionOf = (note) => classifySalesActivity(note, '2026-08-16').nextAction;
  assert.equal(nextActionOf('Emailed Bayside Freight about the rollout. No reply yet.'), '');
  assert.equal(nextActionOf('Called them twice, no update from procurement.'), '');
  assert.equal(nextActionOf('They never replied to the quote.'), '');
  assert.equal(nextActionOf('Still awaiting confirmation from finance.'), '');
  // ...and a promise in the same breath as a negation is still a promise.
  assert.equal(
    nextActionOf('No decision yet, but I will send the revised BOM Wednesday.'),
    'Send the revised BOM Wednesday',
  );
  assert.equal(nextActionOf('Next: send the updated quote next Tuesday.'), 'Send the updated quote');
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

/**
 * Nobody derives "today" from a UTC timestamp.
 *
 * `safeDate.ts` exists because `new Date().toISOString().slice(0, 10)` is the
 * UTC calendar day, and for a seller in UTC+7 that is *yesterday* until 7am
 * local. Two call sites had drifted back to it: the pipeline defense brief
 * titled itself with it - and that brief gets sent to a manager, so it arrived
 * dated the day before the review it was prepared for - and the dashboard export
 * named its zip with it.
 *
 * Neither was reachable by a test: both produce a plausible date, just the wrong
 * one, and only for part of the day, and only outside UTC. This is the only
 * check that can see it.
 */
{
  const offenders = collectSourceFiles('src')
    .filter((file) => file !== 'src/utils/safeDate.ts')
    .filter((file) => {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      // Deliberately only the unambiguous form: `new Date()` with no argument
      // is "now", and its UTC calendar day is a different day from the
      // operator's for part of every day outside UTC.
      //
      // `someDate.toISOString().slice(0, 10)` is NOT matched, and must not be:
      // seventeen files do that to a Date built from a UTC-anchored value, where
      // it round-trips correctly. Telling them apart needs the provenance of the
      // Date, which a regex does not have - so this checks the one shape that is
      // wrong on sight rather than guessing at the rest.
      return /new Date\(\s*\)\s*\.\s*toISOString\(\)\s*\.\s*(slice|substring)\(\s*0\s*,\s*10\s*\)/.test(source);
    });

  assert.deepEqual(
    offenders,
    [],
    'these take the UTC calendar day where they mean the operator\'s local one; use '
    + `todayDateKey() from utils/safeDate: ${offenders.join(', ')}`,
  );
}

function collectSourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return collectSourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}


/**
 * Direction belongs in the comparator, not at the call site.
 *
 * `compareSafeBusinessDate(b, a)` reads like the way to get a newest-first
 * list and is the opposite: the ascending comparator deliberately sorts
 * unreadable dates LAST, so reversing its arguments sends them to the FRONT.
 * The head of the list is then whichever record has a date nobody can read -
 * and the head is what every caller treats as "the latest".
 *
 * Sixteen files carried this. The worst of them fed `allActivities[0].summary`
 * into a follow-up the operator was about to send, and
 * `getLatestActivityForOpportunity` returned it by name.
 */
{
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = readFileSync(full, 'utf8');
        if (/compareSafeBusinessDate\(\s*(b|right)\./.test(source)) offenders.push(full);
      }
    }
  };
  walk('src');
  assert.deepEqual(
    offenders,
    [],
    `reversed date comparator - use compareBusinessDateDesc so unreadable dates stay last: ${offenders.join(', ')}`,
  );

  const safeDate = readFileSync('src/utils/safeDate.ts', 'utf8');
  assert.match(safeDate, /export function compareBusinessDateDesc/, 'the descending comparator exists');
}

console.log('Safe date and capture extraction regression verified, and nobody derives today from UTC.');
