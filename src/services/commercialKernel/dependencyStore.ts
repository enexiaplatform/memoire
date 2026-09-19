import { isCommercialDependency, type CommercialDependency } from '../../domain/commercialKernel/commercialDependency.ts';
import { readLocal, writeLocal, loadForWorkspace, syncRecordsForCurrentUser, type KernelCodec } from './kernelRepository.ts';
export const DEPENDENCY_STORAGE_KEY='memoire.commercialDependencies.v1';
export const DEPENDENCY_UPDATED_EVENT='memoire:commercial-dependencies-updated';
const fields=['id','userId','opportunityId','dependentRequirementId','prerequisiteRequirementId','basis','lifecycle','createdAt','updatedAt','sourceType','sourceId','sourceUrl','sourceUpdatedAt'] as const;
const column=(field:string)=>field.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
export const dependencyCodec:KernelCodec<CommercialDependency>={
  table:'commercial_dependencies',storageKey:DEPENDENCY_STORAGE_KEY,updatedEvent:DEPENDENCY_UPDATED_EVENT,
  orderColumn:'updated_at',compare:(a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.id.localeCompare(b.id),
  sanitize:value=>isCommercialDependency(value)?{...Object.fromEntries(fields.map(f=>[f,value[f]??null])),...(value.isSample?{isSample:true}:{})} as CommercialDependency:null,
  toRow:(r,userId)=>{
    if(r.userId!==userId) throw new Error('Dependency belongs to another workspace.');
    return {...Object.fromEntries(fields.map(f=>[column(f),r[f]??null])),user_id:userId};
  },
  fromRow:row=>dependencyCodec.sanitize(Object.fromEntries(fields.map(f=>[f,row[column(f)]]))),
};
export const loadCommercialDependencies=()=>readLocal(dependencyCodec);
export async function loadCommercialDependenciesForWorkspace(userId?:string|null,sampleDataActive=false){
  const records=await loadForWorkspace(dependencyCodec,userId,sampleDataActive);
  return records.filter(r=>r.userId===(userId||null)&&Boolean(r.isSample)===sampleDataActive);
}
export function saveCommercialDependency(record:CommercialDependency){
  writeLocal(dependencyCodec,[record,...loadCommercialDependencies().filter(r=>r.id!==record.id)]);
  syncRecordsForCurrentUser(dependencyCodec,[record]);
}
