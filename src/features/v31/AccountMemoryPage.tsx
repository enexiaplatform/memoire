import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, ContactRound, Edit3, FileText, MessageCircleQuestion, Plus, Send, Target, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isDemoMode } from '../../lib/demoMode';
import type { Account, Contact, FollowUpContext, Interaction, MemoryHealth, Objection, ObjectionCategory, ObjectionSeverity, ObjectionStatus, Opportunity, SalesAction } from '../../types/v31';
import { readLocalMemory } from './localStore';
import { buildAccountNarrative, buildAccountTimeline, hasEnoughAccountContext } from './accountNarrative';
import { emptyObjectionDraft, objectionCategories, objectionSeverities, objectionStatuses, saveObjection } from './objectionMemory';
import type { ObjectionDraft } from './objectionMemory';
import { FollowUpComposerPanel } from './FollowUpComposerPanel';
import { detectBrokenLoops } from './brokenLoops';
import { calculateMemoryHealth, memoryHealthLabel } from './memoryHealth';
import { RouteLoadingFallback } from './RouteLoadingFallback';
import { useSlowLoadingFallback } from './useSlowLoadingFallback';

export function AccountMemoryPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [objections, setObjections] = useState<Objection[]>([]);
  const [editingObjection, setEditingObjection] = useState<Objection | null>(null);
  const [objectionDraft, setObjectionDraft] = useState<ObjectionDraft>(emptyObjectionDraft);
  const [showObjectionForm, setShowObjectionForm] = useState(false);
  const [objectionMessage, setObjectionMessage] = useState<string | null>(null);
  const [followUpContext, setFollowUpContext] = useState<FollowUpContext | null>(null);
  const [loading, setLoading] = useState(true);
  const slowLoading = useSlowLoadingFallback(loading);

  const loadAccountMemory = useCallback(async () => {
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    if (isDemoMode) {
      const memory = readLocalMemory();
      setAccount(memory.accounts.find((item) => item.id === accountId) || null);
      setContacts(memory.contacts.filter((item) => item.account_id === accountId));
      setOpportunities(memory.opportunities.filter((item) => item.account_id === accountId));
      setInteractions(memory.interactions
        .filter((item) => item.account_id === accountId)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
      setActions(memory.actions.filter((item) => item.account_id === accountId && item.status === 'open'));
      setObjections(memory.objections
        .filter((item) => item.account_id === accountId)
        .map((objection) => ({
          ...objection,
          linked_action: objection.linked_action_id
            ? memory.actions.find((action) => action.id === objection.linked_action_id) || null
            : null,
        }))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      setLoading(false);
      return;
    }

    const [accountResult, contactsResult, opportunitiesResult, interactionsResult, actionsResult, objectionsResult] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('id', accountId).single(),
      supabase.from('contacts').select('*').eq('user_id', user.id).eq('account_id', accountId).order('updated_at', { ascending: false }),
      supabase.from('opportunities').select('*').eq('user_id', user.id).eq('account_id', accountId).order('updated_at', { ascending: false }),
      supabase.from('interactions').select('*').eq('user_id', user.id).eq('account_id', accountId).order('occurred_at', { ascending: false }).limit(12),
      supabase.from('actions').select('*').eq('user_id', user.id).eq('account_id', accountId).eq('status', 'open').order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('objections')
        .select('*,linked_action:linked_action_id(id,title,status,due_date),opportunity:opportunity_id(id,title,stage),contact:contact_id(id,name,role)')
        .eq('user_id', user.id)
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false }),
    ]);

    if (!accountResult.error) setAccount(accountResult.data as Account);
    if (!contactsResult.error) setContacts((contactsResult.data || []) as Contact[]);
    if (!opportunitiesResult.error) setOpportunities((opportunitiesResult.data || []) as Opportunity[]);
    if (!interactionsResult.error) setInteractions((interactionsResult.data || []) as Interaction[]);
    if (!actionsResult.error) setActions((actionsResult.data || []) as SalesAction[]);
    if (!objectionsResult.error) setObjections((objectionsResult.data || []) as Objection[]);
    setLoading(false);
  }, [accountId, user]);

  useEffect(() => {
    loadAccountMemory();
  }, [loadAccountMemory]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-gray-500">
        {slowLoading ? <RouteLoadingFallback onRetry={loadAccountMemory} /> : 'Loading account memory...'}
      </div>
    );
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link to="/app/accounts" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" />
          Back to accounts
        </Link>
        <p className="mt-6 text-sm text-gray-500">Account not found.</p>
      </div>
    );
  }

  const narrative = buildAccountNarrative({ account, contacts, opportunities, interactions, actions });
  const timeline = buildAccountTimeline(interactions, actions).slice(0, 12);
  const hasContext = hasEnoughAccountContext(narrative);
  const decisionContext = [
    narrative.currentStage ? `Stage: ${narrative.currentStage}` : '',
    opportunities[0]?.estimated_value ? `Estimated value: ${formatMoney(opportunities[0].estimated_value)}` : '',
  ].filter(Boolean);
  const relationshipContext = [
    ...contacts.map((contact) => `${contact.name}${contact.role ? `, ${contact.role}` : ''}`),
    interactions[0]?.interaction_type ? `Last touch: ${interactions[0].interaction_type}` : '',
  ].filter(Boolean);
  const primaryContact = contacts[0];
  const currentOpportunity = opportunities.find((opportunity) => !['won', 'lost'].includes(opportunity.stage)) || opportunities[0];
  const brokenLoops = detectBrokenLoops({ accounts: [account], opportunities, interactions, actions, objections });
  const memoryHealth = calculateMemoryHealth(
    { entityType: 'account', entity: account },
    { contacts, opportunities, interactions, actions, objections, brokenLoops }
  );

  const openComposer = (goal: FollowUpContext['goal'] = 'follow_up_after_meeting') => {
    setFollowUpContext({
      accountName: account.name,
      contactName: primaryContact?.name || '',
      opportunityName: currentOpportunity?.title || '',
      lastInteractionSummary: interactions[0]?.summary || '',
      objections: objections.length > 0 ? objections.map((objection) => objection.title) : narrative.keyObjections,
      painPoints: narrative.keyPainPoints,
      nextAction: actions[0]?.title || currentOpportunity?.next_action_text || '',
      goal,
      tone: 'consultative',
      length: 'medium',
    });
  };

  const startAddObjection = () => {
    setEditingObjection(null);
    setObjectionDraft(emptyObjectionDraft);
    setObjectionMessage(null);
    setShowObjectionForm(true);
  };

  const startEditObjection = (objection: Objection) => {
    setEditingObjection(objection);
    setObjectionDraft({
      title: objection.title,
      detail: objection.detail || '',
      category: objection.category,
      status: objection.status,
      severity: objection.severity,
      response_angle: objection.response_angle || '',
      linked_action_id: objection.linked_action_id || '',
    });
    setObjectionMessage(null);
    setShowObjectionForm(true);
  };

  const saveObjectionDraft = async () => {
    if (!user || !account) return;
    setObjectionMessage('Saving...');
    try {
      await saveObjection({
        ...objectionDraft,
        id: editingObjection?.id,
        user_id: user.id,
        account_id: account.id,
        opportunity_id: editingObjection?.opportunity_id || opportunities[0]?.id || null,
        contact_id: editingObjection?.contact_id || contacts[0]?.id || null,
        source_interaction_id: editingObjection?.source_interaction_id || null,
        first_mentioned_at: editingObjection?.first_mentioned_at || new Date().toISOString(),
        last_mentioned_at: new Date().toISOString(),
      });
      setShowObjectionForm(false);
      setEditingObjection(null);
      setObjectionDraft(emptyObjectionDraft);
      setObjectionMessage('Objection saved.');
      loadAccountMemory();
    } catch (err) {
      console.error(err);
      setObjectionMessage('Could not save.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link to="/app/accounts" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" />
        Back to accounts
      </Link>

      <header className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Living Memory</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">{account.name}</h1>
            <p className="mt-2 text-sm text-gray-500">The current story, unresolved follow-ups, blockers, and next action for this account.</p>
          </div>
          {isDemoMode && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              Demo Mode
            </span>
          )}
          <Link
            to="/app/today"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Add Interaction
          </Link>
          <button
            type="button"
            onClick={() => openComposer()}
            className="inline-flex items-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white"
          >
            <Send className="h-4 w-4" />
            Draft Follow-up
          </button>
          <Link
            to={`/app/ask?scope=account&accountId=${account.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-brand-blue hover:border-brand-blue/40"
          >
            <MessageCircleQuestion className="h-4 w-4" />
            Ask about this account
          </Link>
          <Link
            to="/app/journey"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Open Journey
          </Link>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
          {account.summary || 'Capture an interaction or add a Next Action to build this Account Memory.'}
        </p>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <HeaderFact label="Context Health" value={memoryHealthLabel(memoryHealth.status)} />
          <HeaderFact label="Main opportunity" value={currentOpportunity?.title || 'Missing'} warn={!currentOpportunity?.title} />
          <HeaderFact label="Main next action" value={actions[0]?.title || currentOpportunity?.next_action_text || 'Missing'} warn={!actions[0]?.title && !currentOpportunity?.next_action_text} />
        </div>
      </header>

      {!hasContext && (
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50/60 p-5 text-sm leading-6 text-blue-900">
          Memoire does not have enough context yet. Capture an interaction or add a next action to build this account memory.
        </div>
      )}

      <AccountDecisionLayer
        account={account}
        brokenLoops={brokenLoops}
        memoryHealth={memoryHealth}
        actions={actions}
        contacts={contacts}
        opportunities={opportunities}
        interactions={interactions}
        objections={objections}
        narrative={{
          currentStory: narrative.narrative,
          nextAction: narrative.nextAction,
          mainBlocker: narrative.mainBlocker,
          lastInteraction: narrative.lastInteraction,
          currentOpportunity: narrative.currentOpportunity,
        }}
        onDraftFollowUp={() => openComposer('follow_up_after_meeting')}
      />

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
            <Target className="h-4 w-4" />
          </span>
          <h2 className="text-base font-bold text-navy">Account Snapshot</h2>
        </div>
        <MemoryHealthPanel health={memoryHealth} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SnapshotFact label="Account" value={account.name} />
          <SnapshotFact label="Current opportunity" value={narrative.currentOpportunity || 'Missing'} warn={!narrative.currentOpportunity} />
          <SnapshotFact label="Current stage" value={narrative.currentStage || 'Missing'} warn={!narrative.currentStage} />
          <SnapshotFact label="Main blocker" value={narrative.mainBlocker || 'Missing'} warn={!narrative.mainBlocker} />
          <SnapshotFact label="Next action" value={narrative.nextAction || 'Missing'} warn={!narrative.nextAction} />
          <SnapshotFact label="Last interaction" value={narrative.lastInteraction || 'Missing'} warn={!narrative.lastInteraction} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <MemorySection title="Account Narrative" icon={<FileText className="h-4 w-4" />}>
            <p className="text-sm leading-7 text-gray-700">{narrative.narrative}</p>
            {narrative.missingContext.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {narrative.missingContext.map((item) => (
                  <span key={item} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">Missing: {item}</span>
                ))}
              </div>
            )}
          </MemorySection>

          <MemorySection title="Open Actions" icon={<Clock3 className="h-4 w-4" />}>
            {actions.length === 0 ? <EmptyLine text="No open actions related to this account." /> : actions.map((action) => (
              <div key={action.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{action.title}</p>
                    <p className="text-xs text-gray-500">{action.due_date ? `Due: ${action.due_date}` : 'No due date yet'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openComposer('confirm_next_step')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-blue ring-1 ring-blue-100 hover:bg-blue-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Draft Follow-up
                  </button>
                </div>
              </div>
            ))}
          </MemorySection>

          <MemorySection title="Key Memory Points" icon={<CircleAlert className="h-4 w-4" />}>
            <TagList title="Pain points" items={narrative.keyPainPoints} />
            <TagList title="Objections" items={narrative.keyObjections} warm />
            <TagList title="Decision context" items={decisionContext} />
            <TagList title="Relationship context" items={relationshipContext} />
          </MemorySection>

          <MemorySection
            title="Objection Memory Bank"
            icon={<CircleAlert className="h-4 w-4" />}
            action={(
              <button
                type="button"
                onClick={startAddObjection}
                className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            )}
          >
            {objectionMessage && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{objectionMessage}</p>}
            {showObjectionForm && (
              <ObjectionForm
                draft={objectionDraft}
                actions={actions}
                onChange={setObjectionDraft}
                onCancel={() => {
                  setShowObjectionForm(false);
                  setEditingObjection(null);
                  setObjectionDraft(emptyObjectionDraft);
                }}
                onSave={saveObjectionDraft}
              />
            )}
            {objections.length === 0 ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 text-sm leading-6 text-blue-900">
                No objections captured yet. When a customer raises a concern, Memoire will keep it here so it does not get lost.
              </div>
            ) : objections.map((objection) => (
              <ObjectionCard key={objection.id} objection={objection} onEdit={() => startEditObjection(objection)} />
            ))}
          </MemorySection>

        </div>

        <div className="space-y-5">
          <MemorySection title="Timeline" icon={<Clock3 className="h-4 w-4" />}>
            {timeline.length === 0 ? <EmptyLine text="No timeline yet. Capture an interaction to start the account story." /> : timeline.map((item) => (
              <div key={item.id} className={`border-l-2 pl-4 ${item.tone === 'warning' ? 'border-amber-300' : item.tone === 'action' ? 'border-blue-300' : 'border-brand-blue/30'}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {new Date(item.date).toLocaleDateString('en-US')} / {item.label}
                </p>
                <p className="mt-1 text-sm font-semibold leading-6 text-gray-800">{item.title}</p>
                {item.detail && <p className="mt-1 text-xs leading-5 text-gray-500">{item.detail}</p>}
              </div>
            ))}
          </MemorySection>

          <MemorySection title="Contacts" icon={<ContactRound className="h-4 w-4" />}>
            {contacts.length === 0 ? <EmptyLine text="No relationship context captured yet." /> : contacts.map((contact) => (
              <div key={contact.id} className="rounded-lg border border-gray-100 p-3">
                <p className="text-sm font-semibold text-gray-900">{contact.name}</p>
                <p className="text-xs text-gray-500">{contact.role || 'Role unknown'}</p>
              </div>
            ))}
          </MemorySection>
        </div>
      </div>
      {followUpContext && (
        <FollowUpComposerPanel
          initialContext={followUpContext}
          onClose={() => setFollowUpContext(null)}
        />
      )}
    </div>
  );
}

