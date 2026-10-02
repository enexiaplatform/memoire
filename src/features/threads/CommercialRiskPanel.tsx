import { allocateAttention } from '../../domain/commercialKernel/attentionBudget';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackProductEvent } from '../../utils/productAnalytics';
import { AlertTriangle, Info } from 'lucide-react';
import type { Severity } from '../../domain/commercialKernel/policyEngine';
import type { RankedRecommendation } from '../../domain/commercialKernel/rankRecommendations';
import { SavedByMemoirePrompt } from '../value/SavedByMemoirePrompt';

const severityTone: Record<Severity, string> = {
  critical: 'border-red-200 bg-red-50/60',
  high: 'border-amber-200 bg-amber-50/60',
  medium: 'border-line bg-white',
  low: 'border-line-soft bg-white',
};

/**
 * The three ordinal dimensions, in words.
 *
 * Shown so "why is this above that one" is answerable by reading two rows
 * rather than by trusting a number. The fourth dimension - the money - is
 * already a sentence in the rationale, with the real figure in it.
 */
const urgencyLabel: Record<RankedRecommendation['urgency'], string> = {
  now: 'the moment has passed',
  this_week: 'due this week',
  soon: 'on the horizon',
  whenever: 'no deadline',
};

const unblockingLabel: Record<RankedRecommendation['unblocking'], string> = {
  unblocks: 'unblocks the thread',
  advances: 'advances it',
  tidies: 'tidies the record',
};

