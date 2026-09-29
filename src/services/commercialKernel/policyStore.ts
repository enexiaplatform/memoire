import {isCommercialPolicy,type CommercialPolicy} from '../../domain/commercialKernel/commercialPolicy.ts';
import type {KernelCodec} from './kernelRepository.ts';
import {versionedKernelStore} from './versionedKernelStore.ts';
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
const store=versionedKernelStore(policyCodec,'Policy');
export const loadCommercialPolicies=store.load;
export const loadCommercialPoliciesForWorkspace=store.loadForWorkspace;
export const syncPolicyVersions=store.sync;
export function saveCommercialPolicy(record:CommercialPolicy){
 const prior=store.load().find(row=>row.id===record.id);
 if(prior&&prior.opportunityId!==record.opportunityId)throw new Error('Policy Opportunity cannot change.');
 store.save(record);
}
