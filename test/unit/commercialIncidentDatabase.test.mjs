import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSupabaseCompatibleDatabase,applyMigrations,productionMigrations,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
const tables=['opportunities','commercial_conditions','commercial_evidence','commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents'],migration='20260929010336_commercial_incidents.sql';
let db,legacyPayload,legacyMarker,existingPolicy,existingHistory,existingCoverage;
const restore=async(database,payload)=>(await database.query('SELECT restore_commercial_history($1::jsonb) AS result',[JSON.stringify(payload)])).rows[0].result;
before(async()=>{
 db=await createSupabaseCompatibleDatabase();const files=productionMigrations();await applyMigrations(db,files.slice(0,files.indexOf(migration)));
 const owner=randomUUID();await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[owner,`${owner}@example.test`]);await setAuthenticatedOwner(db,owner);
 legacyPayload={user_id:owner,format_version:12,exported_at:'2026-09-29T00:00:00Z',coverage:null,revisions:[],parents:[],sources:Object.fromEntries(tables.filter(t=>t!=='commercial_incidents').map(t=>[t,[]]))};
  await restore(db,legacyPayload);legacyMarker=(await db.query('SELECT * FROM commercial_history_coverage')).rows[0];
 existingPolicy=await fixture();existingHistory=(await db.query('SELECT * FROM commercial_state_revisions ORDER BY id')).rows;
 existingCoverage=(await db.query('SELECT * FROM commercial_history_coverage')).rows;
 await db.exec('RESET ROLE');await applyMigrations(db,[migration]);
});after(async()=>db?.close());
async function fixture(){
 const owner=randomUUID(),account=randomUUID(),opp=randomUUID();
 await db.exec('RESET ROLE');await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[owner,`${owner}@example.test`]);await setAuthenticatedOwner(db,owner);
 await db.query("INSERT INTO accounts(id,user_id,name,account_name) VALUES($1,$2,'Incident','Incident')",[account,owner]);
 await db.query("INSERT INTO opportunities(id,user_id,account_id,title,opportunity_name,stage,status) VALUES($1,$2,$3,'Incident','Incident','Proposal','Active')",[opp,owner,account]);
 await db.query("INSERT INTO commercial_outcome_requirements(id,user_id,account_id,opportunity_id,expected_outcome,role,lifecycle,source_type,created_at,updated_at) VALUES('r',$1,$2,$3,'Finance approval','required_now','active','manual',now(),now())",[owner,account,opp]);
 await db.query("INSERT INTO commercial_policies(id,user_id,opportunity_id,version,title,rationale,requirement_id,applies_when,amount,currency,lifecycle,source_type,created_at,updated_at) VALUES('p',$1,$2,1,'Finance approval','Explicit review rule','r','always',null,null,'active','manual',now(),now())",[owner,opp]);
 const raw=(await db.query('SELECT * FROM commercial_policies')).rows[0];
 const policy=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),value]));
 policy.createdAt=new Date(policy.createdAt).toISOString();policy.updatedAt=new Date(policy.updatedAt).toISOString();
 const at=new Date().toISOString(),basis={version:1,capturedAt:at,policy,reason:'Required outcome unresolved',sourceRecordIds:['p',opp,'r']};
 return {owner,opp,at,basis};
}
const insert=(f,patch={})=>db.query(`INSERT INTO commercial_incidents(id,user_id,opportunity_id,policy_id,version,summary,material_impact,coordinator,response_note,status,disposition,basis_snapshot,source_type,created_at,updated_at,closed_at)
 VALUES($1,$2,$3,'p',1,'Review delayed','Finance and sales must coordinate','Named coordinator','','open',null,$4,'manual',$5,$5,null)`,[patch.id||'i',patch.owner||f.owner,patch.opp||f.opp,patch.basis||f.basis,f.at]);
