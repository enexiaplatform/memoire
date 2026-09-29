import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSupabaseCompatibleDatabase,applyMigrations,productionMigrations,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
let db,legacyOwner,legacyPayload,legacyMarker;
const migration='20260928161744_commercial_policies.sql';
const tables=['opportunities','commercial_conditions','commercial_evidence','commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies'];
const restore=async(database,payload)=>(await database.query('SELECT restore_commercial_history($1::jsonb) AS result',[JSON.stringify(payload)])).rows[0].result;
before(async()=>{
 db=await createSupabaseCompatibleDatabase();const files=productionMigrations();await applyMigrations(db,files.slice(0,files.indexOf(migration)));
 legacyOwner=randomUUID();await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[legacyOwner,`${legacyOwner}@example.test`]);await setAuthenticatedOwner(db,legacyOwner);
 legacyPayload={user_id:legacyOwner,format_version:11,exported_at:'2026-09-28T00:00:00Z',coverage:null,revisions:[],sources:Object.fromEntries(tables.filter(t=>t!=='commercial_policies').map(t=>[t,[]])),parents:[]};
 assert.equal((await restore(db,legacyPayload)).status,'restored');legacyMarker=(await db.query('SELECT * FROM commercial_history_coverage')).rows[0];
 await db.exec('RESET ROLE');await applyMigrations(db,[migration]);
});
after(async()=>db?.close());
async function fixture(){
 const owner=randomUUID(),account=randomUUID(),opp=randomUUID();
 await db.exec('RESET ROLE');await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[owner,`${owner}@example.test`]);await setAuthenticatedOwner(db,owner);
 await db.query("INSERT INTO accounts(id,user_id,name,account_name) VALUES($1,$2,'Policy','Policy')",[account,owner]);
 await db.query("INSERT INTO opportunities(id,user_id,account_id,title,opportunity_name,stage,status,estimated_value) VALUES($1,$2,$3,'Policy','Policy','Proposal','Active',600000000)",[opp,owner,account]);
 await db.query("INSERT INTO commercial_outcome_requirements(id,user_id,account_id,opportunity_id,expected_outcome,role,lifecycle,source_type,created_at,updated_at) VALUES('r',$1,$2,$3,'Finance approval','required_now','active','manual',now(),now())",[owner,account,opp]);
 return {owner,account,opp};
}
const insert=(f,patch={})=>db.query(`INSERT INTO commercial_policies(id,user_id,opportunity_id,version,title,rationale,requirement_id,applies_when,amount,currency,lifecycle,source_type,created_at,updated_at)
 VALUES($1,$2,$3,$4,'Finance rule','Human published rationale',$5,'value_above',$6,'VND','active','manual',now(),now())`,[patch.id||'p',patch.owner||f.owner,patch.opp||f.opp,patch.version||1,patch.requirement||'r',patch.amount??500000000]);
test('additive upgrade preserves legacy lineage and exact legacy retries, including the current service payload',async()=>{
 await setAuthenticatedOwner(db,legacyOwner);assert.equal((await restore(db,legacyPayload)).status,'no_op');
 assert.equal((await restore(db,{...legacyPayload,sources:{...legacyPayload.sources,commercial_policies:[]}})).status,'no_op');
 assert.deepEqual((await db.query('SELECT * FROM commercial_history_coverage')).rows[0],legacyMarker);
});
test('database versions are consecutive, scope checked and captured in the existing Revision chain',async()=>{
 const f=await fixture();await insert(f);
 await db.query("UPDATE commercial_policies SET version=2,title='Revised rule',rationale='Human revised',updated_at=clock_timestamp() WHERE id='p'");
 await assert.rejects(db.query("UPDATE commercial_policies SET version=2,title='Silent rewrite',updated_at=clock_timestamp() WHERE id='p'"),/version conflict/);
 await assert.rejects(insert(f,{id:'bad',version:4}),/version 1/);
 await assert.rejects(insert(f,{id:'bad',requirement:'missing'}),/scope/);
 await assert.rejects(insert(f,{id:'bad',amount:'NaN'}),/check constraint/);
 assert.deepEqual((await db.query("SELECT state->>'version' AS version FROM commercial_state_revisions WHERE entity_type='commercial_policies' ORDER BY revision_no")).rows.map(r=>r.version),['1','2']);
});
test('a required Revision failure rolls back the policy version',async()=>{
 const f=await fixture();await insert(f);
 await db.exec("RESET ROLE; ALTER TABLE commercial_state_revisions ADD CONSTRAINT reject_policy_revision CHECK (entity_type<>'commercial_policies' OR state->>'title'<>'Reject revision');");
 await setAuthenticatedOwner(db,f.owner);
 try{await assert.rejects(db.query("UPDATE commercial_policies SET version=2,title='Reject revision',updated_at=clock_timestamp() WHERE id='p'"));
  assert.equal((await db.query("SELECT version FROM commercial_policies WHERE id='p'")).rows[0].version,1);
 }finally{await db.exec('RESET ROLE; ALTER TABLE commercial_state_revisions DROP CONSTRAINT reject_policy_revision;');}
});
test('two-owner RLS, immutable identity, anonymous access and hard-delete denial hold',async()=>{
 const a=await fixture();await insert(a);const b=await fixture();await insert(b);
 assert.deepEqual((await db.query('SELECT user_id FROM commercial_policies')).rows.map(row=>row.user_id),[b.owner]);
 assert.equal((await db.query("UPDATE commercial_policies SET version=2,title='Forged',updated_at=clock_timestamp() WHERE user_id=$1 RETURNING id",[a.owner])).rows.length,0);
 await assert.rejects(insert(b,{id:'forged',owner:a.owner}),/scope|row-level|owner mismatch/i);
 await assert.rejects(db.query('DELETE FROM commercial_policies'),/permission denied/i);
 await assert.rejects(db.query("UPDATE commercial_policies SET version=2,opportunity_id=$1,updated_at=clock_timestamp() WHERE id='p'",[a.opp]));
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_policies'),/permission denied/i);
});
test('format 12 restores policy current state and all original versions atomically into an empty account',async()=>{
 const f=await fixture();await insert(f);await db.query("UPDATE commercial_policies SET version=2,lifecycle='retired',rationale='No longer applies',updated_at=clock_timestamp() WHERE id='p'");
 const sources={};for(const table of tables)sources[table]=(await db.query(`SELECT * FROM ${table}`)).rows;
 const payload={user_id:f.owner,format_version:12,exported_at:new Date().toISOString(),sources,parents:(await db.query('SELECT * FROM accounts')).rows,
  revisions:(await db.query('SELECT * FROM commercial_state_revisions')).rows,coverage:(await db.query('SELECT * FROM commercial_history_coverage')).rows[0]};
 const target=await createSupabaseCompatibleDatabase();
 try{await applyMigrations(target);await target.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[f.owner,`${f.owner}@example.test`]);await setAuthenticatedOwner(target,f.owner);
  assert.equal((await restore(target,payload)).status,'restored');assert.equal((await restore(target,payload)).status,'no_op');
  assert.deepEqual((await target.query('SELECT * FROM commercial_policies')).rows,sources.commercial_policies);
  assert.equal((await target.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n,payload.revisions.length);
  assert.deepEqual((await target.query("SELECT state->>'version' version FROM commercial_state_revisions WHERE entity_type='commercial_policies' ORDER BY revision_no")).rows.map(row=>row.version),['1','2']);
 }finally{await target.close();}
});
