import type { SourceMetadata } from './types.ts';
import { isValidBusinessDate } from '../../utils/safeDate.ts';
import type { OutcomeRequirement, RequirementReading } from './outcomeRequirement.ts';

/** M4's only legal edge: a dependent Outcome Requirement requires a prerequisite
 * Outcome Requirement in the same Opportunity. No observed-sequence edges. */
export type CommercialDependency = SourceMetadata & {
  sourceType: 'manual';
  id: string;
  userId: string | null;
  opportunityId: string;
  dependentRequirementId: string;
  prerequisiteRequirementId: string;
  basis: string;
  lifecycle: 'active' | 'retired';
  createdAt: string;
  updatedAt: string;
  isSample?: boolean;
};

const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)
  && isValidBusinessDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
export function isCommercialDependency(value: unknown): value is CommercialDependency {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r=value as CommercialDependency;
  return nonempty(r.id) && r.id.length<=200 && (r.userId===null || nonempty(r.userId))
    && nonempty(r.opportunityId) && nonempty(r.dependentRequirementId) && nonempty(r.prerequisiteRequirementId)
    && r.dependentRequirementId!==r.prerequisiteRequirementId
    && nonempty(r.basis) && r.basis.length<=1000
    && ['active','retired'].includes(r.lifecycle) && r.sourceType==='manual'
    && (r.sourceId==null || typeof r.sourceId==='string') && (r.sourceUrl==null || typeof r.sourceUrl==='string')
    && (r.sourceUpdatedAt==null || instant(r.sourceUpdatedAt))
    && instant(r.createdAt) && instant(r.updatedAt) && Date.parse(r.updatedAt)>=Date.parse(r.createdAt);
}

export type DependencyIntegrityCode = 'invalid_record' | 'duplicate_id' | 'missing_endpoint' | 'scope_mismatch' | 'duplicate_active_edge' | 'cycle';
export class DependencyIntegrityError extends Error {
  readonly code: DependencyIntegrityCode;
  constructor(code: DependencyIntegrityCode, message: string) { super(message); this.name='DependencyIntegrityError'; this.code=code; }
}

/** One shared validator for commands, restore and projections. Retired endpoints
 * remain valid history, but edges touching them do not participate in the DAG. */
export function validateDependencyGraph(requirements: OutcomeRequirement[], dependencies: CommercialDependency[]): void {
  const byRequirement=new Map(requirements.map(r=>[r.id,r]));
  const seenIds=new Set<string>(); const seenPairs=new Set<string>();
  const adjacency=new Map<string,string[]>();
  for(const edge of dependencies) {
    if(!isCommercialDependency(edge)) throw new DependencyIntegrityError('invalid_record','Check the prerequisite, explanation and dates.');
    if(seenIds.has(edge.id)) throw new DependencyIntegrityError('duplicate_id','Duplicate dependency identity.');
    seenIds.add(edge.id);
    const dependent=byRequirement.get(edge.dependentRequirementId);
    const prerequisite=byRequirement.get(edge.prerequisiteRequirementId);
    if(!dependent || !prerequisite) throw new DependencyIntegrityError('missing_endpoint','Both requirements must exist.');
    if(dependent.userId!==edge.userId || prerequisite.userId!==edge.userId
      || dependent.opportunityId!==edge.opportunityId || prerequisite.opportunityId!==edge.opportunityId
      || Boolean(dependent.isSample)!==Boolean(edge.isSample) || Boolean(prerequisite.isSample)!==Boolean(edge.isSample))
      throw new DependencyIntegrityError('scope_mismatch','Prerequisites must belong to this opportunity and workspace.');
    if(edge.lifecycle!=='active' || dependent.lifecycle!=='active' || prerequisite.lifecycle!=='active') continue;
    const pair=JSON.stringify([edge.userId,edge.opportunityId,edge.dependentRequirementId,edge.prerequisiteRequirementId]);
    if(seenPairs.has(pair)) throw new DependencyIntegrityError('duplicate_active_edge','This active prerequisite is already recorded.');
    seenPairs.add(pair);
    const list=adjacency.get(edge.dependentRequirementId)||[]; list.push(edge.prerequisiteRequirementId); adjacency.set(edge.dependentRequirementId,list);
  }
  // Iterative DFS: bounded by the current same-Opportunity graph and safe for
  // a corrupted legacy cycle; no recursion depth or endless traversal.
  const color=new Map<string,0|1|2>();
  for(const start of adjacency.keys()) {
    if(color.get(start)===2) continue;
    const stack:Array<{id:string;next:number}>=[{id:start,next:0}]; color.set(start,1);
    while(stack.length) {
      const frame=stack[stack.length-1]; const children=adjacency.get(frame.id)||[];
      if(frame.next>=children.length){color.set(frame.id,2);stack.pop();continue;}
      const child=children[frame.next++];
      if(color.get(child)===1) throw new DependencyIntegrityError('cycle','Requirements cannot depend on each other in a cycle.');
      if(color.get(child)!==2){color.set(child,1);stack.push({id:child,next:0});}
    }
  }
}

