import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildGlobalB2BYear } from './fixtures/global-b2b-year.mjs';
import { buildPortfolioFacts,capturePortfolioMoneyBasis,summarizePortfolio } from '../src/domain/portfolio/portfolioAnalytics.ts';
import { buildReportSources } from '../src/domain/reports/reportSources.ts';
import { reportTemplate } from '../src/domain/reports/reportDefinition.ts';
import { runReport } from '../src/domain/reports/reportEngine.ts';
import { buildOrderBook } from '../src/utils/orderToCash.ts';
import { buildOrderMargins } from '../src/utils/orderMargin.ts';
const root=process.env.MEMOIRE_YEAR_AUDIT_DIR||'.audit/global-b2b-year-2026-10-03';fs.mkdirSync(root,{recursive:true});
const store=new Map([['memoire_reporting_currency','USD']]);globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const checks=[], near=(a,b,label)=>{assert.ok(Math.abs(a-b)<.01,`${label}: actual ${a}, expected ${b}`);};
export function calculate(f) {
  const money=capturePortfolioMoneyBasis(f.opportunities.map(o=>o.currency));
  const facts=buildPortfolioFacts({opportunities:f.opportunities,outcomes:[],records:f.portfolio,money,sample:false});
  const today=f.monthly.at(-1).period+'-28';
  const sources=buildReportSources({facts,opportunities:f.opportunities,quotes:f.quotes,outcomes:[],milestones:[],costs:[],receivables:f.receivables,money,today,sample:false});
  const run=key=>runReport({definition:{...reportTemplate(key),metrics:key==='collections'?['recordCount','orderValue','received','outstanding','overdue']:reportTemplate(key).metrics},sources,scopeKey:'qc-northstar',runAt:today+'T12:00:00Z',today,timezone:'Asia/Ho_Chi_Minh',money,sourceStatus:'Synthetic fixture; local calculation'});
  const book=buildOrderBook({opportunities:f.opportunities,quotes:f.quotes,milestoneRecords:[],costRecords:f.costs,outcomes:[],today,linkage:'explicit-id'});
  const margin=buildOrderMargins({orders:book.orders,costRecords:f.costs});
  return {portfolio:summarizePortfolio(facts),performance:run('portfolio'),collections:run('collections'),sources,margin};
}
for(let month=1;month<=12;month++) {
  const f=buildGlobalB2BYear(month),r=calculate(f),o=f.oracle;
  for(const key of ['pipeline','won','winRate']) near(r.performance.totals[key].value,o[key],`Month ${month} ${key}`);
  assert.equal(r.performance.rows.length,o.qualified);
  assert.equal(r.collections.rows.length,o.orderCount);
  near(r.margin.costBase,o.landedCost,`Month ${month} landed cost`);near(r.margin.grossMarginBase,o.grossMargin,`Month ${month} gross margin`);assert.equal(r.margin.marginPct,33);
  for(const key of ['orderValue','received','outstanding']) near(r.collections.totals[key].value,o[key],`Month ${month} ${key}`);
  const surplus=r.collections.rows.reduce((s,row)=>s+(row.values.overpaid||0),0);
  assert.ok(Math.abs(surplus-o.overpaid)<o.orderCount*.005, 'Overpayment exceeds per-order half-cent settlement tolerance');
  checks.push({month,period:f.monthly.at(-1).period,oracle:o,actual:{performance:r.performance.totals,collections:r.collections.totals,overpaid:surplus,landedCost:r.margin.costBase,grossMargin:r.margin.grossMarginBase,marginPct:r.margin.marginPct},overpaymentDelta:surplus-o.overpaid,passed:true});
}
const fixture=buildGlobalB2BYear();fs.writeFileSync(`${root}/fixture.json`,JSON.stringify(fixture,null,2));
const probes=[];
for(const [name,mutate] of [
  ['duplicate opportunity identity',f=>f.opportunities.push({...f.opportunities[0]})],
  ['duplicate receivable per order',f=>f.receivables.push({...f.receivables[0],id:'duplicate'})],
]) {const f=structuredClone(fixture);mutate(f);assert.throws(()=>calculate(f));probes.push({name,refused:true});}
const missing=structuredClone(fixture);missing.opportunities.find(o=>o.stage==='Proposal').currency='SEK';
assert.equal(calculate(missing).performance.totals.pipeline.missing,1);probes.push({name:'Missing FX',visibleMissing:1});
const absent=structuredClone(fixture);const first=absent.opportunities.find(o=>o.status==='Won');first.estimatedValue=null;for(const q of absent.quotes.filter(q=>q.opportunityId===first.id))q.amount=null;
assert.equal(calculate(absent).performance.totals.won.missing,1);assert.equal(calculate(absent).collections.totals.orderValue.missing,1);probes.push({name:'Missing order amount',visibleMissing:1});
const duplicateReceipt=structuredClone(fixture);duplicateReceipt.receivables[0].receipts.push({...duplicateReceipt.receivables[0].receipts[0]});
const duplicateResult=calculate(duplicateReceipt).collections.totals.received.value;
probes.push({name:'Duplicate receipt identity',expected:fixture.oracle.received,actual:duplicateResult,passed:Math.abs(duplicateResult-fixture.oracle.received)<.01});
near(duplicateResult,fixture.oracle.received,'Duplicate receipt identity');
const futureReceipt=structuredClone(fixture);futureReceipt.receivables[0].receipts.forEach(r=>r.receivedOn='2099-01-01');
const futureResult=calculate(futureReceipt).collections.totals.received.value;
probes.push({name:'Future-dated receipts count as money received',expected:fixture.oracle.received-10000,actual:futureResult,passed:Math.abs(futureResult-(fixture.oracle.received-10000))<.01});
near(futureResult,fixture.oracle.received-10000,'Future receipt exclusion');
const draftRevision=structuredClone(fixture),original=draftRevision.quotes.find(q=>q.status==='Accepted');
draftRevision.quotes.push({...original,id:'unaccepted-revision',quoteId:'SIM-UNACCEPTED',quoteDate:'2026-10-01',createdAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z',status:'Draft',poStatus:'Not received',deliveryStatus:'Not started',amount:20000});
const draftResult=calculate(draftRevision).collections.totals.orderValue.value;
probes.push({name:'Later unaccepted quote replaces committed order value',expected:fixture.oracle.orderValue,actual:draftResult,passed:Math.abs(draftResult-fixture.oracle.orderValue)<.01});
near(draftResult,fixture.oracle.orderValue,'Unaccepted revision');
const result={at:new Date().toISOString(),months:checks,probes,fixtureCounts:Object.fromEntries(['accounts','opportunities','quotes','receivables','activities','portfolio'].map(k=>[k,fixture[k].length]))};
fs.writeFileSync(`${root}/calculation-evidence.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
