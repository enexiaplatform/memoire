import type {CommercialCommitment,CommercialScope} from './types.ts';
import type {CrmLiteOpportunity} from '../../services/opportunityStore.ts';
import {isValidBusinessDate} from '../../utils/safeDate.ts';
/** A review of recorded internal promises. Labels are not authenticated actors. */
export function deriveTeamCoordination(scope:CommercialScope,commitments:CommercialCommitment[],opportunities:CrmLiteOpportunity[],today:string){
 if(!isValidBusinessDate(today))throw new Error('A valid review date is required.');
 const same=(r:{userId?:string|null;isSample?:boolean})=>(r.userId??null)===scope.userId&&Boolean(r.isSample)===scope.sampleDataActive;
 const opportunityById=new Map(opportunities.filter(same).map(row=>[row.id,row]));
 return commitments.filter(row=>same(row)&&row.commitmentParty==='internal'&&row.status==='open').map(commitment=>{
  const opportunity=opportunityById.get(commitment.opportunityId||'');
  const date=isValidBusinessDate(commitment.currentDueDate)?commitment.currentDueDate:null;
  return {id:commitment.id,ownerLabel:commitment.ownerLabel.trim()||'Owner not recorded',promise:commitment.commitmentText,
   accountName:commitment.accountName,opportunityId:opportunity?.id||null,opportunityName:opportunity?.opportunityName||null,
   dueDate:date,timing:date===null?'undated':date<today?'overdue':date===today?'due_today':'upcoming',
   agreementReference:commitment.sourceType==='manual'?commitment.sourceId||null:null,recordedAt:commitment.createdAt,updatedAt:commitment.updatedAt};
 }).sort((a,b)=>(a.dueDate||'9999-12-31').localeCompare(b.dueDate||'9999-12-31')||a.ownerLabel.localeCompare(b.ownerLabel)||a.id.localeCompare(b.id));
}
export type TeamCoordinationRow=ReturnType<typeof deriveTeamCoordination>[number];
/** Explicitly selected, minimal plain text for review outside the app. */
export function teamReviewText(rows:TeamCoordinationRow[],selectedIds:readonly string[],reviewedAt:string){
 if(!Number.isFinite(Date.parse(reviewedAt)))throw new Error('Review time is required.');
 const selected=new Set(selectedIds),visible=rows.filter(row=>selected.has(row.id));
 return ['Recorded team coordination','Reading prepared '+reviewedAt,
  'Operator-recorded promises; this is not an assignment notification or recipient acknowledgement.',
  ...visible.map(row=>[row.ownerLabel+': '+row.promise,'Customer: '+row.accountName,'Due: '+(row.dueDate||'not recorded')+' ('+row.timing.replaceAll('_',' ')+')',
   'Reference: '+row.id+'; recorded '+row.recordedAt].join('\n'))].join('\n\n');
}
