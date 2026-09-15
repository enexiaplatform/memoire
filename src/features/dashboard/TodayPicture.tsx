import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Clock3, TrendingUp } from 'lucide-react';
import { formatCompactBaseAmount } from '../../utils/money';
import { formatCount } from '../../utils/numberFormat';
import { Panel } from '../../components/ui/daylight';
import { delay } from '../../components/ui/daylightStyles';
import { moneyViewHref } from '../revenue/moneyViews';
import type {
  TodayCashPicture,
  TodayMoneyInMotion,
  TodayPipelinePicture,
  TodayPromisesPicture,
  TodaySilencePicture,
} from '../../utils/todayPicture';

/**
 * The four numbers Today opens on, in the Daylight card anatomy: a tinted icon
 * tile and a label, the figure, one small drawing of the figure, and the single
 * comparison worth reading. Every card is a link to the surface that owns its
 * number, so the figure is never a dead end.
 */
export function TodayMetricCards({
  pipeline,
  silence,
  cash,
  promises,
}: {
  pipeline: TodayPipelinePicture;
  silence: TodaySilencePicture;
  /** Null while the order book is still loading - the card waits rather than reading zero. */
  cash: TodayCashPicture | null;
  promises: TodayPromisesPicture;
}) {
  return (
    <section aria-label="The picture" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        index={0}
        href="/app/opportunities"
        icon={<TrendingUp className="h-[15px] w-[15px]" strokeWidth={2.1} />}
        iconTone="bg-[#EEF2FF] text-spectrum-indigo"
        label="Open pipeline"
        figure={<CompactFigure text={formatCompactBaseAmount(pipeline.openBase)} className="text-ink" />}
        viz={<StageColumns pipeline={pipeline} />}
        caption={(
          <>
            {formatCount(pipeline.dealCount)} {pipeline.dealCount === 1 ? 'deal' : 'deals'}
            {pipeline.advancedBase > 0 && (
              <> · <span className="font-semibold text-tint-neutral-ink">{formatCompactBaseAmount(pipeline.advancedBase)}</span> at Proposal or later</>
            )}
            {pipeline.unpricedCount > 0 && <> · {formatCount(pipeline.unpricedCount)} unpriced</>}
          </>
        )}
      />
      <MetricCard
        index={1}
        href={silence.quietestOpportunityId
          ? `/app/opportunities?opportunityId=${encodeURIComponent(silence.quietestOpportunityId)}`
          : '/app/opportunities'}
        icon={<Clock3 className="h-[15px] w-[15px]" strokeWidth={2.1} />}
        iconTone="bg-tint-amber-bg text-tint-amber-solid"
        label="Going silent"
        figure={(
          <span className="flex items-baseline gap-2">
            <span className={silence.silentCount > 0 ? 'text-tint-amber-solid' : 'text-tint-green-solid'}>{formatCount(silence.silentCount)}</span>
            <span className="font-body text-[13px] font-normal tracking-normal text-muted">{silence.silentCount === 1 ? 'deal' : 'deals'}</span>
          </span>
        )}
        viz={<SilenceBars silence={silence} />}
        caption={silence.silentCount > 0
          ? <>Quiet {silence.alarmDays}+ days · {formatCompactBaseAmount(silence.atStakeBase)} at stake{silence.atRiskCount > 0 && <> · {formatCount(silence.atRiskCount)} more at risk</>}</>
          : silence.atRiskCount > 0
            ? <>{formatCount(silence.atRiskCount)} quiet {silence.warningDays}+ days, none past {silence.alarmDays}</>
            : <>Nothing quiet for {silence.warningDays}+ days</>}
      />
      <MetricCard
        index={2}
        href={cash?.worst
          ? `${moneyViewHref('collections')}&orderId=${encodeURIComponent(cash.worst.opportunityId)}`
          : moneyViewHref('collections')}
        icon={<AlertTriangle className="h-[15px] w-[15px]" strokeWidth={2.1} />}
        iconTone="bg-tint-red-bg text-tint-red-solid"
        label="Overdue cash"
        figure={cash
          ? <CompactFigure text={formatCompactBaseAmount(cash.overdueBase)} className={cash.overdueBase > 0 ? 'text-tint-red-solid' : 'text-tint-green-solid'} />
          : <span className="text-muted">…</span>}
        viz={cash ? <AgingBar cash={cash} /> : <span className="mt-4 block h-2 rounded-full bg-track" />}
        caption={!cash
          ? 'Reading the order book'
          : cash.overdueOrderCount > 0
            ? <>{formatCount(cash.overdueOrderCount)} {cash.overdueOrderCount === 1 ? 'order' : 'orders'} late{cash.oldestDaysOverdue !== null && <> · oldest <span className="font-semibold text-tint-red-solid">{formatCount(cash.oldestDaysOverdue)} days</span></>}</>
            : cash.outstandingBase > 0
              ? <>Nothing late · {formatCompactBaseAmount(cash.outstandingBase)} still to come</>
              : 'Nothing owed to you right now'}
      />
      <MetricCard
        index={3}
        href="/app/timeline?view=upcoming"
        icon={<Check className="h-[15px] w-[15px]" strokeWidth={2.5} />}
        iconTone="bg-[#E8F8F0] text-tint-green-solid"
        label="Promises kept"
        figure={(
          <span className="flex items-baseline gap-[7px]">
            <span className="text-tint-green-solid">{formatCount(promises.done)}</span>
            <span className="text-[18px] font-bold tracking-normal text-muted">/ {formatCount(promises.total)}</span>
          </span>
        )}
        viz={(
          <span className="mt-[18px] block h-2 overflow-hidden rounded-full bg-track" role="img" aria-label={`${promises.percent ?? 0}% of this week's plan done`}>
            <span
              className="block h-full origin-left animate-grow-h rounded-full bg-[linear-gradient(90deg,#43A047,#00ACC1)]"
              style={{ width: `${promises.percent ?? 0}%`, ...delay(500) }}
            />
          </span>
        )}
        caption={promises.total === 0
          ? 'Nothing planned this week yet'
          : <>{promises.percent}% of this week done{promises.overdueOpen > 0 && <> · <span className="font-semibold text-tint-red-solid">{formatCount(promises.overdueOpen)} overdue</span></>}</>}
      />
    </section>
  );
}

