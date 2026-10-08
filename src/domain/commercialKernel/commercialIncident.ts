import {isCommercialPolicy,type CommercialPolicy,type PolicyCheck} from './commercialPolicy.ts';
import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';

/** Human escalation of a supported deviation; neither an automatic alert nor an execution task. */
export type CommercialIncident={
 id:string;userId:string|null;opportunityId:string;policyId:string;version:number;summary:string;materialImpact:string;
 coordinator:string;responseNote:string;status:'open'|'closed';disposition:'addressed'|'dismissed'|null;
 basisSnapshot:{version:1;capturedAt:string;policy:CommercialPolicy;reason:string;sourceRecordIds:string[]};
 sourceType:'manual';createdAt:string;updatedAt:string;closedAt:string|null;isSample?:boolean;
};
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const instant=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&isValidBusinessDate(v.slice(0,10))&&Number.isFinite(Date.parse(v));
export function isCommercialIncident(value:unknown):value is CommercialIncident{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const r=value as CommercialIncident,b=r.basisSnapshot;
 return text(r.id,200)&&(r.userId===null||text(r.userId,200))&&text(r.opportunityId,200)&&text(r.policyId,200)
  &&text(r.summary,500)&&text(r.materialImpact,2000)&&text(r.coordinator,200)&&typeof r.responseNote==='string'&&r.responseNote.length<=4000
  &&Number.isSafeInteger(r.version)&&r.version>=1&&r.version<=2147483647
  &&['open','closed'].includes(r.status)&&r.sourceType==='manual'&&instant(r.createdAt)&&instant(r.updatedAt)&&Date.parse(r.updatedAt)>=Date.parse(r.createdAt)
  &&Boolean(b)&&b.version===1&&instant(b.capturedAt)&&Date.parse(b.capturedAt)===Date.parse(r.createdAt)&&isCommercialPolicy(b.policy)
  &&b.policy.id===r.policyId&&b.policy.userId===r.userId&&b.policy.opportunityId===r.opportunityId&&b.policy.lifecycle==='active'
  &&Boolean(b.policy.isSample)===Boolean(r.isSample)&&text(b.reason,2000)&&Array.isArray(b.sourceRecordIds)
  &&b.sourceRecordIds.length<=300&&b.sourceRecordIds.every(id=>text(id,200))&&b.sourceRecordIds.includes(r.policyId)
  &&b.sourceRecordIds.includes(r.opportunityId)&&b.sourceRecordIds.includes(b.policy.requirementId)
  &&(r.status==='open'?r.disposition===null&&r.closedAt===null:!!r.disposition&&['addressed','dismissed'].includes(r.disposition)
    &&instant(r.closedAt)&&Date.parse(r.closedAt)>=Date.parse(r.createdAt)&&Date.parse(r.closedAt)<=Date.parse(r.updatedAt)&&text(r.responseNote,4000));
}
export function validateIncidentReferences(incident:CommercialIncident,opportunities:CrmLiteOpportunity[],policies:CommercialPolicy[]){
 const owned=(r:{userId?:string|null;isSample?:boolean})=>(r.userId??null)===incident.userId&&Boolean(r.isSample)===Boolean(incident.isSample);
 if(!opportunities.some(o=>o.id===incident.opportunityId&&owned(o))||!policies.some(p=>p.id===incident.policyId&&p.opportunityId===incident.opportunityId
   &&owned(p)&&p.version>=incident.basisSnapshot.policy.version))throw new Error('Incident requires its original Opportunity and published Policy in this workspace.');
}
export function incidentCandidates(checks:PolicyCheck[],incidents:CommercialIncident[]):PolicyCheck[]{
 const open=new Set(incidents.filter(i=>i.status==='open').map(i=>`${i.userId}:${Boolean(i.isSample)}:${i.policyId}`));
 return checks.filter(check=>check.status==='breached'&&!open.has(`${check.policy.userId}:${Boolean(check.policy.isSample)}:${check.policy.id}`));
}
