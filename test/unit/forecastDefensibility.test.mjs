import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveForecastDefensibility, deriveForecastPortfolio } from '../../src/domain/commercialKernel/deriveForecastDefensibility.ts';
import { evaluateCommercialPolicies } from '../../src/domain/commercialKernel/policyEngine.ts';
import { rankRecommendations } from '../../src/domain/commercialKernel/rankRecommendations.ts';

const at='2026-09-01T12:00:00.000Z';
const opportunity={id:'o',userId:'u',accountId:'a',accountName:'Acme',opportunityName:'Renewal',stage:'Qualification',
  status:'Active',expectedClosePeriod:'2026-09-30',forecastEvidenceCategory:'Defensible',nextActionDate:'2026-09-24'};
const requirement=(id,role='required_now',conditionId=null)=>({id,userId:'u',accountId:'a',opportunityId:'o',
  expectedOutcome:`Outcome ${id}`,question:`Confirm ${id}?`,conditionId,role,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
const condition=(id,intent='assumed',links=[])=>({id,userId:'u',accountId:'a',opportunityId:'o',statement:`Proposition ${id}`,
  conditionCategory:'commercial',intent,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,evidenceLinks:links});
const evidence=(id)=>({id,userId:'u',accountId:'a',opportunityId:'o',category:'technical_outcome',direction:'positive',
  summary:`Source ${id}`,evidenceText:`Buyer statement ${id}`,observedAt:'2026-09-01',recordedAt:at,createdAt:at,updatedAt:at,sourceType:'manual'});
const link=(id,assessment='supports')=>({evidenceId:id,assessment,recordedAt:at});
const dependency=(dependent,prerequisite)=>({id:`${dependent}-${prerequisite}`,userId:'u',opportunityId:'o',
  dependentRequirementId:dependent,prerequisiteRequirementId:prerequisite,basis:'Needed first',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
const timingBase={userId:'u',opportunityId:'o',basis:'Operator confirmed',lifecycle:'active',durationDays:null,
  durationUnit:null,epistemic:null,sourceKind:null,sourceReference:null,evidenceId:null,commitmentId:null,
  sourceType:'manual',createdAt:at,updatedAt:at};
const anchor=(id='A')=>({...timingBase,id:'anchor',kind:'target_anchor',requirementId:id});
const duration=(id,requirementId,days,patch={})=>({...timingBase,id,kind:'duration',requirementId,
  durationDays:days,durationUnit:'calendar_days',epistemic:'supported',sourceKind:'contract',sourceReference:'Signed terms',...patch});
const args=(patch={})=>({opportunity,requirements:[requirement('A','required_now','cA')],
  conditions:[condition('cA','assumed',[link('eA')])],evidence:[evidence('eA')],dependencies:[],timingAssertions:[],
  commitments:[],today:'2026-09-20',calculatedAt:'2026-09-20T08:00:00.000Z',...patch});
const derive=(patch={})=>deriveForecastDefensibility(args(patch));

test('dated claim and supported required premises produce a scoped argument, not a score',()=>{
  const value=derive();
  assert.equal(value.verdict,'defensible');assert.equal(value.timingEvaluation,'not_needed');
  assert.equal(value.claim.kind,'opportunity_close');assert.equal(value.claim.targetDate,'2026-09-30');
  assert.deepEqual(value.premises.map(p=>p.state),['supported']);
  assert.deepEqual(value.premises[0].evidenceIds,['eA']);
  assert.equal(value.sourceRecordIds.includes('eA'),true);
  assert.equal(Object.hasOwn(value,'score'),false);
  assert.deepEqual(derive().sourceRecordIds,value.sourceRecordIds);
});
test('no claim and no required-now basis cannot receive a positive verdict',()=>{
  assert.equal(derive({opportunity:{...opportunity,expectedClosePeriod:''}}).verdict,'no_claim');
  assert.equal(derive({opportunity:{...opportunity,expectedClosePeriod:'Q3 2026'}}).verdict,'no_claim');
  const empty=derive({requirements:[],conditions:[],evidence:[]});
  assert.equal(empty.verdict,'insufficient_basis');assert.equal(empty.categoryDisagreement,'operator_more_confident');
  assert.equal(empty.whatWouldHaveToBeTrue.length,1);
});
test('assumption, hypothesis, unknown and contradiction remain distinct with source IDs',()=>{
  const assumed=derive({conditions:[condition('cA')],evidence:[],timingAssertions:[anchor()]});
  assert.equal(assumed.verdict,'conditional');assert.equal(assumed.premises[0].state,'assumed');
  assert.equal(assumed.premises[0].sourceRecordIds.includes('cA'),true);
  const hypothesis=derive({conditions:[condition('cA','hypothesis')],evidence:[],timingAssertions:[anchor()]});
  assert.equal(hypothesis.verdict,'conditional');assert.equal(hypothesis.premises[0].state,'hypothesis');
  const unknown=derive({requirements:[requirement('A')],conditions:[],evidence:[],timingAssertions:[anchor()]});
  assert.equal(unknown.verdict,'incomplete');assert.equal(unknown.nextQuestion.question,'Confirm A?');
  const conflict=derive({conditions:[condition('cA','assumed',[link('eA','supports'),link('eB','contradicts')])],
    evidence:[evidence('eA'),evidence('eB')]});
  assert.equal(conflict.verdict,'not_currently_supported');assert.equal(conflict.premises[0].state,'contradicted');
  assert.deepEqual(conflict.premises[0].evidenceIds,['eA','eB']);
});
test('known upstream leaf is one blocker with its path, and later scope remains explicit',()=>{
  const value=derive({requirements:[requirement('A','required_now','cA'),requirement('B','required_later')],
    conditions:[condition('cA')],evidence:[],dependencies:[dependency('A','B')],timingAssertions:[anchor(),duration('dA','A',3)]});
  assert.equal(value.blockers.length,1);assert.equal(value.blockers[0].requirementId,'B');
  assert.deepEqual(value.blockers[0].paths[0].requirementIds,['B','A']);
  assert.equal(value.blockers[0].sourceRecordIds.includes('A-B'),true);
  assert.equal(value.coverage.linkedLaterCount,1);assert.equal(value.coverage.unscopedLaterCount,0);
  const unlinked=derive({requirements:[requirement('A','required_now','cA'),requirement('B','required_later')]});
  assert.equal(unlinked.verdict,'incomplete');assert.equal(unlinked.coverage.unscopedLaterCount,1);
});
test('known timing, missing timing and unsupported timing are separate',()=>{
  const shared={requirements:[requirement('A','required_now','cA'),requirement('B','context','cB')],
    conditions:[condition('cA','assumed'),condition('cB','assumed')],evidence:[],dependencies:[dependency('A','B')]};
  const supported=derive({...shared,timingAssertions:[anchor(),duration('dA','A',3)]});
  assert.equal(supported.timingEvaluation,'supported');assert.equal(supported.verdict,'conditional');
  assert.equal(supported.timing.lastSafeDate,'2026-09-27');
  const assumed=derive({...shared,timingAssertions:[anchor(),duration('dA','A',3,{epistemic:'assumed',sourceKind:'planning_assumption',sourceReference:null})]});
  assert.equal(assumed.timingEvaluation,'conditional');assert.equal(assumed.sourceRecordIds.includes('dA'),true);
  const incomplete=derive({...shared,timingAssertions:[anchor()]});
  assert.equal(incomplete.timingEvaluation,'incomplete');assert.equal(incomplete.verdict,'incomplete');
  const unsupported=derive({...shared,timingAssertions:[anchor(),duration('dA','A',15)]});
  assert.equal(unsupported.timingEvaluation,'unsupported');assert.equal(unsupported.verdict,'not_currently_supported');
  assert.equal(unsupported.opportunityId,'o');
});
test('one M5 anchor does not certify a second unresolved required-now path',()=>{
  const view=derive({requirements:[requirement('A','required_now','cA'),requirement('B','required_now','cB')],
    conditions:[condition('cA'),condition('cB')],evidence:[],timingAssertions:[anchor()]});
  assert.equal(view.timing.status,'known');
  assert.equal(view.timingEvaluation,'incomplete');
  assert.equal(view.verdict,'incomplete');
  assert.equal(view.reasonCodes.includes('UNANCHORED_REQUIRED_NOW_TIMING'),true);
});
test('context propositions, retired inputs and buyer activity do not create premises',()=>{
  const context=derive({requirements:[requirement('A','required_now','cA'),requirement('C','context','cC')],
    conditions:[condition('cA','assumed',[link('eA')]),condition('cC','assumed',[link('eC')])],
    evidence:[evidence('eA'),evidence('eC')]});
  assert.deepEqual(context.premises.map(p=>p.requirementId),['A']);
  const retired=derive({requirements:[requirement('A','required_now','cA'),{...requirement('B'),lifecycle:'retired'}],
    conditions:[{...condition('cA','assumed',[link('eA')]),lifecycle:'retired'}]});
  assert.equal(retired.premises.length,1);assert.equal(retired.premises[0].state,'unknown');
});
test('operator forecast evidence category is compared, never mutated',()=>{
  const unknown=derive({requirements:[requirement('A')],conditions:[],evidence:[],timingAssertions:[anchor()]});
  assert.equal(unknown.categoryDisagreement,'operator_more_confident');
  const opposite=derive({opportunity:{...opportunity,forecastEvidenceCategory:'Unsupported'}});
  assert.equal(opposite.categoryDisagreement,'operator_less_confident');
  assert.equal(opportunity.forecastEvidenceCategory,'Defensible');
});
test('Opportunity, Review portfolio and Today share the derivation; money work retains ranking precedence',()=>{
  const direct=derive({requirements:[requirement('A')],conditions:[],evidence:[],timingAssertions:[anchor()]});
  const book=deriveForecastPortfolio({opportunities:[opportunity],requirements:[requirement('A')],conditions:[],evidence:[],
    dependencies:[],timingAssertions:[anchor()],commitments:[],today:'2026-09-20',calculatedAt:'2026-09-20T08:00:00.000Z'});
  assert.deepEqual(book.get('o'),direct);
  const rows=evaluateCommercialPolicies({threads:[],quotes:[],opportunities:[opportunity],commitments:[],
    requirements:[requirement('A')],conditions:[],evidence:[],dependencies:[],timing:[anchor()],
    today:new Date('2026-09-20T08:00:00Z')});
  const warning=rows.find(r=>r.reasonCode==='FORECAST_BASIS_DISAGREEMENT');
  assert.ok(warning);assert.match(warning.reasonText,/required premise/);
  assert.equal(warning.sourceRecordIds.includes('A'),true);
  assert.equal(warning.question,'Confirm A?');
  assert.equal(rows.some(r=>r.reasonCode==='OUTCOME_REQUIREMENT_QUESTION'),false);
  const money={...warning,id:'money',reasonCode:'MONEY_CHECKPOINT_STUCK',recommendedAction:'Recover payment'};
  const ranked=rankRecommendations({recommendations:[warning,money],opportunities:[opportunity],quotes:[],commitments:[],
    today:new Date('2026-09-20T08:00:00Z')});
  assert.equal(ranked.ranked[0].id,'money');
});
test('Today stays quiet for supported claims and does not duplicate M5 unsupported-time exceptions',()=>{
  const base={threads:[],quotes:[],opportunities:[opportunity],commitments:[],today:new Date('2026-09-20T08:00:00Z')};
  const supported=evaluateCommercialPolicies({...base,requirements:args().requirements,conditions:args().conditions,
    evidence:args().evidence,dependencies:[],timing:[]});
  assert.equal(supported.some(r=>r.reasonCode==='FORECAST_BASIS_DISAGREEMENT'),false);
  const unresolved={requirements:[requirement('A','required_now','cA'),requirement('B','context','cB')],
    conditions:[condition('cA'),condition('cB')],evidence:[],dependencies:[dependency('A','B')],
    timing:[anchor(),duration('dA','A',15)]};
  const rows=evaluateCommercialPolicies({...base,...unresolved});
  assert.equal(rows.filter(r=>r.reasonCode==='TIMING_TARGET_UNSUPPORTED').length,1);
  assert.equal(rows.filter(r=>r.reasonCode==='FORECAST_BASIS_DISAGREEMENT').length,0);
});
test('portfolio derivation remains bounded at 300 Opportunities and 3000 Requirements',()=>{
  const opportunities=[],requirements=[],dependencies=[],timingAssertions=[];
  for(let i=0;i<300;i++){
    const oid=`o${i}`,aid=`a${i}`;opportunities.push({...opportunity,id:oid,accountId:aid,opportunityName:`Deal ${i}`});
    for(let j=0;j<10;j++){
      const id=`${oid}-r${j}`;requirements.push({...requirement(id,j===0?'required_now':'context'),opportunityId:oid,accountId:aid});
      if(j<9)dependencies.push({...dependency(id,`${oid}-r${j+1}`),opportunityId:oid});
    }
    timingAssertions.push({...anchor(`${oid}-r0`),id:`anchor-${oid}`,opportunityId:oid});
  }
  const start=performance.now();
  const results=deriveForecastPortfolio({opportunities,requirements,conditions:[],evidence:[],dependencies,
    timingAssertions,commitments:[],today:'2026-09-20',calculatedAt:'2026-09-20T08:00:00.000Z'});
  assert.equal(results.size,300);assert.equal(results.get('o0').blockers.length,1);
  assert.ok(performance.now()-start<10000);
});
