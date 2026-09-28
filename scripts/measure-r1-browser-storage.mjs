import {chromium} from 'playwright';
import {buildScaleWorkspace} from './lib/scale-workspace.mjs';
import {decodeHistoricalStorage,encodeHistoricalStorage} from '../src/services/historicalStorageCodec.ts';

const base=process.env.MEMOIRE_BROWSER_BASE||'http://127.0.0.1:5173';
const workspace=buildScaleWorkspace({opportunities:300,activities:900,accounts:210,quotes:240});
const scope='benchmark-owner',boundary='2023-01-01T00:00:00.000Z',revisions=[];
const schedule=Array.from({length:12},(_,index)=>`${2023+Math.floor(index/4)}-${String(1+(index%4)*3).padStart(2,'0')}-01T00:00:00.000Z`);
for(let opportunity=0;opportunity<300;opportunity++)for(const [type,count] of Object.entries({opportunities:12,
  commercial_conditions:6,commercial_outcome_requirements:6,commercial_dependencies:4,
  commercial_timing_assertions:4,commercial_evidence:3,commercial_commitments:3}))for(let number=1;number<=count;number++){
  const entityId=`${type}-${opportunity}`;revisions.push({id:`${type}-${opportunity}-${number}`,scope,entityType:type,entityId,
    revisionNo:number,mutationId:`mutation-${type}-${opportunity}-${number}`,operation:number===1?'baseline':'update',
    recordedAt:schedule[Math.floor((number-1)*12/count)],schemaVersion:1,state:{id:entityId,userId:scope,
      opportunityId:`opportunities-${opportunity}`,accountId:`account-${opportunity}`,createdAt:boundary,
      updatedAt:schedule[Math.floor((number-1)*12/count)],summary:`Representative commercial source ${type} at revision ${number}; buyer and seller context preserved.`}});
}
const rawHistory=JSON.stringify(revisions),storedHistory=encodeHistoricalStorage(rawHistory);
if(decodeHistoricalStorage(storedHistory)!==rawHistory)throw new Error('History compression did not round trip.');
const rollbackJournal=encodeHistoricalStorage(JSON.stringify({version:1,before:{'memoire.stateRevisions.v1':storedHistory}}));
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();await page.goto(base,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(({workspace,storedHistory,rollbackJournal})=>{
    localStorage.clear();
    const writes={
      'memoire.opportunities.v1':JSON.stringify(workspace.opportunities),
      'memoire.salesActivities.v1':JSON.stringify(workspace.activities),
      'memoire.accounts.v1':JSON.stringify(workspace.accounts),
      'memoire.quotes.v1':JSON.stringify(workspace.quotes),
      'memoire.opportunityOutcomes.v1':JSON.stringify(workspace.outcomes),
      'memoire.stateRevisions.v1':storedHistory,
      'memoire.historyCoverage.v1':JSON.stringify([{scope:'benchmark-owner',historyGuaranteedFrom:'2023-01-01T00:00:00.000Z',schemaVersion:1,lineageId:'benchmark'}]),
    };
    for(const [key,value] of Object.entries(writes))localStorage.setItem(key,value);
    const bytes=()=>Object.keys(localStorage).reduce((total,key)=>total+(key.length+(localStorage.getItem(key)||'').length)*2,0);
    const steadyBytes=bytes();localStorage.setItem('memoire.restoreJournal.v1',rollbackJournal);const rollbackPeakBytes=bytes();
    return {steadyBytes,rollbackPeakBytes};
  },{workspace,storedHistory,rollbackJournal});
  const limit=4.75*1024*1024;
  if(result.rollbackPeakBytes>limit)throw new Error(`Rollback peak ${result.rollbackPeakBytes} exceeds the conservative 4.75 MiB gate.`);
  console.log(JSON.stringify({opportunities:300,revisions:revisions.length,uncompressedHistoryBytes:Buffer.byteLength(rawHistory),
    compressedHistoryStorageBytes:storedHistory.length*2,steadyBrowserMebibytes:Number((result.steadyBytes/1024/1024).toFixed(2)),
    rollbackPeakMebibytes:Number((result.rollbackPeakBytes/1024/1024).toFixed(2)),browserWrite:'passed'}));
}finally{await browser.close();}
