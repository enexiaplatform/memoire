import {isCommercialMoneyGate,type CommercialMoneyGate} from '../../domain/commercialKernel/moneyGate.ts';
import {readLocal,writeLocal,loadForWorkspace,syncRecordsForCurrentUser,type KernelCodec} from './kernelRepository.ts';
export const MONEY_GATE_STORAGE_KEY='memoire.commercialMoneyGates.v1';
export const MONEY_GATE_UPDATED_EVENT='memoire:commercial-money-gates-updated';
const fields=['id','userId','opportunityId','moneySourceType','moneySourceId','requirementId','basisKind','basis','lifecycle',
  'createdAt','updatedAt','sourceType','sourceId','sourceUrl','sourceUpdatedAt'] as const;
const column=(field:string)=>field.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
export const moneyGateCodec:KernelCodec<CommercialMoneyGate>={
  table:'commercial_money_gates',storageKey:MONEY_GATE_STORAGE_KEY,updatedEvent:MONEY_GATE_UPDATED_EVENT,
  orderColumn:'updated_at',compare:(a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.id.localeCompare(b.id),
  sanitize:value=>isCommercialMoneyGate(value)?{...Object.fromEntries(fields.map(field=>[field,value[field]??null])),
    ...(value.isSample?{isSample:true}:{})} as CommercialMoneyGate:null,
  toRow:(row,userId)=>{if(row.userId!==userId)throw new Error('Money Gate belongs to another workspace.');
    return {...Object.fromEntries(fields.map(field=>[column(field),row[field]??null])),user_id:userId};},
  fromRow:row=>moneyGateCodec.sanitize(Object.fromEntries(fields.map(field=>[field,row[column(field)]]))),
};
export const loadCommercialMoneyGates=()=>readLocal(moneyGateCodec);
export async function loadCommercialMoneyGatesForWorkspace(userId?:string|null,sampleDataActive=false){
  const rows=await loadForWorkspace(moneyGateCodec,userId,sampleDataActive);
  return rows.filter(row=>row.userId===(userId||null)&&Boolean(row.isSample)===sampleDataActive);
}
export function saveCommercialMoneyGate(row:CommercialMoneyGate){
  writeLocal(moneyGateCodec,[row,...loadCommercialMoneyGates().filter(item=>item.id!==row.id)]);
  syncRecordsForCurrentUser(moneyGateCodec,[row]);
}
