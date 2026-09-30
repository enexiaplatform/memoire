import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createSupabaseCompatibleDatabase,applyMigrations,productionMigrations,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
let db,owner,other,legacy;
const migration='20260929151456_external_observation_receipts.sql';
const observation={schemaVersion:1,sourceKind:'crm',sourceNamespace:'CRM workspace',sourceEventId:'42',sourceVersion:'1',observedAt:'2026-09-01T00:00:00Z',summary:'Reported change',rawText:'Unaccepted source statement'};
const id='observation:'+'a'.repeat(64);
const insert=(database,user,eventId=id,body=observation)=>database.query(`INSERT INTO commercial_events(id,user_id,event_type,occurred_at,recorded_at,created_at,summary,structured_payload,idempotency_key,source_type,source_id)
 VALUES($1,$2,'external_observation_received','2026-09-29T00:00:00Z','2026-09-29T00:00:00Z','2026-09-29T00:00:00Z',$3,$4,$1,$5,$6)`,[eventId,user,'Source observation received: '+body.summary,body,body.sourceKind,body.sourceEventId]);
before(async()=>{db=await createSupabaseCompatibleDatabase();const files=productionMigrations();await applyMigrations(db,files.slice(0,files.indexOf(migration)));owner=randomUUID();other=randomUUID();for(const user of [owner,other])await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[user,user+'@example.test']);await setAuthenticatedOwner(db,owner);
 await db.query("INSERT INTO commercial_events(id,user_id,event_type,summary) VALUES('legacy',$1,'activity_captured','Existing event')",[owner]);legacy=(await db.query("SELECT * FROM commercial_events WHERE id='legacy'")).rows[0];await db.exec('RESET ROLE');await applyMigrations(db,[migration]);await setAuthenticatedOwner(db,owner);});
after(async()=>db?.close());
test('upgrade preserves ordinary events and receipts add no commercial State Revision',async()=>{
 assert.deepEqual((await db.query("SELECT * FROM commercial_events WHERE id='legacy'")).rows[0],legacy);await insert(db,owner);
 assert.equal((await db.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n,0);
});
test('same-content retry preserves first receipt time while content, identity and deletion are protected',async()=>{
 const before=(await db.query('SELECT * FROM commercial_events WHERE id=$1',[id])).rows[0];
 await db.query('UPDATE commercial_events SET occurred_at=clock_timestamp(),recorded_at=clock_timestamp(),created_at=clock_timestamp() WHERE id=$1',[id]);assert.deepEqual((await db.query('SELECT * FROM commercial_events WHERE id=$1',[id])).rows[0],before);
 await assert.rejects(db.query("UPDATE commercial_events SET structured_payload=jsonb_set(structured_payload,'{rawText}','\"Altered\"') WHERE id=$1",[id]),/immutable/);
 await assert.rejects(db.query('DELETE FROM commercial_events WHERE id=$1',[id]),/cannot be deleted/);
 await assert.rejects(insert(db,owner,'observation:'+'b'.repeat(64)),/unique/);
});
test('receipt schema and absence of canonical subject links are enforced by the database',async()=>{
 await assert.rejects(insert(db,owner,'observation:'+'c'.repeat(64),{...observation,sourceVersion:'bad',accepted:true}),/Invalid/);
 await assert.rejects(db.query("UPDATE commercial_events SET event_type='external_observation_received' WHERE id='legacy'"),/immutable/);
 await assert.rejects(insert(db,owner,'observation:'+'d'.repeat(64),{...observation,sourceVersion:'large',rawText:'x'.repeat(20001)}),/Invalid/);
});
test('two-owner RLS and anonymous denial apply to observations just as to the existing log',async()=>{
 await setAuthenticatedOwner(db,other);assert.equal((await db.query('SELECT * FROM commercial_events')).rows.length,0);await insert(db,other);
 assert.equal((await db.query('SELECT * FROM commercial_events')).rows.length,1);await assert.rejects(insert(db,owner,'observation:'+'e'.repeat(64),{...observation,sourceVersion:'foreign'}),/row-level/);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_events'),/permission denied/);await setAuthenticatedOwner(db,owner);
});
test('same receipt can be restored idempotently from an export through the actual table contract',async()=>{
 const row=(await db.query('SELECT * FROM commercial_events WHERE id=$1',[id])).rows[0],target=await createSupabaseCompatibleDatabase();
 try{await applyMigrations(target);await target.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[owner,owner+'@example.test']);await setAuthenticatedOwner(target,owner);
 const columns=Object.keys(row),values=Object.values(row),updates=columns.filter(c=>!['id','user_id'].includes(c)).map(c=>c+'=EXCLUDED.'+c).join(',');
 const query='INSERT INTO commercial_events('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+') ON CONFLICT(user_id,id) DO UPDATE SET '+updates;
 await target.query(query,values);await target.query(query,values);assert.deepEqual((await target.query('SELECT * FROM commercial_events')).rows,[row]);
 }finally{await target.close();}
});
