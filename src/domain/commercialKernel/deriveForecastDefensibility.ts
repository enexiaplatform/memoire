import { isLeadStage } from '../../utils/leadIdentity.ts';
import { isValidBusinessDate } from '../../utils/safeDate.ts';
import type { CrmLiteOpportunity } from '../../services/opportunityStore.ts';
import type { CommercialCondition } from './commercialCondition.ts';
import type { CommercialEvidence } from './commercialEvidence.ts';
import { deriveKnownBlockers, type CommercialDependency } from './commercialDependency.ts';
import { deriveCommercialTime, type CommercialTimeResult } from './deriveCommercialTime.ts';
import type { CommercialTimingAssertion } from './commercialTiming.ts';
import { nextBestQuestion, projectOutcomeRequirements, requirementQuestion, type OutcomeRequirement, type RequirementReading } from './outcomeRequirement.ts';
import type { CommercialCommitment } from './types.ts';

export type ForecastVerdict = 'no_claim'|'insufficient_basis'|'defensible'|'conditional'|'incomplete'|'not_currently_supported';
export type PremiseState = 'supported'|'assumed'|'hypothesis'|'unknown'|'contradicted';
export type ForecastPremise = { requirementId:string; expectedOutcome:string; role:OutcomeRequirement['role']; state:PremiseState;
  blocked:boolean; conditionId:string|null; conditionStatement:string|null;
  evidenceSources:{id:string;summary:string;assessment:'supports'|'contradicts'}[];
  evidenceIds:string[]; sourceRecordIds:string[] };
export type ForecastBlocker = { requirementId:string; expectedOutcome:string; state:PremiseState;
  paths:{requirementIds:string[];dependencyIds:string[];explanations:string[]}[]; sourceRecordIds:string[] };
export type ForecastNeed = {kind:'premise'|'timing'|'scope'; text:string; sourceRecordIds:string[]};
export type ForecastDefensibility = {
  opportunityId:string; claim:{kind:'opportunity_close';targetDate:string;operatorCategory:CrmLiteOpportunity['forecastEvidenceCategory'];sourceRecordId:string}|null;
  verdict:ForecastVerdict; premises:ForecastPremise[]; blockers:ForecastBlocker[]; whatWouldHaveToBeTrue:ForecastNeed[];
  nextQuestion:{requirementId:string;question:string}|null; timing:CommercialTimeResult|null;
  timingEvaluation:'not_evaluated'|'not_needed'|'incomplete'|'supported'|'conditional'|'unsupported';
  categoryDisagreement:'operator_more_confident'|'operator_less_confident'|null;
  coverage:{requiredNowCount:number;requiredLaterCount:number;linkedLaterCount:number;unscopedLaterCount:number;modeledPremiseCount:number;recordedScopeOnly:true};
  reasonCodes:string[]; sourceRecordIds:string[]; calculatedAt:string;
};
export type ForecastDefensibilityInput = {opportunity:CrmLiteOpportunity; requirements:OutcomeRequirement[];
  conditions:CommercialCondition[];evidence:CommercialEvidence[];dependencies:CommercialDependency[];
  timingAssertions:CommercialTimingAssertion[];commitments:CommercialCommitment[];today:string;calculatedAt:string};

const unique=(values:string[])=>[...new Set(values.filter(Boolean))].sort();
const stateOf=(reading:RequirementReading):PremiseState=>reading.conditionState;

/** Current-state argument only. A verdict is about the recorded premises of a
 * dated close claim, never an estimated win probability or a historical fact. */
