import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createSupabaseCompatibleDatabase,applyMigrations,seedAuthUsers,OWNER_A,OWNER_B,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
import {createCommercialHandler} from '../../.memoire-server/commercial.mjs';
import {databaseClient,callHandler} from '../support/commercialApiDatabase.mjs';
let db,handler;const tokens={'owner-a':OWNER_A,'owner-b':OWNER_B};
const observation={schemaVersion:1,sourceKind:'crm',sourceNamespace:'CRM1',sourceEventId:'42',sourceVersion:'1',observedAt:null,summary:'Reported signature',rawText:'Unaccepted source claim.'};
const body={version:1,command:'receive-observation',observation};
const verify=async(token,claimed,options)=>{assert.equal(claimed,undefined);assert.equal(options.requireUserId,false);return tokens[token]?{id:tokens[token]}:null;};
before(async()=>{db=await createSupabaseCompatibleDatabase();await applyMigrations(db);await seedAuthUsers(db);
 for(const owner of [OWNER_A,OWNER_B]){await setAuthenticatedOwner(db,owner);for(const id of ['a','b'])await db.query("INSERT INTO commercial_commitments(id,user_id,commitment_text,owner_label,current_due_date,commitment_party,status,source_type) VALUES($1,$2,$3,'Named person','2020-01-01','customer','open','manual')",[id,owner,owner+' private promise '+id]);}
 handler=createCommercialHandler({verify,clientForToken:token=>databaseClient(db,tokens[token]),rateLimit:()=>({allowed:true})});});
after(async()=>db?.close());
test('API denies absent/invalid authentication and rejects client-selected ownership or commands',async()=>{
 for(const headers of [{},{authorization:'Bearer wrong'}])assert.equal((await callHandler(handler,{headers})).code,401);
 assert.equal((await callHandler(handler,{query:{userId:OWNER_B}})).code,400);
 for(const patch of [{userId:OWNER_B},{command:'complete-commitment'},{version:2},{sampleDataActive:true}])assert.equal((await callHandler(handler,{method:'POST',body:{...body,...patch}})).code,400);
 assert.equal((await callHandler(handler,{method:'DELETE'})).code,405);
});
test('commitment read uses real owner RLS and bounded stable pagination with public DTOs',async()=>{
 const first=await callHandler(handler,{query:{limit:'1'}});assert.equal(first.code,200);assert.equal(first.headers['Cache-Control'],'no-store');assert.equal(first.body.items.length,1);assert.equal(first.body.nextCursor,'a');assert.match(first.body.items[0].promise,new RegExp(OWNER_A));assert.equal('user_id' in first.body.items[0],false);
 const next=await callHandler(handler,{query:{limit:'1',after:first.body.nextCursor}});assert.equal(next.body.items[0].id,'b');assert.equal(next.body.nextCursor,null);
 const other=await callHandler(handler,{headers:{authorization:'Bearer owner-b'}});assert.ok(other.body.items.every(item=>item.promise.includes(OWNER_B)));
 for(const query of [{limit:'101'},{limit:['1']},{after:['a']},{resource:'all-tables'}])assert.equal((await callHandler(handler,{query})).code,400);
});
test('recommendation reads reuse the existing policy engine without writes and declare page scope',async()=>{
 await setAuthenticatedOwner(db,OWNER_A);const before=(await db.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n;
 const result=await callHandler(handler,{query:{resource:'commitment-recommendations',limit:'1'}});assert.equal(result.code,200);assert.equal(result.body.basis,'commitments-in-this-page');assert.ok(result.body.items.some(item=>item.reasonCode==='CUSTOMER_COMMITMENT_OVERDUE'));assert.ok(result.body.items.every(item=>item.sourceRecordIds.includes('a')));
 assert.equal((await db.query('SELECT count(*)::int n FROM commercial_state_revisions')).rows[0].n,before);
});
test('receipt command persists through actual schema, retries without duplicates and rejects identity reuse',async()=>{
 const first=await callHandler(handler,{method:'POST',body});assert.equal(first.code,201);assert.equal(first.body.receipt.acceptedCommercialTruth,false);
 const retry=await callHandler(handler,{method:'POST',body});assert.equal(retry.code,200);assert.equal(retry.body.duplicate,true);assert.deepEqual(retry.body.receipt,first.body.receipt);
 const conflict=await callHandler(handler,{method:'POST',body:{...body,observation:{...observation,rawText:'Changed'}}});assert.equal(conflict.code,409);
 assert.equal((await db.query('SELECT count(*)::int n FROM commercial_events')).rows[0].n,1);
 const other=await callHandler(handler,{method:'POST',headers:{authorization:'Bearer owner-b'},body});assert.equal(other.code,201);assert.notEqual(other.body.receipt.id,first.body.receipt.id);
});
test('schema validation rejects unsupported facts and oversized payloads before writes',async()=>{
 assert.equal((await callHandler(handler,{method:'POST',body:{...body,observation:{...observation,accepted:true}}})).code,400);
 assert.equal((await callHandler(handler,{method:'POST',body:{...body,observation:{...observation,rawText:'x'.repeat(128001)}}})).code,413);
});
test('storage and quota failures are explicit and do not leak database details',async()=>{
 const limited=createCommercialHandler({rateLimit:()=>({allowed:false,retryAfterSeconds:9})});const response=await callHandler(limited,{});assert.equal(response.code,429);assert.equal(response.headers['Retry-After'],'9');
 const broken=createCommercialHandler({verify,clientForToken:()=>{throw new Error('private db credentials');},rateLimit:()=>({allowed:true})});const failure=await callHandler(broken,{});assert.equal(failure.code,503);assert.equal(JSON.stringify(failure.body).includes('credentials'),false);
});
