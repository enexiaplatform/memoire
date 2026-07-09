import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  answerFromFollowUpImpact,
  answerFromForecastCalibration,
  answerFromObjectionPlaybook,
  detectInsightQuestion,
} from '../src/features/v31/askMemoireInsightAnswers.ts';
import { buildFollowUpImpact } from '../src/utils/followUpImpact.ts';
import { buildObjectionPlaybook } from '../src/utils/objectionPlaybook.ts';
import { buildForecastCalibration } from '../src/utils/forecastCalibration.ts';

// 1. Detection is narrow and routes to the right layer.
assert.equal(detectInsightQuestion('Did my follow-ups work?'), 'follow_up_impact');
assert.equal(detectInsightQuestion('Which deals did I revive this month?'), 'follow_up_impact');
assert.equal(detectInsightQuestion('What worked against price objections?'), 'objection_playbook');
assert.equal(detectInsightQuestion('How do I handle the lead time objection?'), 'objection_playbook');
assert.equal(detectInsightQuestion('What is my win rate on defensible deals?'), 'forecast_calibration');
assert.equal(detectInsightQuestion('How accurate is my forecast?'), 'forecast_calibration');
// Ambiguous or unrelated questions fall through to the normal answer path.
assert.equal(detectInsightQuestion('What should I do next?'), null);
assert.equal(detectInsightQuestion('Draft a follow-up for Apex Labs'), null, 'drafting requests are not history questions');
assert.equal(detectInsightQuestion('Which objections are unresolved?'), null, 'open-objection listing is not the playbook question');

// 2. Empty layers answer honestly instead of inventing numbers.
{
  const impactAnswer = answerFromFollowUpImpact(buildFollowUpImpact({ activities: [], opportunities: [] }));
  assert.ok(impactAnswer.answer.includes('No follow-ups were logged'));
  assert.equal(impactAnswer.cards, undefined);

  const playbookAnswer = answerFromObjectionPlaybook(buildObjectionPlaybook({ objections: [] }));
  assert.ok(playbookAnswer.answer.includes('Not enough objection history'));

  const calibrationAnswer = answerFromForecastCalibration(buildForecastCalibration({ outcomes: [], opportunities: [] }));
  assert.ok(calibrationAnswer.answer.includes('No closed outcomes'));
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
for (const marker of ['detectInsightQuestion', 'answerFromFollowUpImpact', 'answerFromObjectionPlaybook', 'answerFromForecastCalibration', 'no AI involved']) {
  assert.ok(askPage.includes(marker), `AskMemoirePage missing marker: ${marker}`);
}
const insightSource = readFileSync(new URL('../src/features/v31/askMemoireInsightAnswers.ts', import.meta.url), 'utf8');
assert.ok(insightSource.includes('History, not prediction'), 'calibration card must carry the honesty basis line');

console.log('Ask Memoire insight answers contract verified.');
