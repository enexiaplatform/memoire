import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {emptyOpportunityInput} from '../../src/services/opportunityStore.ts';
import {buildCoverageMatrix} from '../../src/utils/coverageMatrix.ts';
import {buildKnowledgeGraph} from '../../src/utils/knowledgeGraph.ts';
import {knowledgeQuestionRegistry,answerKnowledgeQuestion} from '../../src/utils/knowledgeQuestions.ts';
import {buildOutcomeScoreboard,canonicalReviewOutcomes} from '../../src/utils/outcomeScoreboard.ts';
import {extractBuyingSignals,extractNextActions} from '../../src/utils/salesActivityClassifier.ts';
import {buildOrderBook} from '../../src/utils/orderToCash.ts';
import {answerFromMoneyFlow,answerFromAwaitingCustomer} from '../../src/features/v31/askMemoireInsightAnswers.ts';
import {buildProfitAndLoss} from '../../src/utils/pnl.ts';
import {buildCashPosition} from '../../src/utils/cashPosition.ts';
import {withQuoteCollectionEvidence} from '../../src/utils/quoteCollectionEvidence.ts';
const stamp='2026-10-11T00:00:00Z';
const deal=(id,patch={})=>({...emptyOpportunityInput,id,accountName:'[SIMULATED] A',opportunityName:'Project '+id,stage:'Proposal',status:'Active',estimatedValue:100,currency:'USD',createdAt:stamp,updatedAt:stamp,storageMode:'local',...patch});
const account={id:'a',accountName:'[SIMULATED] A',industry:'',segment:'',location:'',notes:'',tags:[],keyStakeholders:[],createdAt:stamp,updatedAt:stamp,storageMode:'local'};
const node=(id,name)=>({id,kind:'brand',name,status:'active',parentId:null,brandId:null,groupId:null,aliases:[],code:'',description:'',version:1,schemaVersion:1,history:[],createdAt:stamp,updatedAt:stamp});
test('R2-05 the catalog includes unused Brands and Accounts; Leads are not buyer evidence',()=>{
 const matrix=buildCoverageMatrix({accounts:[account,{...account,id:'b',accountName:'[SIMULATED] No deals'}],portfolioRecords:[node('b1','Alpha'),node('b2','Unused')],opportunities:[deal('lead',{stage:'Lead',brand:'Alpha'})]});
 assert.equal(matrix.rows.length,2);assert.equal(matrix.brands.length,2);assert.equal(matrix.totalCells,4);
 assert.equal(matrix.rows.find(r=>r.accountName===account.accountName).cells.find(c=>c.brand==='Alpha').state,'lead');
 assert.equal(matrix.gaps.length,0);assert.equal(matrix.filledCells,1);
});
test('R2-06 shared Review population deduplicates outcomes and excludes undated closes from period',()=>{
 localStorage.setItem('memoire_reporting_currency','USD');
 const old={id:'old',opportunityId:'x',outcome:'Won',outcomeDate:'2026-10-06',finalAmount:10,currency:'USD',updatedAt:'2026-10-07T00:00:00Z'};
 const latest={...old,id:'latest',finalAmount:20,updatedAt:stamp};
 const canonical=canonicalReviewOutcomes([deal('x',{status:'Won'}),deal('undated',{status:'Won',expectedClosePeriod:'2026-10-08'})],[old,latest]);
 const board=buildOutcomeScoreboard({outcomes:canonical,period:{kind:'week',label:'week',start:'2026-10-05',end:'2026-10-11'},today:'2026-10-11',quotes:[],activities:[],targets:[]});
 assert.equal(canonical.length,2);assert.equal(board.won.count,1);assert.equal(board.won.valueBase,20);assert.equal(board.undatedClosedCount,1);
});
test('R2-14 every Vault-generated question has a handler with the same known or missing evidence',()=>{
 const data={accounts:[account],opportunities:[deal('x',{brand:'Alpha',productOrSolution:'Sterility'}),deal('won',{status:'Won'})],stakeholders:[],activities:[],objections:[],quotes:[],outcomes:[],knowledge:[],today:'2026-10-11'};
 const registry=knowledgeQuestionRegistry(buildKnowledgeGraph(data));assert(registry.length>10);
 for(const entry of registry){const answer=answerKnowledgeQuestion(entry.question,data);assert(answer,entry.question);assert(answer.contextUsed.includes(entry.node.label));assert.equal(answer.missingContext.length,entry.dimension.known||entry.dimension.dismissed?0:1);}
 assert.equal(answerKnowledgeQuestion('Invent a buyer and a purchase order',data),null);
});
test('R2-03 no negated or hypothetical approvals; a negated Vietnamese promise cannot leak a second task',()=>{
 for(const note of ['Budget approved is not confirmed.','They have not approved the budget.','No purchase order received.','If payment arrives, delivery may start.','Khách chưa xác nhận PO.']) assert.equal(extractBuyingSignals(note).length,0,note);
 assert.deepEqual(extractNextActions('Tôi chưa cần gửi báo giá, gọi lại ngày 20/10/2026.','2026-10-11'),[]);
 assert(extractBuyingSignals('No PO yet, but budget approved.').includes('Budget approved'));
});
test('R2-02 missing amount or FX remains unknown in both money answers',()=>{
 const book=buildOrderBook({opportunities:[deal('unknown',{status:'Won',currency:'SEK'})],quotes:[],milestoneRecords:[],receivableRecords:[],today:'2026-10-11'});
 assert.equal(book.awaitingMissingValueCount,1);
 const flow={threads:[],lanes:[],stuckThreads:[],totalInMotionBase:0};
 for(const answer of [answerFromMoneyFlow(flow,book),answerFromAwaitingCustomer(book,flow)]) {assert(answer.missingContext.length>0);assert.match(answer.answer,/exchange rate/);assert.doesNotMatch(answer.answer,/Nothing is sitting|No commercial threads/);}
});
test('R2-01 cash and period profit read receipt dates, including partial collection, rather than legacy quote claims',()=>{
 localStorage.setItem('memoire_reporting_currency','USD');
 const opportunity=deal('paid',{status:'Won',estimatedValue:650_000_000,currency:'VND'});
 const quote={id:'q',quoteId:'Q1',opportunityId:'paid',status:'Accepted',poStatus:'Received',deliveryStatus:'Delivered',paymentStatus:'Paid',quoteDate:'2026-01-01',paymentDueDate:'2026-01-01',amount:650_000_000,currency:'VND',paymentTerm:'100% on order'};
 const receipt={id:'cash',amount:100_000_000,currency:'VND',receivedOn:'2026-10-11',method:'[SIMULATED] transfer',note:''};
 const record={id:'r',opportunityId:'paid',receipts:[receipt,receipt],installments:[],deliveredOn:'',invoicedOn:'',createdAt:stamp,updatedAt:stamp};
 const data={opportunities:[opportunity],quotes:[quote],receivableRecords:[record],expenses:[],period:'mtd',today:'2026-10-11'};
 assert.equal(buildProfitAndLoss(data).revenueBase,100_000_000/26_000);
 assert.equal(buildCashPosition(data).collectedRevenueBase,buildProfitAndLoss(data).revenueBase);
 assert.equal(buildProfitAndLoss({...data,today:'2026-09-30'}).revenueBase,0);
 assert.equal(buildProfitAndLoss({...data,receivableRecords:[]}).revenueBase,0);
 assert.equal(buildCashPosition({quotes:[quote],expenses:[],today:data.today}).collectedRevenueBase,0);
 assert.equal(withQuoteCollectionEvidence({...data,quotes:[quote,{...quote,id:'revision',quoteId:'Q2',status:'Revised'}]})[1].paymentReceiptVerified,false);
});
