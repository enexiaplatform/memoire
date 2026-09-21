import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
let db;
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',opportunity='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const decided='2026-09-01T00:00:00Z',cutoff='2026-09-15T00:00:00Z',finalized='2026-09-16T00:00:00Z';
const basis={version:1,capturedAt:decided,forecast:{verdict:'conditional'},premises:[],blockers:[],openQuestions:[],sourceRecordIds:[]};
const options=[{id:'x',order:1,label:'Ask QA',interventionIntent:'Contact QA',expectedConsequence:'Know status',tradeoffs:''}];
const intervention={id:'i',intent:'Contact QA',targetKind:'opportunity',targetRequirementId:null,expectedChange:'Know status'};
const snapshot={version:1,derivedWithCurrentRules:true,opportunity:{id:opportunity},target:{kind:'opportunity',state:'unavailable'},
  blockers:[],money:[],execution:[],sourceRecordIds:[]};
before(async()=>{db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub',true)::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE accounts(id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(user_id,id));
  CREATE TABLE opportunities(id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),account_id uuid,PRIMARY KEY(user_id,id));
  CREATE TABLE commercial_outcome_requirements(id text NOT NULL,user_id uuid NOT NULL,opportunity_id uuid,PRIMARY KEY(user_id,id));
  CREATE TABLE commercial_commitments(id text NOT NULL,user_id uuid NOT NULL,account_id text,opportunity_id text,PRIMARY KEY(user_id,id));
  CREATE TABLE plan_items(id text NOT NULL,user_id uuid NOT NULL,payload jsonb,PRIMARY KEY(user_id,id));
  GRANT SELECT ON accounts,opportunities,commercial_outcome_requirements,commercial_commitments,plan_items TO authenticated;
  INSERT INTO auth.users VALUES('${owner}'),('${other}');INSERT INTO accounts VALUES('${account}','${owner}');
  INSERT INTO opportunities VALUES('${opportunity}','${owner}','${account}');`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260919150000_commercial_decisions.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260921220000_commercial_decision_observations.sql',import.meta.url),'utf8'));
  await db.exec(`SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
  await db.query(`INSERT INTO commercial_decisions(id,user_id,account_id,opportunity_id,question,context,basis_snapshot,options,selected_option_id,rationale,
    expected_consequence,intervention,execution_links,source_type,decided_at,created_at,updated_at) VALUES('d',$1,$2,$3,'What now?','QA open',$4,$5,'x','QA owns it','Know status',$6,'[]','manual',$7,$7,$7)`,
    [owner,account,opportunity,JSON.stringify(basis),JSON.stringify(options),JSON.stringify(intervention),decided]);
});
after(async()=>{await db?.close();});
const insert=(id='obs',patch={})=>db.query(`INSERT INTO commercial_decision_observations
  (id,user_id,account_id,opportunity_id,decision_id,observation_cutoff,elapsed_days,snapshot,operator_note,source_type,finalized_at,created_at)
  VALUES($1,$2,$3,$4,'d',$5,$6,$7,'Reviewed','manual',$8,$8)`,[id,patch.user||owner,account,opportunity,patch.cutoff||cutoff,patch.days??14,JSON.stringify(snapshot),finalized]);

test('observation enforces Decision scope and exact non-negative horizon',async()=>{
  await insert();const {rows}=await db.query("SELECT elapsed_days,snapshot->'target'->>'state' state FROM commercial_decision_observations WHERE id='obs'");
  assert.deepEqual(rows[0],{elapsed_days:14,state:'unavailable'});
  await assert.rejects(insert('before',{cutoff:'2026-08-31T00:00:00Z',days:0}));
  await assert.rejects(insert('wrong-horizon',{days:13}));
});
test('identical retry is idempotent while any semantic rewrite is refused',async()=>{
  await db.query("UPDATE commercial_decision_observations SET operator_note=operator_note WHERE id='obs'");
  await assert.rejects(db.query("UPDATE commercial_decision_observations SET operator_note='Changed' WHERE id='obs'"));
});
test('RLS prevents cross-owner read and write; anon has no access',async()=>{
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',false);`);
  assert.equal((await db.query('SELECT * FROM commercial_decision_observations')).rows.length,0);
  await assert.rejects(insert('foreign',{user:owner}));
  await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_decision_observations'));
});
