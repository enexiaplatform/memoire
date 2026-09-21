import {isDecisionObservation,type DecisionObservation} from '../../domain/commercialKernel/decisionLearning.ts';
import {loadForWorkspace,readLocal,writeLocal,syncRecordsForCurrentUser,type KernelCodec,reportKernelSyncFailure,sendOwedCloudRecords} from './kernelRepository.ts';
import {supabaseClient} from '../../lib/supabaseClient.ts';
import {fetchAllRows} from '../supabasePaging.ts';

export const DECISION_OBSERVATION_STORAGE_KEY='memoire.decisionObservations.v1';
export const DECISION_OBSERVATIONS_UPDATED_EVENT='memoire:decision-observations-updated';
const fields=['id','userId','accountId','opportunityId','decisionId','observationCutoff','elapsedDays','snapshot','operatorNote','sourceType','finalizedAt','createdAt'] as const;
const column=(field:string)=>field.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
export const decisionObservationCodec:KernelCodec<DecisionObservation>={table:'commercial_decision_observations',
  storageKey:DECISION_OBSERVATION_STORAGE_KEY,updatedEvent:DECISION_OBSERVATIONS_UPDATED_EVENT,orderColumn:'observation_cutoff',
  compare:(a,b)=>b.observationCutoff.localeCompare(a.observationCutoff)||a.id.localeCompare(b.id),
  sanitize:value=>isDecisionObservation(value)?{...Object.fromEntries(fields.map(f=>[f,value[f]??null])),...(value.isSample?{isSample:true}:{})} as DecisionObservation:null,
  toRow:(record,userId)=>{if(record.userId!==userId)throw new Error('Decision Observation belongs to another workspace.');
    return {...Object.fromEntries(fields.map(f=>[column(f),record[f]??null])),user_id:userId};},
  fromRow:row=>decisionObservationCodec.sanitize(Object.fromEntries(fields.map(f=>[f,row[column(f)]]))),
};
export const loadDecisionObservations=()=>readLocal(decisionObservationCodec);
export async function loadDecisionObservationsForWorkspace(userId?:string|null,sampleDataActive=false){
  const records=await loadForWorkspace(decisionObservationCodec,userId,sampleDataActive);
  return records.filter(r=>r.userId===(userId||null)&&Boolean(r.isSample)===sampleDataActive);
}
export async function loadDecisionObservationsForOpportunity(opportunityId:string,userId?:string|null,sampleDataActive=false){
  const local=loadDecisionObservations().filter(r=>r.opportunityId===opportunityId&&r.userId===(userId||null)&&Boolean(r.isSample)===sampleDataActive);
  if(!userId||sampleDataActive||!supabaseClient)return local;
  try{
    const data=await fetchAllRows<Record<string,unknown>>((from,to)=>supabaseClient!.from('commercial_decision_observations').select('*').eq('user_id',userId)
      .eq('opportunity_id',opportunityId).order('observation_cutoff',{ascending:false}).order('id',{ascending:true}).range(from,to) as never);
    const cloud=data.map(row=>decisionObservationCodec.fromRow(row)).filter((r):r is DecisionObservation=>Boolean(r));
    const merged=new Map(cloud.map(r=>[r.id,r]));for(const record of local)if(!merged.has(record.id))merged.set(record.id,record);
    const result=[...merged.values()].sort(decisionObservationCodec.compare);
    writeLocal(decisionObservationCodec,[...result,...loadDecisionObservations().filter(r=>r.opportunityId!==opportunityId||r.userId!==userId||r.isSample)],{requireDurable:false});
    sendOwedCloudRecords(decisionObservationCodec,userId,result,cloud);return result;
  }catch(error){reportKernelSyncFailure('commercial_decision_observations','load',error);return local;}
}
export function saveDecisionObservation(record:DecisionObservation){
  const previous=loadDecisionObservations().find(row=>row.id===record.id);
  if(previous&&JSON.stringify(previous)!==JSON.stringify(record))throw new Error('Finalized Decision Observation cannot be rewritten.');
  if(previous){syncRecordsForCurrentUser(decisionObservationCodec,[previous]);return previous;}
  writeLocal(decisionObservationCodec,[record,...loadDecisionObservations()]);syncRecordsForCurrentUser(decisionObservationCodec,[record]);return record;
}
