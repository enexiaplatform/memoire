import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildForecastCalibration,
  formatWinRate,
  FORECAST_CALIBRATION_MIN_SAMPLE,
} from '../src/utils/forecastCalibration.ts';

function makeOutcome(patch = {}) {
  return {
    id: `out-${Math.random().toString(36).slice(2)}`,
    opportunityId: `opp-${Math.random().toString(36).slice(2)}`,
    accountName: 'Account',
    opportunityName: 'Deal',
    outcome: 'Won',
    outcomeDate: '2026-06-01',
    finalAmount: null,
    currency: 'VND',
    forecastEvidenceCategoryBeforeOutcome: 'Defensible',
    decisionRecommendationBeforeOutcome: 'Defend',
    stageBeforeOutcome: 'Negotiation',
    reasonCategory: 'Other',
    reasonText: '',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

function makeOpportunity(patch = {}) {
  return {
    id: `opp-${Math.random().toString(36).slice(2)}`,
    accountName: 'Account',
    opportunityName: 'Deal',
    stage: 'Proposal',
    estimatedValue: 100_000_000,
    currency: 'VND',
    expectedClosePeriod: '',
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
    decisionRecommendation: 'Defend',
    status: 'Active',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

// 1. Win rates per category, calibrated value applied to the live pipeline.
{
  const calibration = buildForecastCalibration({
    outcomes: [
      makeOutcome(), makeOutcome(), makeOutcome({ outcome: 'Lost' }), makeOutcome({ outcome: 'Delayed' }),
    ],
    opportunities: [makeOpportunity(), makeOpportunity()],
  });
  const defensible = calibration.rows.find((row) => row.category === 'Defensible');
  assert.equal(defensible.closed, 4);
  assert.equal(defensible.won, 2);
  assert.equal(defensible.lost, 1);
  assert.equal(defensible.stalled, 1);
  assert.equal(formatWinRate(defensible.winRate), '50%');
  assert.equal(defensible.activeDeals, 2);
  assert.equal(defensible.activePipelineBase, 200_000_000);
  assert.equal(defensible.calibratedValueBase, 100_000_000, 'calibrated value = active pipeline x own win rate');
  assert.equal(calibration.calibratedPipelineBase, 100_000_000);
  assert.equal(calibration.hasEnoughData, true);
}

// 2. Below the minimum sample a category stays unrated and its deals are excluded.
{
  const calibration = buildForecastCalibration({
    outcomes: [makeOutcome({ forecastEvidenceCategoryBeforeOutcome: 'Hope-based', outcome: 'Won' })],
    opportunities: [makeOpportunity({ forecastEvidenceCategory: 'Hope-based' })],
  });
  const hopeBased = calibration.rows.find((row) => row.category === 'Hope-based');
  assert.equal(hopeBased.sufficientSample, false);
  assert.equal(hopeBased.calibratedValueBase, null, 'a 1-outcome 100% rate must not be applied');
  assert.equal(calibration.unratedActiveDeals, 1);
  assert.equal(calibration.hasEnoughData, false);
  assert.ok(calibration.headline.includes(String(FORECAST_CALIBRATION_MIN_SAMPLE)));
}

// 3. Inversion warning: weaker label out-performing a stronger one.
{
  const calibration = buildForecastCalibration({
    outcomes: [
      makeOutcome({ outcome: 'Lost' }), makeOutcome({ outcome: 'Lost' }), makeOutcome({ outcome: 'Won' }),
      makeOutcome({ forecastEvidenceCategoryBeforeOutcome: 'Hope-based' }),
      makeOutcome({ forecastEvidenceCategoryBeforeOutcome: 'Hope-based' }),
      makeOutcome({ forecastEvidenceCategoryBeforeOutcome: 'Hope-based', outcome: 'Lost' }),
    ],
    opportunities: [],
  });
  assert.ok(
    calibration.warnings.some((warning) => warning.id.startsWith('inversion-defensible-hope-based')),
    'Hope-based (67%) beating Defensible (33%) must raise an inversion warning',
  );
  assert.ok(
    calibration.warnings.some((warning) => warning.id === 'defensible-below-half'),
    'a Defensible win rate below 50% must be called out',
  );
  assert.ok(calibration.headline.includes('win more often'), 'headline must lead with the strongest warning');
}

// 4. Re-closed deals do not double count: latest outcome per opportunity wins.
{
  const calibration = buildForecastCalibration({
    outcomes: [
      makeOutcome({ opportunityId: 'opp-same', outcome: 'Delayed', outcomeDate: '2026-05-01' }),
      makeOutcome({ opportunityId: 'opp-same', outcome: 'Won', outcomeDate: '2026-06-15' }),
      makeOutcome(), makeOutcome(),
    ],
    opportunities: [],
  });
  const defensible = calibration.rows.find((row) => row.category === 'Defensible');
  assert.equal(defensible.closed, 3, 'the re-closed deal must count once');
  assert.equal(defensible.won, 3, 'the latest (Won) outcome must win');
}

// 5. Healthy calibration gets an affirming headline, not a warning.
{
  const calibration = buildForecastCalibration({
    outcomes: [makeOutcome(), makeOutcome(), makeOutcome()],
    opportunities: [],
  });
  assert.equal(calibration.warnings.length, 0);
  assert.ok(calibration.headline.includes('you win 100%'), 'healthy history must be affirmed');
}

// 6. UI contract: the panel ships on the Pipeline Defense page with honesty markers.
const panel = readFileSync(new URL('../src/features/pipeline/ForecastCalibrationPanel.tsx', import.meta.url), 'utf8');
for (const marker of ['Personal forecast calibration', 'your history, not a prediction', 'Unrated', 'totalClosed === 0']) {
  assert.ok(panel.includes(marker), `ForecastCalibrationPanel missing marker: ${marker}`);
}
const page = readFileSync(new URL('../src/features/pipeline/PipelineReviewDefenseBriefPage.tsx', import.meta.url), 'utf8');
for (const marker of ['ForecastCalibrationPanel', 'buildForecastCalibration']) {
  assert.ok(page.includes(marker), `PipelineReviewDefenseBriefPage missing marker: ${marker}`);
}

console.log('Forecast calibration contract verified.');
