import type {CommercialScope} from './types.ts';
import {verifyTrustCapsule,trustCapsuleObservation} from './trustCapsule.ts';
import {receiveExternalObservation} from './externalObservationCommands.ts';
export async function receiveTrustCapsule(scope:CommercialScope,value:unknown,input:{recipientReference:string;expectedIssuerKeyFingerprint?:string;confirmed:boolean}){
 if(!input.confirmed)throw new Error('Confirm receiving the checked capsule as an unaccepted source claim.');
 const verification=await verifyTrustCapsule(value,{expectedRecipientReference:input.recipientReference,...(input.expectedIssuerKeyFingerprint?{expectedIssuerKeyFingerprint:input.expectedIssuerKeyFingerprint}:{})});
 const statement=verification.capsule.statement;if(statement.sample!==Boolean(scope.sampleDataActive))throw new Error('Capsule sample scope does not match this intake.');
 const receipt=await receiveExternalObservation(scope,await trustCapsuleObservation(verification));
 return {...receipt,verification};
}
