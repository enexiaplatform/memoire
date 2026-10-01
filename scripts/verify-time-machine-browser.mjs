import {chromium} from 'playwright';

const base=process.env.MEMOIRE_BROWSER_BASE||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({timezoneId:'Asia/Ho_Chi_Minh'});
  await context.addInitScript(()=>{
    if(localStorage.getItem('memoire.historyBrowserFixture'))return;
    localStorage.setItem('memoire.historyBrowserFixture','true');
    const at='2026-09-20T00:00:00Z';
    const opportunity={id:'browser-smoke',userId:null,accountId:'account',accountName:'Account',
      opportunityName:'Historical browser smoke',stage:'Discovery',status:'Active',
      expectedClosePeriod:'2026-09-30',forecastEvidenceCategory:'Defensible',createdAt:at,updatedAt:at};
    localStorage.setItem('memoire_demo_workspace','interactive-demo');
    localStorage.setItem('memoire.opportunities.v1',JSON.stringify([opportunity]));
    localStorage.setItem('memoire.historyCoverage.v1',JSON.stringify([{scope:'guest',historyGuaranteedFrom:at,schemaVersion:1,lineageId:'smoke'}]));
    localStorage.setItem('memoire.stateRevisions.v1',JSON.stringify([{id:'revision-smoke',scope:'guest',
      entityType:'opportunities',entityId:'browser-smoke',revisionNo:1,mutationId:'mutation-smoke',
      operation:'baseline',recordedAt:at,schemaVersion:1,state:opportunity}]));
  });
  const page=await context.newPage();
  const browserErrors=[];
  page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text());});
  page.on('pageerror',error=>browserErrors.push(error.message));
  const url=`${base}/app/opportunities?opportunityId=browser-smoke&asOf=2026-09-20T12%3A00%3A00Z`;
  await page.goto(url);
  await page.getByText('As understood then',{exact:true}).waitFor({timeout:15000});
  const history=page.getByRole('dialog',{name:'Opportunity as understood then'});
  await history.getByRole('heading',{name:'Historical browser smoke'}).waitFor({timeout:15000});
  await history.getByText(/Full core historical coverage/).waitFor({timeout:15000});
  if(process.env.MEMOIRE_BROWSER_SCREENSHOT)await history.screenshot({path:process.env.MEMOIRE_BROWSER_SCREENSHOT});
  if(await history.getByText('Save opportunity',{exact:false}).count())throw new Error('Historical drawer exposed a save action');
  await page.reload();
  await page.getByRole('dialog',{name:'Opportunity as understood then'}).getByRole('heading',{name:'Historical browser smoke'}).waitFor({timeout:15000});
  await page.getByRole('dialog',{name:'Opportunity as understood then'}).getByLabel('Historical cutoff').fill('2026-09-20T06:59:59');
  await page.getByRole('dialog',{name:'Opportunity as understood then'}).getByRole('button',{name:'View'}).click();
  await page.getByText('Before verified history').waitFor({timeout:15000});
  if(new URL(page.url()).searchParams.get('asOf')!=='2026-09-19T23:59:59.000Z')
    throw new Error('Local date/time did not resolve to the correct UTC instant');
  await page.goto(`${base}/app/opportunities?opportunityId=browser-smoke&asOf=invalid`);
  await page.getByRole('alert').getByText(/Choose a valid date and time/).waitFor({timeout:15000});
  await page.getByRole('button',{name:'Return to current'}).click();
  await page.getByRole('dialog',{name:'Opportunity details'}).getByText('Edit Opportunity',{exact:true}).waitFor({timeout:15000});
  if(new URL(page.url()).searchParams.has('asOf'))throw new Error('Return to current kept the cutoff');
  await page.setViewportSize({width:390,height:844});
  await page.goto(url);
  const mobile=page.getByRole('dialog',{name:'Opportunity as understood then'});
  await mobile.getByText(/Full core historical coverage/).waitFor({timeout:15000});
  const bounds=await mobile.boundingBox();
  if(!bounds||bounds.x<0||bounds.x+bounds.width>391)throw new Error('Historical drawer overflows a narrow viewport');
  await page.evaluate(()=>localStorage.removeItem('memoire.opportunities.v1'));
  await page.reload();
  await page.getByRole('dialog',{name:'Opportunity as understood then'}).getByText(/Full core historical coverage/).waitFor({timeout:15000});
  await page.getByRole('button',{name:'Return to current'}).click();
  await page.waitForURL(candidate=>!candidate.searchParams.has('asOf'));
  if(await page.getByRole('dialog',{name:'Opportunity details'}).count())
    throw new Error('Deleted historical Opportunity opened an empty current editor');
  if(browserErrors.length)throw new Error(`Browser console errors: ${browserErrors.join(' | ')}`);
  console.log('Historical URL, reload, read-only drawer, pre-coverage timezone, invalid cutoff and return-to-current browser smoke passed.');
}finally{await browser.close();}
