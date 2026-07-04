import assert from 'node:assert/strict';
import { classifySalesActivity, extractDueDate } from '../src/utils/salesActivityClassifier.ts';
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

assert.equal(result.summary, 'Met Pymepharco today with Ms. Nhu.');
assert.equal(result.accountName, 'Pymepharco');
assert.equal(result.contactName, 'Ms. Nhu');
assert.equal(result.opportunityName, '');
assert.equal(result.nextAction, 'Send DCM comparison quote');
assert.equal(result.dueDate, '2026-06-19');
assert.ok(result.timelineSignals.includes('Tender decision expected end of July'));
assert.ok(!JSON.stringify(result).includes('1900-'));

console.log('Safe date and capture extraction regression verified.');
