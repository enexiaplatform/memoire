import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Route } from 'lucide-react';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { OpportunityOutcomeRecord } from '../../services/opportunityOutcomeStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import { buildCoverageMatrix } from '../../utils/coverageMatrix';
import { buildOperatorProfile } from '../../utils/operatorProfile';
import { buildTargetPlan, joinWords } from '../../utils/targetPlan';
import { formatCompactBaseAmount } from '../../utils/money';
import { useCoverage } from './useCoverage';

/**
 * Coverage says how far short the quarter is. This says what that shortfall
 * asks of the week, using the seller's own win rate, deal size and sales cycle
 * rather than anybody's benchmark.
 *
 * It sits directly under Coverage because it is the second half of the same
 * sentence, and because the honest answer is sometimes "not from new deals" -
 * which is a thing a seller should read next to the number, not on a separate
 * page they would visit after deciding to prospect.
 */
export function TargetPlanPanel({
  opportunities,
  quotes,
  activities,
  opportunityOutcomes,
}: {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  activities: SalesActivityRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
}) {
  const { coverage } = useCoverage();

  const plan = useMemo(() => {
    const profile = buildOperatorProfile({ opportunities, opportunityOutcomes, activities, quotes });
    const matrix = buildCoverageMatrix({ opportunities });
    return buildTargetPlan({
      quarter: coverage.quarters.find((entry) => entry.isCurrent),
      economics: profile.economics,
      unsupportedValueBase: coverage.unsupportedValue,
      unsupportedDealCount: coverage.unsupportedDeals.length,
      whitespace: matrix.hasEnoughBrands ? matrix.gaps : [],
    });
  }, [coverage, opportunities, opportunityOutcomes, activities, quotes]);

  // Coverage already owns the "set a target" invitation. A second copy of it
  // here would be the same empty state twice on one page.
  if (!plan.hasTarget) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="What the number asks of you">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-brand-blue" />
          <h2 className="text-lg font-bold text-navy">What the number asks of you</h2>
        </div>
        <p className="text-[11px] font-semibold text-gray-400">Your rates, not a benchmark</p>
      </div>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">{plan.reading}</p>

      {plan.gap > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <RequirementTile
            label="Wins needed"
            value={plan.winsNeeded === null ? null : String(plan.winsNeeded)}
            hint="deals that must close Won"
          />
          <RequirementTile
            label="Pipeline needed"
            value={plan.pipelineNeededBase === null ? null : formatCompactBaseAmount(plan.pipelineNeededBase)}
            hint="at your own win rate"
          />
          <RequirementTile
            label="Deals in play"
            value={plan.dealsNeeded === null ? null : String(plan.dealsNeeded)}
            hint={plan.dealsPerWeek === null ? 'at your median deal size' : `about ${plan.dealsPerWeek} a week`}
          />
          <RequirementTile
            label="Quotes to issue"
            value={plan.quotesNeeded === null ? null : String(plan.quotesNeeded)}
            hint={plan.quotesPerWeek === null ? 'needs your quote conversion' : `about ${plan.quotesPerWeek} a week`}
          />
        </div>
      )}

      {plan.tooLateForNewPipeline && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-semibold leading-6 text-amber-900">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The quarter is now shorter than one of your deals. Prospecting from here builds next quarter - this one has
            to come out of the deals already in it.
          </span>
        </p>
      )}

      {plan.routes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {plan.routes.map((route) => (
            <li key={route.id} className="rounded-lg border border-gray-200 bg-gray-50/60 px-3.5 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link to={route.href} className="inline-flex items-center gap-1.5 text-sm font-bold text-navy hover:text-brand-blue">
                  {route.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                {route.valueBase !== null && (
                  <span className="text-xs font-bold text-gray-500">{formatCompactBaseAmount(route.valueBase)}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-5 text-gray-600">{route.detail}</p>
            </li>
          ))}
        </ul>
      )}

      {plan.missing.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-gray-500">
          Some of this is still blank because Memoire does not know {joinWords(plan.missing)} yet. Record the outcome of
          each deal you close and the missing numbers fill in on their own -{' '}
          <Link to="/app/reviews?view=analytics" className="font-bold text-brand-blue hover:underline">
            see what is still needed
          </Link>
          .
        </p>
      )}
    </section>
  );
}

function RequirementTile({ label, value, hint }: { label: string; value: string | null; hint: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${value === null ? 'text-gray-300' : 'text-navy'}`}>{value ?? '—'}</p>
      <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>
    </div>
  );
}
