import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
let db;
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const opp='cccccccc-cccc-4ccc-8ccc-cccccccccccc',at='2026-09-21T00:00:00Z';
before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated; INSERT INTO auth.users VALUES ('${owner}'),('${other}');
    CREATE TABLE accounts(id uuid PRIMARY KEY,user_id uuid NOT NULL);
    CREATE TABLE opportunities(id uuid,user_id uuid NOT NULL,account_id uuid,estimated_value numeric,status text,updated_at timestamptz,PRIMARY KEY(user_id,id));
    CREATE TABLE commercial_conditions(id text,user_id uuid NOT NULL,updated_at timestamptz,PRIMARY KEY(user_id,id));
    CREATE TABLE commercial_evidence(id text,user_id uuid NOT NULL,updated_at timestamptz,PRIMARY KEY(user_id,id));
    CREATE TABLE commercial_outcome_requirements(id text,user_id uuid NOT NULL,opportunity_id uuid,lifecycle text,updated_at timestamptz,PRIMARY KEY(user_id,id));
    CREATE TABLE commercial_dependencies(id text,user_id uuid NOT NULL,updated_at timestamptz,PRIMARY KEY(user_id,id));
    CREATE TABLE commercial_timing_assertions(id text,user_id uuid NOT NULL,updated_at timestamptz,PRIMARY KEY(user_id,id));
    CREATE TABLE commercial_commitments(id text,user_id uuid NOT NULL,updated_at timestamptz,PRIMARY KEY(user_id,id));
    CREATE TABLE quotes(user_id uuid NOT NULL,id text NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(user_id,id));
    GRANT SELECT,INSERT,UPDATE,DELETE ON opportunities,commercial_conditions,commercial_evidence,commercial_outcome_requirements,
      commercial_dependencies,commercial_timing_assertions,commercial_commitments,quotes TO authenticated;
    INSERT INTO opportunities VALUES ('${opp}','${owner}',null,1200000000,'Active','${at}');
    INSERT INTO commercial_outcome_requirements VALUES ('req','${owner}','${opp}','active','${at}');
    INSERT INTO quotes VALUES ('${owner}','quote','{"opportunityId":"${opp}","amount":1200000000,"status":"Sent","paymentStatus":"Not due"}');`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260920120000_commercial_state_revisions.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260920130000_commercial_history_restore.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260921190000_commercial_money_gates.sql',import.meta.url),'utf8'));
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
after(async()=>{await db?.close();});
const insert=(id,type,source,patch={})=>db.query(`INSERT INTO commercial_money_gates
  (id,user_id,opportunity_id,money_source_type,money_source_id,requirement_id,basis_kind,basis,lifecycle,created_at,updated_at,source_type)
  VALUES($1,$2,$3,$4,$5,$6,'operator_confirmed_structure',$7,'active',$8,$8,'manual')`,
  [id,patch.user||owner,patch.opportunity||opp,type,source,patch.requirement||'req',patch.basis||'Customer process',at]);

test('database accepts controlled Opportunity and Quote sources and captures revisions',async()=>{
  await insert('g1','opportunity_value',opp);await insert('g2','quote_value','quote');
  const rows=(await db.query("SELECT entity_id,operation FROM commercial_state_revisions WHERE entity_type='commercial_money_gates' ORDER BY entity_id")).rows;
  assert.deepEqual(rows.map(row=>[row.entity_id,row.operation]),[['g1','create'],['g2','create']]);
  const definition=(await db.query("SELECT pg_get_functiondef('public.restore_commercial_history(jsonb)'::regprocedure) AS source")).rows[0].source;
  assert.match(definition,/commercial_money_gates/);
});
test('database refuses unsupported, missing, cross-scope and duplicate active links',async()=>{
  await assert.rejects(insert('bad','invoice','x'));
  await assert.rejects(insert('missing','quote_value','missing'));
  await assert.rejects(insert('foreign','opportunity_value',opp,{user:other}));
  await assert.rejects(insert('duplicate','opportunity_value',opp));
});
test('retirement is immutable and revision failure rolls back canonical state',async()=>{
  await db.query("UPDATE commercial_money_gates SET lifecycle='retired',updated_at='2026-09-22T00:00:00Z' WHERE id='g1'");
  await assert.rejects(db.query("UPDATE commercial_money_gates SET lifecycle='active' WHERE id='g1'"));
  await db.exec("RESET ROLE; ALTER TABLE commercial_state_revisions ADD CONSTRAINT reject_gate_revision CHECK (state->>'basis' IS DISTINCT FROM 'Reject'); SET ROLE authenticated;");
  try{await assert.rejects(insert('rollback','opportunity_value',opp,{basis:'Reject'}));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_money_gates WHERE id='rollback'")).rows[0].n,0);
  }finally{await db.exec('RESET ROLE; ALTER TABLE commercial_state_revisions DROP CONSTRAINT reject_gate_revision; SET ROLE authenticated;');}
});
test('historical restore atomically restores a Gate after its Opportunity and Requirement',async()=>{
  const restoredOpportunity='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const sourceOpportunity={id:restoredOpportunity,user_id:other,account_id:null,estimated_value:5000,status:'Active',updated_at:at};
  const sourceRequirement={id:'restore-req',user_id:other,opportunity_id:restoredOpportunity,lifecycle:'active',updated_at:at};
  const sourceGate={id:'restore-gate',user_id:other,opportunity_id:restoredOpportunity,money_source_type:'opportunity_value',
    money_source_id:restoredOpportunity,requirement_id:'restore-req',basis_kind:'customer_process',basis:'Buyer process',
    lifecycle:'active',created_at:at,updated_at:at,source_type:'manual',source_id:null,source_url:null,source_updated_at:null};
  const sources={opportunities:[sourceOpportunity],commercial_conditions:[],commercial_evidence:[],
    commercial_outcome_requirements:[sourceRequirement],commercial_dependencies:[],commercial_timing_assertions:[],
    commercial_commitments:[],commercial_money_gates:[sourceGate]};
  const revisions=[
    ['aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','opportunities',restoredOpportunity,sourceOpportunity],
    ['aaaaaaaa-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','commercial_outcome_requirements','restore-req',sourceRequirement],
    ['aaaaaaaa-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000003','commercial_money_gates','restore-gate',sourceGate],
  ].map(([id,mutation_id,entity_type,entity_id,state])=>({id,user_id:other,entity_type,entity_id,revision_no:1,
    mutation_id,operation:'create',recorded_at:at,schema_version:1,state}));
  const payload={user_id:other,format_version:10,exported_at:at,parents:[{id:account,user_id:other}],sources,revisions,
    coverage:{user_id:other,history_guaranteed_from:at,schema_version:1,lineage_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}};
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',false);`);
  const result=(await db.query('SELECT public.restore_commercial_history($1::jsonb) AS result',[JSON.stringify(payload)])).rows[0].result;
  assert.equal(result.status,'restored');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_money_gates WHERE id='restore-gate'")).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM commercial_state_revisions WHERE entity_type='commercial_money_gates' AND entity_id='restore-gate'")).rows[0].n,1);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
test('RLS hides another owner and anon has no access',async()=>{
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
  assert.equal((await db.query("SELECT * FROM commercial_money_gates WHERE id='restore-gate'")).rows.length,0);
  await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_money_gates'));
});
