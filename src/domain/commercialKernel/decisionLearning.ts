import {isCommercialDecision,type CommercialDecision} from './commercialDecision.ts';
import type {CommercialAsOfResult} from '../../services/commercialTimeMachine.ts';
import type {PlanRecord} from '../../utils/weeklyPlan.ts';
import {FORECAST_CALIBRATION_MIN_SAMPLE} from '../../utils/forecastCalibration.ts';

export type ObservedTargetState='resolved'|'unresolved'|'conflicted'|'retired'|'unavailable';
export type ObservedExecutionState='linked'|'completed'|'open'|'cancelled'|'unavailable';
export type DecisionObservationSnapshot={
  version:1;derivedWithCurrentRules:true;
  opportunity:{id:string;name:string;stage:string;status:string;targetDate:string|null;value:number|null;currency:string|null};
  target:{kind:'requirement'|'forecast_claim'|'opportunity';requirementId:string|null;label:string|null;role:string|null;
    state:ObservedTargetState;conditionState:string|null;sourceEvidenceIds:string[]};
  blockers:{requirementId:string;label:string;state:string;sourceRecordIds:string[]}[];
  forecast:{verdict:string;timingEvaluation:string;reasonCodes:string[]}|null;
  timing:{status:string;targetDate:string|null;lastSafeDate:string|null;recoveryWindowDays:number|null;assumptionsUsed:boolean}|null;
  money:{sourceId:string;sourceType:string;amount:number;currency:string;realizationState:string;timingState:string;
    blockerIds:string[];blockerLabels:string[]}[];
  execution:{kind:'action'|'commitment';recordId:string;linkedAt:string;state:ObservedExecutionState;label:string|null}[];
  buyerProgress:{coverage:string;signalCount:number;lastObservedAt:string|null}|null;
  sourceRecordIds:string[];coverage:{core:string;target:string;buyerProgress:string;moneyConsequences:string};
};
export type DecisionObservation={id:string;userId:string|null;accountId:string;opportunityId:string;decisionId:string;
  observationCutoff:string;elapsedDays:number;snapshot:DecisionObservationSnapshot;operatorNote:string;sourceType:'manual';
  finalizedAt:string;createdAt:string;isSample?:boolean};

const iso=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const text=(v:unknown,max:number,required=false)=>typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0);
const unique=(values:string[])=>[...new Set(values)].sort();
export const elapsedObservationDays=(decidedAt:string,cutoff:string)=>Math.floor((Date.parse(cutoff)-Date.parse(decidedAt))/86_400_000);

