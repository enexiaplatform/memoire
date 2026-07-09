import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildObjectionPlaybook, formatObjectionResolutionRate } from '../src/utils/objectionPlaybook.ts';

function makeObjection(patch = {}) {
  return {
    id: `obj-${Math.random().toString(36).slice(2)}`,
    accountId: 'acc-1',
    accountName: 'Summit Diagnostics',
    opportunityId: 'opp-1',
    opportunityName: 'QC workflow',
    stakeholderId: '',
    stakeholderName: '',
    sourceActivityId: '',
    objectionType: 'Price',
    objectionText: 'Too expensive vs current supplier',
    impact: 'High',
    status: 'Open',
    requiredProof: '',
    responsePlan: '',
    resolutionNote: '',
    dueDate: '',
    resolvedAt: '',
    tags: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

function makeLostOutcome(patch = {}) {
  return {
    id: `out-${Math.random().toString(36).slice(2)}`,
    opportunityId: 'opp-9',
    accountName: 'DKSH',
    opportunityName: 'LC replacement',
    outcome: 'Lost',
    outcomeDate: '2026-06-20',
    finalAmount: null,
    currency: 'VND',
    forecastEvidenceCategoryBeforeOutcome: 'Hope-based',
    decisionRecommendationBeforeOutcome: 'Rescue',
    stageBeforeOutcome: 'Proposal',
    reasonCategory: 'Price',
    reasonText: '',
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

// 1. Resolution rates and proven responses come from the seller's own notes.
{
  const playbook = buildObjectionPlaybook({
    objections: [
      makeObjection({ status: 'Resolved', resolutionNote: 'Showed 3-year TCO comparison; buyer accepted.', resolvedAt: '2026-06-10T00:00:00.000Z' }),
      makeObjection({ status: 'Resolved', resolutionNote: 'Bundled service contract to offset price.', resolvedAt: '2026-06-15T00:00:00.000Z' }),
      makeObjection({ status: 'Open' }),
      makeObjection({ objectionType: 'Lead time', status: 'Open', accountName: 'DKSH' }),
    ],
  });
  assert.equal(playbook.needsMoreData, false);
  const price = playbook.insights.find((insight) => insight.objectionType === 'Price');
  assert.ok(price);
  assert.equal(price.total, 3);
  assert.equal(price.resolved, 2);
  assert.equal(price.open, 1);
  assert.equal(formatObjectionResolutionRate(price), '2 of 3 resolved');
  assert.equal(price.provenResponses.length, 2);
  assert.ok(price.provenResponses[0].includes('Bundled service contract'), 'most recent resolution first');
  // Most-encountered objection type sorts first.
  assert.equal(playbook.insights[0].objectionType, 'Price');
}

// 2. Lost deals are attributed to objection types via reason category and free text.
{
  const playbook = buildObjectionPlaybook({
    objections: [
      makeObjection(),
      makeObjection({ objectionType: 'Competitor' }),
      makeObjection({ objectionType: 'Timing' }),
    ],
    opportunityOutcomes: [
      makeLostOutcome(),
      makeLostOutcome({ reasonCategory: 'Other', objectionThatMattered: 'They went with a cheaper competitor' }),
    ],
  });
  const price = playbook.insights.find((insight) => insight.objectionType === 'Price');
  const competitor = playbook.insights.find((insight) => insight.objectionType === 'Competitor');
  assert.equal(price.dealsLostTo, 1);
  assert.equal(competitor.dealsLostTo, 1, 'objectionThatMattered free text must map to Competitor');
  assert.ok(playbook.headline.includes('cost you'), 'headline must name the costly objection');
}

// 3. Sparse data stays honest: below threshold the playbook asks for more capture.
{
  const playbook = buildObjectionPlaybook({ objections: [makeObjection()] });
  assert.equal(playbook.needsMoreData, true);
}

// 4. Won outcomes never count as losses.
{
  const playbook = buildObjectionPlaybook({
    objections: [makeObjection(), makeObjection(), makeObjection()],
    opportunityOutcomes: [makeLostOutcome({ outcome: 'Won' })],
  });
  const price = playbook.insights.find((insight) => insight.objectionType === 'Price');
  assert.equal(price.dealsLostTo, 0);
}

// 5. UI contract: the learning section ships on the Playbook page.
const playbookPage = readFileSync(new URL('../src/features/playbook/SalesPlaybookPage.tsx', import.meta.url), 'utf8');
for (const marker of ['ObjectionLearningSection', 'What worked against objections', 'buildObjectionPlaybook', 'Your proven responses']) {
  assert.ok(playbookPage.includes(marker), `SalesPlaybookPage missing marker: ${marker}`);
}

console.log('Objection playbook learning contract verified.');
