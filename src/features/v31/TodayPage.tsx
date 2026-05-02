/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isDemoMode } from '../../lib/demoMode';
import type { Opportunity, SalesAction } from '../../types/v31';
import { QuickCapturePanel } from './QuickCapturePanel';
import { markLocalActionDone, readLocalMemory } from './localStore';

export function TodayPage() {
  const { user } = useAuth();
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const loadToday = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (isDemoMode) {
      const memory = readLocalMemory();
      const accountById = new Map(memory.accounts.map((account) => [account.id, account]));
      const opportunityById = new Map(memory.opportunities.map((opportunity) => [opportunity.id, opportunity]));
      setActions(memory.actions
        .filter((action) => action.status === 'open')
        .map((action) => ({
          ...action,
          account: action.account_id ? accountById.get(action.account_id) || null : null,
          opportunity: action.opportunity_id ? opportunityById.get(action.opportunity_id) || null : null,
        })));
      setOpportunities(memory.opportunities.map((opportunity) => ({
        ...opportunity,
        account: opportunity.account_id ? accountById.get(opportunity.account_id) || null : null,
      })));
      setLoading(false);
      return;
    }

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 14);

    const [actionsResult, opportunitiesResult] = await Promise.all([
      supabase
        .from('actions')
        .select('*,account:account_id(id,name),contact:contact_id(id,name,role),opportunity:opportunity_id(id,title,stage)')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(30),
      supabase
        .from('opportunities')
        .select('*,account:account_id(id,name),contact:contact_id(id,name,role)')
        .eq('user_id', user.id)
        .not('stage', 'in', '(won,lost)')
        .order('updated_at', { ascending: false })
        .limit(30),
    ]);

    if (!actionsResult.error) setActions((actionsResult.data || []) as SalesAction[]);
    if (!opportunitiesResult.error) setOpportunities((opportunitiesResult.data || []) as Opportunity[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const overdueActions = actions.filter((action) => action.due_date && action.due_date < today);
  const dueActions = actions.filter((action) => action.due_date === today);
  const suggestedActions = actions.filter((action) => !action.due_date || action.suggested);
  const staleOpportunities = opportunities.filter((opportunity) => {
    if (!opportunity.last_touch_at) return true;
    const lastTouch = new Date(opportunity.last_touch_at);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    return lastTouch < cutoff;
  });
  const atRiskOpportunities = opportunities.filter((opportunity) => !opportunity.next_action_text);

  const markDone = async (actionId: string) => {
    if (!user) return;
    if (isDemoMode) {
      markLocalActionDone(actionId);
      loadToday();
      return;
    }

    await supabase
      .from('actions')
      .update({ status: 'done' })
      .eq('id', actionId)
      .eq('user_id', user.id);
    loadToday();
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Today</p>
        <h1 className="text-3xl font-bold tracking-tight text-navy">What should I do today to move revenue forward?</h1>
        <p className="max-w-2xl text-sm text-gray-500">
          Memoire keeps the day focused on customer follow-up, stuck opportunities, and the sales memory you are building.
        </p>
      </header>

      <QuickCapturePanel compact onSaved={loadToday} />

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading today's memory...</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <ActionSection title="Overdue" icon={<AlertTriangle className="h-4 w-4" />} actions={overdueActions} tone="red" onDone={markDone} />
            <ActionSection title="Due today" icon={<Clock className="h-4 w-4" />} actions={dueActions} tone="blue" onDone={markDone} />
            <ActionSection title="Suggested actions" icon={<Target className="h-4 w-4" />} actions={suggestedActions} tone="gray" onDone={markDone} />
          </div>

          <aside className="space-y-5">
            <OpportunityRiskSection title="Stale opportunities" opportunities={staleOpportunities} />
            <OpportunityRiskSection title="At-risk: no next action" opportunities={atRiskOpportunities} />
          </aside>
        </div>
      )}
    </div>
  );
}

function ActionSection({
  title,
  icon,
  actions,
  tone,
  onDone,
}: {
  title: string;
  icon: ReactNode;
  actions: SalesAction[];
  tone: 'red' | 'blue' | 'gray';
  onDone: (actionId: string) => void;
}) {
  const toneClass = {
    red: 'text-red-700 bg-red-50 border-red-100',
    blue: 'text-brand-blue bg-blue-50 border-blue-100',
    gray: 'text-gray-700 bg-gray-50 border-gray-100',
  }[tone];

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${toneClass}`}>{icon}</span>
        <h2 className="text-base font-bold text-navy">{title}</h2>
        <span className="ml-auto text-xs font-semibold text-gray-400">{actions.length}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {actions.length === 0 ? (
          <p className="px-5 py-5 text-sm text-gray-500">Nothing here right now.</p>
        ) : actions.map((action) => (
          <div key={action.id} className="flex items-start gap-3 px-5 py-4">
            <button
              type="button"
              onClick={() => onDone(action.id)}
              className="mt-0.5 rounded-full text-gray-300 hover:text-green-600"
              aria-label="Mark action done"
            >
              <CheckCircle2 className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{action.title}</p>
              <p className="mt-1 text-xs text-gray-500">
                {[action.account?.name, action.opportunity?.title, action.due_date].filter(Boolean).join(' / ') || 'No linked account yet'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OpportunityRiskSection({ title, opportunities }: { title: string; opportunities: Opportunity[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-navy">{title}</h2>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">{opportunities.length}</span>
      </div>
      <div className="space-y-3">
        {opportunities.length === 0 ? (
          <p className="text-sm text-gray-500">No risk signals from your current memory.</p>
        ) : opportunities.slice(0, 6).map((opportunity) => (
          <div key={opportunity.id} className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
            <p className="text-sm font-semibold text-gray-900">{opportunity.title}</p>
            <p className="mt-1 text-xs text-gray-600">{opportunity.account?.name || 'No account'} / {opportunity.stage}</p>
            <p className="mt-2 text-xs text-amber-800">{opportunity.next_action_text || 'Needs a next action'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
