import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),base=process.env.MEMOIRE_BROWSER_BASE||'http://127.0.0.1:5173';
try{
 const context=await browser.newContext({timezoneId:'Asia/Ho_Chi_Minh',viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{
  if(localStorage.getItem('incident-browser-seeded'))return;localStorage.setItem('incident-browser-seeded','true');
  const at='2026-09-01T00:00:00.000Z';
  const opportunity={id:'o',userId:null,accountId:'a',accountName:'Acme',opportunityName:'Incident browser check',stage:'Proposal',status:'Active',createdAt:at,updatedAt:at,storageMode:'local'};
  const requirement={id:'r',userId:null,accountId:'a',opportunityId:'o',expectedOutcome:'Finance reviewed',question:null,conditionId:null,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
  const policy={id:'p',userId:null,opportunityId:'o',version:1,title:'Finance review required',rationale:'Explicit operator rule',requirementId:'r',appliesWhen:'always',amount:null,currency:null,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
  localStorage.setItem('memoire_demo_workspace','interactive-demo');localStorage.setItem('memoire.accounts.v1',JSON.stringify([{id:'a',accountName:'Acme',createdAt:at,updatedAt:at}]));
  localStorage.setItem('memoire.opportunities.v1',JSON.stringify([opportunity]));localStorage.setItem('memoire.outcomeRequirements.v1',JSON.stringify([requirement]));
  localStorage.setItem('memoire.commercialPolicies.v1',JSON.stringify([policy]));
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/app/opportunities?opportunityId=o`);
 const panel=page.getByRole('dialog',{name:'Opportunity details'}).getByRole('region',{name:'Commercial incidents'});
 const before=await page.evaluate(()=>['memoire.planItems.v1','memoire.commercialCommitments.v1','memoire.commercialDecisions.v1'].map(k=>localStorage.getItem(k)));
 await panel.getByRole('button',{name:'Escalate deviation'}).click();await panel.getByLabel('Material deviation').fill('Finance review stalled');
 await panel.getByLabel('Why does this require coordination?').fill('Finance and sales must align before the commercial review.');
 await panel.getByLabel('Who coordinates the response?').fill('Recorded finance lead');assert.equal(await panel.getByRole('button',{name:'Save incident response'}).isDisabled(),true);
 await panel.getByLabel('I confirm this incident and response.').check();await panel.getByRole('button',{name:'Save incident response'}).click();
 await panel.getByRole('button',{name:'Update response: Finance review stalled'}).waitFor();assert.equal(await panel.getByRole('button',{name:'Escalate deviation'}).count(),0);
 const cutoff=await page.evaluate(async()=>{const {decodeHistoricalStorage}=await import('/src/services/historicalStorageCodec.ts');return JSON.parse(decodeHistoricalStorage(localStorage.getItem('memoire.stateRevisions.v1'))).find(r=>r.entityType==='commercial_incidents').recordedAt;});
 const after=await page.evaluate(()=>['memoire.planItems.v1','memoire.commercialCommitments.v1','memoire.commercialDecisions.v1'].map(k=>localStorage.getItem(k)));assert.deepEqual(after,before);
 await panel.getByRole('button',{name:'Update response: Finance review stalled'}).click();await panel.getByLabel('Response note').fill('The teams reviewed the coordination need.');
 await panel.getByLabel('Disposition',{exact:true}).selectOption('addressed');await panel.getByLabel('I confirm this incident and response.').check();await panel.getByRole('button',{name:'Save incident response'}).click();
 await panel.getByText(/The current rule is still unmet or unavailable/).waitFor();
 await panel.getByLabel('Disposition',{exact:true}).selectOption('dismissed');await panel.getByLabel('Response note').fill('Coordination was dismissed explicitly; finance evidence remains unresolved.');
 await panel.getByRole('button',{name:'Save incident response'}).click();await panel.getByText('Closed incidents (1)',{exact:true}).click();await panel.getByText(/Closed · dismissed/).waitFor();
 await page.reload();await page.getByText('Closed incidents (1)',{exact:true}).waitFor();
 await page.goto(`${base}/app/opportunities?opportunityId=o&asOf=${encodeURIComponent(cutoff)}`);
 const historical=page.getByRole('dialog',{name:'Opportunity as understood then'});await historical.getByRole('heading',{name:'Incident response then'}).waitFor();
 await historical.getByText(/Open · Version 1/).waitFor();assert.equal(await historical.getByText(/Closed · dismissed/).count(),0);
 assert.equal(await historical.getByRole('button',{name:'Save incident response'}).count(),0);
 await page.setViewportSize({width:390,height:844});const bounds=await historical.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=391);
 assert.deepEqual(errors,[]);console.log('Incident browser flow passed: explicit escalation, no automatic tasks, one open response, honest closure, reload, cutoff-safe read-only history and narrow viewport.');
}finally{await browser.close();}
