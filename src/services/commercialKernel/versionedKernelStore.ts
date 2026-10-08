import {writeLocal,upsertCloudRecords,reportKernelSyncFailure,type KernelCodec} from './kernelRepository.ts';
import {supabaseClient} from '../../lib/supabaseClient.ts';
import {fetchAllRows} from '../supabasePaging.ts';
import {HISTORICAL_REVISIONS_KEY,type StateRevision} from '../historicalIntegrity.ts';
import {decodeHistoricalStorage} from '../historicalStorageCodec.ts';
import {reportWorkspaceSyncError} from '../workspaceSyncStatus.ts';
type Versioned={id:string;userId:string|null;version:number;createdAt:string;updatedAt:string;isSample?:boolean};

// JSONB may return object keys in a different order. Arrays and values remain
// exact: ordering within a basis and an actual same-version edit still conflict.
function orderedJson(value:unknown):unknown{
 if(Array.isArray(value))return value.map(orderedJson);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>[key,orderedJson(entry)]));
 return value;
}

/** Strict publication sync over the existing Kernel repository and canonical Revisions. */
export function versionedKernelStore<T extends Versioned>(codec:KernelCodec<T>,label:string,beforeSync?:(records:T[])=>Promise<void>){
 let syncTail:Promise<void>=Promise.resolve();
 const same=(a:T,b:T)=>JSON.stringify(orderedJson(codec.toRow(a,a.userId!)))===JSON.stringify(orderedJson(codec.toRow(b,b.userId!)));
 function load():T[]{
  if(typeof window==='undefined')return [];
  const raw:unknown=JSON.parse(window.localStorage.getItem(codec.storageKey)||'[]');
  if(!Array.isArray(raw))throw new Error(`${label} records are unreadable. Keep a verified backup.`);
  const rows=raw.map(codec.sanitize);
  if(rows.some(row=>!row))throw new Error(`${label} records are unreadable. Keep a verified backup.`);
  const valid=rows as T[];
  if(new Set(valid.map(row=>row.id)).size!==valid.length)throw new Error(`${label} identities conflict. Keep a backup before editing.`);
  return valid.sort(codec.compare);
 }
 async function requireAccepted(local:T,userId:string){
  const revisions=await fetchAllRows<{state:Record<string,unknown>|null}>((from,to)=>supabaseClient!.from('commercial_state_revisions').select('state')
   .eq('user_id',userId).eq('entity_type',codec.table).eq('entity_id',local.id).order('revision_no',{ascending:true}).range(from,to) as never);
  const accepted=revisions.map(row=>row.state?codec.fromRow(row.state):null).find(row=>row?.version===local.version);
  if(!accepted||!same(accepted,local))throw new Error(`${label} account history conflicts with this browser. Keep a backup and reconcile the versions.`);
 }
 async function sync(records:T[]){
  const pending=records.filter(row=>row.userId&&!row.isSample);if(!pending.length||!supabaseClient)return;
  if(beforeSync)await beforeSync(pending);
  const {data:auth,error:authError}=await supabaseClient.auth.getUser();if(authError)throw new Error(authError.message);
  const userId=auth.user?.id;if(!userId)return;
  for(const record of pending.filter(row=>row.userId===userId)){
   const {data,error}=await supabaseClient.from(codec.table).select('*').eq('user_id',userId).eq('id',record.id).maybeSingle();
   if(error)throw new Error(error.message);const server=data?codec.fromRow(data):null;
   if(data&&!server)throw new Error(`${label} account record is unreadable.`);
   if(server&&server.version>=record.version){
    if(server.version===record.version&&!same(server,record))throw new Error(`${label} version conflicts with the account.`);
    if(server.version>record.version)await requireAccepted(record,userId);continue;
   }
   const revisions=JSON.parse(decodeHistoricalStorage(window.localStorage.getItem(HISTORICAL_REVISIONS_KEY)||'[]')) as StateRevision[];
   const states=new Map(revisions.filter(row=>row.scope===userId&&row.entityType===codec.table&&row.entityId===record.id)
    .map(row=>codec.sanitize(row.state)).filter((row):row is T=>Boolean(row)).map(row=>[row.version,row]));
   for(let version=(server?.version||0)+1;version<=record.version;version++){
    const state=states.get(version);if(!state)throw new Error(`${label} version is missing from local history. Keep the backup.`);
    await upsertCloudRecords(codec,userId,[state]);
   }
  }
 }
 function queue(records:T[]){syncTail=syncTail.then(()=>sync(records)).catch(error=>{
  reportWorkspaceSyncError(`${label} is saved in this browser; account versions have not synchronized.`);reportKernelSyncFailure(codec.table,'upsert',error);
 });}
 async function loadForWorkspace(userId?:string|null,sampleDataActive=false):Promise<T[]>{
  const all=load(),local=all.filter(row=>row.userId===(userId||null)&&Boolean(row.isSample)===sampleDataActive);
  if(!userId||sampleDataActive||!supabaseClient)return local;
  const rows=await fetchAllRows<Record<string,unknown>>((from,to)=>supabaseClient!.from(codec.table).select('*').eq('user_id',userId)
   .order(codec.orderColumn,{ascending:false}).order('id',{ascending:true}).range(from,to) as never);
  const cloud=rows.map(row=>{const record=codec.fromRow(row);if(!record||record.userId!==userId)throw new Error(`${label} account records are unreadable.`);return record;});
  const current=load(),merged=new Map(cloud.map(row=>[row.id,row]));
  for(const row of current.filter(row=>row.userId===userId&&!row.isSample)){
   const server=merged.get(row.id);
   if(server&&server.version===row.version&&!same(server,row))throw new Error(`${label} versions conflict between this browser and the account. Keep a backup.`);
   if(server&&server.version>row.version)await requireAccepted(row,userId);
   if(!server||row.version>server.version)merged.set(row.id,row);
  }
  const result=[...merged.values()].sort(codec.compare);
  if(JSON.stringify(load())!==JSON.stringify(current))throw new Error(`${label} changed during refresh. Reopen to read the latest versions.`);
  if(current.some(row=>(row.userId!==userId||row.isSample)&&merged.has(row.id)))throw new Error(`${label} identity conflicts with another browser workspace.`);
  writeLocal(codec,[...current.filter(row=>row.userId!==userId||row.isSample),...result]);
  const owed=result.filter(row=>!cloud.some(server=>server.id===row.id&&server.version>=row.version));if(owed.length)queue(owed);
  return result;
 }
 function save(record:T){
  const all=load(),prior=all.find(row=>row.id===record.id);
  if(prior&&(prior.userId!==record.userId||Boolean(prior.isSample)!==Boolean(record.isSample)||record.version!==prior.version+1
   ||record.createdAt!==prior.createdAt||record.updatedAt<=prior.updatedAt))throw new Error(`${label} version changed. Reload before saving.`);
  if(!prior&&record.version!==1)throw new Error(`A new ${label.toLowerCase()} starts at version 1.`);
  writeLocal(codec,[record,...all.filter(row=>row.id!==record.id)]);queue([record]);
 }
 return {load,loadForWorkspace,save,sync};
}
