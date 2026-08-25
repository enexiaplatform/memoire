import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  answerFromCommitments,
  answerFromDealPosition,
  answerFromFollowUpImpact,
  answerFromForecastCalibration,
  answerFromObjectionPlaybook,
  answerFromRetentionSignals,
  detectInsightQuestion,
  resolveDealForQuestion,
} from '../src/features/v31/askMemoireInsightAnswers.ts';
import { buildFollowUpImpact } from '../src/utils/followUpImpact.ts';
import { buildObjectionPlaybook } from '../src/utils/objectionPlaybook.ts';
import { buildForecastCalibration } from '../src/utils/forecastCalibration.ts';
import { buildRetentionSignals } from '../src/utils/retentionSignals.ts';
import { buildCommitmentLedger } from '../src/utils/weeklyBusinessReview.ts';
import { buildCommercialJourneySnapshot } from '../src/utils/commercialJourney.ts';
import { buildInitiativeReview } from '../src/utils/initiativeReview.ts';
import { buildCustomerSignalDigest } from '../src/utils/customerSignals.ts';
import { advertisedQuestions, allMemoryPresets, attentionFocusFor, attentionHeadings, answerFromMemory, hasSingleSubject, isAttentionQuestion, isWhatChangedQuestion, opportunityPresets } from '../src/features/v31/askMemoireContext.ts';
import { answerFromInitiativeReview, answerFromCustomerSignals, answerFromRecordFind, findRecords } from '../src/features/v31/askMemoireInsightAnswers.ts';

// 1. Detection is narrow and routes to the right layer.
assert.equal(detectInsightQuestion('Did my follow-ups work?'), 'follow_up_impact');
assert.equal(detectInsightQuestion('Which deals did I revive this month?'), 'follow_up_impact');
assert.equal(detectInsightQuestion('What worked against price objections?'), 'objection_playbook');
assert.equal(detectInsightQuestion('How do I handle the lead time objection?'), 'objection_playbook');
assert.equal(detectInsightQuestion('What is my win rate on defensible deals?'), 'forecast_calibration');
assert.equal(detectInsightQuestion('How accurate is my forecast?'), 'forecast_calibration');
assert.equal(detectInsightQuestion('Which customers should I check back with?'), 'retention_check');
assert.equal(detectInsightQuestion('Which paid customers are going quiet?'), 'retention_check');
assert.equal(detectInsightQuestion('Did I keep my promises this week?'), 'commitments');
assert.equal(detectInsightQuestion('What commitments are due?'), 'commitments');
assert.equal(detectInsightQuestion('What are customers telling me?'), 'customer_signals');
assert.equal(detectInsightQuestion('What signals did I get this week?'), 'customer_signals');
assert.equal(detectInsightQuestion('Which customers should I check back with?'), 'retention_check', 'retention keeps its own answer, not the signals one');
assert.equal(detectInsightQuestion('How are my experiments going?'), 'initiative_review');
assert.equal(detectInsightQuestion('Which initiative should I stop?'), 'initiative_review');
assert.equal(detectInsightQuestion('How is the experiment going?'), 'initiative_review', 'experiment questions win over the generic deal-position "how is ... going"');
assert.equal(detectInsightQuestion('Where does the Apex deal stand?'), 'deal_position');
assert.equal(detectInsightQuestion('Where do we stand with Apex Labs?'), 'deal_position');
assert.equal(detectInsightQuestion('How is the Northstar deal going?'), 'deal_position');
assert.equal(detectInsightQuestion('Where is the money?'), 'money_state', 'money question must win over deal position');
assert.equal(detectInsightQuestion('Which commitments are overdue?'), 'commitments', 'overdue is how an operator says a promise slipped');
assert.equal(detectInsightQuestion('What am I waiting for from customers?'), 'awaiting_customer');
assert.equal(detectInsightQuestion('What do I owe today?'), 'own_obligations');
assert.equal(detectInsightQuestion('What are customers telling me?'), 'customer_signals', 'the signals question is not the waiting-on-them question');
// Ambiguous or unrelated questions fall through to the normal answer path.
assert.equal(detectInsightQuestion('What should I do next?'), null);
assert.equal(detectInsightQuestion('Draft a follow-up for Apex Labs'), null, 'drafting requests are not history questions');
assert.equal(detectInsightQuestion('Which objections are unresolved?'), null, 'open-objection listing is not the playbook question');
assert.equal(detectInsightQuestion('Which deals may go silent?'), null, 'silent deals keep their own local answer path');

