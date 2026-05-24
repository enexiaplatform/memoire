import { buildCaptureAiMessages } from '../utils/captureAiPrompt';
import { captureAiActivityTypes } from '../utils/captureAiPrompt';

export type CaptureAiProviderId = 'disabled' | 'openai-compatible';

export type CaptureAiRequest = {
  rawNote: string;
  activityDate: string;
  opportunities?: {
    id: string;
    accountName: string;
    opportunityName: string;
    stage?: string;
    productOrSolution?: string;
  }[];
  accounts?: {
    id: string;
    accountName: string;
    segment?: string;
    industry?: string;
  }[];
};

export type CaptureAiSuggestion = {
  activityType: string;
  accountName?: string;
  opportunityName?: string;
  summary: string;
  nextAction?: string;
  dueDate?: string;
  tags: string[];
  suggestedOpportunityId?: string;
  confidence: 'High' | 'Medium' | 'Low';
  reasoning: string[];
};

export type CaptureAiProvider = {
  id: CaptureAiProviderId;
  label: string;
  isConfigured(): boolean;
  classifyCapture(request: CaptureAiRequest): Promise<CaptureAiSuggestion>;
};

const endpoint = import.meta.env.VITE_CAPTURE_AI_ENDPOINT;
const apiKey = import.meta.env.VITE_CAPTURE_AI_API_KEY;
const model = import.meta.env.VITE_CAPTURE_AI_MODEL;

export const DisabledCaptureAiProvider: CaptureAiProvider = {
  id: 'disabled',
  label: 'Disabled',
  isConfigured: () => false,
  async classifyCapture() {
    throw new Error('Capture AI provider is not configured.');
  },
};

export const OpenAiCompatibleCaptureAiProvider: CaptureAiProvider = {
  id: 'openai-compatible',
  label: 'OpenAI-compatible',
  isConfigured: () => Boolean(endpoint && apiKey && model),
  async classifyCapture(request) {
    if (!this.isConfigured()) {
      throw new Error('Capture AI provider is not configured.');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: buildCaptureAiMessages(request),
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Assist request failed with status ${response.status}.`);
    }

    const payload = await response.json();
    const content = extractResponseContent(payload);
    return normalizeSuggestion(JSON.parse(content), request);
  },
};

export function getActiveCaptureAiProvider() {
  return OpenAiCompatibleCaptureAiProvider.isConfigured()
    ? OpenAiCompatibleCaptureAiProvider
    : DisabledCaptureAiProvider;
}

function extractResponseContent(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('AI Assist returned an invalid response.');
  }

  const maybePayload = payload as {
    choices?: { message?: { content?: string } }[];
    output_text?: string;
    content?: string;
  };

  const content = maybePayload.choices?.[0]?.message?.content
    || maybePayload.output_text
    || maybePayload.content;

  if (!content) {
    throw new Error('AI Assist returned no structured content.');
  }

  return content;
}

function normalizeSuggestion(value: unknown, request: CaptureAiRequest): CaptureAiSuggestion {
  const suggestion = typeof value === 'object' && value !== null ? value as Partial<CaptureAiSuggestion> : {};
  const activityType = captureAiActivityTypes.includes(suggestion.activityType as never)
    ? suggestion.activityType as string
    : 'Other';
  const confidence = ['High', 'Medium', 'Low'].includes(suggestion.confidence || '')
    ? suggestion.confidence as CaptureAiSuggestion['confidence']
    : 'Low';
  const suggestedOpportunityId = request.opportunities?.some((opportunity) => opportunity.id === suggestion.suggestedOpportunityId)
    ? suggestion.suggestedOpportunityId
    : '';

  return {
    activityType,
    accountName: cleanString(suggestion.accountName),
    opportunityName: cleanString(suggestion.opportunityName),
    summary: cleanString(suggestion.summary) || request.rawNote.trim().slice(0, 180),
    nextAction: cleanString(suggestion.nextAction),
    dueDate: normalizeDate(suggestion.dueDate),
    tags: normalizeTags(suggestion.tags),
    suggestedOpportunityId,
    confidence,
    reasoning: normalizeReasoning(suggestion.reasoning),
  };
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
  if (!Array.isArray(value)) return ['AI Assist returned a conservative structured suggestion.'];
  return value.map(cleanString).filter(Boolean).slice(0, 5);
}
