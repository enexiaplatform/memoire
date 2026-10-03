// Opt-in Production QC. Creates ONLY a new fictional owner and touches that owner's rows.
// Credentials/session stay in the ignored .audit folder; no email is sent.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { buildGlobalB2BYear } from './fixtures/global-b2b-year.mjs';
import { opportunityToRow } from '../src/services/opportunityStore.ts';
import { accountToRow } from '../src/services/accountStore.ts';
import { activityToInsert } from '../src/services/salesActivityStore.ts';
import { reportTemplate } from '../src/domain/reports/reportDefinition.ts';
import { changeSavedReport } from '../src/domain/reports/reportRecord.ts';
import { changeSavedDashboard } from '../src/domain/dashboards/dashboardRecord.ts';
import { dashboardFromReport } from '../src/domain/dashboards/dashboardDefinition.ts';
const root=process.env.MEMOIRE_YEAR_AUDIT_DIR||'.audit/global-b2b-year-2026-10-03';fs.mkdirSync(root,{recursive:true});
if(!process.argv.includes('--production-qc'))throw Error('Use --production-qc for the explicitly authorized fictional account audit.');
if(fs.existsSync(`${root}/live-evidence.json`)&&JSON.parse(fs.readFileSync(`${root}/live-evidence.json`)).finished)throw Error('Completed audit account retained. Choose a fresh MEMOIRE_YEAR_AUDIT_DIR for a new fictional replay.');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const url=env.VITE_SUPABASE_URL;assert.equal(url,'https://mlmpcpkucurylkrobain.supabase.co');
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=createClient(url,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let credentials;
if(fs.existsSync(`${root}/credentials.private.json`))credentials=JSON.parse(fs.readFileSync(`${root}/credentials.private.json`));
else {
  const email=`northstar-qc-${Date.now()}@example.invalid`,password=randomBytes(24).toString('base64url');
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'[SIMULATED QC] Northstar Industrial Supply',qc_fictional:true}});
  if(error)throw Error(`Test account creation: ${error.status} ${error.code||error.message}`);
  credentials={email,password,userId:data.user.id,createdAt:new Date().toISOString(),provisioning:'Admin-created confirmed test identity; public signup/email verification NOT certified'};
  fs.writeFileSync(`${root}/credentials.private.json`,JSON.stringify(credentials,null,2));
}
const login=await anon.auth.signInWithPassword({email:credentials.email,password:credentials.password});if(login.error)throw Error(login.error.message);
const owner=credentials.userId,token=login.data.session.access_token;
assert.equal(login.data.user.id,owner);
fs.writeFileSync(`${root}/session.private.json`,JSON.stringify(login.data.session));
const evidence={at:new Date().toISOString(),origin:'https://www.memoire-official.com',userId:owner,email:credentials.email,provisioning:credentials.provisioning,monthly:[],routes:[],failures:[],networkFailures:[],pageErrors:[],ui:[],retained:true};
const save=()=>fs.writeFileSync(`${root}/live-evidence.json`,JSON.stringify(evidence,null,2));
async function api(table,method='GET',data,query='') {
  const response=await fetch(`${url}/rest/v1/${table}${query}`,{method,headers:{apikey:env.VITE_SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:data===undefined?undefined:JSON.stringify(data)});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw Error(`${table} ${method}: HTTP ${response.status} ${result?.code||''} ${result?.message||''}`);
  return result;
}
const jsonRows=rows=>rows.map(r=>({user_id:owner,id:r.id,payload:r,created_at:r.createdAt,updated_at:r.updatedAt}));
const upsert=async(table,rows)=>{if(rows.length)await api(table,'POST',rows);};
let browser;
try {
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Ho_Chi_Minh',reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&r.url().includes('/rest/v1/'))evidence.networkFailures.push({status:r.status(),table:r.url().split('/rest/v1/')[1]?.split('?')[0]});});
  await page.goto(evidence.origin+'/login');
  await page.getByLabel('Email address',{exact:true}).fill(credentials.email);await page.getByLabel('Password',{exact:true}).fill(credentials.password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/app/**',{timeout:45000});
  await page.getByRole('link',{name:'Reports',exact:true}).first().waitFor({timeout:45000});
  evidence.ui.push({name:'Real Production password login',passed:true});
  const activation=await anon.rpc('activate_commercial_history');assert.ifError(activation.error);
  await page.screenshot({path:`${root}/new-account.png`,fullPage:true});save();
  const at=credentials.createdAt;
  const definitions=['portfolio','collections'].map((k,i)=>changeSavedReport([],{id:`northstar-${k}`,state:{definition:{...reportTemplate(k),name:`[SIMULATED] Northstar ${k}`,metrics:k==='collections'?['recordCount','orderValue','received','outstanding','overdue']:reportTemplate(k).metrics},archived:false},expectedVersion:0,sample:false,at})[0]);
  for(const [table,rows]of [['report_definitions',definitions]])if(!(await api(table,'GET',undefined,`?user_id=eq.${owner}&select=id`)).length)await upsert(table,jsonRows(rows));
  const dash=changeSavedDashboard([],{id:'northstar-dashboard',state:{definition:{...dashboardFromReport(definitions[0],'pipeline'),name:'[SIMULATED] Northstar Year',widgets:[...dashboardFromReport(definitions[0],'pipeline').widgets,{id:'cash',title:'Cash outstanding',type:'metric',metric:'outstanding',reportId:definitions[1].id}]},archived:false},expectedVersion:0,sample:false,at})[0];
  if(!(await api('dashboard_definitions','GET',undefined,`?user_id=eq.${owner}&select=id`)).length)await upsert('dashboard_definitions',jsonRows([dash]));
  const close=(a,b,label)=>assert.ok(Math.abs(a-b)<.05,`${label}: ${a} vs ${b}`);
  for(let m=1;m<=12;m++) {
    const f=buildGlobalB2BYear(m),previous=buildGlobalB2BYear(m-1),newOpp=f.opportunities.slice((m-1)*8);
    await upsert('accounts',f.accounts.slice(previous.accounts.length).map(a=>({...accountToRow(a),id:a.id,user_id:owner,name:a.accountName,account_code:a.accountCode,created_at:a.createdAt,updated_at:a.updatedAt})));
    const asRows=rows=>rows.map(o=>({...opportunityToRow(o),id:o.id,user_id:owner,title:o.opportunityName,created_at:o.createdAt,updated_at:o.updatedAt}));
    // Replay qualification and decisions as separate real cloud writes, not a fabricated history.
    await upsert('opportunities',asRows(newOpp.map(o=>({...o,stage:'Lead',status:'Active',closedOn:''}))));
    await upsert('opportunities',asRows(newOpp.map(o=>({...o,stage:o.stage==='Lead'?'Lead':'Proposal',status:'Active',closedOn:''}))));
    await upsert('opportunities',asRows(newOpp));
    await upsert('sales_activities',f.activities.slice((m-1)*32).map(a=>({...activityToInsert(a,owner,{createdAt:a.createdAt,updatedAt:a.updatedAt},a),id:a.id})));
    await upsert('portfolio_records',jsonRows(f.portfolio.filter(r=>m===1||!previous.portfolio.some(p=>p.id===r.id))));
    await upsert('quotes',jsonRows(f.quotes.slice((m-1)*8)));await upsert('order_receivables',jsonRows(f.receivables.slice((m-1)*4)));
    await upsert('order_costs',jsonRows(f.costs.slice((m-1)*4)));
    const checkpoint={month:m,period:f.monthly.at(-1).period,oracle:f.oracle,reports:[]};
    for(const key of ['portfolio','collections']) {
      await page.goto(`${evidence.origin}/app/reports?report=northstar-${key}`);
      const panel=page.getByTestId('reports-page');await panel.getByRole('button',{name:'Save changes',exact:true}).waitFor({timeout:45000});
      await panel.getByRole('button',{name:'Run report',exact:true}).click();
      const result=panel.getByTestId('report-result');await result.waitFor({timeout:45000});
      const downloaded=page.waitForEvent('download');await result.getByRole('button',{name:'Export CSV pack',exact:true}).click();
      const file=await downloaded,path=`${root}/month-${String(m).padStart(2,'0')}-${key}.zip`;await file.saveAs(path);
      const zip=await JSZip.loadAsync(fs.readFileSync(path)),meta=JSON.parse(await zip.file('report-metadata.json').async('string'));
      assert.equal(meta.rows,key==='portfolio'?f.oracle.qualified:f.oracle.orderCount);
      for(const metric of key==='portfolio'?['pipeline','won','winRate']:['orderValue','received','outstanding'])close(meta.totals[metric].value,f.oracle[metric],`${m}/${key}/${metric}`);
      checkpoint.reports.push({key,rows:meta.rows,totals:meta.totals,money:meta.money,sourceStatus:meta.sourceStatus,passed:true});
    }
    evidence.monthly.push(checkpoint);save();console.log(`Month ${m} ${checkpoint.period}: authenticated cloud write, UI report export and independent reconciliation passed`);
  }
  for(const route of ['today','timeline','leads','accounts','opportunities','revenue','reviews','products','reports','dashboards']) {
    const started=performance.now();await page.goto(`${evidence.origin}/app/${route}`);await page.getByRole('main').waitFor({timeout:45000});
    await page.waitForTimeout(1200);
    const content=await page.getByRole('main').innerText();fs.writeFileSync(`${root}/route-${route}.txt`,content);
    assert.ok(content.trim().length>80,`${route} blank`);assert.ok(!/Could not find the table|schema cache/.test(content));
    const desktopOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    await page.screenshot({path:`${root}/${route}-desktop.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
    const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    await page.screenshot({path:`${root}/${route}-mobile.png`,fullPage:true});
    evidence.routes.push({route,loadMs:Math.round(performance.now()-started),content:true,desktopOverflow,mobileOverflow});await page.setViewportSize({width:1440,height:1000});save();
  }
  await page.goto(`${evidence.origin}/app/dashboards?dashboard=northstar-dashboard`);
  const boards=page.getByTestId('dashboards-page');await boards.getByRole('button',{name:'Refresh dashboard',exact:true}).click();await boards.getByTestId('dashboard-results').waitFor({timeout:45000});
  const text=await boards.getByTestId('dashboard-results').innerText();fs.writeFileSync(`${root}/dashboard-results.txt`,text);
  await page.screenshot({path:`${root}/dashboard-final.png`,fullPage:true});evidence.ui.push({name:'Saved dashboard runs linked reports',passed:true});
  // Fresh browser context proves cloud read rather than an existing local mirror.
  const fresh=await browser.newContext();await fresh.addInitScript(session=>localStorage.setItem('memoire.supabase.auth',JSON.stringify(session)),login.data.session);
  const freshPage=await fresh.newPage();await freshPage.goto(`${evidence.origin}/app/reports?report=northstar-portfolio`);const fp=freshPage.getByTestId('reports-page');await fp.getByRole('button',{name:'Run report',exact:true}).click();await fp.getByTestId('report-result').getByText(/84 matching records from 96 loaded/).waitFor({timeout:45000});evidence.ui.push({name:'Fresh browser loads cloud year without seeded cache',passed:true});await fresh.close();
  const {data:foreign,error:foreignError}=await admin.auth.admin.createUser({email:`northstar-isolation-${Date.now()}@example.invalid`,password:randomBytes(24).toString('base64url'),email_confirm:true});
  if(foreignError)throw Error('Isolation user creation failed');
  try { // Use a short-lived second owner's session, never service-role for the isolation assertion.
    const link=await admin.auth.admin.generateLink({type:'magiclink',email:foreign.user.email});if(link.error)throw link.error;
    const second=createClient(url,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const verified=await second.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});if(verified.error)throw verified.error;
    for(const table of ['accounts','opportunities','quotes','order_receivables','portfolio_records','report_definitions','dashboard_definitions']) {const {data,error}=await second.from(table).select('id').eq('user_id',owner);assert.ifError(error);assert.equal(data.length,0);}
    await second.auth.signOut();evidence.ui.push({name:'Second owner cannot read Northstar data in seven tables',passed:true});
  }finally{const d=await admin.auth.admin.deleteUser(foreign.user.id);if(d.error)throw d.error;}
  const counts={};for(const table of ['accounts','opportunities','sales_activities','quotes','order_receivables','order_costs','portfolio_records','report_definitions','dashboard_definitions'])counts[table]=(await api(table,'GET',undefined,`?user_id=eq.${owner}&select=id`)).length;
  evidence.cloudCounts=counts;evidence.finished=true;save();console.log(JSON.stringify({finished:true,email:credentials.email,userId:owner,counts,pageErrors:evidence.pageErrors,networkFailures:evidence.networkFailures,routes:evidence.routes}));
}catch(error){evidence.failures.push(error.message);save();console.error(error.message);process.exitCode=1;}
finally{if(browser)await browser.close();anon.auth.stopAutoRefresh();admin.auth.stopAutoRefresh();}
