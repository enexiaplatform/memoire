import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalSources, historicallyDerivedProjections } from '../src/services/historicalIntegrity.ts';
import { canonicalContracts } from '../src/services/canonicalDurability.ts';

const sql = [
  '../supabase/migrations/20260920120000_commercial_state_revisions.sql',
  '../supabase/migrations/20260921190000_commercial_money_gates.sql',
  '../supabase/migrations/20260928161744_commercial_policies.sql',
  '../supabase/migrations/20260929010336_commercial_incidents.sql',
  '../supabase/migrations/20260929101027_contract_obligations.sql',
  '../supabase/migrations/20260930060000_commercial_workspaces.sql',
].map(path=>readFileSync(new URL(path,import.meta.url),'utf8')).join('\n');
const exporter = readFileSync(new URL('../api/export.ts', import.meta.url), 'utf8');
const tables = new Set(canonicalContracts.map(contract => contract.table));
for (const [table, source] of Object.entries(historicalSources)) {
  assert.ok(tables.has(table), `${table}: canonical codec missing`);
  assert.equal(canonicalContracts.find(contract => contract.table === table)?.key, source.key);
  assert.ok(sql.includes(`'${table}'`), `${table}: history trigger registration missing`);
  assert.ok(exporter.includes(`'${table}'`), `${table}: backup export missing`);
}
for (const [projection, coverage] of Object.entries(historicallyDerivedProjections)) {
  for (const source of coverage.sources) assert.ok(source in historicalSources, `${projection}: unregistered ${source}`);
}
assert.equal(historicallyDerivedProjections.buyerProgress.complete, false,
  'Buyer Progress event-only signals must remain an explicit M8 gap');
console.log('Historical source, projection, migration and export contract verified.');
