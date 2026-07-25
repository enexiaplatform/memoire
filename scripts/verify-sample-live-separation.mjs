import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createBriefFromLiveDeals,
  createEmptyPipelineDefenseBriefStore,
  createPipelineDefenseBrief,
  deletePipelineDefenseBrief,
  loadPipelineDefenseBriefStore,
} from '../src/utils/pipelineDefenseStorage.ts';

// The first real user opened Pipeline Defense on a workspace of 122 live deals
// and was shown the hard-coded starter brief (Orion Pharma, Northstar Foods).
// These assertions exist so that can never happen again.

const deal = (patch = {}) => ({
  id: 'd1', account: 'VNVC', opportunity: 'Cold chain expansion', pipelineContext: '',
  dealTruth: '', riskType: [], evidence: [], missingContext: [],
  objectionDebt: { objection: '', evidence: '', requiredAction: '', owner: '', status: 'Open' },
  forecastEvidenceCategory: 'Weak but recoverable', recommendedAction: '',
  pipelineReviewAnswer: '', decisionRecommendation: 'Monitor', ...patch,
});

// 1. No saved store => an EMPTY store. Never a fabricated sample brief.
{
  const store = loadPipelineDefenseBriefStore();
  assert.deepEqual(store, { activeBriefId: '', briefs: [] }, 'an unsaved workspace has no brief, not a sample one');
  assert.equal(store.briefs.some((brief) => brief.isSample), false);
}

// 2. A new brief starts empty - it must not default to the starter deals.
{
  const brief = createPipelineDefenseBrief({ title: 'New' });
  assert.deepEqual(brief.deals, [], 'a new brief has no deals until the seller adds them');
  assert.notEqual(brief.isSample, true);
}

// 3. Deleting the last brief leaves nothing - it must not resurrect a sample.
{
  const brief = createPipelineDefenseBrief({ title: 'Only', deals: [deal()] });
  const store = { activeBriefId: brief.id, briefs: [brief] };
  const afterDelete = deletePipelineDefenseBrief(store, brief.id);
  assert.deepEqual(afterDelete, { activeBriefId: '', briefs: [] }, 'deleting the last brief must not create a sample');
}

// 4. The live-deal path produces the seller's own brief, never a sample.
{
  const store = createBriefFromLiveDeals([deal()], { title: 'From live' });
  assert.equal(store.briefs.length, 1);
  assert.equal(store.briefs[0].deals.length, 1);
  assert.equal(store.briefs[0].deals[0].account, 'VNVC');
  assert.equal(store.briefs[0].source, 'user');
  assert.notEqual(store.briefs[0].isSample, true);
  assert.equal(store.activeBriefId, store.briefs[0].id);
}

// 5. createEmptyPipelineDefenseBriefStore is genuinely empty.
assert.deepEqual(createEmptyPipelineDefenseBriefStore(), { activeBriefId: '', briefs: [] });

// 6. Structural guarantee: the starter sample deals no longer exist in the app,
// so no code path can inject them by accident.
const dataModule = readFileSync('src/data/pipelineDefenseBrief.ts', 'utf8');
for (const gone of ['createInitialPipelineDefenseDeals', 'pipelineDefenseDeals', 'initialPipelineDefenseBrief', 'recommendedPipelineActions']) {
  assert.equal(dataModule.includes(`export const ${gone}`) || dataModule.includes(`export function ${gone}`), false,
    `${gone} must stay deleted - it was the sample-deal injection source`);
}
assert.equal(/account: 'Orion Pharma'/.test(dataModule), false, 'sample accounts must not live in the shipped data module');

const storage = readFileSync('src/utils/pipelineDefenseStorage.ts', 'utf8');
assert.equal(storage.includes('createDefaultPipelineDefenseBriefStore'), false, 'the sample-store factory must stay removed');

// 7. Pipeline Defense offers the live-deal path when there is no brief.
const page = readFileSync('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx', 'utf8');
for (const marker of ['{!activeBrief && (', 'No brief yet', 'generateBriefFromLiveDeals', 'Generate from your ', 'createBriefFromLiveDeals']) {
  assert.ok(page.includes(marker), `Pipeline Defense missing no-brief path marker: ${marker}`);
}
assert.equal(page.includes('createInitialPipelineDefenseDeals'), false, 'Pipeline Defense must not seed sample deals anywhere');

// 8. Every store a demo can write must be cleared when the demo is exited.
//    Plan items were the gap: ticking a derived item during a demo stores a
//    completion record, and it survived "clear sample demo data" - so a
//    browser-only workspace (which never re-merges from cloud) kept demo ticks
//    in its real plan. The banner promises "only records marked as demo/sample
//    are removed"; every one of them must actually go.
{
  const sample = readFileSync('src/utils/sampleData.ts', 'utf8');
  const clearBlock = sample.slice(
    sample.indexOf('export function clearSampleDataset'),
    sample.indexOf('export function sanitizeLegacySampleDataset'),
  );
  for (const key of [
    'SALES_ACTIVITY_STORAGE_KEY',
    'QUOTE_STORAGE_KEY',
    'EXPENSE_STORAGE_KEY',
    'WEEKLY_COMMITMENT_STORAGE_KEY',
    'PLAN_ITEM_STORAGE_KEY',
  ]) {
    assert.ok(
      clearBlock.includes(`removeSampleRecords(${key})`),
      `clearSampleDataset must clear sample records from ${key}`,
    );
  }

  // Plan items are cleared by tag only. The legacy-term sweep matches phrases
  // like "Tender opportunity", which a real operator could genuinely write on
  // their own plan item - running it over plan items would delete real work.
  const legacyList = sample.slice(
    sample.indexOf('const SAMPLE_ARRAY_STORAGE_KEYS'),
    sample.indexOf('type SampleRecord'),
  );
  assert.equal(
    legacyList.includes('PLAN_ITEM_STORAGE_KEY'),
    false,
    'plan items must not join the legacy term sweep - it would delete real items by wording',
  );
}

console.log('Sample/live separation contract verified.');