export function deriveForecastDefensibility(input:ForecastDefensibilityInput):ForecastDefensibility {
  const o=input.opportunity;
  const sameScope=(r:{userId?:string|null;isSample?:boolean})=>(r.userId??null)===(o.userId??null)
    && Boolean(r.isSample)===Boolean(o.isSample);
  const requirements=input.requirements.filter(r=>sameScope(r)&&r.opportunityId===o.id);
  const conditions=input.conditions.filter(r=>sameScope(r)&&r.accountId===o.accountId&&(!r.opportunityId||r.opportunityId===o.id));
  const evidence=input.evidence.filter(r=>sameScope(r)&&(r.accountId===o.accountId||(!r.accountId&&r.opportunityId===o.id))
    &&(!r.opportunityId||r.opportunityId===o.id));
  const dependencies=input.dependencies.filter(r=>sameScope(r)&&r.opportunityId===o.id);
  const timingAssertions=input.timingAssertions.filter(r=>sameScope(r)&&r.opportunityId===o.id);
  const commitments=input.commitments.filter(r=>sameScope(r)&&r.opportunityId===o.id);
  const active=requirements.filter(r=>r.lifecycle==='active');
  const requiredNow=active.filter(r=>r.role==='required_now');
  const requiredLater=active.filter(r=>r.role==='required_later');
  const claim=o.status==='Active'&&!isLeadStage(o.stage)&&isValidBusinessDate(o.expectedClosePeriod)
    ?{kind:'opportunity_close' as const,targetDate:o.expectedClosePeriod,operatorCategory:o.forecastEvidenceCategory,sourceRecordId:o.id}:null;
  const base:ForecastDefensibility={opportunityId:o.id,claim,verdict:'no_claim',premises:[],blockers:[],
    whatWouldHaveToBeTrue:[],nextQuestion:null,timing:null,timingEvaluation:'not_evaluated',categoryDisagreement:null,
    coverage:{requiredNowCount:requiredNow.length,requiredLaterCount:requiredLater.length,linkedLaterCount:0,
      unscopedLaterCount:requiredLater.length,modeledPremiseCount:0,recordedScopeOnly:true},
    reasonCodes:[],sourceRecordIds:claim?[o.id]:[],calculatedAt:input.calculatedAt};
  if(!claim){base.reasonCodes=['NO_DATED_CLOSE_CLAIM'];return base;}
  if(!requiredNow.length){base.verdict='insufficient_basis';
    base.categoryDisagreement=o.forecastEvidenceCategory==='Defensible'?'operator_more_confident':null;
    base.reasonCodes=['NO_REQUIRED_NOW_BASIS',...(base.categoryDisagreement?['OPERATOR_CATEGORY_DISAGREES']:[])];
    base.whatWouldHaveToBeTrue=[{kind:'scope',text:'Record the required-now commercial outcomes that this close claim depends on.',sourceRecordIds:[o.id]}];
    return base;}
  const readings=projectOutcomeRequirements(requirements,conditions,evidence);
  const byReading=new Map(readings.map(r=>[r.requirement.id,r]));
  const byEvidence=new Map(evidence.map(r=>[r.id,r]));
  const edges=dependencies.filter(e=>e.lifecycle==='active');
  const parents=new Map<string,CommercialDependency[]>();
  for(const edge of edges){const list=parents.get(edge.dependentRequirementId)||[];list.push(edge);parents.set(edge.dependentRequirementId,list);}
  const relevant=new Set(requiredNow.map(r=>r.id));
  const queue=[...relevant];
  for(let i=0;i<queue.length;i++) for(const edge of parents.get(queue[i])||[]){
    if(active.some(r=>r.id===edge.prerequisiteRequirementId)&&!relevant.has(edge.prerequisiteRequirementId)){
      relevant.add(edge.prerequisiteRequirementId);queue.push(edge.prerequisiteRequirementId);
    }
  }
  const linkedLater=requiredLater.filter(r=>relevant.has(r.id)).length;
  base.coverage={...base.coverage,linkedLaterCount:linkedLater,unscopedLaterCount:requiredLater.length-linkedLater,
    modeledPremiseCount:relevant.size};
  const blocked=deriveKnownBlockers(o.id,readings,dependencies);
  const blockedDownstream=new Set<string>();
  if(blocked.integrity==='valid') for(const item of blocked.blockers) for(const path of item.paths)
    for(const id of path.requirementIds.slice(1)) blockedDownstream.add(id);
  base.premises=[...relevant].map(id=>byReading.get(id)).filter((r):r is RequirementReading=>Boolean(r))
    .map(r=>({requirementId:r.requirement.id,expectedOutcome:r.requirement.expectedOutcome,role:r.requirement.role,
      state:stateOf(r),blocked:blockedDownstream.has(r.requirement.id),conditionId:r.condition?.id||null,
      conditionStatement:r.condition?.statement||null,
      evidenceSources:unique(r.sourceEvidenceIds).map(id=>({id,summary:byEvidence.get(id)?.summary||id,
        assessment:r.condition?.evidenceLinks.find(link=>link.evidenceId===id)?.assessment||'supports'})),
      evidenceIds:unique(r.sourceEvidenceIds),sourceRecordIds:unique([r.requirement.id,r.condition?.id||'',...r.sourceEvidenceIds])}))
    .sort((a,b)=>a.requirementId.localeCompare(b.requirementId));
  if(blocked.integrity==='valid') base.blockers=blocked.blockers.map(item=>({
    requirementId:item.reading.requirement.id,expectedOutcome:item.reading.requirement.expectedOutcome,state:stateOf(item.reading),
    paths:item.paths.map(p=>({requirementIds:p.requirementIds,dependencyIds:p.dependencyIds,explanations:p.explanations})),
    sourceRecordIds:unique([item.reading.requirement.id,...item.reading.sourceEvidenceIds,
      ...item.paths.flatMap(p=>p.dependencyIds)])}));
  const blockerReadings=base.blockers.map(b=>byReading.get(b.requirementId)).filter((r):r is RequirementReading=>Boolean(r));
  const question=nextBestQuestion(blockerReadings.length?blockerReadings:readings.filter(r=>relevant.has(r.requirement.id)));
  if(question)base.nextQuestion={requirementId:question.requirement.id,question:requirementQuestion(question)};
  const unresolved=base.premises.some(p=>p.state!=='supported');
  if(!unresolved)base.timingEvaluation='not_needed';
  else {
    base.timing=deriveCommercialTime({opportunity:o,requirements,conditions,evidence,dependencies,assertions:timingAssertions,
      commitments,today:input.today,calculatedAt:input.calculatedAt});
    base.timingEvaluation=base.timing.status==='target_no_longer_supported'?'unsupported'
      :base.timing.status==='known'?(base.timing.assumptionsUsed?'conditional':'supported'):'incomplete';
  }
  const anchoredRequirementId=timingAssertions.find(a=>a.id===base.timing?.targetAnchorId)?.requirementId;
  const unanchoredNow=requiredNow.filter(r=>byReading.get(r.id)?.resolution!=='resolved'&&r.id!==anchoredRequirementId);
  if(unanchoredNow.length&&base.timingEvaluation!=='unsupported')base.timingEvaluation='incomplete';
  base.whatWouldHaveToBeTrue=base.blockers.map(b=>({kind:'premise' as const,
    text:`${b.expectedOutcome} must be confirmed.`,sourceRecordIds:b.sourceRecordIds}));
  const blockerIds=new Set(base.blockers.map(b=>b.requirementId));
  for(const p of base.premises.filter(p=>(p.state==='assumed'||p.state==='hypothesis')&&!blockerIds.has(p.requirementId)))
    base.whatWouldHaveToBeTrue.push({kind:'premise',text:`${p.expectedOutcome} must be confirmed beyond the current ${p.state}.`,sourceRecordIds:p.sourceRecordIds});
  if(base.coverage.unscopedLaterCount)base.whatWouldHaveToBeTrue.push({kind:'scope',
    text:`${base.coverage.unscopedLaterCount} required-later outcome(s) have no recorded path to this close claim.`,
    sourceRecordIds:requiredLater.filter(r=>!relevant.has(r.id)).map(r=>r.id)});
  if(unanchoredNow.length&&base.timing?.targetAnchorId)base.whatWouldHaveToBeTrue.push({kind:'timing',
    text:`${unanchoredNow.length} unresolved required-now outcome(s) are outside the single recorded target timing path.`,
    sourceRecordIds:unanchoredNow.map(r=>r.id)});
  if(base.timingEvaluation==='incomplete')base.whatWouldHaveToBeTrue.push({kind:'timing',
    text:`The close date needs a complete timing basis: ${base.timing?.unknownTimingSegments.join(' ')||
      (unanchoredNow.length?'Some required-now outcomes have no target timing path.':'No timing model is recorded.')}`,
    sourceRecordIds:unique([base.timing?.targetAnchorId||'',...base.timing?.timingSources.map(s=>s.id)||[]])});
  if(base.timingEvaluation==='conditional')base.whatWouldHaveToBeTrue.push({kind:'timing',
    text:'The close date relies on explicit planning duration assumptions.',sourceRecordIds:base.timing?.timingSources.filter(s=>s.epistemic==='assumed').map(s=>s.id)||[]});
  const contradicted=base.premises.some(p=>p.state==='contradicted');
  const unknown=base.premises.some(p=>p.state==='unknown');
  const conditional=base.premises.some(p=>p.state==='assumed'||p.state==='hypothesis')||base.timingEvaluation==='conditional';
  const targetElapsed=input.today>claim.targetDate;
  if(targetElapsed)base.whatWouldHaveToBeTrue.push({kind:'timing',text:`The recorded close target ${claim.targetDate} has passed while this Opportunity remains active.`,sourceRecordIds:[o.id]});
  base.verdict=contradicted||base.timingEvaluation==='unsupported'||targetElapsed?'not_currently_supported'
    :unknown||base.coverage.unscopedLaterCount>0||base.timingEvaluation==='incomplete'||blocked.integrity!=='valid'?'incomplete'
      :conditional?'conditional':'defensible';
  if(o.forecastEvidenceCategory==='Defensible'&&base.verdict!=='defensible')base.categoryDisagreement='operator_more_confident';
  if(o.forecastEvidenceCategory==='Unsupported'&&base.verdict==='defensible')base.categoryDisagreement='operator_less_confident';
  base.reasonCodes=unique([
    ...(contradicted?['REQUIRED_PREMISE_CONTRADICTED']:[]),...(unknown?['REQUIRED_PREMISE_UNKNOWN']:[]),
    ...(conditional?['EXPLICIT_ASSUMPTION_OR_HYPOTHESIS']:[]),...(base.coverage.unscopedLaterCount?['LATER_SCOPE_UNCLEAR']:[]),
    ...(blocked.integrity!=='valid'?['DEPENDENCY_INTEGRITY_UNKNOWN']:[]),
    ...(base.timingEvaluation==='incomplete'?['TIMING_INCOMPLETE']:[]),
    ...(unanchoredNow.length&&base.timing?.targetAnchorId?['UNANCHORED_REQUIRED_NOW_TIMING']:[]),
    ...(base.timingEvaluation==='unsupported'?['TIMING_UNSUPPORTED']:[]),
    ...(targetElapsed?['CLOSE_TARGET_ELAPSED']:[]),
    ...(base.categoryDisagreement?['OPERATOR_CATEGORY_DISAGREES']:[])]);
  base.sourceRecordIds=unique([o.id,...base.premises.flatMap(p=>p.sourceRecordIds),...
    base.blockers.flatMap(b=>b.sourceRecordIds),...(base.timing?timingAssertions.filter(r=>r.lifecycle==='active').map(r=>r.id):[]),...
    base.timing?.blockers.flatMap(b=>b.commitmentIds)||[]]);
  return base;
}

