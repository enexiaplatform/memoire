import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
class Storage{data=new Map();fail='';get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.fail)throw new Error('Storage unavailable');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage();globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {publishContractObligation}=await import('../../src/domain/commercialKernel/contractObligationCommands.ts');
const {readContractObligation}=await import('../../src/domain/commercialKernel/contractObligation.ts');
const {loadContractObligations,CONTRACT_OBLIGATION_STORAGE_KEY}=await import('../../src/services/commercialKernel/contractObligationStore.ts');
const {projectOutcomeRequirements}=await import('../../src/domain/commercialKernel/outcomeRequirement.ts');
const {decodeHistoricalStorage}=await import('../../src/services/historicalStorageCodec.ts');
const {getLocalHistoricalSourcesAt}=await import('../../src/services/historicalQuery.ts');
const {composeCommercialStateAsOf}=await import('../../src/services/commercialTimeMachine.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const at='2026-09-01T00:00:00.000Z',scope={userId:'owner',sampleDataActive:false};
const o={id:'o',userId:'owner',accountId:'a',accountName:'Acme',opportunityName:'Delivery',stage:'Proposal',status:'Active',createdAt:at,updatedAt:at};
const r={id:'r',userId:'owner',accountId:'a',opportunityId:'o',expectedOutcome:'Delivery accepted',question:null,conditionId:null,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
const c={id:'c',userId:'owner',accountId:'a',accountName:'Acme',opportunityId:'o',threadId:'t',commitmentParty:'self',ownerLabel:'Operator',commitmentText:'Deliver scope',originalDueDate:'2026-10-01',currentDueDate:'2026-10-01',silenceThresholdDays:3,status:'open',impactType:'delivery',dueDateHistory:[],sourceType:'manual',createdAt:at,updatedAt:at};
const refs={opportunities:[o],requirements:[r],commitments:[c]};
const input={id:'ob',opportunityId:'o',contractReference:'Contract 42',contractVersion:'Signed v1',acceptedOn:'2026-09-01',acceptanceReference:'Signed copy 42',clause:'Deliver agreed scope',requirementId:'r',commitmentId:'c',revisionReason:'Confirmed interpretation',lifecycle:'active',expectedVersion:0,confirmed:true};
const publish=(patch={},context=refs)=>publishContractObligation(scope,{...input,...patch},context);
beforeEach(()=>{storage.data.clear();storage.fail='';for(const [key,rows] of [['accounts',[{id:'a',userId:'owner'}]],['opportunities',[o]],['outcomeRequirements',[r]],['commercialCommitments',[c]]])storage.setItem('memoire.'+key+'.v1',JSON.stringify(rows));});
test('explicit acceptance confirmation, stable source identity and consecutive revision are required',()=>{
 assert.equal(publish({confirmed:false}).ok,false);assert.equal(publish({acceptedOn:'2099-01-01'}).ok,false);
 assert.equal(publish().ok,true);assert.equal(publish().ok,false);
 assert.equal(publish({expectedVersion:1,contractVersion:'Different signed contract'}).ok,false);
 assert.equal(publish({expectedVersion:1,revisionReason:'Correction',clause:'Clarified operational scope'}).value.version,2);
});
test('foreign, absent, closed and retired endpoints cannot establish a new obligation mapping',()=>{
 for(const patch of [{requirements:[]},{requirements:[{...r,userId:'other'}]},{commitments:[{...c,isSample:true}]},{commitments:[{...c,status:'completed'}]},{requirements:[{...r,lifecycle:'retired'}]}])assert.equal(publish({}, {...refs,...patch}).ok,false);
});
test('completed promise never substitutes for supported contractual outcome; missing timing and money stay explicit',()=>{
 const row=publish().value,view=readContractObligation(row,projectOutcomeRequirements([r],[],[]),[{...c,status:'completed'}],[],[]);
 assert.notEqual(view.outcome,'resolved');assert.equal(view.commitment.status,'completed');assert.equal(view.timingLinks.length,0);assert.equal(view.moneyLinks.length,0);
});
test('only scoped canonical readings and explicit contractual links enter the operational chain',()=>{
 const row=publish().value,readings=projectOutcomeRequirements([r],[],[]),base={userId:'owner',opportunityId:'o',requirementId:'r',lifecycle:'active'};
 const t={...base,id:'t',kind:'commitment_link',commitmentId:'c'},g={...base,id:'g',basisKind:'contractual_requirement',moneySourceId:'o'};
 const view=readContractObligation(row,readings,[c],[t,{...t,userId:'other'}],[g,{...g,basisKind:'customer_process'}]);assert.equal(view.timingLinks.length,1);assert.equal(view.moneyLinks.length,1);
 assert.equal(readContractObligation(row,readings.map(r=>({...r,projection:true})),[c],[],[]).outcome,'unavailable');
});
test('retirement retains acceptance provenance after endpoints settle',()=>{
 const first=publish().value;const result=publish({expectedVersion:1,lifecycle:'retired'}, {...refs,commitments:[{...c,status:'completed'}],requirements:[{...r,lifecycle:'retired'}]});
 assert.equal(result.ok,true);assert.equal(result.value.acceptanceReference,first.acceptanceReference);
});
test('required revision failure rolls back mapping and corrupt local state refuses writes',()=>{
 const before=[...storage.data];storage.fail='memoire.stateRevisions.v1';assert.equal(publish().ok,false);assert.deepEqual([...storage.data],before);
 storage.fail='';storage.setItem(CONTRACT_OBLIGATION_STORAGE_KEY,'broken');assert.throws(loadContractObligations);assert.equal(publish().ok,false);
});
test('backup preserves links and refuses a missing promise before restore',()=>{
 publish();const local=Object.fromEntries([...storage.data].map(([k,v])=>[k,JSON.parse(k==='memoire.stateRevisions.v1'?decodeHistoricalStorage(v):v)]));
 const file={formatVersion:14,exportedAt:new Date().toISOString(),localBrowserData:local};assert.ok(buildRestorePlan(file).writes.some(w=>w.key===CONTRACT_OBLIGATION_STORAGE_KEY));
 assert.throws(()=>buildRestorePlan({...file,localBrowserData:{...local,'memoire.commercialCommitments.v1':[]}}));
});
test('historical clause mapping retains the earlier interpretation after revision and retirement',()=>{
 publish();const cutoff=JSON.parse(decodeHistoricalStorage(storage.getItem('memoire.stateRevisions.v1'))).find(r=>r.entityType==='commercial_contract_obligations').recordedAt;
 publish({expectedVersion:1,clause:'Later correction',lifecycle:'retired'});
 const result=composeCommercialStateAsOf({sources:getLocalHistoricalSourcesAt('owner',cutoff,storage),scope:'owner',opportunityId:'o',cutoff,timeZone:'UTC'});
 assert.equal(result.status,'available');assert.equal(result.contractObligations[0].obligation.clause,'Deliver agreed scope');assert.equal(result.contractObligations[0].obligation.lifecycle,'active');
});
