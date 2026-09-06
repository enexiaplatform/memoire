import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildScaleWorkspace } from './lib/scale-workspace.mjs';
import { buildMasterDashboard } from '../src/utils/masterDashboard.ts';
import { buildBusinessLens } from '../src/utils/businessLens.ts';
import { buildOrderBook } from '../src/utils/orderToCash.ts';
import { buildOutcomeScoreboard } from '../src/utils/outcomeScoreboard.ts';
import { resolveCommercialThreads } from '../src/domain/commercialKernel/deriveThreads.ts';
import { buildKnowledgeGraph } from '../src/utils/knowledgeGraph.ts';
import { buildGraphView } from '../src/utils/knowledgeLayout.ts';
import { deriveCommercialDelta } from '../src/domain/commercialKernel/deriveDelta.ts';
import { evaluateCommercialPolicies } from '../src/domain/commercialKernel/policyEngine.ts';
import { rankRecommendations } from '../src/domain/commercialKernel/rankRecommendations.ts';
import { parseCapture } from '../src/domain/commercialKernel/parseCapture.ts';
import {
  projectCurrentEvidence,
  supportingEvidenceFor,
} from '../src/domain/commercialKernel/commercialEvidence.ts';
import { derivePersonalLearning } from '../src/domain/commercialLearning/derivePersonalLearning.ts';
import { resolveCommercialScope } from '../src/domain/commercialKernel/resolveCommercialScope.ts';
import { suggestHistoricalLinks } from '../src/domain/commercialKernel/suggestHistoricalLinks.ts';

/**
 * The derived models, measured against a real book of business.
 *
 * Memoire computes everything on the operator's device, which is the reason it
 * needs no AI service and no server round trip - and the reason a quadratic
 * join nobody notices at seven demo records becomes a frozen tab at three
 * hundred. Nobody had measured that before 2026-08-02; the founder's own import
 * is 122 opportunities and the next users arrive with more.
 *
 * The scale below is deliberately past where the product is today: 300
 * opportunities, 900 captured activities, 200 accounts, 250 quotes. If the
 * models hold there, the surfaces built on them have room.
 *
 * The budgets are generous on purpose. This is not a stopwatch competition, it
 * is a tripwire for the one mistake that actually happens - a nested scan added
 * to a hot path - and it has to stay quiet on a loaded CI machine. A model that
 * doubles is still inside budget; a model that goes quadratic is not.
 */

const SCALE = { opportunities: 300, activities: 900, accounts: 200, quotes: 250 };

/** Milliseconds, on the slowest machine this is expected to run on. */
const BUDGETS = {
  masterDashboard: 400,
  businessLens: 250,
  orderBook: 250,
  outcomeScoreboard: 250,
  resolveThreads: 600,
  // The Business Vault derives every node, relation, memory entry and gap in
  // one pass over the workspace. It is the largest single derivation in the
  // product, so it gets the largest budget - and the tripwire matters more here
  // than anywhere else, because a graph is exactly the shape of thing where an
  // innocent-looking nested lookup turns quadratic.
  knowledgeGraph: 150,
  knowledgeGraphView: 40,
  // One subject against the whole book. Generous, like the rest: a tripwire for
  // a nested scan, not a stopwatch.
  deriveDelta: 100,
  // Ranking runs over every candidate the policy engine raised, resolving a
  // record and a currency for each. It sits behind Today, so it has to stay
  // cheap at a book that raises hundreds of them.
  rankRecommendations: 150,
  // Capture parsing runs the moment a note is saved, in front of somebody who
  // has just come out of a meeting. It has to feel instant on a long note over
  // a real book of customers.
  parseCapture: 120,
  // Evidence is projected once per read and then looked up by scope. This
  // budget is a tripwire for the shape it must never take: asking the evidence
  // list per deal, inside a loop over the deals.
  projectCurrentEvidence: 40,
  /**
   * Learning walks every closed deal once per pattern, over a book several
   * times the size of the one this product has today. Generous, like the rest:
   * it is a tripwire for a nested scan, and it is measured at a scale the
   * workspace will not reach for a long time precisely so that it stays one.
   */
  personalLearning: 400,
  /**
   * Scope resolution runs while the seller types, so it has the tightest budget
   * in this file. It reads a handful of fields off the deals on one customer;
   * anything approaching this number means it has started scanning the book.
   */
  resolveCommercialScope: 20,
  /**
   * Historical suggestions run once when the Review page opens, over every
   * unlinked activity. Heavier by design and still bounded: the account index
   * is what keeps it from being every activity against every deal.
   */
  suggestHistoricalLinks: 300,
};