export function captureDecisionObservationSnapshot(input:{decision:CommercialDecision;asOf:CommercialAsOfResult;plans?:PlanRecord[]}):DecisionObservationSnapshot{
  const {decision,asOf}=input;
  if(asOf.status!=='available'||asOf.coreCoverage!=='full'||!asOf.opportunity||!asOf.forecast)
    throw new Error('Verified core history is required at the observation cutoff.');
  if(asOf.opportunity.id!==decision.opportunityId||asOf.opportunity.accountId!==decision.accountId)
    throw new Error('Observation and Decision scope do not match.');
  if(Date.parse(asOf.cutoff)<Date.parse(decision.decidedAt))throw new Error('Observation cutoff must be at or after the Decision.');
  const targetReading=decision.intervention.targetKind==='requirement'
    ?asOf.requirementReadings.find(row=>row.requirement.id===decision.intervention.targetRequirementId):null;
  const targetState:ObservedTargetState=!targetReading?'unavailable':targetReading.requirement.lifecycle==='retired'
    ?'retired':targetReading.resolution;
  const plans=new Map((input.plans||[]).map(row=>[row.id,row]));
  const commitments=new Map(asOf.commitments.map(row=>[row.id,row]));
  const cutoffTime=Date.parse(asOf.cutoff);
  const execution=decision.executionLinks.filter(link=>Date.parse(link.linkedAt)<=cutoffTime).map(link=>{
    if(link.kind==='commitment'){
      const row=commitments.get(link.recordId);
      return {kind:link.kind,recordId:link.recordId,linkedAt:link.linkedAt,
        state:(!row?'unavailable':row.status==='completed'?'completed':row.status==='cancelled'?'cancelled':'open') as ObservedExecutionState,
        label:row?.commitmentText||null};
    }
    const row=plans.get(link.recordId);
    // Plan has no revision history. It is usable only when its surviving record was last written by the cutoff.
    const safe=Boolean(row&&row.linkedOpportunityId===decision.opportunityId&&Date.parse(row.createdAt)<=cutoffTime&&Date.parse(row.updatedAt)<=cutoffTime);
    return {kind:link.kind,recordId:link.recordId,linkedAt:link.linkedAt,state:(!safe?'unavailable':row!.done?'completed':'open') as ObservedExecutionState,
      label:safe?row!.label:null};
  });
  const buyer=asOf.buyerProgress?.projection?.get(decision.opportunityId);
  const sourceRecordIds=unique([
    ...decision.basisSnapshot.sourceRecordIds,...(targetReading?.sourceEvidenceIds||[]),
    ...(asOf.blockers?.blockers.flatMap(row=>[row.reading.requirement.id,...row.reading.sourceEvidenceIds,...row.paths.flatMap(path=>path.dependencyIds)])||[]),
    ...(asOf.moneyConsequences?.consequences.flatMap(row=>row.sourceRecordIds)||[]),
    ...execution.map(row=>row.recordId),
  ]).slice(0,500);
  return {version:1,derivedWithCurrentRules:true,opportunity:{id:asOf.opportunity.id,name:asOf.opportunity.opportunityName,
    stage:asOf.opportunity.stage,status:asOf.opportunity.status,targetDate:asOf.opportunity.expectedClosePeriod||null,
    value:typeof asOf.opportunity.estimatedValue==='number'?asOf.opportunity.estimatedValue:null,currency:asOf.opportunity.currency||null},
    target:{kind:decision.intervention.targetKind,requirementId:decision.intervention.targetRequirementId,
      label:targetReading?.requirement.expectedOutcome||null,role:targetReading?.requirement.role||null,state:targetState,
      conditionState:targetReading?.conditionState||null,sourceEvidenceIds:[...(targetReading?.sourceEvidenceIds||[])]},
    blockers:(asOf.blockers?.blockers||[]).slice(0,100).map(row=>({requirementId:row.reading.requirement.id,
      label:row.reading.requirement.expectedOutcome,state:row.reading.resolution,
      sourceRecordIds:unique([row.reading.requirement.id,...row.reading.sourceEvidenceIds,...row.paths.flatMap(path=>path.dependencyIds)])})),
    forecast:{verdict:asOf.forecast.verdict,timingEvaluation:asOf.forecast.timingEvaluation,reasonCodes:[...asOf.forecast.reasonCodes]},
    timing:asOf.forecast.timing?{status:asOf.forecast.timing.status,targetDate:asOf.forecast.timing.targetDate,
      lastSafeDate:asOf.forecast.timing.lastSafeDate,recoveryWindowDays:asOf.forecast.timing.recoveryWindowDays,
      assumptionsUsed:asOf.forecast.timing.assumptionsUsed}:null,
    money:(asOf.moneyConsequences?.consequences||[]).slice(0,100).map(row=>({sourceId:row.moneySourceId,sourceType:row.moneySourceType,
      amount:row.amount,currency:row.currency,realizationState:row.realizationState,timingState:row.timingState,
      blockerIds:row.blockers.map(b=>b.requirementId),blockerLabels:row.blockers.map(b=>b.label)})),execution,
    buyerProgress:asOf.buyerProgress?{coverage:asOf.buyerProgress.coverage.status,signalCount:buyer?.signals.length||0,
      lastObservedAt:buyer?.signals.map(s=>s.occurredAt).sort().at(-1)||null}:null,
    sourceRecordIds,coverage:{core:asOf.coreCoverage,target:targetReading?'full':'unavailable',
      buyerProgress:asOf.coverage.buyerProgress,moneyConsequences:asOf.coverage.moneyConsequences}};
}

