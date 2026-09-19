import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
let db;
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', foreign='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const opportunity='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const at='2026-09-01T12:00:00.000Z';
const links=[{evidenceId:'own-evidence',assessment:'supports',recordedAt:at}];
before(async()=>{
  db = new PGlite();
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
    INSERT INTO opportunities VALUES ('${opportunity}','${owner}','${account}');`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260906090000_commercial_evidence.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260918143518_commercial_conditions.sql',import.meta.url),'utf8'));
  for (const [id,user,acc] of [['own-evidence',owner,account],['foreign-evidence',other,foreign]]) await db.query(`INSERT INTO commercial_evidence(id,user_id,account_id,category,evidence_text,observed_at) VALUES($1,$2,$3,'technical_outcome','Customer statement','2026-08-01')`,[id,user,acc]);
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
});
after(async()=>{await db?.close();});
async function insert(id,patch={}) {
  const p={user:owner,account,opportunity,links,...patch};
  return db.query(`INSERT INTO commercial_conditions(id,user_id,account_id,opportunity_id,statement,condition_category,intent,lifecycle,created_at,updated_at,source_type,evidence_links)
    VALUES($1,$2,$3,$4,'Budget is approved.','financial','hypothesis','active',$5,$5,'manual',$6)`,[id,p.user,p.account,p.opportunity,at,JSON.stringify(p.links)]);
}
test('actual migration accepts owned scope, evidence references and account-level propositions',async()=>{
  await insert('owned'); await insert('account-level',{opportunity:null,links:[]});
  assert.equal((await db.query('SELECT * FROM commercial_conditions')).rows.length,2);
});
test('RLS and composite foreign keys refuse foreign ownership and foreign scope',async()=>{
  await assert.rejects(insert('foreign-owner',{user:other,account:foreign,opportunity:null,links:[]}));
  await assert.rejects(insert('foreign-account',{account:foreign,opportunity:null,links:[]}));
});
test('database rejects cross-tenant and missing evidence, invalid assessment and invented supersession',async()=>{
  for (const link of [{...links[0],evidenceId:'foreign-evidence'},{...links[0],evidenceId:'missing'},{...links[0],assessment:'certain'},{...links[0],evidenceText:'copied assertion'},{...links[0],supersedesEvidenceId:'missing'}]) await assert.rejects(insert('bad-link',{links:[link]}));
});
test('updates cannot reassign tenant, rewrite proposition, or erase evidence history',async()=>{
  await assert.rejects(db.query('UPDATE commercial_conditions SET user_id=$1 WHERE id=$2',[other,'owned']));
  await assert.rejects(db.query("UPDATE commercial_conditions SET statement='Different proposition' WHERE id='owned'"));
  await assert.rejects(db.query("UPDATE commercial_conditions SET evidence_links='[]' WHERE id='owned'"));
  await assert.rejects(db.query("DELETE FROM commercial_conditions WHERE id='owned'"));
});
test('retirement works but cannot be revived; another tenant cannot read or change it',async()=>{
  await db.query("UPDATE commercial_conditions SET lifecycle='retired',updated_at='2026-09-02' WHERE id='owned'");
  await assert.rejects(db.query("UPDATE commercial_conditions SET lifecycle='active' WHERE id='owned'"));
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',false)`);
  assert.equal((await db.query('SELECT * FROM commercial_conditions')).rows.length,0);
  assert.equal((await db.query("UPDATE commercial_conditions SET intent='assumed' WHERE id='owned' RETURNING id")).rows.length,0);
});

test('anonymous role has no table access or reference-check execute privilege',async()=>{
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT * FROM commercial_conditions'));
  await assert.rejects(db.query("SELECT public.valid_condition_evidence('[]'::jsonb,'11111111-1111-4111-8111-111111111111'::uuid,'a',null)"));
});
