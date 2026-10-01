import type {CommercialScope,CommercialEvent} from './types.ts';
import {verifyCommercialProtocol,commercialProtocolObservation,protocolFromCrossCompanyState} from './commercialProtocol.ts';
import {isCrossCompanyPublication} from './crossCompanyState.ts';
import {eventCodec,EVENT_STORAGE_KEY} from '../../services/commercialKernel/eventStore.ts';
import {receiveExternalObservation} from './externalObservationCommands.ts';
import {observationIdentity,normalizeExternalObservation} from './externalObservation.ts';
function history(){const rows:unknown=JSON.parse(window.localStorage.getItem(EVENT_STORAGE_KEY)||'[]');if(!Array.isArray(rows)||rows.some(r=>!eventCodec.sanitize(r)))throw new Error('Event history is unreadable. Preserve a backup.');return rows as CommercialEvent[];}
export async function exportCommercialProtocol(scope:CommercialScope,eventId:string){
 const event=history().find(e=>e.id===eventId&&e.userId===scope.userId&&Boolean(e.isSample)===Boolean(scope.sampleDataActive));if(!event||!isCrossCompanyPublication(event))throw new Error('Select an issued public assessment in this owner scope.');
 return protocolFromCrossCompanyState(event.structuredPayload);
}
export async function receiveCommercialProtocol(scope:CommercialScope,value:unknown,input:{recipientReference:string;expectedIssuerKeyFingerprint?:string;confirmed:boolean}){
 if(!input.confirmed)throw new Error('Confirm receipt of this protocol message as unaccepted claims.');
 const verification=await verifyCommercialProtocol(value,input);if(verification.message.sample!==Boolean(scope.sampleDataActive))throw new Error('Protocol sample scope does not match.');
 return {...await receiveExternalObservation(scope,await commercialProtocolObservation(verification)),verification};
}
/** Receipt-time view only. Links describe claimed predecessor digests; they never supersede local truth. */
export async function deriveProtocolHistory(scope:CommercialScope,events:CommercialEvent[],cutoff:string){
 const limit=Date.parse(cutoff);if(!Number.isFinite(limit))throw new Error('Invalid history cutoff.');
 const messages:(Awaited<ReturnType<typeof verifyCommercialProtocol>>&{eventId:string;recordedAt:string})[]=[],rejectedEventIds:string[]=[];
 for(const e of events){if(e.userId!==scope.userId||Boolean(e.isSample)!==Boolean(scope.sampleDataActive)||e.eventType!=='external_observation_received'||!String(e.structuredPayload.sourceNamespace).startsWith('commercial-protocol:')||!Number.isFinite(Date.parse(e.recordedAt))||Date.parse(e.recordedAt)>limit)continue;
  try{const value=JSON.parse(String(e.structuredPayload.rawText));const v=await verifyCommercialProtocol(value),observation=await commercialProtocolObservation(v);if(v.message.sample!==Boolean(scope.sampleDataActive)||!eventCodec.sanitize(e)||JSON.stringify(observation)!==JSON.stringify(normalizeExternalObservation(e.structuredPayload))||e.id!==await observationIdentity(observation,scope.userId,Boolean(scope.sampleDataActive)))throw new Error('Invalid receipt');messages.push({eventId:e.id,recordedAt:e.recordedAt,...v});}catch{rejectedEventIds.push(e.id);}}
 const conflicts=messages.filter(m=>messages.some(other=>other.message.issuerReference===m.message.issuerReference&&other.message.messageId===m.message.messageId&&other.message.integrity.digest!==m.message.integrity.digest)).map(m=>m.eventId);
 const unresolvedPredecessors=messages.filter(m=>m.message.body.change.previousMessageDigest!==null&&!messages.some(other=>other.message.issuerReference===m.message.issuerReference&&other.message.recipientReference===m.message.recipientReference&&other.message.body.outcome.reference===m.message.body.outcome.reference&&other.message.integrity.digest===m.message.body.change.previousMessageDigest)).map(m=>m.eventId);
 return {messages,conflicts,unresolvedPredecessors,rejectedEventIds,acceptedCommercialTruth:false as const};
}
