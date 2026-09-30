import type {CommercialEvent,CommercialScope} from './types.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';
export const observationSourceKinds=['email','calendar','crm','erp','csv_import'] as const;
export type ExternalObservation={schemaVersion:1;sourceKind:typeof observationSourceKinds[number];sourceNamespace:string;sourceEventId:string;sourceVersion:string;observedAt:string|null;summary:string;rawText:string};
const keys=['schemaVersion','sourceKind','sourceNamespace','sourceEventId','sourceVersion','observedAt','summary','rawText'];
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&new TextDecoder().decode(new TextEncoder().encode(v))===v&&![...v].some(character=>{const code=character.charCodeAt(0);return code<32&&![9,10,13].includes(code);});
export function normalizeExternalObservation(value:unknown):ExternalObservation{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Provide a versioned source observation object.');
 const r=value as ExternalObservation;
 if(Object.keys(r).some(key=>!keys.includes(key))||r.schemaVersion!==1||!observationSourceKinds.includes(r.sourceKind)
  ||!text(r.sourceNamespace,200)||!text(r.sourceEventId,200)||!text(r.sourceVersion,100)||!text(r.summary,500)||!text(r.rawText,20000)
  ||!(r.observedAt===null||typeof r.observedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(r.observedAt)&&isValidBusinessDate(r.observedAt.slice(0,10))&&Number.isFinite(Date.parse(r.observedAt))))
  throw new Error('Observation schema, source identity, version, reported time or text is invalid.');
 return {schemaVersion:1,sourceKind:r.sourceKind,sourceNamespace:r.sourceNamespace,sourceEventId:r.sourceEventId,sourceVersion:r.sourceVersion,observedAt:r.observedAt,summary:r.summary,rawText:r.rawText};
}
export async function observationIdentity(observation:ExternalObservation,owner:string|null,sample:boolean){
 const data=JSON.stringify([owner,sample,observation.sourceKind,observation.sourceNamespace,observation.sourceEventId,observation.sourceVersion]);
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));return 'observation:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
/** Shared command preparation for local and authenticated server receipt transports. */
export async function prepareExternalObservationReceipt(scope:CommercialScope,value:unknown):Promise<CommercialEvent>{
 const observation=normalizeExternalObservation(value),owner=scope.userId??null,sample=Boolean(scope.sampleDataActive);
 const id=await observationIdentity(observation,owner,sample),at=new Date().toISOString();
 return {id,userId:owner,eventType:'external_observation_received',occurredAt:at,recordedAt:at,createdAt:at,
  summary:'Source observation received: '+observation.summary,structuredPayload:observation,idempotencyKey:id,sourceType:observation.sourceKind,sourceId:observation.sourceEventId,
  accountId:null,opportunityId:null,threadId:null,commitmentId:null,sourceUrl:null,sourceUpdatedAt:null,...(sample?{isSample:true}:{})};
}
/** Receipt is an event about ingestion. Source-reported content remains unaccepted. */
export function isExternalObservationReceipt(event:CommercialEvent){
 try{const observation=normalizeExternalObservation(event.structuredPayload);
  return event.eventType==='external_observation_received'&&event.id===event.idempotencyKey&&/^observation:[a-f0-9]{64}$/.test(event.id)
   &&event.sourceType===observation.sourceKind&&event.sourceId===observation.sourceEventId&&event.summary==='Source observation received: '+observation.summary
   &&!event.accountId&&!event.opportunityId&&!event.threadId&&!event.commitmentId&&!event.sourceUrl&&!event.sourceUpdatedAt
   &&[event.occurredAt,event.recordedAt,event.createdAt].every(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&isValidBusinessDate(v.slice(0,10))&&Number.isFinite(Date.parse(v)))
   &&Date.parse(event.occurredAt)===Date.parse(event.recordedAt)&&Date.parse(event.createdAt)===Date.parse(event.recordedAt);
 }catch{return false;}
}
