import type {CommercialScope,CommercialEvent} from './types.ts';
import {normalizeFederatedThreadExchange,verifyFederatedThreadExchange,type FederatedThreadExchange} from './federatedThread.ts';
import {createTrustCapsule,verifyTrustCapsule} from './trustCapsule.ts';
import {eventCodec,EVENT_STORAGE_KEY,appendEvent} from '../../services/commercialKernel/eventStore.ts';
import {loadThreads,threadCodec,THREAD_STORAGE_KEY} from '../../services/commercialKernel/threadStore.ts';
import {receiveExternalObservation} from './externalObservationCommands.ts';
import {exchangeSourceNamespace} from './externalObservation.ts';
function history(){const rows:unknown=JSON.parse(window.localStorage.getItem(EVENT_STORAGE_KEY)||'[]');if(!Array.isArray(rows)||rows.some(row=>!eventCodec.sanitize(row)))throw new Error('Event history is unreadable. Preserve a backup.');return rows as CommercialEvent[];}
export async function availableFederationCapsules(scope:CommercialScope){
 const capsules=[];for(const event of history().filter(row=>row.userId===scope.userId&&Boolean(row.isSample)===Boolean(scope.sampleDataActive))){try{
  if(event.eventType==='shared_commitment_issued')capsules.push({eventId:event.id,capsule:await createTrustCapsule(event.structuredPayload)});
  else if(event.eventType==='external_observation_received'){const value=JSON.parse(String(event.structuredPayload.rawText));if(value?.format==='memoire.trust-capsule')capsules.push({eventId:event.id,capsule:(await verifyTrustCapsule(value)).capsule});}
 }catch{continue;}}
 return capsules;
}
export async function previewFederatedThread(scope:CommercialScope,input:{threadId:string;reference:string;objective:string;issuer:{reference:string;label:string};recipient:{reference:string;label:string};eventIds:string[]}){
 const raw:unknown=JSON.parse(window.localStorage.getItem(THREAD_STORAGE_KEY)||'[]');if(!Array.isArray(raw)||raw.some(row=>!threadCodec.sanitize(row)))throw new Error('Thread storage is unreadable.');
 const thread=loadThreads().find(row=>row.id===input.threadId&&row.userId===scope.userId&&Boolean(row.isSample)===Boolean(scope.sampleDataActive));if(!thread)throw new Error('Select a canonical thread in this owner scope.');
 if(new Set(input.eventIds).size!==input.eventIds.length)throw new Error('Select unique source statements.');const available=await availableFederationCapsules(scope),capsules=input.eventIds.map(id=>{const item=available.find(row=>row.eventId===id);if(!item)throw new Error('Source statement is outside this owner scope or unavailable.');return item.capsule;});
 const exchange=normalizeFederatedThreadExchange({format:'memoire.federated-thread',version:1,exchangeId:crypto.randomUUID(),issuedAt:new Date().toISOString(),issuer:input.issuer,recipient:input.recipient,thread:{reference:input.reference,objective:input.objective},capsules,sample:Boolean(scope.sampleDataActive),authority:{kind:'issuer-declaration',recipientAccepted:false}});
 await verifyFederatedThreadExchange(exchange);return {exchange,threadUpdatedAt:thread.updatedAt};
}
export async function issueFederatedThread(scope:CommercialScope,input:{threadId:string;threadUpdatedAt:string;exchange:FederatedThreadExchange;confirmed:boolean}){
 if(!input.confirmed)throw new Error('Confirm the exact public thread outcome, parties and selected claims.');
 const {exchange}=await verifyFederatedThreadExchange(input.exchange),id='federated-thread:'+exchange.exchangeId,prior=history().find(row=>row.id===id);
 if(prior){if(prior.userId!==scope.userId||Boolean(prior.isSample)!==Boolean(scope.sampleDataActive)||prior.threadId!==input.threadId||JSON.stringify(prior.structuredPayload)!==JSON.stringify(exchange))throw new Error('Exchange identity conflicts with another statement.');return exchange;}
 const thread=loadThreads().find(row=>row.id===input.threadId&&row.userId===scope.userId&&Boolean(row.isSample)===Boolean(scope.sampleDataActive));if(!thread||thread.updatedAt!==input.threadUpdatedAt||exchange.sample!==Boolean(scope.sampleDataActive))throw new Error('Local thread changed or is outside this scope. Reopen the preview.');
 const available=await availableFederationCapsules(scope);if(exchange.capsules.some(capsule=>!available.some(source=>JSON.stringify(source.capsule)===JSON.stringify(capsule))))throw new Error('A selected source capsule is no longer available in this scope.');
 const latest=history().find(row=>row.id===id);if(latest){if(latest.userId!==scope.userId||Boolean(latest.isSample)!==Boolean(scope.sampleDataActive)||latest.threadId!==input.threadId||JSON.stringify(latest.structuredPayload)!==JSON.stringify(exchange))throw new Error('Exchange identity conflicts with another statement.');return exchange;}
 const fresh=loadThreads().find(row=>row.id===input.threadId&&row.userId===scope.userId&&Boolean(row.isSample)===Boolean(scope.sampleDataActive));if(!fresh||fresh.updatedAt!==input.threadUpdatedAt)throw new Error('Local thread changed during verification. Reopen the preview.');
 const at=new Date().toISOString();appendEvent({id,userId:scope.userId,eventType:'federated_thread_issued',occurredAt:at,recordedAt:at,createdAt:at,summary:'Federated thread exchange issued',structuredPayload:exchange,idempotencyKey:id,sourceType:'manual',sourceId:exchange.exchangeId,
  threadId:thread.id,accountId:null,opportunityId:null,commitmentId:null,sourceUrl:null,sourceUpdatedAt:null,...(scope.sampleDataActive?{isSample:true}:{})});return exchange;
}
export async function receiveFederatedThread(scope:CommercialScope,value:unknown,recipientReference:string,confirmed:boolean){
 if(!confirmed)throw new Error('Confirm receiving this federated exchange as attributed external claims.');const verification=await verifyFederatedThreadExchange(value,{recipientReference});const exchange=verification.exchange;
 if(exchange.sample!==Boolean(scope.sampleDataActive))throw new Error('Exchange sample scope does not match.');
 return receiveExternalObservation(scope,{schemaVersion:1,sourceKind:'csv_import',sourceNamespace:await exchangeSourceNamespace('federated-thread',exchange.issuer.reference),sourceEventId:exchange.exchangeId,sourceVersion:verification.fingerprint,
  observedAt:exchange.issuedAt,summary:'External federated thread exchange',rawText:JSON.stringify(exchange)});
}
