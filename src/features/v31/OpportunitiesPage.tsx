/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, DollarSign, Filter, MoveRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isDemoMode } from '../../lib/demoMode';
import type { Opportunity } from '../../types/v31';
import { readLocalMemory } from './localStore';

const stageFilters = ['all', 'new', 'active', 'proposal', 'negotiation', 'paused'] as const;

export function OpportunitiesPage() {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stage, setStage] = useState<(typeof stageFilters)[number]>('all');
  const [loading, setLoading] = useState(true);

  const loadOpportunities = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    if (isDemoMode) {
      const memory = readLocalMemory();
      const accountById = new Map(memory.accounts.map((account) => [account.id, account]));
      const visible = stage === 'all'
        ? memory.opportunities
        : memory.opportunities.filter((opportunity) => opportunity.stage === stage);
      setOpportunities(visible.map((opportunity) => ({
        ...opportunity,
        account: opportunity.account_id ? accountById.get(opportunity.account_id) || null : null,
      })));
      setLoading(false);
      return;
    }

    let query = supabase
      .from('opportunities')
      .select('*,account:account_id(id,name),contact:contact_id(id,name,role)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (stage !== 'all') {
      query = query.eq('stage', stage);
    }

    const { data, error } = await query;
    if (!error) setOpportunities((data || []) as Opportunity[]);
    setLoading(false);
  }, [stage, user]);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Pipeline / Opportunities</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Opportunity Basic</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          A lightweight view of active revenue motion. Opportunities without next actions are highlighted.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500">
          <Filter className="h-4 w-4" />
          Stage
        </span>
        {stageFilters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStage(item)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${stage === item ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading opportunities...</div>
      ) : opportunities.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-gray-900">No opportunities yet</p>
          <p className="mt-1 text-sm text-gray-500">Capture an account interaction from Today to start building your pipeline memory.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {opportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const isAtRisk = !opportunity.next_action_text;
  const lastTouch = opportunity.last_touch_at
    ? new Date(opportunity.last_touch_at).toLocaleDateString()
    : 'No touch logged';
  const value = opportunity.estimated_value
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(opportunity.estimated_value)
    : 'Value unknown';

  return (
    <article className={`rounded-lg border bg-white p-5 shadow-sm ${isAtRisk ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-200'}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{opportunity.account?.name || 'No account'}</p>
          <h2 className="mt-1 text-lg font-bold text-navy">{opportunity.title}</h2>
        </div>
        {isAtRisk && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            At risk
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Stage" value={opportunity.stage} />
        <Fact label="Estimated value" value={value} icon={<DollarSign className="h-3.5 w-3.5" />} />
        <Fact label="Last touch" value={lastTouch} />
        <Fact label="Urgency" value={opportunity.urgency} />
        <Fact label="Confidence" value={opportunity.confidence} />
        <Fact label="Blocker" value={opportunity.blocker || 'None captured'} />
      </div>

      <div className={`mt-4 rounded-lg p-3 ${isAtRisk ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-900'}`}>
        <p className="text-xs font-bold uppercase tracking-wide opacity-70">Next action</p>
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
          {opportunity.next_action_text || 'Add a next action to keep this moving'}
          <MoveRight className="h-4 w-4" />
        </p>
      </div>
    </article>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        {icon}
        {value}
      </p>
    </div>
  );
}
