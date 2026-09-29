import type {CommercialScope} from './types.ts';
import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import type {OutcomeRequirement} from './outcomeRequirement.ts';
import {isCommercialPolicy,validatePolicyReferences,type CommercialPolicy} from './commercialPolicy.ts';
import {loadCommercialPolicies,saveCommercialPolicy} from '../../services/commercialKernel/policyStore.ts';
import type {CommandResult} from './commands.ts';

export function publishCommercialPolicy(scope:CommercialScope,input:{id:string;expectedVersion:number;confirmed:boolean;
  opportunity:CrmLiteOpportunity;title:string;rationale:string;requirementId:string;appliesWhen:CommercialPolicy['appliesWhen'];
  amount:number|null;currency:string|null;lifecycle:CommercialPolicy['lifecycle']},requirements:OutcomeRequirement[]):CommandResult<CommercialPolicy>{
  try{
    if(input.confirmed!==true)throw new Error('Explicit human confirmation is required to publish a policy version.');
    const previous=loadCommercialPolicies().find(row=>row.id===input.id);
    if((previous?.version||0)!==input.expectedVersion)throw new Error('Policy version changed. Reload before publishing.');
    if(previous&&(previous.userId!==scope.userId||Boolean(previous.isSample)!==scope.sampleDataActive||previous.opportunityId!==input.opportunity.id))
      throw new Error('Policy belongs to another workspace or Opportunity.');
    const at=new Date(Math.max(Date.now(),previous?Date.parse(previous.updatedAt)+1:0)).toISOString();
    const record:CommercialPolicy={id:input.id,userId:scope.userId,opportunityId:input.opportunity.id,version:input.expectedVersion+1,
      title:input.title.trim(),rationale:input.rationale.trim(),requirementId:input.requirementId,appliesWhen:input.appliesWhen,
      amount:input.amount,currency:input.currency,lifecycle:input.lifecycle,sourceType:'manual',createdAt:previous?.createdAt||at,updatedAt:at,
      ...(scope.sampleDataActive?{isSample:true}:{})};
    if(!isCommercialPolicy(record))throw new Error('Complete the rule, its Requirement, applicability and reason.');
    validatePolicyReferences(record,[input.opportunity],requirements);
    if(record.lifecycle==='active'&&(!previous||previous.requirementId!==record.requirementId||previous.lifecycle==='retired')
      &&!requirements.some(row=>row.id===record.requirementId&&row.lifecycle==='active'))throw new Error('Choose an active Requirement for this published rule.');
    saveCommercialPolicy(record);return {ok:true,value:record};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'Policy could not be published.'};}
}
