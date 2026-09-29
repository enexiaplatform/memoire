import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createSupabaseCompatibleDatabase, applyMigrations, productionMigrations, setAuthenticatedOwner } from '../../scripts/release-database-harness.mjs';

const formatVersion = Number(readFileSync('src/utils/workspaceBackup.ts','utf8').match(/BACKUP_FORMAT_VERSION = (\d+)/)[1]);
const sourceTables = ['opportunities','commercial_conditions','commercial_evidence','commercial_outcome_requirements',
  'commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations'];
let db;
before(async () => { db = await createSupabaseCompatibleDatabase(); await applyMigrations(db); });
after(async () => db?.close());
async function workspace() {
  const owner = randomUUID();
  await db.exec('RESET ROLE');
  await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)', [owner, `${owner}@example.test`]);
  await setAuthenticatedOwner(db, owner);
  return owner;
}
function envelope(owner, coverage = null) {
  return {user_id:owner, format_version:formatVersion, exported_at:'2026-09-20T00:00:00Z', coverage, revisions:[],
    sources:Object.fromEntries(sourceTables.map(table=>[table,[]])), parents:[]};
}
const restore = async payload => (await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result', [JSON.stringify(payload)])).rows[0].result;

test('the format emitted by export restores verified history and retries without changing its boundary', async () => {
  const owner = await workspace();
  const payload = envelope(owner, {user_id:owner, history_guaranteed_from:'2026-09-20T00:00:00Z', schema_version:1,lineage_id:randomUUID()});
  assert.equal((await restore(payload)).status,'restored');
  assert.equal((await restore(payload)).status,'no_op');
  const marker=(await db.query('SELECT history_guaranteed_from,lineage_id FROM commercial_history_coverage')).rows[0];
  assert.equal(new Date(marker.history_guaranteed_from).toISOString(),'2026-09-20T00:00:00.000Z');
  assert.equal(marker.lineage_id,payload.coverage.lineage_id);
});

test('the service payload with explicit null coverage starts an honest baseline and is idempotent', async () => {
  const owner=await workspace();
  const payload=envelope(owner);
  assert.equal((await restore(payload)).status,'restored');
  const marker=(await db.query('SELECT history_guaranteed_from,lineage_id FROM commercial_history_coverage')).rows[0];
  assert.ok(new Date(marker.history_guaranteed_from)>new Date(payload.exported_at));
  assert.equal((await restore(payload)).status,'no_op');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM commercial_state_revisions')).rows[0].n,0);
});

test('unknown, malformed and missing backup formats fail without creating coverage', async () => {
  const owner=await workspace();
  for(const version of [formatVersion+1,0,-1,1.5,'11',null,undefined]) {
    await assert.rejects(restore({...envelope(owner),format_version:version}), /backup format/i);
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM commercial_history_coverage')).rows[0].n,0);
});

test('null coverage cannot launder orphaned revisions into a fresh baseline', async () => {
  const owner=await workspace();
  await assert.rejects(restore({...envelope(owner),revisions:[{id:randomUUID()}]}), /without.*coverage|legacy.*revisions/i);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM commercial_history_coverage')).rows[0].n,0);
});

test('original authenticated ownership and anonymous denial still hold at the current format', async () => {
  const owner=await workspace();
  await assert.rejects(restore(envelope(randomUUID())), /original authenticated workspace/i);
  await db.exec('SET ROLE anon');
  await assert.rejects(restore(envelope(owner)), /permission denied/i);
});

test('every older supported envelope keeps its original verified cutoff', async () => {
  for(let version=1;version<formatVersion;version++) {
    const owner=await workspace();
    const payload={...envelope(owner,{user_id:owner,history_guaranteed_from:'2026-09-20T00:00:00Z',schema_version:1,lineage_id:randomUUID()}),format_version:version};
    assert.equal((await restore(payload)).status,'restored');
    assert.equal((await restore(payload)).status,'no_op');
  }
});

test('upgrade from the exact R1 chain fixes format 11 without changing existing coverage', async () => {
  const legacy=await createSupabaseCompatibleDatabase();
  try {
    const repair='20260928160214_restore_current_backup_format.sql';
    const migrations=productionMigrations();
    await applyMigrations(legacy,migrations.slice(0,migrations.indexOf(repair)));
    const owner=randomUUID();
    await legacy.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)',[owner,`${owner}@example.test`]);
    await setAuthenticatedOwner(legacy,owner);
    const payload={...envelope(owner,{user_id:owner,history_guaranteed_from:'2026-09-20T00:00:00Z',schema_version:1,lineage_id:randomUUID()}),format_version:11};
    const invoke=async p=>(await legacy.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(p)])).rows[0].result;
    assert.equal((await invoke({...payload,format_version:10})).status,'restored');
    await assert.rejects(invoke(payload),/Unsupported historical backup format/);
    const before=(await legacy.query('SELECT * FROM commercial_history_coverage')).rows;
    await legacy.exec('RESET ROLE');
    await applyMigrations(legacy,[repair]);
    await setAuthenticatedOwner(legacy,owner);
    assert.equal((await invoke(payload)).status,'no_op');
    assert.deepEqual((await legacy.query('SELECT * FROM commercial_history_coverage')).rows,before);
  } finally { await legacy.close(); }
});