const { opportunities, activities, accounts, quotes, outcomes } = buildScaleWorkspace(SCALE);

function measure(label, run) {
  // One warm-up so the first run's compilation is not the measurement.
  run();
  const started = performance.now();
  run();
  const elapsed = performance.now() - started;
  const budget = BUDGETS[label];
  const verdict = elapsed <= budget ? 'ok' : 'OVER BUDGET';
  console.log(`  ${label.padEnd(20)} ${elapsed.toFixed(1).padStart(7)} ms   budget ${String(budget).padStart(4)} ms   ${verdict}`);
  assert.ok(
    elapsed <= budget,
    `${label} took ${elapsed.toFixed(0)}ms at ${SCALE.opportunities} deals / ${SCALE.activities} activities, over its ${budget}ms budget. Something in it now scales worse than the data does.`,
  );
  return elapsed;
}

console.log(`Derived models at ${SCALE.opportunities} deals / ${SCALE.activities} activities / ${SCALE.accounts} accounts / ${SCALE.quotes} quotes:`);

measure('masterDashboard', () => buildMasterDashboard({
  opportunities, activities, quotes, expenses: [], opportunityOutcomes: outcomes, planRecords: [],
}));

measure('businessLens', () => buildBusinessLens({ accounts, opportunities, activities }));

measure('orderBook', () => buildOrderBook({ opportunities, quotes, milestoneRecords: [], today: '2026-08-02' }));

measure('outcomeScoreboard', () => buildOutcomeScoreboard({
  period: { kind: 'week', label: 'Jul 27 - Aug 2', start: '2026-07-27', end: '2026-08-02' },
  outcomes,
  quotes,
  activities,
  targets: [{ period: 'Q3', fiscalYear: 2026, amount: 5_000_000_000 }],
  today: '2026-08-02',
}));

measure('resolveThreads', () => resolveCommercialThreads({
  storedThreads: [], opportunities, activities, quotes, commitments: [], today: new Date('2026-08-02T00:00:00Z'),
}));

// The Vault, at the same scale. Stakeholders and objections are synthesised
// here rather than added to the shared fixture, which other harnesses write
// into a browser's localStorage.
const stakeholders = accounts.map((account, index) => ({
  id: `sh-${index}`, accountId: '', accountName: account.accountName, opportunityId: `opp-${index}`,
  opportunityName: '', name: `Person ${index}`, roleTitle: 'QA Manager',
  stakeholderRole: index % 3 === 0 ? 'Champion' : 'Technical Buyer', influenceLevel: 'High',
  relationshipStrength: 'Strong', stance: 'Supportive', email: '', phone: '', notes: '', tags: [],
  lastInteractionDate: '', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  storageMode: 'local',
}));

const objections = opportunities.slice(0, 60).map((opportunity, index) => ({
  id: `obj-${index}`, accountId: '', accountName: opportunity.accountName, opportunityId: opportunity.id,
  opportunityName: opportunity.opportunityName, stakeholderId: '', stakeholderName: '', sourceActivityId: '',
  objectionType: ['Price', 'Lead time', 'Technical fit', 'Compliance / validation'][index % 4],
  objectionText: 'Raised in the field', impact: 'Medium', status: 'Open', requiredProof: '', responsePlan: '',
  resolutionNote: '', dueDate: '', resolvedAt: '', tags: [],
  createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z', storageMode: 'local',
}));

let knowledgeGraph;
measure('knowledgeGraph', () => {
  knowledgeGraph = buildKnowledgeGraph({
    accounts, opportunities, stakeholders, activities, objections, quotes, outcomes, today: '2026-08-02',
  });
});

