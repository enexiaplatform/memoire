import { Link } from 'react-router-dom';
import type { ForecastDefensibility } from '../../domain/commercialKernel/deriveForecastDefensibility';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';

const verdictText:Record<ForecastDefensibility['verdict'],string>={no_claim:'No dated claim',insufficient_basis:'No required-now basis',
  defensible:'Supported within recorded scope',conditional:'Conditional',incomplete:'Incomplete',
  not_currently_supported:'Not currently supported'};
const order:Record<ForecastDefensibility['verdict'],number>={not_currently_supported:0,insufficient_basis:1,incomplete:2,conditional:3,defensible:4,no_claim:5};

export function ForecastDefensibilityReview({views,opportunities}:{views:Map<string,ForecastDefensibility>;opportunities:CrmLiteOpportunity[]}){
  const byId=new Map(opportunities.map(o=>[o.id,o]));
  const claims=[...views.values()].filter(v=>v.claim).sort((a,b)=>order[a.verdict]-order[b.verdict]
    ||a.claim!.targetDate.localeCompare(b.claim!.targetDate)||a.opportunityId.localeCompare(b.opportunityId));
  const exceptions=claims.filter(v=>v.verdict!=='defensible');
  return <section aria-label="Forecast defensibility review" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h3 className="text-sm font-bold text-navy">Forecasts to challenge</h3>
    <p className="mt-1 text-xs text-gray-500">Current recorded premises for dated close claims. Existing forecast calculations and historical calibration are shown separately.</p>
    <p className="mt-3 text-sm">{claims.length} dated claim(s) · {exceptions.length} with a conditional, incomplete or unsupported current basis.</p>
    {!claims.length?<p className="mt-2 text-sm text-gray-500">No dated close claims to evaluate.</p>:!exceptions.length?<p className="mt-2 text-sm text-gray-500">No current exception in the recorded forecast arguments. Recorded Requirements may still be incomplete.</p>:<ul className="mt-3 space-y-2">
      {exceptions.slice(0,12).map(view=><li key={view.opportunityId} className="rounded-lg border border-gray-200 p-3 text-sm">
        <Link className="font-semibold text-brand-blue hover:underline" to={`/app/opportunities?opportunityId=${encodeURIComponent(view.opportunityId)}`}>
          {byId.get(view.opportunityId)?.opportunityName||view.opportunityId}</Link>
        <span> · {view.claim!.targetDate} · {verdictText[view.verdict]}</span>
        <p className="mt-1 text-xs text-gray-500">Operator label: {view.claim!.operatorCategory}{view.categoryDisagreement?' · Differs from the recorded argument':''} · {view.blockers.length?`Waiting on ${view.blockers.map(b=>b.expectedOutcome).join('; ')}`:view.whatWouldHaveToBeTrue[0]?.text||'Review the current basis.'}</p>
      </li>)}
      {exceptions.length>12&&<li className="text-xs text-gray-500">{exceptions.length-12} more current exception(s) remain in Opportunities.</li>}
    </ul>}
  </section>;
}
