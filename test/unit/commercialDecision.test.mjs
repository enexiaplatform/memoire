import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

class Storage {data=new Map();refuse='';getItem(k){return this.data.get(k)??null;}setItem(k,v){if(k===this.refuse)throw new Error('quota');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage();
globalThis.window={localStorage:storage,dispatchEvent:()=>true,addEventListener:()=>{},removeEventListener:()=>{}};
globalThis.localStorage=storage;globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,
  source:'export const supabaseClient=null; export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const { finalizeCommercialDecision,linkDecisionExecution }=await import('../../src/domain/commercialKernel/decisionCommands.ts');
const { loadCommercialDecisions,DECISION_STORAGE_KEY }=await import('../../src/services/commercialKernel/decisionStore.ts');
const { EVENT_STORAGE_KEY }=await import('../../src/services/commercialKernel/eventStore.ts');
const { buildRestorePlan }=await import('../../src/utils/workspaceBackup.ts');
const { isSyncableRecord }=await import('../../src/services/commercialKernel/kernelRepository.ts');
const scope={userId:'owner',sampleDataActive:false};
const at='2026-09-19T12:00:00Z';
const opportunity={id:'opp',userId:'owner',accountId:'account',accountName:'Acme',status:'Active',stage:'Proposal'};
const forecast={opportunityId:'opp',claim:{kind:'opportunity_close',targetDate:'2026-10-01',operatorCategory:'Defensible',sourceRecordId:'opp'},
  verdict:'conditional',premises:[{requirementId:'qa',expectedOutcome:'QA acceptance',role:'required_now',state:'assumed',blocked:true,
    conditionId:null,conditionStatement:'QA may approve',evidenceSources:[],evidenceIds:[],sourceRecordIds:['qa']}],
  blockers:[{requirementId:'qa',expectedOutcome:'QA acceptance',state:'assumed',paths:[],sourceRecordIds:['qa']}],
  whatWouldHaveToBeTrue:[{kind:'premise',text:'QA must approve',sourceRecordIds:['qa']}],
  nextQuestion:{requirementId:'qa',question:'Is QA approval complete?'},timing:null,timingEvaluation:'incomplete',
  categoryDisagreement:null,coverage:{requiredNowCount:1,requiredLaterCount:0,linkedLaterCount:0,unscopedLaterCount:0,modeledPremiseCount:1,recordedScopeOnly:true},
  reasonCodes:['EXPLICIT_ASSUMPTION_OR_HYPOTHESIS'],sourceRecordIds:['opp','qa'],calculatedAt:at};
const options=[{id:'a',order:1,label:'Wait',interventionIntent:'Await response',expectedConsequence:'QA may reply',tradeoffs:'Delay'},
  {id:'b',order:2,label:'Escalate',interventionIntent:'Resolve QA ambiguity',expectedConsequence:'Know QA acceptance status',tradeoffs:'Director time'}];
const input=id=>({id,opportunity,forecast,question:'How do we resolve QA?',context:'QA acceptance is uncertain.',options,
  selectedOptionId:'b',rationale:'Director owns the acceptance.',targetKind:'requirement',targetRequirementId:'qa'});
beforeEach(()=>{storage.data.clear();storage.refuse='';});

test('finalization captures the complete situation and chosen Option without mutating the source',()=>{
  const result=finalizeCommercialDecision(scope,input('d1'));assert.equal(result.ok,true);
  const saved=loadCommercialDecisions()[0];assert.equal(saved.options.length,2);assert.equal(saved.selectedOptionId,'b');
  assert.equal(saved.intervention.intent,'Resolve QA ambiguity');assert.equal(saved.executionLinks.length,0);
  assert.equal(saved.basisSnapshot.blockers[0].label,'QA acceptance');
  forecast.blockers[0].expectedOutcome='Changed later';forecast.reasonCodes.push('NEW');
  assert.equal(loadCommercialDecisions()[0].basisSnapshot.blockers[0].label,'QA acceptance');
  assert.deepEqual(loadCommercialDecisions()[0].basisSnapshot.forecast.reasonCodes,['EXPLICIT_ASSUMPTION_OR_HYPOTHESIS']);
  assert.equal(opportunity.stage,'Proposal');
  forecast.blockers[0].expectedOutcome='QA acceptance';forecast.reasonCodes.pop();
});
test('timing assumptions and their human-readable basis remain in the snapshot',()=>{
  const timed={...forecast,timing:{status:'known',targetDate:'2026-10-01',lastSafeDate:'2026-09-26',bufferDays:5,
    assumptionsUsed:true,unknownTimingSegments:[],conflictingTimingSegments:[],timingSources:[{id:'duration',requirementId:'qa',
      basis:'Purchasing usually takes two days',durationDays:2,durationUnit:'calendar_days',epistemic:'assumed',
      sourceKind:'planning_assumption',sourceReference:null,evidenceId:null}]}};
  const result=finalizeCommercialDecision(scope,{...input('timed'),forecast:timed});assert.equal(result.ok,true);
  assert.equal(result.value.basisSnapshot.timing.sources[0].basis,'Purchasing usually takes two days');
  assert.equal(result.value.basisSnapshot.timing.assumptionsUsed,true);
  timed.timing.timingSources[0].basis='Changed';
  assert.equal(loadCommercialDecisions()[0].basisSnapshot.timing.sources[0].basis,'Purchasing usually takes two days');
});
test('choice is required, retries are idempotent, and supersession keeps both snapshots',()=>{
  assert.equal(finalizeCommercialDecision(scope,{...input('bad'),selectedOptionId:''}).ok,false);
  assert.equal(finalizeCommercialDecision(scope,input('d1')).ok,true);
  assert.equal(finalizeCommercialDecision(scope,input('d1')).ok,true);assert.equal(loadCommercialDecisions().length,1);
  const second=finalizeCommercialDecision(scope,{...input('d2'),supersedesDecisionId:'d1'});
  assert.equal(second.ok,true);assert.equal(second.value.supersedesDecisionId,'d1');assert.equal(loadCommercialDecisions().length,2);
});
test('state failure creates no Decision or event; event failure is degraded success',()=>{
  storage.refuse=DECISION_STORAGE_KEY;
  assert.equal(finalizeCommercialDecision(scope,input('d1')).ok,false);assert.equal(storage.getItem(EVENT_STORAGE_KEY),null);
  storage.refuse=EVENT_STORAGE_KEY;
  const result=finalizeCommercialDecision(scope,input('d1'));assert.equal(result.ok,true);assert.match(result.warning,/history/);
  assert.equal(loadCommercialDecisions().length,1);assert.equal(finalizeCommercialDecision(scope,input('d1')).ok,true);
  assert.equal(loadCommercialDecisions().length,1);
});
test('execution connects existing work without creating it or changing Intervention',()=>{
  finalizeCommercialDecision(scope,input('d1'));
  const no=linkDecisionExecution(scope,'d1','action','missing',{plans:[],commitments:[]});assert.equal(no.ok,false);
  const yes=linkDecisionExecution(scope,'d1','action','plan',{plans:[{id:'plan',linkedOpportunityId:'opp'}],commitments:[]});
  assert.equal(yes.ok,true);assert.equal(yes.value.executionLinks.length,1);assert.equal(yes.value.intervention.intent,'Resolve QA ambiguity');
  assert.equal(linkDecisionExecution(scope,'d1','action','plan',{plans:[{id:'plan',linkedOpportunityId:'opp'}],commitments:[]}).value.executionLinks.length,1);
});
test('backup preflight preserves Decision and rejects broken execution scope',()=>{
  finalizeCommercialDecision(scope,input('d1'));
  const decision=loadCommercialDecisions()[0];
  const localBrowserData={'memoire.accounts.v1':[{id:'account',userId:'owner',accountName:'Acme'}],
    'memoire.opportunities.v1':[{...opportunity}],
    'memoire.outcomeRequirements.v1':[{id:'qa',userId:'owner',accountId:'account',opportunityId:'opp',expectedOutcome:'QA acceptance',
      question:'Is QA complete?',role:'required_now',conditionId:null,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at}],
    [DECISION_STORAGE_KEY]:[decision]};
  const envelope={formatVersion:8,exportedAt:at,localBrowserData};
  assert.ok(buildRestorePlan(envelope).writes.some(w=>w.key===DECISION_STORAGE_KEY));
  const broken={...decision,executionLinks:[{kind:'action',recordId:'foreign',linkedAt:at}]};
  assert.throws(()=>buildRestorePlan({...envelope,localBrowserData:{...localBrowserData,[DECISION_STORAGE_KEY]:[broken]}}),/scope mismatch/);
});
test('sample Decision remains local and cannot be sent as a cloud row',()=>{
  const sampleScope={userId:null,sampleDataActive:true};
  const sampleOpportunity={...opportunity,userId:null,isSample:true};
  const result=finalizeCommercialDecision(sampleScope,{...input('sample-decision'),opportunity:sampleOpportunity});
  assert.equal(result.ok,true);assert.equal(result.value.isSample,true);assert.equal(isSyncableRecord(result.value),false);
  assert.equal(loadCommercialDecisions()[0].id,'sample-decision');
});
