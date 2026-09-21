import {chromium} from 'playwright';
const base=process.env.MEMOIRE_BROWSER_BASE||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({timezoneId:'Asia/Ho_Chi_Minh'});
  await context.addInitScript(()=>{
    const at='2026-09-20T00:00:00.000Z';
    localStorage.setItem('memoire_demo_workspace','interactive-demo');
    localStorage.setItem('memoire.accounts.v1',JSON.stringify([{id:'a',accountName:'Acme',createdAt:at,updatedAt:at}]));
    localStorage.setItem('memoire.opportunities.v1',JSON.stringify([{id:'o',accountId:'a',accountName:'Acme',opportunityName:'Commercial value smoke',
      stage:'Proposal',status:'Active',estimatedValue:1200000000,currency:'VND',expectedClosePeriod:'2026-10-30',forecastEvidenceCategory:'Defensible',
      decisionRecommendation:'Monitor',createdAt:at,updatedAt:at,storageMode:'local'}]));
    localStorage.setItem('memoire.outcomeRequirements.v1',JSON.stringify([{id:'r',userId:null,accountId:'a',opportunityId:'o',expectedOutcome:'QA acceptance',
      question:'Has QA accepted?',conditionId:null,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:at,updatedAt:at}]));
  });
  const page=await context.newPage();
  await page.goto(`${base}/app/opportunities?opportunityId=o`);
  const panel=page.getByRole('dialog',{name:'Opportunity details'});await panel.getByRole('heading',{name:'Commercial value smoke',exact:true}).waitFor({timeout:15000});
  await panel.getByRole('button',{name:'This value depends on…'}).click();
  await panel.getByLabel('Required commercial outcome').selectOption('r');
  await panel.getByLabel('Why does this value depend on that outcome?').fill('Customer process requires QA before commercial progression.');
  await panel.getByRole('button',{name:'Confirm relationship'}).click();
  await panel.getByText(/Currently waiting on: QA acceptance/).waitFor({timeout:15000});
  const consequence=panel.locator('[aria-label="Money consequence"]');
  if(await consequence.getByText(/at risk|lost revenue|caused/i).count())throw new Error('Money Gate UI used causal or risk language');
  await page.goto(`${base}/app/revenue`);
  const money=page.getByRole('region',{name:'Commercial value waiting on state'});
  await money.getByText('1,200,000,000 VND',{exact:true}).waitFor({timeout:15000});
  await money.getByText(/Waiting on: QA acceptance/).waitFor({timeout:15000});
  console.log('Money Gate creation, canonical Opportunity projection and shared Money surface passed.');
}finally{await browser.close();}
