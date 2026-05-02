import { useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { isDemoMode } from '../../lib/demoMode';
import { readLocalMemory } from './localStore';

const presetQuestions = [
  'Who should I follow up today?',
  'Summarize this account.',
  'What happened last time with this customer?',
  'Which opportunities are stuck?',
  'Write a follow-up message.',
  'What is the next best action for this opportunity?',
];

interface AskResponse {
  answer: string;
  sources: string[];
  suggested_questions: string[];
}

export function AskMemoirePage() {
  const { user } = useAuth();
  const [question, setQuestion] = useState(presetQuestions[0]);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (nextQuestion = question) => {
    if (!user || !nextQuestion.trim()) return;

    setQuestion(nextQuestion);
    setLoading(true);
    setError(null);

    try {
      if (isDemoMode) {
        const memory = readLocalMemory();
        const openActions = memory.actions.filter((action) => action.status === 'open');
        const latestInteraction = memory.interactions[0];
        const stuckOpportunities = memory.opportunities.filter((opportunity) => !opportunity.next_action_text);
        const accountNames = memory.accounts.map((account) => account.name).join(', ');

        setResponse({
          answer: openActions.length > 0
            ? `You should follow up on: ${openActions.map((action) => action.title).join('; ')}. ${accountNames ? `Current account memory includes ${accountNames}.` : ''}`
            : latestInteraction
              ? `No open action is due yet. Last captured interaction: ${latestInteraction.summary}`
              : 'No sales memory captured yet. Start with Quick Capture on Today.',
          sources: [
            ...openActions.slice(0, 3).map((action) => `Action: ${action.title}`),
            ...(stuckOpportunities.length ? [`Stuck opportunities: ${stuckOpportunities.length}`] : []),
          ],
          suggested_questions: presetQuestions.slice(0, 3),
        });
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
        }),
      });

      if (!result.ok) throw new Error('Ask Memoire request failed');
      const data = await result.json();
      setResponse(data);
    } catch (err) {
      console.error(err);
      setError('Ask Memoire could not answer from your sales memory right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Ask Memoire</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Grounded answers from your sales memory</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          Ask about follow-ups, accounts, last touches, stuck opportunities, and next best actions.
        </p>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          {presetQuestions.map((preset) => (
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

        <div className="flex items-end gap-3">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="min-h-[88px] flex-1 resize-y rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          />
          <button
            type="button"
            onClick={() => ask()}
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-navy px-4 text-sm font-semibold text-white disabled:opacity-50"
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
            Reading your sales memory...
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : response ? (
          <div className="space-y-5">
            <p className="text-sm leading-7 text-gray-800">{response.answer}</p>
            {response.sources?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {response.sources.map((source) => (
                    <span key={source} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{source}</span>
                  ))}
                </div>
              </div>
            )}
            {response.suggested_questions?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Next questions</p>
                <div className="flex flex-wrap gap-2">
                  {response.suggested_questions.map((suggestion) => (
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
          <p className="text-sm text-gray-500">Choose a sales-memory question to begin.</p>
        )}
      </section>
    </div>
  );
}
