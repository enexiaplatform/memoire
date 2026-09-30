import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';import assert from 'node:assert/strict';
import {createCommercialHandler} from '../api/_commercial.js';
import {createSupabaseCompatibleDatabase,applyMigrations,seedAuthUsers,OWNER_A} from './release-database-harness.mjs';
import {databaseClient} from '../test/support/commercialApiDatabase.mjs';
const sdk=await readFile(new URL('../packages/memoire-sdk/dist/index.js',import.meta.url),'utf8');
const db=await createSupabaseCompatibleDatabase();await applyMigrations(db);await seedAuthUsers(db);
const handler=createCommercialHandler({verify:async token=>token==='fixture-owner'?{id:OWNER_A}:null,clientForToken:()=>databaseClient(db,OWNER_A),rateLimit:()=>({allowed:true})});
const server=createServer(async(req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>SDK browser verification</title>');return;}
 if(req.url==='/sdk.js'){res.setHeader('Content-Type','text/javascript');res.end(sdk);return;}
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
  return {first,retry,list,recommendations,conflict,stored:localStorage.length};
 });
 assert.equal(result.first.duplicate,false);assert.equal(result.retry.duplicate,true);assert.deepEqual(result.first.receipt,result.retry.receipt);assert.equal(result.first.receipt.acceptedCommercialTruth,false);
 assert.equal(result.list.scope,'authenticated-owner');assert.equal(result.recommendations.basis,'commitments-in-this-page');assert.deepEqual(result.conflict,{status:409,retrySafe:false});assert.equal(result.stored,0);
 console.log('Built SDK browser verification passed: HTTP API, migrated database, retry identity, conflict, scoped reads and no local credential storage.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