// 2. Empty layers answer honestly instead of inventing numbers.
{
  const impactAnswer = answerFromFollowUpImpact(buildFollowUpImpact({ activities: [], opportunities: [] }));
  assert.ok(impactAnswer.answer.includes('No follow-ups were logged'));
  assert.equal(impactAnswer.cards, undefined);

  const playbookAnswer = answerFromObjectionPlaybook(buildObjectionPlaybook({ objections: [] }));
  assert.ok(playbookAnswer.answer.includes('Not enough objection history'));

  const calibrationAnswer = answerFromForecastCalibration(buildForecastCalibration({ outcomes: [], opportunities: [] }));
  assert.ok(calibrationAnswer.answer.includes('No closed outcomes'));

  const retentionAnswer = answerFromRetentionSignals(buildRetentionSignals({ quotes: [], activities: [] }));
  assert.ok(retentionAnswer.answer.includes('No paid customer needs a retention touch'), 'empty retention must read as healthy, not blank');
  assert.equal(retentionAnswer.cards, undefined);

  const commitmentsAnswer = answerFromCommitments(buildCommitmentLedger({ opportunities: [], activities: [], period: { start: '2026-07-02', end: '2026-07-16' } }, '2026-07-09'));
  assert.ok(commitmentsAnswer.answer.includes('No dated commitments'), 'empty commitments must point at dating next actions');

  const initiativeAnswer = answerFromInitiativeReview(buildInitiativeReview({ operatingContexts: [], activities: [] }));
  assert.ok(initiativeAnswer.answer.includes('No open initiatives'), 'empty initiative review must invite tracking one');
  assert.equal(initiativeAnswer.cards, undefined);

  const signalsAnswer = answerFromCustomerSignals(buildCustomerSignalDigest({ activities: [] }));
  assert.ok(signalsAnswer.answer.includes('No customer signals captured'), 'empty signals must invite capturing them');
  assert.equal(signalsAnswer.cards, undefined);
}

// 2e. Customer signals roll up buying/risk/timeline/competitor, risks first.
{
  const activity = (patch) => ({
    id: `a-${Math.random().toString(36).slice(2)}`, accountName: 'Apex Labs', opportunityName: 'Validation',
    activityType: 'Meeting', summary: '', nextAction: '', dueDate: '', tags: [],
    buyingSignals: [], risks: [], timelineSignals: [], competitors: [],
    linkedOpportunityId: '', linkedOpportunityName: '', linkedAccountName: '', linkStatus: 'Linked',
    rawNote: 'x', activityDate: '2026-07-05', createdAt: '', updatedAt: '', storageMode: 'local', ...patch,
  });
  const digest = buildCustomerSignalDigest({ activities: [
    activity({ buyingSignals: ['Budget approved'], activityDate: '2026-07-05' }),
    activity({ risks: ['Lead time concern'], accountName: 'Northstar', activityDate: '2026-07-06' }),
    activity({ buyingSignals: ['Budget approved'], activityDate: '2026-07-04' }), // dupe, dropped
  ] });
  assert.equal(digest.buying.length, 1, 'case-insensitive dedupe across activities');
  assert.equal(digest.risks.length, 1);
  const answer = answerFromCustomerSignals(digest);
  assert.ok(answer.answer.includes('1 buying'), 'the answer must count buying signals');
  assert.ok(answer.answer.includes('Lead time concern'), 'the answer must lead with the risk');
  assert.ok(answer.cards?.[0]?.fields.some((field) => field.label === 'Risks'));
}

