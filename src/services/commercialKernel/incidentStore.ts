import {isCommercialIncident,type CommercialIncident} from '../../domain/commercialKernel/commercialIncident.ts';
import type {KernelCodec} from './kernelRepository.ts';
import {versionedKernelStore} from './versionedKernelStore.ts';
import {loadCommercialPolicies,syncPolicyVersions} from './policyStore.ts';
export const INCIDENT_STORAGE_KEY='memoire.commercialIncidents.v1';
export const INCIDENT_UPDATED_EVENT='memoire:commercial-incidents-updated';
const fields=['version','id','userId','opportunityId','policyId','summary','materialImpact','coordinator','responseNote','status','disposition','basisSnapshot','sourceType','createdAt','updatedAt','closedAt'] as const;
const column=(field:string)=>field.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
export const incidentCodec:KernelCodec<CommercialIncident>={table:'commercial_incidents',storageKey:INCIDENT_STORAGE_KEY,updatedEvent:INCIDENT_UPDATED_EVENT,
 orderColumn:'updated_at',compare:(a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id),
 sanitize:value=>isCommercialIncident(value)?{...Object.fromEntries(fields.map(f=>[f,value[f]])),...(value.isSample?{isSample:true}:{})} as CommercialIncident:null,
 toRow:(record,userId)=>{if(record.userId!==userId)throw new Error('Incident belongs to another workspace.');return Object.fromEntries(fields.map(f=>[column(f),record[f]]));},
 fromRow:row=>{const record=Object.fromEntries(fields.map(f=>[f,row[column(f)]]));
  for(const f of ['createdAt','updatedAt','closedAt'])if(typeof record[f]==='string'&&Number.isFinite(Date.parse(record[f] as string)))record[f]=new Date(record[f] as string).toISOString();
  return incidentCodec.sanitize(record);},
};
const store=versionedKernelStore(incidentCodec,'Incident',async records=>{
 const ids=new Set(records.map(row=>row.policyId));await syncPolicyVersions(loadCommercialPolicies().filter(row=>ids.has(row.id)));
});
export const loadCommercialIncidents=store.load;
export const loadCommercialIncidentsForWorkspace=store.loadForWorkspace;
export const syncIncidentVersions=store.sync;
export function saveCommercialIncident(record:CommercialIncident){
 const all=loadCommercialIncidents(),prior=all.find(row=>row.id===record.id);
 if(prior&&(prior.userId!==record.userId||Boolean(prior.isSample)!==Boolean(record.isSample)||prior.opportunityId!==record.opportunityId
  ||prior.policyId!==record.policyId||prior.createdAt!==record.createdAt||JSON.stringify(prior.basisSnapshot)!==JSON.stringify(record.basisSnapshot)
  ||prior.summary!==record.summary||prior.materialImpact!==record.materialImpact||prior.status==='closed'||record.updatedAt<=prior.updatedAt))
  throw new Error('Incident identity, opening basis or closed history cannot be rewritten.');
 if(record.status==='open'&&all.some(row=>row.id!==record.id&&row.userId===record.userId&&Boolean(row.isSample)===Boolean(record.isSample)&&row.policyId===record.policyId&&row.status==='open'))
  throw new Error('This policy already has an open incident. Coordinate through that record.');
 store.save(record);
}
