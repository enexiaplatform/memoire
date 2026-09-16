import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';

export type FirstWeekStepId = 'capture' | 'link' | 'commit' | 'close' | 'review';

export type FirstWeekStep = {
  id: FirstWeekStepId;
  label: string;
  hint: string;
  href: string;
  cta: string;
  done: boolean;
};

export type FirstWeekPath = {
  steps: FirstWeekStep[];
  done: number;
  total: number;
  complete: boolean;
  nextStep: FirstWeekStep | null;
};

/** The minimum shape the path needs from a commitment, whatever store owns it. */
export type FirstWeekCommitment = {
  status?: string;
  done?: boolean;
  isSample?: boolean;
  source?: string;
};

/**
 * The one onboarding path in Memoire.
 *
 * There used to be six overlapping mechanisms - an onboarding modal, Quick
 * Start Setup, Sales Operating Setup, the First Pipeline Review flow, the demo
 * guide and this checklist - each teaching a different "first thing to do". A
 * new user could not tell which one was the product. This is now the only one
 * for real workspaces; demo guidance appears only in demo mode, and Review
 * teaches its own first run through its empty state.
 *
 * The five steps are the operating loop in miniature: record it once, give it
 * somewhere to belong, promise the next move, keep the promise, then look back
 * at the week. Every step is derived from workspace data already loaded - no
 * stored progress, no extra data entry, nothing to configure. Nobody defines a
 * go-to-market system before they have experienced the value.
 */
export function buildFirstWeekPath(input: {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  /**
   * Weeks the operator has confirmed in Review - the weekly review as it is run
   * now. Sample and demo snapshots never count.
   */
  weeklyReviews?: { isSample?: boolean; source?: string }[];
  /**
   * Dated promises. Plan items today; the commercial commitment ledger once a
   * workspace has one. Sample and demo records never count.
   */
  commitments?: FirstWeekCommitment[];
}): FirstWeekPath {
  const captured = input.activities.length > 0;

  // "Linked" means the event found a home - an account or an opportunity. A
  // capture that never attaches to anything is exactly the silence Memoire
  // exists to prevent, so an unlinked activity does not advance the path.
  const linked = input.opportunities.length > 0
    || input.activities.some((activity) => Boolean(
      activity.linkedOpportunityId?.trim()
      || activity.linkedAccountName?.trim()
      || activity.accountName?.trim(),
    ));

  const realCommitments = (input.commitments || []).filter(
    (commitment) => !commitment.isSample && commitment.source !== 'demo',
  );
  // A promise needs a date, which is what this step's own hint says: "what
  // happens next, by whom, and by when". An undated next action ticked the step
  // off while Today's Commitments panel - two inches below the same strip - read
  // "Nothing is promised right now", because nothing undated is ever watched or
  // lands on a day in the Plan. Marking that step done is the product telling a
  // new operator their commitment is being kept an eye on when it is not.
  const committed = realCommitments.length > 0
    || input.activities.some((activity) => Boolean(activity.nextAction?.trim() && activity.dueDate?.trim()));
  const closed = realCommitments.some(
    (commitment) => commitment.done === true || commitment.status === 'completed',
  );

  // A review is a week confirmed in Review. This step used to be ticked by a
  // saved Pipeline Defense brief, and no workspace ever saved one - so on the
  // live book the fifth step could not be completed and the path never closed.
  // The brief was removed on 2026-09-15; the week you confirm is the review.
  const reviewed = (input.weeklyReviews || []).some((review) => !review.isSample && review.source !== 'demo');

  const steps: FirstWeekStep[] = [
    {
      id: 'capture',
      label: 'Capture one real customer interaction',
      hint: 'Paste a note, a call summary or an email. Parsing happens on your device.',
      href: '/app/capture',
      cta: 'Capture',
      done: captured,
    },
    {
      id: 'link',
      label: 'Link it to a customer',
      hint: 'Attach it to an account or an opportunity so the thread has somewhere to live.',
      href: '/app/accounts',
      cta: 'Open accounts',
      done: linked,
    },
    {
      id: 'commit',
      label: 'Set the next commitment',
      hint: 'What happens next, by whom, and by when. This is what Memoire watches.',
      href: '/app/timeline?view=upcoming',
      cta: 'Open Timeline',
      done: committed,
    },
    {
      id: 'close',
      label: 'Come back and complete it',
      hint: 'Tick it off when it is done. Kept promises are what the weekly review measures.',
      href: '/app/today',
      cta: 'Open Today',
      done: closed,
    },
    {
      id: 'review',
      label: 'Run your first weekly review',
      hint: 'Look back at the week: what moved, what is stuck, what you owe next week.',
      href: '/app/reviews',
      cta: 'Open Review',
      done: reviewed,
    },
  ];

  const done = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done) || null;

  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    nextStep,
  };
}
