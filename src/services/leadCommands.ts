import {
  createOpportunity,
  emptyOpportunityInput,
  loadOpportunities,
  opportunityToFormInput,
  updateOpportunity,
  type CrmLiteOpportunity,
} from './opportunityStore.ts';
import {
  buildOpportunityOutcomeDraft,
  createOpportunityOutcomeFromOpportunity,
  type OpportunityOutcomeRecord,
} from './opportunityOutcomeStore.ts';
import { createStakeholder, emptyStakeholderInput, type StakeholderRecord } from './stakeholderStore.ts';
import {
  LEAD_STAGE,
  QUALIFIED_STAGE,
  isLeadStage,
  normalizeLeadSource,
  outcomeReasonCategoryForLead,
  type LeadDisqualifyReason,
} from '../utils/leadQueue.ts';
import { sanitizeBusinessDate, todayDateKey } from '../utils/safeDate.ts';

/**
 * The four things an operator does to a lead, as commands.
 *
 * Kept out of the page for the reason the rules are kept out of it: Leads is
 * not the only surface that does these. Capture creates a lead; Today and the
 * command bar will qualify one. A command that lives in a React component gets
 * retyped in the next one, and the second copy is the one that forgets to clear
 * the nurture date or to write the reason.
 *
 * Every command goes through the existing store writers - `updateOpportunity`,
 * `createOpportunityOutcomeFromOpportunity`, `createStakeholder` - so local,
 * cloud, sync-recovery and the observed-change log all behave exactly as they
 * do for any other edit. There is no lead table and no lead writer.
 */

type WriteResult = { opportunity: CrmLiteOpportunity; mode: 'local' | 'cloud'; warning?: string };

/**
 * Lead -> Discovery. The stage changes; nothing else is touched.
 *
 * The nurture date is the one exception, and it is not an edit to the lead's
 * history: a qualified deal is not parked, and a revisit date left on it would
 * resurface a live deal in the lead queue's reasoning if it were ever moved
 * back.
 */
export async function qualifyLead(opportunity: CrmLiteOpportunity, userId?: string | null): Promise<WriteResult> {
  if (!isLeadStage(opportunity.stage)) {
    throw new Error('Only a lead can be qualified.');
  }
  // A stale UI retry after a saved transition must not perform it again,
  // including when the first response carried a history warning.
  const current = (await loadOpportunities(opportunity.isSample || opportunity.storageMode === 'local' ? undefined : userId))
    .find((record) => record.id === opportunity.id);
  if (!current || !isLeadStage(current.stage)) throw new Error('Only a saved lead can be qualified.');
  return updateOpportunity(
    current,
    {
      ...opportunityToFormInput(current),
      stage: QUALIFIED_STAGE,
      status: 'Active',
      nurturedUntil: '',
      nurtureReason: '',
    },
    userId,
  );
}

/** Parks a lead until a date, or brings it back when the date is empty. */
export async function nurtureLead(
  opportunity: CrmLiteOpportunity,
  input: { nurturedUntil: string; nurtureReason: string },
  userId?: string | null,
): Promise<WriteResult> {
  const nurturedUntil = sanitizeBusinessDate(input.nurturedUntil);
  return updateOpportunity(
    opportunity,
    {
      ...opportunityToFormInput(opportunity),
      nurturedUntil,
      nurtureReason: nurturedUntil ? input.nurtureReason.trim() : '',
    },
    userId,
  );
}

/**
 * Out, with the reason.
 *
 * Written as a Lost outcome on the same record, through the same writer the
 * deal close-out uses. The outcome keeps `stageBeforeOutcome: 'Lead'`, which is
 * the durable fact that separates a disqualified lead from a lost deal - the
 * stage itself becomes Lost, because stage and status are reconciled on every
 * write and a closed record may not sit on an open stage.
 *
 * The outcome is written first. If the record update then fails, the reason
 * survives and the lead is still visibly open, which is recoverable; the other
 * order leaves a closed lead with no reason, which is the thing this exists to
 * prevent.
 */
