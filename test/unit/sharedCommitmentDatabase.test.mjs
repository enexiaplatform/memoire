import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createSupabaseCompatibleDatabase,applyMigrations,productionMigrations,seedAuthUsers,OWNER_A,OWNER_B,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
let db,legacy;const migration='20261001050523_shared_commitment_publications.sql';
const statement={format:'memoire.shared-commitment',version:1,statementId:randomUUID(),issuedAt:'2026-10-01T00:00:00Z',issuer:{reference:'org-a',label:'Issuer'},recipient:{reference:'org-b',label:'Recipient'},commitmentRef:'PUBLIC-42',promise:{responsiblePerson:'Person',text:'Selected promise',dueDate:'2026-10-10',status:'completed',completionEvidence:'Selected signed receipt'},sourceUpdatedAt:'2026-09-01T00:00:00Z',sample:false,authority:{kind:'issuer-declaration',recipientAccepted:false}};
const insert=(database,owner,body=statement)=>database.query(`INSERT INTO commercial_events(id,user_id,event_type,occurred_at,recorded_at,created_at,summary,structured_payload,idempotency_key,source_type,source_id,commitment_id)
 VALUES($1,$2,'shared_commitment_issued','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','Shared promise statement issued',$3,$1,'manual',$4,'private-source-promise')`,['shared-commitment:'+body.statementId,owner,body,body.statementId]);
before(async()=>{db=await createSupabaseCompatibleDatabase();const files=productionMigrations();await applyMigrations(db,files.slice(0,files.indexOf(migration)));await seedAuthUsers(db);await setAuthenticatedOwner(db,OWNER_A);await db.query("INSERT INTO commercial_events(id,user_id,event_type,summary) VALUES('legacy',$1,'activity_captured','Prior event')",[OWNER_A]);legacy=(await db.query("SELECT * FROM commercial_events WHERE id='legacy'")).rows[0];await db.exec('RESET ROLE');await applyMigrations(db,[migration]);await setAuthenticatedOwner(db,OWNER_A);});
after(async()=>db?.close());
test('populated upgrade retains prior facts and issuance creates no canonical State Revision',async()=>{
 assert.deepEqual((await db.query("SELECT * FROM commercial_events WHERE id='legacy'")).rows[0],legacy);await insert(db,OWNER_A);assert.equal((await db.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n,0);
});
test('publication is immutable, with timestamp retry preserving original occurrence',async()=>{
 const id='shared-commitment:'+statement.statementId,prior=(await db.query('SELECT * FROM commercial_events WHERE id=$1',[id])).rows[0];await db.query('UPDATE commercial_events SET occurred_at=clock_timestamp(),recorded_at=clock_timestamp(),created_at=clock_timestamp() WHERE id=$1',[id]);assert.deepEqual((await db.query('SELECT * FROM commercial_events WHERE id=$1',[id])).rows[0],prior);
 await assert.rejects(db.query("UPDATE commercial_events SET summary='Changed' WHERE id=$1",[id]),/immutable/);await assert.rejects(db.query('DELETE FROM commercial_events WHERE id=$1',[id]),/cannot be deleted/);
});
test('database refuses forged authority, private extra fields, sample publication and invalid dates/evidence',async()=>{
 for(const patch of [{authority:{kind:'issuer-declaration',recipientAccepted:true}},{privateNote:'Secret'},{sample:true},{promise:{...statement.promise,status:'open'}},{promise:{...statement.promise,dueDate:'2026-02-31'}}])await assert.rejects(insert(db,OWNER_A,{...statement,statementId:randomUUID(),...patch}));
});
test('owner RLS and anonymous denial retain private publication ownership',async()=>{
 await setAuthenticatedOwner(db,OWNER_B);assert.equal((await db.query('SELECT * FROM commercial_events')).rows.length,0);await assert.rejects(insert(db,OWNER_A,{...statement,statementId:randomUUID()}),/row-level/);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_events'),/permission denied/);await setAuthenticatedOwner(db,OWNER_A);
});
test('fresh migration chain restores issued event idempotently without executable recipient authority',async()=>{
 const row=(await db.query('SELECT * FROM commercial_events WHERE id=$1',['shared-commitment:'+statement.statementId])).rows[0],target=await createSupabaseCompatibleDatabase();
 try{await applyMigrations(target);await seedAuthUsers(target);await setAuthenticatedOwner(target,OWNER_A);const columns=Object.keys(row),updates=columns.filter(c=>!['id','user_id'].includes(c)).map(c=>c+'=EXCLUDED.'+c).join(',');const sql='INSERT INTO commercial_events('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+') ON CONFLICT(user_id,id) DO UPDATE SET '+updates;
 await target.query(sql,Object.values(row));await target.query(sql,Object.values(row));assert.deepEqual((await target.query('SELECT * FROM commercial_events')).rows,[row]);assert.equal(row.structured_payload.authority.recipientAccepted,false);
 }finally{await target.close();}
});
