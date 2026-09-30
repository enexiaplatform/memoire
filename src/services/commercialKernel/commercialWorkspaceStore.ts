import {isCommercialWorkspace,type CommercialWorkspace} from '../../domain/commercialKernel/commercialWorkspace.ts';
import {versionedKernelStore} from './versionedKernelStore.ts';
import type {KernelCodec} from './kernelRepository.ts';
const fields=['id','userId','version','name','members','commitmentIds','lifecycle','revisionReason','sourceType','createdAt','updatedAt'] as const;
const column=(field:string)=>field.replace(/[A-Z]/g,letter=>'_'+letter.toLowerCase());
export const commercialWorkspaceCodec:KernelCodec<CommercialWorkspace>={table:'commercial_workspaces',storageKey:'memoire.commercialWorkspaces.v1',updatedEvent:'memoire:commercial-workspaces-updated',orderColumn:'updated_at',compare:(a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id),
 sanitize:value=>isCommercialWorkspace(value)?{...Object.fromEntries(fields.map(field=>[field,value[field]])),...(value.isSample?{isSample:true}:{})} as CommercialWorkspace:null,
 toRow:(record,userId)=>{if(record.userId!==userId)throw new Error('Workspace belongs to another owner.');return Object.fromEntries(fields.map(field=>[column(field),record[field]]));},
 fromRow:row=>{const record=Object.fromEntries(fields.map(field=>[field,row[column(field)]]));for(const field of ['createdAt','updatedAt'])if(typeof record[field]==='string'&&Number.isFinite(Date.parse(record[field] as string)))record[field]=new Date(record[field] as string).toISOString();return commercialWorkspaceCodec.sanitize(record);},
};
const store=versionedKernelStore(commercialWorkspaceCodec,'Shared workspace');
export const loadCommercialWorkspaces=store.load;
export const loadCommercialWorkspacesForOwner=store.loadForWorkspace;
export const saveCommercialWorkspace=store.save;
