/**
 * The Commercial Kernel: the canonical vocabulary of Memoire.
 *
 * Everything the product shows is one of these eight things, or a view of them.
 * The rule this file exists to enforce is that no page invents its own meaning
 * for a shared concept - the reason "next action", "follow-up", "commitment"
 * and "plan item" all used to mean four slightly different things depending on
 * which surface you were looking at.
 *
 *   Account            - who the customer is.
 *   Opportunity        - a potential revenue outcome with value and stage evidence.
 *   Commercial Thread  - the continuous commercial story toward one outcome.
 *   Commercial Event   - something that happened.
 *   Commitment         - a promise owned by you, the customer, or someone internal.
 *   Money Checkpoint   - a commercial-flow milestone (quote, PO, delivery, invoice, paid).
 *   Action             - a concrete thing to do. A self-owned commitment is one.
 *   Outcome            - a recorded commercial result, or a recorded product-value result.
 *
 * Anything else is a view, a derived recommendation, an artifact, a UI state,
 * an adapter, or a cached projection. Specifically:
 *
 *   Objection       -> context on a thread or opportunity, carried by an event.
 *   Stakeholder     -> a participant related to an account, thread or opportunity.
 *   Nudge           -> a derived recommendation. Never a source-of-truth record.
 *   Pipeline Defense-> a review artifact.
 *   Plan item       -> the timeline presentation of an action or commitment.
 *   Review pack     -> an artifact snapshot.
 *   Search answer   -> a derived query result.
 */

// ---------------------------------------------------------------- scope

/**
 * Who the work belongs to.
 *
 * Domain rules take a scope rather than reading a global "current user", so the
 * day this becomes a team product the shape grows a `workspaceId` and an
 * `actorId` without every rule in the codebase having to be found and rewritten.
 * There is deliberately no workspace table and no unused abstraction behind
 * this - it is an interface prepared for a future, not a feature half-built.
 */
export type CommercialScope = {
  userId: string | null;
  /** True when the workspace is showing local sample data, which never syncs. */
  sampleDataActive?: boolean;
};

// ------------------------------------------------------- source metadata

/**
 * Where a record came from. `manual`, `capture`, `csv_import` and `system_rule`
 * are implemented today; the rest exist so that the day email, calendar, CRM or
 * ERP ingestion lands, it writes into the same contract instead of growing a
 * parallel one.
 */
export const sourceTypes = [
  'manual',
  'capture',
  'csv_import',
  'system_rule',
  'email',
  'calendar',
  'crm',
  'erp',
] as const;
export type SourceType = (typeof sourceTypes)[number];

export type SourceMetadata = {
  sourceType: SourceType;
  sourceId?: string | null;
  sourceUrl?: string | null;
  sourceUpdatedAt?: string | null;
};

// ------------------------------------------------------ commercial thread

export const threadStatuses = ['active', 'waiting', 'won', 'lost', 'completed', 'archived'] as const;
export type ThreadStatus = (typeof threadStatuses)[number];

/** Which side the thread is currently waiting on. */
export const waitingParties = ['none', 'self', 'customer', 'internal'] as const;
export type WaitingParty = (typeof waitingParties)[number];

/** Where the commercial value currently sits. Mirrors the Money lifecycle. */
export const moneyStates = [
  'none',
  'quoted',
  'awaiting_customer_decision',
  'awaiting_po',
  'awaiting_delivery',
  'awaiting_payment',
  'paid',
] as const;
export type MoneyState = (typeof moneyStates)[number];

export type CommercialThread = {
  id: string;
  userId: string | null;
  accountId: string;
  accountName: string;
  opportunityId?: string | null;
  title: string;
  objective: string;
  status: ThreadStatus;
  currentMoneyState: MoneyState;
  currentWaitingParty: WaitingParty;
  lastActivityAt: string;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
} & SourceMetadata;

// ---------------------------------------------------------- commitments

export const commitmentParties = ['self', 'customer', 'internal'] as const;
export type CommitmentParty = (typeof commitmentParties)[number];

export const commitmentStatuses = ['open', 'completed', 'cancelled'] as const;
export type CommitmentStatus = (typeof commitmentStatuses)[number];

