import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, ExternalLink, Send, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { DEMO_USER_ID } from '../../lib/demoMode';
import type { Account, AskMemoireAnswer, AskMemoireAnswerCard, AskMemoireContext, Interaction, MemoryChange, Objection, Opportunity, SalesAction, SalesPattern } from '../../types/v31';
import { actionFixPresets, answerFromMemory, buildAskMemoireContext, presetsForScope } from './askMemoireContext';
import { detectBrokenLoops, type BrokenLoop } from './brokenLoops';
import { calculateMemoryHealth } from './memoryHealth';
import { buildWhatChangedDigest, formatMemoryChangeSeverity } from './whatChangedDigest';
import { detectSalesPatterns, salesPatternSeverityLabel } from './salesPatternDetector';
import { ASK_ANSWER_READY_EVENT, ASK_GUIDED_QUESTION_EVENT } from '../onboarding/guidedWorkflow';
import { RouteLoadingFallback } from './RouteLoadingFallback';
import { useSlowLoadingFallback } from './useSlowLoadingFallback';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import { adaptWorkspaceToV31 } from './workspaceAdapter';

export function AskMemoirePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [scope, setScope] = useState<AskMemoireContext['scope']>((searchParams.get('scope') as AskMemoireContext['scope']) || 'all');
  const [selectedAccountId, setSelectedAccountId] = useState(searchParams.get('accountId') || '');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(searchParams.get('opportunityId') || '');
  const [question, setQuestion] = useState('What should I do next?');
  const [answer, setAnswer] = useState<AskMemoireAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Ask Memoire uses local rule-based answers when the configured endpoint is unavailable.');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [objections, setObjections] = useState<Objection[]>([]);
  const slowContextLoading = useSlowLoadingFallback(contextLoading);

  const loadMemory = useCallback(async () => {
    setContextLoading(true);
    setError(null);

    try {
      const sampleDataActive = hasLocalSampleData();
      const workspace = await loadSalesWorkspaceData(sampleDataActive ? undefined : user?.id);
      const memory = adaptWorkspaceToV31(workspace, user?.id || DEMO_USER_ID);
      setAccounts(memory.accounts);
      setOpportunities(memory.opportunities);
      setInteractions(memory.interactions);
      setActions(memory.actions);
      setObjections(memory.objections);
    } catch (loadError) {
      if (import.meta.env.DEV) {
        console.debug('[AskMemoire] workspace load failed', {
          message: loadError instanceof Error ? loadError.message : 'Unknown error',
        });
      }
      setError('Memoire could not load this workspace. Your local data is still preserved.');
    } finally {
      setContextLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  useEffect(() => {
    const nextScope = (searchParams.get('scope') as AskMemoireContext['scope']) || 'all';
    setScope(['all', 'account', 'opportunity'].includes(nextScope) ? nextScope : 'all');
    setSelectedAccountId(searchParams.get('accountId') || '');
    setSelectedOpportunityId(searchParams.get('opportunityId') || '');
  }, [searchParams]);

  const contextPacket = useMemo(
    () => buildAskMemoireContext({
      scope,
      accountId: selectedAccountId,
      opportunityId: selectedOpportunityId,
      accounts,
      opportunities,
      interactions,
      actions,
      objections,
    }),
    [accounts, actions, interactions, objections, opportunities, scope, selectedAccountId, selectedOpportunityId]
  );
  const presets = presetsForScope(scope);
  const contextLabel = getContextLabel(scope, selectedAccountId, selectedOpportunityId, accounts, opportunities);
  const visibleOpportunities = scope === 'account' && selectedAccountId
    ? opportunities.filter((opportunity) => opportunity.account_id === selectedAccountId)
    : opportunities;
  const scopedMemory = useMemo(() => ({
    accounts: contextPacket.includedData.accounts || [],
    opportunities: contextPacket.includedData.opportunities || [],
    interactions: contextPacket.includedData.interactions || [],
    actions: contextPacket.includedData.actions || [],
    objections: contextPacket.includedData.objections || [],
  }), [contextPacket]);
  const scopedBrokenLoops = useMemo(
    () => detectBrokenLoops({
      accounts: scopedMemory.accounts,
      opportunities: scopedMemory.opportunities,
      interactions: scopedMemory.interactions,
      actions: scopedMemory.actions,
      objections: scopedMemory.objections,
    }),
    [scopedMemory]
  );
  const scopedMemoryHealth = useMemo(() => {
    const accountHealth = scopedMemory.accounts.map((account) => calculateMemoryHealth(
      { entityType: 'account', entity: account },
      {
        contacts: [],
        opportunities: scopedMemory.opportunities,
        interactions: scopedMemory.interactions,
        actions: scopedMemory.actions,
        objections: scopedMemory.objections,
        brokenLoops: scopedBrokenLoops,
      }
    ));
    const opportunityHealth = scopedMemory.opportunities.map((opportunity) => calculateMemoryHealth(
      { entityType: 'opportunity', entity: opportunity },
      {
        accounts: scopedMemory.accounts,
        contacts: [],
        opportunities: scopedMemory.opportunities,
        interactions: scopedMemory.interactions,
        actions: scopedMemory.actions,
        objections: scopedMemory.objections,
        brokenLoops: scopedBrokenLoops,
      }
    ));
    return [...accountHealth, ...opportunityHealth];
  }, [scopedBrokenLoops, scopedMemory]);
  const whatChanged = useMemo(
    () => buildWhatChangedDigest({
      accounts: scopedMemory.accounts,
      opportunities: scopedMemory.opportunities,
      interactions: scopedMemory.interactions,
      actions: scopedMemory.actions,
      objections: scopedMemory.objections,
      brokenLoops: scopedBrokenLoops,
      memoryHealth: scopedMemoryHealth,
      limit: 5,
    }),
    [scopedBrokenLoops, scopedMemory, scopedMemoryHealth]
  );
  const salesPatterns = useMemo(
    () => detectSalesPatterns({
      accounts: scopedMemory.accounts,
      opportunities: scopedMemory.opportunities,
      interactions: scopedMemory.interactions,
      actions: scopedMemory.actions,
      objections: scopedMemory.objections,
    }),
    [scopedMemory]
  );

  const ask = useCallback(async (nextQuestion = question) => {
    if (!nextQuestion.trim()) {
      setError('Ask a question or choose a preset first.');
      return;
    }
    if (scope === 'account' && !selectedAccountId) {
      setError('Missing context - select an account so Memoire can answer with better context.');
      return;
    }
    if (scope === 'opportunity' && !selectedOpportunityId) {
      setError('Missing context - select an opportunity so Memoire can answer with better context.');
      return;
    }

    setQuestion(nextQuestion);
    setLoading(true);
    setError(null);
    setStatusMessage('');

    try {
      const fallbackAnswer = withAnswerCards(answerFromMemory(nextQuestion, contextPacket), nextQuestion, contextPacket);
      if (scope === 'all' && isAttentionQuestion(nextQuestion)) {
        setStatusMessage('Answered with local rule-based deal memory.');
        setAnswer(answerFromAttention({
          context: contextPacket,
          accounts: scopedMemory.accounts,
          opportunities: scopedMemory.opportunities,
          actions: scopedMemory.actions,
          brokenLoops: scopedBrokenLoops,
          memoryHealth: scopedMemoryHealth,
        }));
        return;
      }
      if (isWhatChangedQuestion(nextQuestion)) {
        setStatusMessage('Answered with local rule-based change detection.');
        setAnswer(answerFromChanges(whatChanged, contextPacket));
        return;
      }
      if (isPatternQuestion(nextQuestion)) {
        setStatusMessage('Answered with local rule-based pattern detection.');
        setAnswer(answerFromPatterns(salesPatterns, contextPacket));
        return;
      }
      if (hasLocalSampleData() || !user) {
        setStatusMessage(user
          ? 'Demo workspace uses local rule-based answers.'
          : 'You are in local mode. Ask Memoire is using rule-based fallback; sign in to use configured cloud context.');
        setAnswer(fallbackAnswer);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const result = await fetch('/api/ask-memoire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: nextQuestion,
          userId: user.id,
          authToken: session?.access_token,
          scope,
          accountId: selectedAccountId || undefined,
          opportunityId: selectedOpportunityId || undefined,
        }),
      });

      if (!result.ok) {
        setStatusMessage('Ask endpoint unavailable - showing a local rule-based answer.');
        setAnswer(fallbackAnswer);
        return;
      }
      const data = await result.json();
      setStatusMessage('Answered with the configured Ask endpoint.');
      setAnswer(withAnswerCards({
        answer: data.answer || fallbackAnswer.answer,
        contextUsed: data.sources || fallbackAnswer.contextUsed,
        suggestedNextAction: data.suggested_next_action || fallbackAnswer.suggestedNextAction,
        missingContext: data.missing_context || fallbackAnswer.missingContext,
        suggestedQuestions: data.suggested_questions || fallbackAnswer.suggestedQuestions,
      }, nextQuestion, contextPacket));
    } catch (err) {
      if (import.meta.env.DEV) {
        console.debug('[Ask Memoire] falling back to local answer', { message: err instanceof Error ? err.message : 'Unknown error' });
      }
      setStatusMessage('Ask Memoire could not reach the configured endpoint. Local rules are still available.');
      setAnswer(withAnswerCards(answerFromMemory(nextQuestion, contextPacket), nextQuestion, contextPacket));
    } finally {
      setLoading(false);
    }
  }, [
    question,
    user,
    scope,
    selectedAccountId,
    selectedOpportunityId,
    contextPacket,
    scopedMemory,
    scopedBrokenLoops,
    scopedMemoryHealth,
    whatChanged,
    salesPatterns,
  ]);

  useEffect(() => {
    if (!answer) return;
    window.dispatchEvent(new Event(ASK_ANSWER_READY_EVENT));
  }, [answer]);

  useEffect(() => {
    const handleGuidedQuestion = (event: Event) => {
      const nextQuestion = (event as CustomEvent<{ question?: string }>).detail?.question || 'What should I do next?';
      ask(nextQuestion);
    };

    window.addEventListener(ASK_GUIDED_QUESTION_EVENT, handleGuidedQuestion as EventListener);
    return () => window.removeEventListener(ASK_GUIDED_QUESTION_EVENT, handleGuidedQuestion as EventListener);
  }, [ask]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Ask Memoire</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Ask why deals may go silent</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          Choose a context and ask Memoire about stuck deals, missing follow-ups, unresolved objections, or account context.
        </p>
        <p className="mt-2 max-w-2xl text-xs font-semibold text-gray-500">
          Presets run immediately. If the Ask endpoint is unavailable, Memoire shows a local rule-based answer.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-amber-700">
          Cloud answers may send the selected sales context to your configured AI provider. Do not include
          confidential customer data unless that provider is approved by your organization.
        </p>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
          {slowContextLoading && <RouteLoadingFallback onRetry={loadMemory} />}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Context Selector</p>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-navy ring-1 ring-gray-200">
              Current context: {contextLabel}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'account', 'opportunity'] as AskMemoireContext['scope'][]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setScope(item);
                  setAnswer(null);
                  setError(null);
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${scope === item ? 'bg-navy text-white' : 'border border-gray-200 bg-white text-gray-600'}`}
              >
                {item === 'all' ? 'All Deals' : item === 'account' ? 'Specific Account' : 'Specific Opportunity'}
              </button>
            ))}
          </div>

          {scope === 'account' && (
            <>
              <select
                value={selectedAccountId}
                onChange={(event) => {
                  setSelectedAccountId(event.target.value);
                  setAnswer(null);
                }}
                disabled={contextLoading}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              >
                <option value="">Choose account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
              {!selectedAccountId && <p className="mt-2 text-xs text-gray-500">Select an account so Memoire can answer with better context.</p>}
            </>
          )}

          {scope === 'opportunity' && (
            <>
              <select
                value={selectedOpportunityId}
                onChange={(event) => {
                  setSelectedOpportunityId(event.target.value);
                  setAnswer(null);
                }}
                disabled={contextLoading}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              >
                <option value="">Choose opportunity</option>
                {visibleOpportunities.map((opportunity) => (
                  <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>
                ))}
              </select>
              {!selectedOpportunityId && <p className="mt-2 text-xs text-gray-500">Select an opportunity so Memoire can answer with deal-specific account context.</p>}
            </>
          )}
        </div>

        <div className="mb-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            {scope === 'all' ? 'Stuck deal presets' : scope === 'account' ? 'Account presets' : 'Opportunity presets'}
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => ask(preset)}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:border-brand-blue/40 hover:text-brand-blue"
              >
                {preset}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Click a preset to run it, or edit the question below before asking.</p>
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Action / fix prompts</p>
          <div className="flex flex-wrap gap-2">
            {actionFixPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => ask(preset)}
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-brand-blue hover:border-brand-blue/40"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !loading) {
                event.preventDefault();
                void ask();
              }
            }}
            aria-label="Ask Memoire a question"
            placeholder="Ask about stuck deals, missing follow-ups, or selected account context..."
            className="min-h-[88px] flex-1 resize-y rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          />
          <button
            type="button"
            onClick={() => ask()}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-navy px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Ask
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">Press Ctrl+Enter (Cmd+Enter on Mac) to ask.</p>
      </section>

      <section className="mt-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
            <Bot className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold text-navy">Answer</h2>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Building answer...
          </div>
        ) : error ? (
          <p className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : answer ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                Answer ready
              </span>
              {statusMessage && (
                <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand-blue">
                  {statusMessage}
                </span>
              )}
            </div>
            {answer.cards && answer.cards.length > 0 ? (
              <div className="grid gap-4">
                {answer.cards.map((card, index) => (
                  <AnswerCard key={`${card.kind}-${card.title}-${index}`} card={card} />
                ))}
              </div>
            ) : answer.answer && answer.answer.trim() ? (
              <p className="whitespace-pre-line text-sm leading-7 text-gray-800">{answer.answer}</p>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                <p className="text-sm font-bold text-navy">Memoire doesn't have enough sales memory to answer this yet.</p>
                <p className="mt-1 text-sm text-gray-600">
                  Answers are built from your captured activity. Capture a customer note or add an opportunity, then ask again.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/app/capture" className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-navy/90">
                    Capture a sales update
                  </Link>
                  <Link to="/app/opportunities?new=1" className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
                    Add an opportunity
                  </Link>
                </div>
              </div>
            )}
            {answer.cards && answer.cards.length > 0 && answer.answer && (
              <details className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-gray-500">Structured text</summary>
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-700">{answer.answer}</p>
              </details>
            )}
            <AnswerBlock title="Based on / Context used" items={answer.contextUsed} />
            {answer.suggestedNextAction && <AnswerBlock title="Suggested next action" items={[answer.suggestedNextAction]} tone="blue" />}
            {answer.missingContext.length > 0 && <AnswerBlock title="Missing context" items={answer.missingContext} tone="amber" />}
            {answer.suggestedQuestions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Next questions</p>
                <div className="flex flex-wrap gap-2">
                  {answer.suggestedQuestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => ask(suggestion)}
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:border-brand-blue/40 hover:text-brand-blue"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Choose a preset or ask a question. Memoire can answer with local rules when the endpoint is unavailable.</p>
        )}
      </section>
    </div>
  );
}

function withAnswerCards(answer: AskMemoireAnswer, question: string, context: AskMemoireContext): AskMemoireAnswer {
  const normalized = question.toLowerCase();
  const accounts = context.includedData.accounts || [];
  const opportunities = context.includedData.opportunities || [];
  const interactions = context.includedData.interactions || [];
  const actions = context.includedData.actions || [];
  const objections = context.includedData.objections || [];
  const account = accounts[0];
  const opportunity = opportunities.find((item) => !['won', 'lost'].includes(item.stage)) || opportunities[0];
  const latestInteraction = [...interactions].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
  const openAction = actions.find((action) => action.status === 'open');
  const openObjections = objections.filter((objection) => objection.status === 'open');
  const blocker = openObjections[0]?.title || opportunity?.blocker || interactions.find((item) => item.objection)?.objection || '';
  const missingContext = normalizeMissing(answer.missingContext.length > 0 ? answer.missingContext : context.missingContext);
  const nextAction = answer.suggestedNextAction || openAction?.title || opportunity?.next_action_text || '';
  const contextHref = account?.id
    ? `/app/accounts?accountId=${encodeURIComponent(account.id)}`
    : opportunity?.account_id
      ? `/app/accounts?accountId=${encodeURIComponent(opportunity.account_id)}`
      : undefined;
  const opportunityHref = opportunity?.id ? '/app/opportunities' : undefined;
  const commonCtas = [
    contextHref ? { label: 'Open Account', href: contextHref } : null,
    opportunityHref ? { label: 'Open Opportunity', href: opportunityHref } : null,
    contextHref ? { label: 'Draft Follow-up', href: contextHref, note: 'Open Account Memory to draft from context.' } : null,
    { label: 'Capture Update', href: '/app/capture' },
  ].filter(Boolean) as AskMemoireAnswerCard['ctas'];

  if (normalized.includes('draft') || normalized.includes('follow-up') || normalized.includes('follow up') || normalized.includes('address this objection') || normalized.includes('ask the customer')) {
    return {
      ...answer,
      cards: [{
        kind: 'follow_up',
        title: 'Follow-up suggestion',
        fields: [
          { label: 'Goal', value: normalized.includes('address') ? 'Address the objection' : 'Move the follow-up forward' },
          { label: 'Recipient', value: account?.name || 'Recipient not known yet' },
          { label: 'What to mention', value: [latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '', blocker ? `Concern: ${blocker}` : '', nextAction ? `Next action: ${nextAction}` : ''].filter(Boolean) },
          { label: 'Missing context', value: missingContext.length > 0 ? missingContext : ['No major missing context detected.'] },
          { label: 'Draft follow-up', value: answer.answer || 'Memoire does not have enough context to draft confidently.' },
        ],
        ctas: commonCtas,
      }],
    };
  }

  if (context.scope === 'opportunity' || normalized.includes('opportunity') || normalized.includes('deal stuck') || normalized.includes('blocking this')) {
    return {
      ...answer,
      cards: [{
        kind: 'opportunity',
        title: opportunity ? `${account?.name || 'Account'} / ${opportunity.title}` : 'Selected opportunity',
        fields: [
          { label: 'Deal status', value: opportunity ? `${opportunity.title} (${opportunity.stage})` : 'Opportunity context missing' },
          { label: 'Blocker', value: blocker || 'No blocker captured yet', tone: blocker ? 'warning' : 'default' },
          { label: 'Evidence', value: [latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '', blocker ? `Blocker: ${blocker}` : '', nextAction ? `Next action: ${nextAction}` : 'No open next action found'].filter(Boolean) },
          { label: 'Missing context', value: missingContext.length > 0 ? missingContext : ['No major missing context detected.'] },
          { label: 'Suggested fix', value: answer.suggestedNextAction || nextAction || 'Create or confirm a follow-up action.', tone: 'warning' },
          { label: 'Next action', value: nextAction || 'Memoire does not know the next action yet.' },
        ],
        ctas: commonCtas,
      }],
    };
  }

  if (context.scope === 'account' || normalized.includes('account') || normalized.includes('memoire know') || normalized.includes('last time') || normalized.includes('what should i do next')) {
    return {
      ...answer,
      cards: [{
        kind: 'account',
        title: account?.name || 'Selected account',
        fields: [
          { label: 'Current story', value: account?.summary || latestInteraction?.summary || 'Memoire does not have enough account story yet.' },
          { label: 'Why this account may go silent', value: blocker || (!nextAction ? 'Missing follow-up' : 'No major silent-deal risk detected.'), tone: blocker || !nextAction ? 'warning' : 'good' },
          { label: 'Based on', value: [latestInteraction ? `Last interaction: ${latestInteraction.summary}` : '', opportunity ? `Opportunity: ${opportunity.title}` : '', openObjections.length > 0 ? `Open objection: ${openObjections.map((item) => item.title).join('; ')}` : '', nextAction ? `Next action: ${nextAction}` : ''].filter(Boolean) },
          { label: 'Memoire knows', value: [account?.name ? `Account: ${account.name}` : '', opportunity?.title ? `Opportunity: ${opportunity.title}` : '', blocker ? `Blocker: ${blocker}` : '', latestInteraction ? 'Recent interaction captured' : ''].filter(Boolean) },
          { label: 'Memoire does not know', value: missingContext.length > 0 ? missingContext : ['No major missing context detected.'] },
          { label: 'Suggested next move', value: answer.suggestedNextAction || nextAction || 'Create or confirm a follow-up action.', tone: 'warning' },
        ],
        ctas: commonCtas,
      }],
    };
  }

  return answer;
}

function normalizeMissing(items: string[]) {
  return unique(items.flatMap((item) => {
    if (item.toLowerCase().includes('decision maker') && item.toLowerCase().includes('timeline')) {
      return ['Decision maker', 'Decision timeline'];
    }
    return [item];
  }));
}

function isWhatChangedQuestion(question: string) {
  const normalized = question.toLowerCase();
  return normalized.includes('what changed') || normalized.includes('changed recently');
}

function getContextLabel(
  scope: AskMemoireContext['scope'],
  selectedAccountId: string,
  selectedOpportunityId: string,
  accounts: Account[],
  opportunities: Opportunity[]
) {
  if (scope === 'all') return 'All Memory';
  if (scope === 'account') {
    return accounts.find((account) => account.id === selectedAccountId)?.name || 'Select Account';
  }
  return opportunities.find((opportunity) => opportunity.id === selectedOpportunityId)?.title || 'Select Opportunity';
}

function isPatternQuestion(question: string) {
  const normalized = question.toLowerCase();
  return normalized.includes('pattern') || normalized.includes('sales activity');
}

function isAttentionQuestion(question: string) {
  const normalized = question.toLowerCase();
  return [
    'what needs attention',
    'what needs attention today',
    'which accounts need attention',
    'which accounts need action',
    'which deals may go silent',
    'which accounts need follow-up',
    'which objections are unresolved',
    'what should i fix today',
    'stuck deals',
    'deals may go silent',
    'what should i focus on',
    'which deals are broken',
    'which accounts are broken',
    'show stuck deals',
    'what are my stuck deals',
    'which deals are missing next actions',
    'missing next actions',
  ].some((pattern) => normalized.includes(pattern));
}

function answerFromAttention({
  context,
  accounts,
  opportunities,
  actions,
  brokenLoops,
  memoryHealth,
}: {
  context: AskMemoireContext;
  accounts: Account[];
  opportunities: Opportunity[];
  actions: SalesAction[];
  brokenLoops: BrokenLoop[];
  memoryHealth: ReturnType<typeof calculateMemoryHealth>[];
}): AskMemoireAnswer {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const openActionsByAccount = firstBy(actions.filter((action) => action.status === 'open'), (action) => action.account_id || '');
  const openActionsByOpportunity = firstBy(actions.filter((action) => action.status === 'open'), (action) => action.opportunity_id || '');
  const seen = new Set<string>();

  const loopItems = brokenLoops.map((loop) => ({
    id: `loop-${loop.id}`,
    rank: loop.priority === 'P0' ? 0 : loop.priority === 'P1' ? 1 : 2,
    entityKey: loop.opportunityId ? `opportunity-${loop.opportunityId}` : loop.accountId ? `account-${loop.accountId}` : `${loop.entityType}-${loop.entityId}`,
    entityName: loop.affectedEntity,
    reason: `${loop.issue}: ${loop.whyItMatters}`,
    signalSource: 'Stuck Deal Queue',
    suggestedNextAction: loop.suggestedFix,
    missingContext: [] as string[],
    accountId: loop.accountId,
    opportunityId: loop.opportunityId,
    issue: loop.issue,
    whyItMatters: loop.whyItMatters,
  }));

  const healthItems = memoryHealth
    .filter((health) => health.status === 'broken' || health.status === 'needs_attention')
    .map((health) => {
      const opportunity = health.entityType === 'opportunity' ? opportunityById.get(health.entityId) : undefined;
      const account = health.entityType === 'account'
        ? accountById.get(health.entityId)
        : accountById.get(opportunity?.account_id || '');
      const linkedAction = health.entityType === 'opportunity'
        ? openActionsByOpportunity.get(health.entityId)
        : openActionsByAccount.get(health.entityId);

      return {
        id: `health-${health.entityType}-${health.entityId}`,
        rank: health.status === 'broken' ? 3 : 4,
        entityKey: `${health.entityType}-${health.entityId}`,
        entityName: opportunity ? `${account?.name || 'Unknown account'} / ${opportunity.title}` : account?.name || 'Unknown account',
        reason: health.reasons[0] || (health.status === 'broken' ? 'This deal may go silent.' : 'Account context needs more detail.'),
        signalSource: 'Context Health',
        suggestedNextAction: linkedAction?.title || health.suggestedFixes[0] || 'Create or confirm the next action.',
        missingContext: health.missingContext,
        accountId: account?.id,
        opportunityId: opportunity?.id,
        issue: health.status === 'broken' ? 'Deal at risk' : 'Weak context',
        whyItMatters: health.reasons[0] || 'Memoire does not have enough context to help you act confidently.',
      };
    });

  const rankedItems = [...loopItems, ...healthItems]
    .sort((a, b) => a.rank - b.rank)
    .filter((item) => {
      if (seen.has(item.entityKey)) return false;
      seen.add(item.entityKey);
      return true;
    })
    .slice(0, 8);

  if (rankedItems.length === 0) {
    return {
      answer: 'No major stuck-deal items detected. Your accounts have enough context and follow-up for now.',
      contextUsed: ['All Deals', 'Stuck Deal Queue', 'Context Health'],
      missingContext: [],
      suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
    };
  }

  return {
    answer: `Deals that may go silent:\n${rankedItems.map((item, index) => [
      `${index + 1}. ${item.entityName}`,
      `   Issue: ${item.reason}`,
      `   Evidence: ${item.signalSource}`,
      `   Suggested fix: ${item.suggestedNextAction}`,
    ].join('\n')).join('\n\n')}`,
    contextUsed: ['All Deals', `${brokenLoops.length} stuck-deal signal(s)`, `${memoryHealth.length} Context Health signal(s)`],
    suggestedNextAction: rankedItems[0]?.suggestedNextAction,
    missingContext: unique(rankedItems.flatMap((item) => item.missingContext)).slice(0, 5),
    suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
    cards: rankedItems.slice(0, 5).map((item): AskMemoireAnswerCard => ({
      kind: 'stuck_deal',
      title: item.entityName,
      fields: [
        { label: 'Issue', value: item.issue || item.reason, tone: 'warning' },
        { label: 'Why it may go silent', value: item.whyItMatters || item.reason, tone: 'warning' },
        { label: 'Evidence', value: [item.signalSource] },
        { label: 'Missing context', value: item.missingContext.length > 0 ? item.missingContext : ['No additional missing context detected.'] },
        { label: 'Suggested fix', value: item.suggestedNextAction, tone: 'warning' },
      ],
      ctas: [
        item.accountId ? { label: 'Open Account', href: `/app/accounts?accountId=${encodeURIComponent(item.accountId)}` } : null,
        item.opportunityId ? { label: 'Open Opportunity', href: `/app/opportunities` } : null,
        item.accountId ? { label: 'Draft Follow-up', href: `/app/accounts?accountId=${encodeURIComponent(item.accountId)}`, note: 'Open Account Memory to draft from context.' } : null,
        { label: 'Capture Update', href: '/app/capture' },
      ].filter(Boolean) as AskMemoireAnswerCard['ctas'],
    })),
  };
}

function answerFromChanges(changes: MemoryChange[], context: AskMemoireContext): AskMemoireAnswer {
  if (changes.length === 0) {
    return {
      answer: 'No major changes yet. Capture interactions and Memoire will summarize what changed here.',
      contextUsed: ['What Changed Digest', context.scope === 'all' ? 'All Memory' : context.scope],
      missingContext: context.missingContext,
      suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
    };
  }

  return {
    answer: `Recent meaningful changes:\n${changes.map((change) => `- [${formatMemoryChangeSeverity(change.severity)}] ${change.title}: ${change.description}`).join('\n')}`,
    contextUsed: ['What Changed Digest', `${changes.length} recent changes`, context.scope === 'all' ? 'All Memory' : context.scope],
    suggestedNextAction: changes.find((change) => change.suggestedReviewAction)?.suggestedReviewAction,
    missingContext: context.missingContext,
    suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
  };
}

function answerFromPatterns(patterns: SalesPattern[], context: AskMemoireContext): AskMemoireAnswer {
  if (patterns.length === 0) {
    return {
      answer: 'No clear pattern detected yet. Capture more interactions and actions so Memoire can learn from your sales activity.',
      contextUsed: ['Sales Pattern Detector', context.scope === 'all' ? 'All Memory' : context.scope],
      missingContext: context.missingContext,
      suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
    };
  }

  return {
    answer: patterns.slice(0, 3).map((pattern) => [
      `[${salesPatternSeverityLabel(pattern.severity)}] ${pattern.title}`,
      pattern.insight,
      `Evidence: ${pattern.evidence.slice(0, 3).join('; ')}`,
      `Suggested behavior: ${pattern.suggestedBehavior}`,
    ].join('\n')).join('\n\n'),
    contextUsed: ['Sales Pattern Detector', `${patterns.length} pattern(s) detected`, context.scope === 'all' ? 'All Memory' : context.scope],
    suggestedNextAction: patterns[0]?.suggestedBehavior,
    missingContext: context.missingContext,
    suggestedQuestions: presetsForScope(context.scope).slice(0, 4),
  };
}

function AnswerCard({ card }: { card: AskMemoireAnswerCard }) {
  const toneClass = {
    stuck_deal: 'border-amber-200 bg-amber-50/40',
    account: 'border-blue-100 bg-blue-50/30',
    opportunity: 'border-violet-100 bg-violet-50/30',
    follow_up: 'border-emerald-100 bg-emerald-50/30',
  }[card.kind];

  return (
    <article className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{card.kind.replace('_', ' ')}</p>
          <h3 className="mt-1 text-base font-bold text-navy">{card.title}</h3>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {card.fields.map((field) => (
          <CardField key={field.label} field={field} />
        ))}
      </div>
      {card.ctas && card.ctas.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {card.ctas.map((cta) => cta.href ? (
            <Link
              key={`${cta.label}-${cta.href}`}
              to={cta.href}
              title={cta.note}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:border-brand-blue/40 hover:text-brand-blue"
            >
              {cta.label}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span key={cta.label} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
              {cta.label}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function CardField({ field }: { field: AskMemoireAnswerCard['fields'][number] }) {
  const tone = {
    default: 'bg-white/80 text-gray-800',
    warning: 'bg-amber-50 text-amber-950 ring-1 ring-amber-100',
    good: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
  }[field.tone || 'default'];
  const values = Array.isArray(field.value) ? field.value.filter(Boolean) : [field.value].filter(Boolean);

  return (
    <div className={`rounded-lg p-3 ${tone}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-60">{field.label}</p>
      {values.length > 1 ? (
        <ul className="mt-2 space-y-1 text-sm leading-6">
          {values.map((value) => (
            <li key={value} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
              <span>{value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 whitespace-pre-line text-sm leading-6">{values[0] || 'Memoire does not know yet.'}</p>
      )}
    </div>
  );
}

function AnswerBlock({ title, items, tone = 'gray' }: { title: string; items: string[]; tone?: 'gray' | 'blue' | 'amber' }) {
  const toneClass = {
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-50 text-brand-blue',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function firstBy<T>(items: T[], getKey: (item: T) => string) {
  const result = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (key && !result.has(key)) result.set(key, item);
  });
  return result;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
