import {normalizeSharedCommitment,type SharedCommitmentStatement} from './sharedCommitment.ts';
import {exchangeSourceNamespace,type ExternalObservation} from './externalObservation.ts';
export type TrustCapsule={format:'memoire.trust-capsule';version:1;statement:SharedCommitmentStatement;
 integrity:{algorithm:'SHA-256';digest:string};signature:null|{algorithm:'ECDSA-P256-SHA256';publicKey:string;value:string}};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const bytes=(value:string)=>new TextEncoder().encode(value);
export async function sha256Hex(value:BufferSource){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map(n=>n.toString(16).padStart(2,'0')).join('');}
const base64=(value:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(value)));
function decode(value:unknown,max:number){
 if(typeof value!=='string'||value.length>max||!value)throw new Error('Invalid capsule signature encoding.');
 const decoded=atob(value);if(btoa(decoded)!==value)throw new Error('Invalid capsule signature encoding.');return Uint8Array.from(decoded,c=>c.charCodeAt(0));
}
export function normalizeTrustCapsule(value:unknown):TrustCapsule{
 if(!exact(value,['format','version','statement','integrity','signature'])||value.format!=='memoire.trust-capsule'||value.version!==1
  ||!exact(value.integrity,['algorithm','digest'])||value.integrity.algorithm!=='SHA-256'||typeof value.integrity.digest!=='string'||!/^[a-f0-9]{64}$/.test(value.integrity.digest))throw new Error('Unsupported trust capsule schema or integrity algorithm.');
 const statement=normalizeSharedCommitment(value.statement);let signature:TrustCapsule['signature']=null;
 if(value.signature!==null){if(!exact(value.signature,['algorithm','publicKey','value'])||value.signature.algorithm!=='ECDSA-P256-SHA256'||decode(value.signature.publicKey,300).length>150||decode(value.signature.value,100).length!==64)throw new Error('Unsupported capsule signature.');
  signature={algorithm:'ECDSA-P256-SHA256',publicKey:String(value.signature.publicKey),value:String(value.signature.value)};}
 return {format:'memoire.trust-capsule',version:1,statement,integrity:{algorithm:'SHA-256',digest:value.integrity.digest},signature};
}
const core=(statement:SharedCommitmentStatement)=>({format:'memoire.trust-capsule' as const,version:1 as const,statement});
const signingBytes=(capsule:TrustCapsule)=>bytes(JSON.stringify({...core(capsule.statement),integrity:capsule.integrity}));
/** Default capsule proves transport integrity only; signing keys remain under the host's custody. */
export async function createTrustCapsule(value:unknown,signer?:{privateKey:CryptoKey;publicKey:CryptoKey}):Promise<TrustCapsule>{
 const statement=normalizeSharedCommitment(value),capsule:TrustCapsule={...core(statement),integrity:{algorithm:'SHA-256',digest:await sha256Hex(bytes(JSON.stringify(core(statement))))},signature:null};
 if(signer){try{const publicKey=base64(await crypto.subtle.exportKey('spki',signer.publicKey));const signature=base64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,signingBytes(capsule)));capsule.signature={algorithm:'ECDSA-P256-SHA256',publicKey,value:signature};await verifyTrustCapsule(capsule);}catch{throw new Error('Capsule signing failed or the supplied key pair does not match.');}}
 return capsule;
}
export async function verifyTrustCapsule(value:unknown,options:{expectedRecipientReference?:string;expectedIssuerKeyFingerprint?:string}={}){
 const capsule=normalizeTrustCapsule(value);
 if(options.expectedRecipientReference!==undefined&&capsule.statement.recipient.reference!==options.expectedRecipientReference)throw new Error('Capsule recipient scope does not match.');
 if(options.expectedIssuerKeyFingerprint!==undefined&&!/^[a-f0-9]{64}$/.test(options.expectedIssuerKeyFingerprint))throw new Error('Provide the agreed issuer key fingerprint.');
 const digest=await sha256Hex(bytes(JSON.stringify(core(capsule.statement))));if(digest!==capsule.integrity.digest)throw new Error('Capsule content or scope failed its integrity check.');
 let signatureVerified:boolean|null=null,signerKeyFingerprint:string|null=null;
 if(capsule.signature){try{const keyBytes=decode(capsule.signature.publicKey,300),signature=decode(capsule.signature.value,100);const key=await crypto.subtle.importKey('spki',keyBytes,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  signatureVerified=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signature,signingBytes(capsule));if(!signatureVerified)throw new Error('Invalid signature');signerKeyFingerprint=await sha256Hex(keyBytes);
 }catch{throw new Error('Capsule signature verification failed.');}}
 if(options.expectedIssuerKeyFingerprint!==undefined&&signerKeyFingerprint!==options.expectedIssuerKeyFingerprint)throw new Error('Capsule does not match the agreed issuer signing key.');
 return {capsule,integrityVerified:true as const,signatureVerified,signerKeyFingerprint,
  configuredIssuerKeyMatched:options.expectedIssuerKeyFingerprint!==undefined?true:null,
  issuerOrganizationIdentityVerified:false as const,acceptedCommercialTruth:false as const,
  capsuleFingerprint:await sha256Hex(bytes(JSON.stringify(capsule)))};
}
export async function trustCapsuleObservation(verification:Awaited<ReturnType<typeof verifyTrustCapsule>>):Promise<ExternalObservation>{
 const statement=verification.capsule.statement;
 return {schemaVersion:1,sourceKind:'csv_import',sourceNamespace:await exchangeSourceNamespace('trust-capsule',statement.issuer.reference),sourceEventId:statement.statementId,sourceVersion:verification.capsuleFingerprint,
  observedAt:statement.issuedAt,summary:'External trust capsule',rawText:JSON.stringify(verification.capsule)};
}
