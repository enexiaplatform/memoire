import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import type {QuoteRecord} from '../../services/quoteStore.ts';
import type {CommercialCondition} from './commercialCondition.ts';
import type {CommercialEvidence} from './commercialEvidence.ts';
import {deriveKnownBlockers,type CommercialDependency} from './commercialDependency.ts';
import {deriveForecastDefensibility,type ForecastDefensibility,type ForecastVerdict} from './deriveForecastDefensibility.ts';
import {deriveMoneyConsequences,type MoneyConsequenceProjection} from './deriveMoneyConsequences.ts';
import type {CommercialTimingAssertion} from './commercialTiming.ts';
import type {CommercialMoneyGate} from './moneyGate.ts';
import {nextBestQuestion,projectOutcomeRequirements,requirementQuestion,type OutcomeRequirement,type RequirementReading,
  type RequirementResolutionOverride} from './outcomeRequirement.ts';
import type {CommercialCommitment} from './types.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';

export type RequirementResolutionAssumption={id:string;type:'requirement_resolution';requirementId:string;
  resolution:'resolved'|'unresolved';effectiveDate?:string|null;label:string;reason:string;providedBy:'operator'};
export type RequirementDurationAssumption={id:string;type:'requirement_duration';requirementId:string;
  durationDays:number;durationUnit:'calendar_days'|'business_days';label:string;reason:string;providedBy:'operator'};
export type TargetDateAssumption={id:string;type:'target_date';targetDate:string;label:string;reason:string;providedBy:'operator'};
export type CommercialScenarioAssumption=RequirementResolutionAssumption|RequirementDurationAssumption|TargetDateAssumption;

export type CommercialScenarioSource={opportunity:CrmLiteOpportunity;requirements:OutcomeRequirement[];
  conditions:CommercialCondition[];evidence:CommercialEvidence[];dependencies:CommercialDependency[];
  timingAssertions:CommercialTimingAssertion[];commitments:CommercialCommitment[];moneyGates:CommercialMoneyGate[];quotes:QuoteRecord[]};
export type CommercialScenarioBase=CommercialScenarioSource&{baseCapturedAt:string;baseIdentity:string;sourceVersion:string};
export type ScenarioValidationError={code:string;message:string;assumptionId?:string};
export type ScenarioQuestion={requirementId:string;question:string}|null;
export type ScenarioDerivedState={requirements:RequirementReading[];blockerIds:string[];blockerLabels:string[];
  nextQuestion:ScenarioQuestion;forecast:ForecastDefensibility;forecastPresentation:ForecastVerdict|'conditional_under_scenario';
  money:MoneyConsequenceProjection;buyerProgress:'unchanged_not_projected'};
export type ScenarioDelta={blockers:{from:string[];to:string[]};nextQuestion:{from:string|null;to:string|null};
  targetDate:{from:string|null;to:string|null};timingStatus:{from:string|null;to:string|null};
  lastSafeDate:{from:string|null;to:string|null};recoveryWindowDays:{from:number|null;to:number|null};
  forecastVerdict:{from:string;to:string};moneyPaths:Array<{sourceId:string;from:string[];to:string[]}>;
  changedFields:string[];unchangedFields:string[]};
export type CommercialScenarioResult={kind:'scenario_result';scenarioId:string;baseIdentity:string;sourceVersion:string;
  baseStatus:'captured'|'stale';baseCapturedAt:string;evaluationTime:string;evaluationDate:string;calculatedAt:string;
  derivedWithCurrentRules:true;assumptions:CommercialScenarioAssumption[];pendingAssumptionIds:string[];
  base:ScenarioDerivedState;projected:ScenarioDerivedState;delta:ScenarioDelta};
export type CommercialScenarioSimulation={ok:true;result:CommercialScenarioResult}|{ok:false;errors:ScenarioValidationError[]};

const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const instant=(value:unknown):value is string=>text(value)&&/^\d{4}-\d{2}-\d{2}T/.test(value)
  &&isValidBusinessDate(value.slice(0,10))&&Number.isFinite(Date.parse(value));
