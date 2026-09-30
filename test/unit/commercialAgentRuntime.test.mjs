import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createAgentRuntime} from '../../packages/memoire-sdk/dist/agent-runtime.js';
import {createCommercialHandler} from '../../api/_commercial.js';
import {createSupabaseCompatibleDatabase,applyMigrations,seedAuthUsers,OWNER_A,OWNER_B,setAuthenticatedOwner} from '../../scripts/release-database-harness.mjs';
import {databaseClient,callHandler} from '../support/commercialApiDatabase.mjs';
let db,handler;
const observation={schemaVersion:1,sourceKind:'crm',sourceNamespace:'host-source',sourceEventId:'a',sourceVersion:'1',observedAt:null,summary:'Original claim',rawText:'Original source text'};
const sources=[{key:'one',observation},{key:'two',observation:{...observation,sourceEventId:'b'}}];
const authority=()=>({expiresAt:new Date(Date.now()+60000).toISOString(),namespaces:['host-source'],maxReceipts:1});
before(async()=>{db=await createSupabaseCompatibleDatabase();await applyMigrations(db);await seedAuthUsers(db);
 await setAuthenticatedOwner(db,OWNER_A);await db.query("INSERT INTO commercial_commitments(id,user_id,commitment_text,owner_label,current_due_date,commitment_party,status,source_type) VALUES('a',$1,'Private promise','Person','2020-01-01','customer','open','manual')",[OWNER_A]);
 handler=createCommercialHandler({verify:async token=>[OWNER_A,OWNER_B].includes(token)?{id:token}:null,clientForToken:token=>databaseClient(db,token),rateLimit:()=>({allowed:true})});
});
after(async()=>db?.close());
async function transport(url,init){const response=await callHandler(handler,{method:init.method,headers:{authorization:init.headers.Authorization},query:Object.fromEntries(url.searchParams),body:init.body?JSON.parse(init.body):undefined});return Response.json(response.body,{status:response.code,headers:response.headers});}
const options=()=>({origin:'https://memoire.example',getAccessToken:()=>OWNER_A,agentId:'test-agent',observations:sources,fetch:transport});
const receipt=key=>({type:'receive-observation',observationKey:key,summary:'Suggest receipt'});
test('agent defaults to read/propose only and proposals create no canonical writes',async()=>{
 const runtime=await createAgentRuntime(options());let view;
 const proposals=await runtime.propose(async input=>{view=input;return [{type:'follow-up',commitmentId:'a',summary:'Ask about due date'},receipt('one')];});
 assert.equal(view.commitments[0].promise,'Private promise');assert.ok(Object.isFrozen(view.observations[0].observation));assert.equal(proposals[0].acceptedCommercialTruth,false);
 await assert.rejects(runtime.executeReceipt(proposals[1].id),{code:'command_not_permitted'});await assert.rejects(runtime.executeReceipt(proposals[0].id),{code:'command_not_permitted'});
 assert.equal((await db.query('SELECT count(*)::int n FROM commercial_events')).rows[0].n,0);
});
test('model cannot forge confirmation, foreign references or executable commands',async()=>{
 const runtime=await createAgentRuntime({...options(),receiptAuthority:authority()});
 for(const bad of [{type:'complete-commitment',commitmentId:'a',summary:'Do it'}, {type:'follow-up',commitmentId:'foreign',summary:'Other owner'}, {...receipt('one'),confirmed:true},receipt('unknown')])await assert.rejects(runtime.propose(async()=>[bad]),{code:'invalid_proposals'});
 await assert.rejects(runtime.executeReceipt('invented-id'),{code:'command_not_permitted'});
});
test('host grants execute only original source receipt, with bounded budget and no claim promotion',async()=>{
 const grant=authority();const input=options();const runtime=await createAgentRuntime({...input,receiptAuthority:grant});grant.maxReceipts=50;
 const proposals=await runtime.propose(async()=>[receipt('one'),receipt('two')]);proposals[0].proposal.observationKey='two';
 const result=await runtime.executeReceipt(proposals[0].id);assert.equal(result.receipt.observation.rawText,'Original source text');assert.equal(result.receipt.observation.sourceEventId,'a');assert.equal(result.receipt.acceptedCommercialTruth,false);
 assert.deepEqual(await runtime.executeReceipt(proposals[0].id),result);
 await assert.rejects(runtime.executeReceipt(proposals[1].id),{code:'receipt_budget_exhausted'});
 assert.equal((await db.query('SELECT count(*)::int n FROM commercial_events')).rows[0].n,1);
 assert.equal((await db.query("SELECT status FROM commercial_commitments WHERE id='a'")).rows[0].status,'open');
});
test('expiry, namespace and revocation refuse execution under current host authority',async()=>{
 for(const patch of [{expiresAt:'2000-01-01T00:00:00Z'},{namespaces:['different']}]){
  const runtime=await createAgentRuntime({...options(),receiptAuthority:{...authority(),...patch}});const [proposal]=await runtime.propose(async()=>[receipt('one')]);await assert.rejects(runtime.executeReceipt(proposal.id),{code:'command_not_permitted'});
 }
 const runtime=await createAgentRuntime({...options(),receiptAuthority:authority()});const [proposal]=await runtime.propose(async()=>[receipt('one')]);runtime.revoke();await assert.rejects(runtime.executeReceipt(proposal.id),{code:'authority_revoked'});await assert.rejects(runtime.propose(async()=>[]),{code:'authority_revoked'});
});
test('runtime pins authenticated identity and never passes credentials to the agent',async()=>{
 let token=OWNER_A,calls=0;const runtime=await createAgentRuntime({...options(),getAccessToken:()=>{calls++;return token;}});token=OWNER_B;
 await runtime.propose(async view=>{assert.equal(view.commitments.length,1);assert.equal(JSON.stringify(view).includes(OWNER_A),false);return [];});assert.equal(calls,1);
});
test('lost receipt acknowledgement reserves budget and allows only exact retry',async()=>{
 let fail=true;const runtime=await createAgentRuntime({...options(),receiptAuthority:authority(),fetch:async(url,init)=>{const response=await transport(url,init);if(init.method==='POST'&&fail){fail=false;throw Error('lost ack');}return response;}});
 const proposals=await runtime.propose(async()=>[receipt('one'),receipt('two')]);await assert.rejects(runtime.executeReceipt(proposals[0].id),e=>e.outcomeUnknown&&e.retrySafe);
 await assert.rejects(runtime.executeReceipt(proposals[1].id),{code:'receipt_budget_exhausted'});const retry=await runtime.executeReceipt(proposals[0].id);assert.equal(retry.duplicate,true);
});
test('concurrent runs and oversized output cannot exceed the proposal boundary',async()=>{
 const runtime=await createAgentRuntime(options());let release;const wait=new Promise(resolve=>{release=resolve;});let started;const ready=new Promise(resolve=>{started=resolve;});
 const run=runtime.propose(async()=>{started();await wait;return [];});await ready;await assert.rejects(runtime.propose(async()=>[]),{code:'runtime_busy'});release();await run;
 await assert.rejects(runtime.propose(async()=>Array.from({length:11},()=>receipt('one'))),{code:'invalid_proposals'});
});
