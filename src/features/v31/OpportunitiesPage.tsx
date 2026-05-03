/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, DollarSign, Filter, MessageCircleQuestion, MoveRight, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isDemoMode } from '../../lib/demoMode';
import type { FollowUpContext, Interaction, MemoryHealth, Objection, Opportunity, SalesAction } from '../../types/v31';
import { readLocalMemory } from './localStore';
import { FollowUpComposerPanel } from './FollowUpComposerPanel';
import { calculateMemoryHealth, memoryHealthLabel } from './memoryHealth';

const stageFilters = ['all', 'new', 'active', 'proposal', 'negotiation', 'paused'] as const;

export function OpportunitiesPage() {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [objections, setObjections] = useState<Objection[]>([]);
  const [stage, setStage] = useState<(typeof stageFilters)[number]>('all');
  const [followUpContext, setFollowUpContext] = useState<FollowUpContext | null>(null);
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
      setInteractions(memory.interactions);
      setActions(memory.actions);
      setObjections(memory.objections);
      setLoading(false);
      return;
    }

    let opportunityQuery = supabase
      .from('opportunities')
      .select('*,account:account_id(id,name),contact:contact_id(id,name,role)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (stage !== 'all') {
      opportunityQuery = opportunityQuery.eq('stage', stage);
    }

    const [opportunityResult, interactionResult, actionResult, objectionResult] = await Promise.all([
      opportunityQuery,
      supabase.from('interactions').select('*').eq('user_id', user.id).order('occurred_at', { ascending: false }).limit(100),
      supabase.from('actions').select('*').eq('user_id', user.id).order('due_date', { ascending: true, nullsFirst: false }).limit(100),
      supabase.from('objections').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(100),
    ]);

    if (!opportunityResult.error) setOpportunities((opportunityResult.data || []) as Opportunity[]);
    if (!interactionResult.error) setInteractions((interactionResult.data || []) as Interaction[]);
    if (!actionResult.error) setActions((actionResult.data || []) as SalesAction[]);
    if (!objectionResult.error) setObjections((objectionResult.data || []) as Objection[]);
    setLoading(false);
  }, [stage, user]);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

  const healthByOpportunityId = useMemo(() => {
    return new Map(opportunities.map((opportunity) => [
      opportunity.id,
      calculateMemoryHealth(
        { entityType: 'opportunity', entity: opportunity },
        { contacts: [], opportunities, interactions, actions, objections, brokenLoops: [] }
      ),
    ]));
  }, [actions, interactions, objections, opportunities]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Opportunities</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Opportunity Memory</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          A lightweight view of commercial movement connected to Account Memory and Next Actions.
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
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading Opportunity Memory...</div>
      ) : opportunities.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-gray-900">No Opportunity Memory yet</p>
          <p className="mt-1 text-sm text-gray-500">Capture an account interaction from Today to create opportunity context and a Next Action.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              health={healthByOpportunityId.get(opportunity.id)}
              onDraft={() => setFollowUpContext({
                accountName: opportunity.account?.name || 'Unknown account',
                contactName: opportunity.contact?.name || '',
                opportunityName: opportunity.title,
                objections: opportunity.blocker ? [opportunity.blocker] : [],
                painPoints: [],
                nextAction: opportunity.next_action_text || '',
                goal: opportunity.blocker ? 'address_objection' : 'confirm_next_step',
                tone: 'consultative',
                length: 'medium',
              })}
            />
          ))}
        </div>
      )}
      {followUpContext && (
        <FollowUpComposerPanel
          initialContext={followUpContext}
          onClose={() => setFollowUpContext(null)}
        />
      )}
    </div>
  );
}

function OpportunityCard({ opportunity, health, onDraft }: { opportunity: Opportunity; health?: MemoryHealth; onDraft: () => void }) {
  const isAtRisk = !opportunity.next_action_text;
  const isStale = isOpportunityStale(opportunity);
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
        <div className="flex flex-col items-end gap-2">
          {health && <MemoryHealthBadge health={health} />}
          {(isAtRisk || isStale) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Broken Loop
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Stage" value={opportunity.stage} />
        <Fact label="Commercial movement" value={value} icon={<DollarSign className="h-3.5 w-3.5" />} />
        <Fact label="Last touch" value={lastTouch} />
        <Fact label="Urgency" value={opportunity.urgency} />
        <Fact label="Confidence" value={opportunity.confidence} />
        <Fact label="Blocker" value={opportunity.blocker || 'None captured'} />
      </div>

      <div className={`mt-4 rounded-lg p-3 ${isAtRisk ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-900'}`}>
        <p className="text-xs font-bold uppercase tracking-wide opacity-70">Next Action</p>
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
          {opportunity.next_action_text || 'Add a Next Action to close the loop'}
          <MoveRight className="h-4 w-4" />
        </p>
      </div>
      <button
        type="button"
        onClick={onDraft}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-blue-50 hover:text-brand-blue"
      >
        <Send className="h-4 w-4" />
        Draft Follow-up
      </button>
      <Link
        to={`/app/ask?scope=opportunity&opportunityId=${opportunity.id}`}
        className="ml-2 mt-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-brand-blue hover:border-brand-blue/40"
      >
        <MessageCircleQuestion className="h-4 w-4" />
        Ask Memoire
      </Link>
    </article>
  );
}

function MemoryHealthBadge({ health }: { health: MemoryHealth }) {
  const tone = {
    healthy: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    needs_attention: 'border-amber-200 bg-amber-50 text-amber-700',
    broken: 'border-red-200 bg-red-50 text-red-700',
  }[health.status];

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone}`}>
      {memoryHealthLabel(health.status)}
    </span>
  );
}

function isOpportunityStale(opportunity: Opportunity) {
  if (!opportunity.last_touch_at) return true;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  return new Date(opportunity.last_touch_at) < cutoff;
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
