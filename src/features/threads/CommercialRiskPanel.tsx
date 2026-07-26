import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackProductEvent } from '../../utils/productAnalytics';
import { AlertTriangle, Info } from 'lucide-react';
import type { Recommendation, Severity } from '../../domain/commercialKernel/policyEngine';
import { SavedByMemoirePrompt } from '../value/SavedByMemoirePrompt';

const severityTone: Record<Severity, string> = {
  critical: 'border-red-200 bg-red-50/60',
  high: 'border-amber-200 bg-amber-50/60',
  medium: 'border-gray-200 bg-white',
  low: 'border-gray-100 bg-white',
};

const severityLabel: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Watch',
  low: 'Minor',
};

/**
 * What is going silent, and why Memoire thinks so.
 *
 * Every row shows the reason in words before it shows the action, and the
 * threshold behind that reason is one click away. A seller who cannot check a
 * recommendation stops trusting the product the first time one is wrong -
 * and the first time is guaranteed, because the thresholds are defaults, not
 * facts about their business.
 */
export function CommercialRiskPanel({
  recommendations,
  limit = 5,
  title = 'Going silent',
}: {
  recommendations: Recommendation[];
  limit?: number;
  title?: string;
}) {
  const [explaining, setExplaining] = useState('');

  // Measured once per mount, and only when there is something to see: the pair
  // that matters is risks shown against risks acted on, and counting empty
  // renders would make the ratio meaningless.
  const shown = recommendations.length;
  useEffect(() => {
    if (shown > 0) trackProductEvent('commercial_risk_viewed');
  }, [shown]);

  if (recommendations.length === 0) {
    return (
      <section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm" aria-label={title}>
        <h2 className="text-sm font-bold text-navy">Nothing is going silent</h2>
        <p className="mt-1 text-xs leading-5 text-gray-600">
          Every commercial thread has a next commitment, and nothing is overdue.
        </p>
      </section>
    );
  }

  const visible = recommendations.slice(0, limit);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label={title}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-bold text-navy">{title}</h2>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
          {recommendations.length}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {visible.map((item) => (
          <li key={item.id} className={`rounded-lg border p-3 ${severityTone[item.severity]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm leading-5 text-gray-900">{item.reasonText}</p>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 ring-1 ring-gray-200">
                {severityLabel[item.severity]}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Link
                to={item.href}
                onClick={() => trackProductEvent('commercial_risk_acted_on')}
                className="text-xs font-bold text-brand-blue hover:underline"
              >
                {item.recommendedAction}
              </Link>
              <button
                type="button"
                onClick={() => setExplaining(explaining === item.id ? '' : item.id)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800"
              >
                <Info className="h-3 w-3" />
                Why am I seeing this?
              </button>
              <SavedByMemoirePrompt recommendation={item} />
            </div>

            {explaining === item.id && (
              <dl className="mt-2 rounded-lg bg-white/70 p-2 text-[11px] leading-5 text-gray-600 ring-1 ring-gray-100">
                <div className="flex gap-2">
                  <dt className="font-bold text-gray-500">Rule:</dt>
                  <dd><code>{item.reasonCode}</code></dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-bold text-gray-500">Threshold:</dt>
                  <dd>{item.threshold}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-bold text-gray-500">From records:</dt>
                  <dd className="truncate" title={item.sourceRecordIds.join(', ')}>
                    {item.sourceRecordIds.join(', ')}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-bold text-gray-500">Calculated:</dt>
                  <dd>{new Date(item.calculatedAt).toLocaleString()}</dd>
                </div>
                <p className="mt-1 text-gray-400">
                  Computed on your device from your own records. No AI service was involved, and nothing was changed.
                </p>
              </dl>
            )}
          </li>
        ))}
      </ul>

      {recommendations.length > visible.length && (
        <p className="mt-2 text-[11px] text-gray-400">
          +{recommendations.length - visible.length} more, in Review.
        </p>
      )}
    </section>
  );
}
