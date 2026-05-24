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

const endpoint = import.meta.env.VITE_CAPTURE_AI_ENDPOINT || '/api/capture-ai-classify';

export class CaptureAiProviderError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CaptureAiProviderError';
    this.status = status;
  }
}

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
  label: 'Server-side AI endpoint',
  isConfigured: () => Boolean(endpoint),
  async classifyCapture(request) {
    if (!this.isConfigured()) {
      throw new Error('Capture AI provider is not configured.');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new CaptureAiProviderError(`AI Assist request failed with status ${response.status}.`, response.status);
    }

    const payload = await response.json();
    return normalizeSuggestion(payload, request);
  },
};

export function getActiveCaptureAiProvider() {
  return OpenAiCompatibleCaptureAiProvider.isConfigured()
    ? OpenAiCompatibleCaptureAiProvider
    : DisabledCaptureAiProvider;
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
