import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from './_env';
import { enforceRateLimit } from './_rateLimit';

interface ApiRequest {
  method?: string;
  headers?: Record<string, unknown>;
  socket?: { remoteAddress?: string };
  body?: {
    question?: unknown;
    userId?: unknown;
    authToken?: unknown;
    scope?: unknown;
    accountId?: unknown;
    opportunityId?: unknown;
  };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

interface AnthropicTextBlock {
  type?: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content?: AnthropicTextBlock[];
}

interface OpportunityMemory {
  account_id?: string | null;
  next_action_text?: string | null;
  last_touch_at?: string | null;
}

interface AskMemoireResponse {
  answer: string;
  sources: string[];
  suggested_questions: string[];
  suggested_next_action?: string;
  missing_context?: string[];
}

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

const groq = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  : null;

const allowedQuestions = [
  'Who should I follow up today?',
  'Summarize this account.',
  'What happened last time with this customer?',
  'Which opportunities are stuck?',
  'Write a follow-up message.',
  'What is the next best action for this opportunity?',
];

function buildPrompt(question: string, memory: unknown) {
  return `You are Ask Memoire, a retrieval assistant grounded only in one seller's personal sales memory.

Allowed jobs:
- who to follow up today
- summarize an account
- explain last interaction with a customer
- identify stuck opportunities
- draft a concise follow-up message
- recommend the next best action for an opportunity

Do not act like a generic chatbot. Do not invent facts. If memory is missing, say what is missing.

User question: ${question}

Sales memory JSON:
${JSON.stringify(memory, null, 2)}

Return JSON:
{
  "answer": "short grounded answer",
  "sources": ["short source labels"],
  "suggested_questions": ["one", "two", "three"]
}`;
}

function parseAskResponse(text: string): AskMemoireResponse {
  try {
    const parsed = JSON.parse(text) as Partial<AskMemoireResponse>;
    return {
      answer: parsed.answer || text,
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      suggested_questions: Array.isArray(parsed.suggested_questions)
        ? parsed.suggested_questions
        : allowedQuestions.slice(0, 3),
    };
  } catch {
    return {
      answer: text || 'I could not synthesize an answer from your sales memory yet.',
      sources: [],
      suggested_questions: allowedQuestions.slice(0, 3),
    };
  }
}

async function synthesize(question: string, memory: unknown): Promise<AskMemoireResponse> {
  const prompt = buildPrompt(question, memory);

  if (process.env.ANTHROPIC_API_KEY) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 700,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Claude request failed: ${response.status}`);
    const data = await response.json() as AnthropicMessageResponse;
    const text = data.content?.[0]?.text;
    if (!text) throw new Error('Empty Claude response');
    return parseAskResponse(text);
  }

  if (!groq) {
    return {
      answer: 'Ask Memoire is ready, but no AI provider is configured for synthesis yet.',
      sources: [],
      suggested_questions: allowedQuestions.slice(0, 3),
    };
  }

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    max_tokens: 700,
    temperature: 0.1,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error('Empty Groq response');
  return parseAskResponse(text);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, userId, authToken, scope = 'all', accountId, opportunityId } = req.body || {};
  if (!question || !userId || !authToken) {
    return res.status(400).json({ error: 'question, userId, authToken required' });
  }
  if (typeof question !== 'string' || typeof userId !== 'string' || typeof authToken !== 'string') {
    return res.status(400).json({ error: 'Invalid request payload' });
  }
  if (question.trim().length < 2 || question.length > 1000) {
    return res.status(400).json({ error: 'Question must be between 2 and 1000 characters.' });
  }
  if (typeof scope !== 'string' || !['all', 'account', 'opportunity'].includes(scope)) {
    return res.status(400).json({ error: 'Invalid scope' });
  }

  const supabase = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: `Bearer ${authToken}` } } }
  );

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const rateLimit = enforceRateLimit(req, 'ask-memoire', userId, 12);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Too many requests. Please wait before asking again.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 14);

    let accountsQuery = supabase.from('accounts').select('id,name,summary,pain_points,objections').eq('user_id', userId).limit(20);
    let opportunitiesQuery = supabase
        .from('opportunities')
        .select('id,account_id,title,stage,estimated_value,blocker,next_action_text,last_touch_at,urgency,confidence,account:account_id(id,name)')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(30);
    let actionsQuery = supabase
        .from('actions')
        .select('id,title,due_date,status,suggested,account:account_id(id,name),opportunity:opportunity_id(id,title)')
        .eq('user_id', userId)
        .eq('status', 'open')
        .order('due_date', { ascending: true })
        .limit(20);
    let interactionsQuery = supabase
        .from('interactions')
        .select('id,summary,pain_point,objection,occurred_at,raw_note,account:account_id(id,name),opportunity:opportunity_id(id,title)')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .limit(25);
    let objectionsQuery = supabase
        .from('objections')
        .select('id,title,detail,category,status,severity,response_angle,account_id,opportunity_id,linked_action_id,last_mentioned_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(25);

    if (scope === 'account' && typeof accountId === 'string') {
      accountsQuery = accountsQuery.eq('id', accountId);
      opportunitiesQuery = opportunitiesQuery.eq('account_id', accountId);
      actionsQuery = actionsQuery.eq('account_id', accountId);
      interactionsQuery = interactionsQuery.eq('account_id', accountId);
      objectionsQuery = objectionsQuery.eq('account_id', accountId);
    }

    if (scope === 'opportunity' && typeof opportunityId === 'string') {
      opportunitiesQuery = opportunitiesQuery.eq('id', opportunityId);
      actionsQuery = actionsQuery.eq('opportunity_id', opportunityId);
      interactionsQuery = interactionsQuery.eq('opportunity_id', opportunityId);
      objectionsQuery = objectionsQuery.eq('opportunity_id', opportunityId);
    } else {
      actionsQuery = actionsQuery.lte('due_date', today);
    }

    const [accounts, opportunities, actions, interactions, objections] = await Promise.all([
      accountsQuery,
      opportunitiesQuery,
      actionsQuery,
      interactionsQuery,
      objectionsQuery,
    ]);

    if (accounts.error) throw accounts.error;
    if (opportunities.error) throw opportunities.error;
    if (actions.error) throw actions.error;
    if (interactions.error) throw interactions.error;
    if (objections.error) throw objections.error;

    let scopedAccounts = accounts.data || [];
    if (scope === 'opportunity') {
      const accountIdFromOpportunity = ((opportunities.data || []) as OpportunityMemory[])[0]?.account_id;
      if (accountIdFromOpportunity) {
        const accountResult = await supabase
          .from('accounts')
          .select('id,name,summary,pain_points,objections')
          .eq('user_id', userId)
          .eq('id', accountIdFromOpportunity)
          .single();
        if (!accountResult.error && accountResult.data) scopedAccounts = [accountResult.data];
      }
    }

    const stuckOpportunities = ((opportunities.data || []) as OpportunityMemory[]).filter((opportunity) => {
      const noNextAction = !opportunity.next_action_text;
      const isStale = opportunity.last_touch_at
        ? new Date(opportunity.last_touch_at) < staleDate
        : true;
      return noNextAction || isStale;
    });

    const result = await synthesize(question, {
      allowed_questions: allowedQuestions,
      scope,
      accounts: scopedAccounts,
      due_actions: actions.data || [],
      opportunities: opportunities.data || [],
      stuck_opportunities: stuckOpportunities,
      recent_interactions: interactions.data || [],
      objections: objections.data || [],
    });

    result.suggested_next_action = (actions.data || [])[0]?.title || ((opportunities.data || []) as OpportunityMemory[])[0]?.next_action_text || undefined;
    result.missing_context = [
      scopedAccounts.length === 0 ? 'Account' : '',
      (interactions.data || []).length === 0 ? 'Recent interaction' : '',
      (actions.data || []).length === 0 ? 'Open action' : '',
      (opportunities.data || []).length === 0 ? 'Opportunity stage' : '',
      'Decision maker',
    ].filter(Boolean);

    return res.status(200).json(result);
  } catch (err) {
    console.error('[ask-memoire] failed:', err);
    return res.status(500).json({ error: 'ask_memoire_failed' });
  }
}
