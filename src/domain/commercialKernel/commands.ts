import {
  canTransitionCommitment,
  canTransitionThread,
  isThreadClosed,
  type CommercialCommitment,
  type CommercialEvent,
  type CommercialEventType,
  type CommercialScope,
  type CommercialThread,
  type CommercialValueOutcome,
  type CommitmentImpactType,
  type CommitmentParty,
  type CommitmentStatus,
  type MoneyState,
  type SourceType,
  type ThreadStatus,
  type ValueAssessment,
  type ValueOutcomeType,
  type WaitingParty,
} from './types.ts';
import {
  DEFAULT_SILENCE_THRESHOLD_DAYS,
  deleteCommitment,
  loadCommitments,
  newCommitmentId,
  saveCommitment,
} from '../../services/commercialKernel/commitmentStore.ts';
import { loadThreads, newThreadId, saveThread } from '../../services/commercialKernel/threadStore.ts';
import { appendEvent, newEventId } from '../../services/commercialKernel/eventStore.ts';
import { newValueOutcomeId, saveValueOutcome } from '../../services/commercialKernel/valueOutcomeStore.ts';
import { loadTargets, saveTarget, type CommercialTarget } from '../../services/commercialKernel/targetStore.ts';
import type { ForecastQuarter } from './forecast.ts';

/**
 * Application commands: the only place a Commercial Kernel record changes state.
 *
 * Before this existed, Today, the plan board, Capture and the deal drawer each
 * carried their own version of "complete this" - which is why a commitment
 * ticked in one place could stay open in another, and why nothing recorded
 * *that* it had been completed. A command validates, writes the record, writes
 * the history event, triggers sync, and returns a typed result. Page components
 * call commands; they do not implement transitions.
 *
 * Every command returns a result rather than throwing, because these run inside
 * click handlers where an exception means a blank screen and a lost record.
 */

export type CommandResult<T> =
  | { ok: true; value: T; event?: CommercialEvent }
  | { ok: false; error: string };

const ok = <T>(value: T, event?: CommercialEvent): CommandResult<T> => ({ ok: true, value, event });
const fail = <T>(error: string): CommandResult<T> => ({ ok: false, error });

function now() {
  return new Date().toISOString();
}

function isSample(scope: CommercialScope) {
  return scope.sampleDataActive === true;
}

// ------------------------------------------------------------------ events

type EventInput = {
  eventType: CommercialEventType;
  summary: string;
  occurredAt?: string;
  accountId?: string | null;
  opportunityId?: string | null;
  threadId?: string | null;
  commitmentId?: string | null;
  structuredPayload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  sourceType?: SourceType;
  sourceId?: string | null;
  sourceUrl?: string | null;
};

/**
 * Records that something happened. This is the one write path into history, so
 * a change that skips it simply does not exist as far as Timeline and Review
 * are concerned - which is the point.
 */
export function recordCommercialEvent(scope: CommercialScope, input: EventInput): CommercialEvent {
  const timestamp = now();
  const event: CommercialEvent = {
    id: newEventId(),
    userId: scope.userId,
    eventType: input.eventType,
    occurredAt: input.occurredAt || timestamp,
    recordedAt: timestamp,
    accountId: input.accountId || null,
    opportunityId: input.opportunityId || null,
    threadId: input.threadId || null,
    commitmentId: input.commitmentId || null,
    summary: input.summary,
    structuredPayload: input.structuredPayload || {},
    idempotencyKey: input.idempotencyKey || null,
    sourceType: input.sourceType || 'manual',
    sourceId: input.sourceId || null,
    sourceUrl: input.sourceUrl || null,
    sourceUpdatedAt: null,
    createdAt: timestamp,
    ...(isSample(scope) ? { isSample: true } : {}),
  };

  appendEvent(event);
  return event;
}

// ----------------------------------------------------------------- threads

export type CreateThreadInput = {
  accountId: string;
  accountName: string;
  opportunityId?: string | null;
  title: string;
  objective?: string;
  currentMoneyState?: MoneyState;
  currentWaitingParty?: WaitingParty;
  sourceType?: SourceType;
  sourceId?: string | null;
};

