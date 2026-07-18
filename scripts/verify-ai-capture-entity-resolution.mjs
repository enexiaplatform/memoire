import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifySalesActivity } from '../src/utils/salesActivityClassifier.ts';
import { resolveCaptureEntities } from '../src/utils/captureEntityResolution.ts';
import { isValidBusinessDate } from '../src/utils/safeDate.ts';

const accounts = [
  { id: 'account-pymepharco', accountName: 'Pymepharco' },
  { id: 'account-dhg', accountName: 'DHG Pharma' },
  { id: 'account-dksh', accountName: 'DKSH' },
];
const context = { accounts, opportunities: [] };
const activityDate = '2026-06-18';

const primaryNote = 'Met Pymepharco today with Ms. Nhu. They are evaluating Merck EM RTU. Need to send DCM comparison quote by next Friday. Tender decision expected end of July.';
const primary = classifySalesActivity(primaryNote, activityDate, context);
assert.equal(primary.accountName, 'Pymepharco');
assert.equal(primary.contactName, 'Ms. Nhu');
assert.equal(primary.opportunityName, '');
assert.ok(['Customer meeting', 'Demo / technical discussion'].includes(primary.activityType));
assert.equal(primary.summary, 'Met Pymepharco today with Ms. Nhu.');
assert.equal(primary.nextAction, 'Send DCM comparison quote');
assert.equal(primary.dueDate, '2026-06-19');
assert.equal(isValidBusinessDate(primary.dueDate), true);
assert.ok(primary.timelineSignals.includes('Tender decision expected end of July'));
assert.ok(!JSON.stringify(primary).includes('1900-'));
assert.ok(!JSON.stringify(primary).includes('Media Fill / PMM RTU'));

const dhg = classifySalesActivity('Spoke with Ms. Lan at DHG Pharma about validation.', activityDate, context);
assert.equal(dhg.accountName, 'DHG Pharma');
assert.equal(dhg.contactName, 'Ms. Lan');

const dksh = classifySalesActivity('Call Mr. Minh from DKSH about delivery.', activityDate, { accounts: [], opportunities: [] });
assert.equal(dksh.accountName, 'DKSH');
assert.equal(dksh.contactName, 'Mr. Minh');

const followUp = classifySalesActivity('Follow up Pymepharco on DCM comparison quote next week.', activityDate, context);
assert.equal(followUp.accountName, 'Pymepharco');
assert.equal(followUp.contactName, '');
assert.equal(followUp.opportunityName, '');

const actionOnly = classifySalesActivity('Send quote by next Friday. Tender decision expected end of July.', activityDate, context);
assert.equal(actionOnly.nextAction, 'Send quote');
assert.ok(actionOnly.timelineSignals.includes('Tender decision expected end of July'));
assert.ok(!actionOnly.nextAction.toLowerCase().includes('tender decision'));

const guardedAiEntities = resolveCaptureEntities({
  rawNote: primaryNote,
  accountName: 'Ms. Nhu',
  contactName: 'Ms. Nhu',
  opportunityName: 'Media Fill / PMM RTU',
  accounts,
  opportunities: [],
});
assert.equal(guardedAiEntities.accountName, 'Pymepharco');
assert.equal(guardedAiEntities.contactName, 'Ms. Nhu');
assert.equal(guardedAiEntities.opportunityName, '');
assert.equal(guardedAiEntities.needsConfirmation, true);

const capturePage = readFileSync('src/features/dailyCapture/DailyCapturePage.tsx', 'utf8');
for (const marker of [
  'On-device parsing',
  'Rule-based preview',
  'Needs confirmation',
  'Confirm and correct',
  'This reviewed structured draft is exactly what Save Activity will store.',
]) assert.ok(capturePage.includes(marker), `Full Note capture missing review marker: ${marker}`);

console.log('AI-first capture and entity resolution regression verified.');
