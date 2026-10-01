import type {CommercialEvent,CommercialScope} from './types.ts';
import {normalizeTrustCapsule,verifyTrustCapsule,sha256Hex,type TrustCapsule} from './trustCapsule.ts';
import type {SharedParty} from './sharedCommitment.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';
export type FederatedThreadExchange={format:'memoire.federated-thread';version:1;exchangeId:string;issuedAt:string;
 issuer:SharedParty;recipient:SharedParty;thread:{reference:string;objective:string};capsules:TrustCapsule[];sample:boolean;
 authority:{kind:'issuer-declaration';recipientAccepted:false}};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&new TextDecoder().decode(new TextEncoder().encode(value))===value&&![...value].some(c=>c.charCodeAt(0)<32&&![9,10,13].includes(c.charCodeAt(0)));
const at=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&isValidBusinessDate(value.slice(0,10))&&Number.isFinite(Date.parse(value));
const party=(value:unknown):value is SharedParty=>exact(value,['reference','label'])&&text(value.reference,200)&&text(value.label,200);
export function normalizeFederatedThreadExchange(value:unknown):FederatedThreadExchange{
 if(!exact(value,['format','version','exchangeId','issuedAt','issuer','recipient','thread','capsules','sample','authority']))throw new Error('Unsupported federated thread exchange fields.');
 const row=value as unknown as FederatedThreadExchange;
 if(row.format!=='memoire.federated-thread'||row.version!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.exchangeId)||!at(row.issuedAt)
  ||!party(row.issuer)||!party(row.recipient)||row.issuer.reference===row.recipient.reference||typeof row.sample!=='boolean'
  ||!exact(row.thread,['reference','objective'])||!text(row.thread.reference,200)||!text(row.thread.objective,1000)
  ||!Array.isArray(row.capsules)||row.capsules.length<1||row.capsules.length>8||!exact(row.authority,['kind','recipientAccepted'])||row.authority.kind!=='issuer-declaration'||row.authority.recipientAccepted!==false)throw new Error('Invalid federated thread scope or outcome declaration.');
 const capsules=row.capsules.map(normalizeTrustCapsule),seen=new Set<string>();
 for(const capsule of capsules){const statement=capsule.statement;const pair=[statement.issuer.reference,statement.recipient.reference].sort();
  if(JSON.stringify(pair)!==JSON.stringify([row.issuer.reference,row.recipient.reference].sort())||statement.sample!==row.sample||seen.has(statement.statementId))throw new Error('Capsule is outside this declared thread pair, sample scope or unique statement identity.');seen.add(statement.statementId);}
 const exchange:FederatedThreadExchange={format:'memoire.federated-thread',version:1,exchangeId:row.exchangeId,issuedAt:row.issuedAt,issuer:{reference:row.issuer.reference,label:row.issuer.label},recipient:{reference:row.recipient.reference,label:row.recipient.label},
  thread:{reference:row.thread.reference,objective:row.thread.objective},capsules,sample:row.sample,authority:{kind:'issuer-declaration',recipientAccepted:false}};
 if(JSON.stringify(exchange).length>20000)throw new Error('Federated exchange exceeds the bounded source receipt size. Select fewer statements.');return exchange;
}
export async function verifyFederatedThreadExchange(value:unknown,options:{recipientReference?:string;issuerKeys?:Record<string,string>}={}){
 const exchange=normalizeFederatedThreadExchange(value);if(options.recipientReference!==undefined&&exchange.recipient.reference!==options.recipientReference)throw new Error('Exchange recipient scope does not match.');
 const claims=[];for(const capsule of exchange.capsules){const ref=capsule.statement.issuer.reference,key=options.issuerKeys&&Object.hasOwn(options.issuerKeys,ref)?options.issuerKeys[ref]:undefined;claims.push(await verifyTrustCapsule(capsule,key?{expectedIssuerKeyFingerprint:key}:{}));}
 return {exchange,claims,fingerprint:await sha256Hex(new TextEncoder().encode(JSON.stringify(exchange))),acceptedCommercialTruth:false as const};
}
export function isFederatedThreadPublication(event:CommercialEvent){
 try{const exchange=normalizeFederatedThreadExchange(event.structuredPayload);return event.eventType==='federated_thread_issued'&&event.id==='federated-thread:'+exchange.exchangeId&&event.idempotencyKey===event.id
  &&event.summary==='Federated thread exchange issued'&&event.sourceType==='manual'&&event.sourceId===exchange.exchangeId&&text(event.threadId,200)&&!event.accountId&&!event.opportunityId&&!event.commitmentId&&!event.sourceUrl&&!event.sourceUpdatedAt
  &&Boolean(event.isSample)===exchange.sample&&[event.occurredAt,event.recordedAt,event.createdAt].every(at)&&event.occurredAt===event.recordedAt&&event.createdAt===event.recordedAt;}catch{return false;}
}
/** Reconstruct attributed exchanges from local facts known at the cutoff, never issuer-reported time. */
export async function deriveFederatedThreads(scope:CommercialScope,events:CommercialEvent[],cutoff:string){
 if(!at(cutoff))throw new Error('Provide a valid local history cutoff.');
 const groups=new Map<string,{reference:string;partyReferences:string[];exchanges:Array<{eventId:string;recordedAt:string;localThreadId:string|null;exchange:FederatedThreadExchange}>;objectiveDisagreement:boolean;statementIdentityConflict:boolean}>();
 const rejected:string[]=[];
 for(const event of events){if(event.userId!==scope.userId||Boolean(event.isSample)!==Boolean(scope.sampleDataActive)||!at(event.recordedAt)||Date.parse(event.recordedAt)>Date.parse(cutoff))continue;
  let candidate:unknown;
  if(event.eventType==='federated_thread_issued')candidate=event.structuredPayload;
  else if(event.eventType==='external_observation_received'){try{candidate=JSON.parse(String(event.structuredPayload.rawText));if((candidate as {format?:string})?.format!=='memoire.federated-thread')continue;}catch{continue;}}
  else continue;
  try{const {exchange}=await verifyFederatedThreadExchange(candidate);if(exchange.sample!==Boolean(scope.sampleDataActive))throw new Error('Scope mismatch');const refs=[exchange.issuer.reference,exchange.recipient.reference].sort(),key=JSON.stringify([exchange.thread.reference,refs]);
   const group=groups.get(key)||{reference:exchange.thread.reference,partyReferences:refs,exchanges:[],objectiveDisagreement:false,statementIdentityConflict:false};
   if(group.exchanges.some(prior=>prior.exchange.thread.objective!==exchange.thread.objective))group.objectiveDisagreement=true;
   const existing=new Map(group.exchanges.flatMap(prior=>prior.exchange.capsules.map(capsule=>[capsule.statement.statementId,capsule.integrity.digest] as const)));
   if(exchange.capsules.some(capsule=>existing.has(capsule.statement.statementId)&&existing.get(capsule.statement.statementId)!==capsule.integrity.digest))group.statementIdentityConflict=true;
   group.exchanges.push({eventId:event.id,recordedAt:event.recordedAt,localThreadId:event.eventType==='federated_thread_issued'?event.threadId||null:null,exchange});groups.set(key,group);
  }catch{rejected.push(event.id);}
 }
 return {groups:[...groups.values()],rejectedEventIds:rejected,acceptedCommercialTruth:false as const};
}
