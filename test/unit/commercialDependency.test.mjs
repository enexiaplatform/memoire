import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDependencyGraph, deriveKnownBlockers } from '../../src/domain/commercialKernel/commercialDependency.ts';
import { projectOutcomeRequirements } from '../../src/domain/commercialKernel/outcomeRequirement.ts';
import { evaluateCommercialPolicies } from '../../src/domain/commercialKernel/policyEngine.ts';

const at='2026-09-01T12:00:00.000Z';
const req=(id,role='required_now',patch={})=>({id,userId:'u',accountId:'a',opportunityId:'o',expectedOutcome:id,question:`Confirm ${id}?`,conditionId:null,role,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,...patch});
const edge=(dependent,prerequisite,patch={})=>({id:`${dependent}-${prerequisite}`,userId:'u',opportunityId:'o',dependentRequirementId:dependent,prerequisiteRequirementId:prerequisite,basis:`${prerequisite} must precede ${dependent}`,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,...patch});
const readings=(requirements)=>projectOutcomeRequirements(requirements,[],[]);

test('hard edges select unresolved upstream leaves and retain a human explanation path',()=>{
  const rs=[req('decision'),req('technical','required_later'),req('test','context')];
  const deps=[edge('decision','technical'),edge('technical','test')];
  const result=deriveKnownBlockers('o',readings(rs),deps);
  assert.equal(result.integrity,'valid');assert.deepEqual(result.blockers.map(b=>b.reading.requirement.id),['test']);
  assert.deepEqual(result.blockers[0].paths[0].requirementIds,['test','technical','decision']);
  assert.deepEqual(result.blockers[0].paths[0].explanations,['test must precede technical','technical must precede decision']);
  const opportunity={id:'o',accountName:'A',opportunityName:'Deal',stage:'Qualification',status:'Active',nextActionDate:'2026-10-01',evidence:'note'};
  const recommendations=evaluateCommercialPolicies({threads:[],commitments:[],opportunities:[opportunity],quotes:[],requirements:rs,conditions:[],evidence:[],dependencies:deps,today:new Date('2026-09-19T00:00:00Z')});
  const question=recommendations.find(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION');
  assert.equal(question.requirementId,'test');assert.deepEqual(question.dependencyPath,['test','technical','decision']);
});
test('duplicate, self, cross-scope and cyclic hard edges are refused; malformed read suppresses blockers',()=>{
  const rs=[req('a'),req('b'),req('c')];const ab=edge('a','b'),bc=edge('b','c');
  validateDependencyGraph(rs,[ab,bc]);
  for(const bad of [edge('b','a'),edge('c','a')]) assert.throws(()=>validateDependencyGraph(rs,[ab,bc,bad]),/cycle/);
  assert.throws(()=>validateDependencyGraph(rs,[ab,{...ab,id:'other'}]),/already recorded/);
  assert.throws(()=>validateDependencyGraph(rs,[edge('a','a')]),/prerequisite/);
  assert.throws(()=>validateDependencyGraph(rs,[edge('a','c',{opportunityId:'other'})]),/this opportunity/);
  assert.equal(deriveKnownBlockers('o',readings(rs),[ab,edge('b','a')]).integrity,'cycle');
  assert.deepEqual(deriveKnownBlockers('o',readings(rs),[ab,edge('b','a')]).blockers,[]);
});
test('resolved prerequisite and retired edge or endpoint do not block current root',()=>{
  const rs=[req('a'),req('b','context')];const ab=edge('a','b');
  assert.deepEqual(deriveKnownBlockers('o',readings(rs),[ab]).blockers.map(b=>b.reading.requirement.id),['b']);
  const evidence={id:'ev',userId:'u',accountId:'a',opportunityId:'o',category:'technical_outcome',direction:'positive',summary:'Accepted',evidenceText:'Customer accepted QA',observedAt:'2026-09-01',recordedAt:at,sourceType:'manual',createdAt:at,updatedAt:at};
  const condition={id:'cond',userId:'u',accountId:'a',opportunityId:'o',statement:'QA accepted',conditionCategory:'technical',intent:'hypothesis',lifecycle:'active',evidenceLinks:[{evidenceId:'ev',assessment:'supports',recordedAt:at}],sourceType:'manual',createdAt:at,updatedAt:at};
  const withResolved=projectOutcomeRequirements([rs[0],{...rs[1],conditionId:'cond'}],[condition],[evidence]);
  assert.deepEqual(deriveKnownBlockers('o',withResolved,[ab]).blockers.map(b=>b.reading.requirement.id),['a']);
  assert.deepEqual(deriveKnownBlockers('o',readings(rs),[{...ab,lifecycle:'retired'}]).blockers.map(b=>b.reading.requirement.id),['a']);
  assert.deepEqual(deriveKnownBlockers('o',readings([rs[0],{...rs[1],lifecycle:'retired'}]),[ab]).blockers.map(b=>b.reading.requirement.id),['a']);
});
test('300 opportunities with 3000 requirements and 2700 hard edges derive in a bounded time',()=>{
  const requirements=[],dependencies=[],opportunities=[],conditions=[],evidence=[];
  for(let i=0;i<300;i++){
    const opportunityId=`o${i}`;opportunities.push({id:opportunityId,accountName:'A',opportunityName:'Deal',stage:'Qualification',status:'Active',evidence:'note'});
    for(let j=0;j<10;j++) requirements.push(req(`${opportunityId}-r${j}`,j===0?'required_now':'required_later',{opportunityId}));
    for(let j=0;j<9;j++) dependencies.push(edge(`${opportunityId}-r${j}`,`${opportunityId}-r${j+1}`,{id:`${opportunityId}-e${j}`,opportunityId}));
    for(let j=0;j<10;j++){
      const id=`${opportunityId}-context-${j}`;
      evidence.push({id,userId:'u',accountId:'a',opportunityId,category:'technical_outcome',direction:'neutral',summary:'Observed',evidenceText:'Trial in progress',observedAt:'2026-09-01',recordedAt:at,sourceType:'manual',createdAt:at,updatedAt:at});
      conditions.push({id,userId:'u',accountId:'a',opportunityId,statement:'Trial in progress',conditionCategory:'technical',intent:'hypothesis',lifecycle:'active',evidenceLinks:[{evidenceId:id,assessment:'supports',recordedAt:at}],sourceType:'manual',createdAt:at,updatedAt:at});
    }
  }
  const start=performance.now();const result=evaluateCommercialPolicies({threads:[],commitments:[],opportunities,quotes:[],requirements,conditions,evidence,dependencies,today:new Date('2026-09-19T00:00:00Z')});
  assert.equal(result.filter(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION').length,300);
  assert.ok(performance.now()-start<3500);
});
test('Today questions and prerequisites remain inside the selected sample or live workspace',()=>{
  const opportunities=[{id:'o',accountName:'Live',opportunityName:'Live deal',stage:'Qualification',status:'Active'},
    {id:'sample-o',accountName:'Sample',opportunityName:'Sample deal',stage:'Qualification',status:'Active',isSample:true}];
  const requirements=[req('live'),{...req('sample','required_now',{opportunityId:'sample-o'}),isSample:true}];
  const input={threads:[],commitments:[],opportunities,quotes:[],requirements,conditions:[],evidence:[],dependencies:[],today:new Date('2026-09-19T00:00:00Z')};
  const live=evaluateCommercialPolicies(input).filter(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION');
  const sample=evaluateCommercialPolicies({...input,includeSampleRecords:true}).filter(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION');
  assert.deepEqual(live.map(r=>r.requirementId),['live']);
  assert.deepEqual(sample.map(r=>r.requirementId),['sample']);
});
