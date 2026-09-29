import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocateAttention} from '../../src/domain/commercialKernel/attentionBudget.ts';
import {evaluateCommercialPolicies} from '../../src/domain/commercialKernel/policyEngine.ts';
import {rankRecommendations} from '../../src/domain/commercialKernel/rankRecommendations.ts';
const today=new Date('2026-09-29T12:00:00Z');
const o={id:'o',userId:'owner',accountName:'Acme',opportunityName:'Review',stage:'Proposal',status:'Active',createdAt:'2026-01-01',updatedAt:'2026-01-01'};
const incident={id:'i',userId:'owner',opportunityId:'o',policyId:'p',status:'open',summary:'Deviation',materialImpact:'Coordinated review needed',coordinator:'Operator'};
const input={threads:[],commitments:[],opportunities:[o],quotes:[],today,incidents:[incident]};
const incidentRecommendations=(value=input)=>evaluateCommercialPolicies(value).filter(r=>r.reasonCode==='INCIDENT_RESPONSE_OPEN');
test('budget is bounded, zero means no suggestions, and never selects for a human',()=>{
 const rows=[{id:'a'},{id:'b'},{id:'c'}],copy=JSON.stringify(rows);
 assert.deepEqual(allocateAttention(rows,0,[]).suggested,[]);
 const reading=allocateAttention(rows,2,[]);assert.equal(reading.chosen.length,0);assert.deepEqual(reading.suggested,rows.slice(0,2));assert.equal(reading.outside.length,1);
 assert.equal(JSON.stringify(rows),copy);for(const bad of [-1,21,1.5,NaN])assert.throws(()=>allocateAttention(rows,bad,[]));
});
test('human overrides keep canonical order and survive a reduced budget without silent removal',()=>{
 const rows=[{id:'a'},{id:'b'},{id:'c'}];const reading=allocateAttention(rows,1,['c','a','a']);
 assert.deepEqual(reading.chosen,[rows[0],rows[2]]);assert.equal(reading.overCapacity,1);assert.equal(reading.suggested.length,0);
 assert.deepEqual(allocateAttention(rows,2,['gone']).unavailableIds,['gone']);
});
test('incident candidates require open response, matching owner and sample scope',()=>{
 assert.equal(incidentRecommendations().length,1);
 for(const patch of [{status:'closed'},{userId:'other'},{isSample:true},{opportunityId:'missing'}])assert.equal(incidentRecommendations({...input,incidents:[{...incident,...patch}]}).length,0);
 const sample={...input,opportunities:[{...o,isSample:true}],incidents:[{...incident,isSample:true}],includeSampleRecords:true};assert.equal(incidentRecommendations(sample).length,1);
});
test('incident is a separate review suggestion with source references, no invented deadline or guaranteed unblock',()=>{
 const recommendation=incidentRecommendations()[0];assert.deepEqual(recommendation.sourceRecordIds,['i','p','o']);
 const result=rankRecommendations({...input,recommendations:[recommendation]}).ranked[0];
 assert.equal(result.dueDate,'');assert.equal(result.urgency,'whenever');assert.equal(result.unblocking,'advances');
 assert.ok(result.rationale.some(line=>line.includes('Coordinated review needed')));
});
test('closing a deal does not dismiss its open coordination response',()=>{
 const closed={...input,opportunities:[{...o,status:'Won'}]};const recommendations=incidentRecommendations(closed);
 assert.equal(rankRecommendations({...closed,recommendations}).ranked.length,1);
});
test('review derivation neither mutates sources nor persists allocation across reload',()=>{
 const before=JSON.stringify(input);const recommendations=incidentRecommendations();allocateAttention(recommendations,1,[recommendations[0].id]);
 assert.equal(JSON.stringify(input),before);assert.equal(allocateAttention(recommendations,1,[]).chosen.length,0);
});
