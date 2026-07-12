import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCommercialJourneySnapshot, formatJourneyCommitment } from '../src/utils/commercialJourney.ts';

const today = '2026-07-09';

function makeOpportunity(patch = {}) {
  return {
    id: 'opp-1', accountName: 'Apex Labs', opportunityName: 'Validation', stage: 'Negotiation',
    estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: '', productOrSolution: '',
    decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
    nextAction: 'Send revised quote', nextActionDate: '2026-07-12', evidence: 'Budget approved.',
    missingContext: '', objectionDebt: 'Lead time concern',
    forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Defend',
    status: 'Active', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '', storageMode: 'local',
    ...patch,
  };
}

function makeActivity(patch = {}) {
  return {
    id: `a-${Math.random().toString(36).slice(2)}`, accountName: 'Apex Labs', opportunityName: 'Validation',
    activityType: 'Meeting', summary: 'Met the buyer', nextAction: '', dueDate: '', tags: [],
    linkedOpportunityId: 'opp-1', linkedOpportunityName: 'Validation', linkedAccountName: 'Apex Labs',
    linkStatus: 'Linked', rawNote: 'x', activityDate: '2026-07-05', createdAt: '', updatedAt: '', storageMode: 'local',
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

// 1. With a quote, the money flow speaks for the journey position.
{
  const snapshot = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity(),
    quotes: [makeQuote()],
    activities: [makeActivity()],
    objections: [],
    today,
  });
  assert.equal(snapshot.position, 'Pending payment');
  assert.equal(snapshot.positionSource, 'money-flow');
  assert.ok(snapshot.moneyStatus.includes('Payment overdue'), 'overdue payment must surface as stuck money');
  assert.equal(snapshot.lastTouch?.date, '2026-07-05');
  assert.equal(formatJourneyCommitment(snapshot.nextCommitment), 'Send revised quote - Jul 12, 2026');
}

// 2. Without a quote, the sales stage speaks for the journey head.
{
  const snapshot = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity(),
    quotes: [],
    activities: [],
    objections: [],
    today,
  });
  assert.equal(snapshot.position, 'Negotiation');
  assert.equal(snapshot.positionSource, 'stage');
  assert.equal(snapshot.moneyStatus, 'No quote yet');
  assert.equal(snapshot.lastTouch, null);
}

// 3. Blockers: an open objection beats the static objection-debt text; risk names silence.
{
  const snapshot = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity({ nextActionDate: '', nextAction: '', forecastEvidenceCategory: 'Hope-based' }),
    quotes: [],
    activities: [makeActivity({ activityDate: '2026-06-20' })],
    objections: [{
      id: 'ob-1', accountId: '', accountName: 'Apex Labs', opportunityId: 'opp-1', opportunityName: 'Validation',
      stakeholderId: '', stakeholderName: '', sourceActivityId: '', objectionType: 'Price',
      objectionText: 'Too expensive vs incumbent', impact: 'High', status: 'Open',
      requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '', resolvedAt: '', tags: [],
      createdAt: '', updatedAt: '', storageMode: 'local',
    }],
    today,
  });
  assert.equal(snapshot.blocker, 'Too expensive vs incumbent');
  assert.ok(snapshot.riskStatus.includes('Going silent (quiet 19d)'), 'silence must be named with quiet days');
  assert.ok(snapshot.riskStatus.includes('Hope-based forecast'));
}

// 4. Healthy deal reads honestly.
{
  const snapshot = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity({ objectionDebt: '' }),
    quotes: [],
    activities: [makeActivity({ activityDate: '2026-07-08' })],
    objections: [],
    today,
  });
  assert.equal(snapshot.riskStatus, 'No active risk signal');
  assert.equal(snapshot.blocker, '');
}

