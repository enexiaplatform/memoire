import assert from 'node:assert/strict';
import { classifySalesActivity, extractDueDate } from '../src/utils/salesActivityClassifier.ts';
import {
  compareSafeBusinessDate,
  formatSafeBusinessDate,
  isBusinessDateOverdue,
  isValidBusinessDate,
  sanitizeBusinessDate,
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
