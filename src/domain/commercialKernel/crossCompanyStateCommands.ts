import type {CommercialScope,CommercialEvent} from './types.ts';
import {normalizeFederatedThreadExchange,verifyFederatedThreadExchange} from './federatedThread.ts';
import {normalizeCrossCompanyState,verifyCrossCompanyState} from './crossCompanyState.ts';
import {projectOutcomeRequirements} from './outcomeRequirement.ts';
import {validateDependencyGraph} from './commercialDependency.ts';
import {sha256Hex} from './trustCapsule.ts';
import {exchangeSourceNamespace} from './externalObservation.ts';
import {receiveExternalObservation} from './externalObservationCommands.ts';
import {appendEvent,EVENT_STORAGE_KEY,eventCodec} from '../../services/commercialKernel/eventStore.ts';
import {loadOutcomeRequirements,requirementCodec} from '../../services/commercialKernel/requirementStore.ts';
import {loadCommercialDependencies,dependencyCodec} from '../../services/commercialKernel/dependencyStore.ts';
import {loadCommercialConditions,conditionCodec} from '../../services/commercialKernel/conditionStore.ts';
import {loadCommercialEvidence,evidenceCodec} from '../../services/commercialKernel/evidenceStore.ts';
export type PublicRequirementMapping={requirementId:string;reference:string;partyReference:string;commitmentRef:string|null};
export type CrossCompanyBasis={opportunityId:string;federationEventId:string;mappings:PublicRequirementMapping[]};
function events(){const raw:unknown=JSON.parse(window.localStorage.getItem(EVENT_STORAGE_KEY)||'[]');if(!Array.isArray(raw)||raw.some(row=>!eventCodec.sanitize(row)))throw new Error('Event history is unreadable.');return raw as CommercialEvent[];}
export async function crossCompanyFederationSources(scope:CommercialScope){const sources=[];for(const event of events().filter(row=>row.userId===scope.userId&&Boolean(row.isSample)===Boolean(scope.sampleDataActive))){try{let value:unknown;if(event.eventType==='federated_thread_issued')value=event.structuredPayload;else if(event.eventType==='external_observation_received')value=JSON.parse(String(event.structuredPayload.rawText));else continue;
 if((value as {format?:string})?.format==='memoire.federated-thread')sources.push({eventId:event.id,exchange:(await verifyFederatedThreadExchange(value)).exchange});}catch{continue;}}return sources;}
