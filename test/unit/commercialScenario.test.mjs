import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureCommercialScenarioBase,commercialScenarioSourceVersion,compareCommercialScenarios,simulateCommercialScenario}
  from '../../src/domain/commercialKernel/commercialScenario.ts';

const capturedAt='2026-09-21T08:00:00.000Z',evaluationTime='2026-09-24T23:59:59.999Z';
const opportunity={id:'o',userId:'u',accountId:'a',accountName:'Acme',opportunityName:'Order',stage:'Qualification',status:'Active',
  estimatedValue:1_200_000_000,currency:'VND',expectedClosePeriod:'2026-09-30',forecastEvidenceCategory:'Defensible',updatedAt:capturedAt};
const requirement=(id,conditionId=null)=>({id,userId:'u',accountId:'a',opportunityId:'o',expectedOutcome:`Outcome ${id}`,
  question:`Is ${id} complete?`,conditionId,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:capturedAt,updatedAt:capturedAt});
const condition=(id,evidenceId)=>({id,userId:'u',accountId:'a',opportunityId:'o',statement:`Statement ${id}`,conditionCategory:'commercial',
  intent:'assumed',lifecycle:'active',sourceType:'manual',createdAt:capturedAt,updatedAt:capturedAt,
  evidenceLinks:evidenceId?[{evidenceId,assessment:'supports',recordedAt:capturedAt}]:[]});
const evidence=id=>({id,userId:'u',accountId:'a',opportunityId:'o',category:'technical_outcome',direction:'positive',summary:`Evidence ${id}`,
  evidenceText:`Observed ${id}`,observedAt:'2026-09-20',recordedAt:capturedAt,createdAt:capturedAt,updatedAt:capturedAt,sourceType:'manual'});
const dependency=(dependent,prerequisite)=>({id:`${dependent}-${prerequisite}`,userId:'u',opportunityId:'o',dependentRequirementId:dependent,
  prerequisiteRequirementId:prerequisite,basis:'Required first',lifecycle:'active',sourceType:'manual',createdAt:capturedAt,updatedAt:capturedAt});
const timingBase={userId:'u',opportunityId:'o',basis:'Recorded basis',lifecycle:'active',durationDays:null,durationUnit:null,epistemic:null,
  sourceKind:null,sourceReference:null,evidenceId:null,commitmentId:null,sourceType:'manual',createdAt:capturedAt,updatedAt:capturedAt};
const anchor=(id='A')=>({...timingBase,id:'anchor',kind:'target_anchor',requirementId:id});
const duration=(id,requirementId,days)=>({...timingBase,id,kind:'duration',requirementId,durationDays:days,durationUnit:'calendar_days',
  epistemic:'supported',sourceKind:'contract',sourceReference:'Signed schedule'});
const gate={id:'gate',userId:'u',opportunityId:'o',moneySourceType:'opportunity_value',moneySourceId:'o',requirementId:'A',
  basisKind:'customer_process',basis:'Order waits on A',lifecycle:'active',sourceType:'manual',createdAt:capturedAt,updatedAt:capturedAt};
const source=(patch={})=>({opportunity,requirements:[requirement('A'),requirement('B'),requirement('C')],conditions:[],evidence:[],
  dependencies:[dependency('A','B'),dependency('B','C')],timingAssertions:[anchor(),duration('dA','A',2),duration('dB','B',2)],
  commitments:[],moneyGates:[gate],quotes:[],...patch});
const assumption=(id,requirementId,effectiveDate=null)=>({id,type:'requirement_resolution',requirementId,resolution:'resolved',effectiveDate,
  label:`Assume ${requirementId} resolved`,reason:'Test customer process',providedBy:'operator'});
const run=(base,assumptions=[],patch={})=>simulateCommercialScenario({scenarioId:'s',base,assumptions,evaluationTime,evaluationDate:'2026-09-24',
  calculatedAt:capturedAt,currentSourceVersion:base.sourceVersion,...patch});

test('simulation is immutable and an empty scenario preserves current derivations',()=>{
  const original=source(),snapshot=structuredClone(original),base=captureCommercialScenarioBase(original,capturedAt),result=run(base);
  assert.equal(base.sourceVersion,commercialScenarioSourceVersion(original));assert.equal(result.ok,true);assert.deepEqual(original,snapshot);assert.deepEqual(result.result.base.blockerIds,result.result.projected.blockerIds);
  assert.deepEqual(result.result.delta.changedFields,[]);assert.equal(result.result.projected.buyerProgress,'unchanged_not_projected');
});

