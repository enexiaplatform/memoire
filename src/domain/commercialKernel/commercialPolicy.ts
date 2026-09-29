import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import type {OutcomeRequirement,RequirementReading} from './outcomeRequirement.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';

/** One explicitly published rule. Earlier versions live in the canonical Revision chain. */
export type CommercialPolicy={
  id:string;userId:string|null;opportunityId:string;version:number;title:string;rationale:string;
  requirementId:string;appliesWhen:'always'|'value_above';amount:number|null;currency:string|null;
  lifecycle:'active'|'retired';sourceType:'manual';createdAt:string;updatedAt:string;isSample?:boolean;
};
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const instant=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)
  &&isValidBusinessDate(v.slice(0,10))&&Number.isFinite(Date.parse(v));
export function isCommercialPolicy(value:unknown):value is CommercialPolicy{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const r=value as CommercialPolicy;
  return text(r.id,200)&&(r.userId===null||text(r.userId,200))&&text(r.opportunityId,200)
    &&Number.isSafeInteger(r.version)&&r.version>=1&&r.version<=2147483647&&text(r.title,300)&&text(r.rationale,2000)
    &&text(r.requirementId,200)&&['always','value_above'].includes(r.appliesWhen)
    &&(r.appliesWhen==='always'?r.amount===null&&r.currency===null:typeof r.amount==='number'&&Number.isFinite(r.amount)
      &&r.amount>=0&&typeof r.currency==='string'&&/^[A-Z]{3}$/.test(r.currency))
    &&['active','retired'].includes(r.lifecycle)&&r.sourceType==='manual'
    &&instant(r.createdAt)&&instant(r.updatedAt)&&Date.parse(r.updatedAt)>=Date.parse(r.createdAt);
}
export function validatePolicyReferences(policy:CommercialPolicy,opportunities:CrmLiteOpportunity[],requirements:OutcomeRequirement[]){
  const o=opportunities.find(row=>row.id===policy.opportunityId&&(row.userId??null)===policy.userId&&Boolean(row.isSample)===Boolean(policy.isSample));
  const r=requirements.find(row=>row.id===policy.requirementId&&row.userId===policy.userId&&row.opportunityId===policy.opportunityId
    &&Boolean(row.isSample)===Boolean(policy.isSample));
  if(!o||!r||r.accountId!==o.accountId)throw new Error('Policy and Requirement must belong to this Opportunity and workspace.');
}
export type PolicyCheck={policy:CommercialPolicy;status:'satisfied'|'breached'|'unknown'|'not_applicable';
  reason:string;requirement:OutcomeRequirement|null;sourceRecordIds:string[]};
/** A transparent predicate over canonical readings; it does not approve or execute anything. */
export function evaluateCommercialPolicies(policies:CommercialPolicy[],opportunity:CrmLiteOpportunity,readings:RequirementReading[]):PolicyCheck[]{
  return policies.filter(p=>p.lifecycle==='active'&&p.opportunityId===opportunity.id&&p.userId===(opportunity.userId??null)
    &&Boolean(p.isSample)===Boolean(opportunity.isSample)).map(policy=>{
    const reading=readings.find(r=>r.requirement.id===policy.requirementId&&r.requirement.userId===policy.userId
      &&r.requirement.opportunityId===policy.opportunityId&&r.requirement.accountId===opportunity.accountId
      &&Boolean(r.requirement.isSample)===Boolean(policy.isSample));
    const result=(status:PolicyCheck['status'],reason:string):PolicyCheck=>({policy,status,reason,requirement:reading?.requirement||null,
      sourceRecordIds:[policy.id,opportunity.id,policy.requirementId,...(reading?.condition?[reading.condition.id]:[]),...(reading?.sourceEvidenceIds||[])]});
    if(!isCommercialPolicy(policy))return result('unknown','The published rule is unreadable.');
    if(policy.appliesWhen==='value_above'){
      if(typeof opportunity.estimatedValue!=='number'||!Number.isFinite(opportunity.estimatedValue)||opportunity.currency!==policy.currency)
        return result('unknown','A value in the rule’s exact currency is needed. No currency conversion was inferred.');
      if(opportunity.estimatedValue<=policy.amount!)return result('not_applicable','The recorded value does not exceed the published threshold.');
    }
    if(!reading||reading.projection)return result('unknown','A canonical Requirement reading is needed.');
    if(reading.requirement.lifecycle!=='active')return result('breached','The required Requirement has been retired. Review this rule explicitly.');
    if(reading.resolution==='resolved')return result('satisfied','The required outcome is supported by its linked evidence.');
    return result('breached',reading.resolution==='conflicted'?'The required outcome has conflicting evidence.':'The required outcome is unresolved.');
  }).sort((a,b)=>a.policy.title.localeCompare(b.policy.title)||a.policy.id.localeCompare(b.policy.id));
}
