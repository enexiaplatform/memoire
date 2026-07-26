import { useMemo, useState } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { recordValueOutcome } from '../../domain/commercialKernel/commands';
import type {
  CommercialScope,
  ValueAssessment,
  ValueOutcomeType,
} from '../../domain/commercialKernel/types';
import type { Recommendation, ReasonCode } from '../../domain/commercialKernel/policyEngine';
import { trackProductEvent } from '../../utils/productAnalytics';

const assessmentLabels: Record<ValueAssessment, string> = {
  would_have_done_anyway: 'I would have done it anyway',
  helped_me_do_it_sooner: 'Memoire helped me do it sooner',
  might_have_missed_it: 'I might have missed it',
  protected_revenue_or_payment: 'Memoire protected revenue or payment',
};

/**
 * Maps a rule to the kind of commercial good acting on it would represent, so
 * the user is asked one question ("was this worth it?") rather than two.
 */
const OUTCOME_BY_REASON: Record<ReasonCode, ValueOutcomeType> = {
  CUSTOMER_COMMITMENT_OVERDUE: 'commitment_caught',
  SELF_COMMITMENT_OVERDUE: 'commitment_caught',
  COMMITMENT_REPEATEDLY_RESCHEDULED: 'commitment_caught',
  COMMITMENT_WITHOUT_OWNER: 'no_material_impact',
  COMMITMENT_WITHOUT_DUE_DATE: 'no_material_impact',
  THREAD_SILENT: 'follow_up_recovered',
  THREAD_WITHOUT_NEXT_COMMITMENT: 'follow_up_recovered',
  OPPORTUNITY_WITHOUT_STAGE_EVIDENCE: 'no_material_impact',
  OPPORTUNITY_WITHOUT_FUTURE_ACTION: 'follow_up_recovered',
  QUOTE_EXPIRING: 'quote_advanced',
  MONEY_CHECKPOINT_STUCK: 'payment_recovered',
};

/**
 * "Saved by Memoire": did this actually help?
 *
 * Deliberately a quiet inline control, never a modal. A dialog after every
 * action trains people to dismiss it, and a value ledger built from reflexive
 * dismissals is worse than no ledger - it would look like evidence while
 * measuring nothing. The honest option is listed first and is exactly as easy
 * to pick as the flattering ones, because the point of this record is to be
 * able to tell whether Memoire is worth paying for.
 */
export function SavedByMemoirePrompt({ recommendation }: { recommendation: Recommendation }) {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const scope: CommercialScope = useMemo(
    () => ({ userId: sampleDataActive ? null : user?.id || null, sampleDataActive }),
    [sampleDataActive, user?.id],
  );

  const [open, setOpen] = useState(false);
  const [recorded, setRecorded] = useState(false);

  if (recorded) {
    return <span className="text-[11px] font-semibold text-emerald-700">Thanks — recorded.</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-gray-400 hover:text-brand-blue"
      >
        Did this help?
      </button>
    );
  }

  const record = (assessment: ValueAssessment) => {
    const outcomeType: ValueOutcomeType = assessment === 'would_have_done_anyway'
      ? 'no_material_impact'
      : OUTCOME_BY_REASON[recommendation.reasonCode];

    recordValueOutcome(scope, {
      outcomeType,
      userAssessment: assessment,
      threadId: recommendation.threadId,
      opportunityId: recommendation.opportunityId,
      recommendationId: recommendation.id,
    });

    // The value events mirror the ledger, so "did Memoire help?" is answerable
    // in aggregate without reading anyone's commercial records. A
    // no-material-impact verdict has no event: it is a real and useful answer
    // in the ledger, but it is not a claim of value, and emitting one would let
    // the value funnel count its own rejections as successes.
    if (outcomeType !== 'no_material_impact') trackProductEvent(outcomeType);

    setRecorded(true);
  };

  return (
    <div className="flex w-full flex-wrap gap-1.5 rounded-lg bg-white/80 p-1.5 ring-1 ring-gray-100">
      {(Object.keys(assessmentLabels) as ValueAssessment[]).map((assessment) => (
        <button
          key={assessment}
          type="button"
          onClick={() => record(assessment)}
          className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:border-brand-blue hover:text-brand-blue"
        >
          {assessmentLabels[assessment]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="ml-auto text-[11px] font-semibold text-gray-400 hover:text-gray-700"
      >
        Not now
      </button>
    </div>
  );
}