test('resolving a leaf moves one level without an invented cascade and changes NBQ',()=>{
  const base=captureCommercialScenarioBase(source(),capturedAt),result=run(base,[assumption('resolve-C','C')]);
  assert.equal(result.ok,true);assert.deepEqual(result.result.base.blockerIds,['C']);assert.deepEqual(result.result.projected.blockerIds,['B']);
  assert.equal(result.result.projected.nextQuestion.requirementId,'B');
  const reading=result.result.projected.requirements.find(row=>row.requirement.id==='C');
  assert.equal(reading.reasonCode,'REQUIREMENT_PROJECTED_RESOLVED');assert.equal(reading.conditionState,'unknown');assert.deepEqual(reading.sourceEvidenceIds,[]);
});

test('multiple explicit resolutions traverse a multi-level chain only as supplied',()=>{
  const result=run(captureCommercialScenarioBase(source(),capturedAt),[assumption('resolve-C','C'),assumption('resolve-B','B')]);
  assert.equal(result.ok,true);assert.deepEqual(result.result.projected.blockerIds,['A']);assert.equal(result.result.projected.requirements.find(r=>r.requirement.id==='A').resolution,'unresolved');
});

test('future-dated resolution is pending until the evaluation date',()=>{
  const base=captureCommercialScenarioBase(source(),capturedAt);
  const before=run(base,[assumption('resolve-C','C','2026-09-25')]);assert.equal(before.ok,true);assert.deepEqual(before.result.pendingAssumptionIds,['resolve-C']);assert.deepEqual(before.result.projected.blockerIds,['C']);
  const after=run(base,[assumption('resolve-C','C','2026-09-25')],{evaluationDate:'2026-09-25',evaluationTime:'2026-09-25T23:59:59.999Z'});
  assert.equal(after.ok,true);assert.deepEqual(after.result.projected.blockerIds,['B']);
});

test('duration and target assumptions reuse timing while staying conditional',()=>{
  const base=captureCommercialScenarioBase(source(),capturedAt);
  const assumptions=[assumption('resolve-C','C'),{id:'duration-A',type:'requirement_duration',requirementId:'A',durationDays:1,durationUnit:'calendar_days',
    label:'Assume A takes one day',reason:'Test SLA',providedBy:'operator'},{id:'target',type:'target_date',targetDate:'2026-10-15',label:'Move target',reason:'Test revised date',providedBy:'operator'}];
  const result=run(base,assumptions);assert.equal(result.ok,true);assert.equal(result.result.projected.forecast.claim.targetDate,'2026-10-15');
  assert.equal(result.result.projected.forecast.timing.assumptionsUsed,true);assert.notEqual(result.result.projected.forecastPresentation,'defensible');
  assert.equal(result.result.delta.targetDate.from,'2026-09-30');assert.equal(result.result.delta.targetDate.to,'2026-10-15');
});

test('unknown timing remains unknown when a resolution assumption does not provide duration',()=>{
  const sparse=source({timingAssertions:[anchor()]});const result=run(captureCommercialScenarioBase(sparse,capturedAt),[assumption('resolve-C','C')]);
  assert.equal(result.ok,true);assert.equal(result.result.projected.forecast.timing.status,'partial');assert.ok(result.result.projected.forecast.timing.unknownTimingSegments.length>0);
});

test('money amount and realization remain unchanged while the gating path changes',()=>{
  const result=run(captureCommercialScenarioBase(source(),capturedAt),[assumption('resolve-C','C')]);assert.equal(result.ok,true);
  const before=result.result.base.money.consequences[0],after=result.result.projected.money.consequences[0];
  assert.equal(after.amount,before.amount);assert.equal(after.currency,before.currency);assert.equal(after.realizationState,before.realizationState);
  assert.equal(before.blockers[0].requirementId,'C');assert.equal(after.blockers[0].requirementId,'B');
  assert.equal(after.consequenceKinds.includes('realized'),false);
});

test('one of multiple blockers can change without clearing the other',()=>{
  const multi=source({dependencies:[dependency('A','B'),dependency('A','C')]});
  const result=run(captureCommercialScenarioBase(multi,capturedAt),[assumption('resolve-C','C')]);assert.equal(result.ok,true);
  assert.deepEqual(result.result.base.blockerIds,['B','C']);assert.deepEqual(result.result.projected.blockerIds,['B']);
});

