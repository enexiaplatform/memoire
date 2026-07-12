import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBusinessCockpit } from '../src/utils/businessCockpit.ts';
import { buildMoneyFlow } from '../src/utils/moneyFlow.ts';
import { buildWeeklyBusinessReview } from '../src/utils/weeklyBusinessReview.ts';
import { buildProactiveNudges, classifyInitiativeHealth, INITIATIVE_STALL_DAYS } from '../src/utils/proactiveNudges.ts';
import { detectInsightQuestion } from '../src/features/v31/askMemoireInsightAnswers.ts';

const today = '2026-07-09';

function makeContext(patch = {}) {
  return {
    id: 'ctx-1',
    contextType: 'initiative',
    title: 'Distributor onboarding program',
    status: 'Active',
    period: 'Q3',
    owner: 'You',
    valueAtStake: null,
    nextAction: 'Send the onboarding checklist.',
    nextDate: '',
    summary: '',
    payload: {},
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

function makeActivity(patch = {}) {
  return {
    id: `act-${Math.random().toString(36).slice(2)}`,
    accountName: 'Summit', opportunityName: 'QC', activityType: 'Meeting', summary: 'Touch',
    nextAction: '', dueDate: '', tags: [], linkedOpportunityId: '', linkedOpportunityName: '',
    linkedAccountName: '', linkStatus: 'Linked', rawNote: 'Touch', activityDate: '2026-07-01',
    createdAt: '', updatedAt: '', storageMode: 'local',
    ...patch,
  };
}

function makeQuote(patch = {}) {
  return {
    id: `q-${Math.random().toString(36).slice(2)}`,
    quoteId: 'Q-1', accountName: 'Apex Labs', opportunityId: '', opportunityName: 'Validation',
    title: 'Validation quote', quoteDate: '2026-06-20', validUntil: '2026-07-20',
    amount: 100_000_000, currency: 'VND', grossMarginEstimate: null, discount: null,
    paymentTerm: '', status: 'Sent', poStatus: 'Pending', deliveryStatus: 'Not scheduled',
    expectedDeliveryDate: '', paymentStatus: 'Not due', paymentDueDate: '', nextAction: '',
    notes: '', createdAt: '', updatedAt: '',
    ...patch,
  };
}

function makeOpportunity(patch = {}) {
  return {
    id: `opp-${Math.random().toString(36).slice(2)}`,
    accountName: 'Summit', opportunityName: 'QC workflow', stage: 'Proposal',
    estimatedValue: 200_000_000, currency: 'VND', expectedClosePeriod: '', productOrSolution: '',
    decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
    nextAction: '', nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
    forecastEvidenceCategory: 'Weak but recoverable', decisionRecommendation: 'Monitor',
    status: 'Active', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '', storageMode: 'local',
    ...patch,
  };
}

// === Phase 2: initiative health ===
assert.equal(INITIATIVE_STALL_DAYS, 14);
// Quiet: created 29 days back, never mentioned.
assert.equal(classifyInitiativeHealth(makeContext(), [], today).status, 'quiet');
// Active: a recent activity mentions a title token.
assert.equal(
  classifyInitiativeHealth(makeContext(), [makeActivity({ rawNote: 'Called the distributor about onboarding', activityDate: '2026-07-05' })], today).status,
  'active',
);
// Overdue step wins over quiet.
assert.equal(classifyInitiativeHealth(makeContext({ nextDate: '2026-07-01' }), [], today).status, 'overdue-step');
// Closed statuses never stall.
assert.equal(classifyInitiativeHealth(makeContext({ status: 'Completed' }), [], today).status, 'closed');

// Nudge engine surfaces the stalled initiative.
{
  const center = buildProactiveNudges({ operatingContexts: [makeContext()], activities: [], today });
  const nudge = center.allActiveNudges.find((item) => item.source === 'initiative');
  assert.ok(nudge, 'stalled initiative must produce a nudge');
  assert.equal(nudge.title, 'Initiative going quiet');
  assert.ok(nudge.reason.includes('Distributor onboarding program'));
}

// Experiment decision prompt: a healthy experiment (recent activity) with a
// recorded signal but no decision asks for the continue/adjust/stop call,
// low urgency; a decided or signal-less experiment is left alone.
{
  const recentTouch = makeActivity({ activityDate: today, rawNote: 'Distributor onboarding program update', summary: 'Distributor onboarding program update' });
  const withSignal = makeContext({ payload: { experiment: { hypothesis: 'x', expectedSignal: 'y', currentSignal: '1 active so far', decision: 'undecided', decisionNote: '' } } });
  const decide = buildProactiveNudges({ operatingContexts: [withSignal], activities: [recentTouch], today })
    .allActiveNudges.find((item) => item.title === 'Experiment has a signal - decide');
  assert.ok(decide, 'a healthy experiment with a signal and no decision must prompt the decision');
  assert.equal(decide.urgency, 'low', 'the decide prompt is reflective, never urgent');
  assert.ok(decide.reason.includes('1 active so far'), 'the decide prompt must carry the recorded signal');

  const decided = makeContext({ payload: { experiment: { hypothesis: 'x', expectedSignal: 'y', currentSignal: '1 active so far', decision: 'continue', decisionNote: '' } } });
  assert.equal(
    buildProactiveNudges({ operatingContexts: [decided], activities: [recentTouch], today }).allActiveNudges.some((item) => item.title === 'Experiment has a signal - decide'),
    false, 'a decided experiment must not be nagged to decide again',
  );

  const noSignal = makeContext({ payload: {} });
  assert.equal(
    buildProactiveNudges({ operatingContexts: [noSignal], activities: [recentTouch], today }).allActiveNudges.some((item) => item.title === 'Experiment has a signal - decide'),
    false, 'no recorded signal means no decision prompt',
  );
}

// === Phase 2: business cockpit answers all five questions ===
{
  const answers = buildBusinessCockpit({
    commercialRiskItems: [{ id: 'r1', accountName: 'Apex', label: 'Quote', amount: 100_000_000, currency: 'VND', baseAmount: 100_000_000, status: 'Sent', risk: 'Payment overdue', nextAction: 'Chase payment', dueDate: '', href: '/app/revenue', source: 'Quote' }],
    nudges: buildProactiveNudges({ operatingContexts: [makeContext()], activities: [], today }).allActiveNudges,
    opportunities: [makeOpportunity({ nextActionDate: '2026-07-01', accountName: 'DKSH' })],
    captureInboxCount: 2,
    today,
  });
  assert.equal(answers.length, 5);
  assert.deepEqual(answers.map((item) => item.id), ['money', 'deals', 'follow-ups', 'initiatives', 'capture']);
  assert.ok(answers[0].answer.includes('Payment overdue'), 'money answer must name the risk');
  assert.ok(answers[2].answer.includes('1 overdue'), 'late follow-ups must count overdue next actions');
  assert.ok(answers[3].answer.includes('Distributor onboarding program'), 'stuck initiative must be named');
  assert.ok(answers[4].answer.includes('2 captured items'), 'capture inbox count must surface');
  // Calm state stays honest.
  const calm = buildBusinessCockpit({ commercialRiskItems: [], nudges: [], opportunities: [], captureInboxCount: 0, today });
  assert.ok(calm.every((item) => !item.urgent));
}

// === Phase 3: money flow lifecycle ===
{
  const flow = buildMoneyFlow({
    opportunities: [makeOpportunity()],
    quotes: [
      makeQuote(),
      makeQuote({ status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Due', paymentDueDate: '2026-07-01', accountName: 'Northstar' }),
      makeQuote({ status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid', accountName: 'Paid Co' }),
    ],
    today,
  });
  const byStage = Object.fromEntries(flow.lanes.map((lane) => [lane.stage, lane]));
  assert.equal(byStage.Opportunity.threads, 1, 'active opportunity without a quote heads the flow');
  assert.equal(byStage.Quoted.threads, 1);
  assert.equal(byStage['Pending payment'].threads, 1);
  assert.equal(byStage.Paid.threads, 1);
  const stuck = flow.stuckThreads.find((thread) => thread.accountName === 'Northstar');
  assert.ok(stuck, 'overdue payment must be stuck');
  assert.equal(stuck.stuckReason, 'Payment overdue');
  // Paid threads are excluded from in-motion value.
  assert.equal(flow.totalInMotionBase, 200_000_000 + 100_000_000 + 100_000_000);
  // Expired-validity quote is stuck.
  const expired = buildMoneyFlow({ opportunities: [], quotes: [makeQuote({ validUntil: '2026-07-01' })], today });
  assert.equal(expired.stuckThreads[0]?.stuckReason, 'Quote validity passed');
  // An opportunity covered by a quote must not double count.
  const linked = buildMoneyFlow({
    opportunities: [makeOpportunity({ id: 'opp-x', accountName: 'Apex Labs', opportunityName: 'Validation' })],
    quotes: [makeQuote({ opportunityId: 'opp-x' })],
    today,
  });
  assert.equal(linked.lanes.find((lane) => lane.stage === 'Opportunity').threads, 0);
}

// === Phase 2: weekly business review composition ===
{
  const review = buildWeeklyBusinessReview({
    opportunities: [makeOpportunity({ nextActionDate: '2026-07-12', nextAction: 'Send proposal', accountName: 'DueCo' })],
    quotes: [makeQuote({ status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Due', paymentDueDate: '2026-07-01' })],
    operatingContexts: [makeContext()],
    activities: [],
    opportunityOutcomes: [{
      id: 'o1', opportunityId: 'op', accountName: 'A', opportunityName: 'B', outcome: 'Won',
      outcomeDate: '2026-07-08', finalAmount: 300_000_000, currency: 'VND',
      forecastEvidenceCategoryBeforeOutcome: 'Defensible', decisionRecommendationBeforeOutcome: 'Defend',
      stageBeforeOutcome: 'Negotiation', reasonCategory: 'Other', reasonText: '',
      createdAt: '', updatedAt: '', storageMode: 'local',
    }],
    period: { start: '2026-07-06', end: '2026-07-12' },
    today,
  });
  assert.equal(review.wins.length, 1);
  assert.equal(review.stalledInitiatives.length, 1);
  // The stalled initiative carries the experiment fields for the weekly decision.
  assert.equal(review.stalledInitiatives[0].decision, 'undecided', 'a context with no experiment payload reads as undecided');
  assert.equal(review.stalledInitiatives[0].currentSignal, '');
  assert.ok(review.nextWeekPriorities.some((item) => item.label.includes('Unstick the money')));
  assert.ok(review.nextWeekPriorities.some((item) => item.label.includes('Scheduled: DueCo')));
  assert.ok(review.nextWeekPriorities.some((item) => item.label.includes('Restart the initiative')));
}

// === A stalled experiment surfaces its signal and decision for the weekly
// continue/adjust/stop call. ===
{
  const review = buildWeeklyBusinessReview({
    opportunities: [],
    quotes: [],
    operatingContexts: [makeContext({
      contextType: 'experiment', createdAt: '2026-05-01T00:00:00.000Z',
      payload: { experiment: { hypothesis: 'Faster onboarding lifts activation', expectedSignal: '3 active in 30 days', currentSignal: '1 active so far', decision: 'adjust', decisionNote: '' } },
    })],
    activities: [],
    opportunityOutcomes: [],
    period: { start: '2026-07-06', end: '2026-07-12' },
    today,
  });
  assert.equal(review.stalledInitiatives.length, 1);
  assert.equal(review.stalledInitiatives[0].currentSignal, '1 active so far', 'the review must carry the current experiment signal');
  assert.equal(review.stalledInitiatives[0].decision, 'adjust', 'the review must carry the recorded decision');
}

// UI contract: the Weekly Review panel renders the experiment signal and decision.
{
  const panel = readFileSync(new URL('../src/features/reviews/WeeklyBusinessReviewPanel.tsx', import.meta.url), 'utf8');
  for (const marker of ['Signal so far:', 'initiativeDecisionLabel', 'item.currentSignal']) {
    assert.ok(panel.includes(marker), `Weekly Review panel missing initiative marker: ${marker}`);
  }
}

// === Retention tail in next-week priorities: the coldest paid-but-quiet
// customer earns one slot; an active deal on the account suppresses it
// (the silence rules own that case). ===
{
  const paidQuiet = buildWeeklyBusinessReview({
    opportunities: [],
    quotes: [makeQuote({ status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid', accountName: 'Retention Co', quoteDate: '2026-05-15' })],
    operatingContexts: [],
    activities: [],
    opportunityOutcomes: [],
    period: { start: '2026-07-06', end: '2026-07-12' },
    today,
  });
  const retention = paidQuiet.nextWeekPriorities.find((item) => item.label.includes('Book a retention touch: Retention Co'));
  assert.ok(retention, 'a paid-but-quiet customer must earn a next-week retention priority');
  assert.ok(retention.detail.includes('no touch has been captured since'), 'no-history retention must say so plainly');

  const suppressed = buildWeeklyBusinessReview({
    opportunities: [makeOpportunity({ accountName: 'Retention Co', nextActionDate: '' })],
    quotes: [makeQuote({ status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid', accountName: 'Retention Co', quoteDate: '2026-05-15' })],
    operatingContexts: [],
    activities: [],
    opportunityOutcomes: [],
    period: { start: '2026-07-06', end: '2026-07-12' },
    today,
  });
  assert.equal(
    suppressed.nextWeekPriorities.some((item) => item.label.includes('Book a retention touch')),
    false,
    'an active deal on the account must suppress the retention priority',
  );
}

// === Stage 2.2: commitments ledger - promises vs the activity ledger ===
{
  const review = buildWeeklyBusinessReview({
    opportunities: [
      makeOpportunity({ id: 'kept', accountName: 'KeptCo', opportunityName: 'Deal K', nextAction: 'Send proposal', nextActionDate: '2026-07-07' }),
      makeOpportunity({ id: 'missed', accountName: 'MissedCo', opportunityName: 'Deal M', nextAction: 'Call buyer', nextActionDate: '2026-07-07' }),
      makeOpportunity({ id: 'up', accountName: 'UpCo', opportunityName: 'Deal U', nextAction: 'Demo', nextActionDate: '2026-07-11' }),
      makeOpportunity({ id: 'undated', accountName: 'NoDateCo', nextActionDate: '' }),
    ],
    quotes: [],
    operatingContexts: [],
    activities: [
      makeActivity({ linkedOpportunityId: 'kept', accountName: 'KeptCo', activityDate: '2026-07-08' }),
      makeActivity({ linkedOpportunityId: 'missed', accountName: 'MissedCo', activityDate: '2026-07-05' }),
    ],
    opportunityOutcomes: [],
    period: { start: '2026-07-06', end: '2026-07-12' },
    today,
  });
  const byId = Object.fromEntries(review.commitments.map((item) => [item.id, item]));
  assert.equal(byId['commitment-kept'].status, 'kept', 'touch on/after the promised date keeps the commitment');
  assert.ok(byId['commitment-kept'].evidence.includes('Jul 8'));
  assert.equal(byId['commitment-missed'].status, 'missed', 'a touch BEFORE the promised date does not keep it');
  assert.equal(byId['commitment-up'].status, 'upcoming');
  assert.equal('commitment-undated' in byId, false, 'undated next actions are not commitments');
  assert.equal(review.commitments[0].status, 'missed', 'missed commitments sort first');
}
{
  const panel = readFileSync(new URL('../src/features/reviews/WeeklyBusinessReviewPanel.tsx', import.meta.url), 'utf8');
  for (const marker of ['Commitments', 'honest, not reconstructed', 'commitmentTone']) {
    assert.ok(panel.includes(marker), `WeeklyBusinessReviewPanel missing marker: ${marker}`);
  }
}

// === Customer-signal digest: rolled up from captured extractions only ===
{
  const review = buildWeeklyBusinessReview({
    opportunities: [],
    quotes: [],
    operatingContexts: [],
    activities: [
      makeActivity({ activityDate: '2026-07-08', buyingSignals: ['Budget approved for next quarter'], risks: ['Lead time concern'], competitors: ['Incumbent Vendor'] }),
      makeActivity({ activityDate: '2026-07-07', buyingSignals: ['budget approved for next quarter'], timelineSignals: ['Tender decision end of July'] }),
      makeActivity({ activityDate: '2026-06-01', buyingSignals: ['Out-of-period signal'] }),
    ],
    opportunityOutcomes: [],
    period: { start: '2026-07-06', end: '2026-07-12' },
    today,
  });
  assert.equal(review.signals.buying.length, 1, 'case-insensitive dedupe must collapse repeats');
  assert.equal(review.signals.buying[0].text, 'Budget approved for next quarter');
  assert.equal(review.signals.risks.length, 1);
  assert.equal(review.signals.timeline.length, 1);
  assert.equal(review.signals.competitors.length, 1);
  assert.equal(review.signals.total, 4, 'out-of-period signals must not count');
}
{
  const panel = readFileSync(new URL('../src/features/reviews/WeeklyBusinessReviewPanel.tsx', import.meta.url), 'utf8');
  for (const marker of ['Customer signals this period', 'nothing inferred', 'SignalGroup']) {
    assert.ok(panel.includes(marker), `WeeklyBusinessReviewPanel missing signal marker: ${marker}`);
  }
}

// === Phase 3: Ask Memoire business-state detection ===
assert.equal(detectInsightQuestion('Where is the money?'), 'money_state');
assert.equal(detectInsightQuestion('What am I owed right now?'), 'money_state');
assert.equal(detectInsightQuestion('What happened this week?'), 'week_recap');
assert.equal(detectInsightQuestion('Give me a recap of my week'), 'week_recap');
assert.equal(detectInsightQuestion('How much money should I spend on ads?'), null, 'non-state money questions fall through');

// === UI wiring markers ===
const dashboard = readFileSync(new URL('../src/features/dashboard/DashboardPage.tsx', import.meta.url), 'utf8');
for (const marker of ['BusinessCockpitStrip', 'buildBusinessCockpit', 'operatingContexts: data.operatingContext']) {
  assert.ok(dashboard.includes(marker), `DashboardPage missing marker: ${marker}`);
}
const reviews = readFileSync(new URL('../src/features/reviews/SalesReviewsPage.tsx', import.meta.url), 'utf8');
for (const marker of ['WeeklyBusinessReviewPanel', 'buildWeeklyBusinessReview', 'Weekly Business Review']) {
  assert.ok(reviews.includes(marker), `SalesReviewsPage missing marker: ${marker}`);
}
const revenue = readFileSync(new URL('../src/features/revenue/RevenueViewPage.tsx', import.meta.url), 'utf8');
for (const marker of ['Money flow', 'buildMoneyFlow', 'Stuck money first']) {
  assert.ok(revenue.includes(marker), `RevenueViewPage missing marker: ${marker}`);
}
const askPage = readFileSync(new URL('../src/features/v31/AskMemoirePage.tsx', import.meta.url), 'utf8');
for (const marker of ['answerFromMoneyFlow', 'answerFromWeekRecap']) {
  assert.ok(askPage.includes(marker), `AskMemoirePage missing marker: ${marker}`);
}
const contexts = readFileSync(new URL('../src/services/operatingContextStore.ts', import.meta.url), 'utf8');
assert.ok(contexts.includes("['initiative', 'play', 'offer', 'experiment']"), 'offer/experiment must be first-class initiative types');

console.log('Business OS deep-loop (Phase 2+3) contract verified.');
