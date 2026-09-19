import { isCommercialDependency, validateDependencyGraph, type CommercialDependency } from './commercialDependency.ts';
import type { OutcomeRequirement } from './outcomeRequirement.ts';
import type { CommercialScope } from './types.ts';
import { loadCommercialDependencies, saveCommercialDependency } from '../../services/commercialKernel/dependencyStore.ts';
import { loadOutcomeRequirements } from '../../services/commercialKernel/requirementStore.ts';
import { kernelId } from '../../services/commercialKernel/kernelRepository.ts';
import { recordCommercialEvent, type CommandResult } from './commands.ts';
import { reportWorkspaceSyncError } from '../../services/workspaceSyncStatus.ts';

function persist(scope:CommercialScope,edge:CommercialDependency,eventType:'dependency_created'|'dependency_retired',requirements:OutcomeRequirement[]):CommandResult<CommercialDependency>{
  try {
    if(!isCommercialDependency(edge)) throw new Error('Explain the prerequisite and choose two different requirements.');
    const existing=loadCommercialDependencies().filter(r=>r.userId===scope.userId && Boolean(r.isSample)===Boolean(scope.sampleDataActive) && r.opportunityId===edge.opportunityId);
    validateDependencyGraph(requirements.filter(r=>r.opportunityId===edge.opportunityId),[...existing.filter(r=>r.id!==edge.id),edge]);
    saveCommercialDependency(edge);
  } catch(error) {return {ok:false,error:error instanceof Error?error.message:'Dependency was not saved.'};}
  try {
    const event=recordCommercialEvent(scope,{eventType,opportunityId:edge.opportunityId,
      accountId:requirements.find(r=>r.id===edge.dependentRequirementId)?.accountId || null,
      summary:eventType==='dependency_created'?'Commercial prerequisite recorded':'Commercial prerequisite retired',
      sourceType:edge.sourceType,sourceId:edge.sourceId,
      structuredPayload:{dependencyId:edge.id,dependentRequirementId:edge.dependentRequirementId,prerequisiteRequirementId:edge.prerequisiteRequirementId,basis:edge.basis}});
    return {ok:true,value:edge,event};
  } catch {const warning='Saved in this browser, but change history could not be saved. Do not repeat the state change.';
    reportWorkspaceSyncError(warning);return {ok:true,value:edge,warning};}
}
export function createCommercialDependency(scope:CommercialScope,input:{opportunityId:string;dependentRequirementId:string;prerequisiteRequirementId:string;basis:string;sourceId?:string|null;sourceUrl?:string|null},requirements:OutcomeRequirement[]=loadOutcomeRequirements()):CommandResult<CommercialDependency>{
  const dependent=requirements.find(r=>r.id===input.dependentRequirementId),prerequisite=requirements.find(r=>r.id===input.prerequisiteRequirementId);
  if(!dependent || !prerequisite || dependent.lifecycle!=='active' || prerequisite.lifecycle!=='active') return {ok:false,error:'Choose two active requirements.'};
  if(dependent.userId!==scope.userId || prerequisite.userId!==scope.userId || Boolean(dependent.isSample)!==Boolean(scope.sampleDataActive)
    || Boolean(prerequisite.isSample)!==Boolean(scope.sampleDataActive)) return {ok:false,error:'Requirements belong to another workspace.'};
  const now=new Date().toISOString();
  const edge:CommercialDependency={id:kernelId('dependency'),userId:scope.userId,opportunityId:input.opportunityId,
    dependentRequirementId:input.dependentRequirementId,prerequisiteRequirementId:input.prerequisiteRequirementId,
    basis:input.basis.trim(),lifecycle:'active',sourceType:'manual',sourceId:input.sourceId||null,sourceUrl:input.sourceUrl||null,
    sourceUpdatedAt:null,createdAt:now,updatedAt:now,...(scope.sampleDataActive?{isSample:true}:{})};
  return persist(scope,edge,'dependency_created',requirements);
}
export function retireCommercialDependency(scope:CommercialScope,id:string,expectedUpdatedAt:string,requirements:OutcomeRequirement[]=loadOutcomeRequirements()):CommandResult<CommercialDependency>{
  const current=loadCommercialDependencies().find(r=>r.id===id);
  if(!current || current.userId!==scope.userId || Boolean(current.isSample)!==Boolean(scope.sampleDataActive)) return {ok:false,error:'Prerequisite not found in this workspace.'};
  if(current.updatedAt!==expectedUpdatedAt) return {ok:false,error:'This prerequisite changed. Reopen before saving.'};
  if(current.lifecycle==='retired') return {ok:false,error:'This prerequisite is already retired.'};
  const edge:CommercialDependency={...current,lifecycle:'retired',updatedAt:new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString()};
  return persist(scope,edge,'dependency_retired',requirements);
}
