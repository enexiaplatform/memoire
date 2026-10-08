import type { AccountMemoryRecord } from './accountStore.ts';
import { createStakeholder, emptyStakeholderInput, loadStakeholders } from './stakeholderStore.ts';
import { matchingAccountContacts } from '../utils/stakeholderIdentity.ts';

/** Profile contact text is context, never buying authority or a customer touch. */
export async function importAccountContacts(accounts:AccountMemoryRecord[],userId?:string|null){
 const people=await loadStakeholders(userId);let created=0,reused=0,failed=0,pending=0;
 for(const account of accounts){
  if((account.userId||null)!==(userId||null)){failed+=account.keyStakeholders.length;continue;}
  for(const label of account.keyStakeholders){
   const parsed=/^(.+?)\s*\(([^()]*)\)\s*$/.exec(label.trim());
   const name=(parsed?.[1]||label).trim(),roleTitle=parsed?.[2]?.trim()||'';
   if(!name)continue;
   const matches=matchingAccountContacts(people,{accountId:account.id,accountName:account.accountName,name,roleTitle,userId,isSample:Boolean(account.isSample)});
   if(matches.length){if(matches.length===1)reused++;else failed++;continue;}
   try{
    const result=await createStakeholder({...emptyStakeholderInput,accountId:account.id,accountName:account.accountName,name,roleTitle,
     notes:'Imported from account profile. Role and buying authority have not been verified.',tags:['account-contact-import']},userId,{source:account.isSample?'demo':'user',isSample:Boolean(account.isSample)});
    people.push(result.stakeholder);created++;if(userId&&result.mode!=='cloud')pending++;
   }catch{failed++;}
  }
 }
 return {created,reused,failed,pending};
}
