import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import type { FollowUpImpactEvent, FollowUpImpactSummary } from '../../utils/followUpImpact';
import { followUpImpactStatusLabel } from '../../utils/followUpImpact';
import { formatBaseCurrencyAmount, formatCurrencyAmount } from '../../utils/money';
import { formatSafeBusinessDate } from '../../utils/safeDate';

export function FollowUpImpactPanel({ impact, periodLabel }: { impact: FollowUpImpactSummary; periodLabel?: string }) {
  if (impact.followUpsSent === 0) return null;
  const backInMotion = impact.dealsRevived + impact.dealsWon + impact.dealsProtected;
  const windowText = periodLabel || `the last ${impact.windowDays} days`;

  return (
    <section className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-navy">Saved from silence</h2>
            <p className="text-xs text-gray-500">What your follow-ups actually changed in {windowText}.</p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          {backInMotion} of {impact.quietDealsContacted || impact.followUpsSent} quiet deals back in motion
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ImpactStat label="Follow-ups sent" value={String(impact.followUpsSent)} />
        <ImpactStat label="Quiet deals contacted" value={String(impact.quietDealsContacted)} />
        <ImpactStat label="Deals back in motion" value={String(backInMotion)} highlight />
        <ImpactStat label="Value back in motion" value={formatBaseCurrencyAmount(impact.valueBackInMotionBase, true)} highlight />
      </div>

      {impact.events.length > 0 && (
        <div className="mt-4 space-y-2">
          {impact.events.map((event) => (
            <ImpactEventRow key={`${event.opportunityId}-${event.followUpDate}`} event={event} />
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-500">
        Deals still waiting on a reply stay in the silence queue.{' '}
        <Link to="/app/opportunities" className="font-bold text-brand-blue hover:underline">Open opportunities</Link>
      </p>
    </section>
  );
}

function ImpactStat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-emerald-100 bg-emerald-50/60' : 'border-gray-100 bg-gray-50'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${highlight ? 'text-emerald-700' : 'text-navy'}`}>{value}</p>
    </div>
  );
}

function ImpactEventRow({ event }: { event: FollowUpImpactEvent }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">
          {event.accountName} / {event.opportunityName}
        </p>
        <p className="text-xs text-gray-600">
          {event.daysQuietBefore !== null && event.daysQuietBefore > 0 ? `Quiet ${event.daysQuietBefore}d, ` : ''}
          follow-up {formatSafeBusinessDate(event.followUpDate)}. {event.evidence}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {typeof event.amount === 'number' && event.amount > 0 && (
          <span className="text-xs font-semibold text-gray-500">{formatCurrencyAmount(event.amount, event.currency)}</span>
        )}
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusChipClass(event.status)}`}>
          {followUpImpactStatusLabel(event.status)}
        </span>
      </div>
    </div>
  );
}

function statusChipClass(status: FollowUpImpactEvent['status']) {
  if (status === 'won') return 'bg-emerald-100 text-emerald-800';
  if (status === 'revived') return 'bg-emerald-50 text-emerald-700';
  if (status === 'protected') return 'bg-blue-50 text-brand-blue';
  return 'bg-amber-50 text-amber-700';
}
