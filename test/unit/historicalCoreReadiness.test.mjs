import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activateLocalHistoricalIntegrity,commitLocalHistoricalCollection} from '../../src/services/historicalIntegrity.ts';
import {getLocalHistoricalSourcesAt} from '../../src/services/historicalQuery.ts';
import {deriveForecastDefensibility} from '../../src/domain/commercialKernel/deriveForecastDefensibility.ts';
import {projectOutcomeRequirements,nextBestQuestion} from '../../src/domain/commercialKernel/outcomeRequirement.ts';
import {deriveKnownBlockers} from '../../src/domain/commercialKernel/commercialDependency.ts';
class Storage{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const clock=day=>()=>`2026-09-${day}T00:00:00Z`;
const base='2026-09-20T00:00:00Z';
const opportunity={id:'o',userId:'u',accountId:'a',accountName:'Acme',opportunityName:'Renewal',stage:'Qualification',
  status:'Active',expectedClosePeriod:'2026-09-30',forecastEvidenceCategory:'Defensible',createdAt:base};
const requirement=(id,conditionId=null)=>({id,userId:'u',accountId:'a',opportunityId:'o',expectedOutcome:`Outcome ${id}`,
  question:`Confirm ${id}?`,conditionId,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:base,updatedAt:base});
const condition={id:'condition',userId:'u',accountId:'a',opportunityId:'o',statement:'Buyer confirms QA',
  conditionCategory:'technical',intent:'hypothesis',lifecycle:'active',sourceType:'manual',createdAt:base,updatedAt:base,evidenceLinks:[]};
const evidence={id:'evidence',userId:'u',accountId:'a',opportunityId:'o',category:'technical_outcome',direction:'positive',
  summary:'QA accepted',evidenceText:'Buyer QA accepted',observedAt:'2026-09-18',recordedAt:'2026-09-22T00:00:00Z',
  sourceType:'email',createdAt:'2026-09-22T00:00:00Z',updatedAt:'2026-09-22T00:00:00Z'};
const timing={id:'timing',userId:'u',opportunityId:'o',basis:'Signed terms',lifecycle:'active',kind:'duration',
  requirementId:'B',durationDays:3,durationUnit:'calendar_days',epistemic:'supported',sourceKind:'contract',
  sourceReference:'Signed terms',evidenceId:null,commitmentId:null,sourceType:'manual',createdAt:base,updatedAt:base};
const anchor={...timing,id:'anchor',kind:'target_anchor',durationDays:null,durationUnit:null,epistemic:null,
  sourceKind:null,sourceReference:null};
const seed=(storage,collections)=>{for(const [type,rows] of Object.entries(collections))storage.setItem(type,JSON.stringify(rows));
  activateLocalHistoricalIntegrity('u',storage,clock('20'));};
const at=(storage,day)=>{
  const composition=getLocalHistoricalSourcesAt('u',`2026-09-${day}T12:00:00Z`,storage);
  assert.equal(composition.status,'verified');return composition.records;
};
const forecast=(records,day)=>deriveForecastDefensibility({opportunity:records.opportunities[0],
  requirements:records.commercial_outcome_requirements,conditions:records.commercial_conditions,
  evidence:records.commercial_evidence,dependencies:records.commercial_dependencies,
  timingAssertions:records.commercial_timing_assertions,commitments:records.commercial_commitments,
  today:`2026-09-${day}`,calculatedAt:`2026-09-${day}T12:00:00Z`});
test('core M8 source composition rederives forecast at four cutoffs without reading current state',()=>{
  const storage=new Storage();seed(storage,{'memoire.opportunities.v1':[opportunity],
    'memoire.outcomeRequirements.v1':[requirement('A'),requirement('B')],
    'memoire.commercialConditions.v1':[condition]});
  const sep21=forecast(at(storage,'21'),'21');
  assert.equal(sep21.premises[0].state,'unknown');
  assert.equal(sep21.verdict,'incomplete');
  commitLocalHistoricalCollection('commercial_evidence',[evidence],storage,clock('22'));
  commitLocalHistoricalCollection('commercial_conditions',[{...condition,evidenceLinks:[{evidenceId:'evidence',assessment:'supports',recordedAt:'2026-09-22T00:00:00Z'}]}],storage,clock('22'));
  commitLocalHistoricalCollection('commercial_outcome_requirements',[requirement('A','condition'),requirement('B')],storage,clock('22'));
  const sep22=forecast(at(storage,'22'),'22');
  assert.equal(sep22.premises[0].state,'supported');
  assert.equal(sep22.timing.status,'unknown');
  commitLocalHistoricalCollection('commercial_timing_assertions',[anchor,timing],storage,clock('23'));
  const sep23=forecast(at(storage,'23'),'23');
  assert.ok(sep23.timing);
  assert.equal(sep23.claim.targetDate,'2026-09-30');
  commitLocalHistoricalCollection('opportunities',[{...opportunity,expectedClosePeriod:'2026-10-15'}],storage,clock('24'));
  const sep24=forecast(at(storage,'24'),'24');
  assert.equal(sep24.claim.targetDate,'2026-10-15');
  assert.equal(forecast(at(storage,'21'),'21').premises[0].state,'unknown');
  assert.equal(forecast(at(storage,'23'),'23').claim.targetDate,'2026-09-30');
});
test('historical blockers use the cutoff dependency graph and never a later retirement',()=>{
  const storage=new Storage();
  const edge=(id,dependentRequirementId,prerequisiteRequirementId)=>({id,userId:'u',opportunityId:'o',
    dependentRequirementId,prerequisiteRequirementId,basis:'Needed first',lifecycle:'active',sourceType:'manual',
    createdAt:base,updatedAt:base});
  const edges=[edge('A-B','A','B'),edge('B-C','B','C')];
  seed(storage,{'memoire.opportunities.v1':[opportunity],
    'memoire.outcomeRequirements.v1':[requirement('A'),requirement('B'),requirement('C')],
    'memoire.commercialDependencies.v1':edges,
    'memoire.commercialConditions.v1':[condition]});
  const readings=records=>projectOutcomeRequirements(records.commercial_outcome_requirements,
    records.commercial_conditions,records.commercial_evidence);
  const before=at(storage,'21');
  const beforeReadings=readings(before);
  assert.equal(nextBestQuestion(beforeReadings)?.requirement.id,'A');
  const initialBlockers=deriveKnownBlockers('o',beforeReadings,before.commercial_dependencies,['A']);
  assert.ok(initialBlockers.blockers.some(b=>b.reading.requirement.id==='C'),JSON.stringify(initialBlockers));
  commitLocalHistoricalCollection('commercial_evidence',[evidence],storage,clock('22'));
  commitLocalHistoricalCollection('commercial_conditions',[{...condition,evidenceLinks:[{evidenceId:'evidence',assessment:'supports',recordedAt:'2026-09-22T00:00:00Z'}]}],storage,clock('22'));
  commitLocalHistoricalCollection('commercial_outcome_requirements',[requirement('A'),requirement('B'),requirement('C','condition')],storage,clock('22'));
  const supported=at(storage,'22');
  assert.equal(readings(supported).find(r=>r.requirement.id==='C').resolution,'resolved');
  commitLocalHistoricalCollection('commercial_dependencies',[edges[0],{...edges[1],lifecycle:'retired'}],storage,clock('23'));
  const retired=at(storage,'23');
  assert.equal(retired.commercial_dependencies.find(r=>r.id==='B-C').lifecycle,'retired');
  assert.equal(at(storage,'21').commercial_dependencies.find(r=>r.id==='B-C').lifecycle,'active');
});
test('M7.1 snapshots lacking updatedAt retain commercial meaning with inferred validator metadata',()=>{
  const storage=new Storage();seed(storage,{'memoire.opportunities.v1':[opportunity],
    'memoire.outcomeRequirements.v1':[requirement('A')],
    'memoire.commercialConditions.v1':[condition]});
  const revisions=JSON.parse(storage.getItem('memoire.stateRevisions.v1'));
  for(const revision of revisions)if(revision.state)delete revision.state.updatedAt;
  storage.setItem('memoire.stateRevisions.v1',JSON.stringify(revisions));
  const composition=getLocalHistoricalSourcesAt('u','2026-09-21T12:00:00Z',storage);
  assert.equal(composition.status,'verified');
  assert.equal(composition.metadataInferred,true);
  assert.equal(forecast(composition.records,'21').premises[0].state,'unknown');
});
