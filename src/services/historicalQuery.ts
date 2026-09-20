import { supabaseClient } from '../lib/supabaseClient.ts';
import { fetchAllRows } from './supabasePaging.ts';
import { historicalSources, readLocalHistoryAt, type HistoricalSource, type HistoryRead,
  type StateRevision, type HistoryCoverage, validateHistoricalBundle,
  HISTORICAL_COVERAGE_KEY,HISTORICAL_REVISIONS_KEY } from './historicalIntegrity.ts';

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
  const coverage:HistoryCoverage={scope:userId,historyGuaranteedFrom:String(marker.history_guaranteed_from),schemaVersion:1,
    lineageId:typeof marker.lineage_id==='string'?marker.lineage_id:undefined};
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

export type HistoricalSourceComposition={status:'verified';coverage:HistoryCoverage;
  records:Record<HistoricalSource,Record<string,unknown>[]>;selectedRevisions:StateRevision[];metadataInferred:boolean}
  |{status:'not_activated'|'pre_coverage'|'corrupt'|'unsupported_schema';coverage:HistoryCoverage|null};
const emptySources=():Record<HistoricalSource,Record<string,unknown>[]>=>Object.fromEntries(
  Object.keys(historicalSources).map(type=>[type,[]])) as unknown as Record<HistoricalSource,Record<string,unknown>[]>;

/** Batched source composition only. M8 will own presentation and derived views. */
export function composeHistoricalSourcesAt(revisions:StateRevision[],markers:HistoryCoverage[],scope:string,
  cutoff:string):HistoricalSourceComposition{
  const marker=markers.find(item=>item.scope===scope)||null;
  if(!marker)return {status:'not_activated',coverage:null};
  if(marker.schemaVersion!==1)return {status:'unsupported_schema',coverage:marker};
  const at=Date.parse(cutoff);
  if(!Number.isFinite(at)||!Number.isFinite(Date.parse(marker.historyGuaranteedFrom)))return {status:'corrupt',coverage:marker};
  if(at<Date.parse(marker.historyGuaranteedFrom))return {status:'pre_coverage',coverage:marker};
  try{
    const rows=revisions.filter(row=>row.scope===scope);
    validateHistoricalBundle(rows,[marker],{});
    const latest=new Map<string,StateRevision>();
    for(const row of rows.sort((a,b)=>a.revisionNo-b.revisionNo)){
      if(Date.parse(row.recordedAt)<=at)latest.set(`${row.entityType}:${row.entityId}`,row);
    }
    const records=emptySources();
    const selectedRevisions=[...latest.values()].filter(row=>row.state!==null);
    let metadataInferred=false;
    for(const row of selectedRevisions){
      const state=row.state!;
      // M7.1 snapshots omitted updatedAt. It is validation metadata, not a
      // commercial fact; use the known creation instant only for validators.
      if(!state.updatedAt){metadataInferred=true;records[row.entityType].push({...state,
        updatedAt:typeof state.createdAt==='string'?state.createdAt:row.recordedAt});}
      else records[row.entityType].push(state);
    }
    return {status:'verified',coverage:marker,records,selectedRevisions,metadataInferred};
  }catch{return {status:'corrupt',coverage:marker};}
}

export function getLocalHistoricalSourcesAt(scope:string,cutoff:string,storage:Storage):HistoricalSourceComposition{
  try{
    return composeHistoricalSourcesAt(
      JSON.parse(storage.getItem(HISTORICAL_REVISIONS_KEY)||'[]') as StateRevision[],
      JSON.parse(storage.getItem(HISTORICAL_COVERAGE_KEY)||'[]') as HistoryCoverage[],scope,cutoff);
  }catch{return {status:'corrupt',coverage:null};}
}

/** One paginated history read for the scope, never one request per entity. */
export async function getCloudHistoricalSourcesAt(scope:string,cutoff:string):Promise<HistoricalSourceComposition>{
  if(!supabaseClient)return {status:'not_activated',coverage:null};
  const {data:marker,error}=await supabaseClient.from('commercial_history_coverage').select('*').eq('user_id',scope).maybeSingle();
  if(error)throw new Error(error.message);
  if(!marker)return {status:'not_activated',coverage:null};
  const coverage:HistoryCoverage={scope,historyGuaranteedFrom:String(marker.history_guaranteed_from),
    schemaVersion:marker.schema_version,lineageId:marker.lineage_id};
  if(Date.parse(cutoff)<Date.parse(coverage.historyGuaranteedFrom))return {status:'pre_coverage',coverage};
  const raw=await fetchAllRows<Record<string,unknown>>((from,to)=>supabaseClient!.from('commercial_state_revisions').select('*')
    .eq('user_id',scope).order('entity_type',{ascending:true}).order('entity_id',{ascending:true})
    .order('revision_no',{ascending:true}).range(from,to) as never);
  const decoded:StateRevision[]=[];
  for(const row of raw){
    if(row.schema_version!==1)return {status:'unsupported_schema',coverage};
    const value=decodeCloudRevision(row);if(!value)return {status:'corrupt',coverage};decoded.push(value);
  }
  return composeHistoricalSourcesAt(decoded,[coverage],scope,cutoff);
}
