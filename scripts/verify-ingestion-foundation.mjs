import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildEmailThreadIngestion,
  buildIngestionSourceTags,
  composeIngestionParserText,
  ingestionSourceTypes,
  parseIngestionSourceTags,
} from '../src/utils/ingestionSource.ts';
import { classifySalesActivity } from '../src/utils/salesActivityClassifier.ts';
import { buildUnifiedTodayCommandCenter } from '../src/utils/todayCommandCenter.ts';

for (const sourceType of [
  'manual-note',
  'quick-capture',
  'pasted-email',
  'pasted-thread',
  'meeting-recap',
  'calendar-placeholder',
  'csv-import',
  'future-zalo-paste',
]) {
  assert.ok(ingestionSourceTypes.includes(sourceType), `ingestion source model missing ${sourceType}`);
}

const activityDate = '2026-07-01';
const emailSource = buildEmailThreadIngestion({
  sourceType: 'pasted-email',
  subject: 'Pymepharco DCM comparison quote',
  sender: 'Ms. Nhu <nhu@pymepharco.vn>',
  recipients: 'sales@example.com',
  sourceDate: activityDate,
  accountHint: 'Pymepharco',
  body: [
    'Met Pymepharco today with Ms. Nhu.',
    'They are evaluating Merck EM RTU.',
    'Need to send DCM comparison quote by next Friday.',
    'Tender decision expected end of July.',
  ].join(' '),
});
const parserText = composeIngestionParserText(emailSource, { accountHint: 'Pymepharco' });
const parsedEmail = classifySalesActivity(parserText, activityDate, {
  accounts: [{ id: 'acct-pyme', accountName: 'Pymepharco' }],
  opportunities: [],
  source: emailSource,
});

assert.equal(parsedEmail.accountName, 'Pymepharco');
assert.equal(parsedEmail.contactName, 'Ms. Nhu');
assert.notEqual(parsedEmail.accountName, 'Ms. Nhu', 'honorific contact must not become account');
assert.equal(parsedEmail.opportunityName, '', 'pasted email must not invent opportunity from product/quote text');
assert.equal(parsedEmail.nextAction, 'Send DCM comparison quote');
assert.equal(parsedEmail.dueDate, '2026-07-03', 'next Friday should be anchored to source/activity date');
assert.ok(parsedEmail.timelineSignals?.includes('Tender decision expected end of July'), 'timeline signal should not become next action');
assert.equal(parsedEmail.stakeholderRole, '', 'MEDDIC role should not be auto-confirmed without explicit evidence');
assert.equal(parsedEmail.sourceType, 'pasted-email');
assert.equal(parsedEmail.sourceLabel, emailSource.sourceLabel);
assert.ok(parsedEmail.originalExcerpt.length < parserText.length, 'saved source excerpt should be compact for long-thread hygiene');
assert.ok(parsedEmail.tags.includes('commercial-signal'), 'quote/payment/delivery/PO evidence should be tagged as commercial signal');

const aliasSource = buildEmailThreadIngestion({
  sourceType: 'pasted-thread',
  subject: 'PME next steps',
  sender: 'sales@example.com',
  sourceDate: activityDate,
  body: 'Call PME next week about DCM comparison.',
});
const aliasParsed = classifySalesActivity(composeIngestionParserText(aliasSource), activityDate, {
  accounts: [{ id: 'acct-pyme', accountName: 'Pymepharco' }],
  aliases: [{
    id: 'alias-pme',
    userId: undefined,
    alias: 'PME',
    canonicalAccountName: 'Pymepharco',
    source: 'correction',
    createdAt: '2026-07-01T00:00:00.000Z',
  }],
  opportunities: [],
  source: aliasSource,
});
assert.equal(aliasParsed.accountName, 'Pymepharco', 'correction-memory account aliases must influence pasted thread resolution');

const sourceTags = buildIngestionSourceTags(emailSource);
const parsedTags = parseIngestionSourceTags(sourceTags);
assert.equal(parsedTags.sourceType, 'pasted-email');
assert.ok(parsedTags.sourceLabel.includes('Pymepharco'), 'sourceLabel metadata should survive tag storage');
assert.equal(parsedTags.sourceHash, emailSource.safeHash);

const now = '2026-07-01T00:00:00.000Z';
const pastedEmailActivity = {
  ...parsedEmail,
  id: 'act-email-1',
  source: 'user',
  isSample: false,
  linkedOpportunityId: '',
  linkedOpportunityName: '',
  linkedAccountName: '',
  linkStatus: 'Unlinked',
  createdAt: now,
  updatedAt: now,
  storageMode: 'local',
};
const today = buildUnifiedTodayCommandCenter({
  briefs: [],
  revenueActions: [],
  opportunities: [],
  activities: [pastedEmailActivity],
  today: activityDate,
});
assert.ok(today.captureInbox.some((item) => item.id === pastedEmailActivity.id), 'Today Capture Inbox should include pasted-email activities that need linking/confirmation');

const captureUi = readFileSync('src/features/dailyCapture/DailyCapturePage.tsx', 'utf8');
for (const marker of [
  'Paste Email / Thread',
  'Subject optional',
  'Sender optional',
  'Recipients optional',
  'Email/thread body',
  'Source date optional',
  'Account hint optional',
  'Opportunity hint optional',
  'composeIngestionParserText',
  'Calendar ingestion coming later',
  'no Gmail, Calendar, Zalo, or CRM sync',
]) {
  assert.ok(captureUi.includes(marker), `Capture UI/flow missing ${marker}`);
}

const activityStore = readFileSync('src/services/salesActivityStore.ts', 'utf8');
for (const marker of ['sourceType', 'sourceLabel', 'parseIngestionSourceTags', 'buildIngestionSourceTags']) {
  assert.ok(activityStore.includes(marker), `Sales activity source metadata storage missing ${marker}`);
}

// Capture is rule-based on-device: the AI prompt/provider layer was removed with
// the rest of the OpenAI-dependent code, so the guard is that no AI call remains.
assert.equal(captureUi.includes('/api/capture-ai-classify'), false, 'capture must not call an AI endpoint');
assert.equal(captureUi.includes('classifyCapture('), false, 'capture must not invoke an AI provider');

const scannedFiles = [
  captureUi,
  readFileSync('src/utils/ingestionSource.ts', 'utf8'),
].join('\n');
for (const forbidden of ['gmail.users', 'calendar.events', 'google.calendar', 'zalo.send', 'crm.sync']) {
  assert.equal(scannedFiles.includes(forbidden), false, `External integration marker should not exist: ${forbidden}`);
}

console.log('Ingestion foundation regression verified.');
