import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
let db;
let historyPayload;
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');
    CREATE TABLE public.accounts(id uuid PRIMARY KEY,user_id uuid NOT NULL,name text);
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
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260920130000_commercial_history_restore.sql',import.meta.url),'utf8'));
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
test('empty verified history restores transactionally into a matching empty owner scope',async()=>{
  const fresh='33333333-3333-4333-8333-333333333333';
  await db.exec(`RESET ROLE; INSERT INTO auth.users VALUES ('${fresh}'); SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub','${fresh}',false);`);
  const sources=Object.fromEntries(['opportunities','commercial_conditions','commercial_evidence',
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'].map(t=>[t,[]]));
  const payload={user_id:fresh,format_version:10,exported_at:'2026-09-20T00:00:00Z',
    coverage:{user_id:fresh,history_guaranteed_from:'2026-09-20T00:00:00Z',schema_version:1,
      lineage_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},revisions:[],sources};
  const first=(await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(payload)])).rows[0].result;
  assert.equal(first.status,'restored');
  const retry=(await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(payload)])).rows[0].result;
  assert.equal(retry.status,'no_op');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM commercial_state_revisions')).rows[0].n,0);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
test('historical condition state and revision identity restore without synthetic revisions',async()=>{
  const fresh='44444444-4444-4444-8444-444444444444';
  await db.exec(`RESET ROLE; INSERT INTO auth.users VALUES ('${fresh}'); SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub','${fresh}',false);`);
  const sources=Object.fromEntries(['opportunities','commercial_conditions','commercial_evidence',
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'].map(t=>[t,[]]));
  sources.commercial_conditions=[{id:'restored-condition',user_id:fresh,statement:'Buyer approved',updated_at:'2026-09-23T00:00:00+00:00'}];
  const payload={user_id:fresh,format_version:10,exported_at:'2026-09-24T00:00:00Z',
    coverage:{user_id:fresh,history_guaranteed_from:'2026-09-20T00:00:00Z',schema_version:1,
      lineage_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
    revisions:[{id:'aaaaaaaa-1111-4111-8111-111111111111',user_id:fresh,entity_type:'commercial_conditions',
      entity_id:'restored-condition',revision_no:1,mutation_id:'aaaaaaaa-2222-4222-8222-222222222222',
      operation:'create',recorded_at:'2026-09-21T00:00:00Z',schema_version:1,
      state:{id:'restored-condition',user_id:fresh,statement:'Buyer approved',updated_at:'2026-09-23T00:00:00+00:00'}}],sources};
  historyPayload=payload;
  const first=(await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(payload)])).rows[0].result;
  assert.equal(first.status,'restored');
  assert.equal((await db.query("SELECT statement FROM commercial_conditions WHERE id='restored-condition'")).rows[0].statement,'Buyer approved');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_state_revisions WHERE entity_id='restored-condition'")).rows[0].n,1);
  await db.exec("UPDATE commercial_conditions SET updated_at='2026-09-24T00:00:00Z' WHERE id='restored-condition'");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_state_revisions WHERE entity_id='restored-condition'")).rows[0].n,1);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
test('restore rejects foreign ownership, invalid sequence, and a different lineage',async()=>{
  const forged={...historyPayload,user_id:owner};
  await assert.rejects(db.query('SELECT public.restore_commercial_history($1::jsonb)',[JSON.stringify(forged)]));
  const scope=historyPayload.user_id;
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${scope}',false);`);
  const invalid={...historyPayload,revisions:[{...historyPayload.revisions[0],revision_no:2}]};
  await assert.rejects(db.query('SELECT public.restore_commercial_history($1::jsonb)',[JSON.stringify(invalid)]));
  const different={...historyPayload,coverage:{...historyPayload.coverage,
    lineage_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}};
  assert.equal((await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(different)])).rows[0].result.status,'different_lineage');
  const collision={...historyPayload,sources:{...historyPayload.sources,commercial_conditions:[
    {...historyPayload.sources.commercial_conditions[0],id:'legacy'}]},revisions:[
    {...historyPayload.revisions[0],entity_id:'legacy',state:{...historyPayload.revisions[0].state,id:'legacy'}}]};
  await assert.rejects(db.query('SELECT public.restore_commercial_history($1::jsonb)',[JSON.stringify(collision)]));
  assert.equal((await db.query("SELECT statement FROM commercial_conditions WHERE id='legacy'")).rows[0].statement,'Budget uncertain');
  await db.exec('RESET ROLE');
  const foreignRevisionId=(await db.query("SELECT id FROM commercial_state_revisions WHERE entity_id='legacy' LIMIT 1")).rows[0].id;
  const foreignAccountId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  await db.query('INSERT INTO accounts(id,user_id,name) VALUES($1,$2,$3)',[foreignAccountId,owner,'Owner account']);
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${scope}',false);`);
  await assert.rejects(db.query('SELECT public.restore_commercial_history($1::jsonb)',[JSON.stringify({
    ...historyPayload,revisions:[{...historyPayload.revisions[0],id:foreignRevisionId}]
  })]));
  await assert.rejects(db.query('SELECT public.restore_commercial_history($1::jsonb)',[JSON.stringify({
    ...historyPayload,parents:[{id:foreignAccountId,user_id:scope,name:'Stolen account'}]
  })]));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_state_revisions WHERE entity_id='restored-condition'")).rows[0].n,1);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
test('failed covered state or revision insert rolls back the entire restore',async()=>{
  const scope=historyPayload.user_id;
  const extension=(statement,mutationId)=>({...historyPayload,
    sources:{...historyPayload.sources,commercial_conditions:[{...historyPayload.sources.commercial_conditions[0],statement}]},
    revisions:[...historyPayload.revisions,{...historyPayload.revisions[0],id:mutationId,
      revision_no:2,mutation_id:mutationId,operation:'update',recorded_at:'2026-09-23T00:00:00Z',
      state:{...historyPayload.revisions[0].state,statement}}]});
  await db.exec("RESET ROLE; ALTER TABLE commercial_conditions ADD CONSTRAINT reject_restored_state CHECK (statement <> 'Blocked'); SET ROLE authenticated;");
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${scope}',false);`);
  await assert.rejects(db.query('SELECT public.restore_commercial_history($1::jsonb)',
    [JSON.stringify(extension('Blocked','bbbbbbbb-1111-4111-8111-111111111111'))]));
  await db.exec("RESET ROLE; ALTER TABLE commercial_conditions DROP CONSTRAINT reject_restored_state; ALTER TABLE commercial_state_revisions ADD CONSTRAINT reject_restored_revision CHECK (state->>'statement' IS DISTINCT FROM 'Rejected'); SET ROLE authenticated;");
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${scope}',false);`);
  await assert.rejects(db.query('SELECT public.restore_commercial_history($1::jsonb)',
    [JSON.stringify(extension('Rejected','bbbbbbbb-2222-4222-8222-222222222222'))]));
  assert.equal((await db.query("SELECT statement FROM commercial_conditions WHERE id='restored-condition'")).rows[0].statement,'Buyer approved');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_state_revisions WHERE entity_id='restored-condition'")).rows[0].n,1);
  await db.exec('RESET ROLE; ALTER TABLE commercial_state_revisions DROP CONSTRAINT reject_restored_revision; SET ROLE authenticated;');
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${scope}',false);`);
  const accepted=extension('Buyer amended','bbbbbbbb-3333-4333-8333-333333333333');
  assert.equal((await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(accepted)])).rows[0].result.status,'restored');
  assert.equal((await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(accepted)])).rows[0].result.status,'no_op');
  assert.equal((await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(historyPayload)])).rows[0].result.status,'diverged');
  assert.equal((await db.query("SELECT statement FROM commercial_conditions WHERE id='restored-condition'")).rows[0].statement,'Buyer amended');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_state_revisions WHERE entity_id='restored-condition'")).rows[0].n,2);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
