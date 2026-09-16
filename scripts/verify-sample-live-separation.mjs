import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

// The first real user opened Pipeline Defense on a workspace of 122 live deals
// and was shown the hard-coded starter brief (Orion Pharma, Northstar Foods).
// The brief itself was removed on 2026-09-16 - no workspace had ever saved one
// - and with it went the store, the starter data and every path that could
// inject a fabricated deal into a live book. What survives here is the reason
// those assertions existed: a sample record must never appear in a workspace
// that did not ask for the demo, and every store a demo writes must be
// sweepable.

// 1-5. The brief store is gone rather than guarded. These files held the only
// code that could fabricate a deal, so their absence is the guarantee.
for (const gone of [
  'src/utils/pipelineDefenseStorage.ts',
  'src/services/pipelineDefenseCloudStore.ts',
  'src/utils/reviewPacks.ts',
  'src/features/pipeline/PipelineReviewDefenseBriefPage.tsx',
]) {
  assert.equal(existsSync(gone), false, `${gone} is back - a brief store must re-prove it cannot seed sample deals`);
}

// 6. Structural guarantee: the starter sample deals no longer exist in the app,
// so no code path can inject them by accident. The data module survives as the
// vocabulary the risk engine still speaks - the four evidence categories and
// the five decisions - and must stay free of any named company.
const dataModule = readFileSync('src/data/pipelineDefenseBrief.ts', 'utf8');
for (const gone of ['createInitialPipelineDefenseDeals', 'pipelineDefenseDeals', 'initialPipelineDefenseBrief', 'recommendedPipelineActions']) {
  assert.equal(dataModule.includes(`export const ${gone}`) || dataModule.includes(`export function ${gone}`), false,
    `${gone} must stay deleted - it was the sample-deal injection source`);
}
assert.equal(/account: 'Orion Pharma'/.test(dataModule), false, 'sample accounts must not live in the shipped data module');

// 7. The demo seeds no brief either: the sandbox shows the four decision states
// on the deals themselves, which is what the brief was restating.
{
  const sample = readFileSync('src/utils/sampleData.ts', 'utf8');
  assert.equal(
    sample.includes('generatePipelineDefenseBriefFromOpportunities'),
    false,
    'the demo must not seed a brief for a surface that no longer exists',
  );
}

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