export function createCommercialThread(
  scope: CommercialScope,
  input: CreateThreadInput,
): CommandResult<CommercialThread> {
  const title = input.title.trim();
  if (!title) return fail('A commercial thread needs a title.');
  if (!input.accountName.trim()) return fail('A commercial thread needs an account.');

  const timestamp = now();
  const thread: CommercialThread = {
    id: newThreadId(),
    userId: scope.userId,
    accountId: input.accountId,
    accountName: input.accountName.trim(),
    opportunityId: input.opportunityId || null,
    title,
    objective: (input.objective || '').trim(),
    status: 'active',
    currentMoneyState: input.currentMoneyState || 'none',
    currentWaitingParty: input.currentWaitingParty || 'none',
    lastActivityAt: timestamp,
    archivedAt: null,
    sourceType: input.sourceType || 'manual',
    sourceId: input.sourceId || null,
    sourceUrl: null,
    sourceUpdatedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  saveThread(thread);
  const event = recordCommercialEvent(scope, {
    eventType: 'thread_created',
    summary: `Commercial thread opened: ${title}`,
    accountId: thread.accountId,
    opportunityId: thread.opportunityId,
    threadId: thread.id,
    structuredPayload: { objective: thread.objective },
    sourceType: thread.sourceType,
  });

  return ok(thread, event);
}

export function linkEventToThread(
  scope: CommercialScope,
  input: { threadId: string; eventSummary: string; occurredAt?: string; sourceId?: string | null },
): CommandResult<CommercialThread> {
  const thread = loadThreads().find((item) => item.id === input.threadId);
  if (!thread) return fail('That commercial thread no longer exists.');

  const occurredAt = input.occurredAt || now();
  const updated: CommercialThread = {
    ...thread,
    // Linking an event is the definition of activity, so the silence clock
    // resets here and nowhere else.
    lastActivityAt: occurredAt > thread.lastActivityAt ? occurredAt : thread.lastActivityAt,
    updatedAt: now(),
  };
  saveThread(updated);

  const event = recordCommercialEvent(scope, {
    eventType: 'thread_linked',
    summary: input.eventSummary,
    accountId: updated.accountId,
    opportunityId: updated.opportunityId,
    threadId: updated.id,
    occurredAt,
    sourceId: input.sourceId,
    sourceType: 'capture',
  });

  return ok(updated, event);
}

export function changeThreadStatus(
  scope: CommercialScope,
  input: { threadId: string; status: ThreadStatus; reason?: string },
): CommandResult<CommercialThread> {
  const thread = loadThreads().find((item) => item.id === input.threadId);
  if (!thread) return fail('That commercial thread no longer exists.');
  if (!canTransitionThread(thread.status, input.status)) {
    return fail(`A ${thread.status} thread cannot become ${input.status}.`);
  }
  if (thread.status === input.status) return ok(thread);

  const timestamp = now();
  const updated: CommercialThread = {
    ...thread,
    status: input.status,
    archivedAt: input.status === 'archived' ? timestamp : thread.archivedAt || null,
    updatedAt: timestamp,
  };
  saveThread(updated);

  const event = recordCommercialEvent(scope, {
    eventType: 'thread_status_changed',
    summary: `${thread.title}: ${thread.status} → ${input.status}`,
    accountId: updated.accountId,
    opportunityId: updated.opportunityId,
    threadId: updated.id,
    structuredPayload: { from: thread.status, to: input.status, reason: input.reason || '' },
  });

  return ok(updated, event);
}

/**
 * Records which side the thread is now waiting on. Every command takes a scope
 * for a uniform signature, even where - as here - nothing is written to history:
 * "we are waiting on the customer" is current state, not an event, and emitting
 * one every time a page recomputed it would bury the real history.
 */
export function markThreadWaiting(
  _scope: CommercialScope,
  input: { threadId: string; waitingOn: WaitingParty; reason?: string },
): CommandResult<CommercialThread> {
  const thread = loadThreads().find((item) => item.id === input.threadId);
  if (!thread) return fail('That commercial thread no longer exists.');
  if (isThreadClosed(thread.status)) return fail('A closed thread is not waiting on anyone.');

  const updated: CommercialThread = {
    ...thread,
    status: input.waitingOn === 'none' ? 'active' : 'waiting',
    currentWaitingParty: input.waitingOn,
    updatedAt: now(),
  };
  saveThread(updated);
  return ok(updated);
}

export function advanceMoneyCheckpoint(
  scope: CommercialScope,
  input: { threadId: string; moneyState: MoneyState; occurredAt?: string; amount?: number | null; currency?: string | null },
): CommandResult<CommercialThread> {
  const thread = loadThreads().find((item) => item.id === input.threadId);
  if (!thread) return fail('That commercial thread no longer exists.');

  const occurredAt = input.occurredAt || now();
  const updated: CommercialThread = {
    ...thread,
    currentMoneyState: input.moneyState,
    lastActivityAt: occurredAt > thread.lastActivityAt ? occurredAt : thread.lastActivityAt,
    updatedAt: now(),
  };
  saveThread(updated);

  const eventTypeByState: Partial<Record<MoneyState, CommercialEventType>> = {
    quoted: 'quote_created',
    awaiting_po: 'quote_sent',
    awaiting_delivery: 'po_received',
    awaiting_payment: 'delivery_completed',
    paid: 'payment_received',
  };

  const event = recordCommercialEvent(scope, {
    eventType: eventTypeByState[input.moneyState] || 'thread_status_changed',
    summary: `${thread.title}: money moved to ${input.moneyState.replace(/_/g, ' ')}`,
    accountId: updated.accountId,
    opportunityId: updated.opportunityId,
    threadId: updated.id,
    occurredAt,
    structuredPayload: {
      from: thread.currentMoneyState,
      to: input.moneyState,
      amount: input.amount ?? null,
      currency: input.currency || null,
    },
  });

  return ok(updated, event);
}

export function archiveThread(scope: CommercialScope, threadId: string) {
  return changeThreadStatus(scope, { threadId, status: 'archived' });
}

// ------------------------------------------------------------- commitments

export type CreateCommitmentInput = {
  threadId?: string;
  accountId?: string;
  accountName: string;
  opportunityId?: string | null;
  commitmentParty: CommitmentParty;
  ownerLabel?: string;
  commitmentText: string;
  dueDate?: string;
  silenceThresholdDays?: number;
  impactType?: CommitmentImpactType;
  impactAmount?: number | null;
  impactCurrency?: string | null;
  sourceEventId?: string | null;
  sourceType?: SourceType;
  sourceId?: string | null;
};

export function createCommitment(
  scope: CommercialScope,
  input: CreateCommitmentInput,
): CommandResult<CommercialCommitment> {
  const commitmentText = input.commitmentText.trim();
  if (!commitmentText) return fail('A commitment needs to say what was promised.');
  if (!input.accountName.trim()) return fail('A commitment needs a customer.');

  const timestamp = now();
  const dueDate = (input.dueDate || '').trim();
  const commitment: CommercialCommitment = {
    id: newCommitmentId(),
    userId: scope.userId,
    threadId: input.threadId || '',
    accountId: input.accountId || '',
    accountName: input.accountName.trim(),
    opportunityId: input.opportunityId || null,
    commitmentParty: input.commitmentParty,
    ownerLabel: (input.ownerLabel || defaultOwnerLabel(input.commitmentParty, input.accountName)).trim(),
    commitmentText,
    originalDueDate: dueDate,
    currentDueDate: dueDate,
    silenceThresholdDays: input.silenceThresholdDays ?? DEFAULT_SILENCE_THRESHOLD_DAYS,
    status: 'open',
    impactType: input.impactType || 'none',
    impactAmount: input.impactAmount ?? null,
    impactCurrency: input.impactCurrency || null,
    sourceEventId: input.sourceEventId || null,
    completionEvidence: null,
    completionEventId: null,
    dueDateHistory: [],
    lastRenegotiatedAt: null,
    completedAt: null,
    cancelledAt: null,
    sourceType: input.sourceType || 'manual',
    sourceId: input.sourceId || null,
    sourceUrl: null,
    sourceUpdatedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(isSample(scope) ? { isSample: true } : {}),
  };

  saveCommitment(commitment);
  const event = recordCommercialEvent(scope, {
    eventType: 'commitment_created',
    summary: `${ownerPhrase(commitment)} ${commitmentText}`,
    accountId: commitment.accountId,
    opportunityId: commitment.opportunityId,
    threadId: commitment.threadId || null,
    commitmentId: commitment.id,
    structuredPayload: { party: commitment.commitmentParty, dueDate: commitment.currentDueDate },
    sourceType: commitment.sourceType,
    sourceId: commitment.sourceId,
  });

  return ok(commitment, event);
}

export function completeCommitment(
  scope: CommercialScope,
  input: { commitmentId: string; evidence?: string; completedAt?: string },
): CommandResult<CommercialCommitment> {
  return transitionCommitment(scope, input.commitmentId, 'completed', (commitment) => {
    const completedAt = input.completedAt || now();
    return {
      ...commitment,
      status: 'completed' as CommitmentStatus,
      completedAt,
      completionEvidence: (input.evidence || '').trim() || null,
      updatedAt: now(),
    };
  }, 'commitment_completed');
}

export function cancelCommitment(
  scope: CommercialScope,
  input: { commitmentId: string; reason?: string },
): CommandResult<CommercialCommitment> {
  return transitionCommitment(scope, input.commitmentId, 'cancelled', (commitment) => ({
    ...commitment,
    status: 'cancelled' as CommitmentStatus,
    cancelledAt: now(),
    updatedAt: now(),
  }), 'commitment_cancelled', input.reason);
}

/**
 * Moves a promise's due date while keeping the promise that was originally
 * made. `originalDueDate` is never touched: "the customer said Tuesday and it
 * is now the third Tuesday" is a different fact from "it is due Friday", and
 * only the history can tell you which one you are looking at.
 */
export function rescheduleCommitment(
  scope: CommercialScope,
  input: { commitmentId: string; newDueDate: string; reason?: string },
): CommandResult<CommercialCommitment> {
  const commitment = loadCommitments().find((item) => item.id === input.commitmentId);
  if (!commitment) return fail('That commitment no longer exists.');
  if (commitment.status !== 'open') return fail('Only an open commitment can be rescheduled.');

  const newDueDate = input.newDueDate.trim();
  if (!newDueDate) return fail('A reschedule needs a new date.');
  if (newDueDate === commitment.currentDueDate) return ok(commitment);

  const timestamp = now();
  const updated: CommercialCommitment = {
    ...commitment,
    currentDueDate: newDueDate,
    // Status stays 'open'. A moved promise is still a promise.
    dueDateHistory: [
      ...commitment.dueDateHistory,
      {
        from: commitment.currentDueDate,
        to: newDueDate,
        changedAt: timestamp,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    ],
    lastRenegotiatedAt: timestamp,
    updatedAt: timestamp,
  };
  saveCommitment(updated);

  const event = recordCommercialEvent(scope, {
    eventType: 'commitment_rescheduled',
    summary: `${ownerPhrase(updated)} moved from ${commitment.currentDueDate || 'no date'} to ${newDueDate}`,
    accountId: updated.accountId,
    opportunityId: updated.opportunityId,
    threadId: updated.threadId || null,
    commitmentId: updated.id,
    structuredPayload: {
      originalDueDate: updated.originalDueDate,
      from: commitment.currentDueDate,
      to: newDueDate,
      timesMoved: updated.dueDateHistory.length,
      reason: input.reason || '',
    },
  });

  return ok(updated, event);
}

function transitionCommitment(
  scope: CommercialScope,
  commitmentId: string,
  to: CommitmentStatus,
  apply: (commitment: CommercialCommitment) => CommercialCommitment,
  eventType: CommercialEventType,
  reason?: string,
): CommandResult<CommercialCommitment> {
  const commitment = loadCommitments().find((item) => item.id === commitmentId);
  if (!commitment) return fail('That commitment no longer exists.');
  if (!canTransitionCommitment(commitment.status, to)) {
    return fail(`A ${commitment.status} commitment cannot become ${to}.`);
  }
  if (commitment.status === to) return ok(commitment);

  const updated = apply(commitment);
  const event = recordCommercialEvent(scope, {
    eventType,
    summary: `${ownerPhrase(updated)} ${updated.commitmentText}`,
    accountId: updated.accountId,
    opportunityId: updated.opportunityId,
    threadId: updated.threadId || null,
    commitmentId: updated.id,
    structuredPayload: {
      from: commitment.status,
      to,
      dueDate: updated.currentDueDate,
      originalDueDate: updated.originalDueDate,
      timesMoved: updated.dueDateHistory.length,
      reason: reason || '',
    },
  });

  // The completion event is the evidence, so the record points back at it.
  const withEvidence: CommercialCommitment =
    to === 'completed' ? { ...updated, completionEventId: event.id } : updated;
  saveCommitment(withEvidence);

  return ok(withEvidence, event);
}

export function removeCommitment(commitmentId: string) {
  deleteCommitment(commitmentId);
}

function defaultOwnerLabel(party: CommitmentParty, accountName: string) {
  if (party === 'customer') return accountName;
  if (party === 'internal') return 'Internal';
  return 'You';
}

function ownerPhrase(commitment: CommercialCommitment) {
  if (commitment.commitmentParty === 'customer') return `${commitment.ownerLabel} owes:`;
  if (commitment.commitmentParty === 'internal') return `${commitment.ownerLabel} owes:`;
  return 'You owe:';
}

// --------------------------------------------------------------- targets

/**
 * Sets the number for a quarter, and records that it moved.
 *
 * The event is the point. A quota raised mid-year is a fact about the year, and
 * overwriting the old value would make "I was raised in Q3" unanswerable
 * exactly when it matters - the review where the gap is being discussed. The
 * table holds today's number; commercial_events holds how it got there.
 */
export function setCommercialTarget(
  scope: CommercialScope,
  input: {
    period: ForecastQuarter;
    fiscalYear: number;
    amount: number;
    currency?: string;
    fiscalYearStartMonth?: number;
    note?: string;
  },
): CommandResult<CommercialTarget> {
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return fail('A target needs a number that is zero or more.');
  }

  const previous = loadTargets().find(
    (target) => target.period === input.period && target.fiscalYear === input.fiscalYear,
  );
  const timestamp = now();

  const target: CommercialTarget = {
    period: input.period,
    fiscalYear: input.fiscalYear,
    amount: input.amount,
    currency: input.currency || 'VND',
    fiscalYearStartMonth: input.fiscalYearStartMonth ?? previous?.fiscalYearStartMonth ?? 1,
    note: input.note?.trim() || null,
    createdAt: previous?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  if (previous && previous.amount === target.amount) return ok(target);

  saveTarget(target);

  const event = recordCommercialEvent(scope, {
    eventType: 'target_changed',
    summary: previous
      ? `${input.period} FY${input.fiscalYear} target moved from ${previous.amount} to ${target.amount}`
      : `${input.period} FY${input.fiscalYear} target set to ${target.amount}`,
    structuredPayload: {
      period: target.period,
      fiscalYear: target.fiscalYear,
      from: previous?.amount ?? null,
      to: target.amount,
      currency: target.currency,
      note: target.note,
    },
  });

  return ok(target, event);
}

// -------------------------------------------------------- value outcomes

export type RecordValueOutcomeInput = {
  outcomeType: ValueOutcomeType;
  userAssessment: ValueAssessment;
  threadId?: string | null;
  accountId?: string | null;
  opportunityId?: string | null;
  recommendationId?: string | null;
  impactAmount?: number | null;
  impactCurrency?: string | null;
  confidence?: number | null;
  note?: string | null;
  occurredAt?: string;
};

/**
 * Records whether Memoire actually helped. Deliberately cheap to call and
 * deliberately optional - a modal after every action would train the user to
 * dismiss it, and a value ledger of reflexive dismissals is worse than none.
 */
export function recordValueOutcome(
  scope: CommercialScope,
  input: RecordValueOutcomeInput,
): CommandResult<CommercialValueOutcome> {
  const timestamp = now();
  const outcome: CommercialValueOutcome = {
    id: newValueOutcomeId(),
    userId: scope.userId,
    threadId: input.threadId || null,
    accountId: input.accountId || null,
    opportunityId: input.opportunityId || null,
    recommendationId: input.recommendationId || null,
    outcomeType: input.outcomeType,
    userAssessment: input.userAssessment,
    impactAmount: input.impactAmount ?? null,
    impactCurrency: input.impactCurrency || null,
    confidence: input.confidence ?? null,
    note: (input.note || '').trim() || null,
    occurredAt: input.occurredAt || timestamp,
    createdAt: timestamp,
    ...(isSample(scope) ? { isSample: true } : {}),
  };

  saveValueOutcome(outcome);
  const event = recordCommercialEvent(scope, {
    eventType: 'value_outcome_recorded',
    summary: `Outcome recorded: ${input.outcomeType.replace(/_/g, ' ')}`,
    accountId: outcome.accountId,
    opportunityId: outcome.opportunityId,
    threadId: outcome.threadId,
    structuredPayload: {
      outcomeType: outcome.outcomeType,
      assessment: outcome.userAssessment,
      impactAmount: outcome.impactAmount,
      recommendationId: outcome.recommendationId,
    },
  });

  return ok(outcome, event);
}
