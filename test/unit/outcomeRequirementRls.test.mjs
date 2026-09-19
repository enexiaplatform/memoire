import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
let db;
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', foreign='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const opportunity='cccccccc-cccc-4ccc-8ccc-cccccccccccc', second='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const at='2026-09-01T12:00:00.000Z';
before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub',true)::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.accounts(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id));
    CREATE TABLE public.opportunities(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),account_id uuid);
    ALTER TABLE accounts ENABLE ROW LEVEL SECURITY; ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
    CREATE POLICY account_owner ON accounts TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
    CREATE POLICY opportunity_owner ON opportunities TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
    GRANT SELECT ON accounts,opportunities TO authenticated;
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');
    INSERT INTO accounts VALUES ('${account}','${owner}'),('${foreign}','${other}');
    INSERT INTO opportunities VALUES ('${opportunity}','${owner}','${account}'),('${second}','${owner}','${account}');`);
  for(const file of ['20260906090000_commercial_evidence.sql','20260918143518_commercial_conditions.sql','20260919022734_commercial_outcome_requirements.sql'])
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  await db.exec(`INSERT INTO commercial_conditions(id,user_id,account_id,statement,condition_category,intent,lifecycle,created_at,updated_at,source_type)
    VALUES ('account-condition','${owner}','${account}','Budget approved','financial','assumed','active','${at}','${at}','manual');
    INSERT INTO commercial_conditions(id,user_id,account_id,opportunity_id,statement,condition_category,intent,lifecycle,created_at,updated_at,source_type)
    VALUES ('opportunity-condition','${owner}','${account}','${opportunity}','QA accepted','technical','assumed','active','${at}','${at}','manual');
    SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
after(async()=>{await db?.close();});
async function insert(id,patch={}) {
  const p={user:owner,account,opportunity,condition:null,role:'required_now',...patch};
  return db.query(`INSERT INTO commercial_outcome_requirements(id,user_id,account_id,opportunity_id,expected_outcome,question,condition_id,role,lifecycle,created_at,updated_at,source_type)
    VALUES($1,$2,$3,$4,'Know final approver','Who approves?', $5,$6,'active',$7,$7,'manual')`,[id,p.user,p.account,p.opportunity,p.condition,p.role,at]);
}
test('actual migration accepts unknown and scoped account-level or opportunity Conditions',async()=>{
  await insert('unknown');await insert('shared',{condition:'account-condition'});await insert('same',{condition:'opportunity-condition'});
  await insert('second-shared',{opportunity:second,condition:'account-condition'});
  assert.equal((await db.query('SELECT id FROM commercial_outcome_requirements')).rows.length,4);
});
test('RLS, composite keys and scope trigger refuse foreign owner, account and wrong-opportunity Condition',async()=>{
  await assert.rejects(insert('foreign-owner',{user:other,account:foreign}));
  await assert.rejects(insert('foreign-account',{account:foreign}));
  await assert.rejects(insert('wrong-opportunity',{opportunity:second,condition:'opportunity-condition'}));
  await assert.rejects(insert('invalid-role',{role:'blocking'}));
});
test('role and condition can change, but definition, owner, and retired record cannot be rewritten',async()=>{
  await db.query("UPDATE commercial_outcome_requirements SET role='required_later',condition_id='account-condition' WHERE id='unknown'");
  await assert.rejects(db.query("UPDATE commercial_outcome_requirements SET expected_outcome='Other outcome' WHERE id='unknown'"));
  await assert.rejects(db.query('UPDATE commercial_outcome_requirements SET user_id=$1 WHERE id=$2',[other,'unknown']));
  await db.query("UPDATE commercial_outcome_requirements SET lifecycle='retired' WHERE id='unknown'");
  await assert.rejects(db.query("UPDATE commercial_outcome_requirements SET role='context' WHERE id='unknown'"));
  await assert.rejects(db.query("DELETE FROM commercial_outcome_requirements WHERE id='unknown'"));
});