function MetricCard({
  index,
  href,
  icon,
  iconTone,
  label,
  figure,
  viz,
  caption,
}: {
  index: number;
  href: string;
  icon: ReactNode;
  iconTone: string;
  label: string;
  figure: ReactNode;
  viz: ReactNode;
  caption: ReactNode;
}) {
  return (
    <Link
      to={href}
      className="group block min-w-0 animate-rise rounded-tile bg-white px-5 py-[18px] shadow-lift transition duration-200 hover:-translate-y-[3px] hover:shadow-lift-hi focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
      style={delay(40 + index * 50)}
    >
      <span className="flex items-center gap-[9px]">
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] ${iconTone}`}>{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.11em] text-muted">{label}</span>
      </span>
      <span className="mt-3.5 block truncate font-display text-[30px] font-extrabold leading-none tracking-[-0.03em] sm:text-[34px]">
        {figure}
      </span>
      {viz}
      <span className="mt-2 block text-xs leading-5 text-muted">{caption}</span>
    </Link>
  );
}

/** "4.5M VND" as a figure with its currency set smaller beside it. */
function CompactFigure({ text, className }: { text: string; className: string }) {
  const at = text.lastIndexOf(' ');
  if (at === -1) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, at)}
      <span className="ml-1.5 font-body text-[13px] font-semibold tracking-normal text-muted">{text.slice(at + 1)}</span>
    </span>
  );
}

const stageInk = ['#C5CAE9', '#9FA8DA', '#7986CB', '#5C6BC0', '#3F51B5', '#3949AB', '#303F9F', '#283593'];

/** Where the open value sits, one column per stage that holds a deal. */
function StageColumns({ pipeline }: { pipeline: TodayPipelinePicture }) {
  const max = pipeline.stages.reduce((top, slice) => Math.max(top, slice.base), 0);
  if (pipeline.stages.length === 0) return <span className="mt-3 block h-[30px] rounded-lg bg-track" />;
  return (
    <span
      role="img"
      aria-label={pipeline.stages.map((slice) => `${slice.stage}: ${formatCompactBaseAmount(slice.base)}, ${slice.count} ${slice.count === 1 ? 'deal' : 'deals'}`).join('; ')}
      className="mt-3 flex h-[30px] items-end gap-[3px]"
    >
      {pipeline.stages.map((slice, index) => (
        <span
          key={slice.stage}
          title={`${slice.stage} · ${formatCompactBaseAmount(slice.base)} · ${slice.count} ${slice.count === 1 ? 'deal' : 'deals'}`}
          className="flex-1 origin-bottom animate-grow-v rounded-[4px]"
          style={{
            height: `${max > 0 ? Math.max(12, (slice.base / max) * 100) : 12}%`,
            background: stageInk[Math.min(stageInk.length - 1, Math.round((index / Math.max(1, pipeline.stages.length - 1)) * (stageInk.length - 1)))],
            ...delay(350 + index * 50),
          }}
        />
      ))}
    </span>
  );
}

const silenceInk = ['#FDE9B8', '#F9C86B', '#F2AB45', '#E8891A', '#B45309'];

/** How long the quiet deals have been quiet, shortest wait on the left. */
function SilenceBars({ silence }: { silence: TodaySilencePicture }) {
  const max = silence.buckets.reduce((top, bucket) => Math.max(top, bucket.count), 0);
  return (
    <span
      role="img"
      aria-label={silence.buckets.map((bucket) => `${bucket.label}: ${bucket.count}`).join('; ')}
      className="mt-3 flex h-[30px] items-end gap-[5px]"
    >
      {silence.buckets.map((bucket, index) => (
        <span
          key={bucket.label}
          title={`Quiet ${bucket.label} · ${bucket.count} ${bucket.count === 1 ? 'deal' : 'deals'}`}
          className={`flex-1 origin-bottom animate-grow-v rounded-[4px] ${bucket.count === 0 ? 'bg-track' : ''}`}
          style={{
            height: `${bucket.count === 0 || max === 0 ? 20 : Math.max(28, (bucket.count / max) * 100)}%`,
            background: bucket.count === 0 ? undefined : silenceInk[index],
            ...delay(350 + index * 50),
          }}
        />
      ))}
    </span>
  );
}

const agingInk: Record<TodayCashPicture['segments'][number]['key'], string> = {
  'not-due': 'bg-track',
  '1-30': 'bg-[#F6B4B4]',
  '31-60': 'bg-[#E57373]',
  '61+': 'bg-[#C62828]',
};

/** Outstanding money by lateness. A card with nothing late is one grey track. */
function AgingBar({ cash }: { cash: TodayCashPicture }) {
  const total = cash.segments.reduce((sum, segment) => sum + segment.base, 0);
  if (total <= 0) return <span className="mt-4 block h-2 rounded-full bg-track" />;
  return (
    <span
      role="img"
      aria-label={cash.segments.map((segment) => `${segment.label}: ${formatCompactBaseAmount(segment.base)}`).join('; ')}
      className="mt-4 flex h-2 gap-1"
    >
      {cash.segments.filter((segment) => segment.base > 0).map((segment, index) => (
        <span
          key={segment.key}
          title={`${segment.label} · ${formatCompactBaseAmount(segment.base)}`}
          className={`h-full origin-left animate-grow-h rounded-full ${agingInk[segment.key]}`}
          style={{ flexGrow: segment.base / total, flexBasis: 0, minWidth: 6, ...delay(450 + index * 100) }}
        />
      ))}
    </span>
  );
}

const laneInk: Record<string, string> = {
  Quoted: 'bg-spectrum-indigo',
  'Pending PO': 'bg-brand-blue',
  'Pending delivery': 'bg-spectrum-cyan',
  'Pending payment': 'bg-tint-amber-solid',
  Paid: 'bg-spectrum-green',
};

/**
 * Where quoted money sits right now, lane by lane - the same lanes Money >
 * Orders draws, and the first stuck thread named with its own reason.
 *
 * Every bar is measured against the widest lane, not against Quoted. The lanes
 * are where each thread *is*, not how far a cohort got, so a funnel scale would
 * draw Paid as a share of something it never passed through.
 */
export function MoneyInMotionPanel({ motion }: { motion: TodayMoneyInMotion }) {
  return (
    <Panel className="animate-rise px-[22px] py-5" style={delay(320)} aria-label="Money in motion">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold text-ink">Money in motion</h2>
        <Link to={moneyViewHref('orders')} data-quick-look-exempt="true" className="text-xs font-semibold text-brand-blue hover:underline">
          Open orders
        </Link>
      </div>
      {!motion.hasAny ? (
        <p className="mt-3 text-[13px] leading-6 text-muted">
          No quote is out yet. Money shows up here from the moment one is sent.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-[11px]">
          {motion.lanes.map((lane, index) => (
            <li key={lane.stage}>
              <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className={lane.stuckThreads > 0 ? 'font-semibold text-tint-amber-solid' : 'text-tint-neutral-ink'}>
                  {lane.stage}
                  {lane.stuckThreads > 0 && ` · ${formatCount(lane.stuckThreads)} stuck`}
                </span>
                <span className="font-mono text-[13px] font-bold text-ink">
                  {lane.threads > 0 ? formatCompactBaseAmount(lane.totalBase) : '—'}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-track">
                <div
                  className={`h-full origin-left animate-grow-h rounded-full ${laneInk[lane.stage] || 'bg-brand-blue'}`}
                  style={{
                    width: `${motion.maxBase > 0 ? (lane.totalBase / motion.maxBase) * 100 : 0}%`,
                    ...delay(450 + index * 100),
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {motion.worstStuck && (
        <p className="mt-4 flex items-start gap-2.5 rounded-[13px] bg-tint-red-bg px-3.5 py-3 text-[12.5px] leading-5 text-tint-red-ink">
          <AlertTriangle className="mt-0.5 h-[15px] w-[15px] shrink-0 text-tint-red-solid" strokeWidth={2.1} />
          <span>
            <strong className="font-bold">{motion.worstStuck.stuckReason}</strong>
            {' — '}{motion.worstStuck.accountName} · {motion.worstStuck.label}
          </span>
        </p>
      )}
    </Panel>
  );
}
