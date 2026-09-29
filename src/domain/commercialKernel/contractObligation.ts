import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';
import type {OutcomeRequirement,RequirementReading} from './outcomeRequirement.ts';
import type {CommercialCommitment} from './types.ts';
import type {CommercialTimingAssertion} from './commercialTiming.ts';
import type {CommercialMoneyGate} from './moneyGate.ts';
/** A human-confirmed operational interpretation of one accepted contract clause. */
export type ContractObligation={id:string;userId:string|null;opportunityId:string;version:number;
 contractReference:string;contractVersion:string;acceptedOn:string;acceptanceReference:string;clause:string;
 requirementId:string;commitmentId:string;revisionReason:string;lifecycle:'active'|'retired';
 sourceType:'manual';createdAt:string;updatedAt:string;isSample?:boolean};
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function isContractObligation(value:unknown):value is ContractObligation{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const r=value as ContractObligation;
 return text(r.id,200)&&(r.userId===null||text(r.userId,200))&&text(r.opportunityId,200)&&Number.isSafeInteger(r.version)&&r.version>0&&r.version<=2147483647
  &&text(r.contractReference,500)&&text(r.contractVersion,200)&&isValidBusinessDate(r.acceptedOn)&&text(r.acceptanceReference,1000)&&text(r.clause,2000)
  &&text(r.requirementId,200)&&text(r.commitmentId,200)&&text(r.revisionReason,2000)&&['active','retired'].includes(r.lifecycle)&&r.sourceType==='manual'
  &&[r.createdAt,r.updatedAt].every(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&isValidBusinessDate(v.slice(0,10))&&Number.isFinite(Date.parse(v)))
  &&Date.parse(r.updatedAt)>=Date.parse(r.createdAt)&&r.acceptedOn<=r.createdAt.slice(0,10);
}
export type ContractReferences={opportunities:CrmLiteOpportunity[];requirements:OutcomeRequirement[];commitments:CommercialCommitment[]};
export function validateContractObligation(row:ContractObligation,refs:ContractReferences){
 if(!isContractObligation(row))throw new Error('Record the accepted contract version, acceptance reference, clause and linked obligation.');
 const same=(r:{userId?:string|null;isSample?:boolean})=>(r.userId??null)===row.userId&&Boolean(r.isSample)===Boolean(row.isSample);
 const o=refs.opportunities.find(r=>r.id===row.opportunityId&&same(r));
 const requirement=refs.requirements.find(r=>r.id===row.requirementId&&r.opportunityId===row.opportunityId&&same(r));
 const commitment=refs.commitments.find(r=>r.id===row.commitmentId&&r.opportunityId===row.opportunityId&&same(r));
 if(!o||!requirement||!commitment||requirement.accountId!==o.accountId||commitment.accountId!==o.accountId)
  throw new Error('Contract obligation endpoints must belong to this Opportunity and workspace.');
}
export function readContractObligation(row:ContractObligation,readings:RequirementReading[],commitments:CommercialCommitment[],timing:CommercialTimingAssertion[],gates:CommercialMoneyGate[]){
 const same=(r:{userId:string|null;opportunityId?:string|null;isSample?:boolean})=>r.userId===row.userId&&r.opportunityId===row.opportunityId&&Boolean(r.isSample)===Boolean(row.isSample);
 const reading=readings.find(r=>r.requirement.id===row.requirementId&&same(r.requirement)&&!r.projection);
 const commitment=commitments.find(r=>r.id===row.commitmentId&&same(r));
 const timingLinks=timing.filter(r=>same(r)&&r.lifecycle==='active'&&r.requirementId===row.requirementId&&r.kind==='commitment_link'&&r.commitmentId===row.commitmentId);
 const moneyLinks=gates.filter(r=>same(r)&&r.lifecycle==='active'&&r.requirementId===row.requirementId&&r.basisKind==='contractual_requirement');
 return {obligation:row,requirement:reading?.requirement||null,
  outcome:row.lifecycle==='retired'?'retired':!reading||reading.requirement.lifecycle!=='active'?'unavailable':reading.resolution,
  condition:reading?.condition||null,sourceEvidenceIds:reading?.sourceEvidenceIds||[],commitment:commitment||null,
  dueDate:commitment?.currentDueDate||null,timingLinks,moneyLinks};
}
export type ContractObligationReading=ReturnType<typeof readContractObligation>;
