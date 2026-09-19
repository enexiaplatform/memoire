import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let db;
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', opportunity='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const second='dddddddd-dddd-4ddd-8ddd-dddddddddddd', at='2026-09-01T12:00:00Z';
before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub',true)::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.accounts(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id));
    CREATE TABLE public.opportunities(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),account_id uuid,UNIQUE(user_id,id));
    CREATE TABLE public.commercial_commitments(id text NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),account_id text,opportunity_id text,PRIMARY KEY(user_id,id));
    ALTER TABLE accounts ENABLE ROW LEVEL SECURITY; ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
    CREATE POLICY account_owner ON accounts TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
    CREATE POLICY opportunity_owner ON opportunities TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
    GRANT SELECT ON accounts,opportunities,commercial_commitments TO authenticated;
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');
    INSERT INTO accounts VALUES ('${account}','${owner}');
    INSERT INTO opportunities VALUES ('${opportunity}','${owner}','${account}'),('${second}','${owner}','${account}');
    INSERT INTO commercial_commitments VALUES ('promise','${owner}','${account}','${opportunity}');`);
  for(const file of ['20260906090000_commercial_evidence.sql','20260918143518_commercial_conditions.sql','20260919022734_commercial_outcome_requirements.sql','20260919122702_commercial_timing_assertions.sql'])
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  for(const [id,opp] of [['root',opportunity],['leaf',opportunity],['elsewhere',second]])
    await db.query(`INSERT INTO commercial_outcome_requirements(id,user_id,account_id,opportunity_id,expected_outcome,role,lifecycle,created_at,updated_at,source_type)
      VALUES($1,$2,$3,$4,$1,'required_now','active',$5,$5,'manual')`,[id,owner,account,opp,at]);
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
after(async()=>{await db?.close();});
const insert=(id,kind,requirementId,patch={})=>db.query(`INSERT INTO commercial_timing_assertions
  (id,user_id,opportunity_id,requirement_id,kind,basis,lifecycle,duration_days,duration_unit,epistemic,source_kind,source_reference,commitment_id,source_type,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,'Buyer process','active',$6,$7,$8,$9,$10,$11,'manual',$12,$12)`,
  [id,patch.user||owner,patch.opportunity||opportunity,requirementId,kind,patch.days??null,patch.unit??null,
    patch.epistemic??null,patch.sourceKind??null,patch.sourceReference??null,patch.commitmentId??null,at]);

test('timing migration permits scoped target, cited duration, and linked Commitment',async()=>{
  await insert('anchor','target_anchor','root');
  await insert('duration','duration','root',{days:3,unit:'calendar_days',epistemic:'supported',sourceKind:'customer_or_supplier',sourceReference:'Buyer email'});
  await insert('link','commitment_link','leaf',{commitmentId:'promise'});
  assert.equal((await db.query('SELECT id FROM commercial_timing_assertions')).rows.length,3);
});
test('database refuses duplicate targets, invalid durations, foreign scope and ownership',async()=>{
  await assert.rejects(insert('another-anchor','target_anchor','leaf'));
  await assert.rejects(insert('bad-duration','duration','leaf',{days:-1,unit:'calendar_days',epistemic:'assumed',sourceKind:'planning_assumption'}));
  await assert.rejects(insert('uncited','duration','leaf',{days:2,unit:'calendar_days',epistemic:'supported',sourceKind:'contract'}));
  await assert.rejects(insert('cross','target_anchor','elsewhere'));
  await assert.rejects(insert('foreign','target_anchor','leaf',{user:other}));
});
test('retirement preserves assertion history and anon cannot read',async()=>{
  await db.query("UPDATE commercial_timing_assertions SET lifecycle='retired',updated_at='2026-09-02T12:00:00Z' WHERE id='duration'");
  await assert.rejects(db.query("UPDATE commercial_timing_assertions SET duration_days=9 WHERE id='duration'"));
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT * FROM commercial_timing_assertions'));
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
