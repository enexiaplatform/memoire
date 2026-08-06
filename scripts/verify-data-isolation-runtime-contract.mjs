import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const failures = [];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function loadExportModule() {
  const source = readFileSync('api/export.ts', 'utf8')
    .replace(/^import .+;\r?\n/gm, '');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dir = mkdtempSync(join(tmpdir(), 'memoire-export-contract-'));
  const file = join(dir, `export-${Date.now()}.mjs`);
  writeFileSync(file, transpiled.outputText, 'utf8');
  const mod = await import(`file:///${file.replaceAll('\\', '/')}`);
  return {
    mod,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const expectedTables = [
  ['user_profiles', 'id'],
  ['usage_monthly', 'user_id'],
  ['sales_activities', 'user_id'],
  ['accounts', 'user_id'],
  ['opportunities', 'user_id'],
  ['stakeholders', 'user_id'],
  ['objections', 'user_id'],
  ['pipeline_defense_briefs', 'user_id'],
  ['review_packs', 'user_id'],
  ['sales_assets', 'user_id'],
  ['action_outcomes', 'user_id'],
  ['weekly_commitments', 'user_id'],
  ['plan_items', 'user_id'],
  // Commercial Kernel. A backup without these would be missing every promise,
  // every thread and the whole event history.
  ['commercial_threads', 'user_id'],
  ['commercial_commitments', 'user_id'],
  ['commercial_events', 'user_id'],
  ['commercial_value_outcomes', 'user_id'],
  // The money side. An export missing these hands a distributor their pipeline
  // and nothing about what it cost them.
  ['quotes', 'user_id'],
  ['opportunity_outcomes', 'user_id'],
  ['expenses', 'user_id'],
  ['order_costs', 'user_id'],
  ['order_milestones', 'user_id'],
  ['supplier_commitments', 'user_id'],
  ['commercial_targets', 'user_id'],
  ['account_merges', 'user_id'],
  ['nudges', 'user_id'],
  ['operating_context', 'user_id'],
  ['captures', 'user_id'],
  ['entities', 'user_id'],
  ['relationships', 'user_id'],
  ['contacts', 'user_id'],
  ['interactions', 'user_id'],
  ['actions', 'user_id'],
  ['activity_log', 'user_id'],
];

/**
 * Tables the export must NOT name.
 *
 * `deals` was listed for months against a schema that never had it, so every
 * export came back with a warning and a manifest reading `complete: false`.
 * A list that names a table nobody created is not a harmless extra entry - it
 * permanently asserts the backup is incomplete, which is the one thing that
 * signal exists to say.
 */
const forbiddenTables = ['deals'];

let cleanup = () => {};

try {
  const loaded = await loadExportModule();
  cleanup = loaded.cleanup;
  const { exportTables, findExportContamination } = loaded.mod;
  const userId = 'user-123';
  const otherUserId = 'user-456';

  assert(Array.isArray(exportTables), 'exportTables should be exported as an array');
  assert(exportTables.length === expectedTables.length, 'exportTables should include every expected export table');

  for (const [table, ownerColumn] of expectedTables) {
    const match = exportTables.find((entry) => entry.table === table);
    assert(Boolean(match), `exportTables missing ${table}`);
    assert(match?.ownerColumn === ownerColumn, `${table} should use owner column ${ownerColumn}`);
  }

  for (const table of forbiddenTables) {
    assert(
      !exportTables.some((entry) => entry.table === table),
      `exportTables must not name ${table}: it does not exist, so listing it marks every export incomplete`,
    );
  }

  const cleanResults = exportTables.map((entry) => ({
    table: entry.table,
    ownerColumn: entry.ownerColumn,
    data: [
      { id: `${entry.table}-1`, [entry.ownerColumn]: userId },
      { id: `${entry.table}-2`, [entry.ownerColumn]: userId },
    ],
    warning: '',
  }));
  assert(findExportContamination(cleanResults, userId).length === 0, 'clean owned rows should not report contamination');

  const mismatched = [{
    table: 'accounts',
    ownerColumn: 'user_id',
    data: [{ id: 'account-1', user_id: otherUserId }],
    warning: '',
  }];
  const mismatchFindings = findExportContamination(mismatched, userId);
  assert(mismatchFindings.length === 1, 'owner mismatch should report one contamination finding');
  assert(mismatchFindings[0]?.table === 'accounts', 'owner mismatch should include table name');
  assert(mismatchFindings[0]?.ownerColumn === 'user_id', 'owner mismatch should include owner column');
  assert(mismatchFindings[0]?.reason === 'owner_mismatch', 'owner mismatch should include owner_mismatch reason');

  const profileMismatch = [{
    table: 'user_profiles',
    ownerColumn: 'id',
    data: [{ id: otherUserId }],
    warning: '',
  }];
  const profileFindings = findExportContamination(profileMismatch, userId);
  assert(profileFindings.length === 1, 'user_profiles id mismatch should report contamination');
  assert(profileFindings[0]?.ownerColumn === 'id', 'user_profiles contamination should use id owner column');

  const nonObject = [{
    table: 'review_packs',
    ownerColumn: 'user_id',
    data: [null, 'bad-row'],
    warning: '',
  }];
  const nonObjectFindings = findExportContamination(nonObject, userId);
  assert(nonObjectFindings.length === 2, 'non-object rows should report contamination findings');
  assert(nonObjectFindings.every((finding) => finding.reason === 'row_not_object'), 'non-object rows should use row_not_object reason');

  const warningResult = [{
    table: 'opportunities',
    ownerColumn: 'user_id',
    data: [{ id: 'opportunity-1', user_id: otherUserId }],
    warning: 'opportunities: permission denied',
  }];
  assert(
    findExportContamination(warningResult, userId).length === 0,
    'tables with query warnings should be skipped by contamination guard because no trusted row set was returned',
  );

  const mixedResults = [
    {
      table: 'accounts',
      ownerColumn: 'user_id',
      data: [{ id: 'account-1', user_id: userId }],
      warning: '',
    },
    {
      table: 'opportunities',
      ownerColumn: 'user_id',
      data: [{ id: 'opportunity-1', user_id: otherUserId }],
      warning: '',
    },
  ];
  const mixedFindings = findExportContamination(mixedResults, userId);
  assert(mixedFindings.length === 1, 'mixed clean and contaminated results should report only contaminated rows');
  assert(mixedFindings[0]?.table === 'opportunities', 'mixed contamination should identify the contaminated table');
} finally {
  cleanup();
}

if (failures.length > 0) {
  console.error('Data isolation runtime contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Data isolation runtime contract verification passed.');
