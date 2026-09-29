import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),base=process.env.MEMOIRE_BROWSER_BASE||'http://127.0.0.1:5173';
try {
 const context=await browser.newContext({viewport:{width:1400,height:1000}});
 await context.addInitScript(()=>{
  if(localStorage.getItem('attention-seeded'))return;localStorage.setItem('attention-seeded','yes');
  localStorage.setItem('memoire_demo_workspace','interactive-demo');
  const at='2026-09-01T00:00:00.000Z';
  const opportunity={id:'o',userId:null,accountId:'a',accountName:'Acme',opportunityName:'Budget check',stage:'Proposal',status:'Active',createdAt:at,updatedAt:at,storageMode:'local'};
  const policy={id:'p',userId:null,opportunityId:'o',version:1,title:'Review',rationale:'Recorded rule',requirementId:'r',appliesWhen:'always',amount:null,currency:null,lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at};
  const incident={id:'i',userId:null,opportunityId:'o',policyId:'p',version:1,summary:'Review stalled',materialImpact:'Coordinated attention is needed',coordinator:'Operator',responseNote:'',status:'open',disposition:null,basisSnapshot:{version:1,capturedAt:at,policy,reason:'Unmet rule',sourceRecordIds:['p','o','r']},sourceType:'manual',createdAt:at,updatedAt:at,closedAt:null};
  localStorage.setItem('memoire.accounts.v1',JSON.stringify([{id:'a',accountName:'Acme',createdAt:at,updatedAt:at}]));
  localStorage.setItem('memoire.opportunities.v1',JSON.stringify([opportunity]));localStorage.setItem('memoire.commercialPolicies.v1',JSON.stringify([policy]));
  localStorage.setItem('memoire.commercialIncidents.v1',JSON.stringify([incident]));
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/app/reviews');await page.getByText('What this leaves for next week',{exact:true}).click();
 const panel=page.getByRole('region',{name:'Commercial attention'});
 await panel.getByLabel('Attention budget',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Review all candidates'}).click();
 const choice=panel.getByRole('checkbox',{name:'Choose for this review: Review the open incident response'});await choice.waitFor();
 const snapshot=()=>page.evaluate(()=>['memoire.commercialIncidents.v1','memoire.planItems.v1','memoire.commercialCommitments.v1','memoire.stateRevisions.v1','memoire.commercialDecisions.v1'].map(k=>localStorage.getItem(k)));
 const before=await snapshot();assert.equal(await choice.isChecked(),false);await choice.check();
 await panel.getByLabel('Attention budget',{exact:true}).selectOption('0');await panel.getByText(/Your choices exceed the budget by 1/).waitFor();assert.equal(await choice.isChecked(),true);
 await choice.uncheck();await panel.getByRole('button',{name:'Show this budget'}).click();assert.equal(await panel.getByRole('checkbox').count(),0);
 assert.deepEqual(await snapshot(),before);
 await page.reload();await page.getByText('What this leaves for next week',{exact:true}).click();await panel.getByRole('button',{name:'Review all candidates'}).click();assert.equal(await choice.isChecked(),false);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 await page.evaluate(()=>{localStorage.setItem('memoire.commercialIncidents.v1','broken');window.dispatchEvent(new CustomEvent('memoire:commercial-incidents-updated'));});
 await panel.getByRole('alert').filter({hasText:'Incident responses could not be loaded'}).waitFor();
 console.log('Attention budget browser passed: explicit choices, visible overflow, zero budget, no canonical mutations, reload reset, narrow viewport and honest unavailable incidents.');
} finally {await browser.close();}
