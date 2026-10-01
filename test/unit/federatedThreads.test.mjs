import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
class Storage{data=new Map();fail='';get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.fail)throw Error('Storage full');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage();globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {previewSharedCommitment}=await import('../../src/domain/commercialKernel/sharedCommitment.ts');
const {issueSharedCommitment}=await import('../../src/domain/commercialKernel/sharedCommitmentCommands.ts');
const {normalizeFederatedThreadExchange,verifyFederatedThreadExchange,deriveFederatedThreads}=await import('../../src/domain/commercialKernel/federatedThread.ts');
const {previewFederatedThread,issueFederatedThread,receiveFederatedThread}=await import('../../src/domain/commercialKernel/federatedThreadCommands.ts');
const {createTrustCapsule}=await import('../../src/domain/commercialKernel/trustCapsule.ts');
const {loadEvents,EVENT_STORAGE_KEY,eventCodec}=await import('../../src/services/commercialKernel/eventStore.ts');
const {COMMITMENT_STORAGE_KEY,commitmentCodec}=await import('../../src/services/commercialKernel/commitmentStore.ts');
const {THREAD_STORAGE_KEY,threadCodec}=await import('../../src/services/commercialKernel/threadStore.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const scope={userId:'owner',sampleDataActive:false},at='2026-09-01T00:00:00.000Z';
const promise=commitmentCodec.sanitize({id:'private-promise',userId:'owner',ownerLabel:'Person',commitmentText:'Deliver goods',status:'open',updatedAt:at,createdAt:at,sourceType:'manual'});
const thread=threadCodec.sanitize({id:'private-thread',userId:'owner',accountName:'Secret account',title:'Private thread title',objective:'Private objective',updatedAt:at,createdAt:at,sourceType:'manual'});
let statement;
beforeEach(()=>{storage.data.clear();storage.fail='';storage.setItem(COMMITMENT_STORAGE_KEY,JSON.stringify([promise]));storage.setItem(THREAD_STORAGE_KEY,JSON.stringify([thread]));statement=previewSharedCommitment(scope,promise,{issuer:{reference:'org-a',label:'Issuer'},recipient:{reference:'org-b',label:'Recipient'},commitmentRef:'PUBLIC-42',includeCompletionEvidence:false});issueSharedCommitment(scope,promise.id,statement,true);});
const input=()=>({threadId:thread.id,reference:'PUBLIC-THREAD',objective:'Public delivery outcome',issuer:statement.issuer,recipient:statement.recipient,eventIds:['shared-commitment:'+statement.statementId]});
test('federation preview derives selected existing claims and excludes private canonical context',async()=>{
 const preview=await previewFederatedThread(scope,input());const serialized=JSON.stringify(preview.exchange);for(const value of ['private-thread','private-promise','Secret account','Private thread title','Private objective'])assert.equal(serialized.includes(value),false);
 assert.equal(preview.exchange.authority.recipientAccepted,false);assert.equal(preview.exchange.capsules.length,1);assert.equal(loadEvents().length,1);
 await assert.rejects(previewFederatedThread({...scope,userId:'foreign'},input()),/owner scope/);await assert.rejects(previewFederatedThread(scope,{...input(),eventIds:['foreign-event']}),/outside/);
});
test('confirmed issuance refuses stale local source and creates only an immutable exchange fact',async()=>{
 const preview=await previewFederatedThread(scope,input());await assert.rejects(issueFederatedThread(scope,{...preview,threadId:thread.id,confirmed:false}),/Confirm/);
 storage.setItem(THREAD_STORAGE_KEY,JSON.stringify([{...thread,updatedAt:'2026-10-01T01:00:00.000Z'}]));await assert.rejects(issueFederatedThread(scope,{...preview,threadId:thread.id,confirmed:true}),/changed/);
 storage.setItem(THREAD_STORAGE_KEY,JSON.stringify([thread]));await issueFederatedThread(scope,{...preview,threadId:thread.id,confirmed:true});await issueFederatedThread(scope,{...preview,threadId:thread.id,confirmed:true});assert.equal(loadEvents().length,2);assert.deepEqual(JSON.parse(storage.getItem(THREAD_STORAGE_KEY)),[thread]);
});
test('packet scope, bounds, duplicate identities and cryptographic tampering fail closed',async()=>{
 const {exchange}=await previewFederatedThread(scope,input());
 for(const patch of [{recipient:{reference:'third-party',label:'Third'}},{capsules:[...exchange.capsules,...exchange.capsules]},{privateNote:'Secret'},{sample:true},{authority:{kind:'issuer-declaration',recipientAccepted:true}}])assert.throws(()=>normalizeFederatedThreadExchange({...exchange,...patch}));
 const changed=structuredClone(exchange);changed.capsules[0].statement.promise.text='Forged claim';await assert.rejects(verifyFederatedThreadExchange(changed),/integrity/);
});
test('recipient receipt stays independent, idempotent and unaccepted under its own account',async()=>{
 const {exchange}=await previewFederatedThread(scope,input()),receiver={userId:'receiver',sampleDataActive:false};await assert.rejects(receiveFederatedThread(receiver,exchange,'wrong',true),/recipient/);
 const first=await receiveFederatedThread(receiver,exchange,'org-b',true),retry=await receiveFederatedThread(receiver,exchange,'org-b',true);assert.equal(retry.duplicate,true);assert.equal(first.event.threadId,null);assert.deepEqual(JSON.parse(first.event.structuredPayload.rawText),exchange);assert.deepEqual(JSON.parse(storage.getItem(THREAD_STORAGE_KEY)),[thread]);
});
test('historical grouping uses local knowledge time, isolates scopes and reports disagreements without consensus',async()=>{
 const {exchange}=await previewFederatedThread(scope,input()),receiver={userId:'receiver',sampleDataActive:false};const receipt=await receiveFederatedThread(receiver,{...exchange,issuedAt:'2000-01-01T00:00:00Z'},'org-b',true);
 const cutoff=new Date(Date.parse(receipt.event.recordedAt)-1).toISOString();assert.equal((await deriveFederatedThreads(receiver,loadEvents(),cutoff)).groups.length,0);
 const other=await receiveFederatedThread(receiver,{...exchange,exchangeId:crypto.randomUUID(),thread:{...exchange.thread,objective:'Different objective'}},'org-b',true);
 const view=await deriveFederatedThreads(receiver,loadEvents(),new Date(Date.parse(other.event.recordedAt)+1).toISOString());assert.equal(view.groups.length,1);assert.equal(view.groups[0].objectiveDisagreement,true);assert.equal(view.acceptedCommercialTruth,false);
 const future={...receipt.event,id:'future',recordedAt:'2099-01-01T00:00:00Z'};assert.equal((await deriveFederatedThreads(receiver,[future],new Date().toISOString())).groups.length,0);assert.equal((await deriveFederatedThreads(scope,[receipt.event],new Date().toISOString())).groups.length,0);
 const offset={...receipt.event,recordedAt:'2026-10-01T08:00:00+07:00'};assert.equal((await deriveFederatedThreads(receiver,[offset],'2026-10-01T00:59:59.999Z')).groups.length,0);assert.equal((await deriveFederatedThreads(receiver,[offset],'2026-10-01T01:00:00.000Z')).groups.length,1);
});
test('statement identity collisions remain explicit conflicts rather than silent overwrite',async()=>{
 const {exchange}=await previewFederatedThread(scope,input()),receiver={userId:'receiver',sampleDataActive:false};await receiveFederatedThread(receiver,exchange,'org-b',true);
 const changed=await createTrustCapsule({...statement,promise:{...statement.promise,text:'Different issuer claim'}});await receiveFederatedThread(receiver,{...exchange,exchangeId:crypto.randomUUID(),capsules:[changed]},'org-b',true);
 assert.equal((await deriveFederatedThreads(receiver,loadEvents(),new Date().toISOString())).groups[0].statementIdentityConflict,true);
});
test('exchange facts retain codec/backup identity and cannot succeed when durable storage fails',async()=>{
 const preview=await previewFederatedThread(scope,input());storage.fail=EVENT_STORAGE_KEY;await assert.rejects(issueFederatedThread(scope,{...preview,threadId:thread.id,confirmed:true}));storage.fail='';await issueFederatedThread(scope,{...preview,threadId:thread.id,confirmed:true});
 const event=loadEvents().find(row=>row.eventType==='federated_thread_issued');assert.ok(eventCodec.sanitize(event));const plan=buildRestorePlan({formatVersion:15,exportedAt:new Date().toISOString(),localBrowserData:{[EVENT_STORAGE_KEY]:[event]}});assert.deepEqual(JSON.parse(plan.writes.find(row=>row.key===EVENT_STORAGE_KEY).value)[0].structuredPayload,preview.exchange);
});