/**
 * Note the absence of a `rescheduled` status. A rescheduled promise is still
 * open - it is the *history* that changed, not the state. Modelling it as a
 * permanent status would make "how many promises am I keeping?" unanswerable,
 * because a commitment moved twice and then kept would read as neither open nor
 * completed.
 */
export const commitmentImpactTypes = [
  'revenue',
  'payment',
  'delivery',
  'relationship',
  'none',
] as const;
export type CommitmentImpactType = (typeof commitmentImpactTypes)[number];

export type CommitmentDueDateChange = {
  from: string;
  to: string;
  changedAt: string;
  reason?: string;
};

export type CommercialCommitment = {
  id: string;
  userId: string | null;
  threadId: string;
  accountId: string;
  accountName: string;
  opportunityId?: string | null;
  commitmentParty: CommitmentParty;
  /** Who specifically owes it: a person's name, or your own. */
  ownerLabel: string;
  commitmentText: string;
  /** The promise as first made. Never overwritten by a reschedule. */
  originalDueDate: string;
  /** The promise as it stands now. */
  currentDueDate: string;
  /** How long silence on this commitment is tolerable before it is a risk. */
  silenceThresholdDays: number;
  status: CommitmentStatus;
  impactType: CommitmentImpactType;
  impactAmount?: number | null;
  impactCurrency?: string | null;
  sourceEventId?: string | null;
  /** What proves it was done - an event, a note, a quote, a payment. */
  completionEvidence?: string | null;
  completionEventId?: string | null;
  dueDateHistory: CommitmentDueDateChange[];
  lastRenegotiatedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Sample/demo isolation, matching every other store in the workspace. */
  isSample?: boolean;
} & SourceMetadata;

// ------------------------------------------------------ commercial events

export const commercialEventTypes = [
  'activity_captured',
  'account_created',
  'thread_created',
  'thread_linked',
  'thread_status_changed',
  'opportunity_stage_changed',
  'quote_created',
  'quote_sent',
  'quote_validity_extended',
  'commitment_created',
  'commitment_rescheduled',
  'commitment_completed',
  'commitment_cancelled',
  'customer_commitment_overdue',
  'po_received',
  'delivery_completed',
  'payment_received',
  'opportunity_won',
  'opportunity_lost',
  'value_outcome_recorded',
] as const;
export type CommercialEventType = (typeof commercialEventTypes)[number];

export type CommercialEvent = {
  id: string;
  userId: string | null;
  eventType: CommercialEventType;
  /** When it happened in the business. */
  occurredAt: string;
  /** When Memoire learned about it. These differ for imports and back-dating. */
  recordedAt: string;
  accountId?: string | null;
  opportunityId?: string | null;
  threadId?: string | null;
  commitmentId?: string | null;
  summary: string;
  structuredPayload: Record<string, unknown>;
  /**
   * Stops an import or a derived rule from writing the same event twice. Null
   * for manually recorded events, which a person can legitimately repeat.
   */
  idempotencyKey?: string | null;
  createdAt: string;
  isSample?: boolean;
} & SourceMetadata;

// ------------------------------------------------------- value outcomes

/** What kind of commercial good Memoire is claimed to have done. */
export const valueOutcomeTypes = [
  'follow_up_recovered',
  'commitment_caught',
  'quote_advanced',
  'delivery_delay_avoided',
  'payment_recovered',
  'revenue_protected',
  'no_material_impact',
] as const;
export type ValueOutcomeType = (typeof valueOutcomeTypes)[number];

/**
 * The user's own honest verdict. `would_have_done_anyway` is deliberately
 * first and deliberately easy to pick: a value ledger that only records wins
 * measures nothing, and the point of this record is to be able to tell whether
 * Memoire is actually worth paying for.
 */
export const valueAssessments = [
  'would_have_done_anyway',
  'helped_me_do_it_sooner',
  'might_have_missed_it',
  'protected_revenue_or_payment',
] as const;
export type ValueAssessment = (typeof valueAssessments)[number];

