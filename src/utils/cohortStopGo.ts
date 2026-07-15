export const COHORT_FUNNEL_KEY = 'memoire.cohortFunnel.v1';

export type CohortFunnelInput = {
  participants: number;
  finishedLoop: number;
  createdOrReviewedBrief: number;
  savedPackOrCopiedSummary: number;
  wouldUseWeeklyOrBeforeReview: number;
  paidIntent: number;
  hasUnresolvedP0: boolean;
};

export type CohortVerdict = 'go' | 'iterate' | 'pause';

export type CohortCondition = {
  id: string;
  label: string;
  met: boolean;
  detail: string;
};

export type CohortStopGo = {
  verdict: CohortVerdict;
  goConditions: CohortCondition[];
  pauseFlags: CohortCondition[];
  summary: string;
};

export const defaultCohortFunnelInput: CohortFunnelInput = {
  participants: 0,
  finishedLoop: 0,
  createdOrReviewedBrief: 0,
  savedPackOrCopiedSummary: 0,
  wouldUseWeeklyOrBeforeReview: 0,
  paidIntent: 0,
  hasUnresolvedP0: false,
};

// Doc thresholds are expressed against the ~5-person minimum ("4/5", "3/5",
// "2/5"); applied here as fractions of the finishers so they scale with cohort
// size. ceil keeps them strict - 4/5 of 5 is 4, of 6 is 5.
const GO_MIN_FINISHERS = 5;
const BRIEF_FRACTION = 0.8;
const PACK_FRACTION = 0.6;
const USE_FRACTION = 0.6;
const PAID_FRACTION = 0.4;
const REACH_FRACTION = 0.4;

function need(fraction: number, base: number) {
  return Math.ceil(fraction * base);
}

/**
 * Evaluates the cohort's numbers against the stop/go criteria in
 * `cohort-validation-system-2026-06-16.md`. Only the quantitative conditions are
 * computed; the qualitative Iterate/Pause signals (trust, "only wants CRM sync",
 * repeated missing capability) still need the operator's read, which the summary
 * says plainly. Pure and deterministic.
 */
export function evaluateCohortStopGo(input: CohortFunnelInput): CohortStopGo {
  const finishers = Math.max(0, input.finishedLoop);
  const goConditions: CohortCondition[] = [
    {
      id: 'finishers',
      label: `At least ${GO_MIN_FINISHERS} finish the 14-day loop`,
      met: finishers >= GO_MIN_FINISHERS,
      detail: `${finishers} finished`,
    },
    {
      id: 'brief',
      label: 'At least 4/5 create or review a Pipeline Defense Brief',
      met: finishers > 0 && input.createdOrReviewedBrief >= need(BRIEF_FRACTION, finishers),
      detail: `${input.createdOrReviewedBrief} of ${finishers} (need ${need(BRIEF_FRACTION, finishers)})`,
    },
    {
      id: 'pack',
      label: 'At least 3/5 save a pack, copy a summary, or use it in a real review',
      met: finishers > 0 && input.savedPackOrCopiedSummary >= need(PACK_FRACTION, finishers),
      detail: `${input.savedPackOrCopiedSummary} of ${finishers} (need ${need(PACK_FRACTION, finishers)})`,
    },
    {
      id: 'use',
      label: 'At least 3/5 would use it weekly or before pipeline review',
      met: finishers > 0 && input.wouldUseWeeklyOrBeforeReview >= need(USE_FRACTION, finishers),
      detail: `${input.wouldUseWeeklyOrBeforeReview} of ${finishers} (need ${need(USE_FRACTION, finishers)})`,
    },
    {
      id: 'paid',
      label: 'At least 2/5 show paid intent',
      met: finishers > 0 && input.paidIntent >= need(PAID_FRACTION, finishers),
      detail: `${input.paidIntent} of ${finishers} (need ${need(PAID_FRACTION, finishers)})`,
    },
    {
      id: 'no-p0',
      label: 'No unresolved P0 trust, isolation, deletion, or sync failure',
      met: !input.hasUnresolvedP0,
      detail: input.hasUnresolvedP0 ? 'An unresolved P0 is open' : 'None open',
    },
  ];

  const participants = Math.max(0, input.participants);
  const pauseFlags: CohortCondition[] = [
    {
      id: 'reach',
      label: 'Fewer than 2/5 reach the Pipeline Defense moment',
      met: participants > 0 && input.createdOrReviewedBrief < need(REACH_FRACTION, participants),
      detail: `${input.createdOrReviewedBrief} of ${participants} reached (pause below ${need(REACH_FRACTION, participants)})`,
    },
  ];

  const pauseFlagged = pauseFlags.some((flag) => flag.met);
  const allGoMet = goConditions.every((condition) => condition.met);
  const verdict: CohortVerdict = pauseFlagged ? 'pause' : allGoMet ? 'go' : 'iterate';

  const summary = verdict === 'go'
    ? 'All measured Go conditions are met. Confirm the qualitative trust/fit signals, then move to paid-offer design.'
    : verdict === 'pause'
      ? 'A pause signal is flagged: too few reached the Pipeline Defense moment. Check whether the pain is really pipeline review before continuing.'
      : 'Not yet a Go. Close the unmet conditions below; the qualitative Iterate signals (trust for manager use, one repeated missing capability) still need your read.';

  return { verdict, goConditions, pauseFlags, summary };
}

export function loadCohortFunnelInput(): CohortFunnelInput {
  if (typeof window === 'undefined') return defaultCohortFunnelInput;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COHORT_FUNNEL_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return defaultCohortFunnelInput;
    return { ...defaultCohortFunnelInput, ...normalizeFunnelInput(parsed) };
  } catch {
    return defaultCohortFunnelInput;
  }
}

export function saveCohortFunnelInput(input: CohortFunnelInput): CohortFunnelInput {
  const next = normalizeFunnelInput(input);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(COHORT_FUNNEL_KEY, JSON.stringify(next));
    } catch {
      // Convenience-only persistence.
    }
  }
  return next;
}

function normalizeFunnelInput(value: Partial<CohortFunnelInput>): CohortFunnelInput {
  const num = (input: unknown) => {
    const parsed = Math.floor(Number(input));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  return {
    participants: num(value.participants),
    finishedLoop: num(value.finishedLoop),
    createdOrReviewedBrief: num(value.createdOrReviewedBrief),
    savedPackOrCopiedSummary: num(value.savedPackOrCopiedSummary),
    wouldUseWeeklyOrBeforeReview: num(value.wouldUseWeeklyOrBeforeReview),
    paidIntent: num(value.paidIntent),
    hasUnresolvedP0: value.hasUnresolvedP0 === true,
  };
}