export function isDecisionObservation(value:unknown):value is DecisionObservation{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const r=value as Partial<DecisionObservation>,s=r.snapshot;
  const hasSimulationKey=(item:unknown):boolean=>Boolean(item&&typeof item==='object'&&Object.entries(item as Record<string,unknown>)
    .some(([key,child])=>['scenarioid','simulationid','projection'].includes(key.toLowerCase())||hasSimulationKey(child)));
  if(hasSimulationKey(r))return false;
  if(!text(r.id,200,true)||!text(r.accountId,200,true)||!text(r.opportunityId,200,true)||!text(r.decisionId,200,true)
    ||!iso(r.observationCutoff)||!iso(r.finalizedAt)||!iso(r.createdAt)||r.sourceType!=='manual'
    ||!Number.isInteger(r.elapsedDays)||(r.elapsedDays as number)<0||!text(r.operatorNote,2000)||!s||s.version!==1||s.derivedWithCurrentRules!==true
    ||Date.parse(r.observationCutoff as string)>Date.parse(r.finalizedAt as string)||r.createdAt!==r.finalizedAt)return false;
  if(!s.opportunity||s.opportunity.id!==r.opportunityId||!s.target||'projection' in s.target||!['requirement','forecast_claim','opportunity'].includes(s.target.kind)
    ||!['resolved','unresolved','conflicted','retired','unavailable'].includes(s.target.state)||!Array.isArray(s.blockers)||s.blockers.length>100
    ||!Array.isArray(s.money)||s.money.length>100||!Array.isArray(s.execution)||s.execution.length>100
    ||!Array.isArray(s.sourceRecordIds)||s.sourceRecordIds.length>500||s.sourceRecordIds.some(id=>!text(id,200,true))
    ||!s.coverage||typeof s.coverage.core!=='string'||typeof s.coverage.target!=='string')return false;
  return s.execution.every(row=>['action','commitment'].includes(row.kind)&&text(row.recordId,200,true)&&iso(row.linkedAt)
    &&['linked','completed','open','cancelled','unavailable'].includes(row.state));
}

export type DecisionCase={decision:CommercialDecision;observation:DecisionObservation;eligible:boolean;exclusions:string[];
  signature:{targetKind:string;targetDecisionState:string;blocked:boolean;forecastVerdict:string;timingStatus:string;timingAssumptions:boolean};
  targetTransition:{from:string;to:ObservedTargetState};forecastTransition:{from:string;to:string};
  matchReasons:string[];differences:string[]};
export function buildDecisionCase(decision:CommercialDecision,observation:DecisionObservation):DecisionCase{
  const exclusions:string[]=[];
  if(!isCommercialDecision(decision))exclusions.push('invalid_decision');
  if(!isDecisionObservation(observation))exclusions.push('invalid_observation');
  if(decision.isSample||observation.isSample)exclusions.push('sample_data');
  if(decision.id!==observation.decisionId||decision.userId!==observation.userId||decision.opportunityId!==observation.opportunityId||decision.accountId!==observation.accountId)exclusions.push('scope_mismatch');
  if(decision.basisSnapshot.version!==1)exclusions.push('invalid_decision_basis');
  if(!decision.intervention)exclusions.push('missing_intervention');
  if(observation.snapshot.coverage.core!=='full'||(decision.intervention.targetKind==='requirement'&&observation.snapshot.coverage.target!=='full'))exclusions.push('insufficient_core_history');
  if(elapsedObservationDays(decision.decidedAt,observation.observationCutoff)!==observation.elapsedDays)exclusions.push('invalid_horizon');
  const premise=decision.intervention.targetRequirementId?decision.basisSnapshot.premises.find(p=>p.requirementId===decision.intervention.targetRequirementId):null;
  return {decision,observation,eligible:exclusions.length===0,exclusions,signature:{targetKind:decision.intervention.targetKind,
    targetDecisionState:premise?.state||'unavailable',blocked:Boolean(decision.intervention.targetRequirementId&&decision.basisSnapshot.blockers.some(b=>b.requirementId===decision.intervention.targetRequirementId)),
    forecastVerdict:decision.basisSnapshot.forecast.verdict,timingStatus:decision.basisSnapshot.timing?.status||'unavailable',
    timingAssumptions:Boolean(decision.basisSnapshot.timing?.assumptionsUsed)},targetTransition:{from:premise?.state||'unavailable',to:observation.snapshot.target.state},
    forecastTransition:{from:decision.basisSnapshot.forecast.verdict,to:observation.snapshot.forecast?.verdict||'unavailable'},matchReasons:[],differences:[]};
}

