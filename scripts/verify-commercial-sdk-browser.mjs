import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';import assert from 'node:assert/strict';
import {createCommercialHandler} from '../.memoire-server/commercial.mjs';
import {createSupabaseCompatibleDatabase,applyMigrations,seedAuthUsers,OWNER_A} from './release-database-harness.mjs';
import {databaseClient} from '../test/support/commercialApiDatabase.mjs';
const sdk=await readFile(new URL('../packages/memoire-sdk/dist/index.js',import.meta.url),'utf8');
const runtime=await readFile(new URL('../packages/memoire-sdk/dist/agent-runtime.js',import.meta.url),'utf8');
const db=await createSupabaseCompatibleDatabase();await applyMigrations(db);await seedAuthUsers(db);
const handler=createCommercialHandler({verify:async token=>token==='fixture-owner'?{id:OWNER_A}:null,clientForToken:()=>databaseClient(db,OWNER_A),rateLimit:()=>({allowed:true})});
const server=createServer(async(req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>SDK browser verification</title>');return;}
 if(['/sdk.js','/index.js','/agent-runtime.js'].includes(req.url)){res.setHeader('Content-Type','text/javascript');res.end(req.url==='/agent-runtime.js'?runtime:sdk);return;}
 let content='';for await(const chunk of req)content+=chunk;const url=new URL(req.url,'http://localhost');req.query=Object.fromEntries(url.searchParams);req.body=content?JSON.parse(content):undefined;
 res.status=code=>{res.statusCode=code;return res;};res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};await handler(req,res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
  const {createMemoireClient}=await import('/sdk.js');
  const client=createMemoireClient({origin:location.origin,allowLocalHttp:true,getAccessToken:()=> 'fixture-owner'});
  const observation={schemaVersion:1,sourceKind:'email',sourceNamespace:'sdk-browser',sourceEventId:'one',sourceVersion:'1',observedAt:null,summary:'Claim',rawText:'Unaccepted claim'};
  const first=await client.receiveObservation(observation),retry=await client.receiveObservation(observation);
  const list=await client.listCommitments();const recommendations=await client.listCommitmentRecommendations();
  let conflict;try{await client.receiveObservation({...observation,rawText:'Different'});}catch(error){conflict={status:error.status,retrySafe:error.retrySafe};}
  const {createAgentRuntime}=await import('/agent-runtime.js');
  const options={origin:location.origin,allowLocalHttp:true,getAccessToken:()=> 'fixture-owner',agentId:'browser-agent',observations:[{key:'source',observation:{...observation,sourceEventId:'agent-source'}}]};
  const reader=await createAgentRuntime(options);const [draft]=await reader.propose(async()=>[{type:'receive-observation',observationKey:'source',summary:'Receive original'}]);
  let denied;try{await reader.executeReceipt(draft.id);}catch(error){denied=error.code;}
  const worker=await createAgentRuntime({...options,receiptAuthority:{expiresAt:new Date(Date.now()+60000).toISOString(),namespaces:['sdk-browser'],maxReceipts:1}});
  const [proposal]=await worker.propose(async()=>[{type:'receive-observation',observationKey:'source',summary:'Receive original'}]);
  const received=await worker.executeReceipt(proposal.id);worker.revoke();let revoked;try{await worker.executeReceipt(proposal.id);}catch(error){revoked=error.code;}
  return {first,retry,list,recommendations,conflict,stored:localStorage.length,agent:{denied,received,revoked}};
 });
 assert.equal(result.first.duplicate,false);assert.equal(result.retry.duplicate,true);assert.deepEqual(result.first.receipt,result.retry.receipt);assert.equal(result.first.receipt.acceptedCommercialTruth,false);
 assert.equal(result.list.scope,'authenticated-owner');assert.equal(result.recommendations.basis,'commitments-in-this-page');assert.deepEqual(result.conflict,{status:409,retrySafe:false});assert.equal(result.stored,0);
 assert.equal(result.agent.denied,'command_not_permitted');assert.equal(result.agent.received.receipt.acceptedCommercialTruth,false);assert.equal(result.agent.revoked,'authority_revoked');
 console.log('Built SDK and agent browser verification passed: HTTP API, migrated database, retry identity, scoped reads, default denial, host receipt allowance, revocation and no local credential storage.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
