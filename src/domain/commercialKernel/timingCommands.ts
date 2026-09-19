import { isValidBusinessDate } from '../../utils/safeDate.ts';
import { isCommercialTimingAssertion, validateTimingAssertions, type CommercialTimingAssertion, type TimingReferenceIndex } from './commercialTiming.ts';
import type { CommercialScope } from './types.ts';
import { loadCommercialTiming, saveCommercialTiming } from '../../services/commercialKernel/timingStore.ts';
import { kernelId } from '../../services/commercialKernel/kernelRepository.ts';
import { recordCommercialEvent, type CommandResult } from './commands.ts';
import { reportWorkspaceSyncError } from '../../services/workspaceSyncStatus.ts';

export type CreateTimingInput = { opportunityId:string; requirementId:string; basis:string } & (
  | {kind:'target_anchor'}
  | {kind:'commitment_link';commitmentId:string}
  | {kind:'duration';durationDays:number;durationUnit:'calendar_days'|'business_days';epistemic:'supported'|'assumed';
    sourceKind:'contract'|'customer_or_supplier'|'internal_sla'|'planning_assumption';sourceReference?:string|null;evidenceId?:string|null}
);

function persist(scope:CommercialScope,row:CommercialTimingAssertion,refs:TimingReferenceIndex,
  eventType:'timing_assertion_created'|'timing_assertion_retired'):CommandResult<CommercialTimingAssertion>{
  try {
    if(!isCommercialTimingAssertion(row)) throw new Error('Complete the timing type, source and explanation.');
    const current=loadCommercialTiming().filter(r=>r.userId===scope.userId && Boolean(r.isSample)===Boolean(scope.sampleDataActive)
      && r.opportunityId===row.opportunityId && r.id!==row.id);
    validateTimingAssertions([...current,row],refs);
    saveCommercialTiming(row);
  } catch(error){return {ok:false,error:error instanceof Error?error.message:'Timing assertion was not saved.'};}
  try {
    const event=recordCommercialEvent(scope,{eventType,opportunityId:row.opportunityId,
      accountId:refs.requirements.find(r=>r.id===row.requirementId)?.accountId||null,
      summary:eventType==='timing_assertion_created'?'Commercial timing source recorded':'Commercial timing source retired',
      sourceType:'manual',structuredPayload:{timingAssertionId:row.id,requirementId:row.requirementId,kind:row.kind,basis:row.basis}});
    return {ok:true,value:row,event};
  } catch {
    const warning='Saved in this browser, but timing change history could not be saved. Do not repeat the state change.';
    reportWorkspaceSyncError(warning);return {ok:true,value:row,warning};
  }
}

export function createCommercialTiming(scope:CommercialScope,input:CreateTimingInput,refs:TimingReferenceIndex):CommandResult<CommercialTimingAssertion>{
  const opportunity=refs.opportunities.find(r=>r.id===input.opportunityId);
  const requirement=refs.requirements.find(r=>r.id===input.requirementId);
  if(!opportunity || !requirement || requirement.lifecycle!=='active') return {ok:false,error:'Choose an active outcome in this Opportunity.'};
  if(input.kind==='target_anchor' && !isValidBusinessDate(opportunity.expectedClosePeriod))
    return {ok:false,error:'Enter a valid expected close date before anchoring timing.'};
  if(input.kind==='commitment_link'){
    const commitment=refs.commitments.find(r=>r.id===input.commitmentId);
    if(!commitment || commitment.status!=='open' || !isValidBusinessDate(commitment.currentDueDate))
      return {ok:false,error:'Choose an open, dated Commitment.'};
  }
  const now=new Date().toISOString();
  const row:CommercialTimingAssertion={id:kernelId('timing'),userId:scope.userId,opportunityId:input.opportunityId,
    requirementId:input.requirementId,kind:input.kind,basis:input.basis.trim(),lifecycle:'active',
    durationDays:input.kind==='duration'?input.durationDays:null,
    durationUnit:input.kind==='duration'?input.durationUnit:null,
    epistemic:input.kind==='duration'?input.epistemic:null,
    sourceKind:input.kind==='duration'?input.sourceKind:null,
    sourceReference:input.kind==='duration'?input.sourceReference?.trim()||null:null,
    evidenceId:input.kind==='duration'?input.evidenceId||null:null,
    commitmentId:input.kind==='commitment_link'?input.commitmentId:null,
    sourceType:'manual',createdAt:now,updatedAt:now,...(scope.sampleDataActive?{isSample:true}:{})};
  return persist(scope,row,refs,'timing_assertion_created');
}

export function retireCommercialTiming(scope:CommercialScope,id:string,expectedUpdatedAt:string,refs:TimingReferenceIndex):CommandResult<CommercialTimingAssertion>{
  const current=loadCommercialTiming().find(r=>r.id===id);
  if(!current || current.userId!==scope.userId || Boolean(current.isSample)!==Boolean(scope.sampleDataActive))
    return {ok:false,error:'Timing source not found in this workspace.'};
  if(current.updatedAt!==expectedUpdatedAt) return {ok:false,error:'This timing source changed. Reopen before saving.'};
  if(current.lifecycle==='retired') return {ok:false,error:'This timing source is already retired.'};
  const row={...current,lifecycle:'retired' as const,updatedAt:new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString()};
  return persist(scope,row,refs,'timing_assertion_retired');
}
