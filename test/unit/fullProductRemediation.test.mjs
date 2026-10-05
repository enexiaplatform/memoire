import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildCashPosition } from '../../src/utils/cashPosition.ts';
import { buildMoneyFlow } from '../../src/utils/moneyFlow.ts';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOrderReceivableRecord, createPaymentReceipt } from '../../src/utils/receivables.ts';
import { createOrderMilestoneRecord } from '../../src/utils/orderToCash.ts';
import { quarterAmounts, buildCoverage } from '../../src/domain/commercialKernel/forecast.ts';
import { canonicalAccountId } from '../../src/utils/canonicalAccountLink.ts';
import { captureLocalWorkspaceScope, claimLocalWorkspace } from '../../src/services/localWorkspaceOwner.ts';

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

const today = '2026-10-05';
const opportunity = { id: 'won', accountName: 'Atlas', opportunityName: 'Service', status: 'Won', stage: 'Won', estimatedValue: 28000, currency: 'USD', closedOn: '2026-09-01', createdAt: '2026-09-01', updatedAt: '2026-09-01' };
const quote = { id: 'accepted', opportunityId: 'won', accountName: 'Atlas', opportunityName: 'Service', title: 'Service', quoteId: 'QC', quoteDate: '2026-09-01', createdAt: '2026-09-01', updatedAt: '2026-09-01', status: 'Accepted', amount: 28000, currency: 'USD', poStatus: 'Pending', deliveryStatus: 'Not scheduled', paymentStatus: 'Due', paymentDueDate: '2026-09-30', paymentTerm: 'Net 30', nextAction: '', validUntil: '' };
const revision = { ...quote, id: 'revision', status: 'Revised', amount: 55000, quoteDate: '2026-10-01' };
const milestones = ['contract', 'delivery', 'invoice'].map(milestone => createOrderMilestoneRecord({ opportunityId: 'won', milestone, done: true, doneOn: '2026-09-02' }));
const receipt = (id, amount, receivedOn) => createPaymentReceipt({ id, amount, currency: 'USD', receivedOn });
const record = receipts => createOrderReceivableRecord({ opportunityId: 'won', receipts });

test('partial receipts agree across cash, flow and collection actions without counting a quote revision', () => {
  localStorage.setItem('memoire_reporting_currency', 'USD');
  const input = { opportunities: [opportunity], quotes: [quote, revision], receivableRecords: [record([receipt('first',14000,'2026-09-15')])], milestoneRecords: milestones, expenses: [], today };
  const cash = buildCashPosition(input);
  assert.equal(cash.collectedRevenueBase, 14000);
  assert.equal(cash.upcomingInBase, 14000);
  assert.equal(cash.monthCollectedRevenueBase, 0);
  const flow = buildMoneyFlow(input);
  assert.equal(flow.threads.length, 1);
  assert.equal(flow.threads[0].stage, 'Pending payment');
  assert.equal(flow.threads[0].amount, 14000);
  assert.equal(flow.totalInMotionBase, 14000);
  const view = buildRevenueView(input);
  assert.equal(view.paid, 14000);
  assert.equal(view.pendingPo, 0);
  assert.equal(view.pendingDelivery, 0);
  assert.equal(view.pendingPayment, 14000);
  assert.equal(view.actionItems.length, 1);
  assert.equal(view.actionItems[0].amount, 14000);
});

test('overpayment is received cash, settles the order and cannot leave a collection warning', () => {
  localStorage.setItem('memoire_reporting_currency', 'USD');
  const input = { opportunities: [opportunity], quotes: [quote, revision], receivableRecords: [record([receipt('first',14000,'2026-09-15'),receipt('second',15000,'2026-10-04')]), createOrderReceivableRecord({ opportunityId:'orphan', receipts:[receipt('orphan',100000,'2026-10-04')] })], milestoneRecords: milestones, expenses: [], today };
  const cash = buildCashPosition(input);
  assert.equal(cash.collectedRevenueBase, 29000);
  assert.equal(cash.monthCollectedRevenueBase, 15000);
  assert.equal(cash.upcomingInBase, 0);
  const flow = buildMoneyFlow(input);
  assert.equal(flow.threads.length, 1);
  assert.equal(flow.threads[0].stage, 'Paid');
  assert.equal(flow.threads[0].amount, 28000, 'settled order value differs from cash actually received');
  assert.equal(buildRevenueView(input).actionItems.length, 0);
});

test('monthly close dates respect the year, exact fiscal month and undated exclusion', () => {
  localStorage.setItem('memoire_reporting_currency', 'USD');
  const fiscal = { today:new Date('2026-10-05T00:00:00Z'), fiscalYear:2026, fiscalYearStartMonth:5 };
  assert.deepEqual(quarterAmounts({...opportunity,expectedClosePeriod:'2026-08'},'Q2',fiscal),{Q1:0,Q2:28000,Q3:0,Q4:0});
  assert.deepEqual(quarterAmounts({...opportunity,expectedClosePeriod:'August 2026'},'Q2',fiscal),{Q1:0,Q2:28000,Q3:0,Q4:0});
  assert.deepEqual(quarterAmounts({...opportunity,expectedClosePeriod:'2025-08'},'Q2',fiscal),{Q1:0,Q2:0,Q3:0,Q4:0});
  const report = buildCoverage({ opportunities:[{...opportunity,expectedClosePeriod:''}], threads:[], targets:[], today:fiscal.today });
  assert.equal(report.excludedUndatedCount,1);
  assert.equal(report.quarters.reduce((sum,q)=>sum+q.committed,0),0);
});

test('canonical links require one account in the same owner scope', () => {
  const accounts = [{id:'foreign',accountName:'Atlas',userId:'b'}, {id:'own',accountName:'Atlas',userId:'a'}, {id:'demo',accountName:'Atlas',userId:'a',source:'demo'}];
  assert.equal(canonicalAccountId('Atlas',accounts,'a'),'own');
  assert.equal(canonicalAccountId('Atlas',[...accounts,{id:'ambiguous',accountName:'Atlas',userId:'a'}],'a'),undefined);
  assert.equal(canonicalAccountId('Atlas',accounts,'a','foreign'),'own');
});

test('an asynchronous scope stays stale after A switches to B and then returns to A', () => {
  globalThis.window = { localStorage };
  claimLocalWorkspace('a');
  const current = captureLocalWorkspaceScope();
  assert.equal(current(),true);
  claimLocalWorkspace('b');
  claimLocalWorkspace('a');
  assert.equal(current(),false);
  delete globalThis.window;
});
