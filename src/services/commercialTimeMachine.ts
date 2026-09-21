import {projectCommercialConditions, type CommercialCondition} from '../domain/commercialKernel/commercialCondition.ts';
import type {CommercialEvidence} from '../domain/commercialKernel/commercialEvidence.ts';
import {deriveKnownBlockers, type CommercialDependency} from '../domain/commercialKernel/commercialDependency.ts';
import type {CommercialTimingAssertion} from '../domain/commercialKernel/commercialTiming.ts';
import {deriveForecastDefensibility} from '../domain/commercialKernel/deriveForecastDefensibility.ts';
import {nextBestQuestion, projectOutcomeRequirements, type OutcomeRequirement} from '../domain/commercialKernel/outcomeRequirement.ts';
import {deriveBuyerProgressAsOf} from '../domain/commercialKernel/buyerProgress.ts';
import type {CommercialCommitment} from '../domain/commercialKernel/types.ts';
import type {CommercialDecision} from '../domain/commercialKernel/commercialDecision.ts';
import type {CrmLiteOpportunity} from './opportunityStore.ts';
import type {SalesActivityRecord} from './salesActivityStore.ts';
import type {HistoricalSourceComposition} from './historicalQuery.ts';
import {deriveMoneyConsequences,type MoneyConsequenceProjection} from '../domain/commercialKernel/deriveMoneyConsequences.ts';
import type {CommercialMoneyGate} from '../domain/commercialKernel/moneyGate.ts';

export const coreHistoricalProjections=['opportunity','conditions','requirements','nextQuestion',
  'blockers','commercialTime','forecastDefensibility','decisions'] as const;
export type HistoricalCoverageStatus='full'|'partial'|'unavailable'|'pre_coverage'|'corrupt';
export type HistoricalProjectionCoverage=Record<typeof coreHistoricalProjections[number]|'buyerProgress'|'moneyConsequences',HistoricalCoverageStatus>;
export type HistoricalCommercialState=ReturnType<typeof deriveForecastDefensibility>;
export type CommercialAsOfResult={status:'available'|'verified_absent'|'pre_coverage'|'unavailable'|'corrupt';
  cutoff:string;boundary:string|null;coreCoverage:HistoricalCoverageStatus;
  coverage:HistoricalProjectionCoverage;gap:string|null;
  derivedWithCurrentRules:true;metadataInferred:boolean;
  opportunity:CrmLiteOpportunity|null;conditions:ReturnType<typeof projectCommercialConditions>;
  requirementReadings:ReturnType<typeof projectOutcomeRequirements>;
  nextQuestion:ReturnType<typeof nextBestQuestion>;
  blockers:ReturnType<typeof deriveKnownBlockers>|null;
  forecast:HistoricalCommercialState|null;
  buyerProgress:ReturnType<typeof deriveBuyerProgressAsOf>|null;
  moneyConsequences:MoneyConsequenceProjection|null;
  decisions:CommercialDecision[];evidence:CommercialEvidence[];
  recordedAtBySource:Map<string,string>};

/** The commercial calendar day at an exact system-time cutoff, in the user's timezone. */
export function commercialDayAt(cutoff:string,timeZone:string):string{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date(cutoff));
  const value=(part:string)=>parts.find(item=>item.type===part)?.value||'';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
const coverageFor=(status:HistoricalCoverageStatus):HistoricalProjectionCoverage=>Object.fromEntries(
  [...coreHistoricalProjections,'buyerProgress','moneyConsequences'].map(key=>[key,status])) as HistoricalProjectionCoverage;
const empty=(status:CommercialAsOfResult['status'],cutoff:string,boundary:string|null,gap:string|null):CommercialAsOfResult=>{
  const coreCoverage=status==='verified_absent'?'full':status==='pre_coverage'?'pre_coverage':
    status==='corrupt'?'corrupt':'unavailable';
  return {status,cutoff,boundary,gap,coreCoverage,coverage:{...coverageFor(coreCoverage),
    ...(status==='verified_absent'?{buyerProgress:'unavailable' as const,moneyConsequences:'unavailable' as const}:{})},
  derivedWithCurrentRules:true,metadataInferred:false,
  opportunity:null,conditions:new Map(),requirementReadings:[],nextQuestion:null,blockers:null,forecast:null,
  buyerProgress:null,moneyConsequences:null,decisions:[],evidence:[],recordedAtBySource:new Map(),
  };
};