test('option-like text has no effect without a typed assumption',()=>{
  const base=captureCommercialScenarioBase(source(),capturedAt),result=run(base,[]);assert.equal(result.ok,true);
  assert.deepEqual(result.result.base,result.result.projected);assert.equal(Object.hasOwn(result.result,'decision'),false);assert.equal(Object.hasOwn(result.result,'action'),false);
});

test('invalid, conflicting, retired, malformed and pre-base inputs are rejected',()=>{
  const retired=source();retired.requirements[2]={...retired.requirements[2],lifecycle:'retired'};const base=captureCommercialScenarioBase(retired,capturedAt);
  const rows=[assumption('a','C'),{...assumption('b','C'),resolution:'unresolved'},{id:'bad-duration',type:'requirement_duration',requirementId:'missing',durationDays:1.5,durationUnit:'weeks',label:'Bad',reason:'Bad',providedBy:'operator'},
    {id:'bad-date',type:'target_date',targetDate:'2026-02-31',label:'Bad date',reason:'Bad',providedBy:'operator'}];
  const result=run(base,rows,{evaluationTime:'2026-09-20T00:00:00.000Z'});assert.equal(result.ok,false);
  const codes=new Set(result.errors.map(row=>row.code));for(const code of ['CONTRADICTORY_ASSUMPTIONS','RETIRED_REQUIREMENT','UNKNOWN_REQUIREMENT','INVALID_DURATION','INVALID_TARGET_DATE','EVALUATION_BEFORE_BASE'])assert.equal(codes.has(code),true,code);
});

test('captured results remain tied to a stale base while current state stays current',()=>{
  const initial=source(),base=captureCommercialScenarioBase(initial,capturedAt),changed=source({opportunity:{...opportunity,expectedClosePeriod:'2026-10-20'}});
  const result=run(base,[assumption('resolve-C','C')],{currentSourceVersion:commercialScenarioSourceVersion(changed)});assert.equal(result.ok,true);
  assert.equal(result.result.baseStatus,'stale');assert.equal(result.result.base.forecast.claim.targetDate,'2026-09-30');assert.equal(changed.opportunity.expectedClosePeriod,'2026-10-20');
});

test('assumption order does not affect deterministic output and comparisons do not rank',()=>{
  const base=captureCommercialScenarioBase(source(),capturedAt),a=assumption('resolve-C','C'),b=assumption('resolve-B','B');
  const first=run(base,[a,b]),second=run(base,[b,a]);assert.equal(first.ok,true);assert.equal(second.ok,true);assert.deepEqual(first.result,second.result);
  const comparison=compareCommercialScenarios([first.result,{...second.result,scenarioId:'s2'}]);assert.deepEqual(comparison.map(row=>row.scenarioId),['s','s2']);
  assert.equal(comparison.some(row=>Object.hasOwn(row,'score')||Object.hasOwn(row,'rank')||Object.hasOwn(row,'best')),false);
});

test('bounded 12-requirement graph and three-scenario comparison stays fast',()=>{
  const requirements=Array.from({length:12},(_,index)=>requirement(`R${index}`,`c${index}`));
  const conditions=requirements.map((_,index)=>condition(`c${index}`,index===11?null:`e${index}`));
  const evidenceRows=Array.from({length:11},(_,index)=>evidence(`e${index}`));
  const dependencies=Array.from({length:11},(_,index)=>dependency(`R${index}`,`R${index+1}`));
  const large=source({requirements,conditions,evidence:evidenceRows,dependencies,timingAssertions:[anchor('R0'),...requirements.slice(0,11).map((row,index)=>duration(`d${index}`,row.id,1))],moneyGates:[{...gate,requirementId:'R0'}]});
  const base=captureCommercialScenarioBase(large,capturedAt),started=performance.now();
  const results=[0,1,2].map(index=>run(base,[assumption(`resolve-${index}`,'R11')],{scenarioId:`s${index}`}));
  assert.equal(results.every(row=>row.ok),true);assert.equal(compareCommercialScenarios(results.map(row=>row.result)).length,3);
  assert.ok(performance.now()-started<250,`simulation took ${performance.now()-started}ms`);
});