// 5. Solo journey head (direction 7.3): the same derived state in the solo
// operator's language. Money in motion speaks first; the stage speaks before.
{
  const paidQuote = makeQuote({ status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid', paymentDueDate: '' });
  const quoted = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity(), quotes: [makeQuote({ status: 'Sent', poStatus: 'None', deliveryStatus: 'Pending', paymentStatus: 'Not requested', paymentDueDate: '' })],
    activities: [makeActivity()], objections: [], today,
  });
  assert.equal(quoted.soloPosition, 'Offer', 'a live quote is the solo Offer');

  const noQuoteLead = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity({ stage: 'Lead' }), quotes: [], activities: [], objections: [], today,
  });
  assert.equal(noQuoteLead.soloPosition, 'Audience');
  assert.equal(noQuoteLead.retentionStatus, null, 'retention must stay null before money lands');

  const conversation = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity({ stage: 'Discovery' }), quotes: [], activities: [], objections: [], today,
  });
  assert.equal(conversation.soloPosition, 'Conversation');

  const pendingPayment = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity(), quotes: [makeQuote()], activities: [makeActivity()], objections: [], today,
  });
  assert.equal(pendingPayment.soloPosition, 'Payment');
  assert.equal(pendingPayment.retentionStatus, null);

  // 6. Retention is honest: paid + quiet says so, paid + fresh touch says
  // so, a dated next action reads as planned, and no history says so plainly.
  const paidQuiet = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity({ nextAction: '', nextActionDate: '' }), quotes: [paidQuote],
    activities: [makeActivity({ activityDate: '2026-06-20' })], objections: [], today,
  });
  assert.equal(paidQuiet.soloPosition, 'Retention');
  assert.ok(paidQuiet.retentionStatus.includes('quiet 19d'), 'quiet retention must name the quiet days');
  assert.ok(paidQuiet.retentionStatus.includes('book a retention touch'));

  const paidFresh = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity({ nextAction: '', nextActionDate: '' }), quotes: [paidQuote],
    activities: [makeActivity({ activityDate: '2026-07-08' })], objections: [], today,
  });
  assert.ok(paidFresh.retentionStatus.includes('last touch 1d ago'), 'fresh retention must read as healthy');

  const paidPlanned = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity(), quotes: [paidQuote],
    activities: [makeActivity({ activityDate: '2026-06-20' })], objections: [], today,
  });
  assert.equal(paidPlanned.retentionStatus, 'Paid - next touch planned.', 'a dated next action must read as a plan, not silence');

  const paidNoTouch = buildCommercialJourneySnapshot({
    opportunity: makeOpportunity({ nextAction: '', nextActionDate: '', createdAt: '' }), quotes: [paidQuote],
    activities: [], objections: [], today,
  });
  assert.ok(paidNoTouch.retentionStatus.includes('no touch captured since'), 'paid with no touches must say so plainly');
}

// 7. UI contract: the ledger's detail modal shows where the deal stands,
// speaks the solo journey's language under the solo lens, and surfaces
// retention when money has landed.
const ledger = readFileSync(new URL('../src/features/calendar/SalesActivityCalendarPage.tsx', import.meta.url), 'utf8');
for (const marker of ['buildCommercialJourneySnapshot', 'Where this deal stands', 'Next commitment', 'formatJourneyCommitment', 'soloPosition', 'retentionStatus', 'getWorkspaceLens']) {
  assert.ok(ledger.includes(marker), `Activity Ledger missing journey marker: ${marker}`);
}

// 8. UI contract: the Journey page's deal cards read the same journey model
// (position, money, risk, next commitment), lens-aware for solo naming.
const journeyPage = readFileSync(new URL('../src/features/v31/JourneyPage.tsx', import.meta.url), 'utf8');
for (const marker of ['buildCommercialJourneySnapshot', 'formatJourneyCommitment', 'snapshot.soloPosition', 'snapshot?.moneyStatus', 'snapshot?.riskStatus', 'getWorkspaceLens']) {
  assert.ok(journeyPage.includes(marker), `Journey page missing journey marker: ${marker}`);
}

console.log('Commercial journey read-model contract verified.');
