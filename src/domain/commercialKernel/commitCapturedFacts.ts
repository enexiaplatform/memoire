import { createObjection } from '../../services/objectionStore.ts';
import { createStakeholder } from '../../services/stakeholderStore.ts';
import { updateOpportunity, type CrmLiteOpportunity } from '../../services/opportunityStore.ts';
import { savePlanItem } from '../../services/planItemStore.ts';
import { opportunityToFormInput } from '../../services/opportunityStore.ts';
import { createCommitment, recordCommercialEvidence } from './commands.ts';
import type { CapturedFact, ReviewableChangeSet } from './capturedFacts.ts';
import type { CommercialScope } from './types.ts';

/**
 * The one place an accepted fact becomes canonical.
 *
 * Before this existed, capture's derived records were written from inside the
 * page component: three bespoke handlers calling three stores, each with its own
 * idea of what "already exists" meant. That is the shape that makes a manual
 * edit and a captured edit behave differently, and the difference is invisible
 * until Delta reports a change for one and not the other.
 *
 * So every kind here routes to the write path a person typing by hand would
 * use - the same commands, the same stores, the same instrumentation. A
 * captured value change goes through `updateOpportunity`, which means it emits
 * `opportunity_value_changed` exactly as a manual edit does, which means Delta
 * sees one kind of transition rather than two. Capture writes no events of its
 * own and no recommendations of its own; it changes state and lets the kernel
 * react.
 *
 * ## Partial failure is real and is reported
 *
 * The stores are local-first and independent. Seven accepted facts are seven
 * writes, and the fourth can fail while the others land. Pretending otherwise
 * would need a transaction the storage does not have, so instead each fact
 * reports its own outcome, the successful ones carry the record they created,
 * and the failed ones stay accepted so the operator can retry. A retry re-runs
 * only what has not already succeeded.
 */

export type CommitOutcome =
  | { factId: string; ok: true; recordId: string }
  | { factId: string; ok: false; error: string };

export type CommitResult = {
  outcomes: CommitOutcome[];
  /** Facts that failed and may be retried. Never the ones that succeeded. */
  retryable: CapturedFact[];
};

export type CommitContext = {
  scope: CommercialScope;
  userId: string | null | undefined;
  /** The deal a value fact would update, read fresh so the diff is honest. */
  opportunities: CrmLiteOpportunity[];
  /** The activity this capture produced, so derived records can point at it. */
  sourceActivityId: string;
  captureDate: string;
  isSample: boolean;
};

/**
 * Writes the accepted facts, one at a time, reporting each.
 *
 * `alreadyCommitted` is how a retry stays safe: the ids of facts that have
 * already succeeded are skipped rather than written again. It is the caller's
 * memory of the transaction, which is the only place that memory can live
 * without inventing a queue.
 */
export async function commitCapturedFacts(
  changeSet: ReviewableChangeSet,
  context: CommitContext,
  alreadyCommitted: string[] = [],
): Promise<CommitResult> {
  const done = new Set(alreadyCommitted);
  const outcomes: CommitOutcome[] = [];
  const retryable: CapturedFact[] = [];

  for (const fact of changeSet.facts) {
    if (fact.status !== 'accepted') continue;
    if (done.has(fact.id)) continue;

    try {
      const recordId = await commitOne(fact, context);
      outcomes.push({ factId: fact.id, ok: true, recordId });
    } catch (error) {
      outcomes.push({
        factId: fact.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Could not save this one.',
      });
      retryable.push(fact);
    }
  }

  return { outcomes, retryable };
}

