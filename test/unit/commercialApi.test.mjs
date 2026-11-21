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

test('a named-book receipt uses the resolved book owner and rejects a foreign workspace selector', async () => {
 const commandBody={...body,observation:{...observation,sourceEventId:'named-contract-fixture'}};
 const book='bbbbbbbb-1111-4111-8111-111111111156';
 await setAuthenticatedOwner(db,OWNER_A);
 await db.query("SELECT public.memoire_create_native_workspace($1,'Agent contract fixture',NULL,'{}')",[book]);
 const directory=(await db.query('SELECT * FROM public.memoire_get_native_workspace_scope($1)',[book])).rows[0];
 const scoped=createCommercialHandler({verify,rateLimit:()=>({allowed:true}),clientForToken:(token,workspace)=>{
  const login=tokens[token];
  const client=databaseClient(db,workspace?directory.data_owner_id:login);
  return {...client,rpc(name,args){
   if(name==='memoire_get_native_workspace_scope')return {async maybeSingle(){
    await setAuthenticatedOwner(db,login);
    const rows=await db.query('SELECT * FROM public.memoire_get_native_workspace_scope($1)',[args.p_workspace]);
    return {data:rows.rows[0]??null,error:null};
   }};
   if(name==='memoire_active_data_owner')return (async()=>{
    await setAuthenticatedOwner(db,login);
    await db.exec('BEGIN');
    try {
     await db.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[
      JSON.stringify({sub:login,role:'authenticated'}),JSON.stringify({'x-memoire-data-workspace':workspace}),
     ]);
     await db.exec('SELECT memoire_private.apply_workspace_data_scope()');
     const result=await db.query('SELECT public.memoire_active_data_owner() AS owner');
     return {data:result.rows[0].owner,error:null};
    } finally { await db.exec('ROLLBACK'); }
   })();
   throw new Error('unexpected scope RPC');
  }};
 }});
 const named=await callHandler(scoped,{method:'POST',headers:{authorization:'Bearer owner-a','x-memoire-data-workspace':book},body:commandBody});
 assert.equal(named.code,201);
 const replay=await callHandler(scoped,{method:'POST',headers:{authorization:'Bearer owner-a','x-memoire-data-workspace':book},body:commandBody});
 assert.deepEqual(replay.body,{...named.body,duplicate:true});
 const personal=await callHandler(scoped,{method:'POST',headers:{authorization:'Bearer owner-a'},body:commandBody});
 assert.equal(personal.code,201);
 assert.notEqual(personal.body.receipt.id,named.body.receipt.id);
 const foreign=await callHandler(scoped,{method:'POST',headers:{authorization:'Bearer owner-b','x-memoire-data-workspace':book},body:commandBody});
 assert.equal(foreign.code,404);
 await setAuthenticatedOwner(db,OWNER_A);
 assert.equal((await db.query('SELECT id FROM commercial_events WHERE id=$1',[named.body.receipt.id])).rowCount,0);
});