export type BlockerPath = {
  /** Leaf blocker first, then every dependent up to the required-now root. */
  requirementIds: string[];
  dependencyIds: string[];
  explanations: string[];
};
export type KnownBlocker = { reading: RequirementReading; paths: BlockerPath[] };
export type KnownBlockers = { integrity: 'valid' | DependencyIntegrityCode; blockers: KnownBlocker[]; requiredNowUnresolved: number };

/** Smallest known unresolved leaves under active, conjunctive hard edges.
 * No claim that the operator recorded every real-world prerequisite. */
export function deriveKnownBlockers(opportunityId:string, readings:RequirementReading[], dependencies:CommercialDependency[], rootRequirementIds?:readonly string[]):KnownBlockers {
  const scoped=readings.filter(r=>r.requirement.opportunityId===opportunityId);
  const byId=new Map(scoped.map(r=>[r.requirement.id,r]));
  const edges=dependencies.filter(d=>d.opportunityId===opportunityId);
  const selectedRoots=rootRequirementIds?new Set(rootRequirementIds):null;
  const roots=scoped.filter(r=>r.requirement.lifecycle==='active' && r.requirement.role==='required_now' && r.resolution!=='resolved'
    && (!selectedRoots || selectedRoots.has(r.requirement.id)));
  try {validateDependencyGraph(scoped.map(r=>r.requirement),edges);} catch(error) {
    return {integrity:error instanceof DependencyIntegrityError?error.code:'invalid_record',blockers:[],requiredNowUnresolved:roots.length};
  }
  const parents=new Map<string,CommercialDependency[]>();
  for(const edge of edges) {
    const d=byId.get(edge.dependentRequirementId),p=byId.get(edge.prerequisiteRequirementId);
    if(edge.lifecycle!=='active' || d?.requirement.lifecycle!=='active' || p?.requirement.lifecycle!=='active') continue;
    const list=parents.get(edge.dependentRequirementId)||[];list.push(edge);parents.set(edge.dependentRequirementId,list);
  }
  for(const list of parents.values()) list.sort((a,b)=>a.id.localeCompare(b.id));
  const blockers=new Map<string,KnownBlocker>();
  for(const root of roots) {
    const visited=new Set<string>();
    const stack:Array<{id:string;path:BlockerPath}>=[{id:root.requirement.id,path:{requirementIds:[root.requirement.id],dependencyIds:[],explanations:[]}}];
    while(stack.length) {
      const {id,path}=stack.pop()!;if(visited.has(id)) continue;visited.add(id);
      const upstream=(parents.get(id)||[]).filter(e=>byId.get(e.prerequisiteRequirementId)?.resolution!=='resolved');
      if(!upstream.length) {
        const reading=byId.get(id)!;const current=blockers.get(id)||{reading,paths:[]};
        current.paths.push({requirementIds:[...path.requirementIds].reverse(),dependencyIds:[...path.dependencyIds].reverse(),explanations:[...path.explanations].reverse()});
        blockers.set(id,current);
      } else for(const edge of upstream) stack.push({id:edge.prerequisiteRequirementId,path:{
        requirementIds:[...path.requirementIds,edge.prerequisiteRequirementId],
        dependencyIds:[...path.dependencyIds,edge.id],explanations:[...path.explanations,edge.basis],
      }});
    }
  }
  return {integrity:'valid',blockers:[...blockers.values()].sort((a,b)=>a.reading.requirement.id.localeCompare(b.reading.requirement.id)),requiredNowUnresolved:roots.length};
}
