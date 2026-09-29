import type {CommercialScope} from './types.ts';
import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import type {RequirementReading} from './outcomeRequirement.ts';
import {evaluateCommercialPolicies} from './commercialPolicy.ts';
import {isCommercialIncident,validateIncidentReferences,type CommercialIncident} from './commercialIncident.ts';
import {loadCommercialPolicies} from '../../services/commercialKernel/policyStore.ts';
import {loadCommercialIncidents,saveCommercialIncident} from '../../services/commercialKernel/incidentStore.ts';
import type {CommandResult} from './commands.ts';
type Context={opportunity:CrmLiteOpportunity;readings:RequirementReading[]};
export function openCommercialIncident(scope:CommercialScope,input:Context&{id:string;policyId:string;policyVersion:number;summary:string;materialImpact:string;coordinator:string;confirmed:boolean}):CommandResult<CommercialIncident>{
 try{
  if(input.confirmed!==true)throw new Error('Confirm that this deviation needs coordinated attention.');
  const policy=loadCommercialPolicies().find(p=>p.id===input.policyId&&p.userId===scope.userId&&Boolean(p.isSample)===scope.sampleDataActive);
  if(!policy||policy.version!==input.policyVersion)throw new Error('Policy changed. Review the current rule before opening an incident.');
  const check=evaluateCommercialPolicies([policy],input.opportunity,input.readings)[0];
  if(check?.status!=='breached')throw new Error('An incident requires an explicit unmet policy in this Opportunity.');
  if(loadCommercialIncidents().some(row=>row.id===input.id))throw new Error('Incident identity is already recorded. Reopen that incident.');
  const at=new Date().toISOString();
  const incident:CommercialIncident={id:input.id,userId:scope.userId,opportunityId:input.opportunity.id,policyId:policy.id,version:1,
   summary:input.summary.trim(),materialImpact:input.materialImpact.trim(),coordinator:input.coordinator.trim(),responseNote:'',status:'open',disposition:null,
   basisSnapshot:{version:1,capturedAt:at,policy:JSON.parse(JSON.stringify(policy)),reason:check.reason,sourceRecordIds:[...new Set(check.sourceRecordIds)]},
   sourceType:'manual',createdAt:at,updatedAt:at,closedAt:null,...(scope.sampleDataActive?{isSample:true}:{})};
  if(!isCommercialIncident(incident))throw new Error('Record the deviation, material impact and response coordinator.');
  validateIncidentReferences(incident,[input.opportunity],[policy]);saveCommercialIncident(incident);return {ok:true,value:incident};
 }catch(error){return {ok:false,error:error instanceof Error?error.message:'Incident could not be recorded.'};}
}
export function updateCommercialIncident(scope:CommercialScope,input:Context&{id:string;expectedUpdatedAt:string;coordinator:string;responseNote:string;
  disposition:CommercialIncident['disposition'];confirmed:boolean}):CommandResult<CommercialIncident>{
 try{
  if(input.confirmed!==true)throw new Error('Confirm this incident response.');
  const previous=loadCommercialIncidents().find(row=>row.id===input.id&&row.userId===scope.userId&&Boolean(row.isSample)===scope.sampleDataActive);
  if(!previous||previous.opportunityId!==input.opportunity.id)throw new Error('Incident is unavailable in this Opportunity.');
  if(previous.updatedAt!==input.expectedUpdatedAt||previous.status==='closed')throw new Error('Incident changed or is closed. Reopen its current record.');
  const policies=loadCommercialPolicies();validateIncidentReferences(previous,[input.opportunity],policies);
  if(input.disposition==='addressed'){
   const check=evaluateCommercialPolicies(policies.filter(p=>p.id===previous.policyId),input.opportunity,input.readings)[0];
   if(!check||!['satisfied','not_applicable'].includes(check.status))throw new Error('The current rule is still unmet or unavailable. Record progress, or dismiss with an explicit reason.');
  }
  const at=new Date(Math.max(Date.now(),Date.parse(previous.updatedAt)+1)).toISOString();
  const record:CommercialIncident={...previous,coordinator:input.coordinator.trim(),responseNote:input.responseNote.trim(),
   status:input.disposition?'closed':'open',disposition:input.disposition,closedAt:input.disposition?at:null,updatedAt:at,version:previous.version+1};
  if(!isCommercialIncident(record))throw new Error('Record the coordinator and explain the response before closing.');
  saveCommercialIncident(record);return {ok:true,value:record};
 }catch(error){return {ok:false,error:error instanceof Error?error.message:'Incident response could not be saved.'};}
}
