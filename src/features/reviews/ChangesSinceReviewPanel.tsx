import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import { loadRecentEvents } from '../../services/commercialKernel/eventStore';
import { loadOrderReceivablesForWorkspace } from '../../services/orderReceivableStore';
import { loadWeeklyCommitmentsForWorkspace } from '../../services/weeklyCommitmentStore';
import type { CommercialEvent } from '../../domain/commercialKernel/types';
import type { OrderReceivableRecord } from '../../utils/receivables';
import type { WeeklyCommitmentSnapshot } from '../../utils/weeklyCommitment';
import { buildChangesSinceLastReview, type ChangeLine, type ChangeProvenance } from '../../utils/reviewChanges';
import { buildLeadFunnel, MIN_LEADS_FOR_RATE, type LeadFunnel } from '../../utils/leadQueue';
import { MicroLabel, MicroPill, Panel } from '../../components/ui/daylight';
import { tintSurface } from '../../components/ui/daylightStyles';
import { formatCount } from '../../utils/numberFormat';

/**
 * The two readings Review adds for the lifecycle that now starts at Leads.
 *
 * Both load their own records, like the other panels on this page, so neither
 * can quietly read a different workspace from the one around it. Both are
 * derived in utils - the page draws, it does not decide.
 */

type Loaded = {
  workspace: SalesWorkspaceData;
  events: CommercialEvent[];
  receivables: OrderReceivableRecord[];
  weeklyReviews: WeeklyCommitmentSnapshot[];
};

