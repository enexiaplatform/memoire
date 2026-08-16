import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPipelineDefenseCenter, resolveCommercialDecision } from '../src/utils/pipelineDefenseCenter.ts';
import { buildUnifiedTodayCommandCenter } from '../src/utils/todayCommandCenter.ts';

// The first real user saw one pipeline read four ways: Today 0% readiness,
// Opportunities 119/122 weak, Pipeline Defense 57% (a sample), Business Review
// "under control". These assertions pin the single decision rule and the single
// reading. livePipelineHealth and opportunityQuality are asserted structurally:
// both reach browser stores, so they do not load outside a browser.

const deal = (patch = {}) => ({
  id: `d-${Math.random().toString(36).slice(2)}`, account: 'VNVC', opportunity: 'Cold chain',
  pipelineContext: 'Stage: Proposal.', dealTruth: '', riskType: [], evidence: ['Customer confirmed budget'],
  missingContext: [], objectionDebt: { objection: '', evidence: '', requiredAction: '', owner: '', status: 'Open' },
  forecastEvidenceCategory: 'Defensible', recommendedAction: 'Send the quote',
  pipelineReviewAnswer: 'Defensible.', decisionRecommendation: 'Defend',
  estimatedValue: 1_000_000, currency: 'VND', nextActionDate: '2026-07-20', lastSignalDate: '2026-07-15', ...patch,
});

// 1. ONE decision rule, resolved from both fields - not the raw field alone.
{
  assert.equal(resolveCommercialDecision({ decisionRecommendation: 'Defend', forecastEvidenceCategory: 'Defensible' }), 'Defend');
  assert.equal(resolveCommercialDecision({ decisionRecommendation: 'Downgrade', forecastEvidenceCategory: 'Defensible' }), 'Downgrade');
  assert.equal(resolveCommercialDecision({ decisionRecommendation: 'Rescue', forecastEvidenceCategory: 'Defensible' }), 'Rescue');
  assert.equal(resolveCommercialDecision({ decisionRecommendation: 'Monitor', forecastEvidenceCategory: 'Defensible' }), 'Monitor');

  // The exact cases the two surfaces disagreed on: the raw field says Monitor,
  // the evidence decides. Counting the field alone made these invisible.
  assert.equal(resolveCommercialDecision({ decisionRecommendation: 'Monitor', forecastEvidenceCategory: 'Hope-based' }), 'Rescue');
  assert.equal(resolveCommercialDecision({ decisionRecommendation: 'Monitor', forecastEvidenceCategory: 'Weak but recoverable' }), 'Rescue');
  assert.equal(resolveCommercialDecision({ decisionRecommendation: 'Monitor', forecastEvidenceCategory: 'Unsupported' }), 'Downgrade');
  assert.equal(resolveCommercialDecision({ decisionRecommendation: 'Defend', forecastEvidenceCategory: 'Hope-based' }), 'Rescue',
    'a Defend flag cannot override hope-based evidence');
}

// 2. The classifier and the rule agree: one engine, one set of counts.
{
  const deals = [
    deal({ id: 'defend-1', decisionRecommendation: 'Defend', forecastEvidenceCategory: 'Defensible' }),
    deal({ id: 'rescue-raw', decisionRecommendation: 'Rescue', forecastEvidenceCategory: 'Defensible' }),
    deal({ id: 'rescue-derived', decisionRecommendation: 'Monitor', forecastEvidenceCategory: 'Hope-based' }),
    deal({ id: 'downgrade-derived', decisionRecommendation: 'Monitor', forecastEvidenceCategory: 'Unsupported' }),
  ];
  const center = buildPipelineDefenseCenter(deals, '2026-07-16');
  assert.equal(center.defendableDeals, 1);
  assert.equal(center.rescueDeals, 2, 'raw-flagged and evidence-derived rescues both count');
  assert.equal(center.downgradeCandidates, 1);
  center.items.forEach((item) => {
    assert.equal(item.decision, resolveCommercialDecision(item.deal), 'the classifier must not diverge from the rule');
  });
}

// 3. Today reports exactly the health it is given - it never re-derives its own.
{
  const deals = [
    deal({ decisionRecommendation: 'Defend', forecastEvidenceCategory: 'Defensible' }),
    deal({ decisionRecommendation: 'Monitor', forecastEvidenceCategory: 'Hope-based' }),
  ];
  const health = buildPipelineDefenseCenter(deals, '2026-07-16');
  const today = buildUnifiedTodayCommandCenter({
    briefs: [], revenueActions: [], opportunities: [], activities: [],
    pipelineHealth: health, today: '2026-07-16',
  });
  assert.equal(today.readinessScore, health.readinessScore, 'Today must report the health it was given');
  assert.equal(today.defendableDeals, health.defendableDeals);
  assert.equal(today.rescueDeals, health.rescueDeals);
  assert.equal(today.downgradeCandidates, health.downgradeCandidates);
  assert.ok(today.readinessScore > 0, 'live deals cannot read 0% just because no brief was saved');
}