// The view is recomputed on every selection, so it is the one that has to be
// cheap. It reads a capped neighbourhood, never the whole graph.
measure('knowledgeGraphView', () => {
  buildGraphView({ graph: knowledgeGraph, focusId: knowledgeGraph.nodes[0]?.id });
});

console.log(`  knowledge graph: ${knowledgeGraph.nodes.length} nodes, ${knowledgeGraph.edges.length} relations, ${knowledgeGraph.gaps.length} open gaps`);

// Delta, for one customer, against the whole book.
//
// This is the derivation most exposed to the quadratic mistake: it filters five
// collections per subject and walks the account's touches looking for gaps. It
// runs behind a panel that appears the moment a record is opened, so it has to
// stay cheap at a real book rather than at a fixture.
measure('deriveDelta', () => deriveCommercialDelta({
  subject: { kind: 'account', id: accounts[0].id, name: accounts[0].accountName },
  events: [],
  commitments: [],
  planItems: [],
  objections,
  stakeholders,
  activities,
  opportunityOutcomes: outcomes,
  recommendations: [],
  observedFrom: null,
  today: new Date('2026-08-02T00:00:00Z'),
}));

// Next Best Action, over everything the policy engine raised at that scale.
//
// This is the hot one: it runs on Today, on Review and behind every subject
// panel, and it touches a commitment, a quote or an opportunity for each
// candidate. Measured against the real candidate set rather than a handful, so
// a lookup that quietly became a scan shows up here.
{
  const threads = resolveCommercialThreads({
    storedThreads: [], opportunities, activities, quotes, commitments: [],
    today: new Date('2026-08-02T00:00:00Z'),
  });
  const candidates = evaluateCommercialPolicies({
    threads, commitments: [], opportunities, quotes, today: new Date('2026-08-02T00:00:00Z'),
  });

  measure('rankRecommendations', () => rankRecommendations({
    recommendations: candidates,
    opportunities,
    quotes,
    commitments: [],
    objections,
    today: new Date('2026-08-02T00:00:00Z'),
  }));
  console.log(`  ranking: ${candidates.length} candidates from ${opportunities.length} deals`);
}

// Capture parsing: a long note against the whole book of customers.
//
// The one derivation a person waits on directly. It resolves the customer
// against every account the workspace has, so the temptation is a scan per
// token; the context is indexed once and this measurement is what notices if
// that stops being true.
{
  const note = [
    'Met Anna Vu at the plant today with the QC team.',
    'Trial looks good but they still need clarification on GPT verification.',
    'Purchasing wants to decide before Sep 20.',
    'Likely PO around 400M VND.',
    'They are also worried about lead time on the spare parts.',
    'Marc will visit Oct 3 for the second round.',
    'I promised to send the validation explanation by Friday.',
    'We also discussed the maintenance contract, the training plan, and the',
    'documentation pack they asked for last quarter, none of which is agreed yet.',
  ].join(' ');

  measure('parseCapture', () => parseCapture({
    rawCapture: note,
    captureDate: '2026-08-02',
    context: {
      accounts: accounts.map((account) => ({ id: account.id, accountName: account.accountName })),
      opportunities: opportunities.map((opportunity) => ({
        id: opportunity.id,
        accountName: opportunity.accountName,
        opportunityName: opportunity.opportunityName,
        currency: opportunity.currency,
        estimatedValue: opportunity.estimatedValue,
      })),
      objections,
      stakeholders,
      openCommitments: [],
      evidence: [],
      reportingCurrency: 'VND',
    },
  }));
}

