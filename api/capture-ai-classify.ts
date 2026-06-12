import { buildCaptureAiMessages, captureAiActivityTypes } from './_captureAiPrompt';
import { getBearerToken, verifyUserToken } from './_auth.js';
import { enforceRateLimit } from './_rateLimit.js';

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, unknown>;
  socket?: { remoteAddress?: string };
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

type CaptureAiRequest = {
  rawNote: string;
  activityDate: string;
  opportunities: LightweightOpportunity[];
  accounts: LightweightAccount[];
};

type LightweightOpportunity = {
  id: string;
  accountName: string;
  opportunityName: string;
  stage?: string;
  productOrSolution?: string;
};

type LightweightAccount = {
  id: string;
  accountName: string;
  segment?: string;
  industry?: string;
};

type CaptureAiSuggestion = {
  activityType: string;
  accountName: string;
  opportunityName: string;
  contactName: string;
  stakeholderName: string;
  stakeholderRole: string;
  summary: string;
  nextAction: string;
  dueDate: string;
  nextActions: {
    title: string;
    dueDate?: string;
    owner?: string;
    sourceText?: string;
  }[];
  competitors: string[];
  buyingSignals: string[];
  risks: string[];
  timelineSignals: string[];
  tags: string[];
  suggestedOpportunityId: string;
  confidence: 'High' | 'Medium' | 'Low';
  reasoning: string[];
};

type ProviderPayload = {
  choices?: { message?: { content?: string } }[];
  output_text?: string;
  content?: string;
};

const MAX_NOTE_LENGTH = 4000;
const MAX_CONTEXT_ITEMS = 50;
const MAX_BODY_CHARS = 80_000;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await verifyUserToken(getBearerToken(req.headers));
  if (!user) return res.status(401).json({ error: 'Sign in is required for AI Assist.' });
  const rateLimit = enforceRateLimit(req, 'capture-ai-classify', user.id, 15);
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfterSeconds: rateLimit.retryAfterSeconds });
  }

  const validation = validateRequestBody(req.body);
  if ('error' in validation) {
    return res.status(400).json({ error: validation.error });
  }

  if (!isProviderConfigured()) {
    return res.status(503).json({ error: 'Capture AI is not configured on the server.' });
  }

  try {
    const providerContent = await callOpenAiCompatibleProvider(validation.request);
    const parsed = parseProviderJson(providerContent);
    return res.status(200).json(normalizeSuggestion(parsed, validation.request));
  } catch {
    return res.status(502).json({ error: 'Capture AI provider call failed.' });
  }
}