// 4. A saved brief no longer drives Today's readiness - only the injected health.
{
  const briefDeal = deal({ decisionRecommendation: 'Defend', forecastEvidenceCategory: 'Defensible' });
  const brief = {
    id: 'b1', title: 'Stale snapshot', weekLabel: '', salesOwner: '', scope: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    storageMode: 'local', deals: [briefDeal],
  };
  const today = buildUnifiedTodayCommandCenter({
    briefs: [brief], revenueActions: [], opportunities: [], activities: [], today: '2026-07-16',
  });
  assert.equal(today.defendableDeals, 0, 'a stale brief must not be scored as live readiness');
  assert.equal(today.readinessScore, 0);
}

// 5. Structural: the surfaces share the rule, and Today is fed the live engine.
{
  const quality = readFileSync('src/utils/opportunityQuality.ts', 'utf8');
  assert.ok(quality.includes('resolveCommercialDecision'), 'Opportunities must use the shared decision rule');
  assert.equal(
    /\['Rescue', 'Downgrade'\]\.includes\(opportunity\.decisionRecommendation\)/.test(quality),
    false,
    'the raw-field rescue/downgrade count must stay removed',
  );

  const todaySource = readFileSync('src/utils/todayCommandCenter.ts', 'utf8');
  assert.equal(
    /buildPipelineDefenseCenter\(latestBrief\?\.deals/.test(todaySource),
    false,
    'Today must not score readiness from a brief snapshot',
  );

  const live = readFileSync('src/utils/livePipelineHealth.ts', 'utf8');
  // Renamed 2026-08-03 when the per-deal mapper grew a plural form that
  // computes the workspace-wide playbook once instead of once per deal. The
  // requirement is unchanged: one mapper, shared with the brief generator.
  assert.ok(live.includes('mapOpportunitiesToPipelineDefenseDeals'), 'live health must use the same mapper the brief generator uses');
  assert.ok(live.includes("opportunity.status === 'Active'"), 'only active deals are defensible');

  const dashboard = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
  assert.ok(dashboard.includes('buildLivePipelineHealth'), 'Today must be fed live health');
  assert.ok(dashboard.includes('pipelineHealth: livePipelineHealth'), 'the live health must actually reach the command center');
}

// A total spanning more than one deal goes through the money engine.
//
// The Opportunity Master List's quarter heading added the raw amounts and
// labelled the sum with the first row's currency, so a quarter holding
// 42,000,000 JPY and 120,000 USD read "42,120,000 JPY" - about 30% short, in a
// currency the number was not in. The same raw comparison ranked the sortable
// Value column by the size of the number rather than the size of the deal.
{
  const opportunities = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
  assert.ok(
    /value: sumMoneyInBase\(/.test(opportunities),
    'the group heading total must be summed in the reporting currency',
  );
  assert.equal(
    /last\.value \+= row\.opportunity\.estimatedValue/.test(opportunities),
    false,
    'a cross-currency group total must never be a raw addition',
  );
  assert.equal(
    /formatMoney\(group\.value/.test(opportunities),
    false,
    'a converted total must not be labelled with one row’s currency',
  );
  assert.ok(
    /case 'value':\s*\n\s*return convertMoney\(/.test(opportunities),
    'sorting by value must compare converted amounts',
  );
}

// What closed is one fact, and two pages must not disagree about it.
//
// The Business page counts a Won deal and says out loud when it is valued at
// the forecast rather than a signed figure. The review scoreboard counted retro
// records only, and only the close-out flow writes one - so a pipeline imported
// from a CRM, or any deal closed before the retro existed, read as "Nothing
// closed this week" on one page and a win on the other.
{
  const scoreboard = readFileSync('src/utils/outcomeScoreboard.ts', 'utf8');
  assert.ok(
    /export function deriveOutcomesFromClosedDeals/.test(scoreboard),
    'a closed deal with no retro must still count as closed',
  );
  assert.ok(
    /reasonText: ''/.test(scoreboard),
    'counting the money must not invent the reason behind it',
  );

  const panel = readFileSync('src/features/reviews/ReviewScoreboardPanel.tsx', 'utf8');
  assert.ok(
    /deriveOutcomesFromClosedDeals\(/.test(panel),
    'the review scoreboard must read closed deals, not only the retros written for them',
  );
}

console.log('One metrics engine contract verified.');
