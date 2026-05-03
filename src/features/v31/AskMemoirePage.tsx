/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Send, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isDemoMode } from '../../lib/demoMode';
import type { Account, AskMemoireAnswer, AskMemoireContext, Interaction, MemoryChange, Objection, Opportunity, SalesAction, SalesPattern } from '../../types/v31';
import { readLocalMemory } from './localStore';
import { answerFromMemory, buildAskMemoireContext, presetsForScope } from './askMemoireContext';
import { detectBrokenLoops } from './brokenLoops';
import { calculateMemoryHealth } from './memoryHealth';
import { buildWhatChangedDigest, formatMemoryChangeSeverity } from './whatChangedDigest';
import { detectSalesPatterns, salesPatternSeverityLabel } from './salesPatternDetector';

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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [actions, setActions] = useState<SalesAction[]>([]);
  const [objections, setObjections] = useState<Objection[]>([]);

  const loadMemory = useCallback(async () => {
    if (!user) return;
    setContextLoading(true);

    if (isDemoMode) {
      const memory = readLocalMemory();
      setAccounts(memory.accounts);
      setOpportunities(memory.opportunities);
      setInteractions(memory.interactions);
      setActions(memory.actions);
      setObjections(memory.objections);
      setContextLoading(false);
      return;
    }

    const [accountResult, opportunityResult, interactionResult, actionResult, objectionResult] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('opportunities').select('*,account:account_id(id,name),contact:contact_id(id,name,role)').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('interactions').select('*').eq('user_id', user.id).order('occurred_at', { ascending: false }).limit(120),
      supabase.from('actions').select('*,account:account_id(id,name),contact:contact_id(id,name,role),opportunity:opportunity_id(id,title,stage)').eq('user_id', user.id).order('due_date', { ascending: true, nullsFirst: false }).limit(80),
      supabase.from('objections').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(120),
    ]);

    if (!accountResult.error) setAccounts((accountResult.data || []) as Account[]);
    if (!opportunityResult.error) setOpportunities((opportunityResult.data || []) as Opportunity[]);
    if (!interactionResult.error) setInteractions((interactionResult.data || []) as Interaction[]);
    if (!actionResult.error) setActions((actionResult.data || []) as SalesAction[]);
    if (!objectionResult.error) setObjections((objectionResult.data || []) as Objection[]);
    setContextLoading(false);
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

  const ask = async (nextQuestion = question) => {
    if (!user || !nextQuestion.trim()) return;
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

    try {
      const fallbackAnswer = answerFromMemory(nextQuestion, contextPacket);
      if (isWhatChangedQuestion(nextQuestion)) {
        setAnswer(answerFromChanges(whatChanged, contextPacket));
        return;
      }
      if (isPatternQuestion(nextQuestion)) {
        setAnswer(answerFromPatterns(salesPatterns, contextPacket));
        return;
      }
      if (isDemoMode) {
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
        setAnswer(fallbackAnswer);
        return;
      }
      const data = await result.json();
      setAnswer({
        answer: data.answer || fallbackAnswer.answer,
        contextUsed: data.sources || fallbackAnswer.contextUsed,
        suggestedNextAction: data.suggested_next_action || fallbackAnswer.suggestedNextAction,
        missingContext: data.missing_context || fallbackAnswer.missingContext,
        suggestedQuestions: data.suggested_questions || fallbackAnswer.suggestedQuestions,
      });
    } catch (err) {
      console.error(err);
      setAnswer(answerFromMemory(nextQuestion, contextPacket));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Ask Memoire</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Ask selected sales memory</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          Choose the memory context first, then ask for a grounded answer.
        </p>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Context Selector</p>
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
                {item === 'all' ? 'All Memory' : item === 'account' ? 'Specific Account' : 'Specific Opportunity'}
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
              {!selectedOpportunityId && <p className="mt-2 text-xs text-gray-500">Select an opportunity so Memoire can answer with deal-specific Sales Memory.</p>}
            </>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask Memoire about selected memory..."
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
            Querying Ask Memoire...
          </div>
        ) : error ? (
          <p className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : answer ? (
          <div className="space-y-5">
            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              Answer ready
            </span>
            <p className="whitespace-pre-line text-sm leading-7 text-gray-800">{answer.answer}</p>
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
          <p className="text-sm text-gray-500">Choose context and ask a sales-memory question to begin.</p>
        )}
      </section>
    </div>
  );
}

function isWhatChangedQuestion(question: string) {
  const normalized = question.toLowerCase();
  return normalized.includes('what changed') || normalized.includes('changed recently');
}

function isPatternQuestion(question: string) {
  const normalized = question.toLowerCase();
  return normalized.includes('pattern') || normalized.includes('sales activity');
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
