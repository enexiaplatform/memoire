import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),base=process.env.MEMOIRE_BROWSER_BASE||'http://127.0.0.1:5173';
try{const context=await browser.newContext({viewport:{width:1400,height:1000}});await context.addInitScript(()=>{
 if(localStorage.getItem('team-seeded'))return;localStorage.setItem('team-seeded','yes');localStorage.setItem('memoire_demo_workspace','interactive-demo');
 const at='2026-09-01T00:00:00.000Z';localStorage.setItem('memoire.accounts.v1',JSON.stringify([{id:'a',accountName:'Acme',createdAt:at,updatedAt:at}]));
 localStorage.setItem('memoire.opportunities.v1',JSON.stringify([{id:'o',userId:null,accountId:'a',accountName:'Acme',opportunityName:'Team review deal',stage:'Proposal',status:'Active',createdAt:at,updatedAt:at,storageMode:'local'}]));
 });const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/app/reviews');
 await page.getByText('What this leaves for next week',{exact:true}).click();await page.getByText(/Team coordination · 0 recorded open promises/).click();
 const panel=page.getByRole('region',{name:'Team coordination'});await panel.getByRole('button',{name:'Record agreed internal promise'}).click();await panel.getByLabel('Team Opportunity').selectOption('o');
 for(const [label,value] of [['Who agreed','Operations lead'],['Agreed internal promise','Send agreed validation pack'],['Agreed due date','2026-10-01'],['Agreement reference','Private meeting note 42']])await panel.getByLabel(label,{exact:true}).fill(value);
 assert.equal(await panel.getByRole('button',{name:'Record internal agreement'}).isDisabled(),true);await panel.getByRole('checkbox',{name:'I confirm this agreed promise and its reference.'}).check();await panel.getByRole('button',{name:'Record internal agreement'}).click();
 const selected=panel.getByRole('checkbox',{name:'Include in review: Operations lead — Send agreed validation pack'});await selected.waitFor();assert.equal(await selected.isChecked(),false);await selected.check();await panel.getByRole('button',{name:'Preview selected review'}).click();
 const text=await panel.locator('pre').innerText();assert.ok(text.includes('Send agreed validation pack'));assert.equal(text.includes('Private meeting note 42'),false);assert.ok(text.includes('not an assignment notification'));
 const before=await page.evaluate(()=>localStorage.getItem('memoire.commercialCommitments.v1'));await selected.uncheck();assert.equal(await panel.locator('pre').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('memoire.commercialCommitments.v1')),before);
 await page.reload();await page.getByText('What this leaves for next week',{exact:true}).click();await page.getByText(/Team coordination · 1 recorded open promises/).click();await selected.waitFor();assert.equal(await selected.isChecked(),false);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 console.log('Team coordination browser passed: confirmed agreement, existing durable ledger, minimal selected preview, no implicit sharing, reload and narrow viewport.');
}finally{await browser.close();}
