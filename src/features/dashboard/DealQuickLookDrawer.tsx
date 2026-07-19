import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PenLine, X } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { ObjectionRecord } from '../../services/objectionStore';
import { buildCommercialJourneySnapshot, formatJourneyCommitment } from '../../utils/commercialJourney';
import { getWorkspaceLens } from '../../utils/workspaceLens';
import { formatCurrencyAmount } from '../../utils/money';
import { formatSafeBusinessDate } from '../../utils/safeDate.ts';

/**
 * In-place quick look for a deal alarm on Today. Clicking an alarm should not
 * eject the user to another tab: this drawer answers "where does this deal
 * stand and what do I do" right here, and only the explicit "Open full record"
 * link leaves Today.
 */
export function DealQuickLookDrawer({
  opportunity,
  activities,
  quotes,
  objections,
  onClose,
  onDraftFollowUp,
}: {
  opportunity: CrmLiteOpportunity;
  activities: SalesActivityRecord[];
  quotes: QuoteRecord[];
  objections: ObjectionRecord[];
  onClose: () => void;
  onDraftFollowUp: () => void;
}) {
  const journey = buildCommercialJourneySnapshot({ opportunity, quotes, activities, objections });
  const position = getWorkspaceLens() === 'solo'
    ? journey.soloPosition
    : `${journey.position}${journey.positionSource === 'money-flow' ? ' (money flow)' : ''}`;
  const fullRecordHref = `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close deal quick look"
        onClick={onClose}
        className="absolute inset-0 bg-navy/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Deal quick look"
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Deal quick look</p>
            <h2 className="mt-1 text-lg font-bold leading-6 text-navy">
              {opportunity.accountName || 'Needs confirmation'} / {opportunity.opportunityName || 'Untitled opportunity'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-blue ring-1 ring-blue-100">{position}</span>
            {(opportunity.estimatedValue ?? 0) > 0 && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                {formatCurrencyAmount(opportunity.estimatedValue, opportunity.currency)}
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2">
            <QuickFact label="Next commitment" value={formatJourneyCommitment(journey.nextCommitment)} highlight />
            <QuickFact label="Money" value={journey.moneyStatus} />
            <QuickFact label="Risk" value={journey.riskStatus} />
            <QuickFact label="Blocker" value={journey.blocker || 'None open'} />
            <QuickFact
              label="Last touch"
              value={journey.lastTouch ? `${formatSafeBusinessDate(journey.lastTouch.date)} — ${journey.lastTouch.summary}` : 'None captured'}
            />
            <QuickFact label="Evidence" value={journey.evidence || 'Not captured yet'} />
            {opportunity.nextAction.trim() && (
              <QuickFact
                label="Planned next action"
                value={`${opportunity.nextAction}${opportunity.nextActionDate ? ` (${formatSafeBusinessDate(opportunity.nextActionDate)})` : ''}`}
              />
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDraftFollowUp}
              className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy/90"
            >
              <PenLine className="h-4 w-4" />
              Draft follow-up
            </button>
            <Link
              to={fullRecordHref}
              data-quick-look-exempt="true"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              Open full record
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-400">
            Quick look is read-only. Logging the follow-up is what moves the deal.
          </p>
        </div>
      </aside>
    </div>
  );
}

function QuickFact({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${highlight ? 'bg-blue-50/60 ring-blue-100' : 'bg-gray-50 ring-gray-100'}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm leading-5 ${highlight ? 'font-bold text-navy' : 'font-semibold text-gray-700'}`}>{value}</p>
    </div>
  );
}
