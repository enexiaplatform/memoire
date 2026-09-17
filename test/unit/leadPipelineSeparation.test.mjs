import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { emptyOpportunityInput } from '../../src/services/opportunityStore.ts';
import { isLeadStage, selectLeads, selectQualifiedPipeline, disqualifiedLeadIds } from '../../src/utils/leadIdentity.ts';
import { buildMasterDashboard } from '../../src/utils/masterDashboard.ts';
import { buildBusinessLens } from '../../src/utils/businessLens.ts';
import { buildAccountMemory } from '../../src/utils/accountMemory.ts';
import { buildForecastCalibration } from '../../src/utils/forecastCalibration.ts';
import { buildCoverage } from '../../src/domain/commercialKernel/forecast.ts';
import { evaluateCommercialPolicies } from '../../src/domain/commercialKernel/policyEngine.ts';
import { scorePipelineQualification } from '../../src/utils/dealQualificationScore.ts';
import { analyzePipelineQuality } from '../../src/utils/opportunityQuality.ts';
import { buildPipelineHealthSummary, buildRevenueHorizon, buildStageFunnel } from '../../src/utils/pipelineInsights.ts';
import { buildLivePipelineHealth } from '../../src/utils/livePipelineHealth.ts';
import { buildMoneyFlow } from '../../src/utils/moneyFlow.ts';
import { matchCommands } from '../../src/utils/commandRegistry.ts';
import { findRecords, answerFromRecordFind } from '../../src/features/v31/askMemoireInsightAnswers.ts';

const today = '2026-09-17';
const record = (id, stage = 'Discovery', patch = {}) => ({
  ...emptyOpportunityInput, id, stage, status: 'Active', accountName: 'ABC Pharma',
  opportunityName: id, estimatedValue: 100, currency: 'VND',
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
  storageMode: 'local', ...patch,
});
const qualified = record('qualified');
const leads = ['Lead', 'new', ' Prospecting '].map((stage, i) => record(`lead-${i}`, stage, { estimatedValue: 9_000_000 }));
const mixed = [qualified, ...leads];

test('canonical prequalification aliases partition records without classifying unknown stages as Leads', () => {
  assert.equal(isLeadStage('unknown'), false);
  assert.deepEqual(selectLeads(mixed), leads);
  assert.deepEqual(selectQualifiedPipeline(mixed), [qualified]);
});

test('large Lead values never inflate dashboard or business pipeline', () => {
  const dashboard = opportunities => buildMasterDashboard({ opportunities, activities: [], quotes: [], expenses: [], opportunityOutcomes: [], today });
  const expected = dashboard([qualified]);
  const actual = dashboard(mixed);
  assert.equal(actual.kpis.openDeals, 1);
  assert.equal(actual.kpis.openPipelineBase, expected.kpis.openPipelineBase);
  assert.deepEqual(actual.stageMix, expected.stageMix);
  assert.deepEqual(actual.evidence, expected.evidence);
  const lens = opportunities => buildBusinessLens({ opportunities, accounts: [], activities: [], today });
  assert.deepEqual(lens(mixed), lens([qualified]));
});

test('forecast and Money pipeline use the same partition', () => {
  const forecast = opportunities => buildCoverage({ opportunities, threads: [], targets: [], today: new Date(`${today}T00:00:00Z`) });
  assert.deepEqual(forecast(mixed), forecast([qualified]));
  const calibration = opportunities => buildForecastCalibration({ opportunities, outcomes: [] });
  assert.deepEqual(calibration(mixed), calibration([qualified]));
  const money = opportunities => buildMoneyFlow({ opportunities, quotes: [], today });
  assert.deepEqual(money(mixed), money([qualified]));
});

test('pipeline quality, qualification, health and stage charts exclude raw Leads', () => {
  assert.deepEqual(scorePipelineQualification({ opportunities: mixed }), scorePipelineQualification({ opportunities: [qualified] }));
  assert.deepEqual(analyzePipelineQuality(mixed), analyzePipelineQuality([qualified]));
  assert.deepEqual(buildPipelineHealthSummary(mixed, []), buildPipelineHealthSummary([qualified], []));
  assert.deepEqual(buildRevenueHorizon(mixed), buildRevenueHorizon([qualified]));
  assert.deepEqual(buildStageFunnel(mixed), buildStageFunnel([qualified]));
  assert.deepEqual(buildLivePipelineHealth({ opportunities: mixed, today }), buildLivePipelineHealth({ opportunities: [qualified], today }));
});

test('pipeline evidence recommendations cannot ask raw Leads for full deal qualification', () => {
  const policies = opportunities => evaluateCommercialPolicies({ opportunities, commitments: [], threads: [], quotes: [], today: new Date(`${today}T00:00:00Z`) });
  assert.deepEqual(policies(mixed), policies([qualified]));
});

test('disqualified Lead history remains in account memory but not lost-deal totals or forecast learning', () => {
  const closed = record('closed-lead', 'Lost', { status: 'Lost' });
  const outcome = { id: 'outcome', opportunityId: closed.id, outcome: 'Lost', stageBeforeOutcome: 'Lead', outcomeDate: today, forecastEvidenceCategoryBeforeOutcome: 'Unsupported' };
  const records = [...mixed, closed];
  assert.deepEqual(selectQualifiedPipeline(records, disqualifiedLeadIds([outcome])), [qualified]);
  const memory = buildAccountMemory({ id: 'a', accountName: 'ABC Pharma' }, records, [], [], [outcome]);
  assert.equal(memory.opportunities.length, 5);
  assert.equal(memory.activeOpportunityCount, 1);
  assert.equal(memory.lostCount, 0);
  assert.equal(buildForecastCalibration({ opportunities: records, outcomes: [outcome] }).totalClosed, 0);
  const dashboard = buildMasterDashboard({ opportunities: records, opportunityOutcomes: [outcome], activities: [], quotes: [], expenses: [], today });
  assert.equal(dashboard.outcomes.lost.count, 0);
  const found = findRecords('ABC Pharma', records);
  const answer = answerFromRecordFind(found, [outcome]);
  assert.match(answer.answer, /1 open qualified/);
  const fields = answer.cards[0].fields;
  assert.equal(fields.find(field => field.label === 'Leads').value.length, 4);
  assert.match(fields.find(field => field.label === 'Leads').value.join(' '), /Disqualified lead/);
});

