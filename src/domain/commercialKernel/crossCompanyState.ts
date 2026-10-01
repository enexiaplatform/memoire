import type {CommercialEvent} from './types.ts';
import {normalizeFederatedThreadExchange,verifyFederatedThreadExchange,type FederatedThreadExchange} from './federatedThread.ts';
import {sha256Hex} from './trustCapsule.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';
export type SharedRequirement={reference:string;partyReference:string;expectedOutcome:string;localAssessment:'resolved'|'unresolved'|'conflicted';commitmentRef:string|null};
export type SharedDependency={dependentReference:string;prerequisiteReference:string;basis:string};
export type CrossCompanyState={format:'memoire.cross-company-state';version:1;stateId:string;issuedAt:string;federation:FederatedThreadExchange;
 requirements:SharedRequirement[];dependencies:SharedDependency[];authority:{kind:'issuer-local-assessment';recipientAccepted:false}};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&new TextDecoder().decode(new TextEncoder().encode(value))===value;
const at=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&isValidBusinessDate(value.slice(0,10))&&Number.isFinite(Date.parse(value));
export function normalizeCrossCompanyState(value:unknown):CrossCompanyState{
 if(!exact(value,['format','version','stateId','issuedAt','federation','requirements','dependencies','authority']))throw new Error('Unsupported cross-company state fields.');
 const row=value as unknown as CrossCompanyState;
 if(row.format!=='memoire.cross-company-state'||row.version!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.stateId)||!at(row.issuedAt)
  ||!Array.isArray(row.requirements)||row.requirements.length<2||row.requirements.length>20||!Array.isArray(row.dependencies)||row.dependencies.length<1||row.dependencies.length>30
  ||!exact(row.authority,['kind','recipientAccepted'])||row.authority.kind!=='issuer-local-assessment'||row.authority.recipientAccepted!==false)throw new Error('Invalid cross-company state or local authority declaration.');
 const federation=normalizeFederatedThreadExchange(row.federation),parties=[federation.issuer.reference,federation.recipient.reference],refs=new Set<string>();
 const requirements=row.requirements.map(item=>{
  if(!exact(item,['reference','partyReference','expectedOutcome','localAssessment','commitmentRef'])||!text(item.reference,200)||refs.has(item.reference)||!parties.includes(item.partyReference as string)||!text(item.expectedOutcome,1000)||!['resolved','unresolved','conflicted'].includes(item.localAssessment as string)
   ||!(item.commitmentRef===null||text(item.commitmentRef,200)&&federation.capsules.some(capsule=>capsule.statement.issuer.reference===item.partyReference&&capsule.statement.commitmentRef===item.commitmentRef)))throw new Error('Invalid public requirement, party or selected promise reference.');
  refs.add(item.reference);return {reference:item.reference,partyReference:item.partyReference,expectedOutcome:item.expectedOutcome,localAssessment:item.localAssessment,commitmentRef:item.commitmentRef} as SharedRequirement;
 });
 const pairs=new Set<string>(),adjacency=new Map<string,string[]>();
 const dependencies=row.dependencies.map(item=>{
  if(!exact(item,['dependentReference','prerequisiteReference','basis'])||!text(item.dependentReference,200)||!text(item.prerequisiteReference,200)||item.dependentReference===item.prerequisiteReference||!refs.has(item.dependentReference)||!refs.has(item.prerequisiteReference)||!text(item.basis,1000))throw new Error('Invalid shared prerequisite references.');
  const pair=JSON.stringify([item.dependentReference,item.prerequisiteReference]);if(pairs.has(pair))throw new Error('Duplicate shared prerequisite.');pairs.add(pair);adjacency.set(item.dependentReference,[...(adjacency.get(item.dependentReference)||[]),item.prerequisiteReference]);
  return {dependentReference:item.dependentReference,prerequisiteReference:item.prerequisiteReference,basis:item.basis};
 });
 // Wire-level reference integrity only. Business readings come from the existing Kernel engines.
 const done=new Set<string>();const visit=(ref:string,path:Set<string>)=>{if(path.has(ref))throw new Error('Shared prerequisites cannot form a cycle.');if(done.has(ref))return;const next=new Set(path);next.add(ref);for(const child of adjacency.get(ref)||[])visit(child,next);done.add(ref);};
 for(const ref of refs)visit(ref,new Set());
 if(!dependencies.some(edge=>requirements.find(r=>r.reference===edge.dependentReference)!.partyReference!==requirements.find(r=>r.reference===edge.prerequisiteReference)!.partyReference))throw new Error('Select an existing prerequisite spanning the declared parties.');
 const result:CrossCompanyState={format:'memoire.cross-company-state',version:1,stateId:row.stateId,issuedAt:row.issuedAt,federation,requirements,dependencies,authority:{kind:'issuer-local-assessment',recipientAccepted:false}};
 if(JSON.stringify(result).length>20000)throw new Error('Select fewer requirements or capsules for this bounded exchange.');return result;
}
export async function verifyCrossCompanyState(value:unknown,recipientReference?:string){const state=normalizeCrossCompanyState(value);await verifyFederatedThreadExchange(state.federation,{recipientReference});return {state,fingerprint:await sha256Hex(new TextEncoder().encode(JSON.stringify(state))),acceptedCommercialTruth:false as const};}
export async function deriveCrossCompanyState(value:unknown){
 const {state}=await verifyCrossCompanyState(value),byRef=new Map(state.requirements.map(row=>[row.reference,row]));
 return {state,assessedBy:state.federation.issuer.reference,issuerSelectedRequirementsSatisfied:state.requirements.every(row=>row.localAssessment==='resolved'),sharedOutcomeConfirmed:false as const,
  dependencies:state.dependencies.map(edge=>{const prerequisite=byRef.get(edge.prerequisiteReference)!,claims=state.federation.capsules.filter(capsule=>capsule.statement.issuer.reference===prerequisite.partyReference&&capsule.statement.commitmentRef===prerequisite.commitmentRef);
   return {...edge,prerequisiteLocalAssessment:prerequisite.localAssessment,reportedPromiseStatuses:[...new Set(claims.map(capsule=>capsule.statement.promise.status))],sourceStatementIds:claims.map(capsule=>capsule.statement.statementId),independentVerificationNeeded:prerequisite.localAssessment!=='resolved'};}),acceptedCommercialTruth:false as const};
}
export function isCrossCompanyPublication(event:CommercialEvent){try{const state=normalizeCrossCompanyState(event.structuredPayload);return event.eventType==='cross_company_state_issued'&&event.id==='cross-company-state:'+state.stateId&&event.idempotencyKey===event.id&&event.sourceType==='manual'&&event.sourceId===state.stateId
 &&event.summary==='Cross-company assessment issued'&&text(event.opportunityId,200)&&!event.accountId&&!event.threadId&&!event.commitmentId&&!event.sourceUrl&&!event.sourceUpdatedAt&&Boolean(event.isSample)===state.federation.sample
 &&[event.occurredAt,event.recordedAt,event.createdAt].every(at)&&event.occurredAt===event.recordedAt&&event.createdAt===event.recordedAt;}catch{return false;}}
