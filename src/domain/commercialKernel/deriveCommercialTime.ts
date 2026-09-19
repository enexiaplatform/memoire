import { isValidBusinessDate } from '../../utils/safeDate.ts';
import { deriveKnownBlockers, type CommercialDependency } from './commercialDependency.ts';
import { projectOutcomeRequirements, type OutcomeRequirement } from './outcomeRequirement.ts';
import { validateTimingAssertions, type CommercialTimingAssertion } from './commercialTiming.ts';
import type { CommercialCondition } from './commercialCondition.ts';
import type { CommercialEvidence } from './commercialEvidence.ts';
import type { CommercialCommitment } from './types.ts';
import type { CrmLiteOpportunity } from '../../services/opportunityStore.ts';

export type TimingStatus = 'unknown' | 'partial' | 'conflicted' | 'known' | 'target_no_longer_supported';
export type TimingSource = Pick<CommercialTimingAssertion, 'id'|'requirementId'|'durationDays'|'durationUnit'|'epistemic'|'sourceKind'|'sourceReference'|'basis'|'evidenceId'>;
export type TimedBlocker = {
  requirementId: string;
  expectedOutcome: string;
  lastSafeDate: string | null;
  commitmentDueDate: string | null;
  commitmentIds: string[];
  bufferDays: number | null;
  pathRequirementIds: string[];
  pathDependencyIds: string[];
  unknownSegments: string[];
  conflictingSegments: string[];
  assumptionsUsed: boolean;
};
export type CommercialTimeResult = {
  opportunityId: string;
  targetType: 'opportunity_close';
  targetDate: string | null;
  targetAnchorId: string | null;
  status: TimingStatus;
  lastSafeDate: string | null;
  bufferDays: number | null;
  recoveryWindowDays: number | null;
  constrainingPath: string[];
  blockers: TimedBlocker[];
  timingSources: TimingSource[];
  assumptionsUsed: boolean;
  unknownTimingSegments: string[];
  conflictingTimingSegments: string[];
  calculatedAt: string;
};
export type CommercialTimeInput = {
  opportunity: CrmLiteOpportunity;
  requirements: OutcomeRequirement[];
  conditions: CommercialCondition[];
  evidence: CommercialEvidence[];
  dependencies: CommercialDependency[];
  assertions: CommercialTimingAssertion[];
  commitments: CommercialCommitment[];
  /** A local commercial date key, explicitly supplied by the caller. */
  today: string;
  calculatedAt: string;
};

const dayNumber = (date: string) => Math.floor(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1,Number(date.slice(8,10)))/86_400_000);
const dateFromDay = (day: number) => new Date(day*86_400_000).toISOString().slice(0,10);
const unique = (values: string[]) => [...new Set(values)].sort();
type PathState = { days: number; path: string[]; unknown: string[]; conflicts: string[]; assumptions: boolean };

/** Date-only arithmetic: no local/UTC day conversion and no hidden business
 * calendar. Business-day assertions remain visible but do not produce dates. */