function useReviewChangeRecords() {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    Promise.all([
      loadSalesWorkspaceData(dataUserId),
      // A year, not the 90-day default: the funnel measures days to qualify,
      // and a lead worked over a quarter would otherwise lose its start.
      loadRecentEvents(dataUserId, sampleDataActive, { windowDays: 365, limit: 2000 }),
      loadOrderReceivablesForWorkspace(dataUserId, sampleDataActive).catch(() => [] as OrderReceivableRecord[]),
      loadWeeklyCommitmentsForWorkspace(dataUserId, sampleDataActive).catch(() => [] as WeeklyCommitmentSnapshot[]),
    ])
      .then(([workspace, events, receivables, weeklyReviews]) => {
        if (!cancelled) setLoaded({ workspace, events, receivables, weeklyReviews });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  return { loaded, failed, sampleDataActive };
}

const PROVENANCE_LABEL: Record<ChangeProvenance, string> = {
  created: 'From when the records were created',
  event: 'Observed when the record was edited',
  closeout: 'From close-outs and payments you recorded',
  threshold: 'The silence threshold was crossed in this window',
};

/**
 * What moved since the operator last closed a week.
 *
 * Movement, not state. Every line is something that happened in the window and
 * can be traced to the records it was counted from; a change the records cannot
 * prove is left out rather than estimated. The window opens at the last
 * confirmed review, or the last seven days when there has not been one - and
 * the panel says which.
 */
export function ChangesSinceReviewPanel() {
  const { loaded, failed, sampleDataActive } = useReviewChangeRecords();

  const changes = useMemo(() => (loaded ? buildChangesSinceLastReview({
    opportunities: loaded.workspace.opportunities,
    opportunityOutcomes: loaded.workspace.opportunityOutcomes,
    activities: loaded.workspace.activities,
    stakeholders: loaded.workspace.stakeholders,
    events: loaded.events,
    receivables: loaded.receivables,
    weeklyReviews: loaded.weeklyReviews,
    includeSampleRecords: sampleDataActive,
  }) : null), [loaded, sampleDataActive]);

  return (
    <Panel aria-labelledby="changes-since-review" className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="changes-since-review" className="font-display text-[19px] font-bold tracking-[-0.015em] text-ink">
          Changes since last review
        </h2>
        {changes && <span className="text-xs font-semibold text-muted">{changes.sinceLabel}</span>}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Only what the records prove moved. A change nobody recorded is left out, not estimated.
      </p>

      {failed ? (
        <p role="alert" className="mt-4 rounded-2xl bg-tint-amber-bg px-4 py-3 text-sm font-semibold text-tint-amber-ink">
          The changes could not be loaded. Nothing has been lost - reload Review to try again.
        </p>
      ) : !changes ? (
        <p className="mt-4 text-sm text-muted" aria-busy="true">Reading what moved…</p>
      ) : changes.lines.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-tint-neutral-bg px-4 py-3 text-sm text-tint-neutral-ink">
          Nothing the records can prove has moved {changes.sinceLabel}. Captures, stage moves, close-outs and payments
          all show up here once they are recorded.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {changes.lines.map((line) => <ChangeRow key={line.kind} line={line} />)}
        </ul>
      )}

      {changes?.eventHistoryPartial && changes.lines.length > 0 && (
        <p className="mt-3 text-[11.5px] leading-4 text-muted">
          Stage and close-date moves are only known from when Memoire started recording them, which is after this window
          opened - some earlier moves may be missing.
        </p>
      )}
    </Panel>
  );
}

function ChangeRow({ line }: { line: ChangeLine }) {
  const tone = line.tone === 'good' ? 'green' : line.tone === 'bad' ? 'red' : 'neutral';
  const surface = tintSurface[tone];
  const Icon = line.sign === 'up' ? ArrowUpRight : line.sign === 'down' ? ArrowDownRight : Minus;
  return (
    <li className={`flex flex-col gap-1.5 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${surface.ground}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        {/* The sign is a glyph and a word for assistive tech, never colour alone. */}
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${surface.strong}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            <span className="sr-only">{line.sign === 'up' ? 'Up: ' : line.sign === 'down' ? 'Down: ' : ''}</span>
            {line.statement}
          </p>
          {line.examples.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-tint-neutral-ink">
              {line.examples.join(' · ')}{line.count > line.examples.length ? ` · ${formatCount(line.count - line.examples.length)} more` : ''}
            </p>
          )}
          {line.unpricedCount > 0 && (
            <p className="mt-0.5 text-[11px] text-muted">
              {line.unpricedCount} {line.unpricedCount === 1 ? 'amount is' : 'amounts are'} in a currency without a rate and not in the total.
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-6 sm:pl-0">
        <span className="text-[11px] text-muted" title={PROVENANCE_LABEL[line.provenance]}>
          {PROVENANCE_LABEL[line.provenance]}
        </span>
        <Link to={line.href} className="text-[12.5px] font-semibold text-brand-blue-dark hover:underline">
          Open
        </Link>
      </div>
    </li>
  );
}

/**
 * Lead to pipeline, as seller learning.
 *
 * Not a marketing funnel: no campaigns, no attribution model, no conversion
 * goal. It answers the questions a seller can act on next week - how fast new
 * leads get a first touch, how many turn into real pipeline, which sources are
 * worth more time, and why the rest were dropped. Rates are withheld below
 * MIN_LEADS_FOR_RATE, and renders nothing at all for a workspace with no leads.
 */
export function LeadFunnelPanel() {
  const { loaded, sampleDataActive } = useReviewChangeRecords();

  const funnel = useMemo<LeadFunnel | null>(() => (loaded ? buildLeadFunnel({
    opportunities: loaded.workspace.opportunities,
    activities: loaded.workspace.activities,
    events: loaded.events,
    outcomes: loaded.workspace.opportunityOutcomes,
    includeSampleRecords: sampleDataActive,
  }) : null), [loaded, sampleDataActive]);

  if (!funnel || funnel.leads === 0) return null;

  // Each share names its base, because the steps are not a strict funnel: a
  // lead can be qualified on a conversation that was never captured, so
  // "qualified as a share of engaged" can read over 100%. And no share is
  // quoted on a base below MIN_LEADS_FOR_RATE - three leads is an anecdote.
  const share = (value: number, of: number, label: string) => (
    of >= MIN_LEADS_FOR_RATE ? `${Math.round((value / of) * 100)}% of ${label}` : ''
  );
  const steps: { label: string; value: number; note: string }[] = [
    { label: 'Leads', value: funnel.leads, note: '' },
    { label: 'Engaged', value: funnel.engaged, note: share(funnel.engaged, funnel.leads, 'leads') },
    { label: 'Qualified', value: funnel.qualified, note: share(funnel.qualified, funnel.leads, 'leads') },
    { label: 'Won', value: funnel.won, note: share(funnel.won, funnel.qualified, 'qualified') },
  ];

  return (
    <Panel aria-labelledby="lead-funnel" className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="lead-funnel" className="font-display text-[19px] font-bold tracking-[-0.015em] text-ink">
          From lead to pipeline
        </h2>
        <Link to="/app/leads" className="text-[12.5px] font-semibold text-brand-blue-dark hover:underline">Open Leads</Link>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Every record the book can show started as a lead. {funnel.disqualified > 0 ? `${formatCount(funnel.disqualified)} disqualified.` : ''}
      </p>

      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step) => (
          <li key={step.label} className="rounded-2xl bg-tint-neutral-bg px-4 py-3">
            <MicroLabel>{step.label}</MicroLabel>
            <p className="mt-1 font-display text-[22px] font-extrabold leading-none tracking-[-0.02em] text-ink">
              {formatCount(step.value)}
            </p>
            {step.note && <p className="mt-1 text-[11px] text-muted">{step.note}</p>}
          </li>
        ))}
      </ol>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Median days to first touch</dt>
          <dd className="font-semibold text-ink">{funnel.medianDaysToFirstTouch ?? 'Not enough touches yet'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Median days to qualify</dt>
          <dd className="font-semibold text-ink">{funnel.medianDaysToQualify ?? 'None qualified yet'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Lead to qualified</dt>
          <dd className="font-semibold text-ink">
            {funnel.qualifiedRate === null
              ? `Needs ${MIN_LEADS_FOR_RATE} leads to call it a rate`
              : `${Math.round(funnel.qualifiedRate * 100)}%`}
          </dd>
        </div>
      </dl>

      {funnel.bySource.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="sr-only">Leads by source, and how many qualified</caption>
            <thead className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th scope="col" className="py-1.5 pr-3">Source</th>
                <th scope="col" className="py-1.5 pr-3 text-right">Leads</th>
                <th scope="col" className="py-1.5 pr-3 text-right">Qualified</th>
                <th scope="col" className="py-1.5 text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {funnel.bySource.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="py-2 pr-3 font-semibold text-ink">{row.label}</th>
                  <td className="py-2 pr-3 text-right font-mono text-xs">{formatCount(row.leads)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">{formatCount(row.qualified)}</td>
                  <td className="py-2 text-right text-xs text-tint-neutral-ink">
                    {row.qualifiedRate === null ? 'Too few' : `${Math.round(row.qualifiedRate * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {funnel.disqualifyReasons.length > 0 && (
        <div className="mt-4">
          <MicroLabel as="p">Why leads were dropped</MicroLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {funnel.disqualifyReasons.map((item) => (
              <MicroPill key={item.reason} tone="neutral" className="!normal-case !tracking-normal !text-[11.5px]">
                {item.reason} · {formatCount(item.count)}
              </MicroPill>
            ))}
          </div>
        </div>
      )}

      {funnel.notes.map((note) => (
        <p key={note} className="mt-3 text-[11.5px] leading-4 text-muted">{note}</p>
      ))}
    </Panel>
  );
}
