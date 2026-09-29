import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
class Storage{data=new Map();fail='';get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}
 setItem(k,v){if(k===this.fail)throw new DOMException('Full','QuotaExceededError');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage(),cloud=new Map(),history=[],writes=[];let signedIn=false;
globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{constructor(type){this.type=type;}};
globalThis.__incidentCloud={auth:{getUser:async()=>({data:{user:signedIn?{id:'owner'}:null},error:null})},rpc:async()=>({data:'2026-09-29T00:00:00Z',error:null}),
 from(table){let id,entityType;return {select(){return this;},eq(key,value){if(key==='id')id=value;if(key==='entity_type')entityType=value;return this;},order(){return this;},
  maybeSingle:async()=>({data:cloud.get(`${table}:${id}`)||null,error:null}),range:async()=>({data:table==='commercial_state_revisions'?history.filter(r=>r.entity_type===entityType):[...cloud.values()].filter(r=>r.table===table).map(r=>r.row),error:null}),
  upsert:async rows=>{for(const row of rows){writes.push([table,row.version]);cloud.set(`${table}:${row.id}`,row);history.push({entity_type:table,state:row});}return {error:null};}};}};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=globalThis.__incidentCloud;export const isPipelineSupabaseConfigured=true;'};return next(url,context);}});
const {publishCommercialPolicy}=await import('../../src/domain/commercialKernel/policyCommands.ts');
const {evaluateCommercialPolicies}=await import('../../src/domain/commercialKernel/commercialPolicy.ts');
const {loadCommercialPolicies}=await import('../../src/services/commercialKernel/policyStore.ts');
const {openCommercialIncident,updateCommercialIncident}=await import('../../src/domain/commercialKernel/incidentCommands.ts');
const {incidentCandidates}=await import('../../src/domain/commercialKernel/commercialIncident.ts');
const {loadCommercialIncidents,INCIDENT_STORAGE_KEY,syncIncidentVersions}=await import('../../src/services/commercialKernel/incidentStore.ts');
const {projectOutcomeRequirements}=await import('../../src/domain/commercialKernel/outcomeRequirement.ts');
const {decodeHistoricalStorage}=await import('../../src/services/historicalStorageCodec.ts');
const {getLocalHistoricalSourcesAt}=await import('../../src/services/historicalQuery.ts');
const {composeCommercialStateAsOf}=await import('../../src/services/commercialTimeMachine.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const at='2026-09-01T00:00:00.000Z',scope={userId:'owner',sampleDataActive:false};
const o={id:'o',userId:'owner',accountId:'a',accountName:'Acme',opportunityName:'Finance review',stage:'Proposal',status:'Active',createdAt:at,updatedAt:at};
const r={id:'r',userId:'owner',accountId:'a',opportunityId:'o',expectedOutcome:'Finance approved',question:null,conditionId:null,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
const policyInput={id:'p',expectedVersion:0,confirmed:true,opportunity:o,title:'Finance review',rationale:'Explicit rule',requirementId:'r',appliesWhen:'always',amount:null,currency:null,lifecycle:'active'};
const readings=()=>projectOutcomeRequirements([r],[],[]);
const input={id:'i',policyId:'p',policyVersion:1,summary:'Approval deviation',materialImpact:'Finance and sales need a coordinated response',coordinator:'Named operator',confirmed:true,opportunity:o};
const open=(patch={})=>openCommercialIncident(scope,{...input,readings:readings(),...patch});
const change=(row,patch={})=>updateCommercialIncident(scope,{id:row.id,expectedUpdatedAt:row.updatedAt,coordinator:row.coordinator,responseNote:'Recorded response',disposition:null,confirmed:true,opportunity:o,readings:readings(),...patch});
const revisions=()=>JSON.parse(decodeHistoricalStorage(storage.getItem('memoire.stateRevisions.v1')||'[]'));
beforeEach(async()=>{await new Promise(r=>setTimeout(r,0));storage.data.clear();storage.fail='';cloud.clear();history.length=0;writes.length=0;signedIn=false;
 storage.setItem('memoire.accounts.v1',JSON.stringify([{id:'a',userId:'owner'}]));storage.setItem('memoire.opportunities.v1',JSON.stringify([o]));storage.setItem('memoire.outcomeRequirements.v1',JSON.stringify([r]));
 assert.equal(publishCommercialPolicy(scope,policyInput,[r]).ok,true);
});
test('candidates derive only from unmet explicit rules, create nothing automatically and deduplicate open coordination',()=>{
 const checks=evaluateCommercialPolicies(loadCommercialPolicies(),o,readings());const before=[...storage.data];
 assert.equal(incidentCandidates(checks,[]).length,1);assert.equal(incidentCandidates(checks,[]).length,1);assert.deepEqual([...storage.data],before);
 const incident=open();assert.equal(incident.ok,true);assert.equal(incidentCandidates(checks,loadCommercialIncidents()).length,0);
 assert.equal(open({id:'duplicate'}).ok,false);assert.equal(loadCommercialIncidents().length,1);
});
test('human confirmation, material impact, scope, exact policy version and canonical readings are required',()=>{
 for(const patch of [{confirmed:false},{materialImpact:''},{coordinator:''},{policyVersion:99},{opportunity:{...o,userId:'other'}},
  {readings:[{...readings()[0],projection:{kind:'scenario_assumption',assumptionId:'s',resolution:'unresolved'}}]}])assert.equal(open(patch).ok,false);
 assert.equal(loadCommercialIncidents().length,0);
});
test('an unmet rule cannot be claimed addressed; explicit dismissal preserves the immutable opening basis',()=>{
 const first=open().value;assert.equal(change(first,{disposition:'addressed'}).ok,false);
 const note=change(first,{responseNote:'Finance and sales reviewed the deviation'});assert.equal(note.ok,true);assert.equal(note.value.version,2);
 assert.equal(change(first).ok,false);
 const closed=change(note.value,{disposition:'dismissed',responseNote:'No further coordination is needed; the rule remains unmet'});assert.equal(closed.ok,true);
 assert.equal(closed.value.status,'closed');assert.deepEqual(closed.value.basisSnapshot,first.basisSnapshot);assert.equal(change(closed.value).ok,false);
});
test('addressed closure requires a current supported outcome and an explicit human response note',()=>{
 const incident=open().value;
 const c={id:'c',userId:'owner',accountId:'a',opportunityId:'o',statement:'Finance approved',intent:'hypothesis',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,evidenceLinks:[{evidenceId:'e',assessment:'supports',recordedAt:at}]};
 const e={id:'e',userId:'owner',accountId:'a',opportunityId:'o',sourceType:'manual',summary:'Approved',evidenceText:'Finance approved',category:'commercial',direction:'positive',observedAt:'2026-09-01',recordedAt:at,createdAt:at,updatedAt:at};
 const supported=projectOutcomeRequirements([{...r,conditionId:'c'}],[c],[e]);
 assert.equal(change(incident,{disposition:'addressed',readings:supported,responseNote:''}).ok,false);
 assert.equal(change(incident,{disposition:'addressed',readings:supported,responseNote:'Recorded finance approval reviewed'}).value.disposition,'addressed');
});
test('state and required history roll back together; corrupt incident state cannot become an empty list',()=>{
 const before=[...storage.data];storage.fail='memoire.stateRevisions.v1';assert.equal(open().ok,false);assert.deepEqual([...storage.data],before);
 storage.fail=INCIDENT_STORAGE_KEY;assert.equal(open().ok,false);assert.deepEqual([...storage.data],before);
 storage.fail='';storage.setItem(INCIDENT_STORAGE_KEY,'unreadable');assert.throws(loadCommercialIncidents);assert.equal(open().ok,false);
});
test('offline response versions synchronize after their policy and retry without duplicating versions',async()=>{
 const first=open().value;const second=change(first).value;change(second,{disposition:'dismissed'});await new Promise(r=>setTimeout(r,0));signedIn=true;
 await syncIncidentVersions(loadCommercialIncidents());assert.deepEqual(writes,[['commercial_policies',1],['commercial_incidents',1],['commercial_incidents',2],['commercial_incidents',3]]);
 await syncIncidentVersions(loadCommercialIncidents());assert.equal(writes.length,4);
});
test('backup restores basis and response, rejects missing policy anchors, and drops samples',()=>{
 const first=open().value;change(first,{disposition:'dismissed'});
 const local=Object.fromEntries([...storage.data].map(([k,v])=>[k,JSON.parse(k==='memoire.stateRevisions.v1'?decodeHistoricalStorage(v):v)]));
 const file={formatVersion:13,exportedAt:new Date().toISOString(),localBrowserData:local};
 const plan=buildRestorePlan(file);assert.equal(JSON.parse(plan.writes.find(w=>w.key===INCIDENT_STORAGE_KEY).value)[0].status,'closed');
 assert.throws(()=>buildRestorePlan({...file,localBrowserData:{...local,'memoire.commercialPolicies.v1':[]}}),/original.*Policy/i);
 const sample={...first,isSample:true,basisSnapshot:{...first.basisSnapshot,policy:{...first.basisSnapshot.policy,isSample:true}}};
 assert.equal(buildRestorePlan({formatVersion:13,exportedAt:at,localBrowserData:{[INCIDENT_STORAGE_KEY]:[sample]}}).droppedSampleRecords,1);
});
test('historical Incident stays open at its original cutoff despite future response and closure',()=>{
 const first=open().value,cutoff=revisions().find(row=>row.entityType==='commercial_incidents').recordedAt;change(first,{disposition:'dismissed'});
 const sources=getLocalHistoricalSourcesAt('owner',cutoff,storage),result=composeCommercialStateAsOf({sources,scope:'owner',opportunityId:'o',cutoff,timeZone:'UTC'});
 assert.equal(result.status,'available');assert.equal(result.incidents[0].status,'open');assert.equal(result.incidents[0].version,1);assert.equal(result.incidents[0].closedAt,null);
});
