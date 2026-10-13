import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildOutcomeScoreboard } from '../../src/utils/outcomeScoreboard.ts';
import { extractBuyingSignals, extractNextActions } from '../../src/utils/salesActivityClassifier.ts';
import { buildOrderBook } from '../../src/utils/orderToCash.ts';
import { buildReceivables } from '../../src/utils/receivables.ts';
import { withQuoteCollectionEvidence } from '../../src/utils/quoteCollectionEvidence.ts';
import { getQuoteCommercialStage, getNextCommercialProgressAction } from '../../src/utils/commercialFulfillment.ts';
import {buildCoverage} from '../../src/domain/commercialKernel/forecast.ts';
import {canonicalReviewOutcomes} from '../../src/utils/outcomeScoreboard.ts';

const today='2026-10-11';
const opportunity={id:'summit',accountName:'[SIMULATED] Summit',opportunityName:'Order',status:'Won',stage:'Won',estimatedValue:650_000_000,currency:'VND',updatedAt:'2026-10-01T00:00:00Z'};
const quote={id:'q',opportunityId:'summit',accountName:opportunity.accountName,quoteId:'Q1',title:'Order',status:'Accepted',poStatus:'Received',deliveryStatus:'Delivered',paymentStatus:'Paid',quoteDate:'2026-10-01',amount:650_000_000,currency:'VND',paymentTerm:'100% on order',paymentDueDate:'2026-10-01',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
const record={id:'r',opportunityId:'summit',receipts:[],installments:[],deliveredOn:'',invoicedOn:'',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
const input=receipts=>({opportunities:[opportunity],quotes:[quote],milestoneRecords:[],receivableRecords:[{...record,receipts}],today});
const receipt=(id,amount,currency='VND')=>({id,amount,currency,receivedOn:today,note:'',reference:id,createdAt:today+'T00:00:00Z'});
test('R2-01 manual Paid is not proof and payment action never marks a quote paid',()=>{
  assert.equal(getQuoteCommercialStage(quote),'Pending payment');
  assert.equal(getNextCommercialProgressAction(quote).kind,'record-payment');
  assert.equal(withQuoteCollectionEvidence(input([]))[0].paymentReceiptVerified,false);
  assert.equal(getQuoteCommercialStage(withQuoteCollectionEvidence(input([receipt('full',650_000_000)]))[0]),'Paid');
  assert.equal(getQuoteCommercialStage(withQuoteCollectionEvidence(input([receipt('partial',100_000_000)]))[0]),'Pending payment');
});
test('R2-02 committed not collected is remaining cash including partial, duplicate and excess receipts',()=>{
  localStorage.setItem('memoire_reporting_currency','USD');
  for(const receipts of [[],[receipt('partial',100_000_000)],[receipt('partial',100_000_000),receipt('partial',100_000_000)],[receipt('full',700_000_000)]]) {
    const data=input(receipts),book=buildOrderBook(data),collections=buildReceivables({orders:book.orders,records:data.receivableRecords,today});
    assert.equal(book.awaitingBase,collections.totalOutstandingBase);
    assert.equal(book.collectedCount,collections.orders.filter(r=>r.settled).length);
  }
  assert.equal(buildOrderBook(input([receipt('partial',100_000_000)])).awaitingBase,550_000_000/26_000);
});
test('R2-03 Vietnam note keeps negation and separates dates of two promised actions',()=>{
  const note='Hôm nay gọi cho chị Linh tại Apex Labs về Validation Expansion. Khách chưa duyệt ngân sách 300 triệu VND, chưa xác nhận PO và chưa nhận hàng. Tôi sẽ gửi báo giá vào thứ ba tuần sau, gọi lại ngày 20/10/2026.';
  assert(!extractBuyingSignals(note).includes('Purchase order signal'));
  assert.deepEqual(extractNextActions(note,today).map(a=>[a.title,a.dueDate]),[['gửi báo giá','2026-10-13'],['gọi lại','2026-10-20']]);
});
test('R2-04 targets convert their own currency and missing currency suppresses attainment',()=>{
  localStorage.setItem('memoire_reporting_currency','USD');
  const data={period:{kind:'week',label:'Oct 5–11',start:'2026-10-05',end:today},today,outcomes:[{id:'won',opportunityId:'o',outcome:'Won',outcomeDate:'2026-10-07',finalAmount:50_384.61538461538,currency:'USD'}],quotes:[],activities:[],targets:[{period:'Q4',fiscalYear:2026,amount:2_500_000_000,currency:'VND'}]};
  const board=buildOutcomeScoreboard(data);
  assert.equal(board.quarter.target,2_500_000_000/26_000);
  assert(Math.abs(board.quarter.attainment-0.524)<0.000001);
  const missing=buildOutcomeScoreboard({...data,targets:[{period:'Q4',fiscalYear:2026,amount:2_500_000_000}]});
  assert.equal(missing.quarter,null); assert.equal(missing.targetValuesUnavailable,1);
});

test('Money coverage and Review place Won value by the same actual close-out, not the imported quarter split',()=>{
  localStorage.setItem('memoire_reporting_currency','USD');
  const deal={...opportunity,closedOn:'2026-10-07',expectedClosePeriod:'2026-Q3',quarterValues:{Q3:650_000_000}};
  const outcomes=canonicalReviewOutcomes([deal],[]);
  const input={opportunities:[deal],outcomes,threads:[],targets:[{quarter:'Q4',fiscalYear:2026,amount:2_500_000_000,currency:'VND'}],today:new Date('2026-10-11T12:00:00Z')};
  const coverage=buildCoverage(input);
  assert.equal(coverage.quarters.find(row=>row.quarter==='Q3').committed,0);
  assert.equal(coverage.quarters.find(row=>row.quarter==='Q4').committed,650_000_000/26_000);
  const revised=canonicalReviewOutcomes([deal],[{id:'retro',opportunityId:deal.id,outcome:'Won',outcomeDate:'2026-10-08',finalAmount:600_000_000,currency:'VND',updatedAt:'2026-10-10T00:00:00Z'}]);
  assert.equal(buildCoverage({...input,outcomes:revised}).quarters.find(row=>row.quarter==='Q4').committed,600_000_000/26_000);
  assert.equal(buildCoverage({...input,outcomes:canonicalReviewOutcomes([{...deal,closedOn:''}],[])}).excludedUndatedCount,1);
});
