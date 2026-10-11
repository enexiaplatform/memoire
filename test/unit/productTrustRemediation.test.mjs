import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { analyzeMeddicLiteOpportunity } from '../../src/utils/meddicLite.ts';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildRoleCoverageMatrix } from '../../src/utils/stakeholderRoleCoverage.ts';
import { buildOpportunitySalesFlowGuidance } from '../../src/utils/salesFlowGuidance.ts';
import { classifySalesActivity } from '../../src/utils/salesActivityClassifier.ts';
import { interpretAskQuestion } from '../../src/features/v31/askLanguage.ts';
import { detectInsightQuestion, resolveDealForQuestion } from '../../src/features/v31/askMemoireInsightAnswers.ts';
import { buildOneReceivable } from '../../src/utils/receivables.ts';
import { notificationPreferenceMatches } from '../../src/utils/notificationPreferenceReceipt.ts';
import { getStakeholdersForOpportunity } from '../../src/utils/stakeholderGraph.ts';
import { buildLeadQueue } from '../../src/utils/leadQueue.ts';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/lib/supabaseClient.ts')) return { format:'module', shortCircuit:true, source:'export const supabaseClient=null; export const isPipelineSupabaseConfigured=false;' };
    return next(url, context);
  },
});
const { buildRevenueView } = await import('../../src/utils/revenueView.ts');
const { savePortfolio } = await import('../../src/services/portfolioStore.ts');
const { toggleOrderMilestone } = await import('../../src/services/orderMilestoneStore.ts');
const { recordPaymentReceipt } = await import('../../src/services/orderReceivableStore.ts');
const { savePlanItem } = await import('../../src/services/planItemStore.ts');
const { setCachedWorkspaceValue, getCachedWorkspaceValue } = await import('../../src/services/workspaceDataCache.ts');

const opportunity = (patch = {}) => ({ id:'o1', accountName:'Apex Labs', opportunityName:'Validation Expansion', stage:'Proposal',status:'Active',estimatedValue:12000,currency:'USD',expectedClosePeriod:'Q4 2026',productOrSolution:'Compliance solution', evidence:'',nextAction:'Call', nextActionDate:'2026-10-12',decisionMaker:'Buyer',budgetOwner:'Owner',procurementPath:'Direct', technicalCriteria:'Validation criteria', objectionDebt:'',decisionRecommendation:'Monitor',forecastEvidenceCategory:'Hope-based', ...patch });
const metrics = patch => analyzeMeddicLiteOpportunity({ opportunity: opportunity(patch) }).fields.find(row=>row.key==='metrics');
test('deal value and generic product text cannot establish customer Metrics',()=>assert.equal(metrics({}).status,'Missing'));
test('customer-confirmed quantified impact can establish Metrics',()=>assert.equal(metrics({evidence:'Customer confirmed reduction in downtime from 8 to 2 hours per batch.'}).status,'Strong'));
test('quantified impact without confirmation remains partial',()=>assert.equal(metrics({evidence:'Reduce downtime by 20%.'}).status,'Partial'));
test('negated confirmation does not establish Metrics',()=>assert.notEqual(metrics({evidence:'Customer has not confirmed a reduction of 20%.'}).status,'Strong'));
test('a confirmed quote amount next to an ROI mention is not a quantified business metric',()=>assert.notEqual(metrics({evidence:'ROI discussed; customer confirmed the quote at 12000 USD.'}).status,'Strong'));
test('a Lead never contributes qualified revenue risk or pipeline value',()=>{
  const view=buildRevenueView({opportunities:[opportunity({stage:'Lead',nextAction:''})],quotes:[]});
  assert.equal(view.activePipeline,0); assert.deepEqual(view.actionItems,[]);
});
test('role coverage counts qualified deals separately from leads',()=>{
  const matrix=buildRoleCoverageMatrix({stakeholders:[],opportunities:[opportunity(),opportunity({id:'lead',stage:'Lead'})]});
  assert.equal(matrix.rows[0].openDealCount,1);
});

test('an explicit stakeholder link cannot fall back to another record with the same account or name',()=>{
  const rows=[{id:'person',name:'Buyer',accountName:'Apex Labs',opportunityName:'Validation Expansion',opportunityId:'other'}];
  assert.deepEqual(getStakeholdersForOpportunity(rows,opportunity()),[]);
});

