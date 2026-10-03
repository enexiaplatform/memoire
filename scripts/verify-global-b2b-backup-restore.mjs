// Rehearse the real exported QC backup in an isolated database, never in Production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createSupabaseCompatibleDatabase, applyMigrations, setAuthenticatedOwner } from './release-database-harness.mjs';
import { canonicalContracts } from '../src/services/canonicalDurability.ts';
import { historicalSources } from '../src/services/historicalIntegrity.ts';
import { buildRestorePlan } from '../src/utils/workspaceBackup.ts';
import { buildOrderBook } from '../src/utils/orderToCash.ts';
import { buildReceivables } from '../src/utils/receivables.ts';
import { buildOrderMargins } from '../src/utils/orderMargin.ts';
import { buildGlobalB2BYear } from './fixtures/global-b2b-year.mjs';
const root = process.env.MEMOIRE_REMEDIATION_ARTIFACT_DIR || '.audit/global-b2b-remediation-2026-10-03/browser';
const envelope = JSON.parse(fs.readFileSync(`${root}/workspace-backup.json`));
buildRestorePlan(envelope);
const data = envelope.cloudData.data, owner = envelope.cloudData.user_id;
assert.equal(envelope.cloudData.manifest.complete, true);
assert.equal(owner, 'd5394eb0-cd88-48ae-936b-be50e19e890a', 'Only the fictional QC owner may be rehearsed.');
const db = await createSupabaseCompatibleDatabase();
const result = { at: new Date().toISOString(), isolated: true, canonicalTables: {}, history: {}, passed: false };
try {
  await applyMigrations(db);
  // Supabase grants Data API table access separately from owner RLS. The isolated
  // harness does not install those provider defaults; retain all migrated policies.
  await db.exec(`GRANT SELECT, INSERT, UPDATE ON ${canonicalContracts.map(c => `"${c.table}"`).join(',')} TO authenticated`);
  await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)', [owner, 'northstar-restore@example.invalid']);
  await setAuthenticatedOwner(db, owner);
  const sources = Object.fromEntries(Object.keys(historicalSources).map(table => [table, data[table]]));
  const requiredQuotes = new Set(sources.commercial_money_gates.filter(g => g.money_source_type === 'quote_value').map(g => g.money_source_id));
  const payload = { user_id: owner, format_version: envelope.formatVersion, exported_at: envelope.exportedAt,
    coverage: data.commercial_history_coverage[0], revisions: data.commercial_state_revisions,
    sources, parents: data.accounts, quote_parents: data.quotes.filter(q => requiredQuotes.has(q.id)) };
  const invoke = async () => (await db.query('SELECT restore_commercial_history($1::jsonb) AS result', [JSON.stringify(payload)])).rows[0].result;
  assert.equal((await invoke()).status, 'restored'); assert.equal((await invoke()).status, 'no_op');
  for (const contract of canonicalContracts) {
    const table = contract.table, rows = data[table]; assert.ok(Array.isArray(rows), `${table} missing`);
    if (!(table in sources) && table !== 'accounts') {
      const types = new Map((await db.query('SELECT column_name,udt_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1', [table])).rows.map(r => [r.column_name, r.udt_name]));
      for (const row of rows) {
        const columns = Object.keys(row); assert.ok(columns.every(c => types.has(c)));
        const quoted = c => `"${c}"`;
        await db.query(`INSERT INTO "${table}" (${columns.map(quoted).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})
          ON CONFLICT (${contract.conflict}) DO UPDATE SET ${columns.map(c => `${quoted(c)}=EXCLUDED.${quoted(c)}`).join(',')}`,
        columns.map(c => types.get(c) === 'jsonb' || types.get(c) === 'json' ? JSON.stringify(row[c]) : row[c]));
      }
    }
    const restored = (await db.query(`SELECT * FROM "${table}"`)).rows;
    assert.equal(restored.length, rows.length, `${table} count`);
    const sortedIds = values => values.map(r => r.id ?? `${r.fiscal_year}:${r.period}`).sort();
    assert.deepEqual(sortedIds(restored), sortedIds(rows), `${table} identities`);
    if (contract.kind === 'json') {
      const payloads = values => Object.fromEntries(values.map(r => [r.id, r.payload]));
      assert.deepEqual(payloads(restored), payloads(rows), `${table} full canonical contents`);
    }
    result.canonicalTables[table] = restored.length;
  }
  const marker = (await db.query('SELECT * FROM commercial_history_coverage')).rows[0];
  assert.equal(marker.lineage_id, payload.coverage.lineage_id);
  assert.equal(new Date(marker.history_guaranteed_from).toISOString(), new Date(payload.coverage.history_guaranteed_from).toISOString());
  const revisions = (await db.query('SELECT * FROM commercial_state_revisions')).rows;
  assert.equal(revisions.length, payload.revisions.length);
  const states = rows => Object.fromEntries(rows.map(r => [r.id, { ...r, recorded_at: new Date(r.recorded_at).toISOString() }]));
  assert.deepEqual(states(revisions), states(payload.revisions));
  result.history = { revisions: revisions.length, lineagePreserved: true, boundaryPreserved: true, idempotent: true };
  const opportunities = (await db.query('SELECT * FROM opportunities')).rows.map(r => canonicalContracts.find(c => c.table === 'opportunities').decode(r));
  const payloadRows = async table => (await db.query(`SELECT payload FROM "${table}"`)).rows.map(r => r.payload);
  const quotes = await payloadRows('quotes'), receivableRecords = await payloadRows('order_receivables'), costRecords = await payloadRows('order_costs');
  const book = buildOrderBook({ opportunities, quotes, milestoneRecords: [], receivableRecords, costRecords, today: '2026-10-03' });
  const cash = buildReceivables({ orders: book.orders, records: receivableRecords, today: '2026-10-03' });
  const margin = buildOrderMargins({ orders: book.orders, costRecords });
  const oracle = buildGlobalB2BYear().oracle;
  for (const [actual, expected] of [[cash.totalReceivedBase, oracle.received], [cash.totalOutstandingBase, oracle.outstanding],
    [margin.grossMarginBase, oracle.grossMargin], [margin.costBase, oracle.landedCost]]) assert.ok(Math.abs(actual - expected) < .01);
  assert.equal(book.collectedCount, 24); assert.equal(cash.openCount, 24);
  result.financialRoundTrip = { received: cash.totalReceivedBase, outstanding: cash.totalOutstandingBase,
    grossMargin: margin.grossMarginBase, landedCost: margin.costBase, collected: book.collectedCount, open: cash.openCount };
  result.passed = true; fs.writeFileSync(`${root}/restore-rehearsal.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await db.close(); }
