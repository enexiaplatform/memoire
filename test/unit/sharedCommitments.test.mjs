import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
class Storage{data=new Map();fail='';get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.fail)throw Error('Storage full');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage();globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {previewSharedCommitment,normalizeSharedCommitment,isSharedCommitmentPublication}=await import('../../src/domain/commercialKernel/sharedCommitment.ts');
const {issueSharedCommitment,receiveSharedCommitment}=await import('../../src/domain/commercialKernel/sharedCommitmentCommands.ts');
const {eventCodec,EVENT_STORAGE_KEY}=await import('../../src/services/commercialKernel/eventStore.ts');
const {commitmentCodec,COMMITMENT_STORAGE_KEY}=await import('../../src/services/commercialKernel/commitmentStore.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const scope={userId:'owner',sampleDataActive:false};
const promise=commitmentCodec.sanitize({id:'private-id',userId:'owner',accountId:'private-account',accountName:'Private name',opportunityId:'private-opportunity',ownerLabel:'Responsible person',commitmentText:'Deliver selected goods',currentDueDate:'2026-10-10',status:'completed',completionEvidence:'Recipient signed receipt',updatedAt:'2026-09-01T00:00:00Z',createdAt:'2026-09-01T00:00:00Z',sourceType:'manual',sourceId:'private-source'});
const parties={issuer:{reference:'org-a',label:'Issuing company'},recipient:{reference:'org-b',label:'Recipient company'},commitmentRef:'PUBLIC-42',includeCompletionEvidence:false};
beforeEach(()=>{storage.data.clear();storage.fail='';storage.setItem(COMMITMENT_STORAGE_KEY,JSON.stringify([promise]));});
test('preview discloses selected promise fields, preserves unknowns and excludes private internal references',()=>{
 const statement=previewSharedCommitment(scope,promise,parties);assert.equal(statement.promise.completionEvidence,null);assert.equal(statement.authority.recipientAccepted,false);
 for(const privateValue of ['private-id','private-account','Private name','private-opportunity','private-source'])assert.equal(JSON.stringify(statement).includes(privateValue),false);
 assert.equal(previewSharedCommitment(scope,promise,{...parties,includeCompletionEvidence:true}).promise.completionEvidence,'Recipient signed receipt');
 assert.equal(storage.data.size,1);assert.throws(()=>previewSharedCommitment({userId:'other',sampleDataActive:false},promise,parties),/owner scope/);
});
test('issuance requires confirmation and unchanged current canonical source; retries preserve the first event',()=>{
 const statement=previewSharedCommitment(scope,promise,parties);assert.throws(()=>issueSharedCommitment(scope,promise.id,statement,false),/Confirm/);
 storage.setItem(COMMITMENT_STORAGE_KEY,JSON.stringify([{...promise,commitmentText:'Changed promise'}]));assert.throws(()=>issueSharedCommitment(scope,promise.id,statement,true),/changed/);
 storage.setItem(COMMITMENT_STORAGE_KEY,JSON.stringify([promise]));issueSharedCommitment(scope,promise.id,statement,true);const rows=JSON.parse(storage.getItem(EVENT_STORAGE_KEY));assert.equal(rows.length,1);assert.ok(isSharedCommitmentPublication(rows[0]));
 issueSharedCommitment(scope,promise.id,statement,true);assert.deepEqual(JSON.parse(storage.getItem(EVENT_STORAGE_KEY)),rows);
 assert.throws(()=>issueSharedCommitment(scope,promise.id,{...statement,commitmentRef:'ALTERED'},true),/conflicts/);
});
test('recipient intake remains an idempotent unaccepted observation, never updates private canonical records',async()=>{
 const statement=previewSharedCommitment(scope,promise,parties);await assert.rejects(receiveSharedCommitment(scope,statement,'other-ref',true),/recipient/);
 const receiver={userId:'recipient',sampleDataActive:false};const first=await receiveSharedCommitment(receiver,statement,'org-b',true);const retry=await receiveSharedCommitment(receiver,statement,'org-b',true);
 assert.equal(retry.duplicate,true);assert.equal(first.event.eventType,'external_observation_received');assert.equal(first.event.commitmentId,null);assert.deepEqual(JSON.parse(first.event.structuredPayload.rawText),statement);
 assert.deepEqual(JSON.parse(storage.getItem(COMMITMENT_STORAGE_KEY)),[promise]);assert.equal(storage.data.size,2);
});
test('strict statement schema refuses authority forgery, extra private fields and unsupported completion evidence',()=>{
 const statement=previewSharedCommitment(scope,promise,parties);
 for(const patch of [{version:2},{accountId:'private'},{authority:{kind:'issuer-declaration',recipientAccepted:true}},{promise:{...statement.promise,status:'open',completionEvidence:'Forged proof'}},{promise:{...statement.promise,dueDate:'2026-02-31'}}])assert.throws(()=>normalizeSharedCommitment({...statement,...patch}));
 assert.throws(()=>normalizeSharedCommitment({...statement,issuer:{...statement.issuer,verified:true}}));
});
test('sample statements stay partitioned and are excluded from personal backup restore',async()=>{
 const sample={...promise,userId:null,isSample:true};storage.setItem(COMMITMENT_STORAGE_KEY,JSON.stringify([sample]));const sampleScope={userId:null,sampleDataActive:true};const statement=previewSharedCommitment(sampleScope,sample,parties);
 await assert.rejects(receiveSharedCommitment(scope,statement,'org-b',true),/sample/);issueSharedCommitment(sampleScope,sample.id,statement,true);
 const event=JSON.parse(storage.getItem(EVENT_STORAGE_KEY))[0];assert.ok(eventCodec.sanitize(event));assert.equal(eventCodec.sanitize({...event,recordedAt:null}),null);
 const plan=buildRestorePlan({formatVersion:15,exportedAt:new Date().toISOString(),localBrowserData:{[EVENT_STORAGE_KEY]:[event]}});assert.deepEqual(JSON.parse(plan.writes.find(w=>w.key===EVENT_STORAGE_KEY).value),[]);
});
test('issued real statement survives codec and current backup restore without widening disclosure',()=>{
 const statement=previewSharedCommitment(scope,promise,parties);issueSharedCommitment(scope,promise.id,statement,true);const event=JSON.parse(storage.getItem(EVENT_STORAGE_KEY))[0];assert.deepEqual(eventCodec.fromRow(eventCodec.toRow(event,'owner')).structuredPayload,statement);
 const plan=buildRestorePlan({formatVersion:15,exportedAt:new Date().toISOString(),localBrowserData:{[EVENT_STORAGE_KEY]:[event]}});assert.deepEqual(JSON.parse(plan.writes.find(w=>w.key===EVENT_STORAGE_KEY).value)[0].structuredPayload,statement);
});
test('failed durable writes and unreadable history never acknowledge issuance',()=>{
 const statement=previewSharedCommitment(scope,promise,parties);storage.fail=EVENT_STORAGE_KEY;assert.throws(()=>issueSharedCommitment(scope,promise.id,statement,true));assert.equal(storage.getItem(EVENT_STORAGE_KEY),null);
 storage.fail='';storage.setItem(EVENT_STORAGE_KEY,'broken');assert.throws(()=>issueSharedCommitment(scope,promise.id,statement,true));assert.equal(storage.getItem(EVENT_STORAGE_KEY),'broken');
});
