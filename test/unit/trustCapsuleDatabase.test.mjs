import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createSupabaseCompatibleDatabase,applyMigrations,seedAuthUsers,OWNER_A,OWNER_B,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
import {createCommercialHandler} from '../../api/_commercial.js';import {databaseClient,callHandler} from '../support/commercialApiDatabase.mjs';
import {createTrustCapsule,verifyTrustCapsule,trustCapsuleObservation} from '../../src/domain/commercialKernel/trustCapsule.ts';
let db,handler,observation;
before(async()=>{db=await createSupabaseCompatibleDatabase();await applyMigrations(db);await seedAuthUsers(db);const statement={format:'memoire.shared-commitment',version:1,statementId:crypto.randomUUID(),issuedAt:'2026-10-01T00:00:00Z',issuer:{reference:'org-a',label:'Issuer'},recipient:{reference:'org-b',label:'Recipient'},commitmentRef:'PUBLIC-42',promise:{responsiblePerson:'Person',text:'Selected promise',dueDate:null,status:'open',completionEvidence:null},sourceUpdatedAt:'2026-09-01T00:00:00Z',sample:false,authority:{kind:'issuer-declaration',recipientAccepted:false}};
 observation=await trustCapsuleObservation(await verifyTrustCapsule(await createTrustCapsule(statement)));handler=createCommercialHandler({verify:async()=>({id:OWNER_A}),clientForToken:()=>databaseClient(db,OWNER_A),rateLimit:()=>({allowed:true})});});
after(async()=>db?.close());
test('checked capsule persists through existing immutable receipt API and real database without business revisions',async()=>{
 const body={version:1,command:'receive-observation',observation},first=await callHandler(handler,{method:'POST',body}),retry=await callHandler(handler,{method:'POST',body});assert.equal(first.code,201);assert.equal(retry.code,200);assert.equal(retry.body.duplicate,true);assert.equal(first.body.receipt.acceptedCommercialTruth,false);
 const row=(await db.query('SELECT * FROM commercial_events')).rows[0];assert.equal((await verifyTrustCapsule(JSON.parse(row.structured_payload.rawText))).integrityVerified,true);assert.equal((await db.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n,0);
 await assert.rejects(db.query("UPDATE commercial_events SET summary='Altered capsule claim'"),/immutable/);
});
test('capsule claims retain owner RLS and no anonymous access',async()=>{
 await setAuthenticatedOwner(db,OWNER_B);assert.equal((await db.query('SELECT * FROM commercial_events')).rows.length,0);await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_events'),/permission denied/);await setAuthenticatedOwner(db,OWNER_A);
});
