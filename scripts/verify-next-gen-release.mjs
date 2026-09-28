import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEXT_GEN_MIGRATIONS, productionMigrations } from './release-database-harness.mjs';

const read = path => readFileSync(path, 'utf8');
const durability = read('src/services/canonicalDurability.ts');
const history = read('src/services/historicalIntegrity.ts');
const exportsApi = read('api/export.ts');
const navigation = read('src/config/featureRegistry.ts');
const historicalStorage = read('src/services/historicalStorageCodec.ts');
const exportSurface = read('src/features/settings/ExportTab.tsx');
const restoreSurface = read('src/services/workspaceRestore.ts');
const learning = [
  read('src/domain/commercialKernel/decisionLearning.ts'),
  read('src/domain/commercialKernel/decisionObservationCommands.ts'),
  read('src/features/opportunities/CommercialDecisionSection.tsx'),
].join('\n');

const orderedMigrations = productionMigrations();
const coreStart = orderedMigrations.indexOf(NEXT_GEN_MIGRATIONS[0]);
assert.deepEqual(orderedMigrations.slice(coreStart, coreStart + NEXT_GEN_MIGRATIONS.length), NEXT_GEN_MIGRATIONS,
  'M2-M11 migration order changed; update the audited release manifest deliberately.');

const canonicalTables = [
  'commercial_conditions', 'commercial_outcome_requirements', 'commercial_dependencies',
  'commercial_timing_assertions', 'commercial_decisions', 'commercial_money_gates',
  'commercial_decision_observations',
];
for (const table of canonicalTables) {
  assert.match(durability, new RegExp(`['\"]${table}['\"]`), `${table} missing from canonical durability`);
  assert.match(exportsApi, new RegExp(`table: ['\"]${table}['\"]`), `${table} missing from account export`);
}
for (const table of ['opportunities', 'commercial_conditions', 'commercial_evidence',
  'commercial_outcome_requirements', 'commercial_dependencies', 'commercial_timing_assertions',
  'commercial_commitments', 'commercial_money_gates']) {
  assert.match(history, new RegExp(`\\b${table}:`), `${table} missing from revision coverage registry`);
}
for (const table of ['commercial_history_coverage', 'commercial_state_revisions']) {
  assert.match(exportsApi, new RegExp(`table: ['\"]${table}['\"]`), `${table} missing from account export`);
}

const expectedDestinations = ['today', 'leads', 'accounts', 'opportunities', 'money', 'timeline', 'review'];
const primaryBlock = navigation.match(/PRIMARY_DESTINATION_IDS = \[([\s\S]*?)\] as const/)?.[1] || '';
const actualDestinations = [...primaryBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.deepEqual(actualDestinations, expectedDestinations, 'R1 cannot add a top-level destination.');

for (const phrase of ['success rate', 'best strategy', 'recovered value', 'saved value', 'winning strategy']) {
  assert.equal(learning.toLowerCase().includes(phrase), false, `M11 generated language contains prohibited phrase: ${phrase}`);
}
for (const required of ['Observed association', 'do not establish', 'not recommendations']) {
  assert.match(learning, new RegExp(required, 'i'), `M11 causal-boundary copy is missing: ${required}`);
}

for (const path of [
  'src/domain/commercialKernel/deriveCommercialTime.ts',
  'src/domain/commercialKernel/deriveForecastDefensibility.ts',
  'src/domain/commercialKernel/deriveMoneyConsequences.ts',
  'src/domain/commercialKernel/commercialScenario.ts',
  'src/domain/commercialKernel/decisionLearning.ts',
]) {
  assert.equal(/\bDate\.now\s*\(/.test(read(path)), false, `${path} reads ambient time in a pure derivation.`);
}

assert.match(history, /encodeHistoricalStorage/, 'Revision writes must use the bounded historical storage codec.');
assert.match(exportSurface, /decodeHistoricalStorage/, 'Browser export must decode compressed Revisions.');
assert.match(restoreSurface, /encodeHistoricalStorage/, 'Browser restore must store mature Revision history compactly.');
assert.match(historicalStorage, /zlibSync[\s\S]*level:\s*1/, 'Historical storage must keep the measured fast compression path.');

for (const path of [
  'docs/architecture/next-gen-core-index.md',
  'docs/architecture/next-gen-core-invariants.md',
  'docs/architecture/next-gen-core-release-scope.md',
  'docs/deployment/next-gen-core-migration-manifest.md',
  'docs/deployment/next-gen-core-release-runbook.md',
  'docs/qa/next-gen-core-r1-release-evidence.md',
]) assert.ok(read(path).length > 200, `${path} is missing or empty.`);

console.log(`Next-Gen R1 contract verified: ${NEXT_GEN_MIGRATIONS.length} ordered migrations, ${canonicalTables.length} canonical R1 entities, seven primary destinations, export/history coverage, bounded browser history, temporal purity and descriptive M11 language.`);
