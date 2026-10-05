import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
class Storage{data=new Map();get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage(),writes=[];let fail=false,cloud=[],writeGate=null,writeError=null;
globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
globalThis.__ownerCloud={auth:{getUser:async()=>({data:{user:{id:'owner-b'}},error:null})},rpc:async()=>({data:'2026-09-01T00:00:00Z',error:null}),from(){return {select(){return this;},eq(){return this;},gte(){return this;},order(){return this;},range:async()=>({data:cloud,error:fail?{message:'Offline'}:null}),limit:async()=>({data:cloud,error:fail?{message:'Offline'}:null}),upsert:async rows=>{if(writeGate)await writeGate;writes.push(...rows);return {error:writeError};}};}};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=globalThis.__ownerCloud;export const isPipelineSupabaseConfigured=true;'};return next(url,context);}});
const {eventCodec,loadRecentEvents,EVENT_STORAGE_KEY}=await import('../../src/services/commercialKernel/eventStore.ts');
const {loadForWorkspace,loadMergedForUser,upsertCloudRecords,sendOwedCloudRecords,flushPendingKernelWrites}=await import('../../src/services/commercialKernel/kernelRepository.ts');
const at='2026-09-29T00:00:00.000Z';
const event=(owner,id=owner)=>({id,userId:owner,eventType:'activity_captured',occurredAt:at,recordedAt:at,createdAt:at,summary:'Private '+owner,structuredPayload:{},sourceType:'manual'});
beforeEach(()=>{storage.data.clear();writes.length=0;fail=false;cloud=[];storage.setItem(EVENT_STORAGE_KEY,JSON.stringify([event('owner-a'),event('owner-b'),event(null,'anonymous'),{...event(null,'sample'),isSample:true}]));});
test('signed-in merge neither displays nor republishes another owner or anonymous records',async()=>{
 const rows=await loadMergedForUser(eventCodec,'owner-b');await new Promise(r=>setTimeout(r,0));assert.deepEqual(rows.map(r=>r.id),['owner-b']);assert.deepEqual(writes.map(r=>r.id),['owner-b']);assert.equal(JSON.parse(storage.getItem(EVENT_STORAGE_KEY)).length,4);
});
test('cloud outage and signed-out views retain exact local ownership boundaries',async()=>{
 fail=true;assert.deepEqual((await loadForWorkspace(eventCodec,'owner-b')).map(r=>r.id),['owner-b']);assert.deepEqual((await loadForWorkspace(eventCodec)).map(r=>r.id),['anonymous']);assert.deepEqual((await loadForWorkspace(eventCodec,null,true)).map(r=>r.id),['sample']);
});
test('direct cloud writes cannot relabel a foreign or anonymous record',async()=>{
 await assert.rejects(upsertCloudRecords(eventCodec,'owner-b',[event('owner-a')]));await assert.rejects(upsertCloudRecords(eventCodec,'owner-b',[event(null)]));assert.equal(writes.length,0);
});
test('bounded event window and offline fallback exclude foreign history from reads and sync',async()=>{
 const options={now:new Date(at)};assert.deepEqual((await loadRecentEvents('owner-b',false,options)).map(r=>r.id),['owner-b']);await new Promise(r=>setTimeout(r,0));assert.deepEqual(writes.map(r=>r.id),['owner-b']);fail=true;assert.deepEqual((await loadRecentEvents('owner-b',false,options)).map(r=>r.id),['owner-b']);
});
test('an identity collision across owners preserves the browser copy and fails closed',async()=>{
 cloud=[eventCodec.toRow(event('owner-b','owner-a'),'owner-b')];const before=storage.getItem(EVENT_STORAGE_KEY);await assert.rejects(loadMergedForUser(eventCodec,'owner-b'),/identities conflict/);assert.equal(storage.getItem(EVENT_STORAGE_KEY),before);
});

test('event retry resolves identity within its owner even when another owner used the same key',async()=>{
 const {recordCommercialEvent}=await import('../../src/domain/commercialKernel/commands.ts');
 storage.setItem(EVENT_STORAGE_KEY,JSON.stringify([{...event('owner-a'),idempotencyKey:'shared-key'},{...event('owner-b'),idempotencyKey:'shared-key'}]));
 const result=recordCommercialEvent({userId:'owner-b',sampleDataActive:false},{eventType:'activity_captured',summary:'Retry',idempotencyKey:'shared-key'});assert.equal(result.userId,'owner-b');assert.equal(result.id,'owner-b');
});

test('recovery waits for a late relational write failure instead of declaring the earlier read synced',async()=>{
 await flushPendingKernelWrites();
 const {beginWorkspaceSyncRetry,getWorkspaceSyncStatus}=await import('../../src/services/workspaceSyncStatus.ts');
 beginWorkspaceSyncRetry();
 let release;writeGate=new Promise(resolve=>{release=resolve;});writeError={message:'Rejected late write'};
 sendOwedCloudRecords(eventCodec,'owner-b',[event('owner-b','late-event')],[]);
 let settled=false;const drained=flushPendingKernelWrites().then(()=>{settled=true;});
 await Promise.resolve();await Promise.resolve();assert.equal(settled,false);
 release();await drained;assert.equal(settled,true);
 assert.equal(getWorkspaceSyncStatus().state,'error');assert.match(getWorkspaceSyncStatus().message,/commercial_events.*Rejected late write/);
 writeGate=null;writeError=null;
});
