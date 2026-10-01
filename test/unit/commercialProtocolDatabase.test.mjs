import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createSupabaseCompatibleDatabase,applyMigrations,seedAuthUsers,OWNER_A,OWNER_B,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
import {createCommercialHandler} from '../../api/_commercial.js';import {databaseClient,callHandler} from '../support/commercialApiDatabase.mjs';
import {createMemoireClient} from '../../packages/memoire-sdk/src/index.ts';
import {publicState} from '../support/commercialProtocolFixture.mjs';
import {protocolFromCrossCompanyState,verifyCommercialProtocol,commercialProtocolObservation} from '../../src/domain/commercialKernel/commercialProtocol.ts';
let db,handler,message,observation,receipt;
before(async()=>{db=await createSupabaseCompatibleDatabase();await applyMigrations(db);await seedAuthUsers(db);message=await protocolFromCrossCompanyState(await publicState());observation=await commercialProtocolObservation(await verifyCommercialProtocol(message));
 handler=createCommercialHandler({verify:async token=>[OWNER_A,OWNER_B].includes(token)?{id:token}:null,clientForToken:token=>databaseClient(db,token),rateLimit:()=>({allowed:true})});});
after(async()=>db?.close());
function client(owner){return createMemoireClient({origin:'https://memoire.example',getAccessToken:()=>owner,fetch:async(url,init)=>{const r=await callHandler(handler,{method:init.method,headers:{authorization:init.headers.Authorization},query:Object.fromEntries(url.searchParams),body:init.body?JSON.parse(init.body):undefined});return Response.json(r.body,{status:r.code,headers:r.headers});}});}
test('v1 protocol travels through the unchanged SDK/API to actual migrated immutable receipt tables',async()=>{
 const sdk=client(OWNER_A),first=await sdk.receiveObservation(observation),retry=await sdk.receiveObservation(observation);assert.equal(first.duplicate,false);assert.equal(retry.duplicate,true);assert.equal(first.receipt.acceptedCommercialTruth,false);assert.deepEqual(first.receipt,retry.receipt);
 receipt=(await db.query('SELECT * FROM commercial_events')).rows[0];assert.equal((await verifyCommercialProtocol(JSON.parse(receipt.structured_payload.rawText))).acceptedCommercialTruth,false);assert.equal(receipt.opportunity_id,null);assert.equal((await db.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n,0);
 await assert.rejects(db.query("UPDATE commercial_events SET structured_payload=jsonb_set(structured_payload,'{rawText}','\"Changed\"')"),/immutable/);await assert.rejects(db.query('DELETE FROM commercial_events'),/cannot be deleted/);
 await assert.rejects(sdk.receiveObservation({...observation,rawText:'changed under same identity'}),e=>e.status===409);
});
test('protocol references grant no database authority to another owner or anonymous actor',async()=>{
 await setAuthenticatedOwner(db,OWNER_B);assert.equal((await db.query('SELECT * FROM commercial_events')).rows.length,0);assert.equal((await db.query('UPDATE commercial_events SET summary=$1 WHERE user_id=$2',['Changed',OWNER_A])).affectedRows,0);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM commercial_events'),/permission denied/);await setAuthenticatedOwner(db,OWNER_A);
});
test('raw transport receipt is not protocol certification; tampered claims cannot pass domain verification',async()=>{
 const altered=structuredClone(message);altered.body.outcome.statement='Forged';const tampered={...observation,sourceEventId:crypto.randomUUID(),rawText:JSON.stringify(altered)};const r=await client(OWNER_B).receiveObservation(tampered);assert.equal(r.receipt.acceptedCommercialTruth,false);await assert.rejects(verifyCommercialProtocol(JSON.parse(r.receipt.observation.rawText)),/integrity/);await setAuthenticatedOwner(db,OWNER_A);
});
test('fresh-chain recovery retains original observation facts and exact retries without business revisions',async()=>{
 const target=await createSupabaseCompatibleDatabase();try{await applyMigrations(target);await seedAuthUsers(target);await setAuthenticatedOwner(target,OWNER_A);const columns=Object.keys(receipt),sql='INSERT INTO commercial_events('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+') ON CONFLICT(user_id,id) DO UPDATE SET '+columns.filter(c=>!['id','user_id'].includes(c)).map(c=>c+'=EXCLUDED.'+c).join(',');await target.query(sql,Object.values(receipt));await target.query(sql,Object.values(receipt));assert.deepEqual((await target.query('SELECT * FROM commercial_events')).rows,[receipt]);assert.equal((await target.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n,0);await setAuthenticatedOwner(target,OWNER_B);assert.equal((await target.query('SELECT * FROM commercial_events')).rows.length,0);}finally{await target.close();}
});
