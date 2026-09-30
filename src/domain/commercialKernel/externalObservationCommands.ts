import type {CommercialScope,CommercialEvent} from './types.ts';
import {normalizeExternalObservation,observationIdentity} from './externalObservation.ts';
import {appendEvent,eventCodec,EVENT_STORAGE_KEY} from '../../services/commercialKernel/eventStore.ts';
export async function receiveExternalObservation(scope:CommercialScope,value:unknown):Promise<{event:CommercialEvent;duplicate:boolean}>{
 const owner=scope.userId??null,sample=Boolean(scope.sampleDataActive);
 const observation=normalizeExternalObservation(value),id=await observationIdentity(observation,owner,sample);
 const raw:unknown=JSON.parse(window.localStorage.getItem(EVENT_STORAGE_KEY)||'[]');
 if(!Array.isArray(raw)||raw.some(row=>!eventCodec.sanitize(row)))throw new Error('Event history is unreadable. Keep a backup before receiving new observations.');
 const existing=(raw as CommercialEvent[]).find(row=>row.id===id||row.idempotencyKey===id);
 if(existing){if(existing.userId!==owner||Boolean(existing.isSample)!==sample||existing.eventType!=='external_observation_received'
  ||JSON.stringify(normalizeExternalObservation(existing.structuredPayload))!==JSON.stringify(observation))throw new Error('Source identity was reused with different content. Supply a distinct source version.');
  return {event:existing,duplicate:true};}
 const at=new Date().toISOString();const event:CommercialEvent={id,userId:owner,eventType:'external_observation_received',occurredAt:at,recordedAt:at,createdAt:at,
  summary:'Source observation received: '+observation.summary,structuredPayload:observation,idempotencyKey:id,sourceType:observation.sourceKind,sourceId:observation.sourceEventId,
  accountId:null,opportunityId:null,threadId:null,commitmentId:null,sourceUrl:null,sourceUpdatedAt:null,...(sample?{isSample:true}:{})};
 appendEvent(event);return {event,duplicate:false};
}