/** The only M8 composition boundary. Callers supply cutoff-safe source revisions; no current canonical loader is used. */
export function composeCommercialStateAsOf(input:{sources:HistoricalSourceComposition;scope:string;
  opportunityId:string;cutoff:string;timeZone:string;decisions?:CommercialDecision[];
  activities?:SalesActivityRecord[]}):CommercialAsOfResult{
  const {sources,scope,opportunityId,cutoff}=input;
  const boundary=sources.coverage?.historyGuaranteedFrom||null;
  if(!Number.isFinite(Date.parse(cutoff)))return empty('unavailable',cutoff,boundary,'Invalid cutoff time.');
  if(sources.status!=='verified')return empty(sources.status==='pre_coverage'?'pre_coverage':
    sources.status==='corrupt'?'corrupt':'unavailable',cutoff,boundary,
    sources.status==='pre_coverage'?'Verified commercial history starts at the shown boundary.':
      sources.status==='unsupported_schema'?'Unsupported historical revision schema.':'Historical source history is unavailable or incomplete.');
  if(sources.coverage.scope!==scope)return empty('unavailable',cutoff,boundary,'Historical workspace ownership does not match.');
  try{
    const at=Date.parse(cutoff),today=commercialDayAt(cutoff,input.timeZone);
    const recordedAtBySource=new Map<string,string>();
    for(const revision of sources.selectedRevisions){
      const state=revision.state;
      if(!state||state.id!==revision.entityId||revision.scope!==scope
        ||(scope==='guest'?(state.userId??null)!==null:state.userId!==scope)
        ||Date.parse(revision.recordedAt)>at)throw new Error('Historical source identity or cutoff mismatch.');
      recordedAtBySource.set(`${revision.entityType}:${revision.entityId}`,revision.recordedAt);
    }
    const opportunity=sources.records.opportunities.find(row=>row.id===opportunityId) as CrmLiteOpportunity|undefined;
    if(!opportunity)return {...empty('verified_absent',cutoff,boundary,null),metadataInferred:sources.metadataInferred,
      recordedAtBySource};
    const sameScope=(row:{userId?:string|null;isSample?:boolean})=>
      (row.userId??null)===(opportunity.userId??null)&&!row.isSample;
    const conditions=(sources.records.commercial_conditions as unknown as CommercialCondition[])
      .filter(row=>sameScope(row)&&row.accountId===opportunity.accountId
        &&(!row.opportunityId||row.opportunityId===opportunityId));
    const evidence=(sources.records.commercial_evidence as unknown as CommercialEvidence[])
      .filter(row=>sameScope(row)&&(row.accountId===opportunity.accountId||!row.accountId&&row.opportunityId===opportunityId)
        &&(!row.opportunityId||row.opportunityId===opportunityId));
    const requirements=(sources.records.commercial_outcome_requirements as unknown as OutcomeRequirement[])
      .filter(row=>sameScope(row)&&row.opportunityId===opportunityId);
    const dependencies=(sources.records.commercial_dependencies as unknown as CommercialDependency[])
      .filter(row=>sameScope(row)&&row.opportunityId===opportunityId);
    const timing=(sources.records.commercial_timing_assertions as unknown as CommercialTimingAssertion[])
      .filter(row=>sameScope(row)&&row.opportunityId===opportunityId);
    const commitments=(sources.records.commercial_commitments as unknown as CommercialCommitment[])
      .filter(row=>sameScope(row)&&row.opportunityId===opportunityId);
    const moneyGates=(sources.records.commercial_money_gates as unknown as CommercialMoneyGate[])
      .filter(row=>sameScope(row)&&row.opportunityId===opportunityId&&row.moneySourceType==='opportunity_value');
    const conditionReadings=projectCommercialConditions(conditions,evidence);
    const requirementReadings=projectOutcomeRequirements(requirements,conditions,evidence);
    const nextQuestion=nextBestQuestion(requirementReadings);
    const blockers=deriveKnownBlockers(opportunityId,requirementReadings,dependencies);
    if(blockers.integrity!=='valid')throw new Error(`Dependency history has ${blockers.integrity}.`);
    const forecast=deriveForecastDefensibility({opportunity,requirements,conditions,evidence,dependencies,
      timingAssertions:timing,commitments,today,calculatedAt:cutoff});
    const buyerProgress=deriveBuyerProgressAsOf({sources,cutoff,activities:input.activities});
    const moneyConsequences=deriveMoneyConsequences({opportunities:[opportunity],quotes:[],gates:moneyGates,
      requirements,conditions,evidence,dependencies,timingAssertions:timing,commitments,today,calculatedAt:cutoff,
      historicalQuoteCoverage:'unavailable'});
    // Decision basis is immutable. Execution links may be added later, so the
    // historical presentation excludes them instead of claiming their old state.
    const decisions=(input.decisions||[]).filter(row=>row.userId===(opportunity.userId??null)
      &&row.opportunityId===opportunityId&&row.accountId===opportunity.accountId
      &&Date.parse(row.decidedAt)<=at&&Date.parse(row.basisSnapshot.capturedAt)<=at)
      .map(row=>({...row,executionLinks:row.executionLinks.filter(link=>Date.parse(link.linkedAt)<=at)}))
      .sort((a,b)=>b.decidedAt.localeCompare(a.decidedAt)||a.id.localeCompare(b.id));
    return {status:'available',cutoff,boundary,coreCoverage:'full',
      coverage:{...coverageFor('full'),buyerProgress:buyerProgress.coverage.status,moneyConsequences:'partial'},
      gap:null,derivedWithCurrentRules:true,metadataInferred:sources.metadataInferred,opportunity,
      conditions:conditionReadings,requirementReadings,nextQuestion,blockers,forecast,buyerProgress,moneyConsequences,
      decisions,evidence,recordedAtBySource};
  }catch(error){return empty('corrupt',cutoff,boundary,error instanceof Error?error.message:'Historical source is invalid.');}
}