function currentSources(scope:CommercialScope,opportunityId:string){
 for(const codec of [requirementCodec,dependencyCodec,conditionCodec,evidenceCodec]){const raw:unknown=JSON.parse(window.localStorage.getItem(codec.storageKey)||'[]');if(!Array.isArray(raw)||raw.some(row=>!codec.sanitize(row)))throw new Error('Canonical requirement, dependency or evidence storage is unreadable.');}
 const owned=(row:{userId?:string|null;isSample?:boolean})=>row.userId===scope.userId&&Boolean(row.isSample)===Boolean(scope.sampleDataActive);
 const requirements=loadOutcomeRequirements().filter(row=>owned(row)&&row.opportunityId===opportunityId),dependencies=loadCommercialDependencies().filter(row=>owned(row)&&row.opportunityId===opportunityId),conditions=loadCommercialConditions().filter(row=>owned(row)&&(!row.opportunityId||row.opportunityId===opportunityId)),evidence=loadCommercialEvidence().filter(row=>owned(row));
 validateDependencyGraph(requirements,dependencies);return {requirements,dependencies,conditions,evidence};
}
const fingerprint=(sources:ReturnType<typeof currentSources>)=>sha256Hex(new TextEncoder().encode(JSON.stringify(sources)));
export async function previewCrossCompanyState(scope:CommercialScope,basis:CrossCompanyBasis){
 const source=(await crossCompanyFederationSources(scope)).find(row=>row.eventId===basis.federationEventId);if(!source)throw new Error('Choose a checked federation exchange in this owner scope.');const federation=normalizeFederatedThreadExchange(source.exchange),sources=currentSources(scope,basis.opportunityId),readings=projectOutcomeRequirements(sources.requirements,sources.conditions,sources.evidence);
 if(!Array.isArray(basis.mappings)||basis.mappings.length<2||basis.mappings.length>20||new Set(basis.mappings.map(row=>row.requirementId)).size!==basis.mappings.length)throw new Error('Select two to twenty unique existing requirements.');
 const mapping=new Map(basis.mappings.map(row=>[row.requirementId,row]));const requirements=basis.mappings.map(row=>{const reading=readings.find(item=>item.requirement.id===row.requirementId&&item.requirement.lifecycle==='active');if(!reading)throw new Error('Selected requirement is outside this local opportunity scope.');return {reference:row.reference,partyReference:row.partyReference,commitmentRef:row.commitmentRef,expectedOutcome:reading.requirement.expectedOutcome,localAssessment:reading.resolution};});
 const dependencies=sources.dependencies.filter(edge=>edge.lifecycle==='active'&&mapping.has(edge.dependentRequirementId)&&mapping.has(edge.prerequisiteRequirementId)).map(edge=>({dependentReference:mapping.get(edge.dependentRequirementId)!.reference,prerequisiteReference:mapping.get(edge.prerequisiteRequirementId)!.reference,basis:edge.basis}));
 const state=normalizeCrossCompanyState({format:'memoire.cross-company-state',version:1,stateId:crypto.randomUUID(),issuedAt:new Date().toISOString(),federation,requirements,dependencies,authority:{kind:'issuer-local-assessment',recipientAccepted:false}});
 return {state,basis:structuredClone(basis),sourceFingerprint:await fingerprint(sources)};
}
export async function issueCrossCompanyState(scope:CommercialScope,input:Awaited<ReturnType<typeof previewCrossCompanyState>>&{confirmed:boolean}){
 if(!input.confirmed)throw new Error('Confirm these public requirements, prerequisite relationships and issuer-local assessments.');const state=(await verifyCrossCompanyState(input.state)).state;
 const existing=events().find(row=>row.id==='cross-company-state:'+state.stateId);if(existing){if(existing.userId!==scope.userId||Boolean(existing.isSample)!==Boolean(scope.sampleDataActive)||existing.opportunityId!==input.basis.opportunityId||JSON.stringify(existing.structuredPayload)!==JSON.stringify(state))throw new Error('Assessment identity conflicts with an earlier disclosure.');return state;}
 const fresh=await previewCrossCompanyState(scope,input.basis);if(fresh.sourceFingerprint!==input.sourceFingerprint||JSON.stringify({...fresh.state,stateId:state.stateId,issuedAt:state.issuedAt})!==JSON.stringify(state))throw new Error('Canonical state or disclosure basis changed. Reopen and confirm the current reading.');
 const finalSources=currentSources(scope,input.basis.opportunityId),finalSerialized=JSON.stringify(finalSources);if(await fingerprint(finalSources)!==input.sourceFingerprint||JSON.stringify(currentSources(scope,input.basis.opportunityId))!==finalSerialized)throw new Error('Canonical state changed during verification.');
 const currentEvents=events(),basisEvent=currentEvents.find(row=>row.id===input.basis.federationEventId&&row.userId===scope.userId&&Boolean(row.isSample)===Boolean(scope.sampleDataActive));
 if(!basisEvent)throw new Error('Federation source is no longer available.');const currentExchange=normalizeFederatedThreadExchange(basisEvent.eventType==='federated_thread_issued'?basisEvent.structuredPayload:JSON.parse(String(basisEvent.structuredPayload.rawText)));if(JSON.stringify(currentExchange)!==JSON.stringify(state.federation))throw new Error('Federation source changed during verification.');
 const id='cross-company-state:'+state.stateId,prior=currentEvents.find(row=>row.id===id);if(prior){if(prior.userId!==scope.userId||Boolean(prior.isSample)!==Boolean(scope.sampleDataActive)||prior.opportunityId!==input.basis.opportunityId||JSON.stringify(prior.structuredPayload)!==JSON.stringify(state))throw new Error('Assessment identity conflicts with an earlier disclosure.');return state;}
 const at=new Date().toISOString();appendEvent({id,userId:scope.userId,eventType:'cross_company_state_issued',occurredAt:at,recordedAt:at,createdAt:at,summary:'Cross-company assessment issued',structuredPayload:state,idempotencyKey:id,sourceType:'manual',sourceId:state.stateId,
  opportunityId:input.basis.opportunityId,accountId:null,threadId:null,commitmentId:null,sourceUrl:null,sourceUpdatedAt:null,...(scope.sampleDataActive?{isSample:true}:{})});return state;
}
export async function receiveCrossCompanyState(scope:CommercialScope,value:unknown,recipientReference:string,confirmed:boolean){
 if(!confirmed)throw new Error('Confirm receiving the issuer-local assessment as external claims.');const {state,fingerprint}=await verifyCrossCompanyState(value,recipientReference);if(state.federation.sample!==Boolean(scope.sampleDataActive))throw new Error('Assessment sample scope does not match.');
 return receiveExternalObservation(scope,{schemaVersion:1,sourceKind:'csv_import',sourceNamespace:await exchangeSourceNamespace('cross-company-state',state.federation.issuer.reference),sourceEventId:state.stateId,sourceVersion:fingerprint,observedAt:state.issuedAt,summary:'External cross-company assessment',rawText:JSON.stringify(state)});
}
