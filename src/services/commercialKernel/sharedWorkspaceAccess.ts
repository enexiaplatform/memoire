import {supabaseClient} from '../../lib/supabaseClient';
export type WorkspaceInvitation={ownerId:string;workspaceId:string;name:string;accessEpoch:string;role:'owner'|'reader'|'reviewer';accepted:boolean};
export type SharedWorkspaceView=WorkspaceInvitation&{version:number;commitments:{id:string;promise:string;responsiblePerson:string;dueDate:string|null;status:string;updatedAt:string}[];reviews:{id:string;actorId:string;commitmentId:string;review:string;recordedAt:string}[]};
async function rpc(name:string,args?:Record<string,unknown>){
 if(!supabaseClient)throw new Error('An account connection is required for shared access.');
 const {data,error}=await supabaseClient.rpc(name,args);if(error)throw new Error('Shared access is unavailable or has changed. Refresh after the account has synchronized.');return data;
}
export async function listWorkspaceInvitations():Promise<WorkspaceInvitation[]>{return await rpc('list_commercial_workspace_invitations') as WorkspaceInvitation[];}
export async function readSharedWorkspace(invitation:WorkspaceInvitation):Promise<SharedWorkspaceView>{return await rpc('read_commercial_workspace',{p_owner:invitation.ownerId,p_workspace:invitation.workspaceId}) as SharedWorkspaceView;}
export async function respondSharedWorkspace(invitation:WorkspaceInvitation,requestId:string,response:'accepted'|'declined'|'review',commitmentId:string|null=null,review:string|null=null){
 return await rpc('respond_commercial_workspace',{p_owner:invitation.ownerId,p_workspace:invitation.workspaceId,p_epoch:invitation.accessEpoch,p_request:requestId,p_response:response,p_commitment:commitmentId,p_review:review});
}
