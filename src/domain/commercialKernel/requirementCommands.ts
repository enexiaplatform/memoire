import { isOutcomeRequirement, type OutcomeRequirement, type RequirementRole } from './outcomeRequirement.ts';
import { loadOutcomeRequirements, saveOutcomeRequirement } from '../../services/commercialKernel/requirementStore.ts';
import { kernelId } from '../../services/commercialKernel/kernelRepository.ts';
import { recordCommercialEvent, type CommandResult } from './commands.ts';
import type { CommercialScope, CommercialEventType } from './types.ts';
import type { CommercialCondition } from './commercialCondition.ts';
import { reportWorkspaceSyncError } from '../../services/workspaceSyncStatus.ts';

type Anchor = {id:string;userId?:string|null;isSample?:boolean;source?:string;accountId?:string|null};
export type RequirementReferences = { accounts: Map<string,Anchor>;
  opportunities: Map<string,Anchor>;
  conditions: Map<string,CommercialCondition> };
export function requirementReferenceIndex(accounts: Anchor[], opportunities: Anchor[], conditions: CommercialCondition[]): RequirementReferences {
  return { accounts: new Map(accounts.map(r => [r.id,r])), opportunities: new Map(opportunities.map(r => [r.id,r])), conditions: new Map(conditions.map(r => [r.id,r])) };
}
export function validateRequirementReferences(r: OutcomeRequirement, refs: RequirementReferences) {
  const owned = (item?: {userId?:string|null;isSample?:boolean;source?:string}) => item && (!item.userId || item.userId === r.userId)
    && Boolean(item.isSample || item.source === 'demo') === Boolean(r.isSample);
  if (!owned(refs.accounts.get(r.accountId))) throw new Error('Choose an existing account in this workspace.');
  const opportunity = refs.opportunities.get(r.opportunityId);
  if (!owned(opportunity) || (opportunity?.accountId && opportunity.accountId !== r.accountId)) throw new Error('The opportunity does not belong to this account.');
  if (r.conditionId) {
    const condition = refs.conditions.get(r.conditionId);
    if (!condition || condition.userId !== r.userId || Boolean(condition.isSample) !== Boolean(r.isSample)
      || condition.accountId !== r.accountId || (condition.opportunityId && condition.opportunityId !== r.opportunityId)) throw new Error('The condition does not belong to this opportunity and account.');
  }
}
function persist(scope: CommercialScope, record: OutcomeRequirement, eventType: CommercialEventType, payload: Record<string,unknown>, refs: RequirementReferences): CommandResult<OutcomeRequirement> {
  try { if (!isOutcomeRequirement(record)) throw new Error('Check the requirement and its question.'); validateRequirementReferences(record,refs); saveOutcomeRequirement(record); }
  catch(error) { return { ok:false,error:error instanceof Error ? error.message : 'Requirement was not saved.' }; }
  try { const event = recordCommercialEvent(scope,{eventType,accountId:record.accountId,opportunityId:record.opportunityId,
    summary:eventType === 'requirement_created' ? 'Outcome requirement recorded' : 'Outcome requirement updated',sourceType:record.sourceType,sourceId:record.sourceId,
    structuredPayload:{requirementId:record.id,...payload}}); return {ok:true,value:record,event}; }
  catch { const warning='Saved in this browser, but change history could not be saved. Do not repeat the state change.'; reportWorkspaceSyncError(warning); return {ok:true,value:record,warning}; }
}
export function createOutcomeRequirement(scope: CommercialScope,input: Pick<OutcomeRequirement,'accountId'|'opportunityId'|'expectedOutcome'|'role'> & {question?:string|null;conditionId?:string|null},refs:RequirementReferences): CommandResult<OutcomeRequirement> {
  const now=new Date().toISOString(); const record:OutcomeRequirement={id:kernelId('requirement'),userId:scope.userId,accountId:input.accountId,opportunityId:input.opportunityId,
    expectedOutcome:input.expectedOutcome.trim(),question:input.question?.trim() || null,conditionId:input.conditionId || null,role:input.role,lifecycle:'active',
    sourceType:'manual',sourceId:null,sourceUrl:null,sourceUpdatedAt:null,createdAt:now,updatedAt:now,...(scope.sampleDataActive?{isSample:true}:{})};
  return persist(scope,record,'requirement_created',{role:record.role,conditionId:record.conditionId},refs);
}
export function changeOutcomeRequirement(scope:CommercialScope,id:string,expectedUpdatedAt:string,
  change:{kind:'role';role:RequirementRole}|{kind:'link';conditionId:string}|{kind:'retire'},refs:RequirementReferences):CommandResult<OutcomeRequirement> {
  const current=loadOutcomeRequirements().find(r=>r.id===id);
  if (!current || current.userId!==scope.userId || Boolean(current.isSample)!==Boolean(scope.sampleDataActive)) return {ok:false,error:'Requirement not found in this workspace.'};
  if (current.updatedAt!==expectedUpdatedAt) return {ok:false,error:'This requirement changed. Reopen it before saving.'};
  if (current.lifecycle==='retired') return {ok:false,error:'This requirement is retired.'};
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString();
  const next={...current,updatedAt};
  let eventType:CommercialEventType;let payload:Record<string,unknown>;
  if(change.kind==='role'){next.role=change.role;eventType='requirement_role_changed';payload={from:current.role,to:change.role};}
  else if(change.kind==='link'){next.conditionId=change.conditionId;eventType='requirement_condition_linked';payload={from:current.conditionId,to:change.conditionId};}
  else {next.lifecycle='retired';eventType='requirement_retired';payload={from:'active',to:'retired'};}
  return persist(scope,next,eventType,payload,refs);
}
