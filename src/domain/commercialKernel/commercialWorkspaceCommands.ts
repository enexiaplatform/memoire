import type {CommercialScope,CommercialCommitment} from './types.ts';
import {validateWorkspaceReferences,type WorkspaceMember,type CommercialWorkspace} from './commercialWorkspace.ts';
import {loadCommercialWorkspaces,saveCommercialWorkspace} from '../../services/commercialKernel/commercialWorkspaceStore.ts';
export function configureCommercialWorkspace(scope:CommercialScope,input:{id?:string;expectedVersion?:number;name:string;members:WorkspaceMember[];commitmentIds:string[];revisionReason:string;lifecycle:'active'|'retired';confirmed:boolean},commitments:CommercialCommitment[]){
 if(!input.confirmed)throw new Error('Confirm the people and exact promises you intend to share.');
 const prior=input.id?loadCommercialWorkspaces().find(row=>row.id===input.id):undefined;
 if(input.id&&(!prior||prior.userId!==scope.userId||Boolean(prior.isSample)!==Boolean(scope.sampleDataActive)||prior.version!==input.expectedVersion))throw new Error('Workspace changed or is outside this owner scope. Reopen before editing.');
 const at=new Date(Math.max(Date.now(),prior?Date.parse(prior.updatedAt)+1:0)).toISOString();
 const workspace:CommercialWorkspace={id:prior?.id||crypto.randomUUID(),userId:scope.userId,version:(prior?.version||0)+1,name:input.name.trim(),members:input.members.map(member=>({...member,actorId:member.actorId.toLowerCase()})),commitmentIds:[...input.commitmentIds],revisionReason:input.revisionReason.trim(),lifecycle:input.lifecycle,sourceType:'manual',createdAt:prior?.createdAt||at,updatedAt:at,...(scope.sampleDataActive?{isSample:true}:{})};
 validateWorkspaceReferences(workspace,commitments);saveCommercialWorkspace(workspace);return workspace;
}
