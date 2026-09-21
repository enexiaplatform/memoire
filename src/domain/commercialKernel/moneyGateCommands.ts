import {kernelId} from '../../services/commercialKernel/kernelRepository.ts';
import {loadCommercialMoneyGates,saveCommercialMoneyGate} from '../../services/commercialKernel/moneyGateStore.ts';
import {recordCommercialEvent,type CommandResult} from './commands.ts';
import {isCommercialMoneyGate,validateMoneyGates,type CommercialMoneyGate,type MoneyGateBasisKind,
  type MoneyGateReferences,type MoneySourceType} from './moneyGate.ts';
import type {CommercialScope} from './types.ts';
import {reportWorkspaceSyncError} from '../../services/workspaceSyncStatus.ts';

function persist(scope:CommercialScope,row:CommercialMoneyGate,eventType:'money_gate_created'|'money_gate_retired',refs:MoneyGateReferences):CommandResult<CommercialMoneyGate>{
  try{
    if(!isCommercialMoneyGate(row))throw new Error('Explain why this value depends on the Requirement.');
    const existing=loadCommercialMoneyGates().filter(item=>item.userId===scope.userId
      &&Boolean(item.isSample)===Boolean(scope.sampleDataActive)&&item.opportunityId===row.opportunityId);
    validateMoneyGates([...existing.filter(item=>item.id!==row.id),row],refs);saveCommercialMoneyGate(row);
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'Money Gate was not saved.'};}
  try{const event=recordCommercialEvent(scope,{eventType,opportunityId:row.opportunityId,
    accountId:refs.requirements.find(item=>item.id===row.requirementId)?.accountId||null,
    summary:eventType==='money_gate_created'?'Commercial value gate recorded':'Commercial value gate retired',
    sourceType:'manual',structuredPayload:{moneyGateId:row.id,moneySourceType:row.moneySourceType,
      moneySourceId:row.moneySourceId,requirementId:row.requirementId,basisKind:row.basisKind,basis:row.basis}});
    return {ok:true,value:row,event};
  }catch{const warning='Saved in this browser, but change history could not be saved. Do not repeat the state change.';
    reportWorkspaceSyncError(warning);return {ok:true,value:row,warning};}
}
export function createCommercialMoneyGate(scope:CommercialScope,input:{opportunityId:string;moneySourceType:MoneySourceType;
  moneySourceId:string;requirementId:string;basisKind:MoneyGateBasisKind;basis:string},refs:MoneyGateReferences):CommandResult<CommercialMoneyGate>{
  const opportunity=refs.opportunities.find(item=>item.id===input.opportunityId);
  const quote=input.moneySourceType==='quote_value'?refs.quotes.find(item=>item.id===input.moneySourceId):null;
  if(input.moneySourceType==='opportunity_value'&&(!opportunity||opportunity.status!=='Active'
    ||typeof opportunity.estimatedValue!=='number'))return {ok:false,error:'Opportunity value must be active and recorded before it can be gated.'};
  if(input.moneySourceType==='quote_value'&&(!quote||quote.opportunityId!==input.opportunityId
    ||typeof quote.amount!=='number'||!['Sent','Revised','Accepted'].includes(quote.status)||quote.paymentStatus==='Paid'))
    return {ok:false,error:'Quote value must be current, issued, and not paid before it can be gated.'};
  const now=new Date().toISOString();
  const row:CommercialMoneyGate={id:kernelId('money-gate'),userId:scope.userId,...input,basis:input.basis.trim(),lifecycle:'active',
    sourceType:'manual',sourceId:null,sourceUrl:null,sourceUpdatedAt:null,createdAt:now,updatedAt:now,
    ...(scope.sampleDataActive?{isSample:true}:{})};
  return persist(scope,row,'money_gate_created',refs);
}
export function retireCommercialMoneyGate(scope:CommercialScope,id:string,expectedUpdatedAt:string,refs:MoneyGateReferences):CommandResult<CommercialMoneyGate>{
  const current=loadCommercialMoneyGates().find(row=>row.id===id);
  if(!current||current.userId!==scope.userId||Boolean(current.isSample)!==Boolean(scope.sampleDataActive))return {ok:false,error:'Money Gate not found in this workspace.'};
  if(current.updatedAt!==expectedUpdatedAt)return {ok:false,error:'This Money Gate changed. Reopen before saving.'};
  if(current.lifecycle==='retired')return {ok:false,error:'This Money Gate is already retired.'};
  return persist(scope,{...current,lifecycle:'retired',updatedAt:new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString()},'money_gate_retired',refs);
}
