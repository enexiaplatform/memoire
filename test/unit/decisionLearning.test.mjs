import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDecisionCase,captureDecisionObservationSnapshot,isDecisionObservation,retrieveComparableCases,summarizeObservedCases}
  from '../../src/domain/commercialKernel/decisionLearning.ts';

const day='2026-09-01T00:00:00.000Z';
const decision=(id='d',patch={})=>({id,userId:'u',accountId:'a',opportunityId:'o',question:'How should QA be handled?',context:'QA is unresolved.',
  basisSnapshot:{version:1,capturedAt:day,forecast:{verdict:'conditional',claim:null,timingEvaluation:'incomplete',reasonCodes:[]},
    premises:[{requirementId:'r',label:'QA accepts',state:'unknown',condition:null,evidence:[],evidenceIds:[]}],
    blockers:[{requirementId:'r',label:'QA accepts',state:'unresolved',sourceRecordIds:['r'],paths:[]}],openQuestions:[],nextQuestion:null,
    timing:{status:'incomplete',targetDate:null,lastSafeDate:null,bufferDays:null,assumptionsUsed:false,unknownSegments:[],conflictingSegments:[],sources:[]},sourceRecordIds:['o','r']},
  options:[{id:'x',order:1,label:'Ask QA',interventionIntent:'Contact QA',expectedConsequence:'QA clarity',tradeoffs:''}],selectedOptionId:'x',
  rationale:'QA owns the review.',expectedConsequence:'QA clarity',intervention:{id:'i',intent:'Contact QA',targetKind:'requirement',targetRequirementId:'r',expectedChange:'QA clarity'},
  executionLinks:[],supersedesDecisionId:null,sourceType:'manual',decidedAt:day,createdAt:day,updatedAt:day,...patch});
const observation=(decisionId='d',days=14,state='resolved',patch={})=>({id:`obs-${decisionId}-${days}`,userId:'u',accountId:'a',opportunityId:'o',decisionId,
  observationCutoff:new Date(Date.parse(day)+days*86400000).toISOString(),elapsedDays:days,snapshot:{version:1,derivedWithCurrentRules:true,
    opportunity:{id:'o',name:'Renewal',stage:'Proposal',status:'Active',targetDate:null,value:1000,currency:'USD'},
    target:{kind:'requirement',requirementId:'r',label:'QA accepts',role:'required_now',state,conditionState:state==='resolved'?'supported':'unknown',sourceEvidenceIds:[]},
    blockers:state==='resolved'?[]:[{requirementId:'r',label:'QA accepts',state:'unresolved',sourceRecordIds:['r']}],
    forecast:{verdict:state==='resolved'?'defensible':'conditional',timingEvaluation:state==='resolved'?'supported':'incomplete',reasonCodes:[]},timing:null,
    money:[{sourceId:'o',sourceType:'opportunity_value',amount:1000,currency:'USD',realizationState:'potential',timingState:state==='resolved'?'supported':'incomplete',
      blockerIds:state==='resolved'?[]:['r'],blockerLabels:state==='resolved'?[]:['QA accepts']}],execution:[],buyerProgress:null,sourceRecordIds:['o','r'],
    coverage:{core:'full',target:'full',buyerProgress:'partial',moneyConsequences:'partial'}},operatorNote:'',sourceType:'manual',
  finalizedAt:new Date(Date.parse(day)+(days+1)*86400000).toISOString(),createdAt:new Date(Date.parse(day)+(days+1)*86400000).toISOString(),...patch});

test('an unresolved Decision target can be factually resolved at a later cutoff without a causal claim',()=>{
  const c=buildDecisionCase(decision(),observation());
  assert.equal(c.eligible,true);assert.deepEqual(c.targetTransition,{from:'unknown',to:'resolved'});
  assert.equal(JSON.stringify(c).includes('caused'),false);
});