export type ForecastPortfolioInput=Omit<ForecastDefensibilityInput,'opportunity'|'requirements'|'conditions'|'evidence'|'dependencies'|'timingAssertions'|'commitments'>
  &{opportunities:CrmLiteOpportunity[];requirements:OutcomeRequirement[];conditions:CommercialCondition[];evidence:CommercialEvidence[];
    dependencies:CommercialDependency[];timingAssertions:CommercialTimingAssertion[];commitments:CommercialCommitment[]};

/** Group once, then evaluate bounded Opportunity-local slices for Review/Today. */
export function deriveForecastPortfolio(input:ForecastPortfolioInput):Map<string,ForecastDefensibility>{
  const group=<T,>(rows:T[],key:(r:T)=>string|null|undefined)=>{
    const result=new Map<string,T[]>();for(const row of rows){const id=key(row);if(!id)continue;const list=result.get(id)||[];list.push(row);result.set(id,list);}return result;
  };
  const requirements=group(input.requirements,r=>r.opportunityId),conditions=group(input.conditions,r=>r.accountId),
    evidenceByAccount=group(input.evidence,r=>r.accountId),evidenceByOpportunity=group(input.evidence.filter(r=>!r.accountId),r=>r.opportunityId),
    dependencies=group(input.dependencies,r=>r.opportunityId),timing=group(input.timingAssertions,r=>r.opportunityId),
    commitments=group(input.commitments,r=>r.opportunityId);
  return new Map(input.opportunities.map(o=>[o.id,deriveForecastDefensibility({opportunity:o,
    requirements:requirements.get(o.id)||[],conditions:conditions.get(o.accountId||'')||[],
    evidence:[...evidenceByAccount.get(o.accountId||'')||[],...evidenceByOpportunity.get(o.id)||[]],
    dependencies:dependencies.get(o.id)||[],timingAssertions:timing.get(o.id)||[],commitments:commitments.get(o.id)||[],
    today:input.today,calculatedAt:input.calculatedAt})]));
}