test('a 300-Opportunity backup restores current rows and original revisions in one call',async()=>{
  const scope='66666666-6666-4666-8666-666666666666';
  await db.exec(`RESET ROLE; INSERT INTO auth.users VALUES ('${scope}'); SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub','${scope}',false);`);
  const sources=Object.fromEntries(['opportunities','commercial_conditions','commercial_evidence',
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'].map(t=>[t,[]]));
  const revisions=[];
  for(let index=0;index<300;index++){
    const suffix=index.toString(16).padStart(12,'0');
    const id=`77777777-7777-4777-8777-${suffix}`;
    const state={id,user_id:scope,account_name:`Account ${index}`,opportunity_name:`Opportunity ${index}`,
      stage:'Qualification',status:'Active',created_at:'2023-01-01T00:00:00Z',updated_at:'2025-09-01T00:00:00Z'};
    sources.opportunities.push(state);
    revisions.push({id:`88888888-8888-4888-8888-${suffix}`,user_id:scope,entity_type:'opportunities',
      entity_id:id,revision_no:1,mutation_id:`99999999-9999-4999-8999-${suffix}`,
      operation:'baseline',recorded_at:'2025-09-01T00:00:00Z',schema_version:1,state});
  }
  const payload={user_id:scope,format_version:10,exported_at:'2025-09-02T00:00:00Z',
    coverage:{user_id:scope,history_guaranteed_from:'2025-09-01T00:00:00Z',schema_version:1,
      lineage_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},revisions,sources};
  const start=performance.now();
  const result=(await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(payload)])).rows[0].result;
  const duration=performance.now()-start;
  assert.equal(result.status,'restored');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM opportunities WHERE user_id=$1',[scope])).rows[0].n,300);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM commercial_state_revisions WHERE user_id=$1',[scope])).rows[0].n,300);
  console.log(`PGlite 300-Opportunity restore: ${duration.toFixed(1)} ms`);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
