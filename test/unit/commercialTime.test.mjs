import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCommercialTime } from '../../src/domain/commercialKernel/deriveCommercialTime.ts';
import { validateTimingAssertions } from '../../src/domain/commercialKernel/commercialTiming.ts';
import { evaluateCommercialPolicies } from '../../src/domain/commercialKernel/policyEngine.ts';

const at='2026-09-01T12:00:00.000Z';
const opportunity={id:'o',userId:'u',accountId:'a',accountName:'Acme',opportunityName:'Deal',stage:'Qualification',status:'Active',expectedClosePeriod:'2026-09-30'};
const requirement=(id,role='context')=>({id,userId:'u',accountId:'a',opportunityId:'o',expectedOutcome:id,question:`Confirm ${id}?`,conditionId:null,role,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
const dependency=(dependent,prerequisite)=>({id:`${dependent}-${prerequisite}`,userId:'u',opportunityId:'o',dependentRequirementId:dependent,prerequisiteRequirementId:prerequisite,basis:'Needed first',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
const base={userId:'u',opportunityId:'o',basis:'Operator confirmed',lifecycle:'active',durationDays:null,durationUnit:null,epistemic:null,sourceKind:null,sourceReference:null,evidenceId:null,commitmentId:null,sourceType:'manual',createdAt:at,updatedAt:at};
const anchor=(id='A')=>({...base,id:'target',requirementId:id,kind:'target_anchor'});
const duration=(id,requirementId,days,patch={})=>({...base,id,requirementId,kind:'duration',durationDays:days,durationUnit:'calendar_days',epistemic:'supported',sourceKind:'contract',sourceReference:'Signed agreement §3',...patch});
const link=(id,requirementId,commitmentId)=>({...base,id,requirementId,kind:'commitment_link',commitmentId});
const commitment=(id,date)=>({id,userId:'u',accountId:'a',opportunityId:'o',commitmentParty:'customer',status:'open',currentDueDate:date,originalDueDate:'2026-09-21',dueDateHistory:[{from:'2026-09-21',to:date,changedAt:at}],commitmentText:'Send docs'});
const input=(patch={})=>({opportunity,requirements:[requirement('A','required_now'),requirement('B')],conditions:[],evidence:[],dependencies:[dependency('A','B')],assertions:[anchor(),duration('duration-A','A',3)],commitments:[],today:'2026-09-20',calculatedAt:'2026-09-20T00:00:00.000Z',...patch});

test('known downstream duration gives a date-only Last Safe Date, while bare dependency does not',()=>{
  const known=deriveCommercialTime(input());
  assert.equal(known.status,'known');assert.equal(known.targetDate,'2026-09-30');assert.equal(known.lastSafeDate,'2026-09-27');
  assert.equal(known.recoveryWindowDays,7);assert.equal(known.bufferDays,null);
  assert.deepEqual(known.constrainingPath,['B','A']);
  const missing=deriveCommercialTime(input({assertions:[anchor()]}));
  assert.equal(missing.status,'partial');assert.equal(missing.lastSafeDate,null);
  assert.match(missing.unknownTimingSegments[0],/A: resolution duration is unknown/);
});
test('multi-level path subtracts only explicit downstream durations; assumption is disclosed',()=>{
  const value=deriveCommercialTime(input({requirements:[requirement('A','required_now'),requirement('B'),requirement('C')],
    dependencies:[dependency('A','B'),dependency('B','C')],assertions:[anchor(),duration('da','A',2),duration('db','B',3)]}));
  assert.equal(value.lastSafeDate,'2026-09-25');assert.deepEqual(value.constrainingPath,['C','B','A']);
  const assumed=deriveCommercialTime(input({assertions:[anchor(),duration('da','A',3,{epistemic:'assumed',sourceKind:'planning_assumption',sourceReference:null,basis:'Planning assumption'})]}));
  assert.equal(assumed.lastSafeDate,'2026-09-27');assert.equal(assumed.assumptionsUsed,true);
});
test('diamond AND branches use tighter date without dropping an alternate route',()=>{
  const value=deriveCommercialTime(input({requirements:[requirement('A','required_now'),requirement('B'),requirement('C'),requirement('D')],
    dependencies:[dependency('A','B'),dependency('A','C'),dependency('B','D'),dependency('C','D')],
    assertions:[anchor(),duration('da','A',2),duration('db','B',3),duration('dc','C',5)]}));
  assert.equal(value.status,'known');assert.equal(value.lastSafeDate,'2026-09-23');
  assert.deepEqual(value.constrainingPath,['D','C','A']);
});
test('commitment current due date supplies factual buffer; history is not a competing due date',()=>{
  const value=deriveCommercialTime(input({assertions:[anchor(),duration('da','A',5),link('lb','B','c')],commitments:[commitment('c','2026-09-23')]}));
  assert.equal(value.lastSafeDate,'2026-09-25');assert.equal(value.bufferDays,2);
  assert.equal(value.blockers[0].commitmentDueDate,'2026-09-23');
  const late=deriveCommercialTime(input({assertions:[anchor(),duration('da','A',5),link('lb','B','c')],commitments:[commitment('c','2026-09-26')]}));
  assert.equal(late.status,'target_no_longer_supported');assert.equal(late.bufferDays,-1);
  const elapsed=deriveCommercialTime(input({assertions:[anchor(),duration('da','A',5)],today:'2026-09-26'}));
  assert.equal(elapsed.status,'target_no_longer_supported');assert.equal(elapsed.recoveryWindowDays,-1);
});
test('conflicts, retired source, unsupported business calendar, and missing target never synthesize dates',()=>{
  const conflicting=deriveCommercialTime(input({assertions:[anchor(),duration('da','A',3),duration('db','A',5,{sourceReference:'Supplier email'})]}));
  assert.equal(conflicting.status,'conflicted');assert.equal(conflicting.lastSafeDate,null);
  assert.equal(deriveCommercialTime(input({assertions:[anchor(),duration('da','A',3,{lifecycle:'retired'})]})).status,'partial');
  const business=deriveCommercialTime(input({assertions:[anchor(),duration('da','A',3,{durationUnit:'business_days'})]}));
  assert.equal(business.status,'partial');assert.match(business.unknownTimingSegments[0],/business-day calendar/);
  assert.equal(deriveCommercialTime(input({opportunity:{...opportunity,expectedClosePeriod:'Q3 2026'}})).lastSafeDate,null);
  assert.equal(deriveCommercialTime(input({assertions:[duration('da','A',3)]})).status,'unknown');
});
test('temporal preflight rejects invalid duration, foreign references, and duplicate active target',()=>{
  const refs={opportunities:[opportunity],requirements:[requirement('A','required_now'),requirement('B')],commitments:[commitment('c','2026-09-23')],evidence:[]};
  validateTimingAssertions([anchor(),duration('da','A',3),link('lb','B','c')],refs);
  for(const bad of [duration('bad','A',-1),duration('bad','A',1.5),duration('bad','A',3,{durationUnit:'weeks'}),duration('bad','A',3,{sourceReference:null}),link('bad','B','foreign')])
    assert.throws(()=>validateTimingAssertions([anchor(),bad],refs));
  assert.throws(()=>validateTimingAssertions([anchor(),{...anchor(),id:'second'}],refs),/Only one/);
});
test('Today raises only a supported target exception, and leaves partial timing on the Opportunity',()=>{
  const basePolicy={threads:[],commitments:[],opportunities:[opportunity],quotes:[],requirements:input().requirements,
    conditions:[],evidence:[],dependencies:input().dependencies,today:new Date('2026-09-28T12:00:00Z')};
  const complete=evaluateCommercialPolicies({...basePolicy,timing:[anchor(),duration('da','A',5)]});
  const warning=complete.find(r=>r.reasonCode==='TIMING_TARGET_UNSUPPORTED');
  assert.equal(warning?.timingDate,'2026-09-25');
  assert.deepEqual(warning?.dependencyPath,['B','A']);
  assert.equal(warning?.sourceRecordIds.includes('da'),true);
  const partial=evaluateCommercialPolicies({...basePolicy,timing:[anchor()]});
  assert.equal(partial.some(r=>r.reasonCode==='TIMING_TARGET_UNSUPPORTED'),false);
});
test('300 Opportunities, 3000 Requirements and 2700 dependencies stay bounded',()=>{
  const opportunities=[],requirements=[],dependencies=[],timing=[];
  for(let i=0;i<300;i++){
    const oid=`opp-${i}`;opportunities.push({...opportunity,id:oid,opportunityName:oid});
    for(let j=0;j<10;j++){
      const id=`${oid}-r${j}`;
      requirements.push({...requirement(id,j===0?'required_now':'context'),opportunityId:oid});
      if(j<9){dependencies.push({...dependency(id,`${oid}-r${j+1}`),opportunityId:oid});
        timing.push({...duration(`${oid}-d${j}`,id,1),opportunityId:oid});}
    }
    timing.push({...anchor(`${oid}-r0`),id:`${oid}-anchor`,opportunityId:oid});
  }
  const start=performance.now();
  const warnings=evaluateCommercialPolicies({threads:[],commitments:[],quotes:[],opportunities,requirements,
    dependencies,timing,conditions:[],evidence:[],today:new Date('2026-10-02T12:00:00Z')});
  const elapsed=performance.now()-start;
  assert.equal(warnings.filter(r=>r.reasonCode==='TIMING_TARGET_UNSUPPORTED').length,300);
  assert.ok(elapsed<10000,`portfolio evaluation took ${Math.round(elapsed)} ms`);
});
test('commercial date arithmetic preserves leap day and date-only commitment semantics',()=>{
  const value=deriveCommercialTime(input({opportunity:{...opportunity,expectedClosePeriod:'2028-03-01'},
    assertions:[anchor(),duration('da','A',1),link('lb','B','c')],commitments:[commitment('c','2028-02-29')],
    today:'2028-02-28',calculatedAt:'2028-02-28T23:30:00.000Z'}));
  assert.equal(value.lastSafeDate,'2028-02-29');
  assert.equal(value.bufferDays,0);
  assert.equal(value.recoveryWindowDays,1);
});
