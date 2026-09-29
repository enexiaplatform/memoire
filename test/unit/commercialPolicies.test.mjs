import {beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
class Storage{
 data=new Map();fail='';get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}
 getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.fail)throw new DOMException('Full','QuotaExceededError');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}
}
const storage=new Storage(),cloud=new Map(),cloudHistory=[],writes=[];let signedIn=false;
globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;
globalThis.CustomEvent=class{constructor(type,init){this.type=type;this.detail=init?.detail;}};
globalThis.__policyCloud={auth:{getUser:async()=>({data:{user:signedIn?{id:'owner'}:null},error:null})},
 rpc:async()=>({data:'2026-09-28T00:00:00Z',error:null}),from(table){let id;
 return {select(){return this;},eq(key,value){if(key==='id')id=value;return this;},order(){return this;},
 range:async()=>({data:table==='commercial_state_revisions'?cloudHistory:[...cloud.values()],error:null}),maybeSingle:async()=>({data:cloud.get(id)||null,error:null}),
 upsert:async rows=>{for(const row of rows){writes.push(row.version);cloud.set(row.id,row);cloudHistory.push({state:row});}return {error:null};}};}};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,
 source:'export const supabaseClient=globalThis.__policyCloud;export const isPipelineSupabaseConfigured=true;'};return next(url,context);}});
