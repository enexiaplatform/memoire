import { isCommercialDecision, type CommercialDecision } from '../../domain/commercialKernel/commercialDecision.ts';
import { loadForWorkspace, readLocal, writeLocal, syncRecordsForCurrentUser, type KernelCodec } from './kernelRepository.ts';
import { supabaseClient } from '../../lib/supabaseClient.ts';
import { reportKernelSyncFailure, sendOwedCloudRecords } from './kernelRepository.ts';
import { fetchAllRows } from '../supabasePaging.ts';

export const DECISION_STORAGE_KEY='memoire.commercialDecisions.v1';
export const DECISIONS_UPDATED_EVENT='memoire:commercial-decisions-updated';
const fields=['id','userId','accountId','opportunityId','question','context','basisSnapshot','options','selectedOptionId',
  'rationale','expectedConsequence','intervention','executionLinks','supersedesDecisionId','sourceType','decidedAt','createdAt','updatedAt'] as const;
const column=(field:string)=>field.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
export const decisionCodec:KernelCodec<CommercialDecision>={
  table:'commercial_decisions',storageKey:DECISION_STORAGE_KEY,updatedEvent:DECISIONS_UPDATED_EVENT,
  orderColumn:'decided_at',compare:(a,b)=>b.decidedAt.localeCompare(a.decidedAt)||a.id.localeCompare(b.id),
  sanitize:value=>isCommercialDecision(value)?{...Object.fromEntries(fields.map(f=>[f,value[f]??null])),...(value.isSample?{isSample:true}:{})} as CommercialDecision:null,
  toRow:(r,userId)=>{
    if(r.userId!==userId)throw new Error('Decision belongs to another workspace.');
    return {...Object.fromEntries(fields.map(f=>[column(f),r[f]??null])),user_id:userId};
  },
  fromRow:row=>decisionCodec.sanitize(Object.fromEntries(fields.map(f=>[f,row[column(f)]]))),
};
export const loadCommercialDecisions=()=>readLocal(decisionCodec);
export async function loadCommercialDecisionsForWorkspace(userId?:string|null,sampleDataActive=false){
  const records=await loadForWorkspace(decisionCodec,userId,sampleDataActive);
  return records.filter(r=>r.userId===(userId||null)&&Boolean(r.isSample)===sampleDataActive);
}
/** Opportunity view reads one scoped slice, not the entire decision corpus. */
export async function loadCommercialDecisionsForOpportunity(opportunityId:string,userId?:string|null,sampleDataActive=false){
  const local=loadCommercialDecisions().filter(r=>r.opportunityId===opportunityId&&r.userId===(userId||null)
    &&Boolean(r.isSample)===sampleDataActive);
  if(!userId||sampleDataActive||!supabaseClient)return local;
  try{
    const data=await fetchAllRows<Record<string,unknown>>((from,to)=>supabaseClient!.from('commercial_decisions').select('*').eq('user_id',userId)
      .eq('opportunity_id',opportunityId).order('decided_at',{ascending:false}).order('id',{ascending:true}).range(from,to) as never);
    const cloud=data.map(row=>decisionCodec.fromRow(row)).filter((r):r is CommercialDecision=>Boolean(r));
    const merged=new Map(cloud.map(r=>[r.id,r]));
    for(const record of local){const prior=merged.get(record.id);if(!prior||record.updatedAt>=prior.updatedAt)merged.set(record.id,record);}
    const result=[...merged.values()].sort(decisionCodec.compare);
    writeLocal(decisionCodec,[...result,...loadCommercialDecisions().filter(r=>r.opportunityId!==opportunityId||r.userId!==userId||r.isSample)],{requireDurable:false});
    sendOwedCloudRecords(decisionCodec,userId,result,cloud);
    return result;
  }catch(error){reportKernelSyncFailure('commercial_decisions','load',error);return local;}
}
export function saveCommercialDecision(record:CommercialDecision){
  const previous=loadCommercialDecisions().find(r=>r.id===record.id);
  if(previous&&JSON.stringify({...previous,executionLinks:[],updatedAt:''})!==JSON.stringify({...record,executionLinks:[],updatedAt:''}))
    throw new Error('Finalized decision and its basis cannot be rewritten.');
  writeLocal(decisionCodec,[record,...loadCommercialDecisions().filter(r=>r.id!==record.id)]);
  syncRecordsForCurrentUser(decisionCodec,[record]);
}
