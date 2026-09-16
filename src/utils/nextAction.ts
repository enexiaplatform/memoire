import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';

/**
 * Whether anything at all is scheduled to move this deal.
 *
 * Either half counts: a line of text says what happens next, a date says when.
 * One shared predicate because the flag, the plan suggestions and the deal
 * drawer each used to decide this for themselves, and they disagreed.
 *
 * Lived in revenueView.ts until 2026-09-16, when the lead queue needed the same
 * answer. revenueView imports the quote store, so reading one predicate from it
 * pulled the whole money model into the lead rules; it is in its own module so
 * both can read it without either depending on the other. revenueView
 * re-exports it, so nothing that already imported it from there changed.
 */
export function hasScheduledNextAction(
  opportunity: Pick<CrmLiteOpportunity, 'nextAction' | 'nextActionDate'>,
): boolean {
  return Boolean(opportunity.nextAction?.trim() || opportunity.nextActionDate?.trim());
}
