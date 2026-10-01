import type {CommercialCommitment,CommercialEvent,CommercialScope} from './types.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';
export type SharedParty={reference:string;label:string};
/** A deliberately disclosed issuer statement. Recipient acceptance requires the recipient's own authority. */
export type SharedCommitmentStatement={format:'memoire.shared-commitment';version:1;statementId:string;issuedAt:string;
 issuer:SharedParty;recipient:SharedParty;commitmentRef:string;
 promise:{responsiblePerson:string;text:string;dueDate:string|null;status:'open'|'completed'|'cancelled';completionEvidence:string|null};
 sourceUpdatedAt:string;sample:boolean;authority:{kind:'issuer-declaration';recipientAccepted:false}};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&new TextDecoder().decode(new TextEncoder().encode(value))===value&&![...value].some(c=>c.charCodeAt(0)<32&&![9,10,13].includes(c.charCodeAt(0)));
const at=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&isValidBusinessDate(value.slice(0,10))&&Number.isFinite(Date.parse(value));
const party=(value:unknown):value is SharedParty=>exact(value,['reference','label'])&&text(value.reference,200)&&text(value.label,200);
export function normalizeSharedCommitment(value:unknown):SharedCommitmentStatement{
 if(!exact(value,['format','version','statementId','issuedAt','issuer','recipient','commitmentRef','promise','sourceUpdatedAt','sample','authority']))throw new Error('Unsupported shared promise statement fields.');
 const row=value as unknown as SharedCommitmentStatement,p=row.promise;
 if(row.format!=='memoire.shared-commitment'||row.version!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.statementId)||!at(row.issuedAt)||!at(row.sourceUpdatedAt)
  ||!party(row.issuer)||!party(row.recipient)||row.issuer.reference===row.recipient.reference||!text(row.commitmentRef,200)||typeof row.sample!=='boolean'
  ||!exact(p,['responsiblePerson','text','dueDate','status','completionEvidence'])||!text(p.responsiblePerson,200)||!text(p.text,2000)||!['open','completed','cancelled'].includes(p.status)
  ||!(p.dueDate===null||typeof p.dueDate==='string'&&isValidBusinessDate(p.dueDate))
  ||!(p.completionEvidence===null||p.status==='completed'&&text(p.completionEvidence,2000))
  ||!exact(row.authority,['kind','recipientAccepted'])||row.authority.kind!=='issuer-declaration'||row.authority.recipientAccepted!==false)throw new Error('Shared promise parties, fields, evidence or authority are invalid.');
 return {format:row.format,version:1,statementId:row.statementId,issuedAt:row.issuedAt,issuer:{reference:row.issuer.reference,label:row.issuer.label},recipient:{reference:row.recipient.reference,label:row.recipient.label},commitmentRef:row.commitmentRef,
  promise:{responsiblePerson:p.responsiblePerson,text:p.text,dueDate:p.dueDate,status:p.status,completionEvidence:p.completionEvidence},sourceUpdatedAt:row.sourceUpdatedAt,sample:row.sample,authority:{kind:'issuer-declaration',recipientAccepted:false}};
}
export function previewSharedCommitment(scope:CommercialScope,commitment:CommercialCommitment,input:{issuer:SharedParty;recipient:SharedParty;commitmentRef:string;includeCompletionEvidence:boolean}):SharedCommitmentStatement{
 if(commitment.userId!==scope.userId||Boolean(commitment.isSample)!==Boolean(scope.sampleDataActive))throw new Error('Only a promise in this owner scope can be disclosed.');
 return normalizeSharedCommitment({format:'memoire.shared-commitment',version:1,statementId:crypto.randomUUID(),issuedAt:new Date().toISOString(),issuer:input.issuer,recipient:input.recipient,commitmentRef:input.commitmentRef,
  promise:{responsiblePerson:commitment.ownerLabel,text:commitment.commitmentText,dueDate:commitment.currentDueDate||null,status:commitment.status,completionEvidence:input.includeCompletionEvidence&&commitment.status==='completed'?commitment.completionEvidence||null:null},
  sourceUpdatedAt:commitment.updatedAt,sample:Boolean(scope.sampleDataActive),authority:{kind:'issuer-declaration',recipientAccepted:false}});
}
export function isSharedCommitmentPublication(event:CommercialEvent){
 try{const statement=normalizeSharedCommitment(event.structuredPayload);return event.eventType==='shared_commitment_issued'&&event.id==='shared-commitment:'+statement.statementId&&event.idempotencyKey===event.id
  &&event.sourceType==='manual'&&event.sourceId===statement.statementId&&event.summary==='Shared promise statement issued'&&Boolean(event.isSample)===statement.sample
  &&!event.accountId&&!event.opportunityId&&!event.threadId&&text(event.commitmentId,200)&&!event.sourceUrl&&!event.sourceUpdatedAt
  &&[event.occurredAt,event.recordedAt,event.createdAt].every(at)&&event.occurredAt===event.recordedAt&&event.createdAt===event.recordedAt;
 }catch{return false;}
}
