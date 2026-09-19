import type { CrmLiteOpportunity } from '../../services/opportunityStore.ts';
import type { ForecastDefensibility } from './deriveForecastDefensibility.ts';
import type { CommercialScope, CommercialCommitment } from './types.ts';
import type { PlanRecord } from '../../utils/weeklyPlan.ts';
import { captureDecisionBasis, isCommercialDecision, type CommercialDecision, type CommercialOption, type DecisionExecutionLink } from './commercialDecision.ts';
import { loadCommercialDecisions, saveCommercialDecision } from '../../services/commercialKernel/decisionStore.ts';
import { kernelId } from '../../services/commercialKernel/kernelRepository.ts';
import { recordCommercialEvent, type CommandResult } from './commands.ts';
import { reportWorkspaceSyncError } from '../../services/workspaceSyncStatus.ts';

type FinalizeInput={id:string;opportunity:CrmLiteOpportunity;forecast:ForecastDefensibility;question:string;context:string;
  options:CommercialOption[];selectedOptionId:string;rationale:string;targetKind:'requirement'|'forecast_claim'|'opportunity';
  targetRequirementId?:string|null;supersedesDecisionId?:string|null};
export function finalizeCommercialDecision(scope:CommercialScope,input:FinalizeInput):CommandResult<CommercialDecision>{
  try {
    const existing=loadCommercialDecisions().find(d=>d.id===input.id);
    if(existing) return existing.userId===(scope.userId||null)&&Boolean(existing.isSample)===scope.sampleDataActive
      ?{ok:true,value:existing}:{ok:false,error:'Decision ID belongs to another workspace.'};
    const o=input.opportunity;
    if(!o.accountId||o.userId!==(scope.userId||null)||Boolean(o.isSample)!==scope.sampleDataActive)
      return {ok:false,error:'Opportunity does not belong to this workspace.'};
    if(input.forecast.opportunityId!==o.id)return {ok:false,error:'Decision basis is for another Opportunity.'};
    if(input.targetKind==='requirement'&&!input.forecast.premises.some(p=>p.requirementId===input.targetRequirementId))
      return {ok:false,error:'Choose a Requirement in this Opportunity’s current basis.'};
    if(input.targetKind==='forecast_claim'&&!input.forecast.claim)
      return {ok:false,error:'There is no current forecast claim to target.'};
    const prior=input.supersedesDecisionId?loadCommercialDecisions().find(d=>d.id===input.supersedesDecisionId):null;
    if(input.supersedesDecisionId&&(!prior||prior.opportunityId!==o.id||prior.userId!==(scope.userId||null)||Boolean(prior.isSample)!==scope.sampleDataActive))
      return {ok:false,error:'Superseded Decision must belong to this Opportunity and workspace.'};
    const chosen=input.options.find(x=>x.id===input.selectedOptionId);
    if(!chosen)return {ok:false,error:'Choose one of the recorded Options.'};
    const now=new Date().toISOString();
    const record:CommercialDecision={id:input.id,userId:scope.userId||null,accountId:o.accountId,opportunityId:o.id,
      question:input.question.trim(),context:input.context.trim(),basisSnapshot:captureDecisionBasis(input.forecast,now),
      options:input.options.map((x,i)=>({...x,id:x.id||kernelId('option'),order:i+1,label:x.label.trim(),interventionIntent:x.interventionIntent.trim(),expectedConsequence:x.expectedConsequence.trim(),tradeoffs:x.tradeoffs.trim()})),
      selectedOptionId:input.selectedOptionId,rationale:input.rationale.trim(),expectedConsequence:chosen.expectedConsequence.trim(),
      intervention:{id:kernelId('intervention'),intent:chosen.interventionIntent.trim(),targetKind:input.targetKind,
        targetRequirementId:input.targetKind==='requirement'?input.targetRequirementId||null:null,expectedChange:chosen.expectedConsequence.trim()},
      executionLinks:[],supersedesDecisionId:input.supersedesDecisionId||null,sourceType:'manual',decidedAt:now,createdAt:now,updatedAt:now,
      ...(scope.sampleDataActive?{isSample:true}:{})};
    if(!isCommercialDecision(record))return {ok:false,error:'Complete the decision question, context, Options, choice, rationale, and expected change.'};
    saveCommercialDecision(record);
    try { const event=recordCommercialEvent(scope,{id:`${record.id}:finalized`,eventType:'decision_finalized',summary:`Decision: ${record.question}`,
      accountId:record.accountId,opportunityId:record.opportunityId,sourceType:'manual',sourceId:record.id,
      idempotencyKey:`decision:${record.id}`,structuredPayload:{decisionId:record.id,selectedOptionId:record.selectedOptionId,
        supersedesDecisionId:record.supersedesDecisionId}});
      return {ok:true,value:record,event};
    } catch {const warning='Decision saved, but history could not be recorded. The Decision remains valid.';reportWorkspaceSyncError(warning);return {ok:true,value:record,warning};}
  } catch(error){return {ok:false,error:error instanceof Error?error.message:'Decision could not be saved.'};}
}

export function linkDecisionExecution(scope:CommercialScope,decisionId:string,kind:DecisionExecutionLink['kind'],recordId:string,
  refs:{plans:PlanRecord[];commitments:CommercialCommitment[]}):CommandResult<CommercialDecision>{
  try {
    const decision=loadCommercialDecisions().find(d=>d.id===decisionId&&d.userId===(scope.userId||null)&&Boolean(d.isSample)===scope.sampleDataActive);
    if(!decision)return {ok:false,error:'Decision is unavailable in this workspace.'};
    if(kind==='action'){
      const action=refs.plans.find(p=>p.id===recordId&&p.linkedOpportunityId===decision.opportunityId
        &&(scope.sampleDataActive?Boolean(p.isSample)||p.source==='demo':!p.isSample&&p.source!=='demo'));
      if(!action)return {ok:false,error:'Choose an existing Plan action linked to this Opportunity.'};
    } else {
      const commitment=refs.commitments.find(c=>c.id===recordId&&c.userId===decision.userId&&Boolean(c.isSample)===scope.sampleDataActive
        &&c.opportunityId===decision.opportunityId&&c.accountId===decision.accountId);
      if(!commitment)return {ok:false,error:'Choose an existing Commitment in this Opportunity.'};
    }
    if(decision.executionLinks.some(l=>l.kind===kind&&l.recordId===recordId))return {ok:true,value:decision};
    const now=new Date().toISOString();const next={...decision,executionLinks:[...decision.executionLinks,{kind,recordId,linkedAt:now}],updatedAt:now};
    saveCommercialDecision(next);
    try{const event=recordCommercialEvent(scope,{id:`${decisionId}:link:${kind}:${recordId}`,eventType:'decision_execution_linked',
      summary:`Decision execution linked: ${kind}`,accountId:decision.accountId,opportunityId:decision.opportunityId,
      sourceType:'manual',sourceId:decisionId,idempotencyKey:`decision-link:${decisionId}:${kind}:${recordId}`,
      structuredPayload:{decisionId,kind,recordId}});return {ok:true,value:next,event};}
    catch{const warning='Execution link saved, but history could not be recorded.';reportWorkspaceSyncError(warning);return {ok:true,value:next,warning};}
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'Execution link could not be saved.'};}
}
