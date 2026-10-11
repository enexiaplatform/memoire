import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {createServer} from 'vite';
import {buildPlanBoard, linkPlanWork, createPersonalPlanRecord, createPlanItemToggleRecord} from '../../src/utils/weeklyPlan.ts';
import {derivePlanCommitments} from '../../src/domain/commercialKernel/derivePlanCommitments.ts';
import {reportMetricContributors} from '../../src/domain/reports/reportEngine.ts';
import {reportQuestions} from '../../src/domain/reports/reportQuestions.ts';
import {runReport} from '../../src/domain/reports/reportEngine.ts';
import {buildReceivables} from '../../src/utils/receivables.ts';
import {summariseOverdueCash} from '../../src/utils/todayPicture.ts';
import {getCommercialCheckpointRisk} from '../../src/utils/commercialFulfillment.ts';
const today='2026-10-09';
const deal={id:'o',accountName:'Apex',opportunityName:'Upgrade',stage:'Proposal',status:'Active',nextAction:'Send quote',nextActionDate:today};
const activity={id:'a',linkedOpportunityId:'o',linkedAccountName:'Apex',accountName:'Apex',nextAction:'Send quotation after call',dueDate:today,createdAt:today+'T10:00:00Z',updatedAt:today+'T10:00:00Z'};
const board=records=>buildPlanBoard({opportunities:[deal],activities:[activity],records,obligations:[],periodType:'week',anchorDate:new Date(today+'T00:00:00'),today});
const items=records=>board(records).days.flatMap(day=>day.items);
test('different wording is kept separate until the operator explicitly links source actions',()=>{
  const [first,second]=items([]);assert.equal(items([]).length,2);
  const linked=linkPlanWork(first,second,[]);assert.equal(items([linked]).length,1);
  assert.equal(items([{...linked,linkedDerivedKeys:[]}]).length,2,'unlinks are reversible');
  assert.equal(activity.nextAction,'Send quotation after call','source text is preserved');
});
test('explicit work links survive completion and do not resurrect a capture promise',()=>{
  const [first,second]=items([]); const linked=linkPlanWork(first,second,[]);
  const done=createPlanItemToggleRecord(items([linked])[0],true,[linked]);
  assert.equal(board([done]).totalCount,1);assert.equal(board([done]).doneCount,1);
  assert.deepEqual(derivePlanCommitments({activities:[activity],planItems:[done]}),[]);
});
test('a manually written primary plan can group a capture without becoming a derived stub',()=>{
  const primary=createPersonalPlanRecord({date:today,label:'Prepare the quote',tag:'Apex',linkedAccountName:'Apex'});
  const before=items([primary]);const linked=linkPlanWork(before.find(row=>row.kind==='personal'),before.find(row=>row.kind==='capture'),[primary]);
  assert.equal(linked.derivedKey,undefined);assert.equal(items([linked]).length,2);
  assert.equal(items([linked]).filter(row=>row.kind==='capture').length,0);
  assert.equal(derivePlanCommitments({activities:[activity],planItems:[linked]}).length,1);
});
test('the promise ledger reads one explicit group even when two captured actions were linked to a deal',()=>{
  const another={...activity,id:'b',nextAction:'Email the final quotation'};
  const input={opportunities:[deal],activities:[activity,another],records:[],obligations:[],periodType:'week',anchorDate:new Date(today+'T00:00:00'),today};
  const all=buildPlanBoard(input).days.flatMap(day=>day.items), primary=all.find(row=>row.kind==='deal'), captures=all.filter(row=>row.kind==='capture');
  const first=linkPlanWork(primary,captures[0],[]);const both=linkPlanWork(primary,captures[1],[first]);
  const reading=derivePlanCommitments({activities:[activity,another],planItems:[both]});
  assert.equal(reading.length,1);assert.equal(reading[0].commitmentText,deal.nextAction);assert.equal(reading[0].opportunityId,'o');
});
test('explicit grouping rejects unrelated customers and conflicting primary groups',()=>{
  const [first,second]=items([]);assert.throws(()=>linkPlanWork(first,{...second,tag:'Other customer'},[]));
  const linked=linkPlanWork(first,second,[]);assert.throws(()=>linkPlanWork(second,first,[linked]));
});
const rows=['Active','Won','Lost'].map((status,index)=>({id:String(index),fact:{qualified:true,status,reportingValue:100},values:{reportingValue:100}}));
test('dashboard drilldown distinguishes pipeline, won and win-rate contributors',()=>{
  assert.deepEqual(reportMetricContributors('pipeline',rows).map(row=>row.id),['0']);
  assert.deepEqual(reportMetricContributors('won',rows).map(row=>row.id),['1']);
  assert.deepEqual(reportMetricContributors('winRate',rows).map(row=>row.id),['1','2']);
  assert.equal(reportMetricContributors('recordCount',rows).length,3);
});
test('every business-question preset is a valid report that can execute an empty workspace',()=>{
  for(const question of reportQuestions){const definition=question.definition();const run=runReport({definition,sources:{opportunities:[],collections:[]},scopeKey:'local:false',runAt:today,timezone:'Asia/Saigon',today,money:{currency:'VND',ratesToVnd:{VND:1},ratesAsOf:today},sourceStatus:'test'});assert.equal(run.rows.length,0);}
});
test('planned late dates cannot inflate Today confirmed overdue or cause PO-pending payment accusations',()=>{
  const order={opportunityId:'o',orderDate:'2026-08-01',amount:100,amountBase:100,currency:'VND',paymentTerm:'Net 30',milestones:[]};
  const receivables=buildReceivables({orders:[order],records:[],today});const picture=summariseOverdueCash(receivables);
  assert.equal(picture.overdueBase,0);assert.equal(picture.overdueOrderCount,0);assert.equal(picture.segments[0].base,100);
  assert.equal(getCommercialCheckpointRisk({status:'Accepted',poStatus:'Pending',deliveryStatus:'Not scheduled',paymentStatus:'Due',paymentDueDate:'2026-08-01',expectedDeliveryDate:'2026-08-01'},today),'PO follow-up');
});
let server;after(async()=>{await server?.close();});
test('the actual demo has catalog assignments, canonical paid quotes, receipts, targets and guest initiatives',async()=>{
  server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  const {buildSampleDataset}=await server.ssrLoadModule('/src/utils/sampleData.ts');
  const sample=buildSampleDataset();const ids=new Set(sample.opportunities.map(row=>row.id));
  const qualified=sample.opportunities.filter(row=>row.stage!=='Lead');
  const assignments=sample.portfolioRecords.filter(row=>row.kind==='assignment');
  assert.ok(qualified.every(row=>assignments.some(assignment=>assignment.opportunityId===row.id&&assignment.brandId)));
  assert.ok(sample.quotes.every(quote=>quote.opportunityId&&ids.has(quote.opportunityId)));
  assert.ok(sample.quotes.filter(quote=>quote.paymentStatus==='Paid').every(quote=>sample.receivableRecords.some(record=>record.opportunityId===quote.opportunityId&&record.receipts.length)));
  assert.equal(sample.targets.length,4);assert.ok(sample.targets.every(row=>row.isSample));
  assert.ok(sample.operatingContexts.every(row=>row.userId==='guest'));
  assert.equal(sample.receivableRecords.flatMap(row=>row.receipts).reduce((sum,row)=>sum+row.amount,0),660000000);
});

