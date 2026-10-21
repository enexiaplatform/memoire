import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareAutomationWork, PREPARATION_SOURCES } from '../../.memoire-server/commercial.mjs';
import { AUTOMATION_DEFAULTS, parseAutomationSettings, proposeAutomationSettings } from '../../shared/automation.js';
import { reportTemplate } from '../../src/domain/reports/reportDefinition.ts';
import { changeSavedReport } from '../../src/domain/reports/reportRecord.ts';
import { changeSavedDashboard } from '../../src/domain/dashboards/dashboardRecord.ts';
import { newDashboard } from '../../src/domain/dashboards/dashboardDefinition.ts';
import { explicitMoneyContext, browserMoneyContext } from '../../src/utils/moneyContext.ts';
import { buildOrderBook } from '../../src/utils/orderToCash.ts';
import { buildReceivables } from '../../src/utils/receivables.ts';
import { buildReportSources } from '../../src/domain/reports/reportSources.ts';
import { buildPortfolioFacts } from '../../src/domain/portfolio/portfolioAnalytics.ts';
const today = '2026-10-21', at = '2026-10-21T08:30:00Z';
const row = (id, payload) => ({ id, payload });
function snapshot() {
  return Object.fromEntries(['opportunities','quotes','commitments','plans','activities','expenses',...Object.keys(PREPARATION_SOURCES)].map(key => [key, []]));
}
function opportunity(id, extra = {}) { return {id,account_name:'Fictional buyer',opportunity_name:`Deal ${id}`,stage:'Proposal',status:'Active',
  estimated_value:100,currency:'USD',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',...extra}; }
function fixture() {
  const s = snapshot();s.profiles=[{id:'fixture-owner',reporting_currency:'VND'}];
  s.opportunities = [opportunity('order', {stage:'Won',status:'Won'})];
  s.quotes = [row('accepted', {opportunityId:'order',quoteId:'Q-100',quoteDate:'2026-10-01',status:'Accepted',poStatus:'Received',amount:100,currency:'USD',
    paymentTerm:'30% deposit, 70% on delivery',deliveryStatus:'Not scheduled',paymentStatus:'Not due'})];
  s.receivables = [row('receivable', {opportunityId:'order',installments:[{id:'deposit',label:'Deposit',percent:30,amount:null,trigger:'order',offsetDays:0},
    {id:'balance',label:'Balance',percent:70,amount:null,trigger:'delivery',offsetDays:0}],receipts:[],deliveredOn:'2026-10-30',invoicedOn:''})];
  return s;
}
function prepare(s, patch) { return prepareAutomationWork(s,{...AUTOMATION_DEFAULTS,...patch},today,()=>false,at); }
test('legacy settings preserve permissions; natural-language proposals never enable the account', () => {
  const legacy = Object.fromEntries(Object.entries(AUTOMATION_DEFAULTS).slice(0,9));
  const normalized = parseAutomationSettings(legacy);
  assert.equal(normalized.enabled,false); assert.equal(normalized.collectionReminder,false);
  assert.throws(()=>parseAutomationSettings({...legacy,owner:'foreign'}));
  const draft = proposeAutomationSettings('Nhắc công nợ, nhà cung cấp và review hàng tuần trong ngày',normalized);
  assert.equal(draft.config.collectionReminder,true); assert.equal(draft.config.supplierReminder,true);
  assert.equal(draft.config.weeklyReview,true); assert.equal(draft.config.continuous,true); assert.equal(draft.config.enabled,false);
  assert.equal(proposeAutomationSettings('hello',normalized),null);
});
test('collection work follows unpaid installments, receipt corrections and stable source identities', () => {
  const s=fixture(); const first=prepare(s,{collectionReminder:true});
  assert.equal(first.candidates.length,1); assert.equal(first.candidates[0].key,'collection-reminder:order:deposit:2026-10-01');
  assert.match(first.candidates[0].reason,/780000 VND/); assert.match(first.candidates[0].reason,/confirmed date/);
  const task=first.candidates[0]; s.plans=[row('saved',{createdAt:at,updatedAt:at,automation:{...task},done:false})];
  s.receivables[0].payload.receipts=[{id:'receipt',amount:30,currency:'USD',receivedOn:'2026-10-01',method:'Transfer',note:''}];
  const paid=prepare(s,{collectionReminder:true}); assert.equal(paid.candidates.length,0); assert.deepEqual(paid.retireIds,['saved']);
  s.receivables[0].payload.receipts=[];
  s.plans[0].payload.updatedAt='2026-10-21T09:00:00Z';
  assert.equal(prepare(s,{collectionReminder:true}).candidates.length,0);
});
test('missing money is visible in quality preparation and never invented as settled collection work', () => {
  const s=fixture(); s.quotes[0].payload.currency='ZZZ'; s.opportunities[0].currency='ZZZ';
  const work=prepare(s,{collectionReminder:true,preparedOutputs:true}); assert.equal(work.candidates.length,0);
  assert.equal(work.outputs.find(row=>row.kind==='data-quality').payload.missingValues.length,1);
  assert.equal(work.outputs.find(row=>row.kind==='margin-review').payload.missingOrderValueIds.length,1);
  assert.equal(work.warnings.missingMoneyCount,1);
  s.plans=[row('keep-unknown',{createdAt:at,updatedAt:at,automation:{rule:'collection-reminder',sourceId:'order',key:'old-confirmed-debt'},done:false})];
  const withoutOutputs=prepare(s,{collectionReminder:true});
  assert.equal(withoutOutputs.warnings.missingMoneyCount,1);assert.deepEqual(withoutOutputs.retireIds,[]);
});
test('supplier, lead nurture, first touch and active-deal work respect their actual sources', () => {
  const s=snapshot();
  s.opportunities=[opportunity('nurture',{stage:'Lead',nurtured_until:'2026-10-23',nurture_reason:'Budget window'}),
    opportunity('untouched',{stage:'Lead'}),opportunity('closed',{stage:'Lead',status:'Lost'}),opportunity('active'),
    opportunity('scheduled',{next_action:'Call buyer',next_action_date:'2026-10-22'}),opportunity('touched',{stage:'Lead'})];
  s.activities=[{id:'touch',linked_opportunity_id:'touched',activity_date:today,raw_note:'Actual conversation',tags:[]}];
  s.supplierCommitments=[row('supplier',{status:'open',party:'supplier',kind:'Document',brand:'Principal',label:'Send certificate',dueDate:'2026-10-22'}),
    row('done',{status:'done',label:'Done',dueDate:today}),row('sample',{status:'open',source:'demo',label:'Sample',dueDate:today})];
  const work=prepare(s,{supplierReminder:true,leadFollowup:true,opportunityReminder:true,maxPlanItems:10});
  assert.deepEqual(new Set(work.candidates.map(row=>row.sourceId)),new Set(['nurture','untouched','supplier','active']));
  assert.equal(work.candidates.find(row=>row.sourceId==='supplier').opportunityId,'');
  const tomorrow=prepareAutomationWork(s,{...AUTOMATION_DEFAULTS,leadFollowup:true},'2026-10-22');
  assert.equal(tomorrow.candidates.find(row=>row.sourceId==='untouched').key,work.candidates.find(row=>row.sourceId==='untouched').key);
});
test('all prepared groups have source-backed outputs, saved definitions and an honest weekly boundary', () => {
  const s=fixture();
  s.plans=[row('late',{label:'Review source',date:'2026-10-20',done:false,createdAt:at,updatedAt:at})];
  s.captures=[{id:'pending',status:'pending',raw_text:'Original input awaiting review'}];
  s.accounts=[{id:'account',account_name:'Fictional buyer'}]; s.opportunities[0].account_id='account';
  s.objections=[{id:'open',status:'Open',objection_text:'Need certificate'},{id:'resolved',status:'Resolved'}];
  s.importRows=[{id:1,action:'error',target_table:'opportunities',error_code:'missing_identity'}];
  const report=changeSavedReport([],{id:'report',state:{archived:false,definition:reportTemplate('collections')},expectedVersion:0,sample:false,at})[0];
  const dashboard=changeSavedDashboard([],{id:'board',state:{archived:false,definition:{...newDashboard(),widgets:[{id:'cash',title:'Cash',reportId:'report',type:'metric',metric:'outstanding'}]}},expectedVersion:0,sample:false,at})[0];
  s.reports=[row(report.id,report)]; s.dashboards=[row(dashboard.id,dashboard)];
  const result=prepare(s,{weeklyReview:true,preparedOutputs:true,savedReports:true,savedDashboards:true});
  assert.equal(result.outputs.length,11); assert.ok(result.outputs.every(row=>row.payload.status==='ready'));
  const get=kind=>result.outputs.find(row=>row.kind===kind);
  assert.equal(get('weekly-review').period,'2026-10-19'); assert.equal(get('capture-review').payload.pendingIntake.count,1);
  assert.equal(get('plan-review').payload.count,1); assert.equal(get('account-briefs').payload.briefs[0].missing.length,1);
  assert.equal(get('knowledge-review').payload.count,1); assert.equal(get('data-quality').payload.importExceptions.count,1);
  assert.equal(get('cloud-health').payload.backupVerified,false);
  assert.equal(get('saved-report').payload.definitionVersion,1); assert.equal(get('saved-report').payload.result.runAt,at);
  assert.equal(get('saved-report').payload.result.totals.outstanding.value,2600000);
  assert.equal(get('saved-dashboard').payload.result.results[0].run.totals.outstanding.value,2600000);
  s.reports[0].payload.archived=true;
  const changed=prepare(s,{savedDashboards:true}).outputs[0]; assert.match(changed.payload.result.results[0].error,/archived/);
});
test('preparation fails closed on incomplete, duplicate or oversized sources', () => {
  const s=fixture(); delete s.supplierCommitments;
  assert.throws(()=>prepare(s,{supplierReminder:true}),/snapshot_incomplete/);
  s.supplierCommitments=[];s.receivables.push({...s.receivables[0],id:'duplicate'});
  assert.throws(()=>prepare(s,{collectionReminder:true}),/Duplicate/);
  assert.equal(prepare(s,{preparedOutputs:true}).outputs.find(row=>row.kind==='margin-review').payload.status,'unavailable');
});
test('explicit money contexts run concurrently without browser or cross-owner currency leakage', async () => {
  const opportunity={id:'o',accountName:'A',opportunityName:'Order',stage:'Won',status:'Won',estimatedValue:100,currency:'USD',pipelineProbability:100,nextAction:'',nextActionDate:''};
  const calculate=async(currency,USD)=>{const basis={currency,ratesToVnd:{VND:1,USD,SGD:20000},ratesAsOf:'2026-10-21'};
    const money=explicitMoneyContext(basis),orders=buildOrderBook({opportunities:[opportunity],quotes:[],milestoneRecords:[],today,money}).orders;
    const cash=buildReceivables({orders,records:[],today,money});
    const facts=buildPortfolioFacts({opportunities:[opportunity],outcomes:[],records:[],money:basis,sample:false});
    const sources=buildReportSources({facts,opportunities:[opportunity],quotes:[],outcomes:[],milestones:[],costs:[],receivables:[],sample:false,today,money:basis});
    return [cash.reportingCurrency,cash.totalOutstandingBase,sources.collections[0].values.outstanding];};
  assert.deepEqual(await Promise.all([calculate('SGD',26000),calculate('VND',25000)]),[['SGD',130,130],['VND',2500000,2500000]]);
});

test('specific installments survive a generic deal action and manual edits affect only their own obligation', () => {
  const s=fixture();s.opportunities[0]={...s.opportunities[0],stage:'Negotiation',status:'Active',pipeline_probability:95,next_action:'General buyer call',next_action_date:today};
  s.receivables[0].payload.deliveredOn='2026-10-20';
  const first=prepare(s,{collectionReminder:true});assert.equal(first.candidates.length,2);
  const task=first.candidates[0];
  s.plans=[row('edited',{label:'My edited deposit work',automation:{...task},createdAt:'2026-10-01T00:00:00Z',updatedAt:at}),
    row('derived',{derivedKey:`deal:order:${today}`,done:false})];
  const next=prepare(s,{collectionReminder:true});assert.equal(next.candidates.length,1);
  assert.notEqual(next.candidates[0].subjectKey,task.subjectKey);
  s.receivables[0].payload.installments[0].offsetDays=1;
  const moved=prepare(s,{collectionReminder:true});assert.equal(moved.candidates.length,1);
  assert.ok(!moved.retireIds.includes('edited'));
});

test('saved report/dashboard and Plan output links use the actual destination selection contract', () => {
  const s=snapshot();s.plans=[row('plan-id-is-not-a-date',{date:today,label:'Task'})];
  s.reports=[row('r',changeSavedReport([],{id:'r',state:{archived:false,definition:reportTemplate('portfolio')},expectedVersion:0,sample:false,at})[0])];
  s.dashboards=[row('d',changeSavedDashboard([],{id:'d',state:{archived:false,definition:newDashboard()},expectedVersion:0,sample:false,at})[0])];
  const work=prepare(s,{weeklyReview:true,savedReports:true,savedDashboards:true});
  assert.equal(work.outputs.find(row=>row.kind==='saved-report').href,'/app/reports?report=r');
  assert.equal(work.outputs.find(row=>row.kind==='saved-dashboard').href,'/app/dashboards?dashboard=d');
  assert.equal(work.outputs.find(row=>row.kind==='weekly-review').payload.openPlan.items[0].href,`/app/timeline?date=${today}`);
});

test('a profile without a money preference uses the same reporting default as the application', () => {
  const work=prepare(snapshot(),{preparedOutputs:true});
  assert.equal(work.outputs[0].payload.money.currency,browserMoneyContext().currency);
  assert.equal(work.outputs[0].payload.money.currency,'USD');
});
