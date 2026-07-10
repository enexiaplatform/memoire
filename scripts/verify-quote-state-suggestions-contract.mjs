import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suggestQuoteStateChanges } from '../src/utils/quoteStateSuggestions.ts';

function makeQuote(patch = {}) {
  return {
    id: `q-${Math.random().toString(36).slice(2)}`,
    quoteId: 'Q-1', accountName: 'Apex Labs', opportunityId: '', opportunityName: 'Validation',
    title: 'Validation quote', quoteDate: '2026-06-20', validUntil: '2026-07-20',
    amount: 100_000_000, currency: 'VND', grossMarginEstimate: null, discount: null,
    paymentTerm: '', status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered',
    expectedDeliveryDate: '', paymentStatus: 'Due', paymentDueDate: '2026-07-15', nextAction: '',
    notes: '', createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z',
    ...patch,
  };
}

function makeActivity(patch = {}) {
  return {
    accountName: 'Apex Labs',
    linkedAccountName: '',
    activityType: 'Payment / invoice',
    summary: 'Payment received from Apex Labs',
    rawNote: 'Payment received from Apex Labs for the validation invoice, paid in full.',
    ...patch,
  };
}

// 1. Payment capture proposes Paid on the account's due quote.
{
  const suggestions = suggestQuoteStateChanges(makeActivity(), [makeQuote()]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].kind, 'payment-paid');
  assert.equal(suggestions[0].patch.paymentStatus, 'Paid');
}

// 2. Literal detection only: a payment-type activity WITHOUT payment words suggests nothing.
{
  const suggestions = suggestQuoteStateChanges(
    makeActivity({ rawNote: 'Discussed the invoice format with finance.', summary: 'Invoice discussion' }),
    [makeQuote()],
  );
  assert.equal(suggestions.length, 0, 'no literal evidence, no suggestion');
}

// 3. Delivery capture proposes Delivered and moves payment to Due.
{
  const suggestions = suggestQuoteStateChanges(
    makeActivity({ activityType: 'Delivery / fulfillment', rawNote: 'Installation completed at the Apex lab today.', summary: 'Installed' }),
    [makeQuote({ deliveryStatus: 'Scheduled', paymentStatus: 'Not due' })],
  );
  assert.equal(suggestions[0]?.kind, 'delivery-delivered');
  assert.equal(suggestions[0]?.patch.deliveryStatus, 'Delivered');
  assert.equal(suggestions[0]?.patch.paymentStatus, 'Due');
}

// 4. PO received accepts the quote and marks the PO.
{
  const suggestions = suggestQuoteStateChanges(
    makeActivity({ activityType: 'Tender / procurement', rawNote: 'Great news - PO received from procurement.', summary: 'PO received' }),
    [makeQuote({ status: 'Sent', poStatus: 'Pending', deliveryStatus: 'Not scheduled', paymentStatus: 'Not due' })],
  );
  assert.equal(suggestions[0]?.kind, 'po-received');
  assert.equal(suggestions[0]?.patch.status, 'Accepted');
  assert.equal(suggestions[0]?.patch.poStatus, 'Received');
}

// 5. Already-final states never re-suggest; other accounts never match.
{
  assert.equal(suggestQuoteStateChanges(makeActivity(), [makeQuote({ paymentStatus: 'Paid' })]).length, 0);
  assert.equal(suggestQuoteStateChanges(makeActivity({ accountName: 'Other Co', linkedAccountName: '' }), [makeQuote()]).length, 0);
}

// 6. UI contract: capture page renders confirmable suggestions - user consent required.
const capture = readFileSync(new URL('../src/features/dailyCapture/DailyCapturePage.tsx', import.meta.url), 'utf8');
for (const marker of ['suggestQuoteStateChanges', 'applyQuoteStateSuggestion', 'Nothing changes until you confirm']) {
  assert.ok(capture.includes(marker), `DailyCapturePage missing marker: ${marker}`);
}
const util = readFileSync(new URL('../src/utils/quoteStateSuggestions.ts', import.meta.url), 'utf8');
assert.ok(util.includes('never autonomous state mutation'), 'the assistive-only rule must be stated at the source');

console.log('Quote state-change suggestions contract verified.');