// 9. A sweep is only as good as the label it sweeps on.
//
// Check 8 has asserted since it was written that clearSampleDataset clears
// sample activities, and it passed the whole time the bug existed: the sweep ran
// over SALES_ACTIVITY_STORAGE_KEY and matched nothing, because the capture store
// wrote `source: 'user', isSample: false` on every touch unconditionally. So
// every capture made in the demo - the product's primary demo path - stayed in
// the workspace of whoever signed in next on that browser, under a banner
// promising that only records marked as demo are removed. Nothing was marked.
//
// The label is therefore a contract of its own: every path that creates a touch
// must say which workspace it belongs to, and a sample touch must never be
// offered to the account.
{
  const store = readFileSync('src/services/salesActivityStore.ts', 'utf8');

  const local = store.slice(store.indexOf('function createLocalActivity'), store.indexOf('function rowToRecord'));
  assert.ok(local.length > 0, 'createLocalActivity must be findable');
  assert.equal(
    /source: 'user',\s*\n\s*isSample: false,/.test(local),
    false,
    'a capture must not be hard-coded as a live record - the demo writes through this function too',
  );
  assert.match(local, /workspace\.source/, 'a capture takes its source from the workspace it was made in');
  assert.match(local, /workspace\.isSample/, 'a capture takes its sample flag from the workspace it was made in');

  // A demo touch never reaches the account, whatever user id it is handed, and
  // never queues itself for upload.
  const save = store.slice(store.indexOf('export async function saveSalesActivity'), store.indexOf('export async function deleteSalesActivity'));
  assert.match(save, /workspace\.isSample === true \|\| workspace\.source === 'demo'/, 'saveSalesActivity must refuse the cloud for a sample capture');
  const pending = store.slice(store.indexOf('export function listPendingSalesActivities'), store.indexOf('export const PENDING_SYNC_CHANGED_EVENT'));
  assert.match(pending, /source !== 'demo' && record\.isSample !== true/, 'a sample capture is never owed to the cloud');

  // The workspace tag is a required parameter, not an optional one. An optional
  // tag is this same bug in a politer form: a caller that forgets it writes a
  // live record, which is what every caller was doing. The compiler now asks.
  assert.equal(
    /workspace: SalesActivityWorkspaceTag = \{\}/.test(save),
    false,
    'the workspace tag must not default - a forgotten tag must fail the build, not write a live record',
  );
  assert.match(save, /workspace: SalesActivityWorkspaceTag,/, 'saveSalesActivity must require the workspace tag');

  // Required is not the same as correct - `{}` would still compile - so every
  // surface that writes a touch is checked to pass the real flag. This is how
  // the bug hid for so long: the sweep looked wired and the callers were not.
  for (const file of [
    'src/features/dailyCapture/DailyCapturePage.tsx',
    'src/features/v31/FollowUpComposerPanel.tsx',
    'src/features/plan/WeeklyPlanPage.tsx',
  ]) {
    const source = readFileSync(file, 'utf8');
    const callSites = [...source.matchAll(/saveSalesActivity\(/g)].map((match) => match.index);
    assert.ok(callSites.length > 0, `${file} no longer writes touches - drop it from this list`);
    callSites.forEach((at) => {
      // The tag is the last argument, so it sits within the call's own text.
      // A window rather than a parse: the arguments are object literals with
      // nested braces, and a brace-counter here would be a second parser to
      // maintain for no extra certainty.
      const call = source.slice(at, at + 1400);
      assert.match(
        call,
        /isSample: sampleDataActive/,
        `${file} writes a touch without tagging the workspace it was made in (call at index ${at}) - that capture survives the demo purge`,
      );
    });
  }
}

// 9b. People, the same way. Every stakeholder used to be written
// `source: 'user', isSample: false`, so a person added inside the demo - by hand,
// from a capture, or from a plan record - survived the purge that sweeps this
// collection. The tag is required, and every caller is checked to pass a real
// flag rather than a literal.
{
  const store = readFileSync('src/services/stakeholderStore.ts', 'utf8');
  assert.match(store, /workspace: StakeholderWorkspaceTag,?\s*\)/, 'createStakeholder must require the workspace tag');
  assert.doesNotMatch(store, /workspace\?: StakeholderWorkspaceTag|workspace: StakeholderWorkspaceTag = /, 'the stakeholder workspace tag must not be optional or defaulted');
  const localCreate = store.slice(
    store.indexOf('function createLocalStakeholder'),
    store.indexOf('\n}', store.indexOf('function createLocalStakeholder')),
  );
  assert.ok(localCreate.length > 0, 'the local stakeholder constructor must be findable');
  assert.match(localCreate, /isSample: workspace\.isSample/, 'a new local stakeholder takes its sample flag from the workspace, not a literal');
  for (const [file, flag] of [
    ['src/features/stakeholders/StakeholdersPage.tsx', /isSample: sampleDataActive/],
    ['src/features/plan/WeeklyPlanPage.tsx', /workspaceTag/],
    ['src/domain/commercialKernel/commitCapturedFacts.ts', /isSample: context\.isSample/],
  ]) {
    const source = readFileSync(file, 'utf8');
    const callSites = [...source.matchAll(/createStakeholder\(/g)].map((match) => match.index);
    assert.ok(callSites.length > 0, `${file} no longer adds stakeholders - drop it from this list`);
    callSites.forEach((at) => {
      assert.match(source.slice(at, at + 1400), flag, `${file} adds a stakeholder without tagging the workspace (call at index ${at})`);
    });
  }
}

// 10. Every store that can hold a demo record is swept - discovered, not listed.
//
// Checks 8 and 9 both name their collections by hand, and a hand-written list is
// how this whole class of bug survives: it is complete on the day it is written
// and silently incomplete from the next collection onwards. Five stores tagged
// their demo records correctly and were never cleared - order milestones, order
// costs, supplier commitments, account merges and nudges - so a demo tick, a
// demo purchase cost and a demo merge all stayed in the next workspace to sign
// in on that browser, while this file reported the separation verified.
//
// The rule is derived instead: if a store carries an `isSample` flag it can hold
// a demo record, and if it can hold one it must be cleared when the demo ends.
{
  const sample = readFileSync('src/utils/sampleData.ts', 'utf8');
  const clearBlock = sample.slice(
    sample.indexOf('export function clearSampleDataset'),
    sample.indexOf('export function sanitizeLegacySampleDataset'),
  );

  const unswept = [];
  for (const file of readdirSync('src/services').filter((name) => name.endsWith('.ts'))) {
    const source = readFileSync(`src/services/${file}`, 'utf8');
    const key = source.match(/export const ([A-Z_]*STORAGE_KEY) = '[^']+'/);
    // `isSample` is the marker that this store's records can belong to the demo
    // sandbox. A store without it cannot hold one, and needs no sweep.
    if (!key || !source.includes('isSample')) continue;
    if (!clearBlock.includes(key[1])) unswept.push(`${key[1]} (${file})`);
  }

  assert.deepEqual(
    unswept,
    [],
    `these stores can hold demo records and clearSampleDataset never clears them, so a demo survives into the next workspace: ${unswept.join(', ')}`,
  );
}

console.log('Sample/live separation contract verified.');
