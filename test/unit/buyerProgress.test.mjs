import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBuyerProgress } from '../../src/domain/commercialKernel/buyerProgress.ts';
import { projectOutcomeRequirements } from '../../src/domain/commercialKernel/outcomeRequirement.ts';

const at='2026-09-01T12:00:00.000Z';
const opportunity={id:'o',userId:'u',accountId:'a',accountName:'Acme',opportunityName:'Deal'};
const commitment={id:'c',userId:'u',accountId:'a',opportunityId:'o',commitmentParty:'customer',status:'completed',createdAt:at,completedAt:'2026-09-03T12:00:00.000Z',commitmentText:'Send purchase order'};
const evidence={id:'ev',userId:'u',accountId:'a',opportunityId:'o',category:'technical_outcome',direction:'positive',summary:'Accepted',evidenceText:'Customer accepted test',observedAt:'2026-09-02',recordedAt:at,sourceType:'email',createdAt:at,updatedAt:at,providedBy:'customer'};
const condition={id:'cond',userId:'u',accountId:'a',opportunityId:'o',statement:'Test accepted',conditionCategory:'technical',intent:'hypothesis',lifecycle:'active',evidenceLinks:[{evidenceId:'ev',assessment:'supports',recordedAt:at}],sourceType:'manual',createdAt:at,updatedAt:at};
const requirement={id:'r',userId:'u',accountId:'a',opportunityId:'o',expectedOutcome:'Customer confirms test',question:'Confirmed?',role:'required_now',conditionId:'cond',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
const event={id:'po',userId:'u',accountId:'a',opportunityId:'o',eventType:'po_received',summary:'PO received',occurredAt:'2026-09-04T12:00:00.000Z'};
const payment={...event,id:'payment',eventType:'payment_received',summary:'Payment received',occurredAt:'2026-09-06T12:00:00.000Z'};
const activity={id:'act',userId:'u',linkedOpportunityId:'o',linkStatus:'Linked',activityDate:'2026-09-05',createdAt:at};
const input={opportunities:[opportunity],commitments:[commitment],events:[event,payment],evidence:[evidence],requirementReadings:projectOutcomeRequirements([requirement],[condition],[evidence]),activities:[activity]};
test('buyer progress uses customer commitments, PO and explicitly customer-provided supporting evidence',()=>{
  const view=deriveBuyerProgress(input).get('o');
  assert.deepEqual(view.signals.map(s=>s.kind),['payment_received','po_received','customer_commitment_kept','buyer_requirement_confirmed','customer_commitment_made']);
  assert.equal(view.recordedActivityCount,1);assert.equal(view.last.sourceRecordId,'payment');
  assert.ok(view.signals.every(s=>s.actorParty==='customer'));
});
test('seller activity and legacy or seller evidence never create buyer progress',()=>{
  for(const providedBy of [undefined,null,'self','internal']){
    const item={...evidence,providedBy};const view=deriveBuyerProgress({...input,commitments:[{...commitment,commitmentParty:'self'}],events:[],evidence:[item],requirementReadings:projectOutcomeRequirements([requirement],[condition],[item])}).get('o');
    assert.equal(view.signals.length,0);assert.equal(view.recordedActivityCount,1);
  }
});
test('sample and owner boundaries prevent progress crossing into a live opportunity',()=>{
  const view=deriveBuyerProgress({...input,commitments:[{...commitment,isSample:true}],events:[{...event,userId:'other'},{...payment,userId:null}],evidence:[{...evidence,isSample:true}],activities:[{...activity,isSample:true}]}).get('o');
  assert.equal(view.signals.length,0);assert.equal(view.recordedActivityCount,0);
});
test('sample projection includes only sample customer records',()=>{
  const sampleOpportunity={...opportunity,isSample:true};
  const projection=deriveBuyerProgress({...input,opportunities:[sampleOpportunity],commitments:[commitment,{...commitment,id:'sample-c',isSample:true}],events:[event,{...event,id:'sample-po',isSample:true}],evidence:[],requirementReadings:[],activities:[activity,{...activity,id:'sample-act',isSample:true}],includeSampleRecords:true});
  const view=projection.get('o');
  assert.deepEqual(view.signals.map(s=>s.sourceRecordId),['sample-po','sample-c','sample-c']);
  assert.equal(view.recordedActivityCount,1);
});
test('many seller activities are factual context only; recent buyer movement remains visible after an old touch',()=>{
  const activities=Array.from({length:35},(_,i)=>({...activity,id:`act-${i}`,activityDate:'2026-08-01'}));
  const sellerOnly=deriveBuyerProgress({...input,commitments:[],events:[],evidence:[],requirementReadings:[],activities}).get('o');
  assert.equal(sellerOnly.recordedActivityCount,35);assert.equal(sellerOnly.signals.length,0);
  const buyer=deriveBuyerProgress({...input,commitments:[],events:[payment],evidence:[],requirementReadings:[],activities:[activity]}).get('o');
  assert.equal(buyer.last.kind,'payment_received');assert.equal(buyer.lastRecordedActivityAt,'2026-09-05T00:00:00.000Z');
});
