import {isCommercialPolicy,type CommercialPolicy} from '../../domain/commercialKernel/commercialPolicy.ts';
import {writeLocal,upsertCloudRecords,reportKernelSyncFailure,type KernelCodec} from './kernelRepository.ts';
import {supabaseClient} from '../../lib/supabaseClient.ts';
import {fetchAllRows} from '../supabasePaging.ts';
import {HISTORICAL_REVISIONS_KEY,type StateRevision} from '../historicalIntegrity.ts';
import {decodeHistoricalStorage} from '../historicalStorageCodec.ts';
import {reportWorkspaceSyncError} from '../workspaceSyncStatus.ts';

export const POLICY_STORAGE_KEY='memoire.commercialPolicies.v1';
export const POLICY_UPDATED_EVENT='memoire:commercial-policies-updated';
const fields=['id','userId','opportunityId','version','title','rationale','requirementId','appliesWhen','amount','currency','lifecycle','sourceType','createdAt','updatedAt'] as const;
const column=(field:string)=>field==='appliesWhen'?'applies_when':field.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
export const policyCodec:KernelCodec<CommercialPolicy>={table:'commercial_policies',storageKey:POLICY_STORAGE_KEY,updatedEvent:POLICY_UPDATED_EVENT,
  orderColumn:'updated_at',compare:(a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id),
  sanitize:value=>isCommercialPolicy(value)?{...Object.fromEntries(fields.map(field=>[field,value[field]])),...(value.isSample?{isSample:true}:{})} as CommercialPolicy:null,
  toRow:(record,userId)=>{if(record.userId!==userId)throw new Error('Policy belongs to another workspace.');
    return Object.fromEntries(fields.map(field=>[column(field),record[field]]));},
  fromRow:row=>{const record=Object.fromEntries(fields.map(field=>[field,row[column(field)]]));
    for(const field of ['createdAt','updatedAt'])if(typeof record[field]==='string'&&Number.isFinite(Date.parse(record[field] as string)))record[field]=new Date(record[field] as string).toISOString();
    return policyCodec.sanitize(record);},
};
/** Never turn corruption into an empty policy set. */
export function loadCommercialPolicies():CommercialPolicy[]{
  if(typeof window==='undefined')return [];
  const rows:unknown=JSON.parse(window.localStorage.getItem(POLICY_STORAGE_KEY)||'[]');
  if(!Array.isArray(rows)||rows.some(row=>!isCommercialPolicy(row)))throw new Error('Policy records are unreadable. Restore a verified backup before changing rules.');
  if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('Policy identities conflict. Keep a backup before changing rules.');
  return rows.map(row=>policyCodec.sanitize(row)!).sort(policyCodec.compare);
}
export async function loadCommercialPoliciesForWorkspace(userId?:string|null,sampleDataActive=false){
  const all=loadCommercialPolicies();
  const local=all.filter(row=>row.userId===(userId||null)&&Boolean(row.isSample)===sampleDataActive);
  if(!userId||sampleDataActive||!supabaseClient)return local;
  const rows=await fetchAllRows<Record<string,unknown>>((from,to)=>supabaseClient!.from('commercial_policies').select('*')
    .eq('user_id',userId).order('updated_at',{ascending:false}).order('id',{ascending:true}).range(from,to) as never);
  const cloud=rows.map(row=>{const policy=policyCodec.fromRow(row);if(!policy||policy.userId!==userId)throw new Error('Account policy records are unreadable.');return policy;});
  // Re-read after the request so a human's in-flight local edit cannot disappear.
  const current=loadCommercialPolicies();
  const merged=new Map(cloud.map(row=>[row.id,row]));
  for(const row of current.filter(row=>row.userId===userId&&!row.isSample)){
    const server=merged.get(row.id);
    if(server&&server.version===row.version&&JSON.stringify(policyCodec.toRow(server,userId))!==JSON.stringify(policyCodec.toRow(row,userId)))
      throw new Error('Policy versions conflict between this browser and the account. Keep a backup and resolve the conflict before publishing.');
    if(server&&server.version>row.version)await requireAcceptedPolicyVersion(row,userId);
    if(!server||row.version>server.version)merged.set(row.id,row);
  }
  const result=[...merged.values()].sort(policyCodec.compare);
  if(JSON.stringify(loadCommercialPolicies())!==JSON.stringify(current))throw new Error('Policy records changed during refresh. Reopen the Opportunity to read the latest versions.');
  if(current.some(row=>(row.userId!==userId||row.isSample)&&merged.has(row.id)))throw new Error('Policy identity conflicts with another browser workspace. Keep a backup.');
  writeLocal(policyCodec,[...current.filter(row=>row.userId!==userId||row.isSample),...result]);
  const owed=result.filter(row=>!cloud.some(server=>server.id===row.id&&server.version>=row.version));
  if(owed.length)queuePolicySync(owed);
  return result;
}
export function saveCommercialPolicy(record:CommercialPolicy){
  const all=loadCommercialPolicies();
  const prior=all.find(row=>row.id===record.id);
  if(prior&&(prior.userId!==record.userId||Boolean(prior.isSample)!==Boolean(record.isSample)||prior.opportunityId!==record.opportunityId
    ||record.version!==prior.version+1||record.createdAt!==prior.createdAt||record.updatedAt<=prior.updatedAt))throw new Error('Policy version changed. Reload before publishing.');
  if(!prior&&record.version!==1)throw new Error('A new policy starts at version 1.');
  writeLocal(policyCodec,[record,...all.filter(row=>row.id!==record.id)]);
  queuePolicySync([record]);
}

