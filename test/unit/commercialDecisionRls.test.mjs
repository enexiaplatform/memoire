import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let db;
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',opportunity='cccccccc-cccc-4ccc-8ccc-cccccccccccc',elsewhere='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const at='2026-09-19T12:00:00Z';
const basis={version:1,capturedAt:at,forecast:{verdict:'conditional',claim:null,timingEvaluation:'incomplete',reasonCodes:[]},premises:[],blockers:[],openQuestions:[],nextQuestion:null,timing:null,sourceRecordIds:[]};
const options=[{id:'a',order:1,label:'Wait',interventionIntent:'Wait for QA',expectedConsequence:'QA may reply',tradeoffs:''},
  {id:'b',order:2,label:'Escalate',interventionIntent:'Resolve QA acceptance',expectedConsequence:'Know acceptance status',tradeoffs:'Needs director time'}];
const intervention={id:'intervention',intent:'Resolve QA acceptance',targetKind:'opportunity',targetRequirementId:null,expectedChange:'Know acceptance status'};
before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub',true)::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.accounts(id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(user_id,id));
    CREATE TABLE public.opportunities(id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),account_id uuid,PRIMARY KEY(user_id,id));
    CREATE TABLE public.commercial_outcome_requirements(id text NOT NULL,user_id uuid NOT NULL,opportunity_id uuid,PRIMARY KEY(user_id,id));
    CREATE TABLE public.commercial_commitments(id text NOT NULL,user_id uuid NOT NULL,account_id text,opportunity_id text,PRIMARY KEY(user_id,id));
    CREATE TABLE public.plan_items(id text NOT NULL,user_id uuid NOT NULL,payload jsonb,PRIMARY KEY(user_id,id));
    GRANT SELECT ON accounts,opportunities,commercial_outcome_requirements,commercial_commitments,plan_items TO authenticated;
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');
    INSERT INTO accounts VALUES ('${account}','${owner}');
    INSERT INTO opportunities VALUES ('${opportunity}','${owner}','${account}'),('${elsewhere}','${owner}','${account}');
    INSERT INTO commercial_commitments VALUES ('promise','${owner}','${account}','${opportunity}');
    INSERT INTO plan_items VALUES ('plan','${owner}','{"linkedOpportunityId":"${opportunity}"}');`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260919150000_commercial_decisions.sql',import.meta.url),'utf8'));
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
after(async()=>{await db?.close();});
const insert=(id,patch={})=>db.query(`INSERT INTO commercial_decisions
  (id,user_id,account_id,opportunity_id,question,context,basis_snapshot,options,selected_option_id,rationale,expected_consequence,
   intervention,execution_links,supersedes_decision_id,source_type,decided_at,created_at,updated_at)
   VALUES($1,$2,$3,$4,'What now?','QA is open',$5,$6,$7,'Director owns QA',$8,$9,'[]',$10,'manual',$11,$11,$11)`,
  [id,patch.user||owner,account,patch.opportunity||opportunity,JSON.stringify(basis),JSON.stringify(patch.options||options),
    patch.selected||'b',patch.expected||'Know acceptance status',JSON.stringify(intervention),patch.supersedes||null,at]);

test('one insert preserves all Options, selected Intervention and basis; supersession leaves history',async()=>{
  await insert('first');await insert('second',{supersedes:'first'});
  const {rows}=await db.query('SELECT id,options,selected_option_id,basis_snapshot,supersedes_decision_id FROM commercial_decisions ORDER BY id');
  assert.equal(rows.length,2);assert.equal(rows[0].options.length,2);assert.equal(rows[0].selected_option_id,'b');
  assert.equal(rows[0].basis_snapshot.forecast.verdict,'conditional');assert.equal(rows[1].supersedes_decision_id,'first');
  await assert.rejects(db.query("UPDATE commercial_decisions SET rationale='Changed' WHERE id='first'"));
});
test('invalid selection, cross-Opportunity supersession and cross-user rows are refused',async()=>{
  await assert.rejects(insert('bad-option',{selected:'missing'}));
  await assert.rejects(insert('bad-consequence',{expected:'Different'}));
  await assert.rejects(insert('bad-scope',{opportunity:elsewhere,supersedes:'first'}));
  await assert.rejects(insert('foreign',{user:other}));
});
test('execution links are append-only and scoped to existing work; anon has no access',async()=>{
  await db.query(`UPDATE commercial_decisions SET execution_links=$1,updated_at=$2 WHERE id='first'`,
    [JSON.stringify([{kind:'action',recordId:'plan',linkedAt:at}]),'2026-09-20T12:00:00Z']);
  await assert.rejects(db.query("UPDATE commercial_decisions SET execution_links='[]' WHERE id='first'"));
  await assert.rejects(db.query(`UPDATE commercial_decisions SET execution_links=$1 WHERE id='first'`,
    [JSON.stringify([{kind:'action',recordId:'plan',linkedAt:at},{kind:'commitment',recordId:'missing',linkedAt:at}])]));
  await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_decisions'));
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
