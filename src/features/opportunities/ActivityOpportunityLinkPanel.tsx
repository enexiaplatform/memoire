import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Link2Off } from 'lucide-react';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import {
  buildOpportunityUpdateSuggestion,
  suggestOpportunityLinks,
  type OpportunityUpdateSuggestion,
} from '../../utils/activityOpportunityLinker';

export function ActivityOpportunityLinkPanel({
  activity,
  opportunities,
  onLink,
  onIgnore,
  onUnlink,
}: {
  activity: SalesActivityRecord;
  opportunities: CrmLiteOpportunity[];
  onLink: (opportunity: CrmLiteOpportunity, applyUpdates: boolean, updateSuggestion: OpportunityUpdateSuggestion) => void;
  onIgnore: () => void;
  onUnlink?: () => void;
}) {
  const [manualOpportunityId, setManualOpportunityId] = useState('');
  const suggestions = useMemo(() => suggestOpportunityLinks(activity, opportunities), [activity, opportunities]);
  const manualOpportunity = opportunities.find((opportunity) => opportunity.id === manualOpportunityId) || null;

  if (activity.linkStatus === 'Linked') {
    return (
      <section className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Linked opportunity</p>
            <p className="mt-1 text-sm font-bold text-emerald-950">
              {activity.linkedAccountName || 'Account'} / {activity.linkedOpportunityName || 'Opportunity'}
            </p>
          </div>
          {onUnlink && (
            <button
              type="button"
              onClick={onUnlink}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              <Link2Off className="h-3.5 w-3.5" />
              Unlink
            </button>
          )}
        </div>
      </section>
    );
  }

  if (opportunities.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-gray-300 bg-white p-4">
        <p className="text-sm font-bold text-navy">No opportunities yet.</p>
        <p className="mt-1 text-sm text-gray-500">Add an opportunity to link this activity.</p>
        <Link to="/app/opportunities" className="mt-3 inline-flex rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">
          Add opportunity
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Link to opportunity</p>
          <p className="mt-1 text-sm text-blue-950">Choose a safe manual link. Opportunity updates are optional.</p>
        </div>
        <button
          type="button"
          onClick={onIgnore}
          className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
        >
          Ignore
        </button>
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-4 space-y-3">
          {suggestions.map((suggestion) => {
            const updateSuggestion = buildOpportunityUpdateSuggestion(activity, suggestion.opportunity);
            return (
              <div key={suggestion.opportunity.id} className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-navy">
                      {suggestion.opportunity.accountName} / {suggestion.opportunity.opportunityName}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-gray-500">
                      {suggestion.opportunity.stage} | {suggestion.confidence} confidence | {suggestion.reason}
                    </p>
                    {updateSuggestion.reasons.length > 0 && (
                      <p className="mt-2 text-xs font-semibold text-amber-700">
                        Optional updates: {updateSuggestion.reasons.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onLink(suggestion.opportunity, false, updateSuggestion)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Link only
                    </button>
                    <button
                      type="button"
                      onClick={() => onLink(suggestion.opportunity, true, updateSuggestion)}
                      className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                    >
                      Link + apply suggested updates
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-600 ring-1 ring-blue-100">
          No strong suggestion found. Use the manual selector below.
        </p>
      )}

      <div className="mt-4 rounded-lg bg-white p-3 ring-1 ring-blue-100">
        <label className="block">
          <span className="text-sm font-bold text-navy">Manual opportunity</span>
          <select
            value={manualOpportunityId}
            onChange={(event) => setManualOpportunityId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          >
            <option value="">Select opportunity</option>
            {opportunities.map((opportunity) => (
              <option key={opportunity.id} value={opportunity.id}>
                {opportunity.accountName} / {opportunity.opportunityName}
              </option>
            ))}
          </select>
        </label>
        {manualOpportunity && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onLink(manualOpportunity, false, buildOpportunityUpdateSuggestion(activity, manualOpportunity))}
              className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white"
            >
              Link only
            </button>
            <button
              type="button"
              onClick={() => onLink(manualOpportunity, true, buildOpportunityUpdateSuggestion(activity, manualOpportunity))}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800"
            >
              Link + apply suggested updates
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