// 2d. Initiative review measures health and carries the experiment signal.
{
  const context = {
    id: 'ctx-1', contextType: 'experiment', title: 'Distributor onboarding program', status: 'In progress',
    period: '', owner: '', valueAtStake: '', nextAction: 'Call the top 3 distributors', nextDate: '',
    summary: '', payload: { experiment: { hypothesis: 'Faster onboarding lifts activation', expectedSignal: '3 active in 30 days', currentSignal: '1 active so far', decision: 'adjust', decisionNote: '' } },
    sourceSystem: '', externalSourceKey: '', createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '', storageMode: 'local',
  };
  const review = buildInitiativeReview({ operatingContexts: [context], activities: [], today: '2026-07-09' });
  assert.equal(review.openCount, 1);
  assert.equal(review.stalled.length, 1, 'an initiative with no recent activity is stalled');
  assert.equal(review.stalled[0].health, 'quiet');
  assert.equal(review.decidedToChange.length, 0, 'a stalled initiative is never double-listed under decided-to-change - the Weekly Review rule');

  // The same decided initiative with a recent touch is active, so the decision
  // without follow-through is what surfaces.
  const touch = {
    id: 'a-touch', accountName: '', opportunityName: '', activityType: 'Meeting',
    summary: 'Distributor onboarding check-in', nextAction: '', dueDate: '', tags: [],
    buyingSignals: [], risks: [], timelineSignals: [], competitors: [],
    linkedOpportunityId: '', linkedOpportunityName: '', linkedAccountName: '', linkStatus: 'Unlinked',
    rawNote: 'Distributor onboarding check-in', activityDate: '2026-07-07',
    createdAt: '', updatedAt: '', storageMode: 'local',
  };
  const activeReview = buildInitiativeReview({ operatingContexts: [context], activities: [touch], today: '2026-07-09' });
  assert.equal(activeReview.stalled.length, 0, 'a recent touch keeps the initiative out of the stalled list');
  assert.equal(activeReview.decidedToChange.length, 1, 'an adjust/stop decision that is still open needs follow-through');
  assert.equal(activeReview.decidedToChange[0].decision, 'adjust');

  const answer = answerFromInitiativeReview(review);
  assert.ok(answer.answer.includes('1 open initiative'), 'the answer must count open initiatives');
  assert.ok(answer.answer.includes('Distributor onboarding program'), 'the stalled initiative must be named');
  assert.ok(answer.cards?.[0]?.fields.some((field) => field.label === 'Stalled - needs a decision'));
  assert.ok(JSON.stringify(answer.cards?.[0]?.fields).includes('1 active so far'), 'the current experiment signal must surface');
}

// 2b. Retention and commitments answer with real evidence when populated.
{
  const paidQuote = {
    id: 'q-paid', quoteId: 'Q-1', accountName: 'Retention Pharma', opportunityId: '', opportunityName: 'Analyzer order',
    title: 'Analyzer order', quoteDate: '2026-05-15', validUntil: '2026-06-15', amount: 250_000_000, currency: 'VND',
    grossMarginEstimate: null, discount: null, paymentTerm: '', status: 'Accepted', poStatus: 'Received',
    deliveryStatus: 'Delivered', expectedDeliveryDate: '', paymentStatus: 'Paid', paymentDueDate: '',
    nextAction: '', notes: '', createdAt: '', updatedAt: '',
  };
  const oldTouch = {
    id: 'a-old', accountName: 'Retention Pharma', opportunityName: '', activityType: 'Meeting', summary: 'Handover',
    nextAction: '', dueDate: '', tags: [], linkedOpportunityId: '', linkedOpportunityName: '', linkedAccountName: '',
    linkStatus: 'Linked', rawNote: 'x', activityDate: '2026-06-10', createdAt: '', updatedAt: '', storageMode: 'local',
  };
  const retentionAnswer = answerFromRetentionSignals(buildRetentionSignals({
    quotes: [paidQuote], activities: [oldTouch], today: '2026-07-09',
  }));
  assert.ok(retentionAnswer.answer.includes('Retention Pharma'), 'retention answer must name the account');
  assert.ok(retentionAnswer.answer.includes('quiet 29d'), 'retention answer must carry the measured quiet days');
  assert.equal(retentionAnswer.cards?.[0]?.kind, 'insight');
  assert.ok(retentionAnswer.cards?.[0]?.fields.some((field) => field.label === 'Basis'), 'retention card must state its evidence boundary');

  const promisedOpportunity = {
    id: 'opp-promise', accountName: 'Apex Labs', opportunityName: 'Validation', stage: 'Negotiation',
    estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: '', productOrSolution: '',
    decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
    nextAction: 'Send revised quote', nextActionDate: '2026-07-05', evidence: '', missingContext: '', objectionDebt: '',
    forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Defend',
    status: 'Active', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '', storageMode: 'local',
  };
  const commitments = buildCommitmentLedger({
    opportunities: [promisedOpportunity], activities: [], period: { start: '2026-07-02', end: '2026-07-16' },
  }, '2026-07-09');
  const commitmentsAnswer = answerFromCommitments(commitments);
  assert.ok(commitmentsAnswer.answer.includes('1 missed'), 'a passed promise with no touch must count as missed');
  assert.ok(commitmentsAnswer.answer.includes('Apex Labs'), 'the missed promise must be named');
  assert.ok(commitmentsAnswer.answer.includes('not reconstructed'), 'commitments must state the honesty boundary');
  assert.ok(commitmentsAnswer.cards?.[0]?.fields.some((field) => field.label === 'Missed promises'));
}

