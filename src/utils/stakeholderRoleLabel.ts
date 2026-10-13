import type { StakeholderRecord } from '../services/stakeholderStore.ts';
export function stakeholderRoleLabel(person: Pick<StakeholderRecord, 'stakeholderRole' | 'tags'>) {
  if (!person.stakeholderRole || person.stakeholderRole === 'Unknown') return 'Role not recorded';
  return person.tags.includes('role-confirmed') && !person.tags.includes('role-inferred') ? person.stakeholderRole : `Tentative ${person.stakeholderRole}`;
}