const evidenceLabel: Record<RankedRecommendation['evidence'], string> = {
  specific: 'from a specific record',
  partial: 'from the history',
  absence_only: 'from something missing',
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
  attention = false,
  loadError = '',
}: {
  /**
   * Ranked by the kernel, and rendered in the order it hands them over. This
   * panel does not sort, weight or score - it draws the one order the product
   * has, so Today and Review cannot disagree about the same book.
   */
  recommendations: RankedRecommendation[];
  limit?: number;
  title?: string;
  attention?: boolean;
  loadError?: string;
}) {
  const [explaining, setExplaining] = useState('');
  const [capacity, setCapacity] = useState(3);
  const [selected, setSelected] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const budget = allocateAttention(recommendations, capacity, selected);

  // Measured once per mount, and only when there is something to see: the pair
  // that matters is risks shown against risks acted on, and counting empty
  // renders would make the ratio meaningless.
  const shown = recommendations.length;
  useEffect(() => {
    if (shown > 0) trackProductEvent('commercial_risk_viewed');
  }, [shown]);

  if (recommendations.length === 0 && !attention) {
    return (
      <section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm" aria-label={title}>
        <h2 className="text-sm font-bold text-ink">Nothing is going silent</h2>
        <p className="mt-1 text-xs leading-5 text-gray-600">
          Every commercial thread has a next commitment, and nothing is overdue.
        </p>
      </section>
    );
  }

  const included = new Set([...budget.chosen, ...budget.suggested].map(item => item.id));
  const visible = attention ? (showAll ? recommendations : recommendations.filter(item => included.has(item.id))) : recommendations.slice(0, limit);

  return (
    <section className="rounded-panel bg-white shadow-panel p-4" aria-label={title}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
          {recommendations.length}
        </span>
      </div>

      {loadError && <p role="alert" className="mt-2 text-sm text-tint-amber-ink">{loadError}</p>}
      {attention && <div className="mt-3 space-y-2 text-sm text-muted">
        <p>Choose what you have room to review. Selection lasts while this panel is open and does not assign, schedule or complete work.</p>
        <label className="flex items-center gap-2">Attention budget
          <select aria-label="Attention budget" value={capacity} onChange={event => setCapacity(Number(event.target.value))} className="rounded-lg border border-line bg-white p-2 text-ink">
            {[0,1,2,3,5,10,20].map(value => <option key={value} value={value}>{value} items</option>)}
          </select>
        </label>
        <p aria-live="polite">{budget.chosen.length} chosen · {budget.suggested.length} suggested · {budget.outside.length} outside this budget</p>
        {budget.overCapacity > 0 && <p role="alert">Your choices exceed the budget by {budget.overCapacity}. Remove a choice or increase your budget.</p>}
        {budget.unavailableIds.length > 0 && <p role="status">{budget.unavailableIds.length} earlier choices are no longer in the current reading. No completion is implied.</p>}
        <details><summary className="cursor-pointer text-brand-blue">How the order works</summary><p>Urgency, then unblocking, then evidence, then recorded value. Dates break remaining ties. An open incident without its own due date gets no invented deadline. Suggestions are never selected for you.</p></details>
        <button type="button" className="font-semibold text-brand-blue" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show this budget' : 'Review all candidates'}</button>
        {recommendations.length === 0 && <p>No review candidates in the loaded records.</p>}
      </div>}
      <ul className="mt-3 space-y-2">
        {visible.map((item) => (
          <li key={item.id} className={`rounded-lg border p-3 ${severityTone[item.severity]}`}>
            {attention && <label className="mb-2 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={budget.chosen.some(row => row.id === item.id)}
              onChange={event => setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />Choose for this review: {item.candidateAction || item.recommendedAction}</label>}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm leading-5 text-gray-900">{item.reasonText}</p>
              <div className="flex shrink-0 items-center gap-1.5">
                {/* Said once, on the one it applies to. A list where every row
                    is labelled is a list with no first row. */}
                {item.rank === 1 && (
                  <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    {item.question ? 'Next question' : 'Best move'}
                  </span>
                )}
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 ring-1 ring-gray-200">
                  {severityLabel[item.severity]}
                </span>
              </div>
            </div>

            {item.question && <p className="mt-2 text-sm font-semibold text-ink">{item.question}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Link
                to={item.href}
                onClick={() => trackProductEvent('commercial_risk_acted_on')}
                className="text-xs font-bold text-brand-blue hover:underline"
              >
                {item.candidateAction || item.recommendedAction}
              </Link>
              <button
                type="button"
                onClick={() => setExplaining(explaining === item.id ? '' : item.id)}
                className="inline-flex min-h-[24px] items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800"
              >
                <Info className="h-3 w-3" />
                Why am I seeing this?
              </button>
              {item.reasonCode !== 'OUTCOME_REQUIREMENT_QUESTION' && item.reasonCode !== 'INCIDENT_RESPONSE_OPEN' && <SavedByMemoirePrompt recommendation={item} />}
            </div>

            {explaining === item.id && (
              <dl className="mt-2 rounded-lg bg-white/70 p-2 text-[11px] leading-5 text-gray-600 ring-1 ring-gray-100">
                {/* Why it sits where it sits, in sentences. There is no score to
                    show, because the order is decided by named dimensions in a
                    fixed precedence rather than by a weighted total. */}
                <div className="mb-1.5">
                  <dt className="font-bold text-gray-500">
                    {item.rank === 1 ? 'Why this is first:' : `Why this is #${item.rank}:`}
                  </dt>
                  <dd>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                      {item.rationale.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-bold text-gray-500">Weighed as:</dt>
                  <dd>
                    {urgencyLabel[item.urgency]} · {unblockingLabel[item.unblocking]} · {evidenceLabel[item.evidence]}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-bold text-gray-500">Rule:</dt>
                  <dd><code>{item.reasonCode}</code></dd>
                </div>
                {item.requirementId && <div className="flex gap-2"><dt className="font-bold text-gray-500">Requirement:</dt><dd>{item.requirementId} · {item.requirementRole?.replaceAll('_',' ')} · {item.conditionState}</dd></div>}
                <div className="flex gap-2">
                  <dt className="font-bold text-gray-500">Threshold:</dt>
                  <dd>{item.reasonCode === 'OUTCOME_REQUIREMENT_QUESTION' ? 'Explicitly marked required now' : item.threshold}</dd>
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

      {!attention && recommendations.length > visible.length && (
        <p className="mt-2 text-[11px] text-gray-400">
          +{recommendations.length - visible.length} more, in Review.
        </p>
      )}
    </section>
  );
}