// 2c. Deal position resolves the right deal and answers from the journey model.
{
  const opportunities = [
    {
      id: 'opp-apex', accountName: 'Apex Labs', opportunityName: 'Validation Expansion', stage: 'Negotiation',
      estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: '', productOrSolution: '',
      decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
      nextAction: 'Send revised quote', nextActionDate: '2026-07-12', evidence: 'Budget approved.',
      missingContext: '', objectionDebt: '', forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Defend',
      status: 'Active', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '', storageMode: 'local',
    },
    {
      id: 'opp-north', accountName: 'Northstar Foods', opportunityName: 'Lab workflow', stage: 'Proposal',
      estimatedValue: 50_000_000, currency: 'VND', expectedClosePeriod: '', productOrSolution: '',
      decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
      nextAction: '', nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
      forecastEvidenceCategory: 'Weak but recoverable', decisionRecommendation: 'Monitor',
      status: 'Active', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '', storageMode: 'local',
    },
  ];

  // Name match resolves to the right deal; the scoped id wins outright.
  assert.equal(resolveDealForQuestion('Where does the Apex Labs deal stand?', opportunities)?.id, 'opp-apex');
  assert.equal(resolveDealForQuestion('Where do we stand?', opportunities, 'opp-north')?.id, 'opp-north', 'a scoped id must win');
  assert.equal(resolveDealForQuestion('Where does the Contoso deal stand?', opportunities), null, 'an unknown deal resolves to null so the caller can fall through');

  const snapshot = buildCommercialJourneySnapshot({
    opportunity: opportunities[0], quotes: [], activities: [], objections: [], today: '2026-07-09',
  });
  const answer = answerFromDealPosition(snapshot, opportunities[0]);
  assert.ok(answer.answer.includes('Apex Labs / Validation Expansion'), 'deal position must name the deal');
  assert.ok(answer.answer.includes('Negotiation'), 'deal position must carry the journey position');
  assert.equal(answer.cards?.[0]?.kind, 'insight');
  assert.ok(answer.cards?.[0]?.fields.some((field) => field.label === 'Next commitment'));

  // Discoverability: the opportunity-scoped presets lead with a one-tap
  // deal-position question, and it routes to the deal_position layer.
  assert.ok(opportunityPresets.includes('Where does this deal stand?'), 'opportunity presets must offer the deal-position question');
  assert.equal(detectInsightQuestion('Where does this deal stand?'), 'deal_position', 'the deal-position preset must route to the journey answer');

  // The all-scope presets surface measured-history questions, and every one
  // routes to a measured answer layer (no dead preset that falls through).
  const measuredPresets = ['Where is the money?', 'Did my follow-ups work?', 'What are customers telling me?'];
  for (const preset of measuredPresets) {
    assert.ok(allMemoryPresets.includes(preset), `all-scope presets must include the measured question: ${preset}`);
    assert.ok(detectInsightQuestion(preset), `measured preset must route to an insight layer: ${preset}`);
  }
}