/** One fact, to the canonical path its kind belongs to. */
async function commitOne(fact: CapturedFact, context: CommitContext): Promise<string> {
  switch (fact.kind) {
    case 'objection': {
      const deal = dealFor(fact, context);
      const result = await createObjection({
        accountId: '',
        accountName: fact.target.accountName,
        opportunityId: deal?.id || '',
        opportunityName: deal?.opportunityName || fact.target.opportunityName,
        stakeholderId: '',
        stakeholderName: '',
        sourceActivityId: context.sourceActivityId,
        objectionType: fact.objectionType,
        objectionText: fact.text,
        impact: 'Unknown',
        status: 'Open',
        requiredProof: '',
        responsePlan: '',
        resolutionNote: '',
        dueDate: '',
        resolvedAt: '',
        tags: ['from-capture'],
      }, context.userId);
      return result.objection.id;
    }

    case 'stakeholder': {
      const deal = dealFor(fact, context);
      const result = await createStakeholder({
        accountId: '',
        accountName: fact.target.accountName,
        opportunityId: deal?.id || '',
        opportunityName: deal?.opportunityName || fact.target.opportunityName,
        name: fact.name,
        roleTitle: fact.roleTitle,
        // Unknown, always. Being named in a note is not authority, and the
        // MEDDIC role is a judgement the operator makes on the record.
        stakeholderRole: 'Unknown',
        influenceLevel: 'Unknown',
        relationshipStrength: 'Developing',
        stance: 'Unknown',
        email: '',
        phone: '',
        notes: `From capture: ${fact.evidence}`,
        tags: ['from-capture', 'role-needs-confirmation'],
        lastInteractionDate: context.captureDate,
      }, context.userId, { source: context.isSample ? 'demo' : 'user', isSample: context.isSample });
      return result.stakeholder.id;
    }

    case 'commitment': {
      const deal = dealFor(fact, context);
      // The kernel's own command: it validates, writes the record, writes the
      // history event and triggers sync. Capture does none of those itself.
      const result = createCommitment(context.scope, {
        accountId: '',
        accountName: fact.target.accountName,
        opportunityId: deal?.id || null,
        commitmentParty: fact.party,
        ownerLabel: fact.ownerLabel,
        commitmentText: fact.text,
        dueDate: fact.dueDate,
        sourceType: 'capture',
        sourceId: context.sourceActivityId,
      });
      if (!result.ok) throw new Error(result.error);
      return result.value.id;
    }

    case 'opportunity_value': {
      const deal = dealFor(fact, context);
      if (!deal) throw new Error('Pick the deal this value belongs to first.');
      // The canonical update. It diffs the record and emits the same
      // `opportunity_value_changed` event a manual edit does, which is what
      // makes Delta treat the two identically.
      const result = await updateOpportunity(
        deal,
        { ...opportunityToFormInput(deal), estimatedValue: fact.amount, currency: fact.currency },
        context.userId,
      );
      return result.opportunity.id;
    }

    case 'scheduled_event': {
      // A dated thing that has to happen is a plan line. There is no calendar
      // subsystem and this phase does not add one.
      const now = new Date().toISOString();
      const record = savePlanItem({
        id: `capture-event-${context.sourceActivityId}-${fact.id}`,
        date: fact.date,
        label: fact.label,
        tag: 'from-capture',
        done: false,
        linkedAccountName: fact.target.accountName,
        linkedOpportunityId: fact.target.opportunityId || undefined,
        createdAt: now,
        updatedAt: now,
        ...(context.isSample ? { source: 'demo' as const, isSample: true } : {}),
      }).find((item) => item.label === fact.label);
      return record?.id || fact.id;
    }

    case 'commercial_evidence': {
      const deal = dealFor(fact, context);
      // The kernel command, exactly as the operator's own "record what you
      // learned" would call it. The quoted sentence becomes the record's
      // provenance rather than a note beside it, so "why does Memoire believe
      // the trial passed" is answerable from the record alone.
      const result = recordCommercialEvidence(context.scope, {
        accountName: fact.target.accountName,
        opportunityId: deal?.id || null,
        category: fact.category,
        direction: fact.direction,
        summary: fact.summary,
        evidenceText: fact.evidence,
        // The day the note is about, not the instant it was reviewed. A note
        // written up on Monday about Friday's trial is evidence from Friday.
        observedAt: context.captureDate,
        sourceActivityId: context.sourceActivityId,
        sourceType: 'capture',
        sourceId: context.sourceActivityId,
      });
      if (!result.ok) throw new Error(result.error);
      return result.value.id;
    }

    default: {
      // Exhaustive: a new fact kind without a canonical destination is a
      // compile error here, which is the point.
      const unreachable: never = fact;
      throw new Error(`No canonical destination for ${JSON.stringify(unreachable)}`);
    }
  }
}

function dealFor(fact: CapturedFact, context: CommitContext): CrmLiteOpportunity | undefined {
  if (!fact.target.opportunityId) return undefined;
  return context.opportunities.find((item) => item.id === fact.target.opportunityId);
}