// Commercial Evidence: the current reading over a workspace with a long history
// of findings.
//
// The projection is the whole reason evidence can be consulted by the policy
// engine and by ranking without either of them scanning. It is built once per
// read and answered from a map, so this measurement exists to notice the day
// somebody folds the history inside a comparator instead.
{
  const evidence = opportunities.flatMap((opportunity, index) => (
    // Three observations on every fourth deal: enough supersession to exercise
    // the contest, spread over a book rather than piled on one record.
    index % 4 !== 0 ? [] : [0, 1, 2].map((step) => ({
      id: `${opportunity.id}-ev-${step}`,
      userId: null,
      accountName: opportunity.accountName,
      accountId: '',
      opportunityId: opportunity.id,
      threadId: null,
      category: 'technical_outcome',
      direction: step === 1 ? 'negative' : 'positive',
      summary: step === 1 ? 'Trial did not pass' : 'Trial passed',
      evidenceText: 'Trial run completed at the plant and the results were reviewed with QC.',
      observedAt: `2026-0${5 + step}-1${step}`,
      recordedAt: `2026-0${5 + step}-1${step}T00:00:00.000Z`,
      sourceActivityId: null,
      sourceType: 'capture',
      sourceId: null,
      sourceUrl: null,
      sourceUpdatedAt: null,
      createdAt: `2026-0${5 + step}-1${step}T00:00:00.000Z`,
      updatedAt: `2026-0${5 + step}-1${step}T00:00:00.000Z`,
    }))
  ));

  measure('projectCurrentEvidence', () => {
    const projection = projectCurrentEvidence(evidence);
    // The lookup every consumer actually makes, once per deal. If this is not
    // measured with the projection, a per-deal scan would hide inside it.
    for (const opportunity of opportunities) {
      supportingEvidenceFor(projection, {
        opportunityId: opportunity.id,
        accountName: opportunity.accountName,
      });
    }
  });
  console.log(`  evidence: ${evidence.length} findings across ${opportunities.length} deals`);
}

// Personal Commercial Learning at a book several times today's size.
//
// The brief for this measurement is the shape of the calculation rather than
// its current cost: six patterns each walk the closed deals and ask an indexed
// question per deal. What this notices is the day somebody asks that question
// by scanning the collection instead - which is invisible at thirteen closed
// deals and quadratic at a thousand.
{
  const LEARNING_SCALE = { opportunities: 1000, activities: 5000, evidence: 1000 };
  const learningOpportunities = Array.from({ length: LEARNING_SCALE.opportunities }, (unused, index) => ({
    id: `lopp-${index}`,
    accountName: `Account ${index % 200}`,
    opportunityName: `Deal ${index}`,
    stage: 'Proposal',
    estimatedValue: 100_000_000 + index,
    currency: 'VND',
    expectedClosePeriod: 'Q3 2026',
    productOrSolution: '',
    decisionMaker: '',
    budgetOwner: '',
    procurementPath: '',
    technicalCriteria: '',
    nextAction: '',
    nextActionDate: '',
    evidence: '',
    missingContext: '',
    objectionDebt: '',
    forecastEvidenceCategory: 'Defensible',
    decisionRecommendation: 'Monitor',
    status: index % 2 === 0 ? 'Won' : 'Lost',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    storageMode: 'local',
  }));

  const learningOutcomes = learningOpportunities.map((opportunity, index) => ({
    id: `lout-${index}`,
    opportunityId: opportunity.id,
    accountName: opportunity.accountName,
    opportunityName: opportunity.opportunityName,
    outcome: index % 2 === 0 ? 'Won' : 'Lost',
    outcomeDate: `2026-0${(index % 6) + 1}-1${index % 9}`,
    finalAmount: opportunity.estimatedValue,
    currency: 'VND',
    forecastEvidenceCategoryBeforeOutcome: 'Defensible',
    decisionRecommendationBeforeOutcome: 'Defend',
    stageBeforeOutcome: 'Proposal',
    pipelineProbabilityBeforeOutcome: null,
    reasonCategory: 'Technical fit',
    reasonText: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    storageMode: 'local',
  }));

  const learningActivities = Array.from({ length: LEARNING_SCALE.activities }, (unused, index) => ({
    id: `lact-${index}`,
    accountName: `Account ${index % 200}`,
    opportunityName: '',
    activityType: 'Customer meeting',
    activityChannel: index % 3 === 0 ? 'On-site visit' : 'Email / message',
    summary: '',
    nextAction: '',
    dueDate: '',
    tags: [],
    rawNote: '',
    activityDate: '2026-02-10',
    linkedOpportunityId: `lopp-${index % LEARNING_SCALE.opportunities}`,
    linkedOpportunityName: '',
    linkedAccountName: `Account ${index % 200}`,
    linkStatus: 'Linked',
    createdAt: '2026-02-10T00:00:00.000Z',
    updatedAt: '2026-02-10T00:00:00.000Z',
    storageMode: 'local',
  }));

  const learningEvidence = Array.from({ length: LEARNING_SCALE.evidence }, (unused, index) => ({
    id: `lev-${index}`,
    userId: null,
    accountName: `Account ${index % 200}`,
    accountId: '',
    opportunityId: `lopp-${index}`,
    threadId: null,
    category: 'technical_outcome',
    direction: index % 3 === 0 ? 'negative' : 'positive',
    summary: 'Trial result',
    evidenceText: 'Trial completed at the plant and the results were reviewed.',
    observedAt: '2026-01-15',
    recordedAt: '2026-01-15T00:00:00.000Z',
    sourceActivityId: null,
    sourceType: 'capture',
    sourceId: null,
    sourceUrl: null,
    sourceUpdatedAt: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
  }));

  measure('personalLearning', () => derivePersonalLearning({
    opportunities: learningOpportunities,
    opportunityOutcomes: learningOutcomes,
    activities: learningActivities,
    stakeholders: [],
    objections: [],
    quotes: [],
    commitments: [],
    evidence: learningEvidence,
    today: new Date('2026-08-02T00:00:00.000Z'),
  }));
  console.log(
    `  learning: ${LEARNING_SCALE.opportunities} closed deals, `
    + `${LEARNING_SCALE.activities} activities, ${LEARNING_SCALE.evidence} findings`,
  );
}