// 3. Populated layers produce an insight card with real numbers.
{
  const impact = buildFollowUpImpact({
    today: '2026-07-09',
    opportunities: [{
      id: 'opp-1', accountName: 'Summit', opportunityName: 'QC', stage: 'Proposal',
      estimatedValue: 200_000_000, currency: 'VND', expectedClosePeriod: '', productOrSolution: '',
      decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
      nextAction: '', nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
      forecastEvidenceCategory: 'Weak but recoverable', decisionRecommendation: 'Monitor',
      status: 'Active', createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z', storageMode: 'local',
    }],
    activities: [
      { id: 'a1', accountName: 'Summit', opportunityName: 'QC', activityType: 'Meeting', summary: '', nextAction: '', dueDate: '', tags: [], linkedOpportunityId: 'opp-1', linkedOpportunityName: 'QC', linkedAccountName: 'Summit', linkStatus: 'Linked', rawNote: 'x', activityDate: '2026-06-10', createdAt: '', updatedAt: '', storageMode: 'local' },
      { id: 'a2', accountName: 'Summit', opportunityName: 'QC', activityType: 'Follow-up', summary: '', nextAction: '', dueDate: '', tags: [], linkedOpportunityId: 'opp-1', linkedOpportunityName: 'QC', linkedAccountName: 'Summit', linkStatus: 'Linked', rawNote: 'x', activityDate: '2026-06-28', createdAt: '', updatedAt: '', storageMode: 'local' },
      { id: 'a3', accountName: 'Summit', opportunityName: 'QC', activityType: 'Call', summary: '', nextAction: '', dueDate: '', tags: [], linkedOpportunityId: 'opp-1', linkedOpportunityName: 'QC', linkedAccountName: 'Summit', linkStatus: 'Linked', rawNote: 'x', activityDate: '2026-07-02', createdAt: '', updatedAt: '', storageMode: 'local' },
    ],
  });
  const answer = answerFromFollowUpImpact(impact);
  assert.ok(answer.answer.includes('1 deal is back in motion'));
  assert.equal(answer.cards?.[0]?.kind, 'insight');
  assert.ok(answer.cards?.[0]?.fields.some((field) => field.label === 'Evidence'));
}

// 4. UI contract: the page routes insight questions locally, never to the endpoint.
const askPage = readFileSync(new URL('../src/features/v31/AskMemoirePage.tsx', import.meta.url), 'utf8');
for (const marker of ['detectInsightQuestion', 'answerFromFollowUpImpact', 'answerFromObjectionPlaybook', 'answerFromForecastCalibration', 'answerFromRetentionSignals', 'answerFromCommitments', 'answerFromDealPosition', 'resolveDealForQuestion', 'answerFromInitiativeReview', 'answerFromCustomerSignals', 'no AI involved']) {
  assert.ok(askPage.includes(marker), `AskMemoirePage missing marker: ${marker}`);
}
const insightSource = readFileSync(new URL('../src/features/v31/askMemoireInsightAnswers.ts', import.meta.url), 'utf8');
assert.ok(insightSource.includes('History, not prediction'), 'calibration card must carry the honesty basis line');


// 9. The page's advertised list is a promise, and every question on it routes.
//
// Five of the eight questions printed under "What this can answer" reached no
// engine and fell through to the generic memory answer, which knows nothing
// about money, orders or promises. The list and the matchers now live in one
// module so they cannot drift apart silently.
{
  const fallbackByDesign = new Set(['Summarize this account.']);
  const unrouted = advertisedQuestions
    .filter((question) => !fallbackByDesign.has(question))
    .filter((question) => !isAttentionQuestion(question)
      && !isWhatChangedQuestion(question)
      && detectInsightQuestion(question) === null);
  assert.deepEqual(unrouted, [], `advertised on the Ask page but routed nowhere: ${unrouted.join(' | ')}`);

  const askSource = readFileSync(new URL('../src/features/v31/AskMemoirePage.tsx', import.meta.url), 'utf8');
  assert.ok(
    askSource.includes('advertisedQuestions.map((advertised) =>'),
    'the advertised list must render from the shared constant, not a second hand-written copy in JSX',
  );

  // The one guess that leaves the app as text the operator sends.
  const twoCustomers = {
    scope: 'all',
    includedData: {
      accounts: [{ id: 'a1', name: 'Grupo Calvo' }, { id: 'a2', name: 'Luis Simoes Logistica' }],
      opportunities: [{ id: 'o1', account_id: 'a2', title: 'Heat recovery retrofit', stage: 'proposal' }],
      interactions: [{ id: 'i1', account_id: 'a2', summary: 'Call about the retrofit', occurred_at: '2026-08-20T09:00:00.000Z' }],
      actions: [{ id: 'ac1', account_id: 'a2', status: 'open', title: 'Confirm the phasing' }],
      objections: [],
    },
    missingContext: [],
  };
  const draft = answerFromMemory('Draft a follow-up', twoCustomers);
  assert.ok(!draft.answer.startsWith('Hi Grupo Calvo'), 'a draft must not greet one customer over another customer objection');
  assert.ok(draft.answer.includes('Pick a customer first'));

  // The answer card builder is the third copy of this join and the one the
  // operator sees. It must consult the same test, not grow its own.
  assert.equal(hasSingleSubject([{ id: 'a1' }, { id: 'a2' }], { account_id: 'a1' }), false);
  assert.equal(hasSingleSubject([{ id: 'a1' }], { account_id: 'a1' }), true);
  assert.ok(
    askSource.includes('if (!hasSingleSubject(accounts, opportunity)) return answer;'),
    'the answer card builder must refuse to draw a one-customer card over several customers',
  );

  const structured = answerFromMemory('Which opportunities have no next action?', twoCustomers);
  assert.ok(!structured.answer.startsWith('Account: Grupo Calvo'), 'no single account heading over workspace-wide evidence');
  assert.ok(structured.answer.includes('top of its own list'));
}


