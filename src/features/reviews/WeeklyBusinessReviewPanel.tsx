import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Copy, Flag, Trophy } from 'lucide-react';
import type { WeeklyBusinessReview } from '../../utils/weeklyBusinessReview';
import { formatBaseCurrencyAmount, formatCurrencyAmount } from '../../utils/money';
import { formatOutcomeRetro } from '../../utils/personalSalesLearning';
import { getWorkspaceLens, orderReviewSectionsForLens } from '../../utils/workspaceLens';
import { initiativeDecisionLabel, initiativeDecisionTone } from '../../utils/initiativeExperiment';

export function WeeklyBusinessReviewPanel({
  review,
  periodLabel,
  copyMessage,
  onCopyLearningBrief,
  onCopyRevenueRiskBrief,
  onCopyFollowUpBrief,
  commitmentSlot,
}: {
  review: WeeklyBusinessReview;
  periodLabel: string;
  copyMessage?: string;
  onCopyLearningBrief?: () => void;
  onCopyRevenueRiskBrief?: () => void;
  onCopyFollowUpBrief?: () => void;
  /**
   * Replaces the read-only priority list with the commitment picker. Passed in
   * rather than rendered here so this panel stays a pure view of derived state.
   */
  commitmentSlot?: ReactNode;
}) {
  const activeLanes = review.moneyFlow.lanes.filter((lane) => lane.threads > 0);
  const briefButtons = [
    onCopyLearningBrief && { label: 'Copy Learning Brief', onClick: onCopyLearningBrief },
    onCopyRevenueRiskBrief && { label: 'Copy Revenue Risk Brief', onClick: onCopyRevenueRiskBrief },
    onCopyFollowUpBrief && { label: 'Copy Follow-up Brief', onClick: onCopyFollowUpBrief },
  ].filter((button): button is { label: string; onClick: () => void } => Boolean(button));

  return (
    <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-navy">Business review - {periodLabel}</h2>
          <p className="text-sm text-gray-600">
            Where the money sits, what closed, which initiative stalled, and what next week must move.
          </p>
        </div>
        {briefButtons.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {copyMessage && <span className="w-full text-right text-xs font-semibold text-emerald-700 sm:w-auto">{copyMessage}</span>}
            {briefButtons.map((button) => (
              <button
                key={button.label}
                type="button"
                onClick={button.onClick}
                className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-brand-blue hover:bg-blue-50"
              >
                <Copy className="h-3.5 w-3.5" />
                {button.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {orderReviewSectionsForLens(reviewSections(review, activeLanes, commitmentSlot), getWorkspaceLens()).map((section) => (
          <div key={section.id} className="contents">{section.node}</div>
        ))}
      </div>
    </section>
  );
}

/**
 * The review's six sections as an ordered list so the workspace lens can
 * re-weight emphasis (direction 7.7). Reorder-only: every section always
 * renders; the lens never adds or hides one.
 */
function reviewSections(
  review: WeeklyBusinessReview,
  activeLanes: WeeklyBusinessReview['moneyFlow']['lanes'],
  commitmentSlot?: ReactNode,
) {
  return [
    {
      id: 'money',
      node: (
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
      ),
    },
    {
      id: 'outcomes',
      node: (
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
      ),
    },
    {
      id: 'initiatives',
      node: (
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
                  <p className="font-bold text-gray-900">
                    {item.title}
                    <span className="ml-1 rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">{item.contextType}</span>
                    {item.decision !== 'undecided' && (
                      <span className={`ml-1 rounded-full px-2 py-0.5 ${initiativeDecisionTone(item.decision)}`}>{initiativeDecisionLabel(item.decision)}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-gray-600">{item.reason} {item.nextAction}</p>
                  {item.currentSignal
                    ? <p className="mt-0.5 text-violet-800">Signal so far: {item.currentSignal}</p>
                    : item.hypothesis
                      ? <p className="mt-0.5 text-gray-500">Testing: {item.hypothesis}</p>
                      : null}
                </div>
              ))}
            </div>
          )}
          {review.decidedInitiatives.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="text-xs font-bold text-gray-500">Decided - needs closing</p>
              <div className="mt-1.5 space-y-1.5 text-xs leading-5">
                {review.decidedInitiatives.slice(0, 4).map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-white px-3 py-2">
                    <span className="font-bold text-gray-900">{item.title}</span>
                    <span className={`rounded-full px-2 py-0.5 ${initiativeDecisionTone(item.decision)}`}>{initiativeDecisionLabel(item.decision)}</span>
                    <span className="text-gray-500">still open{item.currentSignal ? ` - ${item.currentSignal}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>
      ),
    },
    {
      id: 'signals',
      node: (
        <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <h3 className="text-sm font-bold text-navy">Customer signals this period</h3>
          <p className="mt-1 text-xs text-gray-500">Rolled up from what you captured - nothing inferred.</p>
          {review.signals.total === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No signals captured in this period. Signals appear when captures mention buying intent, risks, timelines, or competitors.</p>
          ) : (
            <div className="mt-3 space-y-2 text-xs leading-5">
              <SignalGroup label="Buying signals" tone="text-emerald-800 bg-emerald-50" items={review.signals.buying} />
              <SignalGroup label="Risks" tone="text-red-800 bg-red-50" items={review.signals.risks} />
              <SignalGroup label="Timeline" tone="text-blue-900 bg-blue-50" items={review.signals.timeline} />
              <SignalGroup label="Competitors" tone="text-amber-900 bg-amber-50" items={review.signals.competitors} />
            </div>
          )}
        </article>
      ),
    },
    {
      id: 'commitments',
      node: (
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
      ),
    },
    {
      id: 'priorities',
      node: (
        <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <h3 className="text-sm font-bold text-navy">Next week's priorities</h3>
          {commitmentSlot ? <div className="mt-3">{commitmentSlot}</div> : review.nextWeekPriorities.length === 0 ? (
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
      ),
    },
  ];
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


function SignalGroup({ label, tone, items }: { label: string; tone: string; items: { text: string; accountName: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className={`rounded-lg px-3 py-2 ${tone}`}>
      <p className="font-bold">{label}</p>
      {items.map((item) => (
        <p key={`${item.text}-${item.accountName}`} className="mt-0.5">
          {item.text}{item.accountName ? ` - ${item.accountName}` : ''}
        </p>
      ))}
    </div>
  );
}