// Commercial scope resolution, at the moment it actually runs.
//
// Once per keystroke in the worst case, against a book with many deals on the
// same customer. What this notices is the day it starts reading the whole
// workspace instead of one account's deals.
{
  const scopeOpportunities = opportunities.map((opportunity) => ({
    id: opportunity.id,
    accountName: opportunity.accountName,
    opportunityName: opportunity.opportunityName,
    status: opportunity.status,
    createdAt: opportunity.createdAt,
  }));
  const busiestAccount = scopeOpportunities[0]?.accountName || '';

  measure('resolveCommercialScope', () => resolveCommercialScope({
    accountName: busiestAccount,
    rawNote: 'Met the QC team today. Trial passed but purchasing still needs to decide.',
    captureDate: '2026-08-02',
    opportunities: scopeOpportunities,
  }));

  // The Review-time pass: every unlinked activity, against the deals on its own
  // customer rather than against all of them.
  const unlinked = activities.map((activity, index) => ({
    ...activity,
    id: `link-${index}`,
    linkStatus: 'Unlinked',
    linkedOpportunityId: '',
    linkedAccountName: activity.accountName,
  }));
  measure('suggestHistoricalLinks', () => suggestHistoricalLinks({
    activities: unlinked,
    opportunities: scopeOpportunities,
  }));
  console.log(`  linkage: ${unlinked.length} unlinked touches against ${scopeOpportunities.length} deals`);
}