test('upgrade preserves format-12 coverage and retry lineage with or without the new empty source',async()=>{
 await setAuthenticatedOwner(db,legacyPayload.user_id);assert.equal((await restore(db,legacyPayload)).status,'no_op');
 assert.equal((await restore(db,{...legacyPayload,sources:{...legacyPayload.sources,commercial_incidents:[]}})).status,'no_op');
 assert.deepEqual((await db.query('SELECT * FROM commercial_history_coverage')).rows[0],legacyMarker);
});
test('upgrade preserves populated M12 policy state, original revisions and coverage before the first incident',async()=>{
 await setAuthenticatedOwner(db,existingPolicy.owner);
 assert.equal((await db.query('SELECT version FROM commercial_policies')).rows[0].version,1);
 assert.deepEqual((await db.query('SELECT * FROM commercial_history_coverage')).rows,existingCoverage);
 assert.deepEqual((await db.query('SELECT * FROM commercial_state_revisions ORDER BY id')).rows,existingHistory);
 assert.equal((await db.query('SELECT count(*)::int n FROM commercial_incidents')).rows[0].n,0);
 await insert(existingPolicy);
 assert.equal((await db.query("SELECT count(*)::int n FROM commercial_state_revisions WHERE entity_type='commercial_incidents'")).rows[0].n,1);
});
test('one open incident per policy and accepted opening basis are enforced',async()=>{
 const f=await fixture();await insert(f);await assert.rejects(insert(f,{id:'duplicate'}),/unique constraint/i);
 assert.equal((await db.query("SELECT count(*)::int n FROM commercial_state_revisions WHERE entity_type='commercial_incidents'")).rows[0].n,1);
 const other=await fixture();await assert.rejects(insert(other,{basis:{...other.basis,policy:{...other.basis.policy,title:'Invented rule'}}}),/accepted policy history/i);
 await assert.rejects(insert(other,{basis:{...other.basis,policy:{...other.basis.policy,isSample:true}}}),/basis/i);
});
test('opening basis is immutable, versions are consecutive, and closed history cannot be rewritten',async()=>{
 const f=await fixture();await insert(f);
 await assert.rejects(db.query("UPDATE commercial_incidents SET version=2,material_impact='Rewrite opening',updated_at=clock_timestamp() WHERE id='i'"),/opening basis/i);
 await assert.rejects(db.query("UPDATE commercial_incidents SET version=3,response_note='Skip version',updated_at=clock_timestamp() WHERE id='i'"),/version conflict/i);
 // Closing and updating describe the same transition; use one stable statement time.
 await db.query("UPDATE commercial_incidents SET version=2,response_note='Coordination no longer needed',status='closed',disposition='dismissed',closed_at=statement_timestamp(),updated_at=statement_timestamp() WHERE id='i'");
 await assert.rejects(db.query("UPDATE commercial_incidents SET version=3,response_note='Rewrite closure',updated_at=clock_timestamp() WHERE id='i'"),/closed history/i);
 assert.deepEqual((await db.query("SELECT state->>'status' status FROM commercial_state_revisions WHERE entity_type='commercial_incidents' ORDER BY revision_no")).rows.map(r=>r.status),['open','closed']);
});
test('required Revision failure rolls back incident response',async()=>{
 const f=await fixture();await insert(f);
 await db.exec("RESET ROLE; ALTER TABLE commercial_state_revisions ADD CONSTRAINT reject_incident_revision CHECK(entity_type<>'commercial_incidents' OR state->>'response_note'<>'Reject');");await setAuthenticatedOwner(db,f.owner);
 try{await assert.rejects(db.query("UPDATE commercial_incidents SET version=2,response_note='Reject',updated_at=clock_timestamp() WHERE id='i'"));
  assert.equal((await db.query('SELECT version FROM commercial_incidents')).rows[0].version,1);
 }finally{await db.exec('RESET ROLE; ALTER TABLE commercial_state_revisions DROP CONSTRAINT reject_incident_revision;');}
});
test('RLS denies cross-owner and anonymous operations, direct deletion and fake restore context',async()=>{
 const a=await fixture();await insert(a);const b=await fixture();await insert(b);
 assert.deepEqual((await db.query('SELECT user_id FROM commercial_incidents')).rows.map(r=>r.user_id),[b.owner]);
 assert.equal((await db.query('UPDATE commercial_incidents SET version=2 WHERE user_id=$1 RETURNING id',[a.owner])).rows.length,0);
 await assert.rejects(insert(b,{id:'foreign',owner:a.owner}),/owner mismatch|scope|row-level/i);
 await assert.rejects(db.query('DELETE FROM commercial_incidents'),/permission denied/i);
 await assert.rejects(db.query('INSERT INTO commercial_history_restore_context(transaction_id,user_id) VALUES(txid_current(),$1)',[b.owner]),/permission denied/i);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_incidents'),/permission denied/i);
});
test('format 13 restores an old opening policy version after that policy was revised and the incident closed',async()=>{
 const f=await fixture();await insert(f);
 await db.query("UPDATE commercial_policies SET version=2,title='Later policy',updated_at=clock_timestamp() WHERE id='p'");
 await db.query("UPDATE commercial_incidents SET version=2,response_note='Superseded coordination',status='closed',disposition='dismissed',closed_at=statement_timestamp(),updated_at=statement_timestamp() WHERE id='i'");
 const sources={};for(const table of tables)sources[table]=(await db.query(`SELECT * FROM ${table}`)).rows;
 const payload={user_id:f.owner,format_version:13,exported_at:new Date().toISOString(),sources,parents:(await db.query('SELECT * FROM accounts')).rows,
  coverage:(await db.query('SELECT * FROM commercial_history_coverage')).rows[0],revisions:(await db.query('SELECT * FROM commercial_state_revisions')).rows};
 const target=await createSupabaseCompatibleDatabase();try{
  await applyMigrations(target);await target.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[f.owner,`${f.owner}@example.test`]);await setAuthenticatedOwner(target,f.owner);
  assert.equal((await restore(target,payload)).status,'restored');assert.equal((await restore(target,payload)).status,'no_op');
  assert.deepEqual((await target.query('SELECT * FROM commercial_incidents')).rows,sources.commercial_incidents);
  assert.equal((await target.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n,payload.revisions.length);
 }finally{await target.close();}
});
