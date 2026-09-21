import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activateLocalHistoricalIntegrity,commitLocalHistoricalCollection} from '../../src/services/historicalIntegrity.ts';
import {getLocalHistoricalSourcesAt} from '../../src/services/historicalQuery.ts';
import {commercialDayAt,composeCommercialStateAsOf} from '../../src/services/commercialTimeMachine.ts';
import {buildRestorePlan} from '../../src/utils/workspaceBackup.ts';
import {deriveForecastDefensibility} from '../../src/domain/commercialKernel/deriveForecastDefensibility.ts';
class Storage{data=new Map();getItem(key){return this.data.get(key)??null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
const time=day=>`2026-09-${day}T00:00:00.000Z`;
const opportunity={id:'o',userId:'u',accountId:'a',accountName:'Acme',opportunityName:'QA renewal',
  stage:'Discovery',status:'Active',expectedClosePeriod:'2026-09-30',forecastEvidenceCategory:'Defensible',
  createdAt:time('20'),updatedAt:time('20')};
const condition={id:'c',userId:'u',accountId:'a',opportunityId:'o',statement:'QA approved',conditionCategory:'technical',
  intent:'hypothesis',lifecycle:'active',sourceType:'manual',createdAt:time('20'),updatedAt:time('20'),evidenceLinks:[]};
const requirement={id:'r',userId:'u',accountId:'a',opportunityId:'o',expectedOutcome:'QA approval',question:'Who approves QA?',
  conditionId:null,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:time('20'),updatedAt:time('20')};
const evidence={id:'e',userId:'u',accountId:'a',opportunityId:'o',category:'technical_outcome',direction:'positive',
  summary:'Approved',evidenceText:'Customer QA approved',observedAt:'2026-09-18',recordedAt:time('23'),
  sourceType:'email',createdAt:time('23'),updatedAt:time('23'),providedBy:'customer'};
const seed=()=>{const storage=new Storage();
  storage.setItem('memoire.opportunities.v1',JSON.stringify([opportunity]));
  storage.setItem('memoire.commercialConditions.v1',JSON.stringify([condition]));
  storage.setItem('memoire.outcomeRequirements.v1',JSON.stringify([requirement]));
  activateLocalHistoricalIntegrity('u',storage,()=>time('20'));
  return storage;
};
const view=(storage,cutoff,extra={})=>composeCommercialStateAsOf({sources:getLocalHistoricalSourcesAt('u',cutoff,storage),
  scope:'u',opportunityId:'o',cutoff,timeZone:'Asia/Ho_Chi_Minh',...extra});

test('one composer keeps past stage and claim despite later current edits',()=>{
  const storage=seed();
  commitLocalHistoricalCollection('opportunities',[{...opportunity,stage:'Proposal',updatedAt:time('22')}],storage,()=>time('22'));
  commitLocalHistoricalCollection('opportunities',[{...opportunity,stage:'Negotiation',expectedClosePeriod:'2026-10-15',
    updatedAt:time('25')}],storage,()=>time('25'));
  assert.equal(view(storage,'2026-09-21T12:00:00Z').opportunity.stage,'Discovery');
  const middle=view(storage,'2026-09-23T12:00:00Z');
  assert.equal(middle.status,'available');assert.equal(middle.opportunity.stage,'Proposal');
  assert.equal(middle.coreCoverage,'full');assert.equal(middle.coverage.buyerProgress,'partial');
  assert.equal(middle.forecast.claim.targetDate,'2026-09-30');
  assert.equal(view(storage,'2026-09-26T12:00:00Z').opportunity.stage,'Negotiation');
  assert.equal(view(storage,'2026-09-23T12:00:00Z').forecast.claim.targetDate,'2026-09-30');
});
test('late Evidence cannot resolve a Requirement before Memoire recorded it',()=>{
  const storage=seed();
  commitLocalHistoricalCollection('commercial_evidence',[evidence],storage,()=>time('23'));
  commitLocalHistoricalCollection('commercial_conditions',[{...condition,evidenceLinks:[
    {evidenceId:'e',assessment:'supports',recordedAt:time('23')}],updatedAt:time('23')}],storage,()=>time('23'));
  commitLocalHistoricalCollection('commercial_outcome_requirements',[{...requirement,conditionId:'c',
    updatedAt:time('23')}],storage,()=>time('23'));
  const before=view(storage,'2026-09-22T12:00:00Z');
  assert.equal(before.requirementReadings[0].resolution,'unresolved');
  assert.equal(before.evidence.length,0);
  assert.equal(before.nextQuestion.requirement.id,'r');
  const after=view(storage,'2026-09-24T12:00:00Z');
  assert.equal(after.requirementReadings[0].resolution,'resolved');
  assert.equal(after.evidence[0].observedAt,'2026-09-18');
  assert.equal(after.recordedAtBySource.get('commercial_evidence:e'),time('23'));
  assert.equal(after.nextQuestion,null);
  commitLocalHistoricalCollection('commercial_outcome_requirements',[{...requirement,conditionId:'c',
    role:'context',updatedAt:time('25')}],storage,()=>time('25'));
  assert.equal(view(storage,'2026-09-24T12:00:00Z').requirementReadings[0].requirement.role,'required_now');
  assert.equal(view(storage,'2026-09-26T12:00:00Z').requirementReadings[0].requirement.role,'context');
});
test('Condition epistemics are rederived from supporting then contradicting Evidence',()=>{
  const storage=seed();
  const supporting={...evidence,id:'support',recordedAt:time('20'),createdAt:time('20'),updatedAt:time('20')};
  commitLocalHistoricalCollection('commercial_evidence',[supporting],storage,()=>time('20'));
  const supportLink={evidenceId:'support',assessment:'supports',recordedAt:time('20')};
  commitLocalHistoricalCollection('commercial_conditions',[{...condition,evidenceLinks:[supportLink]}],storage,()=>time('20'));
  assert.equal(view(storage,'2026-09-21T12:00:00Z').conditions.get('c').state,'supported');
  const contrary={...evidence,id:'contrary',summary:'QA rejected',direction:'negative',recordedAt:time('23')};
  commitLocalHistoricalCollection('commercial_evidence',[supporting,contrary],storage,()=>time('23'));
  commitLocalHistoricalCollection('commercial_conditions',[{...condition,evidenceLinks:[supportLink,
    {evidenceId:'contrary',assessment:'contradicts',recordedAt:time('23')}],updatedAt:time('23')}],storage,()=>time('23'));
  assert.equal(view(storage,'2026-09-24T12:00:00Z').conditions.get('c').state,'contradicted');
  assert.equal(view(storage,'2026-09-21T12:00:00Z').conditions.get('c').state,'supported');
});
test('historical question and blocker graph change only after accepted source revisions',()=>{
  const storage=seed();
  const a={...requirement,id:'A',expectedOutcome:'Approve QA',question:'Who approves QA?',conditionId:'c'};
  const b={...requirement,id:'B',expectedOutcome:'Approve budget',question:'Who approves budget?',role:'required_later'};
  const c={...requirement,id:'C',expectedOutcome:'Confirm signer',question:'Who signs?',role:'required_later'};
  commitLocalHistoricalCollection('commercial_outcome_requirements',[a,b,c],storage,()=>time('20'));
  const edge=(id,dependentRequirementId,prerequisiteRequirementId)=>({id,userId:'u',opportunityId:'o',
    dependentRequirementId,prerequisiteRequirementId,basis:'Needed first',lifecycle:'active',sourceType:'manual',
    createdAt:time('20'),updatedAt:time('20')});
  const edges=[edge('A-B','A','B'),edge('B-C','B','C')];
  commitLocalHistoricalCollection('commercial_dependencies',edges,storage,()=>time('20'));
  const before=view(storage,'2026-09-21T12:00:00Z');
  assert.equal(before.nextQuestion.requirement.id,'A');
  assert.deepEqual(before.blockers.blockers.map(item=>item.reading.requirement.id),['C']);
  commitLocalHistoricalCollection('commercial_dependencies',[edges[0],{...edges[1],lifecycle:'retired',
    updatedAt:time('24')}],storage,()=>time('24'));
  assert.deepEqual(view(storage,'2026-09-25T12:00:00Z').blockers.blockers.map(item=>item.reading.requirement.id),['B']);
  assert.deepEqual(view(storage,'2026-09-21T12:00:00Z').blockers.blockers.map(item=>item.reading.requirement.id),['C']);
  commitLocalHistoricalCollection('commercial_evidence',[evidence],storage,()=>time('26'));
  commitLocalHistoricalCollection('commercial_conditions',[{...condition,evidenceLinks:[
    {evidenceId:'e',assessment:'supports',recordedAt:time('26')}],updatedAt:time('26')}],storage,()=>time('26'));
  assert.equal(view(storage,'2026-09-27T12:00:00Z').nextQuestion.requirement.id,'B');
});
test('pre-coverage, verified absence, and corrupt core history never fall back to current',()=>{
  const storage=seed();
  const before=view(storage,'2026-09-19T23:59:59Z');
  assert.equal(before.status,'pre_coverage');assert.equal(before.opportunity,null);
  const absent=composeCommercialStateAsOf({sources:getLocalHistoricalSourcesAt('u',time('21'),storage),
    scope:'u',opportunityId:'uncreated',cutoff:time('21'),timeZone:'UTC'});
  assert.equal(absent.status,'verified_absent');assert.equal(absent.coverage.opportunity,'full');
  const revisions=JSON.parse(storage.getItem('memoire.stateRevisions.v1'));
  revisions.find(row=>row.entityType==='commercial_outcome_requirements').schemaVersion=2;
  storage.setItem('memoire.stateRevisions.v1',JSON.stringify(revisions));
  const broken=view(storage,time('21'));
  assert.equal(broken.status,'corrupt');assert.equal(broken.forecast,null);
});
test('an Opportunity ID and cutoff cannot cross a workspace scope',()=>{
  const storage=seed(),cutoff=time('21');
  const result=composeCommercialStateAsOf({sources:getLocalHistoricalSourcesAt('u',cutoff,storage),
    scope:'another-user',opportunityId:'o',cutoff,timeZone:'UTC'});
  assert.equal(result.status,'unavailable');assert.equal(result.opportunity,null);
});
test('a future unsupported revision cannot poison an earlier verified cutoff',()=>{
  const storage=seed();
  const revisions=JSON.parse(storage.getItem('memoire.stateRevisions.v1'));
  const first=revisions.find(row=>row.entityType==='opportunities');
  revisions.push({...first,id:'future-revision',mutationId:'future-mutation',revisionNo:2,
    schemaVersion:2,recordedAt:time('25'),state:{...first.state,stage:'Negotiation'}});
  storage.setItem('memoire.stateRevisions.v1',JSON.stringify(revisions));
  assert.equal(view(storage,'2026-09-21T12:00:00Z').status,'available');
  assert.equal(view(storage,'2026-09-26T12:00:00Z').status,'corrupt');
});
test('the verified boundary is inclusive at the exact instant',()=>{
  const storage=new Storage();storage.setItem('memoire.opportunities.v1',JSON.stringify([opportunity]));
  activateLocalHistoricalIntegrity('u',storage,()=> '2026-09-20T14:00:00Z');
  assert.equal(view(storage,'2026-09-20T13:59:59Z').status,'pre_coverage');
  assert.equal(view(storage,'2026-09-20T14:00:00Z').status,'available');
});
test('Decision snapshot stays frozen and future supersession does not appear early',()=>{
  const storage=seed();
  const decision=(id,day,supersedesDecisionId=null)=>({id,userId:'u',accountId:'a',opportunityId:'o',
    decidedAt:time(day),supersedesDecisionId,question:`Decision ${id}`,options:[{id:'option',label:'Wait'}],
    selectedOptionId:'option',executionLinks:[],basisSnapshot:{capturedAt:time(day),forecast:{verdict:'conditional'}}});
  const decisions=[decision('A','22'),decision('B','25','A')];
  const early=view(storage,'2026-09-23T12:00:00Z',{decisions});
  assert.deepEqual(early.decisions.map(row=>row.id),['A']);
  assert.equal(early.decisions[0].basisSnapshot.forecast.verdict,'conditional');
  assert.notEqual(early.forecast.verdict,early.decisions[0].basisSnapshot.forecast.verdict);
  assert.deepEqual(view(storage,'2026-09-26T12:00:00Z',{decisions}).decisions.map(row=>row.id),['B','A']);
  assert.equal(early.opportunity.expectedClosePeriod,'2026-09-30');
});
test('cutoff commercial day honors timezone near UTC midnight',()=>{
  assert.equal(commercialDayAt('2026-09-20T17:01:00Z','Asia/Ho_Chi_Minh'),'2026-09-21');
  assert.equal(commercialDayAt('2026-09-20T16:59:00Z','Asia/Ho_Chi_Minh'),'2026-09-20');
  const storage=seed();
  assert.equal(view(storage,'2026-09-20T00:00:00Z').forecast.calculatedAt,'2026-09-20T00:00:00Z');
  commitLocalHistoricalCollection('opportunities',[{...opportunity,stage:'Proposal',updatedAt:'2026-09-20T17:01:00Z'}],
    storage,()=> '2026-09-20T17:01:00Z');
  assert.equal(view(storage,'2026-09-20T17:00:59Z').opportunity.stage,'Discovery');
  assert.equal(view(storage,'2026-09-20T17:01:00Z').opportunity.stage,'Proposal');
  const coverage=JSON.parse(storage.getItem('memoire.historyCoverage.v1'));
  coverage[0].historyGuaranteedFrom='2026-09-20T07:00:00+07:00';
  storage.setItem('memoire.historyCoverage.v1',JSON.stringify(coverage));
  assert.equal(view(storage,'2026-09-20T00:00:00Z').status,'available');
});
test('Commercial Time evaluates the recovery window using cutoff as historical now',()=>{
  const storage=seed();
  commitLocalHistoricalCollection('commercial_outcome_requirements',[requirement,{...requirement,id:'upstream',
    role:'required_later',expectedOutcome:'Buyer check'}],storage,()=>time('20'));
  commitLocalHistoricalCollection('commercial_dependencies',[{id:'edge',userId:'u',opportunityId:'o',
    dependentRequirementId:'r',prerequisiteRequirementId:'upstream',basis:'Needed first',lifecycle:'active',
    sourceType:'manual',createdAt:time('20'),updatedAt:time('20')}],storage,()=>time('20'));
  const base={userId:'u',opportunityId:'o',requirementId:'r',basis:'Buyer review',lifecycle:'active',
    sourceType:'manual',createdAt:time('20'),updatedAt:time('20'),evidenceId:null,commitmentId:null};
  const anchor={...base,id:'anchor',kind:'target_anchor',durationDays:null,durationUnit:null,epistemic:null,
    sourceKind:null,sourceReference:null};
  const duration={...base,id:'duration',kind:'duration',durationDays:3,durationUnit:'calendar_days',
    epistemic:'supported',sourceKind:'contract',sourceReference:'Signed process'};
  commitLocalHistoricalCollection('commercial_timing_assertions',[anchor,duration],storage,()=>time('20'));
  const early=view(storage,'2026-09-21T12:00:00Z');
  const late=view(storage,'2026-09-26T12:00:00Z');
  assert.equal(early.status,'available');assert.equal(late.status,'available');
  assert.ok(early.forecast.timing);
  assert.equal(early.forecast.timing.calculatedAt,'2026-09-21T12:00:00Z');
  assert.equal(late.forecast.timing.calculatedAt,'2026-09-26T12:00:00Z');
  assert.notEqual(early.forecast.timing.recoveryWindowDays,late.forecast.timing.recoveryWindowDays);
  commitLocalHistoricalCollection('commercial_timing_assertions',[anchor,{...duration,durationDays:5,
    updatedAt:time('22')}],storage,()=>time('22'));
  const changedDuration=view(storage,'2026-09-23T12:00:00Z');
  assert.notEqual(changedDuration.forecast.timing.lastSafeDate,early.forecast.timing.lastSafeDate);
  commitLocalHistoricalCollection('opportunities',[{...opportunity,expectedClosePeriod:'2026-10-15',
    updatedAt:time('24')}],storage,()=>time('24'));
  const changedTarget=view(storage,'2026-09-25T12:00:00Z');
  assert.equal(changedTarget.forecast.claim.targetDate,'2026-10-15');
  assert.notEqual(changedTarget.forecast.timing.lastSafeDate,changedDuration.forecast.timing.lastSafeDate);
  assert.equal(view(storage,'2026-09-21T12:00:00Z').forecast.claim.targetDate,'2026-09-30');
});
test('historical drawer is an isolated read-only surface',()=>{
  const source=readFileSync(new URL('../../src/features/opportunities/HistoricalOpportunityDrawer.tsx',import.meta.url),'utf8');
  assert.match(source,/Return to current/);
  assert.doesNotMatch(source,/CommercialStatePanel|createCommercial|changeCommercial|retireCommercial|updateOpportunity|onSave|onDelete/);
  const page=readFileSync(new URL('../../src/features/opportunities/OpportunitiesPage.tsx',import.meta.url),'utf8');
  assert.match(page,/searchParams\.has\('asOf'\).*HistoricalOpportunityDrawer/s);
});
test('a local backup round trip preserves the same historical Opportunity view',()=>{
  const original=new Storage();
  original.setItem('memoire.opportunities.v1',JSON.stringify([opportunity]));
  activateLocalHistoricalIntegrity('u',original,()=>time('20'));
  const backup={formatVersion:10,exportedAt:time('26'),mode:'local-only',localBrowserData:Object.fromEntries(
    [...original.data].map(([key,value])=>[key,JSON.parse(value)]))};
  const plan=buildRestorePlan(backup);
  const restored=new Storage();
  for(const write of plan.writes)restored.setItem(write.key,write.value);
  const before=view(original,'2026-09-21T12:00:00Z');
  const after=view(restored,'2026-09-21T12:00:00Z');
  assert.equal(after.status,'available');
  assert.equal(after.opportunity.stage,before.opportunity.stage);
  assert.equal(after.forecast.verdict,before.forecast.verdict);
  assert.equal(after.boundary,before.boundary);
});
test('latest historical forecast uses the same rules as the current pure projection',()=>{
  const storage=seed(),cutoff='2026-09-21T12:00:00Z';
  const historical=view(storage,cutoff);
  const current=deriveForecastDefensibility({opportunity,requirements:[requirement],conditions:[condition],
    evidence:[],dependencies:[],timingAssertions:[],commitments:[],today:'2026-09-21',calculatedAt:cutoff});
  assert.equal(historical.derivedWithCurrentRules,true);
  assert.deepEqual({verdict:historical.forecast.verdict,claim:historical.forecast.claim,
    premises:historical.forecast.premises},
  {verdict:current.verdict,claim:current.claim,premises:current.premises});
});
