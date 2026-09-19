import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOutcomeRequirement, projectOutcomeRequirements, nextBestQuestion, requirementQuestion } from '../../src/domain/commercialKernel/outcomeRequirement.ts';
import { requirementReferenceIndex, validateRequirementReferences } from '../../src/domain/commercialKernel/requirementCommands.ts';
import { evaluateCommercialPolicies } from '../../src/domain/commercialKernel/policyEngine.ts';
import { rankRecommendations } from '../../src/domain/commercialKernel/rankRecommendations.ts';
const at='2026-09-01T12:00:00.000Z';
const requirement={id:'r',userId:'u',accountId:'a',opportunityId:'o',expectedOutcome:'Know who approves budget',question:'Who gives final approval?',conditionId:null,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
const condition={id:'c',userId:'u',accountId:'a',opportunityId:'o',statement:'Jane approves budget.',conditionCategory:'decision',intent:'assumed',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,evidenceLinks:[]};
const evidence={id:'e',userId:'u',accountId:'a',opportunityId:'o',category:'technical_outcome',direction:'positive',summary:'Approval',evidenceText:'Jane confirmed authority.',observedAt:'2026-08-31',recordedAt:at,createdAt:at,updatedAt:at,sourceType:'email',sourceId:'mail-1'};
const link=(assessment)=>({evidenceId:'e',assessment,recordedAt:at});
const read=(r=requirement,c=[],e=[])=>projectOutcomeRequirements([r],c,e)[0];
test('unknown is derived from a requirement with no Condition; absence creates no fake assertion',()=>{
  assert.equal(isOutcomeRequirement(requirement),true);assert.equal(read().conditionState,'unknown');assert.equal(read().resolution,'unresolved');
  assert.equal(read().condition,null);assert.equal(requirementQuestion(read()),'Who gives final approval?');
  assert.equal(requirementQuestion(read({...requirement,question:null})),'Confirm whether: Know who approves budget');
  assert.equal(isOutcomeRequirement({...requirement,role:'must_do'}),false);
});
test('real Condition and explicit Evidence move requirement through assumption, support, conflict and retirement',()=>{
  const r={...requirement,conditionId:'c'};
  assert.equal(read(r,[condition]).conditionState,'assumed');
  assert.equal(read(r,[{...condition,intent:'hypothesis'}]).conditionState,'hypothesis');
  assert.equal(read(r,[{...condition,evidenceLinks:[link('supports')]}],[evidence]).resolution,'resolved');
  const conflict=read(r,[{...condition,evidenceLinks:[link('contradicts')]}],[evidence]);
  assert.equal(conflict.resolution,'conflicted');assert.deepEqual(conflict.sourceEvidenceIds,['e']);
  assert.equal(read(r,[{...condition,lifecycle:'retired',evidenceLinks:[link('supports')]}],[evidence]).conditionState,'unknown');
});
test('account-level Condition can have different roles on two Opportunities without changing its truth',()=>{
  const accountCondition={...condition,opportunityId:null,evidenceLinks:[]};
  const one={...requirement,conditionId:'c'};const two={...requirement,id:'r2',opportunityId:'o2',conditionId:'c',role:'context'};
  const results=projectOutcomeRequirements([one,two],[accountCondition],[]);
  assert.equal(results[0].conditionState,'assumed');assert.equal(results[1].conditionState,'assumed');
  assert.equal(results[0].requirement.role,'required_now');assert.equal(results[1].requirement.role,'context');
});
test('a Condition without a Requirement remains context and creates no question',()=>{
  assert.deepEqual(projectOutcomeRequirements([],[condition],[evidence]),[]);
  assert.equal(nextBestQuestion(projectOutcomeRequirements([],[condition],[evidence])),null);
});
test('scope preflight rejects foreign or cross-opportunity links',()=>{
  const refs=requirementReferenceIndex([{id:'a',userId:'u'}],[{id:'o',userId:'u',accountId:'a'}],[condition]);
  validateRequirementReferences({...requirement,conditionId:'c'},refs);
  for(const bad of [{...condition,userId:'other'},{...condition,accountId:'other'},{...condition,opportunityId:'other'}])
    assert.throws(()=>validateRequirementReferences({...requirement,conditionId:'c'},requirementReferenceIndex([{id:'a',userId:'u'}],[{id:'o',userId:'u',accountId:'a'}],[bad])));
});
test('lexicographic question picks required-now conflict before unknown, then later and context',()=>{
  const rs=[{...requirement,id:'later',role:'required_later'},requirement,{...requirement,id:'conflict',conditionId:'c'}];
  const readings=projectOutcomeRequirements(rs,[{...condition,evidenceLinks:[link('contradicts')]}],[evidence]);
  assert.equal(nextBestQuestion(readings).requirement.id,'conflict');
  assert.equal(nextBestQuestion(readings.filter(r=>r.requirement.id!=='conflict')).requirement.id,'r');
  assert.equal(nextBestQuestion(readings.map(r=>({...r,resolution:'resolved'}))),null);
});
test('Today policy emits one declared required-now question per open Opportunity and existing rank explains it',()=>{
  const opportunity={id:'o',accountName:'Acme',opportunityName:'Renewal',stage:'Qualification',status:'Active',nextActionDate:'2026-10-01',evidence:'Discovery note'};
  const requirements=[requirement,{...requirement,id:'later',role:'required_later'},{...requirement,id:'second',expectedOutcome:'Technical fit accepted'}];
  const input={threads:[],commitments:[],opportunities:[opportunity],quotes:[],requirements,conditions:[],evidence:[],today:new Date('2026-09-19T00:00:00Z')};
  const questions=evaluateCommercialPolicies(input).filter(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION');
  assert.equal(questions.length,1);assert.equal(questions[0].requirementId,'r');assert.equal(questions[0].conditionState,'unknown');
  assert.deepEqual(questions[0].sourceRecordIds,['r']);assert.equal(questions[0].question,'Who gives final approval?');
  const ranked=rankRecommendations({recommendations:questions,opportunities:[opportunity],quotes:[],commitments:[],today:input.today});
  assert.equal(ranked.ranked[0].rank,1);assert.equal(ranked.ranked[0].candidateAction,'Resolve this question');
  for(const status of ['Won','Lost','On hold']) assert.equal(evaluateCommercialPolicies({...input,opportunities:[{...opportunity,status}]}).some(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION'),false);
  assert.equal(evaluateCommercialPolicies({...input,opportunities:[{...opportunity,stage:'Lead'}]}).some(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION'),false);
});
test('300 opportunity book produces at most one question per Opportunity in bounded time',()=>{
  const opportunities=Array.from({length:300},(_,i)=>({id:`o${i}`,accountName:`A${i}`,opportunityName:`Deal ${i}`,stage:'Qualification',status:'Active',nextActionDate:'2026-10-01',evidence:'note'}));
  const requirements=opportunities.flatMap(o=>Array.from({length:5},(_,j)=>({...requirement,id:`r${o.id}-${j}`,opportunityId:o.id})));
  const start=performance.now();const rows=evaluateCommercialPolicies({threads:[],commitments:[],opportunities,quotes:[],requirements,conditions:[],evidence:[],today:new Date('2026-09-19T00:00:00Z')});
  assert.equal(rows.filter(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION').length,300);
  assert.ok(performance.now()-start<2500);
});
test('existing overdue money warning outranks a required-now question in portfolio ranking',()=>{
  const opportunity={id:'o',accountName:'Acme',opportunityName:'Renewal',stage:'Qualification',status:'Active',nextActionDate:'2026-10-01',evidence:'note'};
  const question=evaluateCommercialPolicies({threads:[],commitments:[],opportunities:[opportunity],quotes:[],requirements:[requirement],conditions:[],evidence:[],today:new Date('2026-09-19T00:00:00Z')})
    .find(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION');
  const money={...question,id:'money',reasonCode:'MONEY_CHECKPOINT_STUCK',recommendedAction:'Chase payment',question:undefined};
  const result=rankRecommendations({recommendations:[question,money],opportunities:[opportunity],quotes:[],commitments:[],today:new Date('2026-09-19T00:00:00Z')});
  assert.equal(result.ranked[0].id,'money');assert.equal(result.ranked[1].id,question.id);
});
