import type {CommercialScope} from './types.ts';
import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import {createCommitment,type CommandResult} from './commands.ts';
import type {CommercialCommitment} from './types.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';
export function recordInternalAgreement(scope:CommercialScope,input:{opportunity:CrmLiteOpportunity;ownerLabel:string;promise:string;dueDate:string;agreementReference:string;confirmed:boolean}):CommandResult<CommercialCommitment>{
 if(input.confirmed!==true)return {ok:false,error:'Confirm the agreed promise before recording it.'};
 const o=input.opportunity;
 if((o.userId??null)!==scope.userId||Boolean(o.isSample)!==scope.sampleDataActive||!o.accountId||!o.id)return {ok:false,error:'Choose an Opportunity in this workspace.'};
 if(!input.ownerLabel.trim()||input.ownerLabel.length>200||!input.promise.trim()||input.promise.length>2000||!input.agreementReference.trim()||input.agreementReference.length>1000)
  return {ok:false,error:'Record who agreed, what they promised and the agreement reference.'};
 if(input.dueDate&&!isValidBusinessDate(input.dueDate))return {ok:false,error:'Use a valid agreed due date or leave it undated.'};
 return createCommitment(scope,{opportunityId:o.id,accountId:o.accountId,accountName:o.accountName,commitmentParty:'internal',ownerLabel:input.ownerLabel,
  commitmentText:input.promise,dueDate:input.dueDate,sourceType:'manual',sourceId:input.agreementReference,impactType:'none'});
}