export function retrieveComparableCases(input:{query:CommercialDecision;decisions:CommercialDecision[];observations:DecisionObservation[];horizonDays:number;limit?:number}){
  if(input.query.isSample)return [];
  const byDecision=new Map<string,DecisionObservation[]>();
  for(const observation of input.observations){const list=byDecision.get(observation.decisionId)||[];list.push(observation);byDecision.set(observation.decisionId,list);}
  const queryCaseBase={targetKind:input.query.intervention.targetKind,targetState:input.query.intervention.targetRequirementId?
    input.query.basisSnapshot.premises.find(p=>p.requirementId===input.query.intervention.targetRequirementId)?.state||'unavailable':'unavailable',
    blocked:Boolean(input.query.intervention.targetRequirementId&&input.query.basisSnapshot.blockers.some(b=>b.requirementId===input.query.intervention.targetRequirementId)),
    forecast:input.query.basisSnapshot.forecast.verdict,timing:input.query.basisSnapshot.timing?.status||'unavailable',assumptions:Boolean(input.query.basisSnapshot.timing?.assumptionsUsed)};
  return input.decisions.filter(d=>d.id!==input.query.id&&d.userId===input.query.userId&&!d.isSample&&d.intervention.targetKind===queryCaseBase.targetKind).flatMap(decision=>{
    const choices=(byDecision.get(decision.id)||[]).filter(o=>!o.isSample&&o.userId===input.query.userId).sort((a,b)=>Math.abs(a.elapsedDays-input.horizonDays)-Math.abs(b.elapsedDays-input.horizonDays)
      ||(a.elapsedDays<=input.horizonDays?-1:1)-(b.elapsedDays<=input.horizonDays?-1:1)||a.observationCutoff.localeCompare(b.observationCutoff)||a.id.localeCompare(b.id));
    if(!choices[0])return [];
    const item=buildDecisionCase(decision,choices[0]);
    const pairs:[string,unknown,unknown][]=[['target state',item.signature.targetDecisionState,queryCaseBase.targetState],['blocker status',item.signature.blocked,queryCaseBase.blocked],
      ['forecast verdict',item.signature.forecastVerdict,queryCaseBase.forecast],['timing status',item.signature.timingStatus,queryCaseBase.timing],['timing assumptions',item.signature.timingAssumptions,queryCaseBase.assumptions]];
    item.matchReasons=pairs.filter(([,a,b])=>a===b).map(([name])=>`Same ${name}`);item.differences=pairs.filter(([,a,b])=>a!==b).map(([name])=>`Different ${name}`);
    return [item];
  }).sort((a,b)=>b.matchReasons.length-a.matchReasons.length||Number(a.observation.elapsedDays!==input.horizonDays)-Number(b.observation.elapsedDays!==input.horizonDays)
    ||b.decision.decidedAt.localeCompare(a.decision.decidedAt)||a.decision.id.localeCompare(b.decision.id)).slice(0,input.limit||20);
}

export function summarizeObservedCases(cases:DecisionCase[],horizonDays:number){
  const exact=new Map(cases.filter(c=>c.eligible&&c.differences.length===0&&c.observation.elapsedDays===horizonDays).map(c=>[c.decision.id,c]));
  const rows=[...exact.values()];
  const count=(value:string)=>rows.filter(row=>row.observation.snapshot.target.state===value).length;
  return {horizonDays,eligibleDecisionCount:rows.length,sufficientSample:rows.length>=FORECAST_CALIBRATION_MIN_SAMPLE,
    minimumSample:FORECAST_CALIBRATION_MIN_SAMPLE,targetStates:{resolved:count('resolved'),unresolved:count('unresolved'),conflicted:count('conflicted'),retired:count('retired'),unavailable:count('unavailable')},
    forecastTransitions:Object.fromEntries([...new Set(rows.map(r=>`${r.forecastTransition.from} → ${r.forecastTransition.to}`))].sort().map(key=>[key,rows.filter(r=>`${r.forecastTransition.from} → ${r.forecastTransition.to}`===key).length])),
    timingStates:Object.fromEntries([...new Set(rows.map(r=>r.observation.snapshot.timing?.status||'unavailable'))].sort().map(key=>[key,rows.filter(r=>(r.observation.snapshot.timing?.status||'unavailable')===key).length])),
    observedMoneyPathStates:Object.fromEntries([...new Set(rows.flatMap(r=>r.observation.snapshot.money.map(m=>`${m.realizationState}:${m.blockerIds.length?'blocked':'no recorded blocker'}`)))].sort()
      .map(key=>[key,rows.filter(r=>r.observation.snapshot.money.some(m=>`${m.realizationState}:${m.blockerIds.length?'blocked':'no recorded blocker'}`===key)).length])),
    executionObserved:rows.filter(r=>r.observation.snapshot.execution.some(e=>e.state!=='unavailable')).length,
    limitations:['M7 does not freeze a structured Intervention kind, so aggregation uses the target and exact situation signature only.',
      'Decision-time Money Gate state is not present in the M7 basis; money is reported as observed cutoff context, not as an attributed change.'],
    disclosure:'Observed associations in your reviewed Decisions at this exact horizon. They do not establish that an Intervention caused an outcome.'};
}
