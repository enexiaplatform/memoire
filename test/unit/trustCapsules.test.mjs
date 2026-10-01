import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
class Storage{data=new Map();get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const storage=new Storage();globalThis.window={localStorage:storage,dispatchEvent:()=>true};globalThis.localStorage=storage;globalThis.CustomEvent=class{};
registerHooks({load(url,context,next){if(url.endsWith('/lib/supabaseClient.ts'))return {format:'module',shortCircuit:true,source:'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;'};return next(url,context);}});
const {createTrustCapsule,verifyTrustCapsule,sha256Hex}=await import('../../src/domain/commercialKernel/trustCapsule.ts');
const {receiveTrustCapsule}=await import('../../src/domain/commercialKernel/trustCapsuleCommands.ts');
const {EVENT_STORAGE_KEY}=await import('../../src/services/commercialKernel/eventStore.ts');
const {buildRestorePlan}=await import('../../src/utils/workspaceBackup.ts');
const statement=()=>({format:'memoire.shared-commitment',version:1,statementId:crypto.randomUUID(),issuedAt:'2026-10-01T00:00:00Z',issuer:{reference:'org-a',label:'Issuer'},recipient:{reference:'org-b',label:'Recipient'},commitmentRef:'PUBLIC-42',promise:{responsiblePerson:'Person',text:'Selected promise',dueDate:null,status:'open',completionEvidence:null},sourceUpdatedAt:'2026-09-01T00:00:00Z',sample:false,authority:{kind:'issuer-declaration',recipientAccepted:false}});
const keys=()=>crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
beforeEach(()=>storage.data.clear());
test('unsigned capsule binds exact version, party scope and minimal statement without claiming identity or truth',async()=>{
 const value=statement(),capsule=await createTrustCapsule(value),result=await verifyTrustCapsule(capsule,{expectedRecipientReference:'org-b'});
 assert.equal(result.integrityVerified,true);assert.equal(result.signatureVerified,null);assert.equal(result.issuerOrganizationIdentityVerified,false);assert.equal(result.acceptedCommercialTruth,false);assert.equal(result.capsule.statement.statementId,value.statementId);
 await assert.rejects(verifyTrustCapsule(capsule,{expectedRecipientReference:'foreign'}),/recipient/);await assert.rejects(verifyTrustCapsule(capsule,{expectedIssuerKeyFingerprint:'a'.repeat(64)}),/signing key/);
 const reordered={signature:null,integrity:capsule.integrity,statement:{...value,issuer:{label:'Issuer',reference:'org-a'}},version:1,format:'memoire.trust-capsule'};assert.equal((await verifyTrustCapsule(reordered)).capsuleFingerprint,result.capsuleFingerprint);
});
test('tampered content, hidden fields and unknown algorithms fail before any receipt',async()=>{
 const capsule=await createTrustCapsule(statement());
 for(const patch of [{version:2},{secret:'private'},{integrity:{algorithm:'weak',digest:capsule.integrity.digest}},{statement:{...capsule.statement,promise:{...capsule.statement.promise,text:'Changed'}}}])await assert.rejects(verifyTrustCapsule({...capsule,...patch}));assert.equal(storage.data.size,0);
});
test('optional ECDSA signature verifies and only an independently configured fingerprint matches the issuer key',async()=>{
 const pair=await keys(),capsule=await createTrustCapsule(statement(),pair),fingerprint=await sha256Hex(await crypto.subtle.exportKey('spki',pair.publicKey));
 const result=await verifyTrustCapsule(capsule,{expectedIssuerKeyFingerprint:fingerprint});assert.equal(result.signatureVerified,true);assert.equal(result.configuredIssuerKeyMatched,true);assert.equal(result.issuerOrganizationIdentityVerified,false);
 assert.equal(JSON.stringify(capsule).includes('privateKey'),false);await assert.rejects(verifyTrustCapsule(capsule,{expectedIssuerKeyFingerprint:'a'.repeat(64)}),/signing key/);
});
test('recomputed content digest cannot rescue a forged signature and mismatched signing keys are refused',async()=>{
 const pair=await keys(),capsule=await createTrustCapsule(statement(),pair);const altered=await createTrustCapsule({...capsule.statement,recipient:{reference:'evil',label:'Changed'}});altered.signature=capsule.signature;await assert.rejects(verifyTrustCapsule(altered),/signature/);
 const other=await keys();await assert.rejects(createTrustCapsule(statement(),{privateKey:pair.privateKey,publicKey:other.publicKey}),/key pair/);
});
test('confirmed capsule receipt preserves verifiable provenance and backup, while leaving canonical truth untouched',async()=>{
 const capsule=await createTrustCapsule(statement()),scope={userId:'recipient',sampleDataActive:false},input={recipientReference:'org-b',confirmed:true};await assert.rejects(receiveTrustCapsule(scope,capsule,{...input,confirmed:false}),/Confirm/);
 const first=await receiveTrustCapsule(scope,capsule,input),retry=await receiveTrustCapsule(scope,capsule,input);assert.equal(retry.duplicate,true);assert.deepEqual(JSON.parse(first.event.structuredPayload.rawText),capsule);assert.equal(first.event.commitmentId,null);assert.equal(storage.data.size,1);
 const plan=buildRestorePlan({formatVersion:15,exportedAt:new Date().toISOString(),localBrowserData:{[EVENT_STORAGE_KEY]:[first.event]}});const restored=JSON.parse(plan.writes.find(row=>row.key===EVENT_STORAGE_KEY).value)[0];assert.equal((await verifyTrustCapsule(JSON.parse(restored.structuredPayload.rawText))).capsuleFingerprint,first.verification.capsuleFingerprint);
});
test('sample mismatch is refused and future issuer timestamps remain reported claims at present receipt time',async()=>{
 const capsule=await createTrustCapsule({...statement(),issuedAt:'2099-01-01T00:00:00Z'}),scope={userId:'recipient',sampleDataActive:false};await assert.rejects(receiveTrustCapsule({...scope,sampleDataActive:true},capsule,{recipientReference:'org-b',confirmed:true}),/sample/);
 const result=await receiveTrustCapsule(scope,capsule,{recipientReference:'org-b',confirmed:true});assert.notEqual(result.event.occurredAt,capsule.statement.issuedAt);assert.equal(result.event.structuredPayload.observedAt,'2099-01-01T00:00:00Z');
});
test('maximum-size declared issuer references remain distinct and receivable without namespace truncation',async()=>{
 const scope={userId:'recipient',sampleDataActive:false},a={...statement(),issuer:{reference:'a'.repeat(200),label:'Issuer'}},b={...a,issuer:{reference:'a'.repeat(199)+'b',label:'Other issuer'}};
 const first=await receiveTrustCapsule(scope,await createTrustCapsule(a),{recipientReference:'org-b',confirmed:true}),second=await receiveTrustCapsule(scope,await createTrustCapsule(b),{recipientReference:'org-b',confirmed:true});assert.notEqual(first.event.structuredPayload.sourceNamespace,second.event.structuredPayload.sourceNamespace);assert.ok(first.event.structuredPayload.sourceNamespace.length<=200);
 const {receiveSharedCommitment}=await import('../../src/domain/commercialKernel/sharedCommitmentCommands.ts');assert.equal((await receiveSharedCommitment(scope,a,'org-b',true)).duplicate,false);
});
