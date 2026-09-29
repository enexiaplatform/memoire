import {isContractObligation,type ContractObligation} from '../../domain/commercialKernel/contractObligation.ts';
import type {KernelCodec} from './kernelRepository.ts';
import {versionedKernelStore} from './versionedKernelStore.ts';
export const CONTRACT_OBLIGATION_STORAGE_KEY='memoire.contractObligations.v1';
export const CONTRACT_OBLIGATION_UPDATED_EVENT='memoire:contract-obligations-updated';
const fields=['id','userId','opportunityId','version','contractReference','contractVersion','acceptedOn','acceptanceReference','clause','requirementId','commitmentId','revisionReason','lifecycle','sourceType','createdAt','updatedAt'] as const;
const column=(field:string)=>field.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
export const contractObligationCodec:KernelCodec<ContractObligation>={table:'commercial_contract_obligations',storageKey:CONTRACT_OBLIGATION_STORAGE_KEY,updatedEvent:CONTRACT_OBLIGATION_UPDATED_EVENT,
  orderColumn:'updated_at',compare:(a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id),
  sanitize:value=>isContractObligation(value)?{...Object.fromEntries(fields.map(field=>[field,value[field]])),...(value.isSample?{isSample:true}:{})} as ContractObligation:null,
  toRow:(record,userId)=>{if(record.userId!==userId)throw new Error('Contract obligation belongs to another workspace.');
    return Object.fromEntries(fields.map(field=>[column(field),record[field]]));},
  fromRow:row=>{const record=Object.fromEntries(fields.map(field=>[field,row[column(field)]]));
    for(const field of ['createdAt','updatedAt'])if(typeof record[field]==='string'&&Number.isFinite(Date.parse(record[field] as string)))record[field]=new Date(record[field] as string).toISOString();
    return contractObligationCodec.sanitize(record);},
};
const store=versionedKernelStore(contractObligationCodec,'Contract obligation');
export const loadContractObligations=store.load;
export const loadContractObligationsForWorkspace=store.loadForWorkspace;
export const syncContractObligationVersions=store.sync;
export function saveContractObligation(record:ContractObligation){
 const prior=store.load().find(row=>row.id===record.id);
 if(prior&&(prior.opportunityId!==record.opportunityId||prior.contractReference!==record.contractReference||prior.contractVersion!==record.contractVersion||prior.acceptedOn!==record.acceptedOn||prior.acceptanceReference!==record.acceptanceReference))throw new Error('Contract obligation Opportunity cannot change.');
 store.save(record);
}