export function deriveCommercialTime(input: CommercialTimeInput): CommercialTimeResult {
  const {opportunity: o} = input;
  const result: CommercialTimeResult = {opportunityId:o.id,targetType:'opportunity_close',targetDate:null,targetAnchorId:null,
    status:'unknown',lastSafeDate:null,bufferDays:null,recoveryWindowDays:null,constrainingPath:[],blockers:[],
    timingSources:[],assumptionsUsed:false,unknownTimingSegments:[],conflictingTimingSegments:[],calculatedAt:input.calculatedAt};
  const sameScope = (r:{userId?:string|null;isSample?:boolean}) => (r.userId??null)===(o.userId??null)
    && Boolean(r.isSample)===Boolean(o.isSample);
  const requirements=input.requirements.filter(r=>r.opportunityId===o.id && sameScope(r));
  const dependencies=input.dependencies.filter(r=>r.opportunityId===o.id && sameScope(r));
  const assertions=input.assertions.filter(r=>r.opportunityId===o.id && sameScope(r));
  const commitments=input.commitments.filter(r=>r.opportunityId===o.id && sameScope(r));
  const conditions=input.conditions.filter(sameScope);
  const evidence=input.evidence.filter(sameScope);
  try {validateTimingAssertions(assertions,{opportunities:[o],requirements,commitments,evidence});}
  catch(error){result.status='conflicted';result.conflictingTimingSegments=[error instanceof Error?error.message:'Timing references are invalid.'];return result;}
  const anchors=assertions.filter(r=>r.kind==='target_anchor' && r.lifecycle==='active');
  if (!anchors.length) {result.unknownTimingSegments=['No required-now outcome is explicitly linked to the Opportunity close target.'];return result;}
  const anchor=anchors[0];result.targetAnchorId=anchor.id;
  if(!isValidBusinessDate(o.expectedClosePeriod)){
    result.unknownTimingSegments=['Opportunity expected close is not a valid day-level target.'];return result;
  }
  if(!isValidBusinessDate(input.today)) {result.unknownTimingSegments=['Current commercial day is invalid.'];return result;}
  result.targetDate=o.expectedClosePeriod;
  const readings=projectOutcomeRequirements(requirements,conditions,evidence);
  const known=deriveKnownBlockers(o.id,readings,dependencies,[anchor.requirementId]);
  if(known.integrity!=='valid') {result.status='conflicted';result.conflictingTimingSegments=[`Dependency graph: ${known.integrity}`];return result;}
  if(!known.blockers.length){result.unknownTimingSegments=['The anchored outcome has no unresolved current blocker.'];return result;}
  const byRequirement=new Map(requirements.map(r=>[r.id,r]));
  const unresolved=new Set(readings.filter(r=>r.requirement.lifecycle==='active' && r.resolution!=='resolved').map(r=>r.requirement.id));
  const adjacency=new Map<string,CommercialDependency[]>();
  for(const edge of dependencies){
    if(edge.lifecycle!=='active' || !unresolved.has(edge.dependentRequirementId) || !unresolved.has(edge.prerequisiteRequirementId)) continue;
    const list=adjacency.get(edge.dependentRequirementId)||[];list.push(edge);adjacency.set(edge.dependentRequirementId,list);
  }
  const reachable=new Set<string>([anchor.requirementId]);const queue=[anchor.requirementId];
  for(let i=0;i<queue.length;i++) for(const edge of adjacency.get(queue[i])||[]) if(!reachable.has(edge.prerequisiteRequirementId)){
    reachable.add(edge.prerequisiteRequirementId);queue.push(edge.prerequisiteRequirementId);
  }
  const indegree=new Map([...reachable].map(id=>[id,0]));
  for(const id of reachable) for(const edge of adjacency.get(id)||[]) if(reachable.has(edge.prerequisiteRequirementId))
    indegree.set(edge.prerequisiteRequirementId,(indegree.get(edge.prerequisiteRequirementId)||0)+1);
  const durations=new Map<string,CommercialTimingAssertion[]>();
  for(const row of assertions.filter(r=>r.lifecycle==='active' && r.kind==='duration' && byRequirement.get(r.requirementId)?.lifecycle==='active')){
    const list=durations.get(row.requirementId)||[];list.push(row);durations.set(row.requirementId,list);
  }
  const states=new Map<string,PathState>([[anchor.requirementId,{days:0,path:[anchor.requirementId],unknown:[],conflicts:[],assumptions:false}]]);
  const ready=[anchor.requirementId];
  for(let i=0;i<ready.length;i++){
    const id=ready[i],state=states.get(id)!;
    const rows=durations.get(id)||[];
    const values=new Set(rows.map(r=>`${r.durationDays}:${r.durationUnit}`));
    const label=byRequirement.get(id)?.expectedOutcome||id;
    const missing=rows.length===0?[`${label}: resolution duration is unknown.`]:[];
    const conflicting=values.size>1?[`${label}: active duration sources conflict.`]:[];
    const business=rows.some(r=>r.durationUnit==='business_days')?[`${label}: business-day calendar is not configured.`]:[];
    if((adjacency.get(id)||[]).length) for(const row of rows) result.timingSources.push({id:row.id,requirementId:row.requirementId,durationDays:row.durationDays,
      durationUnit:row.durationUnit,epistemic:row.epistemic,sourceKind:row.sourceKind,sourceReference:row.sourceReference,basis:row.basis,evidenceId:row.evidenceId});
    for(const edge of adjacency.get(id)||[]){
      const child=edge.prerequisiteRequirementId;
      const next:PathState={days:state.days+(rows[0]?.durationUnit==='calendar_days' && values.size===1?rows[0].durationDays||0:0),
        path:[...state.path,child],unknown:unique([...state.unknown,...missing,...business]),conflicts:unique([...state.conflicts,...conflicting]),
        assumptions:state.assumptions||rows.some(r=>r.epistemic==='assumed')};
      const held=states.get(child);
      if(!held) states.set(child,next);
      else states.set(child,{days:Math.max(held.days,next.days),path:next.days>held.days?next.path:held.path,
        unknown:unique([...held.unknown,...next.unknown]),conflicts:unique([...held.conflicts,...next.conflicts]),
        assumptions:held.assumptions||next.assumptions});
      indegree.set(child,(indegree.get(child)||0)-1);
      if(indegree.get(child)===0) ready.push(child);
    }
  }
  const links=new Map<string,CommercialTimingAssertion[]>();
  for(const row of assertions.filter(r=>r.lifecycle==='active' && r.kind==='commitment_link')){
    const list=links.get(row.requirementId)||[];list.push(row);links.set(row.requirementId,list);
  }
  for(const blocker of known.blockers){
    const r=blocker.reading.requirement,state=states.get(r.id)!;
    const linkRows=links.get(r.id)||[];
    const linked=linkRows.map(row=>commitments.find(c=>c.id===row.commitmentId)).filter((c):c is CommercialCommitment=>Boolean(c && c.status==='open' && isValidBusinessDate(c.currentDueDate)));
    const dueDates=unique(linked.map(c=>c.currentDueDate));
    const conflicts=unique([...state.conflicts,...(dueDates.length>1?[`${r.expectedOutcome}: linked Commitments have conflicting due dates.`]:[])]);
    const lastSafeDate=!state.unknown.length && !conflicts.length?dateFromDay(dayNumber(result.targetDate)-state.days):null;
    const commitmentDueDate=dueDates.length===1?dueDates[0]:null;
    const dueUsable=commitmentDueDate && commitmentDueDate>=input.today ? commitmentDueDate : null;
    const bufferDays=lastSafeDate && dueUsable?dayNumber(lastSafeDate)-dayNumber(dueUsable):null;
    const pathRequirementIds=[...state.path].reverse();
    const pathDependencyIds=pathRequirementIds.slice(0,-1).map((id,index)=>
      (adjacency.get(pathRequirementIds[index+1])||[]).find(edge=>edge.prerequisiteRequirementId===id)?.id||'');
    result.blockers.push({requirementId:r.id,expectedOutcome:r.expectedOutcome,lastSafeDate,commitmentDueDate,
      commitmentIds:linked.map(c=>c.id),bufferDays,pathRequirementIds,pathDependencyIds,
      unknownSegments:state.unknown,conflictingSegments:conflicts,assumptionsUsed:state.assumptions});
  }
  result.timingSources=[...new Map(result.timingSources.map(r=>[r.id,r])).values()];
  result.unknownTimingSegments=unique(result.blockers.flatMap(r=>r.unknownSegments));
  result.conflictingTimingSegments=unique(result.blockers.flatMap(r=>r.conflictingSegments));
  result.assumptionsUsed=result.blockers.some(r=>r.assumptionsUsed);
  if(result.conflictingTimingSegments.length){result.status='conflicted';return result;}
  if(result.unknownTimingSegments.length){result.status='partial';return result;}
  const constraining=[...result.blockers].sort((a,b)=>(a.lastSafeDate||'').localeCompare(b.lastSafeDate||'')||a.requirementId.localeCompare(b.requirementId))[0];
  result.lastSafeDate=constraining.lastSafeDate;
  result.constrainingPath=constraining.pathRequirementIds;
  result.recoveryWindowDays=dayNumber(result.lastSafeDate!)-dayNumber(input.today);
  if(result.blockers.every(r=>r.bufferDays!==null)) result.bufferDays=Math.min(...result.blockers.map(r=>r.bufferDays!));
  result.status=result.recoveryWindowDays<0 || result.blockers.some(r=>r.bufferDays!==null && r.bufferDays<0)
    ?'target_no_longer_supported':'known';
  return result;
}
