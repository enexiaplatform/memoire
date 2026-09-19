import { evidenceMatchesCondition, type CommercialCondition } from './commercialCondition.ts';
import type { CommercialEvidence } from './commercialEvidence.ts';
type Anchor = { id: string; userId?: string | null; isSample?: boolean; source?: string; accountId?: string | null };
/** Reused by commands and restore, with indexes built once for a whole batch. */
export function conditionReferenceIndex(accounts: Anchor[], opportunities: Anchor[], evidence: CommercialEvidence[]) {
  return { accounts: new Map(accounts.map(r => [r.id, r])), opportunities: new Map(opportunities.map(r => [r.id, r])), evidence: new Map(evidence.map(r => [r.id, r])) };
}
export function validateConditionReferences(condition: CommercialCondition, index: ReturnType<typeof conditionReferenceIndex>) {
  const owned = (r?: Anchor) => r && (!r.userId || r.userId === condition.userId)
    && Boolean(r.isSample || r.source === 'demo') === Boolean(condition.isSample);
  if (!owned(index.accounts.get(condition.accountId))) throw new Error('Choose an existing account in this workspace.');
  if (condition.opportunityId) {
    const opportunity = index.opportunities.get(condition.opportunityId);
    if (!owned(opportunity) || (opportunity?.accountId && opportunity.accountId !== condition.accountId)) throw new Error('The opportunity does not belong to this account and workspace.');
  }
  for (const link of condition.evidenceLinks) {
    const evidence = index.evidence.get(link.evidenceId);
    if (!evidence || !evidenceMatchesCondition(condition, evidence)) throw new Error('Linked evidence is missing or belongs to another scope.');
  }
}
