import { Link } from 'react-router-dom';
import { Banknote, Flag, Trophy } from 'lucide-react';
import type { WeeklyBusinessReview } from '../../utils/weeklyBusinessReview';
import { formatBaseCurrencyAmount, formatCurrencyAmount } from '../../utils/money';
import { formatOutcomeRetro } from '../../utils/personalSalesLearning';

export function WeeklyBusinessReviewPanel({ review, periodLabel }: { review: WeeklyBusinessReview; periodLabel: string }) {
  const activeLanes = review.moneyFlow.lanes.filter((lane) => lane.threads > 0);

  return (
    <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-navy">Business review - {periodLabel}</h2>
        <p className="text-sm text-gray-600">
          Where the money sits, what closed, which initiative stalled, and what next week must move.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-navy">Where the money sits</h3>
            <Link to="/app/revenue" className="ml-auto text-xs font-bold text-brand-blue hover:underline">Open Money</Link>
          </div>
          {activeLanes.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No commercial threads in motion. Capture the next quote or deal.</p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {activeLanes.map((lane) => (
                <div key={lane.stage} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
                  <span className="font-bold text-gray-700">{lane.stage}</span>
                  <span className="font-semibold text-gray-600">
                    {lane.threads} {lane.threads === 1 ? 'thread' : 'threads'} - {formatBaseCurrencyAmount(lane.totalBase, true)}
                    {lane.stuckThreads > 0 && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">{lane.stuckThreads} stuck</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {review.moneyFlow.stuckThreads.length > 0 && (
            <p className="mt-2 text-xs font-semibold text-red-700">
              Stuck: {review.moneyFlow.stuckThreads.slice(0, 3).map((thread) => `${thread.accountName} (${thread.stuckReason})`).join('; ')}
            </p>
          )}
        </article>

        <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-navy">Wins / losses this period</h3>
          </div>
          {review.wins.length === 0 && review.losses.length === 0 && review.otherOutcomes.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No deals closed in this period.</p>
          ) : (
            <div className="mt-3 space-y-1.5 text-xs leading-5">
              {review.wins.map((outcome) => (
                <p key={outcome.id} className="rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-900">
                  Won: {outcome.accountName} / {outcome.opportunityName}
                  {typeof outcome.finalAmount === 'number' ? ` - ${formatCurrencyAmount(outcome.finalAmount, outcome.currency)}` : ''}
                </p>
              ))}
              {review.losses.map((outcome) => (
                <p key={outcome.id} className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-900" title={formatOutcomeRetro(outcome)}>
                  Lost: {outcome.accountName} / {outcome.opportunityName} - {outcome.reasonCategory}
                </p>
              ))}
              {review.otherOutcomes.map((outcome) => (
                <p key={outcome.id} className="rounded-lg bg-amber-50 px-3 py-2 font-semibold text-amber-900">
                  {outcome.outcome}: {outcome.accountName} / {outcome.opportunityName}
                </p>
              ))}
              {review.wins.length > 0 && (
                <p className="pt-1 text-gray-600">Won value: <span className="font-bold text-emerald-700">{review.wonValueLabel}</span></p>
              )}
            </div>
          )}
        </article>

        <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-violet-700" />
            <h3 className="text-sm font-bold text-navy">Stalled initiatives</h3>
            <Link to="/app/operating-system" className="ml-auto text-xs font-bold text-brand-blue hover:underline">Open initiatives</Link>
          </div>
          {review.stalledInitiatives.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No initiative looks stalled. Anything untracked? Capture it.</p>
          ) : (
            <div className="mt-3 space-y-1.5 text-xs leading-5">
              {review.stalledInitiatives.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-lg bg-white px-3 py-2">
                  <p className="font-bold text-gray-900">{item.title} <span className="ml-1 rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">{item.contextType}</span></p>
                  <p className="mt-0.5 text-gray-600">{item.reason} {item.nextAction}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <h3 className="text-sm font-bold text-navy">Commitments</h3>
          <p className="mt-1 text-xs text-gray-500">Promised next actions vs what the ledger shows. Current promises only - honest, not reconstructed.</p>
          {review.commitments.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No dated commitments in this period. Put dates on next actions so this ledger can hold you to them.</p>
          ) : (
            <div className="mt-3 space-y-1.5 text-xs leading-5">
              {review.commitments.slice(0, 6).map((item) => (
                <div key={item.id} className="flex flex-col gap-0.5 rounded-lg bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-bold text-gray-900">{item.accountName} / {item.opportunityName}: <span className="font-semibold text-gray-700">{item.action}</span></p>
                  <span className={`w-fit shrink-0 rounded-full px-2 py-0.5 font-bold ${commitmentTone(item.status)}`} title={item.evidence}>
                    {commitmentLabel(item.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <h3 className="text-sm font-bold text-navy">Next week's priorities</h3>
          {review.nextWeekPriorities.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Nothing scheduled yet. Book the next touches before closing this review.</p>
          ) : (
            <ol className="mt-3 space-y-1.5 text-xs leading-5">
              {review.nextWeekPriorities.map((priority, index) => (
                <li key={priority.id} className="rounded-lg bg-white px-3 py-2">
                  <Link to={priority.href} className="font-bold text-gray-900 hover:text-brand-blue">
                    {index + 1}. {priority.label}
                  </Link>
                  <p className="mt-0.5 text-gray-600">{priority.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </article>
      </div>
    </section>
  );
}

function commitmentLabel(status: 'kept' | 'missed' | 'upcoming') {
  return { kept: 'Kept', missed: 'Missed', upcoming: 'Upcoming' }[status];
}

function commitmentTone(status: 'kept' | 'missed' | 'upcoming') {
  return {
    kept: 'bg-emerald-50 text-emerald-700',
    missed: 'bg-red-50 text-red-700',
    upcoming: 'bg-blue-50 text-brand-blue',
  }[status];
}
