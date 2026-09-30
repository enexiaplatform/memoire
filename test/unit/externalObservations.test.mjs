import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
class Storage{data=new Map();fail='';get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.fail)throw new Error('Storage full');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage();globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {receiveExternalObservation}=await import('../../src/domain/commercialKernel/externalObservationCommands.ts');
const {normalizeExternalObservation,isExternalObservationReceipt}=await import('../../src/domain/commercialKernel/externalObservation.ts');
const {eventCodec,EVENT_STORAGE_KEY}=await import('../../src/services/commercialKernel/eventStore.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const scope={userId:'owner',sampleDataActive:false};const input={schemaVersion:1,sourceKind:'crm',sourceNamespace:'source workspace 1',sourceEventId:'change-42',sourceVersion:'1',observedAt:'2026-09-01T00:00:00Z',summary:'Reported stage update',rawText:'The source reports that the customer signed.'};
beforeEach(()=>{storage.data.clear();storage.fail='';});
test('receiving an observation records only ingestion, without canonical subject links or State Revisions',async()=>{
 const result=await receiveExternalObservation(scope,input);assert.equal(result.duplicate,false);assert.equal(isExternalObservationReceipt(result.event),true);assert.equal(result.event.opportunityId,null);assert.equal(storage.data.size,1);assert.ok(storage.getItem(EVENT_STORAGE_KEY));assert.notEqual(result.event.occurredAt,input.observedAt);
});
test('source identity and version are idempotent; changed source content requires a new version',async()=>{
 const first=await receiveExternalObservation(scope,input),second=await receiveExternalObservation(scope,{...input});assert.equal(second.duplicate,true);assert.deepEqual(second.event,first.event);
 await assert.rejects(receiveExternalObservation(scope,{...input,rawText:'Different meaning'}),/different content/);assert.equal((await receiveExternalObservation(scope,{...input,sourceVersion:'2'})).duplicate,false);
});
test('owner and sample partitions never share receipts even for identical external source keys',async()=>{
 const a=await receiveExternalObservation(scope,input),b=await receiveExternalObservation({userId:'other',sampleDataActive:false},input),sample=await receiveExternalObservation({userId:null,sampleDataActive:true},input);
 assert.equal(new Set([a.event.id,b.event.id,sample.event.id]).size,3);
});
test('unknown schema, arbitrary truth fields, oversized text and invalid times fail before persistence',async()=>{
 for(const patch of [{schemaVersion:2},{accepted:true},{sourceKind:'unknown'},{rawText:'x'.repeat(20001)},{observedAt:'2026-02-31T00:00:00Z'}])await assert.rejects(receiveExternalObservation(scope,{...input,...patch}));assert.equal(storage.data.size,0);
});
test('malformed receipt timestamps are rejected instead of being invented by the legacy event codec',async()=>{
 const {event}=await receiveExternalObservation(scope,input);assert.equal(eventCodec.sanitize({...event,recordedAt:undefined}),null);assert.equal(eventCodec.sanitize({...event,opportunityId:'o'}),null);assert.throws(()=>normalizeExternalObservation({...input,rawText:'\ud800'}));
});
test('source receipt survives actual event codec and backup restore, with raw text and reported time intact',async()=>{
 const {event}=await receiveExternalObservation(scope,input),round=eventCodec.fromRow(eventCodec.toRow(event,'owner'));assert.deepEqual(round.structuredPayload,input);
 const plan=buildRestorePlan({formatVersion:14,exportedAt:new Date().toISOString(),localBrowserData:{[EVENT_STORAGE_KEY]:[event]}});const saved=JSON.parse(plan.writes.find(w=>w.key===EVENT_STORAGE_KEY).value)[0];assert.deepEqual(saved.structuredPayload,input);
});
test('failed local receipt storage or corrupt history cannot report a successful ingestion',async()=>{
 storage.fail=EVENT_STORAGE_KEY;await assert.rejects(receiveExternalObservation(scope,input));assert.equal(storage.data.size,0);storage.fail='';storage.setItem(EVENT_STORAGE_KEY,'broken');await assert.rejects(receiveExternalObservation(scope,input));assert.equal(storage.getItem(EVENT_STORAGE_KEY),'broken');
});