function validateRequestBody(body: unknown): { request: CaptureAiRequest } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'JSON body is required.' };

  const bodySize = JSON.stringify(body).length;
  if (bodySize > MAX_BODY_CHARS) return { error: 'Request body is too large.' };

  const maybeBody = body as Partial<CaptureAiRequest>;
  const rawNote = typeof maybeBody.rawNote === 'string' ? maybeBody.rawNote.trim() : '';
  const activityDate = typeof maybeBody.activityDate === 'string' ? maybeBody.activityDate.trim() : '';

  if (!rawNote) return { error: 'rawNote is required.' };
  if (rawNote.length > MAX_NOTE_LENGTH) return { error: `rawNote must be ${MAX_NOTE_LENGTH} characters or fewer.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) return { error: 'activityDate must be YYYY-MM-DD.' };

  return {
    request: {
      rawNote,
      activityDate,
      opportunities: normalizeOpportunities(maybeBody.opportunities),
      accounts: normalizeAccounts(maybeBody.accounts),
    },
  };
}

function isProviderConfigured() {
  return (
    process.env.CAPTURE_AI_PROVIDER === 'openai-compatible' &&
    Boolean(process.env.CAPTURE_AI_ENDPOINT) &&
    Boolean(process.env.CAPTURE_AI_API_KEY) &&
    Boolean(process.env.CAPTURE_AI_MODEL)
  );
}

async function callOpenAiCompatibleProvider(request: CaptureAiRequest) {
  const body = {
    model: process.env.CAPTURE_AI_MODEL,
    messages: buildCaptureAiMessages(request),
    temperature: 0.2,
  };

  const withJsonMode = await callProvider({ ...body, response_format: { type: 'json_object' } });
  if (withJsonMode.ok || withJsonMode.status !== 400) return extractProviderContent(withJsonMode);

  const withoutJsonMode = await callProvider(body);
  return extractProviderContent(withoutJsonMode);
}

async function callProvider(body: unknown) {
  return fetch(process.env.CAPTURE_AI_ENDPOINT!, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CAPTURE_AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function extractProviderContent(response: Awaited<ReturnType<typeof fetch>>) {
  if (!response.ok) {
    throw new Error(`Provider status ${response.status}`);
  }

  const payload = await response.json() as ProviderPayload;
  const content = payload.choices?.[0]?.message?.content
    || payload.output_text
    || payload.content;

  if (!content) throw new Error('Provider returned no content');
  return content;
}

function parseProviderJson(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Provider returned invalid JSON');
    return JSON.parse(jsonMatch[0]);
  }
}

function normalizeSuggestion(value: unknown, request: CaptureAiRequest): CaptureAiSuggestion {
  const suggestion = typeof value === 'object' && value !== null ? value as Partial<CaptureAiSuggestion> : {};
  const activityType = captureAiActivityTypes.includes(suggestion.activityType as never)
    ? suggestion.activityType as string
    : 'Other';
  const confidence = ['High', 'Medium', 'Low'].includes(suggestion.confidence || '')
    ? suggestion.confidence as CaptureAiSuggestion['confidence']
    : 'Low';
  const suggestedOpportunityId = request.opportunities.some((opportunity) => opportunity.id === suggestion.suggestedOpportunityId)
    ? cleanString(suggestion.suggestedOpportunityId)
    : '';
  const nextActions = normalizeNextActions(suggestion.nextActions);
  const firstAction = nextActions[0];

  return {
    activityType,
    accountName: cleanString(suggestion.accountName),
    opportunityName: cleanString(suggestion.opportunityName),
    contactName: cleanString(suggestion.contactName),
    stakeholderName: cleanString(suggestion.stakeholderName),
    stakeholderRole: cleanString(suggestion.stakeholderRole),
    summary: cleanString(suggestion.summary) || request.rawNote.slice(0, 180),
    nextAction: cleanString(suggestion.nextAction) || firstAction?.title || '',
    dueDate: normalizeDate(suggestion.dueDate) || firstAction?.dueDate || '',
    nextActions,
    competitors: normalizeProperList(suggestion.competitors),
    buyingSignals: normalizeProperList(suggestion.buyingSignals),
    risks: normalizeProperList(suggestion.risks),
    timelineSignals: normalizeProperList(suggestion.timelineSignals),
    tags: normalizeTags(suggestion.tags),
    suggestedOpportunityId,
    confidence,
    reasoning: normalizeReasoning(suggestion.reasoning),
  };
}

function normalizeOpportunities(value: unknown): LightweightOpportunity[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CONTEXT_ITEMS).map((item) => {
    const opportunity = typeof item === 'object' && item !== null ? item as Partial<LightweightOpportunity> : {};
    return {
      id: cleanString(opportunity.id),
      accountName: cleanString(opportunity.accountName),
      opportunityName: cleanString(opportunity.opportunityName),
      stage: cleanString(opportunity.stage),
      productOrSolution: cleanString(opportunity.productOrSolution),
    };
  }).filter((opportunity) => opportunity.id && (opportunity.accountName || opportunity.opportunityName));
}

function normalizeAccounts(value: unknown): LightweightAccount[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CONTEXT_ITEMS).map((item) => {
    const account = typeof item === 'object' && item !== null ? item as Partial<LightweightAccount> : {};
    return {
      id: cleanString(account.id),
      accountName: cleanString(account.accountName),
      segment: cleanString(account.segment),
      industry: cleanString(account.industry),
    };
  }).filter((account) => account.id && account.accountName);
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 240) : '';
}

function normalizeDate(value: unknown) {
  const date = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanString).filter(Boolean).map((tag) => tag.toLowerCase().slice(0, 32)))).slice(0, 8);
}

function normalizeReasoning(value: unknown) {
  if (!Array.isArray(value)) return ['Server AI returned a conservative structured suggestion.'];
  return value.map(cleanString).filter(Boolean).slice(0, 5);
}

function normalizeProperList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanString).filter(Boolean))).slice(0, 12);
}

function normalizeNextActions(value: unknown): CaptureAiSuggestion['nextActions'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const action = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
      const title = cleanString(action.title);
      if (!title) return null;
      const dueDate = normalizeDate(action.dueDate);
      const owner = cleanString(action.owner);
      const sourceText = cleanString(action.sourceText);
      return {
        title,
        ...(dueDate ? { dueDate } : {}),
        ...(owner ? { owner } : {}),
        ...(sourceText ? { sourceText } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 8) as CaptureAiSuggestion['nextActions'];
}
