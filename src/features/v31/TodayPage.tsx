import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Send, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isDemoMode } from '../../lib/demoMode';
import type { Account, FollowUpContext, Interaction, MemoryChange, MemoryHealth, Objection, Opportunity, SalesAction, SalesPattern } from '../../types/v31';
import { QuickCapturePanel } from './QuickCapturePanel';
import { markLocalActionDone, readLocalMemory } from './localStore';
import { detectBrokenLoops } from './brokenLoops';
import type { BrokenLoop, CaptureMemory } from './brokenLoops';
import { FollowUpComposerPanel } from './FollowUpComposerPanel';
import { calculateMemoryHealth, memoryHealthLabel } from './memoryHealth';
import { buildWhatChangedDigest, formatMemoryChangeSeverity } from './whatChangedDigest';
import { detectSalesPatterns, salesPatternSeverityLabel } from './salesPatternDetector';
import { RouteLoadingFallback } from './RouteLoadingFallback';
import { useSlowLoadingFallback } from './useSlowLoadingFallback';

export function TodayPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [objections, setObjections] = useState<Objection[]>([]);
  const [captures, setCaptures] = useState<CaptureMemory[]>([]);
  const [followUpContext, setFollowUpContext] = useState<FollowUpContext | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const slowLoading = useSlowLoadingFallback(loading);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const loadToday = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (isDemoMode) {
      const memory = readLocalMemory();
      const accountById = new Map(memory.accounts.map((account) => [account.id, account]));
      const opportunityById = new Map(memory.opportunities.map((opportunity) => [opportunity.id, opportunity]));
      setAccounts(memory.accounts);
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
      setInteractions(memory.interactions);
      setObjections(memory.objections);
      setCaptures(memory.captures.map((capture) => ({
        ...capture,
        structured_data: capture.structured_data as unknown as Record<string, unknown>,
      })));
      setLoading(false);
      return;
    }

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 14);

    const [accountResult, actionsResult, opportunitiesResult, interactionResult, objectionResult, captureResult] = await Promise.all([
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(40),
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
      supabase
        .from('interactions')
        .select('*')
        .eq('user_id', user.id)
        .order('occurred_at', { ascending: false })
        .limit(80),
      supabase
        .from('objections')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(80),
      supabase
        .from('captures')
        .select('id,raw_text,structured_data,status,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (!accountResult.error) setAccounts((accountResult.data || []) as Account[]);
    if (!actionsResult.error) setActions((actionsResult.data || []) as SalesAction[]);
    if (!opportunitiesResult.error) setOpportunities((opportunitiesResult.data || []) as Opportunity[]);
    if (!interactionResult.error) setInteractions((interactionResult.data || []) as Interaction[]);
    if (!objectionResult.error) setObjections((objectionResult.data || []) as Objection[]);
    if (!captureResult.error) setCaptures((captureResult.data || []) as CaptureMemory[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const overdueActions = actions.filter((action) => action.due_date && action.due_date < today);
  const dueActions = actions.filter((action) => action.due_date === today);
  const dueOrOverdueActions = [...overdueActions, ...dueActions];
  const topRevenueActions = prioritizeActions(actions, today).slice(0, 5);
  const interactionsToday = interactions.filter((interaction) => interaction.occurred_at.slice(0, 10) === today);
  const brokenLoops = useMemo(
    () => detectBrokenLoops({ accounts, opportunities, interactions, actions, objections, captures }),
    [accounts, actions, captures, interactions, objections, opportunities]
  );
  const needsAttention = brokenLoops.slice(0, 3);
  const allMemoryHealth = useMemo(() => {
    const opportunityHealth = opportunities.map((opportunity) => calculateMemoryHealth(
      { entityType: 'opportunity', entity: opportunity },
      { accounts, contacts: [], opportunities, interactions, actions, objections, brokenLoops }
    ));
    const accountHealth = accounts.map((account) => calculateMemoryHealth(
      { entityType: 'account', entity: account },
      { accounts, contacts: [], opportunities, interactions, actions, objections, brokenLoops }
    ));
    return [...opportunityHealth, ...accountHealth]
      .filter((health) => health.status !== 'healthy');
  }, [accounts, actions, brokenLoops, interactions, objections, opportunities]);
  const memoryHealthItems = allMemoryHealth.slice(0, 3);
  const whatChanged = useMemo(
    () => buildWhatChangedDigest({
      accounts,
      opportunities,
      interactions,
      actions,
      objections,
      brokenLoops,
      memoryHealth: allMemoryHealth,
      limit: 5,
    }),
    [accounts, actions, allMemoryHealth, brokenLoops, interactions, objections, opportunities]
  );
  const salesPatterns = useMemo(
    () => detectSalesPatterns({ accounts, opportunities, interactions, actions, objections }),
    [accounts, actions, interactions, objections, opportunities]
  );

  const markDone = async (actionId: string) => {
    if (!user) return;
    setActionMessage('Updating Next Action...');
    if (isDemoMode) {
      markLocalActionDone(actionId);
      setActionMessage('Next Action updated.');
      loadToday();
      return;
    }

    const { error } = await supabase
      .from('actions')
      .update({ status: 'done' })
      .eq('id', actionId)
      .eq('user_id', user.id);
    setActionMessage(error ? 'Could not update action.' : 'Next Action updated.');
    loadToday();
  };

  const draftFromAction = (action: SalesAction) => {
    const account = action.account || accounts.find((item) => item.id === action.account_id) || null;
    const opportunity = action.opportunity || opportunities.find((item) => item.id === action.opportunity_id) || null;
    const accountInteractions = interactions.filter((interaction) => interaction.account_id === action.account_id);
    const accountObjections = objections.filter((objection) => objection.account_id === action.account_id);
    setFollowUpContext({
      accountName: account?.name || 'Unknown account',
      contactName: action.contact?.name || '',
      opportunityName: opportunity?.title || '',
      lastInteractionSummary: accountInteractions[0]?.summary || '',
      objections: accountObjections.map((objection) => objection.title),
      painPoints: accountInteractions.map((interaction) => interaction.pain_point || '').filter(Boolean),
      nextAction: action.title,
      goal: accountObjections.length > 0 ? 'address_objection' : 'confirm_next_step',
      tone: 'consultative',
      length: 'medium',
    });
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

      {loading ? (
        slowLoading ? <RouteLoadingFallback onRetry={loadToday} /> : <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading today's memory...</div>
      ) : (
        <>
          <DailyFocusHeader actionCount={topRevenueActions.length} brokenLoopCount={needsAttention.length} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
            <ActionSection sectionId="top-revenue-actions" title="Top Revenue Actions" icon={<Target className="h-4 w-4" />} actions={topRevenueActions} tone="blue" today={today} onDone={markDone} onDraft={draftFromAction} />
            {actionMessage && <p className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-gray-600 ring-1 ring-gray-200">{actionMessage}</p>}
            <NeedsAttentionSection loops={needsAttention} healthItems={memoryHealthItems} />
            <ActionSection title="Due / Overdue Actions" icon={<AlertTriangle className="h-4 w-4" />} actions={dueOrOverdueActions} tone="red" today={today} onDone={markDone} onDraft={draftFromAction} />
            <QuickCapturePanel compact onSaved={loadToday} />
            <EndOfDayCheck
              openActions={actions}
              brokenLoops={brokenLoops}
              interactionsToday={interactionsToday}
              firstFocus={topRevenueActions[0] || null}
            />
          </div>

          <aside className="space-y-5">
            <WhatChangedSection changes={whatChanged} />
            <SalesPatternSection pattern={salesPatterns[0]} />
          </aside>
          </div>
        </>
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

function DailyFocusHeader({ actionCount, brokenLoopCount }: { actionCount: number; brokenLoopCount: number }) {
  return (
    <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-bold text-navy">Start today by moving the most important sales memory loops forward.</p>
          <p className="mt-1 text-sm text-gray-500">
            {actionCount} revenue actions ready. {brokenLoopCount} memory loops need attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="#top-revenue-actions"
            className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
          >
            Start Today's Sales Loop
          </a>
          <a
            href="#quick-capture"
            className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:border-brand-blue/40"
          >
            Capture Interaction
          </a>
        </div>
      </div>
    </section>
  );
}

function prioritizeActions(actions: SalesAction[], today: string) {
  const priority = (action: SalesAction) => {
    if (action.due_date && action.due_date < today) return 0;
    if (action.due_date === today) return 1;
    if (action.opportunity_id) return 2;
    if (action.suggested) return 3;
    return 4;
  };

  return [...actions].sort((a, b) => priority(a) - priority(b) || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
}

function SalesPatternSection({ pattern }: { pattern?: SalesPattern }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-navy">Sales Pattern</h2>
        {pattern && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${patternSeverityClass(pattern.severity)}`}>
            {salesPatternSeverityLabel(pattern.severity)}
          </span>
        )}
      </div>
      {!pattern ? (
        <p className="text-sm leading-6 text-gray-500">
          No clear pattern detected yet. Capture more interactions and actions so Memoire can learn from your sales activity.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold text-gray-900">{pattern.title}</p>
            <p className="mt-1 text-sm leading-6 text-gray-600">{pattern.insight}</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Evidence</p>
            <ul className="space-y-1 text-xs leading-5 text-gray-600">
              {pattern.evidence.slice(0, 3).map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          <p className="rounded-lg bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-900">
            {pattern.suggestedBehavior}
          </p>
        </div>
      )}
    </section>
  );
}

function patternSeverityClass(severity: SalesPattern['severity']) {
  if (severity === 'high') return 'bg-red-100 text-red-700';
  if (severity === 'medium') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function WhatChangedSection({ changes }: { changes: MemoryChange[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-navy">What Changed</h2>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand-blue">{changes.length}</span>
      </div>
      {changes.length === 0 ? (
        <p className="text-sm leading-6 text-gray-500">
          No major changes yet. Capture interactions and Memoire will summarize what changed here.
        </p>
      ) : (
        <div className="space-y-3">
          {changes.map((change) => (
            <div key={change.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${changeSeverityClass(change.severity)}`}>
                  {formatMemoryChangeSeverity(change.severity)}
                </span>
                <p className="text-sm font-bold text-gray-900">{change.title}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-600">{change.description}</p>
              {change.suggestedReviewAction && (
                <p className="mt-2 text-xs font-semibold text-gray-700">{change.suggestedReviewAction}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function changeSeverityClass(severity: MemoryChange['severity']) {
  if (severity === 'high') return 'bg-red-100 text-red-700';
  if (severity === 'medium') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function NeedsAttentionSection({ loops, healthItems }: { loops: BrokenLoop[]; healthItems: MemoryHealth[] }) {
  const hasAttention = loops.length > 0 || healthItems.length > 0;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-navy">Needs Attention</h2>
          <p className="mt-1 text-xs text-gray-500">Broken Loops are accounts or deals missing a clear Next Action, recent context, or follow-up.</p>
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{loops.length + healthItems.length}</span>
      </div>
      {!hasAttention ? (
        <p className="text-sm text-gray-500">No broken loops detected. Your sales memory loop looks healthy.</p>
      ) : (
        <div className="space-y-3">
          {loops.map((loop) => (
            <div key={loop.id} className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${priorityClass(loop.priority)}`}>{loop.priority}</span>
                    <p className="text-sm font-bold text-gray-900">{loop.issue}</p>
                  </div>
                  <p className="mt-1 text-xs text-amber-800">{loop.affectedEntity}</p>
                  <p className="mt-2 text-xs leading-5 text-gray-600">{loop.whyItMatters}</p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-amber-900">{loop.suggestedFix}</p>
                </div>
              </div>
              <Link
                to={loopTarget(loop)}
                className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
              >
                {loop.actionLabel}
              </Link>
            </div>
          ))}
          {healthItems.map((health) => (
            <div key={`${health.entityType}-${health.entityId}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <MemoryHealthBadge health={health} />
                <p className="text-sm font-bold text-gray-900">
                  {health.entityType === 'account' ? 'Account memory needs context' : 'Opportunity memory needs context'}
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-600">
                {health.reasons[0] || 'Memory Health is limited because Memoire does not have enough context yet.'}
              </p>
              {health.suggestedFixes[0] && (
                <p className="mt-2 text-xs font-semibold text-gray-700">{health.suggestedFixes[0]}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
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

function priorityClass(priority: BrokenLoop['priority']) {
  if (priority === 'P0') return 'bg-red-100 text-red-700';
  if (priority === 'P1') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function loopTarget(loop: BrokenLoop) {
  if (loop.actionLabel === 'Open Account' && loop.accountId) return `/app/accounts/${loop.accountId}`;
  if (loop.actionLabel === 'Open Opportunity') return '/app/opportunities';
  return '/app/today';
}

function ActionSection({
  sectionId,
  title,
  icon,
  actions,
  tone,
  today,
  onDone,
  onDraft,
}: {
  sectionId?: string;
  title: string;
  icon: ReactNode;
  actions: SalesAction[];
  tone: 'red' | 'blue' | 'gray';
  today: string;
  onDone: (actionId: string) => void;
  onDraft: (action: SalesAction) => void;
}) {
  const toneClass = {
    red: 'text-red-700 bg-red-50 border-red-100',
    blue: 'text-brand-blue bg-blue-50 border-blue-100',
    gray: 'text-gray-700 bg-gray-50 border-gray-100',
  }[tone];

  return (
    <section id={sectionId} className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${toneClass}`}>{icon}</span>
        <h2 className="text-base font-bold text-navy">{title}</h2>
        <span className="ml-auto text-xs font-semibold text-gray-400">{actions.length}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {actions.length === 0 ? (
          <p className="px-5 py-5 text-sm text-gray-500">
            Capture your first customer interaction or create a next action. Memoire will help you decide what to do today.
          </p>
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
              <p className="mt-1 text-xs leading-5 text-gray-600">{whyActionMatters(action, today)}</p>
              <p className="mt-1 text-xs text-gray-500">
                {[action.account?.name, action.opportunity?.title, formatActionTiming(action)].filter(Boolean).join(' / ') || 'No linked account yet'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {action.account_id && (
                  <Link
                    to={`/app/accounts/${action.account_id}`}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-blue-50 hover:text-brand-blue"
                  >
                    Open Account
                  </Link>
                )}
                {action.opportunity_id && (
                  <Link
                    to="/app/opportunities"
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-blue-50 hover:text-brand-blue"
                  >
                    Open Opportunity
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => onDraft(action)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-blue-50 hover:text-brand-blue"
                >
                  <Send className="h-3.5 w-3.5" />
                  Draft Follow-up
                </button>
                <button
                  type="button"
                  onClick={() => onDone(action.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark Done
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatActionTiming(action: SalesAction) {
  if (action.due_date) return `Due: ${action.due_date}`;
  const title = action.title.toLowerCase();
  if (title.includes('tentative timing') || title.includes('source open timing')) return 'Tentative timing only';
  return 'No due date yet';
}

function whyActionMatters(action: SalesAction, today: string) {
  if (action.due_date && action.due_date < today) return 'Overdue follow-up can reduce momentum.';
  if (action.due_date === today) return 'This is due today and should be handled before the loop cools down.';
  if (action.opportunity_id) return 'This is tied to active Opportunity Memory.';
  if (action.suggested) return 'Memoire suggested this to keep Sales Memory moving.';
  return 'Completing this keeps the customer story moving forward.';
}

function EndOfDayCheck({
  openActions,
  brokenLoops,
  interactionsToday,
  firstFocus,
}: {
  openActions: SalesAction[];
  brokenLoops: BrokenLoop[];
  interactionsToday: Interaction[];
  firstFocus: SalesAction | null;
}) {
  return (
    <details className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-base font-bold text-navy">End-of-Day Check</summary>
      <div className="mt-4 space-y-3 text-sm text-gray-600">
        {openActions.length === 0 && brokenLoops.length === 0 && interactionsToday.length === 0 ? (
          <p className="leading-6">
            Capture interactions and complete actions today. Memoire will help you review your sales memory at the end of the day.
          </p>
        ) : (
          <>
            <EndOfDayLine label="Actions still open" value={`${openActions.length}`} />
            <EndOfDayLine label="Broken loops unresolved" value={`${brokenLoops.length}`} />
            <EndOfDayLine label="Interactions captured today" value={`${interactionsToday.length}`} />
            <div className="rounded-lg bg-blue-50 p-3 text-blue-900">
              <p className="text-xs font-bold uppercase tracking-wide opacity-70">Suggested first focus for tomorrow</p>
              <p className="mt-1 font-semibold">{firstFocus?.title || brokenLoops[0]?.suggestedFix || 'Capture the next customer interaction.'}</p>
            </div>
          </>
        )}
      </div>
    </details>
  );
}

function EndOfDayLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
      <span>{label}</span>
      <span className="font-bold text-navy">{value}</span>
    </div>
  );
}
