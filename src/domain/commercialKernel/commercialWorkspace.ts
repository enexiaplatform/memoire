import type {CommercialCommitment} from './types.ts';
export type WorkspaceMember={actorId:string;role:'reader'|'reviewer'};
/** Owner-controlled sharing configuration; runtime membership also requires the actor's live acceptance. */
export type CommercialWorkspace={id:string;userId:string|null;version:number;name:string;members:WorkspaceMember[];commitmentIds:string[];
 lifecycle:'active'|'retired';revisionReason:string;sourceType:'manual';createdAt:string;updatedAt:string;isSample?:boolean};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function isCommercialWorkspace(value:unknown):value is CommercialWorkspace{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const row=value as CommercialWorkspace;
 return text(row.id,200)&&(row.userId===null||text(row.userId,200))&&Number.isSafeInteger(row.version)&&row.version>0&&row.version<=2147483647
  &&text(row.name,200)&&text(row.revisionReason,1000)&&['active','retired'].includes(row.lifecycle)&&row.sourceType==='manual'
  &&Array.isArray(row.members)&&row.members.length<=20&&row.members.every(member=>member&&Object.keys(member).length===2&&uuid(member.actorId)&&member.actorId!==row.userId&&['reader','reviewer'].includes(member.role))
  &&new Set(row.members.map(member=>member.actorId)).size===row.members.length
  &&Array.isArray(row.commitmentIds)&&row.commitmentIds.length<=50&&row.commitmentIds.every(id=>text(id,200))&&new Set(row.commitmentIds).size===row.commitmentIds.length
  &&[row.createdAt,row.updatedAt].every(at=>typeof at==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(at)&&Number.isFinite(Date.parse(at)))&&Date.parse(row.updatedAt)>=Date.parse(row.createdAt);
}
export function validateWorkspaceReferences(workspace:CommercialWorkspace,commitments:CommercialCommitment[]){
 if(!isCommercialWorkspace(workspace))throw new Error('Provide a valid workspace name, members, shared promises and revision reason.');
 if(workspace.commitmentIds.some(id=>!commitments.some(commitment=>commitment.id===id&&commitment.userId===workspace.userId&&Boolean(commitment.isSample)===Boolean(workspace.isSample))))throw new Error('Only promises owned by this workspace can be shared.');
}
