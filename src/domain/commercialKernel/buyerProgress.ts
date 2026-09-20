import type { CrmLiteOpportunity } from '../../services/opportunityStore.ts';
import type { SalesActivityRecord } from '../../services/salesActivityStore.ts';
import type { CommercialCommitment, CommercialEvent } from './types.ts';
import type { CommercialEvidence } from './commercialEvidence.ts';
import type { RequirementReading } from './outcomeRequirement.ts';
import { projectOutcomeRequirements } from './outcomeRequirement.ts';
import type { HistoricalSourceComposition } from '../../services/historicalQuery.ts';
import type { CommercialCondition } from './commercialCondition.ts';
import type { OutcomeRequirement } from './outcomeRequirement.ts';

export type BuyerProgressKind = 'customer_commitment_made' | 'customer_commitment_kept' | 'po_received' | 'payment_received' | 'buyer_requirement_confirmed';
/** Exhaustive contract: adding a signal requires an explicit historical source decision. */
export const buyerProgressSourceAudit={
  customer_commitment_made:{canonicalSource:'commercial_commitments',revisionCovered:true,historical:'verified'},
  customer_commitment_kept:{canonicalSource:'commercial_commitments',revisionCovered:true,historical:'verified'},
  buyer_requirement_confirmed:{canonicalSource:'commercial_evidence+commercial_conditions+commercial_outcome_requirements',
    revisionCovered:true,historical:'verified'},
  po_received:{canonicalSource:'commercial_events',revisionCovered:false,historical:'unavailable',
    durableAlternative:'quotes.poStatus exists but has no revision coverage or event identity mapping'},
  payment_received:{canonicalSource:'commercial_events',revisionCovered:false,historical:'unavailable',
    durableAlternative:'quotes.paymentStatus and order_receivables.receipts are mutable and unversioned'},
} as const satisfies Record<BuyerProgressKind,{canonicalSource:string;revisionCovered:boolean;
  historical:'verified'|'unavailable';durableAlternative?:string}>;
export type BuyerProgressSignal = {
  id:string; kind:BuyerProgressKind; occurredAt:string; opportunityId:string; accountId:string;
  summary:string; sourceRecordId:string; sourceRecordType:'commitment'|'event'|'evidence';
  actorParty:'customer'; sourceEvidenceIds:string[]; reason:string;
  /** Present on historical signals: the selected source revision's system time. */
  recordedAt?:string;sourceCoverage?:'verified'|'current_only';
};
export type BuyerProgressForOpportunity = {
  signals:BuyerProgressSignal[]; last:BuyerProgressSignal|null;
  recordedActivityCount:number; lastRecordedActivityAt:string|null;
};
export type BuyerProgressProjection = Map<string,BuyerProgressForOpportunity>;
export type BuyerProgressInput = {
  opportunities:CrmLiteOpportunity[]; commitments:CommercialCommitment[]; events:CommercialEvent[];
  evidence:CommercialEvidence[]; requirementReadings:RequirementReading[]; activities:SalesActivityRecord[];
  includeSampleRecords?:boolean;
};
export type HistoricalProjectionCoverage={status:'full'|'partial'|'unavailable'|'pre_coverage'|'corrupt';
  unavailableSources:string[]};
export type HistoricalBuyerProgress={coverage:HistoricalProjectionCoverage;projection:BuyerProgressProjection|null};

/** An observed buyer-side signal, never a score or a claim about winning.
 * Activities only populate the separate factual comparison. Legacy Evidence
 * without explicit providedBy is excluded, whatever its text or sourceType. */
