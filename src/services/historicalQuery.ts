import { supabaseClient } from '../lib/supabaseClient.ts';
import { fetchAllRows } from './supabasePaging.ts';
import { historicalSources, readLocalHistoryAt, type HistoricalSource, type HistoryRead,
  type StateRevision, type HistoryCoverage } from './historicalIntegrity.ts';

const camel=(value:string)=>value.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase());
function decodeCloudRevision(row:Record<string,unknown>):StateRevision|null{
  if(row.schema_version!==1||typeof row.entity_type!=='string'||!(row.entity_type in historicalSources))return null;
  if(!row.state&&row.operation!=='delete')return null;
  const state=row.state&&typeof row.state==='object'&&!Array.isArray(row.state)
    ?Object.fromEntries(Object.entries(row.state as Record<string,unknown>).map(([key,value])=>[camel(key),value])):null;
  return {id:String(row.id),scope:String(row.user_id),entityType:row.entity_type as HistoricalSource,
    entityId:String(row.entity_id),revisionNo:Number(row.revision_no),mutationId:String(row.mutation_id),
    operation:row.operation as StateRevision['operation'],recordedAt:String(row.recorded_at),schemaVersion:1,state};
}
/** Low-level cutoff read only; it does not compose an Opportunity or run M8 derivations. */
export async function getCloudEntityRevisionAt(type:HistoricalSource,entityId:string,userId:string,cutoff:string):Promise<HistoryRead>{
  const cutoffTime=Date.parse(cutoff);
  if(!Number.isFinite(cutoffTime))return {status:'corrupt',revision:null,coverage:null};
  if(!supabaseClient)return {status:'not_activated',revision:null,coverage:null};
  const {data:marker,error:markerError}=await supabaseClient.from('commercial_history_coverage').select('*').eq('user_id',userId).maybeSingle();
  if(markerError)throw new Error(markerError.message);
  if(!marker)return {status:'not_activated',revision:null,coverage:null};
  const coverage:HistoryCoverage={scope:userId,historyGuaranteedFrom:String(marker.history_guaranteed_from),schemaVersion:1};
  if(marker.schema_version!==1)return {status:'unsupported_schema',revision:null,coverage};
  if(cutoffTime<Date.parse(coverage.historyGuaranteedFrom))return {status:'pre_coverage',revision:null,coverage};
  const raw=await fetchAllRows<Record<string,unknown>>((from,to)=>supabaseClient!.from('commercial_state_revisions').select('*')
    .eq('user_id',userId).eq('entity_type',type).eq('entity_id',entityId)
    .order('revision_no',{ascending:true}).range(from,to) as never);
  const revisions:StateRevision[]=[];
  for(const row of raw){
    if(row.schema_version!==1)return {status:'unsupported_schema',revision:null,coverage};
    const decoded=decodeCloudRevision(row);if(!decoded)return {status:'corrupt',revision:null,coverage};
    if(decoded.revisionNo!==revisions.length+1)return {status:'sequence_gap',revision:null,coverage};
    if(!Number.isFinite(Date.parse(decoded.recordedAt))
      ||revisions.length&&decoded.recordedAt<revisions.at(-1)!.recordedAt)return {status:'corrupt',revision:null,coverage};
    revisions.push(decoded);
  }
  return {status:'available',revision:revisions.filter(r=>Date.parse(r.recordedAt)<=cutoffTime).at(-1)||null,coverage};
}
export {readLocalHistoryAt};
