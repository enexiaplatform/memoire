import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateRevenueRiskBriefMarkdown } from '../src/utils/revenueRiskBrief.ts';

const today = '2026-07-09';

function makeOpportunity(patch = {}) {
  return {
    id: 'opp-1', accountName: 'Apex Labs', opportunityName: 'Validation', stage: 'Negotiation',
    estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: '', productOrSolution: '',
    decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
    nextAction: 'Send revised quote', nextActionDate: '2026-07-12', evidence: '',
    missingContext: '', objectionDebt: '', forecastEvidenceCategory: 'Defensible',
    decisionRecommendation: 'Defend', status: 'Active', createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '', storageMode: 'local',
    ...patch,
  };
}

function makeQuote(patch = {}) {
  return {
    id: 'q-1', quoteId: 'Q-1', accountName: 'Apex Labs', opportunityId: 'opp-1', opportunityName: 'Validation',
    title: 'Validation quote', quoteDate: '2026-06-20', validUntil: '2026-07-20', amount: 100_000_000,
    currency: 'VND', grossMarginEstimate: null, discount: null, paymentTerm: '', status: 'Accepted',
    poStatus: 'Received', deliveryStatus: 'Delivered', expectedDeliveryDate: '', paymentStatus: 'Due',
    paymentDueDate: '2026-07-01', nextAction: '', notes: '', createdAt: '', updatedAt: '',
    ...patch,
  };
}

// 1. Honest empty state: no threads means the brief says so and stops.
{
  const markdown = generateRevenueRiskBriefMarkdown({ opportunities: [], quotes: [], periodLabel: 'Week of Jul 6', today });
  assert.ok(markdown.startsWith('# Revenue Risk Brief - Week of Jul 6'));
  assert.ok(markdown.includes('No commercial threads in motion'), 'empty workspace must read as empty');
  assert.ok(!markdown.includes('## Stuck money'), 'no invented sections on an empty workspace');
}

// 2. Stuck money names the thread, the rule that fired, and the next action.
{
  const markdown = generateRevenueRiskBriefMarkdown({
    opportunities: [makeOpportunity()],
    quotes: [makeQuote()],
    periodLabel: 'Week of Jul 6',
    today,
  });
  assert.ok(markdown.includes('## Money in motion'), 'in-motion total must lead the brief');
  assert.ok(markdown.includes('Pending payment'), 'the lane summary must name active lanes');
  assert.ok(markdown.includes('Apex Labs / Validation quote'), 'a stuck thread must be named account-first');
  assert.ok(markdown.includes('Why: Payment overdue'), 'the stuck reason must be the checkpoint rule, verbatim');
  assert.ok(markdown.includes('Do next:'), 'every stuck thread must carry a next action');
  assert.ok(markdown.includes('nothing is inferred') || markdown.includes('nothing is inferred.') || markdown.includes('- nothing is inferred'), 'the brief must state its evidence boundary');
}

// 3. Threads in motion with nothing stuck reads as healthy, not silent.
{
  const markdown = generateRevenueRiskBriefMarkdown({
    opportunities: [makeOpportunity()],
    quotes: [makeQuote({ paymentDueDate: '2026-08-01' })],
    periodLabel: 'Week of Jul 6',
    today,
  });
  assert.ok(markdown.includes('Nothing is stuck right now'), 'healthy money must say so plainly');
}

// 4. UI wiring: the review page composes and copies the brief.
const reviewsPage = readFileSync(new URL('../src/features/reviews/SalesReviewsPage.tsx', import.meta.url), 'utf8');
assert.ok(reviewsPage.includes('generateRevenueRiskBriefMarkdown'), 'the review page must compose the Revenue Risk Brief');
assert.ok(reviewsPage.includes('Revenue Risk Brief copied.'), 'copying must confirm to the user');
const panel = readFileSync(new URL('../src/features/reviews/WeeklyBusinessReviewPanel.tsx', import.meta.url), 'utf8');
assert.ok(panel.includes('Copy Revenue Risk Brief'), 'the review panel must expose the copy button');

console.log('Revenue Risk Brief contract verified.');