export function deriveBuyerProgress(input:BuyerProgressInput):BuyerProgressProjection {
  const includeSamples=input.includeSampleRecords===true;
  const visible=(r:{isSample?:boolean})=>Boolean(r.isSample)===includeSamples;
  const opportunities=new Map(input.opportunities.filter(visible).map(o=>[o.id,o]));
  const result:BuyerProgressProjection=new Map([...opportunities.keys()].map(id=>[id,{signals:[],last:null,recordedActivityCount:0,lastRecordedActivityAt:null}]));
  const add=(opportunityId:string,signal:BuyerProgressSignal,record:{userId?:string|null;isSample?:boolean})=>{
    const o=opportunities.get(opportunityId); const view=result.get(opportunityId);
    if(!o || !view || !visible(record) || (o.userId??null)!==(record.userId??null)
      || (o.accountId && signal.accountId && o.accountId!==signal.accountId)) return;
    view.signals.push(signal);
  };
  for(const commitment of input.commitments) {
    if(!commitment.opportunityId || commitment.commitmentParty!=='customer' || commitment.status==='cancelled') continue;
    const base={opportunityId:commitment.opportunityId,accountId:commitment.accountId||'',sourceRecordId:commitment.id,
      sourceRecordType:'commitment' as const,actorParty:'customer' as const,sourceEvidenceIds:[]};
    add(commitment.opportunityId,{...base,id:`${commitment.id}:made`,kind:'customer_commitment_made',occurredAt:commitment.createdAt,
      summary:`Customer committed: ${commitment.commitmentText}`,reason:'The canonical commitment explicitly names the customer as the party.'},commitment);
    if(commitment.status==='completed' && commitment.completedAt) add(commitment.opportunityId,{...base,id:`${commitment.id}:kept`,kind:'customer_commitment_kept',occurredAt:commitment.completedAt,
      summary:`Customer completed: ${commitment.commitmentText}`,reason:'The customer-owned commitment is recorded completed.'},commitment);
  }
  for(const event of input.events) {
    if(!event.opportunityId || (event.eventType!=='po_received' && event.eventType!=='payment_received')) continue;
    add(event.opportunityId,{id:event.id,kind:event.eventType,occurredAt:event.occurredAt,opportunityId:event.opportunityId,
      accountId:event.accountId||'',summary:event.summary,sourceRecordId:event.id,sourceRecordType:'event',actorParty:'customer',
      sourceEvidenceIds:[],reason:event.eventType==='po_received'?'A canonical event records receipt of the customer PO.':'A canonical event records receipt of customer payment.'},event);
  }
  const evidence=new Map(input.evidence.filter(visible).map(e=>[e.id,e]));
  const seenEvidence=new Set<string>();
  for(const reading of input.requirementReadings) {
    const r=reading.requirement;
    if(r.lifecycle!=='active' || r.role==='context' || reading.resolution!=='resolved' || !reading.condition || !visible(r)) continue;
    for(const id of reading.sourceEvidenceIds) {
      const item=evidence.get(id);
      if(!item || item.providedBy!=='customer' || seenEvidence.has(`${r.opportunityId}:${id}`)) continue;
      seenEvidence.add(`${r.opportunityId}:${id}`);
      add(r.opportunityId,{id:`${r.id}:${id}:buyer-confirmed`,kind:'buyer_requirement_confirmed',occurredAt:`${item.observedAt}T00:00:00.000Z`,
        opportunityId:r.opportunityId,accountId:r.accountId,summary:`Customer evidence supports: ${r.expectedOutcome}`,
        sourceRecordId:item.id,sourceRecordType:'evidence',actorParty:'customer',sourceEvidenceIds:[item.id],
        reason:'Evidence is explicitly marked customer-provided and currently supports a resolved requirement.'},item);
    }
  }
  for(const activity of input.activities) {
    if(!visible(activity) || !activity.linkedOpportunityId || activity.linkStatus!=='Linked') continue;
    const o=opportunities.get(activity.linkedOpportunityId),view=result.get(activity.linkedOpportunityId);
    if(!o || !view || (o.userId??null)!==(activity.userId??null)) continue;
    view.recordedActivityCount++;
    const occurredAt=activity.activityDate?`${activity.activityDate}T00:00:00.000Z`:activity.createdAt;
    if(!view.lastRecordedActivityAt || occurredAt>view.lastRecordedActivityAt) view.lastRecordedActivityAt=occurredAt;
  }
  for(const view of result.values()) {
    view.signals.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id));
    view.last=view.signals[0]||null;
  }
  return result;
}

/** Reuses the current signal rules over verified cutoff snapshots; Events are never a reconstruction substitute. */
export function deriveBuyerProgressAsOf(input:{sources:HistoricalSourceComposition;cutoff:string;
  activities?:SalesActivityRecord[];includeSampleRecords?:boolean}):HistoricalBuyerProgress{
  if(input.sources.status!=='verified')return {coverage:{status:input.sources.status==='pre_coverage'?'pre_coverage':
    input.sources.status==='corrupt'?'corrupt':'unavailable',unavailableSources:['historical_sources']},projection:null};
  const records=input.sources.records;
  const opportunities=records.opportunities as unknown as CrmLiteOpportunity[];
  const commitments=records.commercial_commitments as unknown as CommercialCommitment[];
  const evidence=records.commercial_evidence as unknown as CommercialEvidence[];
  const requirements=records.commercial_outcome_requirements as unknown as OutcomeRequirement[];
  const conditions=records.commercial_conditions as unknown as CommercialCondition[];
  const readings=projectOutcomeRequirements(requirements,conditions,evidence);
  const cutoff=Date.parse(input.cutoff);
  // An unchanged Activity is usable as a fact. A later edit/delete cannot be
  // reconstructed from the current Activity collection, so coverage remains partial.
  const activities=(input.activities||[]).filter(row=>Date.parse(row.createdAt)<=cutoff
    &&Date.parse(row.updatedAt)<=cutoff
    &&(!row.activityDate||Date.parse(`${row.activityDate}T00:00:00.000Z`)<=cutoff));
  const projection=deriveBuyerProgress({opportunities,commitments,events:[],evidence,
    requirementReadings:readings,activities,includeSampleRecords:input.includeSampleRecords});
  for(const view of projection.values()){
    view.signals=view.signals.filter(signal=>Date.parse(signal.occurredAt)<=cutoff);
    view.last=view.signals[0]||null;
  }
  const selected=new Map(input.sources.selectedRevisions.map(row=>[`${row.entityType}:${row.entityId}`,row]));
  for(const view of projection.values())for(const signal of view.signals){
    const type=signal.sourceRecordType==='commitment'?'commercial_commitments':'commercial_evidence';
    const source=selected.get(`${type}:${signal.sourceRecordId}`);
    const related=signal.kind==='buyer_requirement_confirmed'?readings.find(reading=>
      reading.requirement.opportunityId===signal.opportunityId&&reading.sourceEvidenceIds.includes(signal.sourceRecordId)):undefined;
    const moments=[source?.recordedAt];
    if(related){moments.push(selected.get(`commercial_outcome_requirements:${related.requirement.id}`)?.recordedAt);
      if(related.condition)moments.push(selected.get(`commercial_conditions:${related.condition.id}`)?.recordedAt);}
    signal.recordedAt=moments.filter((value):value is string=>Boolean(value)).sort().at(-1);
    signal.sourceCoverage='verified';
  }
  return {coverage:{status:'partial',unavailableSources:['po_received_event','payment_received_event',
    'edited_or_deleted_activity_history']},projection};
}