function MemoryHealthPanel({ health }: { health: MemoryHealth }) {
  const signals = [
    ['Recent interaction', health.signals.hasRecentInteraction],
    ['Next action', health.signals.hasNextAction],
    ['Opportunity linked', health.signals.hasOpportunity],
    ['Contact known', health.signals.hasContact],
    ['Open objection', !health.signals.hasOpenObjection],
    ['Decision context', health.signals.hasDecisionContext],
  ] as const;
  const limited = health.missingContext.length >= 3;

  return (
    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <MemoryHealthBadge health={health} />
        <p className="text-sm leading-6 text-gray-600">
          {limited
            ? 'Context Health is limited because Memoire does not have enough context yet.'
            : health.reasons[0] || 'This memory has enough context and a clear next action.'}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {signals.map(([label, ok]) => (
          <div key={label} className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
            {label}
          </div>
        ))}
      </div>
      {health.missingContext.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {health.missingContext.map((item) => (
            <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500">
              Missing: {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountDecisionLayer({
  account,
  brokenLoops,
  memoryHealth,
  actions,
  contacts,
  opportunities,
  interactions,
  objections,
  narrative,
  onDraftFollowUp,
}: {
  account: Account;
  brokenLoops: ReturnType<typeof detectBrokenLoops>;
  memoryHealth: MemoryHealth;
  actions: SalesAction[];
  contacts: Contact[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  objections: Objection[];
  narrative: {
    currentStory: string;
    nextAction?: string;
    mainBlocker?: string;
    lastInteraction?: string;
    currentOpportunity?: string;
  };
  onDraftFollowUp: () => void;
}) {
  const issue = brokenLoops[0]?.issue
    || (memoryHealth.status === 'healthy' ? '' : memoryHealth.reasons[0])
    || '';
  const missing = normalizeMissingContext(memoryHealth.missingContext);
  const latestInteraction = interactions[0];
  const openObjection = objections.find((objection) => objection.status === 'open') || objections[0];
  const currentOpportunity = opportunities.find((opportunity) => !['won', 'lost'].includes(opportunity.stage)) || opportunities[0];
  const evidence = [
    latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '',
    openObjection ? `Open objection: ${openObjection.title}` : '',
    !actions[0] && !currentOpportunity?.next_action_text ? 'No open next action found' : '',
    actions[0]?.title ? `Open next action: ${actions[0].title}` : '',
    missing.length > 0 ? `Missing context: ${missing.join(', ')}` : '',
    latestInteraction?.raw_note ? `Source note: ${latestInteraction.raw_note}` : '',
  ].filter(Boolean);
  const suggestedFix = chooseSuggestedFix({
    brokenLoopFix: brokenLoops[0]?.suggestedFix,
    healthFix: memoryHealth.suggestedFixes[0],
    nextAction: actions[0]?.title || currentOpportunity?.next_action_text || narrative.nextAction,
    missing,
    blocker: narrative.mainBlocker || openObjection?.title || currentOpportunity?.blocker || '',
  });
  const clear = !issue && memoryHealth.status === 'healthy';
  const knows = [
    contacts[0] ? `Main contact: ${contacts[0].name}${contacts[0].role ? `, ${contacts[0].role}` : ''}` : '',
    currentOpportunity ? `Current opportunity: ${currentOpportunity.title}` : '',
    openObjection ? `Known objection: ${openObjection.title}` : '',
    latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '',
    actions[0]?.title ? `Open next action: ${actions[0].title}` : currentOpportunity?.next_action_text ? `Next action: ${currentOpportunity.next_action_text}` : '',
    currentOpportunity?.title ? `Product / opportunity context: ${currentOpportunity.title}` : '',
  ].filter(Boolean);
  const unknowns = missing.length > 0 ? missing : ['No major missing context detected.'];

  return (
    <section className="mb-6 rounded-lg border border-amber-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Fast Recall</p>
          <h2 className="mt-1 text-xl font-bold text-navy">Open this before every follow-up</h2>
          <p className="mt-1 text-sm text-gray-500">Grounded account memory, evidence, missing context, and one suggested fix.</p>
        </div>
        <MemoryHealthBadge health={memoryHealth} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <DecisionBlock title="Current story">
            <p>{narrative.currentStory || `${account.name} needs more captured account context.`}</p>
          </DecisionBlock>

          <DecisionBlock title="Why this may go silent" warn={!clear}>
            <p>{clear ? 'This account has a clear next action and enough context for now.' : issue || 'Memoire does not have enough context yet.'}</p>
          </DecisionBlock>

          <DecisionBlock title="Suggested fix" warn={!clear}>
            <p>{clear ? 'Review the next action or ask Memoire if you want a quick recap before following up.' : suggestedFix}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDraftFollowUp}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue px-3 py-1.5 text-xs font-bold text-white"
              >
                <Send className="h-3.5 w-3.5" />
                Draft Follow-up
              </button>
              <Link
                to={`/app/ask?scope=account&accountId=${account.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue"
              >
                <MessageCircleQuestion className="h-3.5 w-3.5" />
                Ask Memoire
              </Link>
              <Link
                to="/app/today#quick-capture"
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Capture Update
              </Link>
            </div>
          </DecisionBlock>
        </div>

        <div className="space-y-4">
          <DecisionList title="Evidence" items={evidence.length > 0 ? evidence : ['No recent evidence captured.']} />
          <DecisionList title="What Memoire knows" items={knows.length > 0 ? knows : ['Only basic account context is available.']} />
          <DecisionList title="What Memoire does not know" items={unknowns} warn={missing.length > 0} />
        </div>
      </div>
    </section>
  );
}

function normalizeMissingContext(items: string[]) {
  return Array.from(new Set(items.flatMap((item) => {
    if (item.toLowerCase().includes('decision maker') && item.toLowerCase().includes('timeline')) {
      return ['Decision maker', 'Decision timeline'];
    }
    return [item];
  })));
}

function chooseSuggestedFix({
  brokenLoopFix,
  healthFix,
  nextAction,
  missing,
  blocker,
}: {
  brokenLoopFix?: string;
  healthFix?: string;
  nextAction?: string;
  missing: string[];
  blocker: string;
}) {
  if (brokenLoopFix) return brokenLoopFix;
  if (missing.some((item) => item.toLowerCase().includes('decision timeline'))) {
    return 'Send a follow-up asking for the decision timeline.';
  }
  if (missing.some((item) => item.toLowerCase().includes('decision maker'))) {
    return 'Confirm who owns the decision.';
  }
  if (!nextAction) {
    return 'Create a next action before this account goes quiet.';
  }
  if (blocker.toLowerCase().includes('lead time')) {
    return 'Address the lead time objection with an implementation timeline.';
  }
  if (healthFix) return healthFix;
  return nextAction || 'Create or confirm a follow-up action.';
}

function DecisionBlock({ title, children, warn = false }: { title: string; children: ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${warn ? 'bg-amber-50 text-amber-950' : 'bg-gray-50 text-gray-800'}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-60">{title}</p>
      <div className="mt-2 text-sm leading-6">{children}</div>
    </div>
  );
}

function DecisionList({ title, items, warn = false }: { title: string; items: string[]; warn?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${warn ? 'bg-amber-50 text-amber-950' : 'bg-gray-50 text-gray-800'}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-60">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-6">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
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

function HeaderFact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${warn ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-100 bg-gray-50 text-gray-800'}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function SnapshotFact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${warn ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-800'}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 line-clamp-3 text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function MemorySection({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-brand-blue">{icon}</span>
        <h2 className="text-base font-bold text-navy">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ObjectionCard({ objection, onEdit }: { objection: Objection; onEdit: () => void }) {
  return (
    <article className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-amber-950">{objection.title}</p>
          {objection.detail && <p className="mt-1 text-sm leading-6 text-amber-900">{objection.detail}</p>}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full bg-white p-2 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
          aria-label="Edit objection"
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill label={objection.category} />
        <Pill label={objection.status} tone={objection.status === 'open' ? 'red' : 'gray'} />
        <Pill label={`${objection.severity} severity`} tone={objection.severity === 'high' ? 'red' : 'gray'} />
        <Pill label={`Last mentioned: ${formatDate(objection.last_mentioned_at || objection.updated_at)}`} />
      </div>
      {objection.response_angle && (
        <p className="mt-3 rounded-lg bg-white/70 p-3 text-xs leading-5 text-amber-900">
          <span className="font-bold">Response angle: </span>{objection.response_angle}
        </p>
      )}
      {objection.linked_action && (
        <p className="mt-2 text-xs font-semibold text-amber-900">
          Linked action: {objection.linked_action.title}
        </p>
      )}
    </article>
  );
}

function ObjectionForm({
  draft,
  actions,
  onChange,
  onCancel,
  onSave,
}: {
  draft: ObjectionDraft;
  actions: SalesAction[];
  onChange: (draft: ObjectionDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const update = <K extends keyof ObjectionDraft>(field: K, value: ObjectionDraft[K]) => {
    onChange({ ...draft, [field]: value });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label="Title" value={draft.title} onChange={(value) => update('title', value)} />
        <SelectField label="Category" value={draft.category} options={objectionCategories} onChange={(value) => update('category', value as ObjectionCategory)} />
        <SelectField label="Status" value={draft.status} options={objectionStatuses} onChange={(value) => update('status', value as ObjectionStatus)} />
        <SelectField label="Severity" value={draft.severity} options={objectionSeverities} onChange={(value) => update('severity', value as ObjectionSeverity)} />
        <TextAreaField label="Detail" value={draft.detail} onChange={(value) => update('detail', value)} />
        <TextAreaField label="Response angle" value={draft.response_angle} onChange={(value) => update('response_angle', value)} />
        <label className="block md:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Linked action</span>
          <select
            value={draft.linked_action_id}
            onChange={(event) => update('linked_action_id', event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          >
            <option value="">No linked action</option>
            {actions.map((action) => (
              <option key={action.id} value={action.id}>{action.title}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
        <button type="button" onClick={onSave} className="rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white">Save objection</button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-[76px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Pill({ label, tone = 'gray' }: { label: string; tone?: 'gray' | 'red' }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-white/80 text-gray-700'}`}>
      {label}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US');
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm text-gray-500">{text}</p>;
}

function TagList({ title, items, warm = false }: { title: string; items: string[]; warm?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-sm text-gray-500">None captured.</span>
        ) : items.map((item) => (
          <span key={item} className={`rounded-full px-2.5 py-1 text-xs font-medium ${warm ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
