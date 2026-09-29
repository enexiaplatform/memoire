import type {CommercialScope} from './types.ts';
import type {CommandResult} from './commands.ts';
import {validateContractObligation,type ContractObligation,type ContractReferences} from './contractObligation.ts';
import {loadContractObligations,saveContractObligation} from '../../services/commercialKernel/contractObligationStore.ts';
export function publishContractObligation(scope:CommercialScope,input:Omit<ContractObligation,'userId'|'version'|'sourceType'|'createdAt'|'updatedAt'|'isSample'>&{expectedVersion:number;confirmed:boolean},refs:ContractReferences):CommandResult<ContractObligation>{
 try {
  if(input.confirmed!==true)throw new Error('Confirm the accepted contract and this operational interpretation.');
  const previous=loadContractObligations().find(row=>row.id===input.id);
  if(previous&&(previous.userId!==scope.userId||Boolean(previous.isSample)!==scope.sampleDataActive))throw new Error('Contract obligation belongs to another workspace.');
  if((previous?.version||0)!==input.expectedVersion)throw new Error('Contract obligation changed. Review its current version.');
  const at=new Date(Math.max(Date.now(),Date.parse(previous?.updatedAt||'')+1||0)).toISOString();
  const {expectedVersion,confirmed,...fields}=input;void confirmed;
  const record:ContractObligation={...fields,userId:scope.userId,version:expectedVersion+1,sourceType:'manual',createdAt:previous?.createdAt||at,updatedAt:at,...(scope.sampleDataActive?{isSample:true}:{})};
  validateContractObligation(record,refs);
  const activeRequirement=refs.requirements.find(row=>row.id===record.requirementId)?.lifecycle==='active';
  const openCommitment=refs.commitments.find(row=>row.id===record.commitmentId)?.status==='open';
  if(record.lifecycle==='active'&&(!previous||previous.lifecycle!=='active'||previous.requirementId!==record.requirementId||previous.commitmentId!==record.commitmentId)&&(!activeRequirement||!openCommitment))
   throw new Error('A new operational link requires an active Requirement and open Commitment.');
  saveContractObligation(record);return {ok:true,value:record};
 }catch(error){return {ok:false,error:error instanceof Error?error.message:'Contract obligation could not be recorded.'};}
}
