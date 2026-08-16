import type { CommercialCommitment } from './types.ts';
import type { SalesActivityRecord } from '../../services/salesActivityStore.ts';
import { buildCaptureDerivedKey, getDatedCaptureActions, type PlanRecord } from '../../utils/weeklyPlan.ts';

/**
 * The promises Memoire made on the operator's behalf, read as commitments.
 *
 * `createCommitment` has exactly one caller - the "Record a commitment"
 * composer - so until this existed the ledger only ever held promises somebody
 * typed twice. A capture with a due date lands on the Plan instead, and the
 * capture screen says so out loud: "Added to your Plan automatically". Every
 * surface that asks what is promised reads the ledger, so all of them answered
 * "nothing":
 *
 *   - Today and Plan: "Nothing is promised right now."
 *   - the account card: "None - nothing is scheduled to move this"
 *   - the policy engine: "<thread> has no open commitment, so nothing is
 *     scheduled to move it" - a warning raised about a deal that had a dated
 *     promise sitting on Tuesday.
 *
 * Loading the sample workspace showed the same empty panel, which is how far
 * this went: the demo built to show a running control tower had no promises in
 * it either.
 *
 * Derived, not migrated. Nothing here is written to a store and nothing gets a
 * kernel id; the capture and the plan item stay the records, ticked and moved
 * on the Plan exactly as before. `getDatedCaptureActions` is the same function
 * the Plan board derives its days from, so the two can never disagree about
 * what was promised.
 */

const PLAN_COMMITMENT_ID_PREFIX = 'plan:';

/** A promise Memoire derived from the Plan, rather than one recorded by hand. */
export function isPlanDerivedCommitment(commitment: CommercialCommitment) {
  return commitment.id.startsWith(PLAN_COMMITMENT_ID_PREFIX);
}

type DerivedInput = {
  activities?: SalesActivityRecord[];
  planItems?: PlanRecord[];
  includeSampleRecords?: boolean;
};

function isRealRecord(record: { isSample?: boolean; source?: string }, includeSampleRecords?: boolean) {
  if (includeSampleRecords) return true;
  return !record.isSample && record.source !== 'demo';
}

function commitmentFrom(input: {
  id: string;
  sourceId: string;
  text: string;
  dueDate: string;
  accountName: string;
  opportunityId: string | null;
  createdAt?: string;
  updatedAt?: string;
  isSample?: boolean;
}): CommercialCommitment {
  const timestamp = input.updatedAt || input.createdAt || new Date().toISOString();
  return {
    id: `${PLAN_COMMITMENT_ID_PREFIX}${input.id}`,
    userId: null,
    // Left empty on purpose: an unattached commitment is matched to its thread
    // by customer name (see deriveThreads), and one that names a deal carries
    // that id instead.
    threadId: '',
    accountId: '',
    accountName: input.accountName,
    opportunityId: input.opportunityId,
    commitmentParty: 'self',
    ownerLabel: 'You',
    commitmentText: input.text,
    originalDueDate: input.dueDate,
    currentDueDate: input.dueDate,
    silenceThresholdDays: 3,
    status: 'open',
    impactType: 'none',
    dueDateHistory: [],
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
    sourceType: 'system_rule',
    sourceId: input.sourceId,
    ...(input.isSample ? { isSample: true } : {}),
  };
}

export function derivePlanCommitments(input: DerivedInput): CommercialCommitment[] {
  const planItems = input.planItems || [];
  const activities = input.activities || [];

  // The Plan records a derived item's completion as a stub carrying its key.
  // A promise ticked off on the Plan is kept, and must not come back here as
  // an open one.
  const settledKeys = new Set(
    planItems.filter((item) => item.derivedKey && item.done).map((item) => item.derivedKey as string),
  );

  const fromCaptures = activities
    .filter((activity) => isRealRecord(activity, input.includeSampleRecords))
    .flatMap((activity) => getDatedCaptureActions(activity).map((candidate) => ({ activity, candidate })))
    .filter(({ activity, candidate }) => !settledKeys.has(buildCaptureDerivedKey(activity.id, candidate.dueDate, candidate.slot)))
    .map(({ activity, candidate }) => {
      const key = buildCaptureDerivedKey(activity.id, candidate.dueDate, candidate.slot);
      return commitmentFrom({
        id: key,
        sourceId: activity.id,
        text: candidate.title,
        dueDate: candidate.dueDate,
        accountName: (activity.linkedAccountName || activity.accountName || '').trim(),
        opportunityId: activity.linkedOpportunityId || null,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt,
        isSample: activity.isSample,
      });
    });

  const fromPlan = planItems
    .filter((item) => {
      // Completion stubs carry a derived key and belong to the capture above.
      if (!item || item.derivedKey || item.__deleted || item.done || item.dismissed) return false;
      // Every plan item carries a day - that is what makes it a promise the
      // product can watch, and why an undated next action is not one.
      if (!item.date || !item.label?.trim()) return false;
      return isRealRecord(item, input.includeSampleRecords);
    })
    .map((item) => commitmentFrom({
      id: item.id,
      sourceId: item.id,
      text: item.label.trim(),
      dueDate: item.date,
      accountName: (item.linkedAccountName || '').trim(),
      opportunityId: item.linkedOpportunityId || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      isSample: item.isSample,
    }));

  return [...fromCaptures, ...fromPlan];
}

/**
 * The recorded ledger plus the promises on the Plan, in one list.
 *
 * A promise recorded by hand wins over the capture or plan item it came from,
 * so a commitment written up properly is never shown twice.
 */
export function mergePlanCommitments(
  commitments: CommercialCommitment[],
  input: DerivedInput,
): CommercialCommitment[] {
  const recordedSourceIds = new Set(
    commitments.map((commitment) => commitment.sourceId).filter((id): id is string => Boolean(id)),
  );
  const derived = derivePlanCommitments(input)
    .filter((commitment) => !recordedSourceIds.has(commitment.sourceId || ''));
  return [...commitments, ...derived];
}