test('deterministic Lead vocabulary navigates to the owning canonical queue', () => {
  for (const [query, target] of [
    ['show my Leads', '/app/leads'],
    ['show Leads going quiet', '/app/leads?state=going-quiet'],
    ['show nurtured Leads due soon', '/app/leads?state=needs-action&revisit=due'],
    ['show qualified Opportunities', '/app/opportunities'],
  ]) assert.equal(matchCommands(query)[0]?.to, target, query);
});

test('Ask answers a Lead shortcut with the partition counts and links to the owning queue', async () => {
  const { answerFromLeadCommand, isLeadNavigationCommand } = await import('../../src/features/v31/askMemoireInsightAnswers.ts');
  const closed = record('closed-lead', 'Lost', { status: 'Lost' });
  const outcome = { opportunityId: closed.id, outcome: 'Lost', stageBeforeOutcome: 'Lead' };
  const workspace = { opportunities: [...mixed, closed], opportunityOutcomes: [outcome] };

  const quiet = matchCommands('show Leads going quiet')[0];
  assert.ok(isLeadNavigationCommand(quiet));
  assert.equal(isLeadNavigationCommand({ id: 'overdue-payments' }), false);
  const quietAnswer = answerFromLeadCommand(quiet, workspace);
  assert.equal(quietAnswer.answer, '3 open leads. Leads opens filtered to Going quiet.', 'the disqualified lead is not open');
  assert.deepEqual(quietAnswer.cards[0].ctas, [{ label: 'Open Leads', href: '/app/leads?state=going-quiet', note: 'Filtered to Going quiet.' }]);
  assert.doesNotMatch(JSON.stringify(quietAnswer), /Canonical navigation commands/);

  const pipelineAnswer = answerFromLeadCommand(matchCommands('show qualified Opportunities')[0], workspace);
  assert.equal(pipelineAnswer.answer, '1 open qualified opportunity. 3 open leads are on Leads until qualified, and not counted here.');
  assert.equal(pipelineAnswer.cards[0].ctas[0].label, 'Open opportunities');

  assert.equal(answerFromLeadCommand(matchCommands('show my Leads')[0], { opportunities: [qualified], opportunityOutcomes: [] }).answer, 'No open leads.');
});


test('Lead thread pursuit uses the queue, while a real money commitment remains actionable', () => {
  const thread = { id: 't', opportunityId: leads[0].id, status: 'active', title: 'Lead thread', accountName: 'ABC Pharma', daysSinceActivity: 90, openCommitmentCount: 0, currentWaitingParty: 'customer', currentMoneyState: 'none' };
  const policies = currentMoneyState => evaluateCommercialPolicies({ opportunities: leads, commitments: [], threads: [{ ...thread, currentMoneyState }], quotes: [], today: new Date(`${today}T00:00:00Z`) });
  assert.deepEqual(policies('none'), []);
  assert.deepEqual(policies('awaiting_payment').map(item => item.reasonCode), ['MONEY_CHECKPOINT_STUCK']);
});

test('legacy proactive recommendations cannot bypass the shared Lead queue', async () => {
  const { buildProactiveNudges } = await import('../../src/utils/proactiveNudges.ts');
  const nudges = buildProactiveNudges({ opportunities: leads, activities: [], stakeholders: [], objections: [], today });
  assert.equal(nudges.allActiveNudges.filter(item => item.entityType === 'opportunity').length, 0);
});

test('Lead funnel excludes sample and removed-record receipts from live denominators', async () => {
  const { buildLeadFunnel } = await import('../../src/utils/leadQueue.ts');
  const events = ['sample', 'removed'].map(opportunityId => ({ opportunityId, eventType: 'opportunity_stage_changed', occurredAt: '2026-09-15T00:00:00Z', structuredPayload: { from: 'Lead', to: 'Discovery' } }));
  const outcomes = [{ opportunityId: 'removed', outcome: 'Lost', stageBeforeOutcome: 'Lead', reasonText: 'Poor fit' }];
  const input = { opportunities: [leads[0], record('sample', 'Discovery', { isSample: true })], activities: [], events, outcomes };
  const live = buildLeadFunnel(input);
  assert.equal(live.leads, 1);
  assert.equal(live.qualified, 0);
  assert.equal(live.disqualified, 0);
  assert.deepEqual(live.disqualifyReasons, []);
  assert.equal(buildLeadFunnel({ ...input, includeSampleRecords: true }).qualified, 1);
});


test('disqualified Leads cannot manufacture enough lost-deal learning samples', async () => {
  const { analyzePersonalSalesLearning } = await import('../../src/utils/personalSalesLearning.ts');
  const outcomes = [1, 2, 3].map(id => ({ id: String(id), opportunityId: `closed-${id}`, outcome: 'Lost', stageBeforeOutcome: 'Lead', outcomeDate: today }));
  const learning = analyzePersonalSalesLearning({ opportunities: leads, outcomes });
  assert.equal(learning.totalOutcomes, 0);
  assert.equal(learning.hasEnoughData, false);
  assert.deepEqual(learning.warnings, []);
});
