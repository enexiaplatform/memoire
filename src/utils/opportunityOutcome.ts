import type { OpportunityStage, OpportunityStatus } from '../services/opportunityStore.ts';

/**
 * A deal has one outcome, and two fields that can each name it.
 *
 * `stage` is where the deal sits in the sales process and offers Won, Lost and
 * On hold at the end of it. `status` is the same three answers plus Active.
 * Nothing reconciled them, so `stage: 'Won'` with `status: 'Active'` was a
 * perfectly storable record - and the app then disagreed with itself about it:
 * `revenueView`, `routeHealth`, `brandPerformance`, `coverageMatrix`,
 * `pipelineInsights` and `accountMemory` count by `status`, while
 * `salesFlowGuidance`, `stageProbability` and `orderToCash` accept either. Drag
 * a deal to Won on the board and forget the Status field, and half the product
 * banks the revenue while the other half keeps it in open pipeline and nags you
 * to follow it up.
 *
 * The fix is one rule applied at the boundary rather than 89 readers taught to
 * ask the question twice. Every write reconciles, and - this is the part that
 * matters for a workspace that already has the problem - every *read*
 * reconciles too, so records stored inconsistently before today are repaired as
 * they are loaded, with no data migration and nothing lost.
 */

/** Stages that mean the deal is closed. The rest are positions in the process. */
export const TERMINAL_STAGES: readonly OpportunityStage[] = ['Won', 'Lost', 'On hold'];

export function isTerminalStage(stage: OpportunityStage) {
  return TERMINAL_STAGES.includes(stage);
}

/**
 * The single stage/status pair for a deal.
 *
 * Three cases, and only one of them is a judgement call:
 *
 *   - One side closed, the other still Active. This is the ordinary slip - the
 *     operator changed one control and not the other - and the closed answer is
 *     plainly the deliberate one, so it wins.
 *   - Both closed and agreeing. Nothing to do.
 *   - Both closed and disagreeing (stage Won, status Lost). This cannot be
 *     created any more - the deal editor keeps the two controls in step - so it
 *     only exists in records written before this rule. `status` wins there,
 *     because `status` is what every money figure in the product already counts
 *     by; honouring it means no workspace's reported revenue moves on the day
 *     this shipped.
 */
export function reconcileOpportunityOutcome(
  stage: OpportunityStage,
  status: OpportunityStatus,
): { stage: OpportunityStage; status: OpportunityStatus } {
  const stageClosed = isTerminalStage(stage);
  const statusClosed = status !== 'Active';

  if (stageClosed && statusClosed) return { stage: status as OpportunityStage, status };
  if (stageClosed) return { stage, status: stage as OpportunityStatus };
  if (statusClosed) return { stage: status as OpportunityStage, status };
  return { stage, status };
}

/**
 * What the *other* control should become when one of them is changed.
 *
 * The editor calls this so the two fields can never be left disagreeing in the
 * first place - which is what makes the both-closed case above a legacy-only
 * concern rather than something the product keeps generating.
 */
export function statusForStage(stage: OpportunityStage, currentStatus: OpportunityStatus): OpportunityStatus {
  if (isTerminalStage(stage)) return stage as OpportunityStatus;
  // Moving a closed deal back into the pipeline re-opens it. Leaving it "Won"
  // while it sits in Negotiation is the same contradiction from the other side.
  return currentStatus === 'Active' ? currentStatus : 'Active';
}

export function stageForStatus(status: OpportunityStatus, currentStage: OpportunityStage): OpportunityStage {
  if (status !== 'Active') return status as OpportunityStage;
  // Re-opening a deal must not strand it on the Won stage. Discovery is wrong
  // too, so it keeps whatever pipeline stage it had, and only a terminal stage
  // is replaced - with the last real step before an outcome.
  return isTerminalStage(currentStage) ? 'Negotiation' : currentStage;
}
