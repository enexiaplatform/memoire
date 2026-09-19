import type { CrmLiteOpportunity } from '../../services/opportunityStore.ts';
import type { SalesActivityRecord } from '../../services/salesActivityStore.ts';
import type { CommercialCommitment, CommercialEvent } from './types.ts';
import type { CommercialEvidence } from './commercialEvidence.ts';
import type { RequirementReading } from './outcomeRequirement.ts';

export type BuyerProgressKind = 'customer_commitment_made' | 'customer_commitment_kept' | 'po_received' | 'payment_received' | 'buyer_requirement_confirmed';
export type BuyerProgressSignal = {
  id:string; kind:BuyerProgressKind; occurredAt:string; opportunityId:string; accountId:string;
  summary:string; sourceRecordId:string; sourceRecordType:'commitment'|'event'|'evidence';
  actorParty:'customer'; sourceEvidenceIds:string[]; reason:string;
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