export async function disqualifyLead(
  opportunity: CrmLiteOpportunity,
  input: { reason: LeadDisqualifyReason; note: string },
  userId?: string | null,
): Promise<WriteResult & { outcome: OpportunityOutcomeRecord }> {
  const today = todayDateKey();
  const note = input.note.trim();
  const outcome = createOpportunityOutcomeFromOpportunity(
    opportunity,
    buildOpportunityOutcomeDraft(opportunity, {
      outcome: 'Lost',
      outcomeDate: today,
      reasonCategory: outcomeReasonCategoryForLead(input.reason),
      // The lead reason leads the text so it is readable in any list that only
      // shows `reasonText` - the category alone would say "Relationship" for
      // "No response", which is true and unhelpful.
      reasonText: note ? `${input.reason} - ${note}` : input.reason,
    }),
    userId,
  );

  const result = await updateOpportunity(
    opportunity,
    {
      ...opportunityToFormInput(opportunity),
      status: 'Lost',
      stage: 'Lost',
      closedOn: today,
      nurturedUntil: '',
      nurtureReason: '',
    },
    userId,
  );
  return { ...result, outcome };
}

export type CreateLeadInput = {
  accountName: string;
  opportunityName?: string;
  contactName?: string;
  /** The job title, when the note or the operator gave one. */
  contactRole?: string;
  leadSource?: string;
  leadSourceDetail?: string;
  nextAction?: string;
  nextActionDate?: string;
  /** What the operator already knows they need. Written to Evidence. */
  evidence?: string;
  currency?: string;
};

export type CreateLeadResult = WriteResult & {
  stakeholder: StakeholderRecord | null;
};

/**
 * A new lead, from the Leads page or from a capture.
 *
 * The contact becomes a stakeholder with the role Unknown, not the deal's
 * decision maker. Being the person you met is not authority, and writing a name
 * into "decision maker" would make MEDDIC claim something nobody established the
 * moment the lead is qualified.
 */
export async function createLead(
  input: CreateLeadInput,
  userId?: string | null,
  workspace: { source: 'demo' | 'user'; isSample: boolean } = { source: 'user', isSample: false },
): Promise<CreateLeadResult> {
  const accountName = input.accountName.trim();
  if (!accountName) throw new Error('A lead needs a customer name.');
  const sample = workspace.isSample || workspace.source === 'demo';
  workspace = { source: sample ? 'demo' : 'user', isSample: sample };

  const result = await createOpportunity(
    {
      ...emptyOpportunityInput,
      accountName,
      // The deal name is required by every reader. A lead often has no project
      // name yet, and the honest placeholder says so rather than inventing one.
      opportunityName: (input.opportunityName || '').trim() || `${accountName} - lead`,
      stage: LEAD_STAGE,
      status: 'Active',
      currency: input.currency || emptyOpportunityInput.currency,
      leadSource: normalizeLeadSource(input.leadSource),
      leadSourceDetail: (input.leadSourceDetail || '').trim(),
      nextAction: (input.nextAction || '').trim(),
      nextActionDate: sanitizeBusinessDate(input.nextActionDate || ''),
      evidence: (input.evidence || '').trim(),
      // Nothing has been established about a lead, and the defaults on a new
      // deal claim a little too much for one that has not shown a need.
      forecastEvidenceCategory: 'Unsupported',
      decisionRecommendation: 'Monitor',
    },
    userId,
    workspace,
  );

  let stakeholder: StakeholderRecord | null = null;
  const contactName = (input.contactName || '').trim();
  if (contactName) {
    try {
      const created = await createStakeholder(
        {
          ...emptyStakeholderInput,
          accountName,
          opportunityId: result.opportunity.id,
          opportunityName: result.opportunity.opportunityName,
          name: contactName,
          roleTitle: (input.contactRole || '').trim(),
          stakeholderRole: 'Unknown',
          lastInteractionDate: todayDateKey(),
        },
        userId,
        workspace,
      );
      stakeholder = created.stakeholder;
    } catch {
      // The lead is the record; the person is context on it. A failed person
      // write must not report the lead as failed, and the name is still on the
      // capture that produced it.
    }
  }

  return { ...result, stakeholder };
}
