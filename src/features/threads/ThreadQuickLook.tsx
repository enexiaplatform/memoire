import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, CircleDot, Clock3 } from 'lucide-react';
import type { ResolvedThread } from '../../domain/commercialKernel/deriveThreads';
import type { MoneyState, ThreadStatus, WaitingParty } from '../../domain/commercialKernel/types';
import { formatSafeBusinessDate } from '../../utils/safeDate.ts';

const moneyLabels: Record<MoneyState, string> = {
  none: 'No money in play yet',
  quoted: 'Quoted',
  awaiting_customer_decision: 'Waiting on their decision',
  awaiting_po: 'Waiting on the PO',
  awaiting_delivery: 'Waiting on delivery',
  awaiting_payment: 'Waiting on payment',
  paid: 'Paid',
};

const waitingLabels: Record<WaitingParty, string> = {
  none: 'Nobody is waiting',
  self: 'They are waiting on you',
  customer: 'You are waiting on them',
  internal: 'Waiting on someone internal',
};

const statusTone: Record<ThreadStatus, string> = {
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  waiting: 'bg-amber-50 text-amber-800 ring-amber-100',
  won: 'bg-blue-50 text-brand-blue ring-blue-100',
  lost: 'bg-gray-100 text-gray-600 ring-gray-200',
  completed: 'bg-blue-50 text-brand-blue ring-blue-100',
  archived: 'bg-gray-100 text-gray-500 ring-gray-200',
};

/**
 * A Commercial Thread, in one card.
 *
 * This is a component, not a destination. The whole reason threads work is
 * that the same six answers appear wherever the thread is relevant - Today,
 * an Account, an Opportunity, Money, Timeline, Review, a search result - so
 * the seller never has to reconstruct the story from a different layout on
 * each page:
 *
 *   1. What outcome are we pursuing?      -> title and objective
 *   2. Where is the money?                -> money state
 *   3. What just happened?                -> last event
 *   4. What do I owe / am I waiting for?  -> waiting party
 *   5. What is next?                      -> next commitment
 *   6. When does waiting become risk?     -> days quiet
 */
export function ThreadQuickLook({
  thread,
  compact = false,
}: {
  thread: ResolvedThread;
  compact?: boolean;
}) {
  const href = thread.opportunityId
    ? `/app/opportunities?opportunityId=${encodeURIComponent(thread.opportunityId)}`
    : `/app/accounts?accountName=${encodeURIComponent(thread.accountName)}`;

  return (
    // `min-w-0`: this card is a grid item wherever it is used, and a grid item
    // refuses to shrink below its min-content width unless told to. At phone
    // width that made the card 403px inside a 358px column, and the whole page
    // scrolled sideways by 30px - on Today, Accounts and Opportunities alike.
    // Everything inside already truncates; it just never got the chance.
    <article className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold text-navy">{thread.title}</h3>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${statusTone[thread.status]}`}>
              {thread.status}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {thread.accountName}
            {thread.objective ? ` · ${thread.objective}` : ''}
          </p>
        </div>
        <Link
          to={href}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand-blue hover:underline"
        >
          Open
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs leading-5 sm:grid-cols-2">
        <Fact icon={<Banknote className="h-3.5 w-3.5" />} label="Money" value={moneyLabels[thread.currentMoneyState]} />
        <Fact icon={<CircleDot className="h-3.5 w-3.5" />} label="Waiting" value={waitingLabels[thread.currentWaitingParty]} />
        <Fact
          icon={<Clock3 className="h-3.5 w-3.5" />}
          label="Quiet for"
          value={thread.daysSinceActivity === null
            ? 'Nothing recorded yet'
            : `${thread.daysSinceActivity} day${thread.daysSinceActivity === 1 ? '' : 's'}`}
          tone={thread.daysSinceActivity !== null && thread.daysSinceActivity >= 10 ? 'text-amber-700' : ''}
        />
        <Fact
          label="Next commitment"
          value={thread.nextCommitment
            ? `${thread.nextCommitment.commitmentText}${thread.nextCommitment.currentDueDate ? ` · ${formatSafeBusinessDate(thread.nextCommitment.currentDueDate)}` : ''}`
            : 'None — nothing is scheduled to move this'}
          tone={thread.nextCommitment ? '' : 'text-amber-700'}
        />
      </dl>

      {!compact && thread.lastEventSummary && (
        <p className="mt-2 border-t border-gray-100 pt-2 text-xs leading-5 text-gray-500">
          <span className="font-semibold text-gray-600">Last:</span> {thread.lastEventSummary}
        </p>
      )}
    </article>
  );
}

function Fact({
  icon,
  label,
  value,
  tone = '',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      {icon && <span className="shrink-0 translate-y-0.5 text-gray-400">{icon}</span>}
      <dt className="shrink-0 font-semibold text-gray-500">{label}:</dt>
      <dd className={`min-w-0 truncate ${tone || 'text-gray-700'}`} title={value}>{value}</dd>
    </div>
  );
}
