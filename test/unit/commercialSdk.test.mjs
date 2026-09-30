import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createMemoireClient,MemoireError} from '../../packages/memoire-sdk/src/index.ts';
import {createCommercialHandler} from '../../api/_commercial.js';
import {createSupabaseCompatibleDatabase,applyMigrations,seedAuthUsers,OWNER_A,OWNER_B,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
import {databaseClient,callHandler} from '../support/commercialApiDatabase.mjs';
let db,handler;
const observation={schemaVersion:1,sourceKind:'crm',sourceNamespace:'sdk-test',sourceEventId:'a',sourceVersion:'1',observedAt:null,summary:'Claim',rawText:'Unaccepted claim'};
before(async()=>{db=await createSupabaseCompatibleDatabase();await applyMigrations(db);await seedAuthUsers(db);
  for(const owner of [OWNER_A,OWNER_B]){await setAuthenticatedOwner(db,owner);for(const id of ['a','b'])await db.query("INSERT INTO commercial_commitments(id,user_id,commitment_text,owner_label,current_due_date,commitment_party,status,source_type) VALUES($1,$2,$3,'Person','2020-01-01','customer','open','manual')",[id,owner,owner+' promise']);}
  handler=createCommercialHandler({verify:async token=>[OWNER_A,OWNER_B].includes(token)?{id:token}:null,clientForToken:token=>databaseClient(db,token),rateLimit:()=>({allowed:true})});
});
after(async()=>db?.close());
function client(owner=OWNER_A){return createMemoireClient({origin:'https://memoire.example',getAccessToken:()=>owner,fetch:async(url,init)=>{
  assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');
  const result=await callHandler(handler,{method:init.method,headers:{authorization:init.headers.Authorization},query:Object.fromEntries(url.searchParams),body:init.body?JSON.parse(init.body):undefined});
  return new Response(JSON.stringify(result.body),{status:result.code,headers:result.headers});
}});}
test('SDK reads real migrated owner state and page recommendations without exposing persistence',async()=>{
  const sdk=client();const first=await sdk.listCommitments({limit:1});assert.equal(first.nextCursor,'a');assert.match(first.items[0].promise,new RegExp(OWNER_A));assert.equal('user_id' in first.items[0],false);
  const second=await sdk.listCommitments({limit:1,after:first.nextCursor});assert.equal(second.items[0].id,'b');assert.equal(second.nextCursor,null);
  const other=await client(OWNER_B).listCommitments();assert.ok(other.items.every(item=>item.promise.includes(OWNER_B)));
  const recommendations=await sdk.listCommitmentRecommendations({limit:1});assert.equal(recommendations.basis,'commitments-in-this-page');assert.ok(recommendations.items.length>0);
});
test('SDK receives immutable observations, retries exactly and never accepts claims as truth',async()=>{
  const sdk=client(),first=await sdk.receiveObservation(observation),retry=await sdk.receiveObservation(observation);
  assert.equal(first.duplicate,false);assert.equal(retry.duplicate,true);assert.deepEqual(first.receipt,retry.receipt);assert.equal(first.receipt.acceptedCommercialTruth,false);
  await assert.rejects(sdk.receiveObservation({...observation,rawText:'Changed'}),e=>e instanceof MemoireError&&e.status===409&&!e.retrySafe);
  assert.equal((await db.query('SELECT count(*)::int n FROM commercial_events')).rows[0].n,1);
});
test('SDK refuses unsafe origins, absent credentials and invalid page options before dispatch',async()=>{
  for(const origin of ['http://remote.example','https://a.example/path','https://u:p@a.example','https://a.example/?token=x'])assert.throws(()=>createMemoireClient({origin,getAccessToken:()=>''}),MemoireError);
  let calls=0;const sdk=createMemoireClient({origin:'https://example.com',getAccessToken:()=>'',fetch:async()=>{calls++;throw Error('not reached');}});
  await assert.rejects(sdk.listCommitments(),{code:'authentication_unavailable'});await assert.rejects(sdk.listCommitments({limit:101}),{code:'invalid_query'});assert.equal(calls,0);
});
test('SDK requests fresh credentials, reports rate limits and never retries implicitly',async()=>{
  let calls=0,tokens=0;const sdk=createMemoireClient({origin:'https://example.com',getAccessToken:()=>String(++tokens),fetch:async(_,init)=>{assert.equal(init.headers.Authorization,'Bearer '+(++calls));return new Response(JSON.stringify({version:1,error:'rate_limited'}),{status:429,headers:{'Retry-After':'9'}});}});
  for(let i=0;i<2;i++)await assert.rejects(sdk.receiveObservation(observation),e=>e.status===429&&e.retryAfterSeconds===9&&e.retrySafe&&!e.outcomeUnknown);
  assert.equal(calls,2);
});
test('lost acknowledgement remains unknown and errors never include tokens or network secrets',async()=>{
  const sdk=createMemoireClient({origin:'https://example.com',getAccessToken:()=> 'private-token',fetch:async()=>{throw Error('private-token private-db');}});
  await assert.rejects(sdk.receiveObservation(observation),e=>e.code==='transport_unavailable'&&e.outcomeUnknown&&e.retrySafe&&!e.message.includes('private'));
});
test('SDK rejects incompatible response versions and false acceptance assertions',async()=>{
  for(const result of [{version:2,items:[]},{version:1,command:'receive-observation',duplicate:false,receipt:{id:'x',receivedAt:'now',observation,acceptedCommercialTruth:true}}]){
    const sdk=createMemoireClient({origin:'https://example.com',getAccessToken:()=> 'token',fetch:async()=>Response.json(result)});
    await assert.rejects(sdk.receiveObservation(observation),e=>e.code==='invalid_response'&&e.outcomeUnknown);
    await assert.rejects(sdk.listCommitments(),{code:'invalid_response'});
  }
});