let syncTail:Promise<void>=Promise.resolve();
function queuePolicySync(records:CommercialPolicy[]){
  syncTail=syncTail.then(()=>syncPolicyVersions(records)).catch(error=>{
    reportWorkspaceSyncError('Policy is saved in this browser; account versions have not synchronized.');
    reportKernelSyncFailure('commercial_policies','upsert',error);
  });
}
/** Replay published states in version order through the existing repository; offline edits keep their audit trail. */
export async function syncPolicyVersions(records:CommercialPolicy[]){
  const pending=records.filter(row=>row.userId&&!row.isSample);
  if(!pending.length||!supabaseClient)return;
  const {data:auth,error:authError}=await supabaseClient.auth.getUser();
  if(authError)throw new Error(authError.message);
  const userId=auth.user?.id;if(!userId)return;
  for(const record of pending.filter(row=>row.userId===userId)){
    const {data,error}=await supabaseClient.from('commercial_policies').select('*').eq('user_id',userId).eq('id',record.id).maybeSingle();
    if(error)throw new Error(error.message);
    const server=data?policyCodec.fromRow(data):null;
    if(data&&!server)throw new Error('Account policy is unreadable.');
    if(server&&server.version>=record.version){
      if(server.version===record.version&&JSON.stringify(server)!==JSON.stringify(policyCodec.sanitize(record)))throw new Error('Account policy version conflicts with this browser.');
      if(server.version>record.version)await requireAcceptedPolicyVersion(record,userId);
      continue;
    }
    const revisions=JSON.parse(decodeHistoricalStorage(window.localStorage.getItem(HISTORICAL_REVISIONS_KEY)||'[]')) as StateRevision[];
    const states=new Map(revisions.filter(row=>row.scope===userId&&row.entityType==='commercial_policies'&&row.entityId===record.id)
      .map(row=>policyCodec.sanitize(row.state)).filter((row):row is CommercialPolicy=>Boolean(row)).map(row=>[row.version,row]));
    for(let version=(server?.version||0)+1;version<=record.version;version++){
      const state=states.get(version);if(!state)throw new Error('A published policy version is missing from local history. Keep the backup.');
      await upsertCloudRecords(policyCodec,userId,[state]);
    }
  }
}

async function requireAcceptedPolicyVersion(local:CommercialPolicy,userId:string){
  const revisions=await fetchAllRows<{state:Record<string,unknown>|null}>((from,to)=>supabaseClient!.from('commercial_state_revisions').select('state')
    .eq('user_id',userId).eq('entity_type','commercial_policies').eq('entity_id',local.id).order('revision_no',{ascending:true}).range(from,to) as never);
  const accepted=revisions.map(row=>row.state?policyCodec.fromRow(row.state):null).find(row=>row?.version===local.version);
  if(!accepted||JSON.stringify(policyCodec.toRow(accepted,userId))!==JSON.stringify(policyCodec.toRow(local,userId)))
    throw new Error('A newer account policy conflicts with the version in this browser. Keep a backup and reconcile the published versions.');
}
