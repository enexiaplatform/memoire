import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const base=process.env.MEMOIRE_BROWSER_BASE||'http://127.0.0.1:5173';
try{
 const context=await browser.newContext({timezoneId:'Asia/Ho_Chi_Minh',viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{
  if(localStorage.getItem('policy-browser-seeded'))return;
  localStorage.setItem('policy-browser-seeded','true');
  const at='2026-09-01T00:00:00.000Z';
  const o={id:'o',userId:null,accountId:'a',accountName:'Acme',opportunityName:'Policy browser check',stage:'Proposal',status:'Active',estimatedValue:600000000,currency:'VND',createdAt:at,updatedAt:at,storageMode:'local'};
  const r={id:'r',userId:null,accountId:'a',opportunityId:'o',expectedOutcome:'Finance review completed',question:null,conditionId:null,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
  localStorage.setItem('memoire_demo_workspace','interactive-demo');localStorage.setItem('memoire.accounts.v1',JSON.stringify([{id:'a',accountName:'Acme',createdAt:at,updatedAt:at}]));
  localStorage.setItem('memoire.opportunities.v1',JSON.stringify([o]));localStorage.setItem('memoire.outcomeRequirements.v1',JSON.stringify([r]));
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/app/opportunities?opportunityId=o`);
 let panel=page.getByRole('dialog',{name:'Opportunity details'}).getByRole('region',{name:'Commercial policies'});
 await panel.getByRole('button',{name:'Add rule'}).click();
 await panel.getByLabel('Rule name').fill('Finance review above 500M');await panel.getByLabel('Required outcome').selectOption('r');
 await panel.getByLabel('Applies',{exact:true}).selectOption('value_above');await panel.getByLabel('Amount threshold').fill('500000000');
 await panel.getByLabel('Rule currency').fill('VND');await panel.getByLabel('Reason for this version').fill('I require recorded finance review above this limit.');
 assert.equal(await panel.getByRole('button',{name:'Publish policy version'}).isDisabled(),true);
 await panel.getByLabel('I confirm this explicit rule and its reason.').check();await panel.getByRole('button',{name:'Publish policy version'}).click();
 await panel.getByText('Rule unmet',{exact:true}).waitFor();
 const cutoff=await page.evaluate(async()=>{const {decodeHistoricalStorage}=await import('/src/services/historicalStorageCodec.ts');return JSON.parse(decodeHistoricalStorage(localStorage.getItem('memoire.stateRevisions.v1'))).find(row=>row.entityType==='commercial_policies').recordedAt;});
 await panel.getByRole('button',{name:'Revise Finance review above 500M'}).click();await panel.getByLabel('Amount threshold').fill('700000000');
 await panel.getByLabel('Reason for this version').fill('I reviewed and raised the finance threshold.');await panel.getByLabel('I confirm this explicit rule and its reason.').check();
 await panel.getByRole('button',{name:'Publish policy version'}).click();await panel.getByText('Does not apply',{exact:true}).waitFor();
 await page.reload();panel=page.getByRole('dialog',{name:'Opportunity details'}).getByRole('region',{name:'Commercial policies'});
 await panel.getByText('Does not apply',{exact:true}).waitFor();
 await page.goto(`${base}/app/opportunities?opportunityId=o&asOf=${encodeURIComponent(cutoff)}`);
 const historical=page.getByRole('dialog',{name:'Opportunity as understood then'});await historical.getByRole('heading',{name:'Policy checks then'}).waitFor();
 await historical.getByText('Rule unmet',{exact:true}).waitFor();assert.equal(await historical.getByRole('button',{name:'Publish policy version'}).count(),0);
 await page.setViewportSize({width:390,height:844});const bounds=await historical.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=391);
 if(process.env.MEMOIRE_BROWSER_SCREENSHOT)await historical.screenshot({path:process.env.MEMOIRE_BROWSER_SCREENSHOT});
 assert.deepEqual(errors,[]);console.log('Policy browser flow passed: human confirmation, publish, revise, reload, cutoff-safe history, read-only controls and narrow viewport.');
}finally{await browser.close();}