// Deriving is not what makes the app feel slow - every model above lands in
// single-digit milliseconds. The wait is the network: one barrier over sixteen
// collections, ~3MB dominated by accounts and stakeholders, on every fresh
// load. The screen is allowed to draw from the browser copy while that runs.
{
  const workspace = readFileSync('src/services/workspaceData.ts', 'utf8');

  const budget = workspace.match(/const FIRST_PAINT_BUDGET_MS = (\d+)/);
  assert.ok(budget, 'the first-paint budget must be declared');
  assert.ok(
    Number(budget[1]) > 0 && Number(budget[1]) <= 1000,
    'the first-paint budget must be short enough to matter and long enough that a warm cloud answer wins',
  );

  // The guard that keeps the fast path honest.
  //
  // This used to assert `hasAnyRecords(local)` - "the browser copy holds at
  // least one record somewhere". That is not the same claim as "the browser
  // copy is a workspace", and the difference shipped: nothing mirrors a cloud
  // load into localStorage, so a signed-in seller's copy held eleven of 126
  // deals and no accounts or stakeholders at all. It passed the test, the
  // screen drew it, and the operator spent a session looking at a workspace
  // reporting zero customers while every request behind it returned 200.
  //
  // The copy is now measured against what the cloud was last seen to hold.
  assert.ok(
    workspace.includes('isLocalCopyComplete('),
    'the browser copy may only be shown when it is complete against the last known cloud census',
  );
  assert.ok(
    !workspace.includes('hasAnyRecords'),
    'the any-record test must not come back: it cannot tell a workspace from a fragment of one',
  );

  const census = readFileSync('src/services/workspaceCensus.ts', 'utf8');
  assert.ok(
    census.includes('if (!census) return false'),
    'a device that has never completed a cloud load must wait for one, not show what it happens to have',
  );

  assert.ok(
    workspace.includes('WORKSPACE_REFRESHED_EVENT'),
    'a screen drawn from the browser copy must be told when the real answer lands',
  );

  // Every surface, not just Today. Today was the only listener, so Accounts,
  // Opportunities and Stakeholders held their first paint for the whole session.
  const refreshHook = readFileSync('src/hooks/useWorkspaceRefresh.ts', 'utf8');
  assert.ok(
    refreshHook.includes('WORKSPACE_REFRESHED_EVENT'),
    'the shared refresh hook must listen for the cloud answer',
  );

  for (const surface of [
    'src/features/dashboard/DashboardPage.tsx',
    'src/features/accounts/AccountsPage.tsx',
    'src/features/opportunities/OpportunitiesPage.tsx',
    'src/features/stakeholders/StakeholdersPage.tsx',
    'src/features/activity/ActivityPage.tsx',
    'src/features/plan/WeeklyPlanPage.tsx',
    'src/features/revenue/RevenueViewPage.tsx',
    'src/features/calendar/SalesActivityCalendarPage.tsx',
  ]) {
    const source = readFileSync(surface, 'utf8');
    assert.ok(
      source.includes('WORKSPACE_REFRESHED_EVENT') || source.includes('useWorkspaceRefresh'),
      `${surface} must catch up when the cloud load finishes behind it`,
    );
  }
}

// Every collection read from the cloud must be paged.
//
// PostgREST caps an unbounded select at db-max-rows and answers 200, so the app
// showed exactly 1000 of 1,738 stakeholders and called it the whole book. A cap
// that arrives as a success is invisible to everything downstream.
{
  for (const store of [
    'src/services/accountStore.ts',
    'src/services/stakeholderStore.ts',
    'src/services/opportunityStore.ts',
    'src/services/salesActivityStore.ts',
    'src/services/cloudJsonCollectionStore.ts',
    'src/services/commercialKernel/kernelRepository.ts',
  ]) {
    const source = readFileSync(store, 'utf8');
    assert.ok(
      /fetchAllRows[<(]/.test(source),
      `${store} must read every row, not the first page the server feels like returning`,
    );
  }
}

// A collection every surface asks for is read once per load, not once per asker.
//
// Plan items answer "what is promised", so the Plan stopped being their only
// reader: the First Week strip, the Commitments panel and the thread derivation
// all ask. Measured against production on 2026-08-16, one visit to Today issued
// five identical `plan_items` requests - five cloud reads, five merges and five
// writes back to localStorage for an identical answer. Same failure, and same
// fix, as the profile row that was fetched three times before the workspace
// could start.
{
  const planItems = readFileSync('src/services/planItemStore.ts', 'utf8');
  assert.ok(
    /loadsInFlight\.get\(/.test(planItems) && /loadsInFlight\.set\(/.test(planItems),
    'concurrent readers of plan items must share one request, not race five',
  );
  assert.ok(
    /loadsInFlight\.delete\(/.test(planItems),
    'the in-flight entry must be released when it settles, or a ticked item would never be re-read',
  );
}

console.log('Performance budget verified: the derived models hold at a real book of business, and the screen never waits on the network to draw.');
