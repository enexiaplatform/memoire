import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addCaptureAccountAlias,
  buildCaptureCorrectionEvents,
  clearLocalCaptureCorrectionMemory,
  deleteCaptureAccountAlias,
  deleteCaptureCorrection,
  loadCaptureAccountAliases,
  loadCaptureCorrections,
  recordCaptureCorrections,
} from '../src/services/captureCorrectionMemoryStore.ts';
import { resolveCaptureEntities } from '../src/utils/captureEntityResolution.ts';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};

const userId = 'm66-verifier';
const accounts = [{ id: 'account-pymepharco', accountName: 'Pymepharco' }];
const firstNote = 'Met Pymepharco today with Ms. Nhu. Need to send DCM quote by next Friday.';
const personCorrections = buildCaptureCorrectionEvents({
  original: { accountName: 'Ms. Nhu', contactName: '' },
  corrected: { accountName: 'Pymepharco', contactName: 'Ms. Nhu' },
  source: 'ai',
  rawNote: firstNote,
  userId,
});
assert.deepEqual(personCorrections.map((event) => event.fieldName).sort(), ['accountName', 'contactName']);
assert.ok(personCorrections.every((event) => event.rawNoteExcerpt.length <= 160));
const learned = recordCaptureCorrections(personCorrections, userId);

const followUp = resolveCaptureEntities({
  rawNote: 'Follow up with Ms. Nhu about DCM quote.', accountName: 'Ms. Nhu', contactName: 'Ms. Nhu',
  accounts, opportunities: [], corrections: learned.corrections, aliases: learned.aliases,
});
assert.equal(followUp.contactName, 'Ms. Nhu');
assert.equal(followUp.accountName, 'Pymepharco');
assert.equal(followUp.accountMatchSource, 'correction');
assert.equal(followUp.needsConfirmation, true);

const aliases = addCaptureAccountAlias({ alias: 'PME', canonicalAccountName: 'Pymepharco', userId });
const aliasMatch = resolveCaptureEntities({ rawNote: 'Call PME next week about DCM comparison.', accounts, opportunities: [], aliases });
assert.equal(aliasMatch.accountName, 'Pymepharco');
assert.equal(aliasMatch.accountMatchSource, 'alias');
assert.equal(aliasMatch.matchedAlias, 'PME');

const opportunityCorrections = buildCaptureCorrectionEvents({
  original: { opportunityName: 'Media Fill / PMM RTU' }, corrected: { opportunityName: '' }, source: 'ai',
  rawNote: 'Met Pymepharco with Ms. Nhu. They are evaluating Merck EM RTU.', userId,
});
const withOpportunityLearning = recordCaptureCorrections(opportunityCorrections, userId);
const guardedOpportunity = resolveCaptureEntities({
  rawNote: 'Met Pymepharco with Ms. Nhu. They are evaluating Merck EM RTU.',
  accountName: 'Pymepharco', contactName: 'Ms. Nhu', opportunityName: 'Media Fill / PMM RTU',
  accounts, opportunities: [], corrections: withOpportunityLearning.corrections, aliases: withOpportunityLearning.aliases,
});
assert.equal(guardedOpportunity.opportunityName, '');

assert.equal(buildCaptureCorrectionEvents({ original: { accountName: 'Pymepharco' }, corrected: { accountName: 'Pymepharco' }, source: 'local-fallback', rawNote: firstNote }).length, 0);
assert.equal(deleteCaptureCorrection(loadCaptureCorrections(userId)[0].id, userId).length, 2);
assert.equal(deleteCaptureAccountAlias(loadCaptureAccountAliases(userId)[0].id, userId).length, 0);
clearLocalCaptureCorrectionMemory(userId);
assert.equal(loadCaptureCorrections(userId).length, 0);
assert.equal(loadCaptureAccountAliases(userId).length, 0);

const capturePage = readFileSync('src/features/dailyCapture/DailyCapturePage.tsx', 'utf8');
for (const marker of ['Capture Learning Memory', 'buildCaptureCorrectionEvents', 'Clear all local memory', 'Account aliases', 'Recent corrections']) {
  assert.ok(capturePage.includes(marker), `Capture learning UI/integration missing: ${marker}`);
}
console.log('Capture correction memory regression verified.');
