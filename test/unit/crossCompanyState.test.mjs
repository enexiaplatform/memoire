import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
class Storage{data=new Map();fail='';get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.fail)throw Error('Storage full');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage();globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {createTrustCapsule}=await import('../../src/domain/commercialKernel/trustCapsule.ts');
const {receiveTrustCapsule}=await import('../../src/domain/commercialKernel/trustCapsuleCommands.ts');
const {previewFederatedThread,issueFederatedThread}=await import('../../src/domain/commercialKernel/federatedThreadCommands.ts');
const {normalizeCrossCompanyState,deriveCrossCompanyState}=await import('../../src/domain/commercialKernel/crossCompanyState.ts');
const {previewCrossCompanyState,issueCrossCompanyState,receiveCrossCompanyState}=await import('../../src/domain/commercialKernel/crossCompanyStateCommands.ts');
const {EVENT_STORAGE_KEY,loadEvents,eventCodec}=await import('../../src/services/commercialKernel/eventStore.ts');
const {THREAD_STORAGE_KEY,threadCodec}=await import('../../src/services/commercialKernel/threadStore.ts');
const {REQUIREMENT_STORAGE_KEY}=await import('../../src/services/commercialKernel/requirementStore.ts');
const {DEPENDENCY_STORAGE_KEY}=await import('../../src/services/commercialKernel/dependencyStore.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const scope={userId:'owner',sampleDataActive:false},at='2026-09-01T00:00:00.000Z';
const requirements=['dependent','prerequisite'].map(id=>({id:'private-'+id,userId:'owner',accountId:'private-account',opportunityId:'private-opportunity',expectedOutcome:id==='dependent'?'Delivery outcome':'Shipment independently verified',question:null,conditionId:null,role:'required_now',lifecycle:'active',createdAt:at,updatedAt:at,sourceType:'manual'}));
const edge={id:'private-edge',userId:'owner',opportunityId:'private-opportunity',dependentRequirementId:'private-dependent',prerequisiteRequirementId:'private-prerequisite',basis:'Shipment is needed before delivery',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
let basis;
beforeEach(async()=>{storage.data.clear();storage.fail='';storage.setItem(THREAD_STORAGE_KEY,JSON.stringify([threadCodec.sanitize({id:'private-thread',userId:'owner',title:'Private title',objective:'Secret objective',createdAt:at,updatedAt:at,sourceType:'manual'})]));storage.setItem(REQUIREMENT_STORAGE_KEY,JSON.stringify(requirements));storage.setItem(DEPENDENCY_STORAGE_KEY,JSON.stringify([edge]));
 const statement={format:'memoire.shared-commitment',version:1,statementId:crypto.randomUUID(),issuedAt:at,issuer:{reference:'org-b',label:'Counterparty'},recipient:{reference:'org-a',label:'Local issuer'},commitmentRef:'REMOTE-SHIPMENT',promise:{responsiblePerson:'Counterparty person',text:'Ship goods',dueDate:null,status:'completed',completionEvidence:'Counterparty reported signed receipt'},sourceUpdatedAt:at,sample:false,authority:{kind:'issuer-declaration',recipientAccepted:false}};
 const received=await receiveTrustCapsule(scope,await createTrustCapsule(statement),{recipientReference:'org-a',confirmed:true});const federation=await previewFederatedThread(scope,{threadId:'private-thread',reference:'PUBLIC-THREAD',objective:'Shared delivery objective',issuer:statement.recipient,recipient:statement.issuer,eventIds:[received.event.id]});await issueFederatedThread(scope,{...federation,threadId:'private-thread',confirmed:true});
 basis={opportunityId:'private-opportunity',federationEventId:'federated-thread:'+federation.exchange.exchangeId,mappings:[{requirementId:'private-dependent',reference:'DELIVERY',partyReference:'org-a',commitmentRef:null},{requirementId:'private-prerequisite',reference:'SHIPMENT',partyReference:'org-b',commitmentRef:'REMOTE-SHIPMENT'}]};
});
test('existing Kernel assessment and graph are reused; remote completed claim never resolves the local requirement',async()=>{
 const preview=await previewCrossCompanyState(scope,basis),view=await deriveCrossCompanyState(preview.state);assert.equal(view.dependencies[0].prerequisiteLocalAssessment,'unresolved');assert.deepEqual(view.dependencies[0].reportedPromiseStatuses,['completed']);assert.equal(view.dependencies[0].independentVerificationNeeded,true);assert.equal(view.sharedOutcomeConfirmed,false);assert.equal(view.acceptedCommercialTruth,false);
 for(const privateValue of ['private-account','private-opportunity','private-edge','private-prerequisite','Secret objective'])assert.equal(JSON.stringify(preview.state).includes(privateValue),false);
});
test('confirmation and exact current source fingerprint govern issuance; changed local sources refuse the preview',async()=>{
 const preview=await previewCrossCompanyState(scope,basis);await assert.rejects(issueCrossCompanyState(scope,{...preview,confirmed:false}),/Confirm/);
 storage.setItem(REQUIREMENT_STORAGE_KEY,JSON.stringify([{...requirements[0],expectedOutcome:'Changed local outcome'},requirements[1]]));await assert.rejects(issueCrossCompanyState(scope,{...preview,confirmed:true}),/changed/);storage.setItem(REQUIREMENT_STORAGE_KEY,JSON.stringify(requirements));
 await issueCrossCompanyState(scope,{...preview,confirmed:true});await issueCrossCompanyState(scope,{...preview,confirmed:true});assert.equal(loadEvents().filter(row=>row.eventType==='cross_company_state_issued').length,1);assert.deepEqual(JSON.parse(storage.getItem(REQUIREMENT_STORAGE_KEY)),requirements);
 storage.setItem(REQUIREMENT_STORAGE_KEY,JSON.stringify([{...requirements[0],expectedOutcome:'Later current state'},requirements[1]]));assert.deepEqual(await issueCrossCompanyState(scope,{...preview,confirmed:true}),preview.state);
});
test('foreign canonical scope, missing references and an actual corrupt canonical dependency cycle fail closed',async()=>{
 await assert.rejects(previewCrossCompanyState({...scope,userId:'other'},basis),/owner scope/);await assert.rejects(previewCrossCompanyState(scope,{...basis,mappings:[basis.mappings[0],{...basis.mappings[1],requirementId:'foreign'}]}),/scope/);
 storage.setItem(DEPENDENCY_STORAGE_KEY,JSON.stringify([edge,{...edge,id:'cycle',dependentRequirementId:edge.prerequisiteRequirementId,prerequisiteRequirementId:edge.dependentRequirementId}]));await assert.rejects(previewCrossCompanyState(scope,basis),/depend on each other/);
});
test('wire references, party assignments, loops and asserted recipient authority are strictly bounded',async()=>{
 const {state}=await previewCrossCompanyState(scope,basis);for(const patch of [{privateNote:'Secret'},{issuedAt:'2026-02-31T00:00:00Z'},{authority:{kind:'issuer-local-assessment',recipientAccepted:true}},{requirements:[state.requirements[0],{...state.requirements[1],partyReference:'foreign'}]},{dependencies:[...state.dependencies,{dependentReference:'SHIPMENT',prerequisiteReference:'DELIVERY',basis:'Cycle'}]}])assert.throws(()=>normalizeCrossCompanyState({...state,...patch}));
 const forged=structuredClone(state);forged.federation.capsules[0].statement.promise.text='Tampered';await assert.rejects(deriveCrossCompanyState(forged),/integrity/);
});
test('recipient intake is idempotent and independent; declared local assessments cannot write recipient canonical state',async()=>{
 const {state}=await previewCrossCompanyState(scope,basis),receiver={userId:'receiver',sampleDataActive:false};await assert.rejects(receiveCrossCompanyState(receiver,state,'foreign',true),/recipient/);await assert.rejects(receiveCrossCompanyState({...receiver,sampleDataActive:true},state,'org-b',true),/sample/);const first=await receiveCrossCompanyState(receiver,state,'org-b',true),retry=await receiveCrossCompanyState(receiver,state,'org-b',true);assert.equal(retry.duplicate,true);assert.equal(first.event.opportunityId,null);assert.deepEqual(JSON.parse(storage.getItem(REQUIREMENT_STORAGE_KEY)),requirements);assert.equal((await deriveCrossCompanyState(JSON.parse(first.event.structuredPayload.rawText))).sharedOutcomeConfirmed,false);
});
test('issued assessment retains durable codec/backup provenance and failed local writes cannot acknowledge success',async()=>{
 const preview=await previewCrossCompanyState(scope,basis);storage.fail=EVENT_STORAGE_KEY;await assert.rejects(issueCrossCompanyState(scope,{...preview,confirmed:true}));storage.fail='';await issueCrossCompanyState(scope,{...preview,confirmed:true});const event=loadEvents().find(row=>row.eventType==='cross_company_state_issued');assert.ok(eventCodec.sanitize(event));const plan=buildRestorePlan({formatVersion:15,exportedAt:new Date().toISOString(),localBrowserData:{[EVENT_STORAGE_KEY]:[event]}});assert.deepEqual(JSON.parse(plan.writes.find(row=>row.key===EVENT_STORAGE_KEY).value)[0].structuredPayload,preview.state);
});