const stable=(value:unknown):string=>{
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b))
    .map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
};
const hash=(value:string)=>{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');};
const normalizeSource=(source:CommercialScenarioSource)=>({opportunity:source.opportunity,
  requirements:[...source.requirements].sort((a,b)=>a.id.localeCompare(b.id)),conditions:[...source.conditions].sort((a,b)=>a.id.localeCompare(b.id)),
  evidence:[...source.evidence].sort((a,b)=>a.id.localeCompare(b.id)),dependencies:[...source.dependencies].sort((a,b)=>a.id.localeCompare(b.id)),
  timingAssertions:[...source.timingAssertions].sort((a,b)=>a.id.localeCompare(b.id)),commitments:[...source.commitments].sort((a,b)=>a.id.localeCompare(b.id)),
  moneyGates:[...source.moneyGates].sort((a,b)=>a.id.localeCompare(b.id)),quotes:[...source.quotes].sort((a,b)=>a.id.localeCompare(b.id))});

/** A deterministic identity for the exact source values supplied to a run. */
export const commercialScenarioSourceVersion=(source:CommercialScenarioSource):string=>`scenario-source-v1:${hash(stable(clone(normalizeSource(source))))}`;

/** Capture once at the UI boundary. Subsequent simulation reads only this
 * deep copy, so a live refresh cannot mix source revisions within a run. */
export function captureCommercialScenarioBase(source:CommercialScenarioSource,baseCapturedAt:string):CommercialScenarioBase{
  if(!instant(baseCapturedAt))throw new Error('Scenario base capture time must be an ISO instant.');
  const copied=clone(normalizeSource(source));
  const sourceVersion=commercialScenarioSourceVersion(copied);
  return {...copied,baseCapturedAt,sourceVersion,baseIdentity:`scenario-base-v1:${hash(`${sourceVersion}:${baseCapturedAt}:${source.opportunity.id}`)}`};
}

export const isCommercialScenarioBaseStale=(base:CommercialScenarioBase,current:CommercialScenarioSource|string):boolean=>
  base.sourceVersion!==(typeof current==='string'?current:commercialScenarioSourceVersion(current));

const assumptionKey=(row:CommercialScenarioAssumption)=>`${row.type}:${row.type==='target_date'?'opportunity':row.requirementId}:${row.id}`;
const normalizedAssumptions=(rows:CommercialScenarioAssumption[])=>clone([...rows].sort((a,b)=>assumptionKey(a).localeCompare(assumptionKey(b))));
const sameScope=(base:CommercialScenarioBase,row:{userId?:string|null;isSample?:boolean})=>(row.userId??null)===(base.opportunity.userId??null)
  &&Boolean(row.isSample)===Boolean(base.opportunity.isSample);

function validate(base:CommercialScenarioBase,assumptions:CommercialScenarioAssumption[],evaluationTime:string,evaluationDate:string,calculatedAt:string):ScenarioValidationError[]{
  const errors:ScenarioValidationError[]=[];
  if(!instant(base.baseCapturedAt)||!text(base.baseIdentity)||!text(base.sourceVersion))errors.push({code:'INVALID_BASE_IDENTITY',message:'The captured scenario base is invalid.'});
  if(!instant(evaluationTime))errors.push({code:'INVALID_EVALUATION_TIME',message:'Evaluation time must be a valid ISO instant.'});
  if(!isValidBusinessDate(evaluationDate))errors.push({code:'INVALID_EVALUATION_DATE',message:'Evaluation date must be a valid business date.'});
  if(!instant(calculatedAt))errors.push({code:'INVALID_CALCULATED_AT',message:'Calculated time must be a valid ISO instant.'});
  if(instant(evaluationTime)&&instant(base.baseCapturedAt)&&Date.parse(evaluationTime)<Date.parse(base.baseCapturedAt))
    errors.push({code:'EVALUATION_BEFORE_BASE',message:'Evaluation time cannot be before the captured base.'});
  const opportunityId=base.opportunity.id,requirements=new Map(base.requirements.map(row=>[row.id,row]));
  const sourceCollections=[base.requirements,base.conditions,base.evidence,base.dependencies,base.timingAssertions,base.commitments,base.moneyGates];
  if(sourceCollections.some(rows=>rows.some(row=>!sameScope(base,row))))errors.push({code:'BASE_SCOPE_MISMATCH',message:'The base contains records from another workspace or sample scope.'});
  if(base.requirements.some(row=>row.opportunityId!==opportunityId)||base.dependencies.some(row=>row.opportunityId!==opportunityId)
    ||base.timingAssertions.some(row=>row.opportunityId!==opportunityId)||base.commitments.some(row=>row.opportunityId!==opportunityId)
    ||base.moneyGates.some(row=>row.opportunityId!==opportunityId)||base.quotes.some(row=>row.opportunityId!==opportunityId))
    errors.push({code:'BASE_OPPORTUNITY_MISMATCH',message:'The base contains records from another Opportunity.'});
  const ids=new Set<string>(),targets=new Map<string,CommercialScenarioAssumption>();
  for(const row of assumptions){
    if(!text(row.id)||ids.has(row.id)){errors.push({code:'DUPLICATE_ASSUMPTION_ID',message:'Each assumption needs a unique identity.',assumptionId:row.id});continue;}ids.add(row.id);
    if(row.providedBy!=='operator'||!text(row.label)||!text(row.reason)||row.label.length>500||row.reason.length>1000)
      errors.push({code:'INVALID_PROVENANCE',message:'Each assumption needs an operator label and reason.',assumptionId:row.id});
    const target=row.type==='target_date'?'target_date':`${row.type}:${row.requirementId}`;
    if(targets.has(target))errors.push({code:'CONTRADICTORY_ASSUMPTIONS',message:'Only one assumption may override the same target.',assumptionId:row.id});else targets.set(target,row);
    if(row.type==='target_date'){if(!isValidBusinessDate(row.targetDate))errors.push({code:'INVALID_TARGET_DATE',message:'Target date is invalid.',assumptionId:row.id});continue;}
    const requirement=requirements.get(row.requirementId);
    if(!requirement||requirement.opportunityId!==opportunityId||!sameScope(base,requirement))errors.push({code:'UNKNOWN_REQUIREMENT',message:'Assumption Requirement is outside this Opportunity.',assumptionId:row.id});
    else if(requirement.lifecycle!=='active')errors.push({code:'RETIRED_REQUIREMENT',message:'A retired Requirement cannot be overridden.',assumptionId:row.id});
    if(row.type==='requirement_resolution'){
      if(!['resolved','unresolved'].includes(row.resolution))errors.push({code:'INVALID_RESOLUTION',message:'Requirement resolution is unsupported.',assumptionId:row.id});
      if(row.effectiveDate!=null&&!isValidBusinessDate(row.effectiveDate))errors.push({code:'INVALID_EFFECTIVE_DATE',message:'Effective date is invalid.',assumptionId:row.id});
    }else if(!Number.isInteger(row.durationDays)||row.durationDays<0||row.durationDays>3650
      ||!['calendar_days','business_days'].includes(row.durationUnit))errors.push({code:'INVALID_DURATION',message:'Duration must use a supported unit and a whole number from 0 to 3650.',assumptionId:row.id});
  }
  return errors;
}

const deriveState=(base:CommercialScenarioBase,opportunity:CrmLiteOpportunity,timingAssertions:CommercialTimingAssertion[],
  overrides:ReadonlyMap<string,RequirementResolutionOverride>|undefined,evaluationDate:string,calculatedAt:string,scenario:boolean):ScenarioDerivedState=>{
  const requirements=projectOutcomeRequirements(base.requirements,base.conditions,base.evidence,{resolutionOverrides:overrides});
  const blockers=deriveKnownBlockers(opportunity.id,requirements,base.dependencies);
  const blockerReadings=blockers.integrity==='valid'?blockers.blockers.map(item=>item.reading):[];
  const question=nextBestQuestion(blockerReadings.length?blockerReadings:requirements);
  const forecast=deriveForecastDefensibility({opportunity,requirements:base.requirements,conditions:base.conditions,evidence:base.evidence,
    dependencies:base.dependencies,timingAssertions,commitments:base.commitments,today:evaluationDate,calculatedAt,
    requirementResolutionOverrides:overrides});
  const money=deriveMoneyConsequences({opportunities:[opportunity],quotes:base.quotes,gates:base.moneyGates,requirements:base.requirements,
    conditions:base.conditions,evidence:base.evidence,dependencies:base.dependencies,timingAssertions,commitments:base.commitments,
    today:evaluationDate,calculatedAt,requirementResolutionOverrides:overrides});
  return {requirements,blockerIds:blockerReadings.map(row=>row.requirement.id),blockerLabels:blockerReadings.map(row=>row.requirement.expectedOutcome),
    nextQuestion:question?{requirementId:question.requirement.id,question:requirementQuestion(question)}:null,forecast,
    forecastPresentation:scenario&&['defensible','conditional'].includes(forecast.verdict)?'conditional_under_scenario':forecast.verdict,
    money,buyerProgress:'unchanged_not_projected'};
};
const moneyPaths=(state:ScenarioDerivedState)=>new Map(state.money.consequences.map(row=>[`${row.moneySourceType}:${row.moneySourceId}`,
  row.blockers.flatMap(blocker=>blocker.paths.map(path=>path.requirementIds.join(' > '))).sort()]));

/** Pure static counterfactual engine. It creates no Events, Evidence,
 * Decisions, records, revisions, or store writes. */
export function simulateCommercialScenario(input:{scenarioId:string;base:CommercialScenarioBase;assumptions:CommercialScenarioAssumption[];
  evaluationTime:string;evaluationDate:string;calculatedAt:string;currentSourceVersion?:string}):CommercialScenarioSimulation{
  const assumptions=normalizedAssumptions(input.assumptions);
  const errors=validate(input.base,assumptions,input.evaluationTime,input.evaluationDate,input.calculatedAt);
  if(errors.length)return {ok:false,errors};
  const base=clone(input.base);
  const baseState=deriveState(base,base.opportunity,base.timingAssertions,undefined,input.evaluationDate,input.calculatedAt,false);
  const overrides=new Map<string,RequirementResolutionOverride>(),pendingAssumptionIds:string[]=[];
  for(const row of assumptions)if(row.type==='requirement_resolution'){
    if(row.effectiveDate&&row.effectiveDate>input.evaluationDate){pendingAssumptionIds.push(row.id);continue;}
    overrides.set(row.requirementId,{assumptionId:row.id,resolution:row.resolution});
  }
  const durationTargets=new Map(assumptions.filter((row):row is RequirementDurationAssumption=>row.type==='requirement_duration').map(row=>[row.requirementId,row]));
  const timingAssertions=base.timingAssertions.filter(row=>!(row.kind==='duration'&&row.lifecycle==='active'&&durationTargets.has(row.requirementId)));
  for(const row of durationTargets.values())timingAssertions.push({id:`scenario:${row.id}`,userId:base.opportunity.userId??null,
    opportunityId:base.opportunity.id,requirementId:row.requirementId,kind:'duration',basis:row.reason,lifecycle:'active',
    durationDays:row.durationDays,durationUnit:row.durationUnit,epistemic:'assumed',sourceKind:'planning_assumption',sourceReference:null,
    evidenceId:null,commitmentId:null,sourceType:'manual',createdAt:input.calculatedAt,updatedAt:input.calculatedAt,isSample:base.opportunity.isSample});
  const target=assumptions.find((row):row is TargetDateAssumption=>row.type==='target_date');
  const opportunity={...base.opportunity,...(target?{expectedClosePeriod:target.targetDate}:{})};
  const projected=deriveState(base,opportunity,timingAssertions,overrides,input.evaluationDate,input.calculatedAt,assumptions.length>0);
  const fromMoney=moneyPaths(baseState),toMoney=moneyPaths(projected),moneyKeys=[...new Set([...fromMoney.keys(),...toMoney.keys()])].sort();
  const moneyDelta=moneyKeys.map(sourceId=>({sourceId,from:fromMoney.get(sourceId)||[],to:toMoney.get(sourceId)||[]}));
  const pairs:Record<string,[unknown,unknown]>={blockers:[baseState.blockerIds,projected.blockerIds],nextQuestion:[baseState.nextQuestion?.question||null,projected.nextQuestion?.question||null],
    targetDate:[baseState.forecast.claim?.targetDate||null,projected.forecast.claim?.targetDate||null],timingStatus:[baseState.forecast.timing?.status||null,projected.forecast.timing?.status||null],
    lastSafeDate:[baseState.forecast.timing?.lastSafeDate||null,projected.forecast.timing?.lastSafeDate||null],recoveryWindowDays:[baseState.forecast.timing?.recoveryWindowDays??null,projected.forecast.timing?.recoveryWindowDays??null],
    forecastVerdict:[baseState.forecast.verdict,projected.forecastPresentation],moneyPaths:[moneyDelta.map(row=>row.from),moneyDelta.map(row=>row.to)]};
  const changedFields=Object.entries(pairs).filter(([,values])=>stable(values[0])!==stable(values[1])).map(([key])=>key);
  const unchangedFields=Object.keys(pairs).filter(key=>!changedFields.includes(key));
  return {ok:true,result:{kind:'scenario_result',scenarioId:input.scenarioId,baseIdentity:base.baseIdentity,sourceVersion:base.sourceVersion,
    baseStatus:input.currentSourceVersion&&input.currentSourceVersion!==base.sourceVersion?'stale':'captured',baseCapturedAt:base.baseCapturedAt,
    evaluationTime:input.evaluationTime,evaluationDate:input.evaluationDate,calculatedAt:input.calculatedAt,derivedWithCurrentRules:true,
    assumptions,pendingAssumptionIds,base:baseState,projected,delta:{blockers:{from:baseState.blockerLabels,to:projected.blockerLabels},
      nextQuestion:{from:baseState.nextQuestion?.question||null,to:projected.nextQuestion?.question||null},targetDate:{from:baseState.forecast.claim?.targetDate||null,to:projected.forecast.claim?.targetDate||null},
      timingStatus:{from:baseState.forecast.timing?.status||null,to:projected.forecast.timing?.status||null},lastSafeDate:{from:baseState.forecast.timing?.lastSafeDate||null,to:projected.forecast.timing?.lastSafeDate||null},
      recoveryWindowDays:{from:baseState.forecast.timing?.recoveryWindowDays??null,to:projected.forecast.timing?.recoveryWindowDays??null},
      forecastVerdict:{from:baseState.forecast.verdict,to:projected.forecastPresentation},moneyPaths:moneyDelta,changedFields,unchangedFields}}};
}

export type ScenarioComparisonRow={scenarioId:string;baseStatus:'captured'|'stale';assumptionCount:number;blockers:string[];
  nextQuestion:string|null;targetDate:string|null;timingStatus:string|null;forecastVerdict:string;moneyPaths:Array<{sourceId:string;paths:string[]}>};
/** Factual side-by-side projection only. No score, ranking, recommendation, or winner. */
export function compareCommercialScenarios(results:CommercialScenarioResult[]):ScenarioComparisonRow[]{
  if(results.length>3)throw new Error('Compare at most three scenarios at once.');
  const baseIdentity=results[0]?.baseIdentity;
  if(results.some(row=>row.baseIdentity!==baseIdentity))throw new Error('Compared scenarios must share one captured base.');
  return results.map(row=>({scenarioId:row.scenarioId,baseStatus:row.baseStatus,assumptionCount:row.assumptions.length,
    blockers:row.projected.blockerLabels,nextQuestion:row.projected.nextQuestion?.question||null,targetDate:row.projected.forecast.claim?.targetDate||null,
    timingStatus:row.projected.forecast.timing?.status||null,forecastVerdict:row.projected.forecastPresentation,
    moneyPaths:[...moneyPaths(row.projected)].map(([sourceId,paths])=>({sourceId,paths}))}));
}
