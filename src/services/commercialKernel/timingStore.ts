import { isCommercialTimingAssertion, type CommercialTimingAssertion } from '../../domain/commercialKernel/commercialTiming.ts';
import { readLocal, writeLocal, loadForWorkspace, syncRecordsForCurrentUser, type KernelCodec } from './kernelRepository.ts';

export const TIMING_STORAGE_KEY = 'memoire.commercialTiming.v1';
export const TIMING_UPDATED_EVENT = 'memoire:commercial-timing-updated';
const fields = ['id','userId','opportunityId','requirementId','kind','basis','lifecycle','durationDays','durationUnit',
  'epistemic','sourceKind','sourceReference','evidenceId','commitmentId','sourceType','createdAt','updatedAt'] as const;
const column = (field:string) => field.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
export const timingCodec: KernelCodec<CommercialTimingAssertion> = {
  table:'commercial_timing_assertions',storageKey:TIMING_STORAGE_KEY,updatedEvent:TIMING_UPDATED_EVENT,
  orderColumn:'updated_at',compare:(a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.id.localeCompare(b.id),
  sanitize:value=>isCommercialTimingAssertion(value)
    ? {...Object.fromEntries(fields.map(f=>[f,value[f]??null])),...(value.isSample?{isSample:true}:{})} as CommercialTimingAssertion : null,
  toRow:(r,userId)=>{
    if(r.userId!==userId) throw new Error('Timing assertion belongs to another workspace.');
    return {...Object.fromEntries(fields.map(f=>[column(f),r[f]??null])),user_id:userId};
  },
  fromRow:row=>timingCodec.sanitize(Object.fromEntries(fields.map(f=>[f,row[column(f)]]))),
};
export const loadCommercialTiming = () => readLocal(timingCodec);
export async function loadCommercialTimingForWorkspace(userId?:string|null,sampleDataActive=false){
  const records=await loadForWorkspace(timingCodec,userId,sampleDataActive);
  return records.filter(r=>r.userId===(userId||null)&&Boolean(r.isSample)===sampleDataActive);
}
export function saveCommercialTiming(record:CommercialTimingAssertion){
  writeLocal(timingCodec,[record,...loadCommercialTiming().filter(r=>r.id!==record.id)]);
  syncRecordsForCurrentUser(timingCodec,[record]);
}
