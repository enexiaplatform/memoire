import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activateLocalHistoricalIntegrity,commitLocalHistoricalCollection} from '../../src/services/historicalIntegrity.ts';
import {getLocalHistoricalSourcesAt} from '../../src/services/historicalQuery.ts';
import {deriveBuyerProgress,deriveBuyerProgressAsOf} from '../../src/domain/commercialKernel/buyerProgress.ts';
import {projectOutcomeRequirements} from '../../src/domain/commercialKernel/outcomeRequirement.ts';
class Storage{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage(),when=day=>()=>`2026-09-${day}T00:00:00.000Z`;
const opportunity={id:'o',userId:'u',accountId:'a',accountName:'Acme',opportunityName:'Deal'};
const commitment={id:'c',userId:'u',accountId:'a',opportunityId:'o',commitmentParty:'customer',status:'open',
  createdAt:'2026-09-20T00:00:00Z',commitmentText:'Send approval'};
const condition={id:'cond',userId:'u',accountId:'a',opportunityId:'o',statement:'Test accepted',conditionCategory:'technical',
  intent:'hypothesis',lifecycle:'active',evidenceLinks:[],sourceType:'manual',createdAt:'2026-09-20T00:00:00Z',updatedAt:'2026-09-20T00:00:00Z'};
const requirement={id:'r',userId:'u',accountId:'a',opportunityId:'o',expectedOutcome:'Customer confirms test',
  question:'Confirmed?',role:'required_now',conditionId:'cond',lifecycle:'active',sourceType:'manual',
  createdAt:'2026-09-20T00:00:00Z',updatedAt:'2026-09-20T00:00:00Z'};
const evidence={id:'ev',userId:'u',accountId:'a',opportunityId:'o',category:'technical_outcome',direction:'positive',
  summary:'Accepted',evidenceText:'Customer accepted test',observedAt:'2026-09-19',recordedAt:'2026-09-23T00:00:00Z',
  sourceType:'email',createdAt:'2026-09-23T00:00:00Z',updatedAt:'2026-09-23T00:00:00Z',providedBy:'customer'};
test('historical Buyer Progress reuses current classification, excludes late Evidence, and labels Event gaps',()=>{
  storage.data.clear();
  for(const [key,rows] of Object.entries({'memoire.opportunities.v1':[opportunity],
    'memoire.commercialCommitments.v1':[commitment],
    'memoire.commercialConditions.v1':[condition],
    'memoire.outcomeRequirements.v1':[requirement]}))storage.setItem(key,JSON.stringify(rows));
  activateLocalHistoricalIntegrity('u',storage,when('20'));
  const early=getLocalHistoricalSourcesAt('u','2026-09-22T00:00:00Z',storage);
  const before=deriveBuyerProgressAsOf({sources:early,cutoff:'2026-09-22T00:00:00Z'});
  assert.equal(before.coverage.status,'partial');
  assert.deepEqual(before.projection.get('o').signals.map(signal=>signal.kind),['customer_commitment_made']);
  commitLocalHistoricalCollection('commercial_evidence',[evidence],storage,when('23'));
  commitLocalHistoricalCollection('commercial_conditions',[{...condition,evidenceLinks:[{evidenceId:'ev',assessment:'supports',recordedAt:'2026-09-23T00:00:00Z'}]}],storage,when('23'));
  const later=getLocalHistoricalSourcesAt('u','2026-09-24T00:00:00Z',storage);
  const after=deriveBuyerProgressAsOf({sources:later,cutoff:'2026-09-24T00:00:00Z'});
  assert.deepEqual(after.projection.get('o').signals.map(signal=>signal.kind),['customer_commitment_made','buyer_requirement_confirmed']);
  const confirmed=after.projection.get('o').signals.find(signal=>signal.kind==='buyer_requirement_confirmed');
  assert.equal(confirmed.occurredAt,'2026-09-19T00:00:00.000Z');
  assert.ok(Date.parse(confirmed.recordedAt)>=Date.parse('2026-09-23T00:00:00Z'));
  assert.equal(confirmed.sourceCoverage,'verified');
  const current=deriveBuyerProgress({opportunities:[opportunity],commitments:[commitment],
    events:[],evidence:[evidence],requirementReadings:projectOutcomeRequirements([requirement],
      [{...condition,evidenceLinks:[{evidenceId:'ev',assessment:'supports',recordedAt:'2026-09-23T00:00:00Z'}]}],[evidence]),activities:[]});
  assert.deepEqual(after.projection.get('o').signals.map(signal=>signal.kind),current.get('o').signals.map(signal=>signal.kind));
  const eventOnly=deriveBuyerProgress({opportunities:[opportunity],commitments:[],evidence:[],
    requirementReadings:[],activities:[],events:[
      {id:'po',userId:'u',accountId:'a',opportunityId:'o',eventType:'po_received',occurredAt:'2026-09-25T00:00:00Z',summary:'PO arrived'},
      {id:'paid',userId:'u',accountId:'a',opportunityId:'o',eventType:'payment_received',occurredAt:'2026-09-26T00:00:00Z',summary:'Paid'}]});
  assert.deepEqual(eventOnly.get('o').signals.map(signal=>signal.kind),['payment_received','po_received']);
  assert.ok(after.projection.get('o').signals.every(signal=>!['po_received','payment_received'].includes(signal.kind)));
  assert.deepEqual(after.coverage.unavailableSources,['po_received_event','payment_received_event','edited_or_deleted_activity_history']);
  const activity={id:'old-meeting',userId:'u',linkedOpportunityId:'o',linkStatus:'Linked',activityDate:'2026-09-18',
    createdAt:'2026-09-25T00:00:00Z',updatedAt:'2026-09-25T00:00:00Z'};
  const beforeActivity=deriveBuyerProgressAsOf({sources:early,cutoff:'2026-09-22T00:00:00Z',activities:[activity]});
  assert.equal(beforeActivity.projection.get('o').recordedActivityCount,0);
  const afterActivity=deriveBuyerProgressAsOf({sources:later,cutoff:'2026-09-26T00:00:00Z',activities:[activity]});
  assert.equal(afterActivity.projection.get('o').recordedActivityCount,1);
  assert.equal(afterActivity.projection.get('o').lastRecordedActivityAt,'2026-09-18T00:00:00.000Z');
  const edited={...activity,id:'edited-meeting',createdAt:'2026-09-20T00:00:00Z',updatedAt:'2026-09-25T00:00:00Z'};
  const beforeEdit=deriveBuyerProgressAsOf({sources:early,cutoff:'2026-09-22T00:00:00Z',activities:[edited]});
  assert.equal(beforeEdit.projection.get('o').recordedActivityCount,0);
  const completed={...commitment,status:'completed',completedAt:'2026-09-25T00:00:00Z',
    currentDueDate:'2026-09-24',updatedAt:'2026-09-25T00:00:00Z'};
  const seller={...commitment,id:'seller',commitmentParty:'internal',createdAt:'2026-09-25T00:00:00Z'};
  commitLocalHistoricalCollection('commercial_commitments',[completed,seller],storage,when('25'));
  const beforeCompletion=deriveBuyerProgressAsOf({sources:later,cutoff:'2026-09-24T00:00:00Z'});
  const afterCompletion=deriveBuyerProgressAsOf({sources:getLocalHistoricalSourcesAt('u','2026-09-26T00:00:00Z',storage),
    cutoff:'2026-09-26T00:00:00Z'});
  assert.equal(beforeCompletion.projection.get('o').signals.some(signal=>signal.kind==='customer_commitment_kept'),false);
  assert.equal(afterCompletion.projection.get('o').signals.some(signal=>signal.kind==='customer_commitment_kept'),true);
  assert.equal(afterCompletion.projection.get('o').signals.some(signal=>signal.sourceRecordId==='seller'),false);
});
