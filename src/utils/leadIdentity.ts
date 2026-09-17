import type { OpportunityStage } from '../services/opportunityStore.ts';

/** Canonical record partition. No runtime store or queue dependencies. */
export const LEAD_STAGE: OpportunityStage = 'Lead';

/** The stage a qualified lead lands on. The first stage of the real pipeline. */
export const QUALIFIED_STAGE: OpportunityStage = 'Discovery';

/** A lead is an opportunity at the Lead stage - there is no separate record. */
export function isLeadStage(stage: string | undefined | null): boolean {
  return ['lead', 'new', 'prospecting'].includes((stage || '').trim().toLowerCase());
}

export type OutcomeStageFact = { opportunityId: string; outcome: string; stageBeforeOutcome: string };

/**
 * A lead that was closed out rather than qualified.
 *
 * A disqualified lead's own stage reads Lost - stage and status are reconciled
 * on every write, and a closed record may not sit on an open stage - so the
 * stage cannot say it was ever a lead. Its outcome can: the close-out snapshots
 * the stage it closed from. This is the one predicate that reads it.
 */
export function isDisqualifiedLeadOutcome(outcome: Pick<OutcomeStageFact, 'outcome' | 'stageBeforeOutcome'>): boolean {
  return outcome.outcome === 'Lost' && isLeadStage(outcome.stageBeforeOutcome);
}

/** The ids of every record closed out of the Lead stage. */
export function disqualifiedLeadIds(outcomes: OutcomeStageFact[] = []): Set<string> {
  return new Set(outcomes.filter(isDisqualifiedLeadOutcome).map((outcome) => outcome.opportunityId).filter(Boolean));
}

/**
 * Whether a record belongs on Leads rather than on Opportunities.
 *
 * At the Lead stage, or closed out of it. The two surfaces partition the book on
 * this, so every record is on exactly one of them - a disqualified lead listed
 * among lost deals would count a conversation that never qualified as pipeline
 * that was lost.
 */
export function isLeadRecord(
  opportunity: { id: string; stage: string; status?: string },
  disqualified: Set<string> = new Set(),
): boolean {
  if (isLeadStage(opportunity.stage)) return true;
  return opportunity.status === 'Lost' && disqualified.has(opportunity.id);
}

/** The lead records. The partition Opportunities is the other half of. */
export function selectLeads<T extends { id: string; stage: string; status?: string }>(
  opportunities: T[],
  disqualified: Set<string> = new Set(),
): T[] {
  return opportunities.filter((opportunity) => isLeadRecord(opportunity, disqualified));
}

/** The qualified pipeline: everything that is not a lead record. */
export function selectQualifiedPipeline<T extends { id: string; stage: string; status?: string }>(
  opportunities: T[],
  disqualified: Set<string> = new Set(),
): T[] {
  return opportunities.filter((opportunity) => !isLeadRecord(opportunity, disqualified));
}

