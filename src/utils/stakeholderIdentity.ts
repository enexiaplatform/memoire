import type { StakeholderRecord } from '../services/stakeholderStore.ts';
import { normalizeEntityName } from './accountIdentity.ts';

export function matchingAccountContacts(records:StakeholderRecord[],input:{accountId?:string;accountName:string;name:string;roleTitle?:string;userId?:string|null;isSample:boolean}):StakeholderRecord[]{
 return records.filter(person=>(person.userId||null)===(input.userId||null)&&Boolean(person.isSample)===input.isSample
  &&normalizeEntityName(person.accountName)===normalizeEntityName(input.accountName)
  &&(!input.accountId||!person.accountId||input.accountId===person.accountId)
  &&normalizeEntityName(person.name)===normalizeEntityName(input.name)
  &&(!input.roleTitle||!person.roleTitle||normalizeEntityName(person.roleTitle)===normalizeEntityName(input.roleTitle)));
}
export function reusableAccountContact(records:StakeholderRecord[],input:Parameters<typeof matchingAccountContacts>[1]):StakeholderRecord|null{
 const candidates=matchingAccountContacts(records,input);return candidates.length===1?candidates[0]:null;
}
