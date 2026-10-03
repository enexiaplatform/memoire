// Adversarial checks on the retained fictional QC owner only. Each mutated source is restored.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { createClient } from '@supabase/supabase-js';
const source=process.env.MEMOIRE_YEAR_AUDIT_DIR||'.audit/global-b2b-year-2026-10-03';
const root=process.env.MEMOIRE_YEAR_PROBE_ARTIFACT_DIR||source;
fs.mkdirSync(root,{recursive:true});
const expectFixed=process.argv.includes('--expect-fixed');
if(!process.argv.includes('--production-qc'))throw Error('Explicit --production-qc required');
const credentials=JSON.parse(fs.readFileSync(`${source}/credentials.private.json`));
const fixture=JSON.parse(fs.readFileSync(`${source}/fixture.json`));
assert.match(credentials.email,/^northstar-qc-\d+@example\.invalid$/);
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{let i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
assert.equal(env.VITE_SUPABASE_URL,'https://mlmpcpkucurylkrobain.supabase.co');
const db=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:auth,error}=await db.auth.signInWithPassword({email:credentials.email,password:credentials.password});assert.ifError(error);
const browser=await chromium.launch({headless:true}),evidence={at:new Date().toISOString(),userId:credentials.userId,probes:[],restored:[],ui:[],errors:[]};
const save=()=>fs.writeFileSync(`${root}/probe-evidence.json`,JSON.stringify(evidence,null,2));
const base=process.env.MEMOIRE_BROWSER_BASE||'https://www.memoire-official.com';
async function pageFor(route) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Ho_Chi_Minh'});await context.addInitScript(s=>localStorage.setItem('memoire.supabase.auth',JSON.stringify(s)),auth.session);
  const page=await context.newPage();page.setDefaultTimeout(30000);await page.goto(base+route);return {page,context};
}
async function report(name) {
  const {page,context}=await pageFor('/app/reports?report=northstar-collections');
  try{const panel=page.getByTestId('reports-page');await panel.getByRole('button',{name:'Run report',exact:true}).click();const result=panel.getByTestId('report-result');await result.waitFor();const downloaded=page.waitForEvent('download');await result.getByRole('button',{name:'Export CSV pack',exact:true}).click();const d=await downloaded;const path=`${root}/probe-${name}.zip`;await d.saveAs(path);const zip=await JSZip.loadAsync(fs.readFileSync(path));await page.screenshot({path:`${root}/probe-${name}.png`,fullPage:true});return JSON.parse(await zip.file('report-metadata.json').async('string'));}finally{await context.close();}
}
async function row(table,id) {const r=await db.from(table).select('*').eq('user_id',credentials.userId).eq('id',id).single();assert.ifError(r.error);return r.data;}
async function write(table,r) {assert.equal(r.user_id,credentials.userId);const out=await db.from(table).upsert(r,{onConflict:'user_id,id'});assert.ifError(out.error);}
const checks=[
  ['duplicate-receipt','order_receivables',fixture.receivables[0].id,r=>{r.payload.receipts.push({...r.payload.receipts[0]});},'received',fixture.oracle.received],
  ['future-receipts','order_receivables',fixture.receivables[0].id,r=>{r.payload.receipts.forEach(p=>p.receivedOn='2099-01-01');},'received',fixture.oracle.received-10000],
];
try{
  for(const [name,table,id,mutate,metric,expected]of checks) {
    const original=await row(table,id),changed=structuredClone(original);mutate(changed);changed.updated_at=new Date().toISOString();changed.payload.updatedAt=changed.updated_at;
    try{await write(table,changed);const meta=await report(name);evidence.probes.push({name,entry:'Authenticated REST/import-shaped payload',cloudAccepted:true,metric,expected,actual:meta.totals[metric].value,delta:meta.totals[metric].value-expected,defectConfirmed:Math.abs(meta.totals[metric].value-expected)>.05});}
    finally{original.updated_at=new Date().toISOString();original.payload.updatedAt=original.updated_at;await write(table,original);const restored=await row(table,id);assert.deepEqual(restored.payload.receipts,original.payload.receipts);evidence.restored.push(name);save();}
  }
  const original=fixture.quotes.find(q=>q.status==='Accepted');const id='northstar-qc-unaccepted-revision';
  const draft={...original,id,quoteId:'SIM-UNACCEPTED-REVISION',quoteDate:'2026-10-01',status:'Draft',poStatus:'Pending',deliveryStatus:'Not scheduled',amount:20000,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  try{await write('quotes',{user_id:credentials.userId,id,payload:draft,created_at:draft.createdAt,updated_at:draft.updatedAt});const meta=await report('draft-revision');evidence.probes.push({name:'draft-revision',entry:'Authenticated REST with ordinary Draft quote',cloudAccepted:true,metric:'orderValue',expected:fixture.oracle.orderValue,actual:meta.totals.orderValue.value,delta:meta.totals.orderValue.value-fixture.oracle.orderValue,defectConfirmed:Math.abs(meta.totals.orderValue.value-fixture.oracle.orderValue)>.05});}
  finally{const result=await db.from('quotes').delete().eq('user_id',credentials.userId).eq('id',id);assert.ifError(result.error);evidence.restored.push('draft-revision');save();}
  // Real collection form: future dates and the currency shown on EUR receipt history.
  const unpaid=fixture.receivables[3],unpaidOriginal=await row('order_receivables',unpaid.id);
  const deep=await pageFor(`/app/revenue?view=collections&orderId=${unpaid.opportunityId}`);await deep.page.waitForTimeout(2000);
  evidence.ui.push({name:'Collection deep link preserves view and opens the target order',url:deep.page.url(),collectionsHeading:await deep.page.getByRole('heading',{name:'Collections',exact:true}).count()});await deep.page.screenshot({path:`${root}/collections-deeplink.png`,fullPage:true});await deep.context.close();
  const {page,context}=await pageFor('/app/revenue?view=collections');
  const unpaidRef=fixture.quotes.find(q=>q.opportunityId===unpaid.opportunityId&&q.status==='Accepted').quoteId;
  await page.getByRole('button',{name:new RegExp(unpaidRef)}).click();
  try{await page.getByLabel('Amount (USD)',{exact:true}).fill('500');await page.getByLabel('Received on',{exact:true}).fill('2099-01-01');await page.getByLabel('How',{exact:true}).fill('[SIMULATED QC] future-date probe');await page.getByRole('button',{name:'Record',exact:true}).click();await page.waitForTimeout(1600);const r=await row('order_receivables',unpaid.id);const accepted=r.payload.receipts.some(p=>p.amount===500&&p.receivedOn==='2099-01-01');evidence.ui.push({name:'Future date accepted by real Collection form',accepted});await page.screenshot({path:`${root}/future-date-ui.png`,fullPage:true});}
  finally{await context.close();unpaidOriginal.updated_at=new Date().toISOString();unpaidOriginal.payload.updatedAt=unpaidOriginal.updated_at;await write('order_receivables',unpaidOriginal);evidence.restored.push('future-date-ui');save();}
  const euro=fixture.receivables[1];const euroUi=await pageFor('/app/revenue?view=collections');await euroUi.page.getByRole('button',{name:/^all$/i}).click();const euroRef=fixture.quotes.find(q=>q.opportunityId===euro.opportunityId&&q.status==='Accepted').quoteId;await euroUi.page.getByRole('button',{name:new RegExp(euroRef)}).click();
  await euroUi.page.getByLabel('Amount (EUR)',{exact:true}).waitFor();const text=await euroUi.page.getByRole('main').innerText();fs.writeFileSync(`${root}/euro-collections.txt`,text);await euroUi.page.screenshot({path:`${root}/euro-receipt-ui.png`,fullPage:true});
  const eurReceipt=euro.receipts[0];const wronglyLabelled=await euroUi.page.getByText(`${eurReceipt.amount.toLocaleString('en',{maximumFractionDigits:2})} USD`,{exact:true}).count();
  evidence.ui.push({name:'EUR receipt displayed as USD without converting the original amount',originalAmount:eurReceipt.amount,originalCurrency:'EUR',expectedReportingAmount:eurReceipt.amount*30/26,mislabelledTextCount:wronglyLabelled});await euroUi.context.close();
  // Paid order and the conflicting payment action surfaced by Orders.
  const paid=fixture.opportunities[0];const orders=await pageFor(`/app/revenue?orderId=${paid.id}`);await orders.page.getByRole('main').waitFor();await orders.page.waitForTimeout(1600);fs.writeFileSync(`${root}/orders-risk.txt`,await orders.page.getByRole('main').innerText());await orders.page.screenshot({path:`${root}/orders-risk.png`,fullPage:true});await orders.context.close();
  const normal=await report('restored-baseline');assert.ok(Math.abs(normal.totals.received.value-fixture.oracle.received)<.01);assert.ok(Math.abs(normal.totals.orderValue.value-fixture.oracle.orderValue)<.01);evidence.ui.push({name:'After every probe the baseline totals are restored',passed:true});
  const activation=await db.rpc('activate_commercial_history');assert.ifError(activation.error);evidence.ui.push({name:'Account historical integrity activated by its authenticated RPC',at:activation.data});
  for(const cost of fixture.costs){await write('order_costs',{user_id:credentials.userId,id:cost.id,payload:cost,created_at:cost.createdAt,updated_at:cost.updatedAt});}
  const margin=await pageFor('/app/revenue?view=margin');await margin.page.getByText('Across the 48 of 48 committed orders that carry a cost.',{exact:false}).waitFor();
  const marginText=await margin.page.getByRole('main').innerText();assert.match(marginText,/33%/);fs.writeFileSync(`${root}/margin.txt`,marginText);await margin.page.screenshot({path:`${root}/margin.png`,fullPage:true});evidence.ui.push({name:'48 cloud landed costs visible in Margin',coverage:48,marginPct:33,oracleGrossMargin:fixture.oracle.grossMargin,oracleLandedCost:fixture.oracle.landedCost});await margin.context.close();
  const backup=await pageFor('/app/settings?tab=export');
  try{if(!await backup.page.getByRole('button',{name:'Download ZIP',exact:true}).count()){const btn=backup.page.getByRole('button',{name:'Export & restore',exact:true});if(await btn.count())await btn.click();}await backup.page.getByRole('button',{name:'Download ZIP',exact:true}).waitFor();const downloaded=backup.page.waitForEvent('download');await backup.page.getByRole('button',{name:'Download ZIP',exact:true}).click();const d=await downloaded;await d.saveAs(`${root}/northstar-workspace-backup.zip`);const z=await JSZip.loadAsync(fs.readFileSync(`${root}/northstar-workspace-backup.zip`));evidence.ui.push({name:'Full workspace ZIP exported in UI',files:Object.keys(z.files)});}catch(e){evidence.errors.push(`Workspace export: ${e.message}`);}finally{await backup.context.close();}
  if(expectFixed){
    for(const probe of evidence.probes)assert.equal(probe.defectConfirmed,false,probe.name);
    assert.equal(evidence.ui.find(p=>p.name==='Collection deep link preserves view and opens the target order').collectionsHeading,1);
    assert.equal(evidence.ui.find(p=>p.name==='Future date accepted by real Collection form').accepted,false);
    assert.equal(evidence.ui.find(p=>p.name==='EUR receipt displayed as USD without converting the original amount').mislabelledTextCount,0);
    assert.deepEqual(evidence.errors,[]);
  }
  evidence.finished=true;evidence.expectFixed=expectFixed;save();console.log(JSON.stringify(evidence));
}catch(e){evidence.errors.push(e.message);save();console.error(e.message);process.exitCode=1;}
finally{await browser.close();db.auth.stopAutoRefresh();}
