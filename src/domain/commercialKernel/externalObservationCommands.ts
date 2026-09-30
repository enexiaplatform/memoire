import type {CommercialScope,CommercialEvent} from './types.ts';
import {normalizeExternalObservation,prepareExternalObservationReceipt} from './externalObservation.ts';
import {appendEvent,eventCodec,EVENT_STORAGE_KEY} from '../../services/commercialKernel/eventStore.ts';
export async function receiveExternalObservation(scope:CommercialScope,value:unknown):Promise<{event:CommercialEvent;duplicate:boolean}>{
 const owner=scope.userId??null,sample=Boolean(scope.sampleDataActive);
 const event=await prepareExternalObservationReceipt(scope,value),observation=event.structuredPayload,id=event.id;
 const raw:unknown=JSON.parse(window.localStorage.getItem(EVENT_STORAGE_KEY)||'[]');
 if(!Array.isArray(raw)||raw.some(row=>!eventCodec.sanitize(row)))throw new Error('Event history is unreadable. Keep a backup before receiving new observations.');
 const existing=(raw as CommercialEvent[]).find(row=>row.id===id||row.idempotencyKey===id);
 if(existing){if(existing.userId!==owner||Boolean(existing.isSample)!==sample||existing.eventType!=='external_observation_received'
  ||JSON.stringify(normalizeExternalObservation(existing.structuredPayload))!==JSON.stringify(observation))throw new Error('Source identity was reused with different content. Supply a distinct source version.');
  return {event:existing,duplicate:true};}
 appendEvent(event);return {event,duplicate:false};
}