test('workspace kernel reads include demo promises only in demo mode and preserve separate real guest promises',async()=>{
  const previousWindow=globalThis.window,previousEvent=globalThis.CustomEvent;
  globalThis.window={localStorage,dispatchEvent:()=>true,addEventListener:()=>{},removeEventListener:()=>{}};
  globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options?.detail;}};
  try {
    const {createCommitment}=await server.ssrLoadModule('/src/domain/commercialKernel/commands.ts');
    const {loadSalesWorkspaceData}=await server.ssrLoadModule('/src/services/workspaceData.ts');
    const draft={accountName:'Apex',commitmentParty:'self',commitmentText:'Recorded promise',dueDate:'2026-10-13'};
    const sample=createCommitment({userId:null,sampleDataActive:true},draft);
    const real=createCommitment({userId:null,sampleDataActive:false},{...draft,commitmentText:'Real guest promise'});
    assert.equal(sample.ok,true);assert.equal(real.ok,true);
    localStorage.setItem('memoire.sampleData.loaded','true');
    assert.deepEqual((await loadSalesWorkspaceData(null,{force:true})).commitments.map(row=>row.id),[sample.value.id]);
    localStorage.removeItem('memoire.sampleData.loaded');
    assert.deepEqual((await loadSalesWorkspaceData(null,{force:true})).commitments.map(row=>row.id),[real.value.id]);
  } finally {
    globalThis.window=previousWindow;globalThis.CustomEvent=previousEvent;
    localStorage.removeItem('memoire.sampleData.loaded');
  }
});
