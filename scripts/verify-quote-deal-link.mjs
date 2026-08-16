import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildQuotedOpportunityIds,
  resolveOpportunityByName,
  resolveQuoteOpportunityId,
} from '../src/utils/opportunityResolution.ts';

// The resolver is imported and run; `buildRevenueView` is asserted by source,
// because its import chain reaches the Supabase client and `import.meta.env`,
// which do not exist in a bare node run. The resolver is the part that has to
// be right - the view's job is only to use it.

// A quote's link to its deal is optional in the data and was mandatory in the
// logic. `buildRevenueView` excluded already-quoted deals from the weak-pipeline
// watch-list by reading `quote.opportunityId` and stopping, so every quote
// written before the Opportunity picker existed - and every imported one - left
// its deal being told to go and quote a customer it had already quoted. The
// Today cockpit had grown a private name-based fallback for the same problem,
// which meant the two surfaces disagreed about which deals were quoted and the
// stricter one was the one raising warnings.

const opp = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'VNVC', opportunityName: 'Cold chain',
  stage: 'Proposal', estimatedValue: 1000, currency: 'VND', expectedClosePeriod: '',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: 'Send the revised quote', nextActionDate: '2026-09-01',
  evidence: '', missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Unsupported', decisionRecommendation: 'Monitor',
  status: 'Active', createdAt: '', updatedAt: '', storageMode: 'local', ...patch,
});

const quote = (patch = {}) => ({
  id: `q-${Math.random().toString(36).slice(2)}`, quoteId: 'Q-1', title: 'Cold chain quote',
  accountName: 'VNVC', opportunityName: 'Cold chain', opportunityId: '', amount: 1000, currency: 'VND',
  status: 'Sent', validUntil: '', paymentTerm: '', paymentStatus: '', deliveryStatus: '',
  paymentDueDate: '', expectedDeliveryDate: '', nextAction: '', createdAt: '', updatedAt: '',
  storageMode: 'local', ...patch,
});

// 1. The written link wins when it points at a real deal.
{
  const deal = opp();
  assert.equal(resolveQuoteOpportunityId(quote({ opportunityId: deal.id }), [deal]), deal.id);
  // A dangling id is not a link. Falling through to the names is what keeps a
  // deleted-and-recreated deal attached to its quote.
  assert.equal(resolveQuoteOpportunityId(quote({ opportunityId: 'gone' }), [deal]), deal.id);
}

// 2. Names resolve through the workspace's canonical rule, not raw lowercase.
// This is the shape the first operator's book actually has.
{
  const deal = opp({ accountName: 'CÔNG TY CỔ PHẦN VNVC', opportunityName: 'Cold chain' });
  assert.equal(
    resolveOpportunityByName('cong ty co phan vnvc.', 'Cold chain', [deal]),
    deal.id,
    'diacritics and punctuation must not break the join',
  );
}

// 3. Ambiguity is refused rather than guessed: attaching a quote to an
// arbitrary deal silently drops the wrong one off the watch-list.
{
  const a = opp({ opportunityName: 'Cold chain' });
  const b = opp({ opportunityName: 'Freezer replacement' });
  assert.equal(resolveOpportunityByName('VNVC', '', [a, b]), undefined);
  // ...but one deal for that customer is not a guess.
  assert.equal(resolveOpportunityByName('VNVC', '', [a]), a.id);
}

// 4. Only a live quote counts. A draft is not evidence the customer has been
// given a number; a rejected quote is a reason to worry, not to stop worrying.
{
  const deal = opp();
  assert.equal(buildQuotedOpportunityIds([quote({ status: 'Draft' })], [deal]).size, 0);
  assert.equal(buildQuotedOpportunityIds([quote({ status: 'Rejected' })], [deal]).size, 0);
  for (const status of ['Sent', 'Revised', 'Accepted']) {
    assert.equal(buildQuotedOpportunityIds([quote({ status })], [deal]).size, 1, `${status} must count as quoted`);
  }
}

// 5. The reported bug, at the point it was decided: an unlinked but sent quote
// puts its deal in the quoted set, which is what takes it off the
// weak-pipeline list.
{
  const deal = opp({ forecastEvidenceCategory: 'Unsupported' });
  const quoted = buildQuotedOpportunityIds([quote({ opportunityId: '' })], [deal]);
  assert.ok(
    quoted.has(deal.id),
    'a deal with a sent quote must be counted as quoted, linked by id or not',
  );
}

// 6. One resolver, not two. The private copy in businessCockpit is what let the
// two surfaces disagree in the first place.
{
  const cockpit = readFileSync('src/utils/businessCockpit.ts', 'utf8');
  assert.ok(
    cockpit.includes("from './opportunityResolution.ts'"),
    'the cockpit must resolve deals through the shared resolver',
  );
  assert.equal(
    /matches\.length === 1 \? matches\[0\]\.id/.test(cockpit),
    false,
    'the cockpit must not carry its own copy of the name match',
  );

  const revenue = readFileSync('src/utils/revenueView.ts', 'utf8');
  assert.ok(revenue.includes('buildQuotedOpportunityIds'), 'the revenue view must resolve quoted deals');
  assert.equal(
    /\.map\(\(quote\) => quote\.opportunityId\)/.test(revenue),
    false,
    'the revenue view must not key quoted deals on the raw id again',
  );
}

// The money on a quote is in a currency the workspace chose, and the deal's
// currency travels with the deal's amount.
//
// The blank form was a free-text box hardcoded to VND - the home market - while
// every other money form in the product opens in the reporting currency. Since
// linking a deal pre-fills its amount, picking a 120,000 USD deal produced a
// quote reading "120,000 VND": about four dollars, counted into Accepted value
// and chased by Cash Collection as if it were the sale.
{
  const store = readFileSync('src/services/quoteStore.ts', 'utf8');
  assert.ok(
    /export function createEmptyQuoteInput\(\)/.test(store)
      && /currency: getReportingCurrency\(\)/.test(store),
    'a blank quote must open in the reporting currency, read at call time',
  );

  const page = readFileSync('src/features/quotes/QuotesPage.tsx', 'utf8');
  assert.equal(
    /emptyQuoteInput/.test(page.replace(/createEmptyQuoteInput/g, '')),
    false,
    'the quote panel must not fall back to the module constant’s currency',
  );
  assert.equal(
    /<TextInput label="Currency"/.test(page),
    false,
    'a currency the rate table cannot read is dropped from every total - it is picked, not typed',
  );
  // Every ISO code, not the twenty-one this file ships a rate for: an operator
  // in Stockholm quotes in krona. The ones without a shipped rate are marked and
  // convert as soon as they are given one in Settings.
  assert.ok(
    /<SelectInput label="Currency"/.test(page) && /listSelectableCurrencies\(\)\.map/.test(page),
    'the currency picker must offer every selectable currency',
  );
  assert.ok(
    /needs a rate/.test(page),
    'a currency with no rate must say so in the picker rather than look convertible',
  );
  assert.ok(
    /\? opportunity\?\.currency/.test(page),
    'a linked deal’s currency must travel with the amount pre-filled from it',
  );
}

console.log('Quote-to-deal link contract verified: the written link first, the names after, ambiguity refused.');
