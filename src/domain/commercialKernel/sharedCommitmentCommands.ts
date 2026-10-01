import type {CommercialScope,CommercialEvent} from './types.ts';
import {normalizeSharedCommitment,previewSharedCommitment,type SharedCommitmentStatement} from './sharedCommitment.ts';
import {appendEvent,eventCodec,EVENT_STORAGE_KEY} from '../../services/commercialKernel/eventStore.ts';
import {loadCommitments,COMMITMENT_STORAGE_KEY,commitmentCodec} from '../../services/commercialKernel/commitmentStore.ts';
import {receiveExternalObservation} from './externalObservationCommands.ts';
import {exchangeSourceNamespace} from './externalObservation.ts';
function verifyLocalHistory(){const rows:unknown=JSON.parse(window.localStorage.getItem(EVENT_STORAGE_KEY)||'[]');if(!Array.isArray(rows)||rows.some(row=>!eventCodec.sanitize(row)))throw new Error('Event history is unreadable. Preserve a backup before issuing statements.');return rows as CommercialEvent[];}
export function issueSharedCommitment(scope:CommercialScope,commitmentId:string,value:unknown,confirmed:boolean):SharedCommitmentStatement{
 if(!confirmed)throw new Error('Confirm the exact parties, promise and evidence to disclose.');
 const statement=normalizeSharedCommitment(value),history=verifyLocalHistory(),id='shared-commitment:'+statement.statementId;
 const existing=history.find(event=>event.id===id);
 if(existing){if(existing.userId!==scope.userId||Boolean(existing.isSample)!==Boolean(scope.sampleDataActive)||existing.commitmentId!==commitmentId||JSON.stringify(existing.structuredPayload)!==JSON.stringify(statement))throw new Error('Statement identity conflicts with another disclosure.');return statement;}
 const raw:unknown=JSON.parse(window.localStorage.getItem(COMMITMENT_STORAGE_KEY)||'[]');if(!Array.isArray(raw)||raw.some(row=>!commitmentCodec.sanitize(row)))throw new Error('Promise storage is unreadable.');
 const current=loadCommitments().find(row=>row.id===commitmentId&&row.userId===scope.userId&&Boolean(row.isSample)===Boolean(scope.sampleDataActive));
 if(!current)throw new Error('Promise is outside this owner scope.');
 const fresh=previewSharedCommitment(scope,current,{issuer:statement.issuer,recipient:statement.recipient,commitmentRef:statement.commitmentRef,includeCompletionEvidence:statement.promise.completionEvidence!==null});
 if(fresh.sourceUpdatedAt!==statement.sourceUpdatedAt||JSON.stringify(fresh.promise)!==JSON.stringify(statement.promise)||fresh.sample!==statement.sample)throw new Error('Promise changed after the disclosure preview. Reopen and confirm the current version.');
 const at=new Date().toISOString();appendEvent({id,userId:scope.userId,eventType:'shared_commitment_issued',occurredAt:at,recordedAt:at,createdAt:at,summary:'Shared promise statement issued',structuredPayload:statement,idempotencyKey:id,
  sourceType:'manual',sourceId:statement.statementId,accountId:null,opportunityId:null,threadId:null,commitmentId,sourceUrl:null,sourceUpdatedAt:null,...(scope.sampleDataActive?{isSample:true}:{})});return statement;
}
/** Receipt preserves the statement as an unaccepted external claim, with receipt-time history. */
export async function receiveSharedCommitment(scope:CommercialScope,value:unknown,recipientReference:string,confirmed:boolean){
 if(!confirmed)throw new Error('Confirm receiving this external statement as an unaccepted source claim.');
 const statement=normalizeSharedCommitment(value);
 if(statement.recipient.reference!==recipientReference||statement.sample!==Boolean(scope.sampleDataActive))throw new Error('Statement recipient or sample scope does not match this intake.');
 return receiveExternalObservation(scope,{schemaVersion:1,sourceKind:'csv_import',sourceNamespace:await exchangeSourceNamespace('shared-commitment',statement.issuer.reference),sourceEventId:statement.statementId,sourceVersion:'1',observedAt:statement.issuedAt,
  summary:'External shared promise statement',rawText:JSON.stringify(statement)});
}
