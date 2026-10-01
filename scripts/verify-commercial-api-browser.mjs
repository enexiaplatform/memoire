import {createServer} from 'node:http';import {chromium} from 'playwright';import assert from 'node:assert/strict';
import {createCommercialHandler} from '../.memoire-server/commercial.mjs';
import {createSupabaseCompatibleDatabase,applyMigrations,seedAuthUsers,OWNER_A} from './release-database-harness.mjs';
import {databaseClient} from '../test/support/commercialApiDatabase.mjs';
const db=await createSupabaseCompatibleDatabase();await applyMigrations(db);await seedAuthUsers(db);
const handler=createCommercialHandler({verify:async token=>token==='fixture-owner'?{id:OWNER_A}:null,clientForToken:()=>databaseClient(db,OWNER_A),rateLimit:()=>({allowed:true})});
const server=createServer(async(req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Commercial API browser verification</title>');return;}
 let content='';for await(const chunk of req)content+=chunk;const url=new URL(req.url,'http://localhost');req.query=Object.fromEntries(url.searchParams);req.body=content?JSON.parse(content):undefined;
 res.status=code=>{res.statusCode=code;return res;};res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};await handler(req,res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const results=await page.evaluate(async()=>{const body={version:1,command:'receive-observation',observation:{schemaVersion:1,sourceKind:'email',sourceNamespace:'mailbox-1',sourceEventId:'message-1',sourceVersion:'1',observedAt:null,summary:'Source statement',rawText:'Unaccepted source text'}};
  const call=async(method,authorized,payload)=>{const response=await fetch('/api/commercial',{method,headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer fixture-owner'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});return {status:response.status,cache:response.headers.get('Cache-Control'),body:await response.json()};};
  return [await call('GET',false),await call('POST',true,body),await call('POST',true,body),await call('POST',true,{...body,userId:'foreign'}),await call('GET',true)];});
 assert.deepEqual(results.map(r=>r.status),[401,201,200,400,200]);assert.ok(results.every(r=>r.cache==='no-store'));assert.deepEqual(results[1].body.receipt,results[2].body.receipt);assert.equal(results[1].body.receipt.acceptedCommercialTruth,false);
 console.log('Commercial API browser transport passed: auth, durable receipt, idempotent retry, ownership override rejection and uncached read.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
