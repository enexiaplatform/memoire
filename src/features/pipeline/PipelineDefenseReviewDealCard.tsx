import type {
  DecisionRecommendation,
  ForecastEvidenceCategory,
  PipelineDefenseDeal,
} from '../../data/pipelineDefenseBrief';

const categoryClasses: Record<ForecastEvidenceCategory, string> = {
  Defensible: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Weak but recoverable': 'border-amber-200 bg-amber-50 text-amber-700',
  'Hope-based': 'border-orange-200 bg-orange-50 text-orange-700',
  Unsupported: 'border-red-200 bg-red-50 text-red-700',
};

const decisionClasses: Record<DecisionRecommendation, string> = {
  Defend: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Rescue: 'border-blue-200 bg-blue-50 text-blue-700',
  Monitor: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  Downgrade: 'border-orange-200 bg-orange-50 text-orange-700',
  Deprioritize: 'border-gray-200 bg-gray-50 text-gray-600',
};

export function PipelineDefenseReviewDealCard({ deal }: { deal: PipelineDefenseDeal }) {
  return (
    <article id={`pipeline-deal-${deal.id}`} className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{deal.account || 'Unknown Account'}</p>
          <h3 className="mt-1 text-lg font-bold text-navy">{deal.opportunity || 'Unknown Opportunity'}</h3>
          <p className="mt-2 text-sm text-gray-500">{deal.pipelineContext || 'No pipeline context entered yet.'}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Badge className={categoryClasses[deal.forecastEvidenceCategory]}>{deal.forecastEvidenceCategory}</Badge>
          <Badge className={decisionClasses[deal.decisionRecommendation]}>{deal.decisionRecommendation}</Badge>
        </div>
      </div>

      <div className="grid gap-4">
        <ReviewBlock title="Deal truth" items={[deal.dealTruth]} />
        <ReviewBlock title="Risk type" items={deal.riskType} />
        <ReviewBlock title="Missing context" items={deal.missingContext} />

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">Objection debt</p>
          <p className="mt-1 text-sm text-amber-800">{deal.objectionDebt.objection || 'No objection entered yet.'}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Required proof / action</p>
          <p className="mt-1 text-sm text-amber-800">{deal.objectionDebt.requiredAction || 'No required proof entered yet.'}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-white px-2.5 py-1 text-amber-700">Owner: {deal.objectionDebt.owner || 'Unassigned'}</span>
            <span className="rounded-full bg-white px-2.5 py-1 text-amber-700">Status: {deal.objectionDebt.status}</span>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">Recommended action</p>
          <p className="mt-1 text-sm text-blue-800">{deal.recommendedAction || 'No recommended action entered yet.'}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-bold text-gray-900">Pipeline review answer</p>
          <p className="mt-1 text-sm leading-6 text-gray-700">{deal.pipelineReviewAnswer || 'No pipeline review answer entered yet.'}</p>
        </div>
      </div>
    </article>
  );
}

function ReviewBlock({ title, items }: { title: string; items: string[] }) {
  const visibleItems = items.filter(Boolean);

  return (
    <div>
      <p className="mb-2 text-sm font-bold text-gray-900">{title}</p>
      {visibleItems.length > 0 ? (
        <ul className="space-y-1.5">
          {visibleItems.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-gray-600">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">No entry yet.</p>
      )}
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}
