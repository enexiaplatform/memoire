import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
let db;
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', opportunity='cccccccc-cccc-4ccc-8ccc-cccccccccccc', second='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
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
    INSERT INTO accounts VALUES ('${account}','${owner}');
    INSERT INTO opportunities VALUES ('${opportunity}','${owner}','${account}'),('${second}','${owner}','${account}');`);
  for(const file of ['20260906090000_commercial_evidence.sql','20260918143518_commercial_conditions.sql','20260919022734_commercial_outcome_requirements.sql','20260919064803_commercial_dependencies.sql'])
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  for(const [id,opp] of [['a',opportunity],['b',opportunity],['c',opportunity],['elsewhere',second]])
    await db.query(`INSERT INTO commercial_outcome_requirements(id,user_id,account_id,opportunity_id,expected_outcome,role,lifecycle,created_at,updated_at,source_type) VALUES($1,$2,$3,$4,$1,'required_now','active',$5,$5,'manual')`,[id,owner,account,opp,at]);
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
after(async()=>{await db?.close();});
const insert=(id,dependent,prerequisite,patch={})=>db.query(`INSERT INTO commercial_dependencies(id,user_id,opportunity_id,dependent_requirement_id,prerequisite_requirement_id,basis,lifecycle,created_at,updated_at,source_type)
  VALUES($1,$2,$3,$4,$5,$6,'active',$7,$7,'manual')`,[id,patch.user||owner,patch.opportunity||opportunity,dependent,prerequisite,patch.basis||'Needed for decision',at]);
test('migration creates owner-scoped edges with provenance and an explicit unknown evidence actor',async()=>{
  await insert('ab','a','b');await insert('bc','b','c');
  assert.equal((await db.query('SELECT id FROM commercial_dependencies')).rows.length,2);
  const column=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='commercial_evidence' AND column_name='provided_by'")).rows;
  assert.equal(column.length,1);
});
test('same-opportunity, self, duplicate, cycle, and foreign-owner writes are refused by database',async()=>{
  await assert.rejects(insert('self','a','a'));
  await assert.rejects(insert('duplicate','a','b'));
  await assert.rejects(insert('cycle','c','a'));
  await assert.rejects(insert('cross','a','elsewhere'));
  await assert.rejects(insert('foreign','a','b',{user:other}));
});
test('retired history cannot be rewritten and anonymous reads are denied',async()=>{
  await db.query("UPDATE commercial_dependencies SET lifecycle='retired',updated_at='2026-09-02T12:00:00Z' WHERE id='ab'");
  await assert.rejects(db.query("UPDATE commercial_dependencies SET basis='changed' WHERE id='ab'"));
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT * FROM commercial_dependencies'));
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
