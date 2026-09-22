import {performance} from 'node:perf_hooks';
import {composeHistoricalSourcesAt} from '../src/services/historicalQuery.ts';
import {buildRestorePlan,parseBackupFile,BACKUP_FORMAT_VERSION} from '../src/utils/workspaceBackup.ts';
import {HISTORICAL_COVERAGE_KEY,HISTORICAL_REVISIONS_KEY} from '../src/services/historicalIntegrity.ts';

const scope='benchmark-owner';
const boundary='2023-01-01T00:00:00.000Z';
const markers=[{scope,historyGuaranteedFrom:boundary,schemaVersion:1}];
const revisions=[];
const schedule=Array.from({length:12},(_,index)=>`${2023+Math.floor(index/4)}-${String(1+(index%4)*3).padStart(2,'0')}-01T00:00:00.000Z`);
for(let opportunity=0;opportunity<300;opportunity++){
  for(const [type,count] of Object.entries({opportunities:12,commercial_conditions:6,
    commercial_outcome_requirements:6,commercial_dependencies:4,
    commercial_timing_assertions:4,commercial_evidence:3,commercial_commitments:3})){
    for(let number=1;number<=count;number++){
      const entityId=`${type}-${opportunity}`;
      revisions.push({id:`${type}-${opportunity}-${number}`,scope,entityType:type,entityId,revisionNo:number,
        mutationId:`mutation-${type}-${opportunity}-${number}`,operation:number===1?'baseline':'update',
        recordedAt:schedule[Math.floor((number-1)*12/count)],schemaVersion:1,
        state:{id:entityId,userId:scope,opportunityId:`opportunities-${opportunity}`,accountId:`account-${opportunity}`,
          createdAt:boundary,updatedAt:schedule[Math.floor((number-1)*12/count)],
          summary:`Representative commercial source ${type} at revision ${number}; buyer and seller context preserved.`}});
    }
  }
}
const bytes=Buffer.byteLength(JSON.stringify(revisions));
const started=performance.now();
const result=composeHistoricalSourcesAt(revisions,markers,scope,'2025-12-31T23:59:59.000Z');
const milliseconds=performance.now()-started;
if(result.status!=='verified'||result.selectedRevisions.length!==2100)throw new Error('Benchmark composition failed');
const envelope={exportedAt:'2026-09-22T00:00:00.000Z',formatVersion:BACKUP_FORMAT_VERSION,mode:'local-only',
  localBrowserData:{[HISTORICAL_COVERAGE_KEY]:markers,[HISTORICAL_REVISIONS_KEY]:revisions}};
let backupStarted=performance.now();const backup=JSON.stringify(envelope);const backupGenerationMs=performance.now()-backupStarted;
backupStarted=performance.now();const parsed=parseBackupFile(backup);const backupValidationMs=performance.now()-backupStarted;
if(!parsed.ok)throw new Error(`Benchmark backup validation failed: ${parsed.message}`);
backupStarted=performance.now();const restore=buildRestorePlan(parsed.envelope);const restorePlanningMs=performance.now()-backupStarted;
if(restore.restoredRecords!==revisions.length+markers.length)throw new Error('Benchmark restore plan lost historical records');
console.log(JSON.stringify({opportunities:300,years:3,revisions:revisions.length,bytes,
  mebibytes:Number((bytes/1024/1024).toFixed(2)),compositionMs:Number(milliseconds.toFixed(1)),
  selectedRecords:result.selectedRevisions.length,backupBytes:Buffer.byteLength(backup),
  backupGenerationMs:Number(backupGenerationMs.toFixed(1)),backupValidationMs:Number(backupValidationMs.toFixed(1)),
  restorePlanningMs:Number(restorePlanningMs.toFixed(1))}));
