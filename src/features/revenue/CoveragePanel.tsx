import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target as TargetIcon, TrendingDown } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { formatCompactBaseAmount } from '../../utils/money';
import { setCommercialTarget } from '../../domain/commercialKernel/commands';
import { FORECAST_QUARTERS, type ForecastQuarter, type QuarterCoverage } from '../../domain/commercialKernel/forecast';
import { useCoverage } from './useCoverage';

/**
 * Coverage: am I going to make the number, and is there still time?
 *
 * Deliberately not a spreadsheet. A grid of every quarter against every product
 * line is a report - you read it once a month and it tells you what already
 * happened. This leads with the quarter that is running, the days left in it,
 * and the one number that matters: how far short you are. The other quarters
 * are a strip underneath, because they are context, not the decision.
 *
 * The second block is the part a spreadsheet cannot do at all: the difference
 * between the forecast as declared and the forecast the evidence still
 * supports. That gap is what gets challenged in a review, so it is shown before
 * anyone has to challenge it.
 */
export function CoveragePanel() {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const { coverage, targets, reload } = useCoverage();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');

  const fiscalYear = useMemo(() => new Date().getFullYear(), []);
  const current = coverage.quarters.find((quarter) => quarter.isCurrent);

  const scope = { userId: sampleDataActive ? null : user?.id || null, sampleDataActive };

  const saveTargets = (values: Record<ForecastQuarter, string>) => {
    let saved = 0;
    for (const quarter of FORECAST_QUARTERS) {
      const raw = values[quarter].trim();
      if (!raw) continue;
      const amount = Number(raw.replace(/[,\s]/g, ''));
      if (!Number.isFinite(amount)) continue;

      const result = setCommercialTarget(scope, { period: quarter, fiscalYear, amount });
      if (result.ok) saved += 1;
      else setMessage(result.error);
    }
    if (saved > 0) {
      setMessage(`${saved} target${saved === 1 ? '' : 's'} saved. Changes are recorded, so a mid-year revision stays visible.`);
      setEditing(false);
      reload();
    }
  };

  if (!coverage.hasTargets && !editing) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-white p-5 shadow-sm" aria-label="Coverage">
        <div className="flex items-center gap-2">
          <TargetIcon className="h-4 w-4 text-brand-blue" />
          <h2 className="text-lg font-bold text-navy">Set your quarterly target</h2>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          Memoire already knows what is in your pipeline and which quarter each deal lands in. Give it the number you are
          measured against and it can answer the question that actually matters: are you going to make it, and is there
          still time to change the answer.
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-4 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
        >
          Set targets
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Coverage">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <TargetIcon className="h-4 w-4 text-brand-blue" />
          <h2 className="text-lg font-bold text-navy">Coverage</h2>
        </div>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
        >
          {editing ? 'Cancel' : 'Edit targets'}
        </button>
      </div>

      {message && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{message}</p>
      )}

      {editing && (
        <TargetEditor
          fiscalYear={fiscalYear}
          initial={Object.fromEntries(FORECAST_QUARTERS.map((quarter) => [
            quarter,
            String(targets.find((target) => target.period === quarter)?.amount ?? ''),
          ])) as Record<ForecastQuarter, string>}
          onSave={saveTargets}
        />
      )}

      {current && current.target > 0 && <CurrentQuarterHeadline quarter={current} />}

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {coverage.quarters.map((quarter) => (
          <QuarterCard key={quarter.quarter} quarter={quarter} />
        ))}
      </div>

      {coverage.unsupportedValue > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-amber-700" />
            <h3 className="text-sm font-bold text-navy">
              {formatCompactBaseAmount(coverage.unsupportedValue)} of forecast the evidence does not support
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-gray-600">
            These are marked down from the probability you declared, because nothing in the record backs it up any more.
            Memoire never marks a deal <em>up</em> - that judgement is yours.
          </p>
          <ul className="mt-3 space-y-1.5">
            {coverage.unsupportedDeals.map((deal) => (
              <li key={deal.opportunityId} className="flex flex-wrap items-baseline gap-x-2 text-xs leading-5">
                <Link
                  to={`/app/opportunities?opportunityId=${encodeURIComponent(deal.opportunityId)}`}
                  className="font-bold text-brand-blue hover:underline"
                >
                  {deal.accountName}
                </Link>
                <span className="text-gray-500">{deal.opportunityName}</span>
                <span className="font-semibold text-amber-800">
                  {deal.declared}% → {deal.supported}%
                </span>
                <span className="text-gray-400">({deal.reasons.join('; ')})</span>
                <span className="ml-auto font-bold text-gray-700">
                  −{formatCompactBaseAmount(deal.valueAtRisk)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CurrentQuarterHeadline({ quarter }: { quarter: QuarterCoverage }) {
  const percent = quarter.coverage === null ? 0 : Math.round(quarter.coverage * 100);
  const short = quarter.gap > 0;
  const days = quarter.daysLeft ?? 0;

  return (
    <div className={`mt-4 rounded-lg p-4 ${short ? 'bg-red-50/70 ring-1 ring-red-100' : 'bg-emerald-50/70 ring-1 ring-emerald-100'}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
        {quarter.quarter} · {days} day{days === 1 ? '' : 's'} left
      </p>
      <p className="mt-1 text-2xl font-black text-navy">
        {short
          ? `Short by ${formatCompactBaseAmount(quarter.gap)}`
          : `Covered — ${formatCompactBaseAmount(-quarter.gap)} clear`}
      </p>
      <p className="mt-1 text-sm leading-6 text-gray-600">
        {formatCompactBaseAmount(quarter.committed)} won plus {formatCompactBaseAmount(quarter.weightedSupported)}{' '}
        evidence-backed, against a {formatCompactBaseAmount(quarter.target)} target ({percent}%).
        {short && days >= 14 && ' There is still time to change this.'}
        {short && days < 14 && ' Too late for new pipeline to land - decide what you are telling the business.'}
      </p>
    </div>
  );
}

function QuarterCard({ quarter }: { quarter: QuarterCoverage }) {
  const percent = quarter.coverage === null ? null : Math.round(quarter.coverage * 100);
  const tone = percent === null
    ? 'border-gray-200'
    : percent >= 100 ? 'border-emerald-200 bg-emerald-50/40'
      : percent >= 80 ? 'border-gray-200'
        : 'border-amber-200 bg-amber-50/40';

  return (
    <div className={`rounded-lg border p-3 ${tone} ${quarter.isCurrent ? 'ring-2 ring-brand-blue/30' : ''}`}>
      <p className="flex items-baseline justify-between text-xs font-bold text-navy">
        {quarter.quarter}
        {percent !== null && <span className="text-gray-500">{percent}%</span>}
      </p>
      <p className="mt-1 text-sm font-bold text-navy">
        {quarter.target > 0 ? formatCompactBaseAmount(quarter.target) : 'No target'}
      </p>
      <dl className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-gray-500">
        <div className="flex justify-between gap-2">
          <dt>Won</dt>
          <dd className="font-semibold text-gray-700">{formatCompactBaseAmount(quarter.committed)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Weighted</dt>
          <dd className="font-semibold text-gray-700">{formatCompactBaseAmount(quarter.weightedSupported)}</dd>
        </div>
        {/* Shown only where the two disagree, so a healthy quarter stays quiet. */}
        {Math.round(quarter.weightedDeclared) !== Math.round(quarter.weightedSupported) && (
          <div className="flex justify-between gap-2 text-amber-700">
            <dt>Declared</dt>
            <dd className="font-semibold">{formatCompactBaseAmount(quarter.weightedDeclared)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function TargetEditor({
  fiscalYear,
  initial,
  onSave,
}: {
  fiscalYear: number;
  initial: Record<ForecastQuarter, string>;
  onSave: (values: Record<ForecastQuarter, string>) => void;
}) {
  const [values, setValues] = useState(initial);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Targets for FY{fiscalYear}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {FORECAST_QUARTERS.map((quarter) => (
          <label key={quarter} className="block">
            <span className="text-xs font-bold text-navy">{quarter}</span>
            <input
              type="text"
              inputMode="numeric"
              value={values[quarter]}
              onChange={(event) => setValues((current) => ({ ...current, [quarter]: event.target.value }))}
              placeholder="0"
              aria-label={`${quarter} target`}
              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSave(values)}
        className="mt-3 rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white hover:bg-navy/90"
      >
        Save targets
      </button>
      <p className="mt-2 text-[11px] leading-4 text-gray-400">
        A target that moves is recorded as a change, not overwritten - so &quot;I was raised mid-quarter&quot; stays
        answerable later.
      </p>
    </div>
  );
}