const {evaluateCommercialPolicies,isCommercialPolicy}=await import('../../src/domain/commercialKernel/commercialPolicy.ts');
const {publishCommercialPolicy}=await import('../../src/domain/commercialKernel/policyCommands.ts');
const {policyCodec,POLICY_STORAGE_KEY,loadCommercialPolicies,syncPolicyVersions,loadCommercialPoliciesForWorkspace}=await import('../../src/services/commercialKernel/policyStore.ts');
const {projectOutcomeRequirements}=await import('../../src/domain/commercialKernel/outcomeRequirement.ts');
const {getLocalHistoricalSourcesAt}=await import('../../src/services/historicalQuery.ts');
const {composeCommercialStateAsOf}=await import('../../src/services/commercialTimeMachine.ts');
const {decodeHistoricalStorage}=await import('../../src/services/historicalStorageCodec.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const at='2026-09-01T00:00:00.000Z';
const o={id:'o',userId:'owner',accountId:'a',accountName:'Acme',opportunityName:'Approval',stage:'Proposal',status:'Active',estimatedValue:600_000_000,currency:'VND',createdAt:at,updatedAt:at};
const r={id:'r',userId:'owner',accountId:'a',opportunityId:'o',expectedOutcome:'Finance approval is evidenced',question:null,conditionId:null,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
const scope={userId:'owner',sampleDataActive:false};
const input={id:'p',expectedVersion:0,confirmed:true,opportunity:o,title:'Finance review',rationale:'Finance review above the agreed limit',requirementId:'r',appliesWhen:'value_above',amount:500_000_000,currency:'VND',lifecycle:'active'};
const publish=(patch={})=>publishCommercialPolicy(scope,{...input,...patch},[r]);
const revisions=()=>JSON.parse(decodeHistoricalStorage(storage.getItem('memoire.stateRevisions.v1')||'[]'));
beforeEach(async()=>{await new Promise(resolve=>setTimeout(resolve,0));signedIn=false;storage.data.clear();storage.fail='';cloud.clear();cloudHistory.length=0;writes.length=0;
 storage.setItem('memoire.accounts.v1',JSON.stringify([{id:'a',userId:'owner'}]));storage.setItem('memoire.opportunities.v1',JSON.stringify([o]));
 storage.setItem('memoire.outcomeRequirements.v1',JSON.stringify([r]));});
test('explicit confirmation, workspace, Requirement and stale version govern every publication',()=>{
 assert.equal(publish({confirmed:false}).ok,false);assert.equal(storage.getItem(POLICY_STORAGE_KEY),null);
 assert.equal(publish({opportunity:{...o,userId:'other'}}).ok,false);
 assert.equal(publish({requirementId:'missing'}).ok,false);
 assert.equal(publish().value.version,1);assert.equal(publish().ok,false);
 assert.equal(publish({expectedVersion:1,rationale:'Human revised the limit',amount:700_000_000}).value.version,2);
 assert.deepEqual(revisions().filter(row=>row.entityType==='commercial_policies').map(row=>row.state.version),[1,2]);
});
test('derived checks explain exact thresholds, evidence, conflicting evidence and currency gaps',()=>{
 const p=publish().value;
 const check=(opportunity=o,readings=projectOutcomeRequirements([r],[],[]))=>evaluateCommercialPolicies([p],opportunity,readings)[0];
 assert.equal(check().status,'breached');assert.equal(check({...o,estimatedValue:500_000_000}).status,'not_applicable');
 assert.equal(check({...o,currency:'USD'}).status,'unknown');assert.equal(check({...o,estimatedValue:undefined}).status,'unknown');
 const c={id:'c',userId:'owner',accountId:'a',opportunityId:'o',statement:'Finance approved',intent:'hypothesis',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,evidenceLinks:[{evidenceId:'e',assessment:'supports',recordedAt:at}]};
 const e={id:'e',userId:'owner',accountId:'a',opportunityId:'o',sourceType:'manual',summary:'Approval',evidenceText:'Finance approved',category:'commercial',direction:'positive',observedAt:'2026-09-01',recordedAt:at,createdAt:at,updatedAt:at};
 const reading=projectOutcomeRequirements([{...r,conditionId:'c'}],[c],[e]);assert.equal(check(o,reading).status,'satisfied');
 assert.ok(check(o,reading).sourceRecordIds.includes('e'));
 assert.equal(check(o,[{...reading[0],resolution:'resolved',projection:{kind:'scenario_assumption',assumptionId:'sim',resolution:'resolved'}}]).status,'unknown');
 assert.equal(check(o,projectOutcomeRequirements([{...r,conditionId:'c'}],[{...c,evidenceLinks:[{...c.evidenceLinks[0],assessment:'contradicts'}]}],[e])).status,'breached');
 assert.equal(evaluateCommercialPolicies([{...p,userId:'other'},{...p,isSample:true}],o,reading).length,0);
});
test('policy and its required Revision either both persist or both roll back',()=>{
 storage.fail='memoire.stateRevisions.v1';const before=[...storage.data];assert.equal(publish().ok,false);assert.deepEqual([...storage.data],before);
 storage.fail=POLICY_STORAGE_KEY;assert.equal(publish().ok,false);assert.deepEqual([...storage.data],before);
});
test('corrupt or duplicate local records never become an empty policy set',()=>{
 storage.setItem(POLICY_STORAGE_KEY,'broken');assert.throws(loadCommercialPolicies);assert.equal(publish().ok,false);
 storage.removeItem(POLICY_STORAGE_KEY);const p=publish().value;storage.setItem(POLICY_STORAGE_KEY,JSON.stringify([p,p]));assert.throws(loadCommercialPolicies,/identities/);
 assert.equal(isCommercialPolicy({...p,amount:Infinity}),false);assert.equal(isCommercialPolicy({...p,sourceType:'observed_pattern'}),false);
});
test('offline publications synchronize every version in order and retries are idempotent',async()=>{
 publish();publish({expectedVersion:1,rationale:'Second human rule',amount:700_000_000});publish({expectedVersion:2,rationale:'Retire rule',lifecycle:'retired'});
 await new Promise(resolve=>setTimeout(resolve,0));signedIn=true;
 await syncPolicyVersions(loadCommercialPolicies());assert.deepEqual(writes,[1,2,3]);
 await syncPolicyVersions(loadCommercialPolicies());assert.deepEqual(writes,[1,2,3]);
});
test('cloud conflict cannot silently overwrite a local policy version',async()=>{
 const p=publish().value;await new Promise(resolve=>setTimeout(resolve,0));cloud.set(p.id,policyCodec.toRow({...p,title:'Different human edit'},'owner'));
 await assert.rejects(loadCommercialPoliciesForWorkspace('owner'),/conflict/);assert.equal(loadCommercialPolicies()[0].title,p.title);
});
test('a later cloud version can replace a local copy only when its accepted history includes that exact local version',async()=>{
 const p=publish().value;await new Promise(resolve=>setTimeout(resolve,0));
 const later=policyCodec.toRow({...p,version:2,title:'Later rule',updatedAt:new Date(Date.parse(p.updatedAt)+1000).toISOString()},'owner');
 cloud.set(p.id,later);await assert.rejects(loadCommercialPoliciesForWorkspace('owner'),/conflict/);assert.equal(loadCommercialPolicies()[0].version,1);
 cloudHistory.push({state:policyCodec.toRow(p,'owner')});
 assert.equal((await loadCommercialPoliciesForWorkspace('owner'))[0].version,2);
});
test('sample rules never synchronize or enter a real restore plan',async()=>{
 const sample=publishCommercialPolicy({userId:'owner',sampleDataActive:true},{...input,opportunity:{...o,isSample:true}},[{...r,isSample:true}]);
 assert.equal(sample.ok,true);signedIn=true;await syncPolicyVersions([sample.value]);assert.deepEqual(writes,[]);
 const plan=buildRestorePlan({formatVersion:12,exportedAt:at,localBrowserData:{[POLICY_STORAGE_KEY]:[sample.value]}});
 assert.equal(plan.droppedSampleRecords,1);
});
test('backup keeps rule versions and refuses missing or cross-owner Requirement anchors',()=>{
 const p=publish().value;const local=Object.fromEntries([...storage.data].map(([key,value])=>[key,JSON.parse(key==='memoire.stateRevisions.v1'?decodeHistoricalStorage(value):value)]));
 const plan=buildRestorePlan({formatVersion:12,exportedAt:new Date().toISOString(),localBrowserData:local});
 assert.equal(JSON.parse(plan.writes.find(row=>row.key===POLICY_STORAGE_KEY).value)[0].version,1);
 const invalid={...local,'memoire.stateRevisions.v1':undefined,'memoire.historyCoverage.v1':undefined,[POLICY_STORAGE_KEY]:[{...p,requirementId:'missing'}]};
 delete invalid['memoire.stateRevisions.v1'];delete invalid['memoire.historyCoverage.v1'];
 assert.throws(()=>buildRestorePlan({formatVersion:12,exportedAt:at,localBrowserData:invalid}),/Requirement/);
});
test('Time Machine reads the published version and Requirement at the cutoff without a future rule leak',()=>{
 publish();const first=revisions().find(row=>row.entityType==='commercial_policies');
 publish({expectedVersion:1,title:'Future rule',rationale:'Later policy change',amount:700_000_000});
 const sources=getLocalHistoricalSourcesAt('owner',first.recordedAt,storage);
 const result=composeCommercialStateAsOf({sources,scope:'owner',opportunityId:'o',cutoff:first.recordedAt,timeZone:'UTC'});
 assert.equal(result.status,'available');assert.equal(result.policyChecks[0].policy.version,1);assert.equal(result.policyChecks[0].status,'breached');
 assert.equal(result.policyChecks[0].policy.title,'Finance review');
});