// 10. The page is titled "Find anything". A bare record name must find it.
{
  const book = [
    { id: 'd1', accountName: 'Grupo Calvo', opportunityName: 'Cold store retrofit', stage: 'Proposal', status: 'Active', estimatedValue: 120000, currency: 'EUR', nextAction: 'Confirm the phasing', nextActionDate: '' },
    { id: 'd2', accountName: 'Grupo Calvo', opportunityName: 'Chiller replacement', stage: 'Won', status: 'Won', estimatedValue: 90000, currency: 'EUR', nextAction: '', nextActionDate: '' },
  ];
  const found = findRecords('Grupo Calvo', book);
  assert.ok(found, 'a bare customer name must find that customer, not summarize the workspace');
  assert.ok(answerFromRecordFind(found).answer.startsWith('Grupo Calvo:'));
  // Folded, so an accented or differently cased name still lands.
  assert.ok(findRecords('GRUPO CALVO', book));
  // A question is a question even when it names a customer.
  assert.equal(findRecords('What changed at Grupo Calvo this week?', book), null);
  assert.equal(findRecords('Which deals may go silent?', book), null);
  assert.equal(findRecords('Bahri Ship Management', book), null, 'a name nobody has must not be invented into a match');
  // A JavaScript word boundary is ASCII-only, so the accent in "Hoteis" put a
  // boundary before its final "is" and the cue for the verb matched inside the
  // customer's name. Every accented name in the book was one boundary away.
  const accented = [{ id: 'd9', accountName: 'Grupo Pestana Hoteis'.replace('Hoteis', 'Hotéis'), opportunityName: 'Boiler upgrade', stage: 'Proposal', status: 'Active', estimatedValue: 112000, currency: 'EUR', nextAction: '', nextActionDate: '' }];
  assert.ok(findRecords('Grupo Pestana Hotéis', accented), 'an accented customer name must still be looked up, not read as a question');
}


// 11. Four attention questions must not share one answer.
{
  const askSource = readFileSync(new URL('../src/features/v31/AskMemoirePage.tsx', import.meta.url), 'utf8');
  assert.equal(attentionFocusFor('Which objections are unresolved?'), 'objections');
  assert.equal(attentionFocusFor('Which opportunities have no next action?'), 'no_next_action');
  assert.equal(attentionFocusFor('Which accounts need follow-up?'), 'accounts');
  assert.equal(attentionFocusFor('Which deals may go silent?'), 'all');
  const focuses = ['objections', 'no_next_action', 'accounts', 'all'];
  assert.equal(
    new Set(focuses.map((focus) => attentionHeadings[focus])).size,
    focuses.length,
    'each attention focus needs its own heading - one heading for four questions is how they became one answer',
  );
  assert.ok(
    askSource.includes('focus: attentionFocusFor(nextQuestion),'),
    'the attention answer must be told which question was asked',
  );
  assert.ok(
    askSource.includes('answer: `${attentionHeadings[focus]}'),
    'the attention answer must use the heading for the question asked, not a fixed one',
  );
  // Filtering on one reason and displaying another made the objections answer
  // name a deal and then explain it with "No recent interaction is available."
  assert.ok(
    askSource.includes('const objectionTitleFor ='),
    'the objections answer must name the objection somebody recorded, not just report that one exists',
  );
  assert.ok(
    askSource.includes('why === shown ?'),
    'the card must not print the same sentence under two labels',
  );
}

console.log('Ask Memoire insight answers contract verified.');
