import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
let db;
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');
    CREATE TABLE public.opportunities(id uuid PRIMARY KEY,user_id uuid NOT NULL,account_id uuid,account_name text,
      opportunity_name text,stage text,status text,estimated_value numeric,currency text,expected_close_period text,
      forecast_evidence_category text,evidence text,created_at timestamptz,updated_at timestamptz);
    CREATE TABLE public.commercial_conditions(id text PRIMARY KEY,user_id uuid NOT NULL,statement text,updated_at timestamptz);
    CREATE TABLE public.commercial_evidence(id text PRIMARY KEY,user_id uuid NOT NULL,evidence_text text,observed_at date,updated_at timestamptz);
    CREATE TABLE public.commercial_outcome_requirements(id text PRIMARY KEY,user_id uuid NOT NULL,role text,updated_at timestamptz);
    CREATE TABLE public.commercial_dependencies(id text PRIMARY KEY,user_id uuid NOT NULL,basis text,updated_at timestamptz);
    CREATE TABLE public.commercial_timing_assertions(id text PRIMARY KEY,user_id uuid NOT NULL,basis text,updated_at timestamptz);
    CREATE TABLE public.commercial_commitments(id text PRIMARY KEY,user_id uuid NOT NULL,current_due_date date,updated_at timestamptz);
    GRANT SELECT,INSERT,UPDATE,DELETE ON opportunities,commercial_conditions,commercial_evidence,
      commercial_outcome_requirements,commercial_dependencies,commercial_timing_assertions,commercial_commitments TO authenticated;
    INSERT INTO public.commercial_conditions VALUES ('legacy','${owner}','Budget approved','2026-09-05T00:00:00Z');`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260920120000_commercial_state_revisions.sql',import.meta.url),'utf8'));
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
after(async()=>{await db?.close();});
test('activation baselines current state at system time, not old created/updated date',async()=>{
  await db.query('SELECT public.activate_commercial_history()');
  const {rows}=await db.query("SELECT r.operation,r.recorded_at,c.history_guaranteed_from,r.state FROM commercial_state_revisions r JOIN commercial_history_coverage c ON c.user_id=r.user_id WHERE r.entity_id='legacy'");
  assert.equal(rows.length,1);assert.equal(rows[0].operation,'baseline');
  assert.equal(new Date(rows[0].recorded_at).getTime(),new Date(rows[0].history_guaranteed_from).getTime());
  assert.equal(rows[0].state.statement,'Budget approved');
});
test('canonical update and revision are one database transaction; no-op retry is idempotent',async()=>{
  await db.query("UPDATE commercial_conditions SET statement='Budget uncertain',updated_at='2026-09-21T00:00:00Z' WHERE id='legacy'");
  await db.query("UPDATE commercial_conditions SET statement='Budget uncertain',updated_at='2026-09-22T00:00:00Z' WHERE id='legacy'");
  let rows=(await db.query("SELECT revision_no,state FROM commercial_state_revisions WHERE entity_id='legacy' ORDER BY revision_no")).rows;
  assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.revision_no),[1,2]);
  await assert.rejects(db.query("INSERT INTO commercial_state_revisions(user_id,entity_type,entity_id,revision_no,operation,recorded_at,schema_version,state) VALUES($1,'commercial_conditions','forged',1,'create',now(),1,'{}')",[owner]));
  assert.equal((await db.query("SELECT statement FROM commercial_conditions WHERE id='legacy'")).rows[0].statement,'Budget uncertain');
  await db.exec("RESET ROLE; ALTER TABLE commercial_state_revisions ADD CONSTRAINT reject_history_test CHECK (state->>'statement' IS DISTINCT FROM 'Rejected'); SET ROLE authenticated;");
  try {
    await assert.rejects(db.query("UPDATE commercial_conditions SET statement='Rejected' WHERE id='legacy'"));
    assert.equal((await db.query("SELECT statement FROM commercial_conditions WHERE id='legacy'")).rows[0].statement,'Budget uncertain');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_state_revisions WHERE entity_id='legacy'")).rows[0].n,2);
  } finally {
    await db.exec('RESET ROLE; ALTER TABLE commercial_state_revisions DROP CONSTRAINT reject_history_test; SET ROLE authenticated;');
  }
});
test('late-entered Evidence keeps observed business date separately from accepted system time',async()=>{
  await db.query("INSERT INTO commercial_evidence VALUES ('late',$1,'Trial passed','2026-09-18','2026-09-19T00:00:00Z')",[owner]);
  const row=(await db.query("SELECT recorded_at,state FROM commercial_state_revisions WHERE entity_id='late'")).rows[0];
  assert.equal(row.state.observed_at,'2026-09-18');assert.ok(new Date(row.recorded_at)>new Date('2026-09-19T00:00:00Z'));
});
test('another user and anon cannot read or forge history',async()=>{
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',false);`);
  assert.equal((await db.query('SELECT * FROM commercial_state_revisions')).rows.length,0);
  await assert.rejects(db.query("UPDATE commercial_conditions SET statement='Other' WHERE id='legacy'"));
  await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_state_revisions'));
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