test('a new Lead cannot borrow qualification from a sibling opportunity',()=>{
  const queue=buildLeadQueue({opportunities:[opportunity({stage:'Lead',evidence:'',technicalCriteria:'',decisionMaker:'',nextAction:''})],
    stakeholders:[{id:'person',name:'Sibling Buyer',accountName:'Apex Labs',opportunityId:'other',opportunityName:'Sibling'}],
    objections:[{id:'objection',accountName:'Apex Labs',opportunityId:'other',opportunityName:'Sibling',status:'Open'}],today:'2026-10-09'});
  assert.equal(queue.rows[0].contactName,'');
  assert.equal(queue.rows[0].qualification.evidence.find(row=>row.dimension==='need').present,false);
  assert.equal(queue.rows[0].qualification.evidence.find(row=>row.dimension==='contact').present,false);
});
test('complete process fields cannot override buying-evidence blockers',()=>{
  const flow=buildOpportunitySalesFlowGuidance(opportunity(),{blockers:[{label:'Champion'}],stageGap:2,evidenceStage:'Qualification'});
  assert.equal(flow.status,'Needs action'); assert.match(flow.suggestedAction,/Champion/);
});
test('Vietnamese phone note retains entities, promise and day/month deadline',()=>{
  const note=classifySalesActivity('Đã gọi Dr. Avery tại Apex Labs về Validation Expansion. Tôi sẽ gửi báo giá Tailin 12000 USD vào ngày 12/10/2026.','2026-10-09');
  assert.equal(note.activityType,'Customer meeting'); assert.equal(note.activityChannel,'Phone call');
  assert.match(note.nextAction,/gửi báo giá Tailin 12000 USD/); assert.equal(note.dueDate,'2026-10-12');
});
test('Vietnamese deadline is scoped to the promise, not the past touch',()=>{
  const note=classifySalesActivity('Đã gọi hôm nay. Tôi cần gửi báo giá ngày mai.','2026-10-09');
  assert.equal(note.dueDate,'2026-10-10');
});
test('negated Vietnamese work does not create a promise',()=>{
  assert.equal(classifySalesActivity('Tôi không cần gửi báo giá.','2026-10-09').nextActions.length,0);
});
test('Vietnamese Ask interprets supported intent without losing named entity',()=>{
  const question=interpretAskQuestion('Tình trạng Apex Labs đang thế nào?');
  assert.match(question,/Apex Labs/);assert.equal(detectInsightQuestion(question),'deal_position');
});
test('Ask never arbitrarily chooses among multiple deals at one account',()=>{
  assert.equal(resolveDealForQuestion('Where do we stand at Apex Labs?',[opportunity(),opportunity({id:'o2',opportunityName:'Renewal'})]),null);
  assert.equal(resolveDealForQuestion('Where do we stand on Validation Expansion?',[opportunity(),opportunity({id:'o2',opportunityName:'Renewal'})]).id,'o1');
});
const order = {opportunityId:'o1',accountName:'Apex Labs',orderName:'Test order',orderRef:'Q1',orderDate:'2026-08-01',amount:12000,amountBase:12000,currency:'USD',paymentTerm:'Net 30',milestones:[{key:'contract',done:false}]};
test('an invoice-trigger schedule without actual invoice date is planning only',()=>{
  const row=buildOneReceivable(order,undefined,'2026-10-09');
  assert.equal(row.confirmedOverdueBase,0);assert.equal(row.plannedOverdueBase,12000);
});
test('recorded invoice date and stated terms establish confirmed overdue',()=>{
  const row=buildOneReceivable(order,{invoicedOn:'2026-08-10',installments:[],receipts:[]},'2026-10-09');
  assert.equal(row.confirmedOverdueBase,12000);assert.equal(row.plannedOverdueBase,0);
});

test('catalog, receipts, milestones and local plans evict the actual warmed workspace cache keys',async()=>{
  const previous=globalThis.window;globalThis.window={localStorage,dispatchEvent:()=>true};
  try {
    const keys=['portfolioRecords','receivableRecords','milestoneRecords','planItems'];
    keys.forEach(key=>setCachedWorkspaceValue(`ws:guest:${key}`,['old']));
    await savePortfolio({userId:null,sampleDataActive:false},{id:'test-brand',expectedVersion:0,state:{kind:'brand',name:'Test Brand',code:'',description:'',status:'active',parentId:null,brandId:null,groupId:null,aliases:[]}});
    toggleOrderMilestone({opportunityId:'test-order',milestone:'contract',done:true});
    recordPaymentReceipt({opportunityId:'test-order',receipt:{id:'test-receipt',amount:100,currency:'USD',receivedOn:'2026-10-01',method:'Bank transfer',note:''}});
    savePlanItem({id:'test-plan',date:'2026-10-09',label:'Prepare quotation',tag:'',done:false,createdAt:'2026-10-09T10:00:00Z',updatedAt:'2026-10-09T10:00:00Z'},{syncCloud:false});
    keys.forEach(key=>assert.equal(getCachedWorkspaceValue(`ws:guest:${key}`),null,key));
  } finally {globalThis.window=previous;}
});

test('a refused local plan or milestone write cannot return a saved-looking result',()=>{
  const previous=globalThis.window;globalThis.window={localStorage:{getItem:()=>null,setItem:()=>{throw new DOMException('Full','QuotaExceededError');}},dispatchEvent:()=>true};
  try {
    assert.throws(()=>savePlanItem({id:'p',date:'2026-10-09',label:'Do work',tag:'',done:false,createdAt:'2026-10-09',updatedAt:'2026-10-09'}),/save|storage/i);
    assert.throws(()=>toggleOrderMilestone({opportunityId:'o',milestone:'contract',done:true}),/save|storage|full|space/i);
  } finally {globalThis.window=previous;}
});
test('notification save confirmation rejects zero rows, wrong owner and unchanged preference fields',()=>{
  const expected={userId:'owner',daily:true,weekly:false,hour:7,offsetMinutes:420};
  assert.equal(notificationPreferenceMatches(null,expected),false);
  const saved={id:'owner',daily_digest_enabled:true,weekly_review_enabled:false,digest_send_hour:7,digest_utc_offset_minutes:420};
  assert.equal(notificationPreferenceMatches(saved,expected),true);
  assert.equal(notificationPreferenceMatches({...saved,id:'other'},expected),false);
  assert.equal(notificationPreferenceMatches({...saved,daily_digest_enabled:false},expected),false);
  assert.equal(notificationPreferenceMatches({...saved,digest_utc_offset_minutes:0},expected),false);
});
