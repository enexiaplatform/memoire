import {verifyCrossCompanyState} from './crossCompanyState.ts';
import {normalizeTrustCapsule,verifyTrustCapsule,sha256Hex,normalizePublicSignature,signPublicBytes,verifyPublicBytes,type PublicSignature,type TrustCapsule} from './trustCapsule.ts';
import {exchangeSourceNamespace,type ExternalObservation} from './externalObservation.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';
export type ProtocolBody={
 parties:{reference:string;label:string}[];
 outcome:{reference:string;statement:string;assessedBy:string;sharedAcceptance:false};
 conditions:{reference:string;partyReference:string;statement:string;assessment:'supported'|'assumed'|'hypothesis'|'contradicted'|'unknown';assessedBy:string}[];
 requirements:{reference:string;partyReference:string;outcomeReference:string;conditionReference:string|null;expectedOutcome:string;localAssessment:'resolved'|'unresolved'|'conflicted';assessedBy:string;commitmentStatementIds:string[]}[];
 commitments:{statementId:string;capsuleDigest:string}[];
 dependencies:{dependentReference:string;prerequisiteReference:string;basis:string;assertedBy:string}[];
 evidenceReferences:{reference:string;partyReference:string;sourceStatementId:string;kind:'completion-claim';recipientAccepted:false}[];
 moneyReferences:{reference:string;partyReference:string;externalReference:string;currency:string|null}[];
 decisionBoundary:{canonicalMutationAllowed:false;humanConfirmationRequired:true;eachPartyControlsItsOwnDecisions:true};
 change:{kind:'snapshot';previousMessageDigest:string|null};
 provenance:{sourceStateId:string|null;sourceStateFingerprint:string|null;capsules:TrustCapsule[]};
};
export type CommercialProtocolMessage={protocol:'memoire.commercial';version:1;messageId:string;issuedAt:string;issuerReference:string;recipientReference:string;sample:boolean;body:ProtocolBody;integrity:{algorithm:'SHA-256';digest:string};signature:PublicSignature|null};
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const txt=(v:unknown,max=200):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&![...v].some(c=>{const n=c.charCodeAt(0);return n===127||n<32&&![9,10,13].includes(n);})&&new TextDecoder().decode(new TextEncoder().encode(v))===v;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const at=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&isValidBusinessDate(v.slice(0,10))&&Number.isFinite(Date.parse(v));
const encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
function rows<T>(v:unknown,max:number,parse:(v:unknown)=>T):T[]{if(!Array.isArray(v)||v.length>max)throw new Error('Protocol collection exceeds its bound.');return v.map(parse);}
function requireFields(v:unknown,keys:string[]):asserts v is Record<string,unknown>{if(!exact(v,keys))throw new Error('Unsupported protocol fields.');}
function unique(values:string[]){if(new Set(values).size!==values.length)throw new Error('Duplicate protocol reference.');}
function fail():never{throw new Error('Invalid protocol scope, reference or authority.');}
/** Fixed property order is part of v1. Array order is retained. No canonical writes occur here. */
export function normalizeCommercialProtocol(value:unknown):CommercialProtocolMessage{
 requireFields(value,['protocol','version','messageId','issuedAt','issuerReference','recipientReference','sample','body','integrity','signature']);
 if(value.protocol!=='memoire.commercial'||value.version!==1||!uuid(value.messageId)||!at(value.issuedAt)||!txt(value.issuerReference)||!txt(value.recipientReference)||value.issuerReference===value.recipientReference||typeof value.sample!=='boolean')fail();
 const b=value.body;requireFields(b,['parties','outcome','conditions','requirements','commitments','dependencies','evidenceReferences','moneyReferences','decisionBoundary','change','provenance']);
 const parties=rows(b.parties,2,v=>{requireFields(v,['reference','label']);if(!txt(v.reference)||!txt(v.label))fail();return {reference:v.reference,label:v.label};});
 const refs=parties.map(p=>p.reference);unique(refs);if(refs.length!==2||!refs.includes(value.issuerReference)||!refs.includes(value.recipientReference))fail();
 const issuer=value.issuerReference,recipient=value.recipientReference,party=(v:unknown):v is string=>typeof v==='string'&&refs.includes(v);
 const o=b.outcome;requireFields(o,['reference','statement','assessedBy','sharedAcceptance']);if(!txt(o.reference)||!txt(o.statement,1000)||o.assessedBy!==issuer||o.sharedAcceptance!==false)fail();
 const outcome:ProtocolBody['outcome']={reference:o.reference,statement:o.statement,assessedBy:issuer,sharedAcceptance:false};
 const conditions=rows<ProtocolBody['conditions'][number]>(b.conditions,20,v=>{requireFields(v,['reference','partyReference','statement','assessment','assessedBy']);if(!txt(v.reference)||!party(v.partyReference)||!txt(v.statement,1000)||!['supported','assumed','hypothesis','contradicted','unknown'].includes(String(v.assessment))||v.assessedBy!==issuer)fail();return {reference:v.reference,partyReference:v.partyReference,statement:v.statement,assessment:v.assessment as ProtocolBody['conditions'][number]['assessment'],assessedBy:issuer};});unique(conditions.map(c=>c.reference));
 const p=b.provenance;requireFields(p,['sourceStateId','sourceStateFingerprint','capsules']);if(!(p.sourceStateId===null&&p.sourceStateFingerprint===null||uuid(p.sourceStateId)&&hash(p.sourceStateFingerprint)))fail();
 const capsules=rows(p.capsules,8,normalizeTrustCapsule);unique(capsules.map(c=>c.statement.statementId));
 for(const c of capsules)if(c.statement.sample!==value.sample||!refs.includes(c.statement.issuer.reference)||!refs.includes(c.statement.recipient.reference)||c.statement.issuer.reference===c.statement.recipient.reference)fail();
 const commitments=rows(b.commitments,8,v=>{requireFields(v,['statementId','capsuleDigest']);if(!uuid(v.statementId)||!hash(v.capsuleDigest)||!capsules.some(c=>c.statement.statementId===v.statementId&&c.integrity.digest===v.capsuleDigest))fail();return {statementId:v.statementId,capsuleDigest:v.capsuleDigest};});unique(commitments.map(c=>c.statementId));if(commitments.length!==capsules.length)fail();
 const requirements=rows<ProtocolBody['requirements'][number]>(b.requirements,20,v=>{requireFields(v,['reference','partyReference','outcomeReference','conditionReference','expectedOutcome','localAssessment','assessedBy','commitmentStatementIds']);if(!txt(v.reference)||!party(v.partyReference)||v.outcomeReference!==outcome.reference||!(v.conditionReference===null||conditions.some(c=>c.reference===v.conditionReference&&c.partyReference===v.partyReference))||!txt(v.expectedOutcome,1000)||!['resolved','unresolved','conflicted'].includes(String(v.localAssessment))||v.assessedBy!==issuer)fail();
  const commitmentStatementIds=rows(v.commitmentStatementIds,8,id=>{if(!uuid(id)||!capsules.some(c=>c.statement.statementId===id&&c.statement.issuer.reference===v.partyReference))fail();return id;});unique(commitmentStatementIds);
  return {reference:v.reference,partyReference:v.partyReference,outcomeReference:outcome.reference,conditionReference:v.conditionReference as string|null,expectedOutcome:v.expectedOutcome,localAssessment:v.localAssessment as ProtocolBody['requirements'][number]['localAssessment'],assessedBy:issuer,commitmentStatementIds};});unique(requirements.map(r=>r.reference));if(!requirements.length)fail();
 const dependencies=rows(b.dependencies,30,v=>{requireFields(v,['dependentReference','prerequisiteReference','basis','assertedBy']);if(!txt(v.dependentReference)||!txt(v.prerequisiteReference)||v.dependentReference===v.prerequisiteReference||!requirements.some(r=>r.reference===v.dependentReference)||!requirements.some(r=>r.reference===v.prerequisiteReference)||!txt(v.basis,1000)||v.assertedBy!==issuer)fail();return {dependentReference:v.dependentReference,prerequisiteReference:v.prerequisiteReference,basis:v.basis,assertedBy:issuer};});unique(dependencies.map(d=>JSON.stringify([d.dependentReference,d.prerequisiteReference])));
 // Only wire graph integrity. Requirement resolution remains the existing Kernel's responsibility.
 const done=new Set<string>();function visit(ref:string,path:Set<string>){if(path.has(ref))fail();if(done.has(ref))return;const next=new Set(path);next.add(ref);for(const d of dependencies.filter(d=>d.dependentReference===ref))visit(d.prerequisiteReference,next);done.add(ref);}for(const r of requirements)visit(r.reference,new Set());
 const evidenceReferences=rows<ProtocolBody['evidenceReferences'][number]>(b.evidenceReferences,8,v=>{requireFields(v,['reference','partyReference','sourceStatementId','kind','recipientAccepted']);if(!txt(v.reference)||!party(v.partyReference)||!uuid(v.sourceStatementId)||v.kind!=='completion-claim'||v.recipientAccepted!==false||!capsules.some(c=>c.statement.statementId===v.sourceStatementId&&c.statement.issuer.reference===v.partyReference&&c.statement.promise.status==='completed'&&c.statement.promise.completionEvidence!==null))fail();return {reference:v.reference,partyReference:v.partyReference,sourceStatementId:v.sourceStatementId,kind:'completion-claim',recipientAccepted:false};});unique(evidenceReferences.map(e=>e.reference));unique(evidenceReferences.map(e=>e.sourceStatementId));
 const moneyReferences=rows(b.moneyReferences,8,v=>{requireFields(v,['reference','partyReference','externalReference','currency']);if(!txt(v.reference)||!party(v.partyReference)||!txt(v.externalReference)||!(v.currency===null||typeof v.currency==='string'&&/^[A-Z]{3}$/.test(v.currency)))fail();return {reference:v.reference,partyReference:v.partyReference,externalReference:v.externalReference,currency:v.currency as string|null};});unique(moneyReferences.map(m=>m.reference));
 requireFields(b.decisionBoundary,['canonicalMutationAllowed','humanConfirmationRequired','eachPartyControlsItsOwnDecisions']);if(b.decisionBoundary.canonicalMutationAllowed!==false||b.decisionBoundary.humanConfirmationRequired!==true||b.decisionBoundary.eachPartyControlsItsOwnDecisions!==true)fail();
 requireFields(b.change,['kind','previousMessageDigest']);if(b.change.kind!=='snapshot'||!(b.change.previousMessageDigest===null||hash(b.change.previousMessageDigest)))fail();
 requireFields(value.integrity,['algorithm','digest']);if(value.integrity.algorithm!=='SHA-256'||!hash(value.integrity.digest))fail();
 const result:CommercialProtocolMessage={protocol:'memoire.commercial',version:1,messageId:value.messageId,issuedAt:value.issuedAt,issuerReference:issuer,recipientReference:recipient,sample:value.sample,
  body:{parties,outcome,conditions,requirements,commitments,dependencies,evidenceReferences,moneyReferences,decisionBoundary:{canonicalMutationAllowed:false,humanConfirmationRequired:true,eachPartyControlsItsOwnDecisions:true},change:{kind:'snapshot',previousMessageDigest:b.change.previousMessageDigest},provenance:{sourceStateId:p.sourceStateId as string|null,sourceStateFingerprint:p.sourceStateFingerprint as string|null,capsules}},integrity:{algorithm:'SHA-256',digest:value.integrity.digest},signature:normalizePublicSignature(value.signature)};
 if(JSON.stringify(result).length>20000)throw new Error('Protocol message exceeds the 20,000-character intake bound.');return result;
}
const core=(m:CommercialProtocolMessage)=>({protocol:m.protocol,version:m.version,messageId:m.messageId,issuedAt:m.issuedAt,issuerReference:m.issuerReference,recipientReference:m.recipientReference,sample:m.sample,body:m.body});
const signingBytes=(m:CommercialProtocolMessage)=>encode({...core(m),integrity:m.integrity});
export async function createCommercialProtocol(value:Omit<CommercialProtocolMessage,'integrity'|'signature'>,signer?:{privateKey:CryptoKey;publicKey:CryptoKey}){
 let message=normalizeCommercialProtocol({...value,integrity:{algorithm:'SHA-256',digest:'0'.repeat(64)},signature:null});message.integrity.digest=await sha256Hex(encode(core(message)));
 if(signer){try{message.signature=await signPublicBytes(signingBytes(message),signer);}catch{throw new Error('Protocol signing failed or the supplied key pair does not match.');}}
 message=normalizeCommercialProtocol(message);await verifyCommercialProtocol(message);return message;
}
export async function verifyCommercialProtocol(value:unknown,options:{recipientReference?:string;expectedIssuerKeyFingerprint?:string}={}){
 const message=normalizeCommercialProtocol(value);if(options.recipientReference!==undefined&&message.recipientReference!==options.recipientReference)throw new Error('Protocol recipient scope does not match.');
 if(options.expectedIssuerKeyFingerprint!==undefined&&!hash(options.expectedIssuerKeyFingerprint))throw new Error('Provide the agreed issuer key fingerprint.');
 if(await sha256Hex(encode(core(message)))!==message.integrity.digest)throw new Error('Protocol integrity check failed.');
 for(const capsule of message.body.provenance.capsules)await verifyTrustCapsule(capsule);
 let verification;try{verification=await verifyPublicBytes(signingBytes(message),message.signature);}catch{throw new Error('Protocol signature verification failed.');}
 if(options.expectedIssuerKeyFingerprint!==undefined&&verification.signerKeyFingerprint!==options.expectedIssuerKeyFingerprint)throw new Error('Protocol does not match the agreed issuer signing key.');
 return {message,...verification,integrityVerified:true as const,configuredIssuerKeyMatched:options.expectedIssuerKeyFingerprint!==undefined?true:null,issuerOrganizationIdentityVerified:false as const,acceptedCommercialTruth:false as const,fingerprint:await sha256Hex(encode(message))};
}
/** Pure adaptation of an already confirmed public disclosure; no new publication or business entity. */
export async function protocolFromCrossCompanyState(value:unknown){
 const {state,fingerprint}=await verifyCrossCompanyState(value),f=state.federation,issuer=f.issuer.reference;
 return createCommercialProtocol({protocol:'memoire.commercial',version:1,messageId:state.stateId,issuedAt:state.issuedAt,issuerReference:issuer,recipientReference:f.recipient.reference,sample:f.sample,
  body:{parties:[f.issuer,f.recipient],outcome:{reference:f.thread.reference,statement:f.thread.objective,assessedBy:issuer,sharedAcceptance:false},conditions:[],
   requirements:state.requirements.map(r=>({reference:r.reference,partyReference:r.partyReference,outcomeReference:f.thread.reference,conditionReference:null,expectedOutcome:r.expectedOutcome,localAssessment:r.localAssessment,assessedBy:issuer,commitmentStatementIds:f.capsules.filter(c=>c.statement.issuer.reference===r.partyReference&&c.statement.commitmentRef===r.commitmentRef).map(c=>c.statement.statementId)})),
   commitments:f.capsules.map(c=>({statementId:c.statement.statementId,capsuleDigest:c.integrity.digest})),dependencies:state.dependencies.map(d=>({...d,assertedBy:issuer})),
   evidenceReferences:f.capsules.filter(c=>c.statement.promise.status==='completed'&&c.statement.promise.completionEvidence!==null).map(c=>({reference:'completion:'+c.statement.statementId,partyReference:c.statement.issuer.reference,sourceStatementId:c.statement.statementId,kind:'completion-claim' as const,recipientAccepted:false as const})),moneyReferences:[],
   decisionBoundary:{canonicalMutationAllowed:false,humanConfirmationRequired:true,eachPartyControlsItsOwnDecisions:true},change:{kind:'snapshot',previousMessageDigest:null},provenance:{sourceStateId:state.stateId,sourceStateFingerprint:fingerprint,capsules:f.capsules}}});
}
export async function commercialProtocolObservation(verification:Awaited<ReturnType<typeof verifyCommercialProtocol>>):Promise<ExternalObservation>{
 const m=verification.message;return {schemaVersion:1,sourceKind:'csv_import',sourceNamespace:await exchangeSourceNamespace('commercial-protocol',m.issuerReference),sourceEventId:m.messageId,sourceVersion:verification.fingerprint,observedAt:m.issuedAt,summary:'External commercial protocol snapshot',rawText:JSON.stringify(m)};
}
