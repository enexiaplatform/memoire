import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';import {readFileSync} from 'node:fs';
class Storage{data=new Map();fail='';get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.fail)throw Error('Storage full');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage();globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {publicState}=await import('../support/commercialProtocolFixture.mjs');
const {normalizeCommercialProtocol,createCommercialProtocol,verifyCommercialProtocol,protocolFromCrossCompanyState}=await import('../../src/domain/commercialKernel/commercialProtocol.ts');
const {exportCommercialProtocol,receiveCommercialProtocol,deriveProtocolHistory}=await import('../../src/domain/commercialKernel/commercialProtocolCommands.ts');
const {EVENT_STORAGE_KEY,eventCodec,loadEvents}=await import('../../src/services/commercialKernel/eventStore.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const scope={userId:'owner',sampleDataActive:false};let state,message;
const core=m=>{const {integrity,signature,...rest}=m;return rest;};
beforeEach(async()=>{storage.data.clear();storage.fail='';state=await publicState();message=await protocolFromCrossCompanyState(state);});
test('v1 deterministic public message covers all ten concepts and retains independent local authority',async()=>{
 const checked=await verifyCommercialProtocol(message,{recipientReference:'org-b'});assert.equal(checked.acceptedCommercialTruth,false);assert.equal(checked.signatureVerified,null);assert.equal(checked.issuerOrganizationIdentityVerified,false);assert.equal(message.body.outcome.sharedAcceptance,false);
 assert.equal(message.body.requirements[1].localAssessment,'unresolved');assert.equal(message.body.evidenceReferences[0].recipientAccepted,false);assert.deepEqual(message.body.conditions,[]);assert.deepEqual(message.body.moneyReferences,[]);
 assert.deepEqual(await protocolFromCrossCompanyState(state),message);for(const forbidden of ['userId','opportunityId','accountId','private-thread','sourceUpdatedAtPrivate'])assert.equal(JSON.stringify(message).includes(forbidden),false);
 const reordered=Object.fromEntries(Object.entries(message).reverse());assert.deepEqual((await verifyCommercialProtocol(reordered)).message,message);const changed=structuredClone(message);changed.body.parties.reverse();await assert.rejects(verifyCommercialProtocol(changed),/integrity/);
 assert.deepEqual(JSON.parse(readFileSync('docs/protocol/commercial-v1.example.json','utf8')),message);
});
test('condition and money references are bounded declarations; undisclosed values are never invented',async()=>{
 const value=core(message);value.body.conditions=[{reference:'CONDITION',partyReference:'org-b',statement:'Reported shipping prerequisite',assessment:'unknown',assessedBy:'org-a'}];value.body.requirements[1].conditionReference='CONDITION';value.body.moneyReferences=[{reference:'INVOICE',partyReference:'org-b',externalReference:'PUBLIC-INVOICE',currency:'USD'}];const explicit=await createCommercialProtocol(value);assert.equal((await verifyCommercialProtocol(explicit)).acceptedCommercialTruth,false);
 for(const patch of [{...explicit.body.moneyReferences[0],amount:42},{...explicit.body.moneyReferences[0],currency:'usd'},{...explicit.body.moneyReferences[0],partyReference:'other'}])assert.throws(()=>normalizeCommercialProtocol({...explicit,body:{...explicit.body,moneyReferences:[patch]}}));
 assert.throws(()=>normalizeCommercialProtocol({...explicit,body:{...explicit.body,conditions:[{...explicit.body.conditions[0],assessment:'accepted'}]}}));
});
test('unknown fields, invented authority, foreign parties, cycles and dangling references fail closed',()=>{
 const values=[{...message,version:2},{...message,issuedAt:'2026-02-31T00:00:00Z'},{...message,issuedAt:'2026-10-01T00:00:00'},{...message,privateNote:'secret'},
 {...message,body:{...message.body,decisionBoundary:{...message.body.decisionBoundary,canonicalMutationAllowed:true}}},
 {...message,body:{...message.body,requirements:[...message.body.requirements,message.body.requirements[0]]}},
 {...message,body:{...message.body,requirements:[{...message.body.requirements[0],conditionReference:'missing'}]}},
 {...message,body:{...message.body,dependencies:[{...message.body.dependencies[0],prerequisiteReference:'missing'}]}},
 {...message,body:{...message.body,dependencies:[...message.body.dependencies,{dependentReference:'SHIPMENT',prerequisiteReference:'DELIVERY',basis:'Cycle',assertedBy:'org-a'}]}},
 {...message,body:{...message.body,evidenceReferences:[{...message.body.evidenceReferences[0],recipientAccepted:true}]}},
 {...message,body:{...message.body,commitments:[{...message.body.commitments[0],capsuleDigest:'f'.repeat(64)}]}}];
 for(const value of values)assert.throws(()=>normalizeCommercialProtocol(value));
 const odd=structuredClone(message);odd.body.outcome.statement='Bad\ud800';assert.throws(()=>normalizeCommercialProtocol(odd));
});
test('whole-message signing covers scope, requirements and nested claims; agreed key is independent',async()=>{
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),signed=await createCommercialProtocol(core(message),keys),v=await verifyCommercialProtocol(signed);assert.equal(v.signatureVerified,true);assert.equal((await verifyCommercialProtocol(signed,{expectedIssuerKeyFingerprint:v.signerKeyFingerprint})).configuredIssuerKeyMatched,true);
 await assert.rejects(verifyCommercialProtocol(message,{expectedIssuerKeyFingerprint:v.signerKeyFingerprint}),/agreed/);await assert.rejects(verifyCommercialProtocol(signed,{expectedIssuerKeyFingerprint:'f'.repeat(64)}),/agreed/);await assert.rejects(verifyCommercialProtocol(signed,{recipientReference:'other'}),/recipient/);
 const altered=structuredClone(signed);altered.body.outcome.statement='Changed';await assert.rejects(verifyCommercialProtocol(altered),/integrity/);const rehashed=await createCommercialProtocol(core(altered));rehashed.signature=signed.signature;await assert.rejects(verifyCommercialProtocol(rehashed),/signature/);
 const badCapsule=core(message);badCapsule.body.provenance.capsules[0].statement.promise.text='Altered nested source';await assert.rejects(createCommercialProtocol(badCapsule),/integrity/);
 const other=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);await assert.rejects(createCommercialProtocol(core(message),{privateKey:keys.privateKey,publicKey:other.publicKey}),/key pair/);
});
test('export reuses only an issued owner-scoped assessment, refuses corrupt history and creates no new event',async()=>{
 const id='cross-company-state:'+state.stateId,at=state.issuedAt,event=eventCodec.sanitize({id,userId:'owner',eventType:'cross_company_state_issued',occurredAt:at,recordedAt:at,createdAt:at,summary:'Cross-company assessment issued',structuredPayload:state,idempotencyKey:id,sourceType:'manual',sourceId:state.stateId,opportunityId:'private-opportunity'});assert.ok(event);storage.setItem(EVENT_STORAGE_KEY,JSON.stringify([event]));assert.deepEqual(await exportCommercialProtocol(scope,id),message);assert.equal(loadEvents().length,1);
 await assert.rejects(exportCommercialProtocol({...scope,userId:'other'},id),/owner scope/);await assert.rejects(exportCommercialProtocol({...scope,sampleDataActive:true},id),/owner scope/);storage.setItem(EVENT_STORAGE_KEY,'[{}]');await assert.rejects(exportCommercialProtocol(scope,id),/unreadable/);
});
test('checked human receipt is durable, idempotent and never mutates canonical business records',async()=>{
 storage.setItem('memoire.outcomeRequirements.v1','[{"private":"unchanged"}]');await assert.rejects(receiveCommercialProtocol(scope,message,{recipientReference:'org-b',confirmed:false}),/Confirm/);await assert.rejects(receiveCommercialProtocol(scope,message,{recipientReference:'wrong',confirmed:true}),/recipient/);await assert.rejects(receiveCommercialProtocol({...scope,sampleDataActive:true},message,{recipientReference:'org-b',confirmed:true}),/sample/);
 const first=await receiveCommercialProtocol(scope,message,{recipientReference:'org-b',confirmed:true}),retry=await receiveCommercialProtocol(scope,message,{recipientReference:'org-b',confirmed:true});assert.equal(retry.duplicate,true);assert.equal(first.event.opportunityId,null);assert.ok(eventCodec.sanitize(first.event));assert.equal(storage.getItem('memoire.outcomeRequirements.v1'),'[{"private":"unchanged"}]');
 const plan=buildRestorePlan({formatVersion:15,exportedAt:new Date().toISOString(),localBrowserData:{[EVENT_STORAGE_KEY]:[first.event]}});assert.deepEqual(JSON.parse(plan.writes.find(r=>r.key===EVENT_STORAGE_KEY).value)[0].structuredPayload,first.event.structuredPayload);
 storage.data.clear();storage.fail=EVENT_STORAGE_KEY;await assert.rejects(receiveCommercialProtocol(scope,message,{recipientReference:'org-b',confirmed:true}));assert.equal(loadEvents().length,0);
});
test('history uses local receipt time, rejects forged envelope identity and isolates owner/sample',async()=>{
 const future=await createCommercialProtocol({...core(message),issuedAt:'2099-01-01T00:00:00Z'}),received=await receiveCommercialProtocol(scope,future,{recipientReference:'org-b',confirmed:true}),event=received.event;
 const prior=new Date(Date.parse(event.recordedAt)-1).toISOString(),after=new Date(Date.parse(event.recordedAt)+1).toISOString();assert.equal((await deriveProtocolHistory(scope,[event],prior)).messages.length,0);assert.equal((await deriveProtocolHistory(scope,[event],after)).messages.length,1);assert.equal((await deriveProtocolHistory({...scope,userId:'other'},[event],after)).messages.length,0);assert.equal((await deriveProtocolHistory({...scope,sampleDataActive:true},[event],after)).messages.length,0);
 const localOffset={...event,recordedAt:new Date(Date.parse(event.recordedAt)).toISOString().replace('Z','+00:00'),structuredPayload:Object.fromEntries(Object.entries(event.structuredPayload).reverse())};assert.equal((await deriveProtocolHistory(scope,[localOffset],after)).messages.length,1);
 const forged={...event,structuredPayload:{...event.structuredPayload,sourceVersion:'f'.repeat(64)}};assert.deepEqual((await deriveProtocolHistory(scope,[forged],after)).rejectedEventIds,[event.id]);
 const unrelated={...event,structuredPayload:{...event.structuredPayload,sourceNamespace:'crm-export',rawText:'Ordinary non-JSON source observation'}};assert.deepEqual((await deriveProtocolHistory(scope,[unrelated],after)).rejectedEventIds,[]);
});
test('same issuer message identity conflicts remain visible; predecessor links never replace local truth',async()=>{
 const first=await receiveCommercialProtocol(scope,message,{recipientReference:'org-b',confirmed:true});const altered=core(message);altered.body.outcome.statement='Changed assessment';const conflict=await createCommercialProtocol(altered),second=await receiveCommercialProtocol(scope,conflict,{recipientReference:'org-b',confirmed:true});
 const next=core(message);next.messageId=crypto.randomUUID();next.body.change.previousMessageDigest=message.integrity.digest;const linked=await receiveCommercialProtocol(scope,await createCommercialProtocol(next),{recipientReference:'org-b',confirmed:true});const cutoff=new Date(Date.now()+1000).toISOString(),history=await deriveProtocolHistory(scope,loadEvents(),cutoff);assert.equal(history.conflicts.length,2);assert.equal(history.messages.length,3);assert.equal(history.acceptedCommercialTruth,false);assert.deepEqual(history.unresolvedPredecessors,[]);
 assert.deepEqual((await deriveProtocolHistory(scope,[linked.event],cutoff)).unresolvedPredecessors,[linked.event.id]);assert.notEqual(first.event.id,second.event.id);
});
test('bounded intake refuses excessive public payloads and does not turn sample claims into personal recovery',async()=>{
 const oversized=core(message);oversized.body.conditions=Array.from({length:20},(_,i)=>({reference:String(i),partyReference:'org-a',statement:'x'.repeat(1000),assessment:'unknown',assessedBy:'org-a'}));await assert.rejects(createCommercialProtocol(oversized),/20,000/);
 const sampleState=structuredClone(state);sampleState.federation.sample=true;sampleState.federation.capsules[0].statement.sample=true;const {createTrustCapsule}=await import('../../src/domain/commercialKernel/trustCapsule.ts');sampleState.federation.capsules[0]=await createTrustCapsule(sampleState.federation.capsules[0].statement);const sample=await protocolFromCrossCompanyState(sampleState);const result=await receiveCommercialProtocol({...scope,sampleDataActive:true},sample,{recipientReference:'org-b',confirmed:true});
 const plan=buildRestorePlan({formatVersion:15,exportedAt:new Date().toISOString(),localBrowserData:{[EVENT_STORAGE_KEY]:[result.event]}});assert.equal(plan.writes.some(r=>r.key===EVENT_STORAGE_KEY&&JSON.parse(r.value).some(e=>e.id===result.event.id)),false);
});