export type CommercialValueOutcome = {
  id: string;
  userId: string | null;
  threadId?: string | null;
  accountId?: string | null;
  opportunityId?: string | null;
  /** Which recommendation this verdict is about, if it came from one. */
  recommendationId?: string | null;
  outcomeType: ValueOutcomeType;
  userAssessment: ValueAssessment;
  impactAmount?: number | null;
  impactCurrency?: string | null;
  confidence?: number | null;
  note?: string | null;
  occurredAt: string;
  createdAt: string;
  isSample?: boolean;
};

// ---------------------------------------------------- canonical lifecycles

/**
 * Opportunity stages. The workspace has carried several spellings over time
 * (Lead, Discovery, Proposal, Negotiation, Won, Lost...), so this is the
 * canonical set plus an explicit mapping - never a rename in place, which would
 * strand every existing record.
 */
export const opportunityStages = [
  'new',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
  'paused',
  'archived',
] as const;
export type OpportunityStage = (typeof opportunityStages)[number];

const LEGACY_STAGE_MAP: Record<string, OpportunityStage> = {
  lead: 'new',
  new: 'new',
  prospecting: 'new',
  discovery: 'qualified',
  qualified: 'qualified',
  qualification: 'qualified',
  proposal: 'proposal',
  quoted: 'proposal',
  negotiation: 'negotiation',
  negotiating: 'negotiation',
  'closing': 'negotiation',
  won: 'won',
  'closed won': 'won',
  lost: 'lost',
  'closed lost': 'lost',
  paused: 'paused',
  'on hold': 'paused',
  archived: 'archived',
};

/** Maps any stage spelling the workspace has ever used onto the canonical set. */
export function toCanonicalOpportunityStage(stage: string): OpportunityStage {
  return LEGACY_STAGE_MAP[stage.trim().toLowerCase()] || 'new';
}

export const accountStatuses = ['active', 'dormant', 'archived'] as const;
export type AccountStatus = (typeof accountStatuses)[number];

// --------------------------------------------------------- transitions

/**
 * Legal transitions, declared once.
 *
 * Pages ask this rather than deciding for themselves, so a thread cannot be
 * "won" on one surface and "waiting" on another. Terminal states allow only
 * `archived`, because a lost deal that can be reopened as active is how a
 * pipeline quietly inflates.
 */
const THREAD_TRANSITIONS: Record<ThreadStatus, ThreadStatus[]> = {
  active: ['waiting', 'won', 'lost', 'completed', 'archived'],
  waiting: ['active', 'won', 'lost', 'completed', 'archived'],
  won: ['completed', 'archived'],
  lost: ['archived'],
  completed: ['archived'],
  archived: [],
};

export function canTransitionThread(from: ThreadStatus, to: ThreadStatus): boolean {
  return from === to || THREAD_TRANSITIONS[from].includes(to);
}

const COMMITMENT_TRANSITIONS: Record<CommitmentStatus, CommitmentStatus[]> = {
  open: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['open'],
};

export function canTransitionCommitment(from: CommitmentStatus, to: CommitmentStatus): boolean {
  return from === to || COMMITMENT_TRANSITIONS[from].includes(to);
}

const OPPORTUNITY_TRANSITIONS: Record<OpportunityStage, OpportunityStage[]> = {
  new: ['qualified', 'proposal', 'negotiation', 'won', 'lost', 'paused', 'archived'],
  qualified: ['new', 'proposal', 'negotiation', 'won', 'lost', 'paused', 'archived'],
  proposal: ['qualified', 'negotiation', 'won', 'lost', 'paused', 'archived'],
  negotiation: ['proposal', 'won', 'lost', 'paused', 'archived'],
  won: ['archived'],
  lost: ['archived'],
  paused: ['new', 'qualified', 'proposal', 'negotiation', 'lost', 'archived'],
  archived: [],
};

export function canTransitionOpportunity(from: OpportunityStage, to: OpportunityStage): boolean {
  return from === to || OPPORTUNITY_TRANSITIONS[from].includes(to);
}

/** Whether a thread status means the story is over. */
export function isThreadClosed(status: ThreadStatus): boolean {
  return status === 'won' || status === 'lost' || status === 'completed' || status === 'archived';
}

/** Whether a record should stay out of Today, Search defaults and Review. */
export function isArchived(record: { status?: string; archivedAt?: string | null }): boolean {
  return record.status === 'archived' || Boolean(record.archivedAt);
}
