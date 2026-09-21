import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveMoneyConsequences,aggregateMoneyConsequences,attachMoneyConsequenceContext} from '../../src/domain/commercialKernel/deriveMoneyConsequences.ts';
import {activateLocalHistoricalIntegrity,commitLocalHistoricalCollection} from '../../src/services/historicalIntegrity.ts';
import {getLocalHistoricalSourcesAt} from '../../src/services/historicalQuery.ts';
import {composeCommercialStateAsOf} from '../../src/services/commercialTimeMachine.ts';
import {buildRestorePlan} from '../../src/utils/workspaceBackup.ts';

const at='2026-09-20T00:00:00.000Z';
const opportunity={id:'o',userId:'u',accountId:'a',accountName:'Acme',opportunityName:'Order target',stage:'Proposal',status:'Active',
  estimatedValue:1_200_000_000,currency:'VND',expectedClosePeriod:'2026-09-30',forecastEvidenceCategory:'Defensible',createdAt:at,updatedAt:at};
const requirement=(id,label,conditionId=null)=>({id,userId:'u',accountId:'a',opportunityId:'o',expectedOutcome:label,question:`Confirm ${label}`,
  conditionId,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
const gate=(patch={})=>({id:'g',userId:'u',opportunityId:'o',moneySourceType:'opportunity_value',moneySourceId:'o',requirementId:'a',
  basisKind:'operator_confirmed_structure',basis:'Operator confirmed customer process',lifecycle:'active',sourceType:'manual',sourceId:null,
  sourceUrl:null,sourceUpdatedAt:null,createdAt:at,updatedAt:at,...patch});
const dependency=(id,dependent,prerequisite)=>({id,userId:'u',opportunityId:'o',dependentRequirementId:dependent,
  prerequisiteRequirementId:prerequisite,basis:'Hard customer prerequisite',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at});
const condition=(id,links=[])=>({id,userId:'u',accountId:'a',opportunityId:'o',statement:id,conditionCategory:'commercial',intent:'hypothesis',
  lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,evidenceLinks:links});
const evidence=id=>({id,userId:'u',accountId:'a',opportunityId:'o',category:'commercial',direction:'positive',summary:id,evidenceText:id,
  observedAt:'2026-09-20',recordedAt:at,providedBy:'customer',sourceType:'manual',createdAt:at,updatedAt:at});
const derive=(patch={})=>deriveMoneyConsequences({opportunities:[opportunity],quotes:[],gates:[],requirements:[requirement('a','Order readiness')],
  conditions:[],evidence:[],dependencies:[],timingAssertions:[],commitments:[],today:'2026-09-20',calculatedAt:at,...patch});

test('value and blocker remain context until an explicit Gate exists',()=>{
  const context=derive();assert.equal(context.contexts[0].amount,1_200_000_000);assert.equal(context.contexts[0].explicitlyGated,false);
  assert.equal(context.consequences.length,0);
  const explicit=derive({gates:[gate()]});assert.equal(explicit.consequences.length,1);
  assert.deepEqual(explicit.consequences[0].consequenceKinds,['gated','timing_incomplete']);
});

test('one source follows the Requirement graph to one upstream blocker',()=>{
  const requirements=[requirement('a','Order readiness'),requirement('b','QA acceptance')];
  const value=derive({gates:[gate()],requirements,dependencies:[dependency('d','a','b')]});
  assert.equal(value.consequences[0].amount,1_200_000_000);
  assert.deepEqual(value.consequences[0].blockers.map(row=>row.requirementId),['b']);
  assert.deepEqual(value.consequences[0].blockers[0].paths[0].requirementIds,['b','a']);
});

test('multiple blockers never multiply one amount',()=>{
  const requirements=[requirement('a','Order readiness'),requirement('b','QA'),requirement('c','Quantity')];
  const value=derive({gates:[gate()],requirements,dependencies:[dependency('d1','a','b'),dependency('d2','a','c')]});
  assert.equal(value.consequences.length,1);assert.equal(value.consequences[0].blockers.length,2);
  assert.equal(aggregateMoneyConsequences(value.consequences)[0].amount,1_200_000_000);
});

test('resolved gating path means no current blocker, not received cash',()=>{
  const e=evidence('proof'),c=condition('condition',[{evidenceId:'proof',assessment:'supports',recordedAt:at}]);
  const value=derive({gates:[gate()],requirements:[requirement('a','Order readiness','condition')],conditions:[c],evidence:[e]});
  assert.deepEqual(value.consequences[0].consequenceKinds,['no_current_blocker']);
  assert.equal(value.consequences[0].realizationState,'potential');
});

test('a paid Quote is realized and no longer propagates its old blocker',()=>{
  const quote={id:'q',quoteId:'Q-1',opportunityId:'o',accountId:'a',accountName:'Acme',status:'Accepted',paymentStatus:'Paid',
    deliveryStatus:'Delivered',poStatus:'Received',amount:1_200_000_000,currency:'VND',createdAt:at,updatedAt:at};
  const value=derive({quotes:[quote],gates:[gate({moneySourceType:'quote_value',moneySourceId:'q'})]});
  assert.deepEqual(value.consequences[0].consequenceKinds,['realized']);
  assert.equal(value.consequences[0].blockers.length,0);
});

test('contradicted Requirement remains structurally gated without probability',()=>{
  const e=evidence('contrary'),c=condition('condition',[{evidenceId:'contrary',assessment:'contradicts',recordedAt:at}]);
  const value=derive({gates:[gate()],requirements:[requirement('a','Order readiness','condition')],conditions:[c],evidence:[e]});
  assert.equal(value.consequences[0].blockers[0].state,'conflicted');
  assert.equal(JSON.stringify(value).includes('probability'),false);
});

test('linked M5 timing distinguishes unsupported from incomplete without financial loss',()=>{
  const base={userId:'u',opportunityId:'o',requirementId:'a',basis:'Contract',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at,
    durationDays:null,durationUnit:null,epistemic:null,sourceKind:null,sourceReference:null,evidenceId:null,commitmentId:null};
  const anchor={...base,id:'anchor',kind:'target_anchor'};
  const duration={...base,id:'duration',kind:'duration',durationDays:20,durationUnit:'calendar_days',epistemic:'supported',sourceKind:'contract',sourceReference:'Terms'};
  assert.equal(derive({gates:[gate()]}).consequences[0].timingState,'incomplete');
  const unsupported=derive({gates:[gate()],requirements:[requirement('a','Order readiness'),requirement('b','QA')],
    dependencies:[dependency('d','a','b')],timingAssertions:[anchor,duration],today:'2026-09-29'}).consequences[0];
  assert.equal(unsupported.timingState,'unsupported');assert.ok(unsupported.consequenceKinds.includes('timing_unsupported'));
  assert.equal(unsupported.reasonCodes.some(code=>code.includes('LOSS')),false);
});

test('overdue receivable uses outstanding after partial payment and infers no cause',()=>{
  const receivable={sourceId:'receivable-o',opportunityId:'o',currency:'VND',outstandingAmount:200_000_000,overdueAmount:200_000_000,daysOverdue:10,settled:false};
  const value=derive({receivables:[receivable]});const row=value.consequences[0];
  assert.equal(row.amount,200_000_000);assert.deepEqual(row.consequenceKinds,['overdue']);assert.equal(row.linkedRequirementId,null);
  assert.equal(row.daysOverdue,10);
});

test('economic identity and currency rules prevent unsafe portfolio totals',()=>{
  const base=derive({gates:[gate()]}).consequences[0];
  const duplicate={...base,moneySourceId:'quote',moneySourceType:'quote_value'};
  assert.equal(aggregateMoneyConsequences([base,duplicate])[0].amount,null);
  const independent={...base,moneySourceId:'other',opportunityId:'other',economicIdentityKey:'other',currency:'USD',amount:50_000};
  const totals=aggregateMoneyConsequences([base,independent]);assert.deepEqual(totals.map(row=>row.currency),['USD','VND']);
});

test('Decision and recommendation receive structural context but no causal credit',()=>{
  const projection=derive({gates:[gate()]});
  const [item]=attachMoneyConsequenceContext([{opportunityId:'o',requirementId:'a',reasonText:'Resolve QA.',sourceRecordIds:['a']}],projection);
  assert.match(item.reasonText,/Linked downstream/);assert.doesNotMatch(item.reasonText,/saved|recovered|caused|protected/i);
});

class Storage{data=new Map();getItem(key){return this.data.get(key)??null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
test('historical value and Gate obey cutoff and Gate retirement',()=>{
  const storage=new Storage();storage.setItem('memoire.opportunities.v1',JSON.stringify([opportunity]));
  storage.setItem('memoire.outcomeRequirements.v1',JSON.stringify([requirement('a','Order readiness','condition')]));
  storage.setItem('memoire.commercialConditions.v1',JSON.stringify([condition('condition')]));
  storage.setItem('memoire.commercialEvidence.v1',JSON.stringify([evidence('proof')]));
  activateLocalHistoricalIntegrity('u',storage,()=>at);
  commitLocalHistoricalCollection('commercial_money_gates',[gate({createdAt:'2026-09-22T00:00:00Z',updatedAt:'2026-09-22T00:00:00Z'})],storage,()=> '2026-09-22T00:00:00Z');
  const view=cutoff=>composeCommercialStateAsOf({sources:getLocalHistoricalSourcesAt('u',cutoff,storage),scope:'u',opportunityId:'o',cutoff,timeZone:'UTC'});
  assert.equal(view('2026-09-21T00:00:00Z').moneyConsequences.consequences.length,0);
  assert.equal(view('2026-09-23T00:00:00Z').moneyConsequences.consequences.length,1);
  commitLocalHistoricalCollection('commercial_conditions',[condition('condition',[{evidenceId:'proof',assessment:'supports',recordedAt:'2026-09-24T00:00:00Z'}])],storage,()=> '2026-09-24T00:00:00Z');
  assert.deepEqual(view('2026-09-24T00:00:01Z').moneyConsequences.consequences[0].consequenceKinds,['no_current_blocker']);
  commitLocalHistoricalCollection('opportunities',[{...opportunity,estimatedValue:1_500_000_000,updatedAt:'2026-09-25T00:00:00Z'}],storage,()=> '2026-09-25T00:00:01Z');
  assert.equal(view('2026-09-26T00:00:00Z').moneyConsequences.consequences[0].amount,1_500_000_000);
  commitLocalHistoricalCollection('commercial_money_gates',[gate({lifecycle:'retired',createdAt:'2026-09-22T00:00:00Z',updatedAt:'2026-09-27T00:00:00Z'})],storage,()=> '2026-09-27T00:00:00Z');
  assert.equal(view('2026-09-28T00:00:00Z').moneyConsequences.consequences.length,0);
});

test('backup validates Money Gate references and preserves revision-covered state',()=>{
  const local={'memoire.opportunities.v1':[opportunity],'memoire.accounts.v1':[{id:'a',userId:'u'}],
    'memoire.outcomeRequirements.v1':[requirement('a','Order readiness')],'memoire.commercialMoneyGates.v1':[gate()]};
  const plan=buildRestorePlan({exportedAt:at,formatVersion:10,localBrowserData:local});
  assert.ok(plan.writes.some(row=>row.key==='memoire.commercialMoneyGates.v1'));
  assert.throws(()=>buildRestorePlan({exportedAt:at,formatVersion:10,localBrowserData:{...local,'memoire.commercialMoneyGates.v1':[gate({requirementId:'missing'})]}}),/endpoints/);
});

test('migration and surfaces preserve RLS, revisions, read-only history and non-causal language',()=>{
  const migration=readFileSync(new URL('../../supabase/migrations/20260921190000_commercial_money_gates.sql',import.meta.url),'utf8');
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/capture_commercial_state_revision/);
  assert.match(migration,/money_source_type IN \('opportunity_value','quote_value'\)/);
  const current=readFileSync(new URL('../../src/features/opportunities/CommercialStatePanel.tsx',import.meta.url),'utf8');
  const historical=readFileSync(new URL('../../src/features/opportunities/HistoricalOpportunityDrawer.tsx',import.meta.url),'utf8');
  assert.match(current,/This value depends on/);assert.match(historical,/Money consequence then/);
  assert.doesNotMatch(current,/revenue (lost|saved)|caused .* loss/i);
});