test('capture uses only the M8 state supplied for the selected system-time cutoff',()=>{
  const d=decision('d',{executionLinks:[{kind:'action',recordId:'p',linkedAt:'2026-09-02T00:00:00.000Z'}]});
  const asOf=(resolution,cutoff)=>({status:'available',coreCoverage:'full',cutoff,opportunity:{id:'o',accountId:'a',opportunityName:'Renewal',stage:'Proposal',status:'Active',expectedClosePeriod:'',estimatedValue:1000,currency:'USD'},
    forecast:{verdict:resolution==='resolved'?'defensible':'conditional',timingEvaluation:'incomplete',reasonCodes:[],timing:null},
    requirementReadings:[{requirement:{id:'r',expectedOutcome:'QA accepts',role:'required_now',lifecycle:'active'},resolution,conditionState:resolution==='resolved'?'supported':'unknown',sourceEvidenceIds:[]}],
    blockers:{blockers:[],integrity:'valid'},moneyConsequences:{consequences:[]},buyerProgress:null,commitments:[],coverage:{buyerProgress:'partial',moneyConsequences:'partial'}});
  const before=captureDecisionObservationSnapshot({decision:d,asOf:asOf('unresolved','2026-09-03T00:00:00.000Z'),plans:[]});
  const after=captureDecisionObservationSnapshot({decision:d,asOf:asOf('resolved','2026-09-10T00:00:00.000Z'),plans:[{id:'p',linkedOpportunityId:'o',label:'Call QA',done:true,doneAt:'2026-09-09',createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-09T00:00:00Z'}]});
  assert.equal(before.target.state,'unresolved');assert.equal(before.execution[0].state,'unavailable');
  assert.equal(after.target.state,'resolved');assert.equal(after.execution[0].state,'completed');
});

test('retrieval explains structural differences and aggregate keeps only an exact situation and horizon',()=>{
  const query=decision('query'),same=decision('same'),different=decision('different',{basisSnapshot:{...decision().basisSnapshot,
    forecast:{...decision().basisSnapshot.forecast,verdict:'not_defensible'}}});
  const cases=retrieveComparableCases({query,decisions:[query,same,different],observations:[observation('same'),observation('different')],horizonDays:14});
  assert.equal(cases.length,2);assert.equal(cases[0].differences.length,0);assert.match(cases[1].differences.join(' '),/forecast verdict/);
  assert.equal(summarizeObservedCases(cases,14).eligibleDecisionCount,1);
});

test('nearest observation selection is explicit and multiple observations never double-count a Decision',()=>{
  const q=decision('query'),a=decision('a');
  const cases=retrieveComparableCases({query:q,decisions:[q,a],observations:[observation('a',7,'unresolved'),observation('a',30,'resolved')],horizonDays:14});
  assert.equal(cases.length,1);assert.equal(cases[0].observation.elapsedDays,7);
  assert.equal(summarizeObservedCases(cases,14).eligibleDecisionCount,0);
  const exact=retrieveComparableCases({query:q,decisions:[q,a],observations:[observation('a',14),observation('a',14,'unresolved',{id:'second'})],horizonDays:14});
  assert.equal(summarizeObservedCases(exact,14).eligibleDecisionCount,1);
});

test('sample and simulation-shaped artifacts cannot enter real learning',()=>{
  const sample=buildDecisionCase(decision('s',{isSample:true}),observation('s',14,'resolved',{isSample:true}));assert.equal(sample.eligible,false);
  assert.deepEqual(retrieveComparableCases({query:decision('sample-query',{isSample:true}),decisions:[decision('real')],observations:[observation('real')],horizonDays:14}),[]);
  assert.equal(isDecisionObservation({...observation(),scenarioId:'scenario-1'}),false);
  assert.equal(isDecisionObservation({...observation(),snapshot:{...observation().snapshot,target:{...observation().snapshot.target,projection:{kind:'scenario'}}}}),false);
});

test('minimum sample is reused, counts Decisions, and language stays descriptive',()=>{
  const q=decision('query'),ds=['a','b','c'].map(id=>decision(id,{options:[{...decision().options[0],interventionIntent:`Free text ${id}`}],intervention:{...decision().intervention,intent:`Free text ${id}`}}));
  const two=retrieveComparableCases({query:q,decisions:[q,...ds],observations:ds.slice(0,2).map(d=>observation(d.id)),horizonDays:14});
  assert.equal(summarizeObservedCases(two,14).sufficientSample,false);
  const three=retrieveComparableCases({query:q,decisions:[q,...ds],observations:ds.map(d=>observation(d.id)),horizonDays:14});
  const summary=summarizeObservedCases(three,14);assert.equal(summary.sufficientSample,true);assert.equal(summary.targetStates.resolved,3);
  assert.match(summary.disclosure,/do not establish/);assert.equal(JSON.stringify(summary).includes('success'),false);
});

test('money paths remain factual context and 300 reviewed Decisions retrieve within a bounded scan',()=>{
  const q=decision('query'),decisions=[q],observations=[];
  for(let i=0;i<300;i++){decisions.push(decision(`d${i}`));observations.push(observation(`d${i}`,14,i%2?'resolved':'unresolved'));}
  const started=performance.now();const cases=retrieveComparableCases({query:q,decisions,observations,horizonDays:14,limit:20});
  assert.equal(cases.length,20);assert.ok(performance.now()-started<250);
  assert.equal(cases[0].observation.snapshot.money[0].blockerIds.length<=1,true);
});
