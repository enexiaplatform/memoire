import { captureAiActivityTypes } from '../utils/captureAiPrompt';
import type { SalesActivityNextAction } from '../utils/salesActivityClassifier';
import { supabaseClient } from '../lib/supabaseClient';
import { sanitizeBusinessDate } from '../utils/safeDate.ts';
import { resolveCaptureEntities } from '../utils/captureEntityResolution.ts';
import type { CaptureAccountAlias, CaptureCorrectionEvent } from './captureCorrectionMemoryStore';

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
  corrections?: CaptureCorrectionEvent[];
  aliases?: CaptureAccountAlias[];
};

export type CaptureAiSuggestion = {
  activityType: string;
  accountName?: string;
  opportunityName?: string;
  contactName?: string;
  stakeholderName?: string;
  stakeholderRole?: string;
  summary: string;
  nextAction?: string;
  dueDate?: string;
  nextActions?: SalesActivityNextAction[];
  competitors?: string[];
  buyingSignals?: string[];
  risks?: string[];
  timelineSignals?: string[];
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
    const { data: { session } } = await supabaseClient?.auth.getSession() || { data: { session: null } };
    if (!session?.access_token) {
      throw new CaptureAiProviderError('Sign in is required for AI Assist.', 401);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        rawNote: request.rawNote,
        activityDate: request.activityDate,
        opportunities: request.opportunities,
        accounts: request.accounts,
      }),
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
  const nextActions = normalizeNextActions(suggestion.nextActions);
  const firstAction = nextActions[0];
  const entities = resolveCaptureEntities({
    rawNote: request.rawNote,
    accountName: cleanString(suggestion.accountName),
    contactName: cleanString(suggestion.contactName) || cleanString(suggestion.stakeholderName),
    opportunityName: cleanString(suggestion.opportunityName),
    suggestedOpportunityId,
    accounts: request.accounts,
    opportunities: request.opportunities,
    corrections: request.corrections,
    aliases: request.aliases,
  });

  const stakeholderRole = cleanString(suggestion.stakeholderRole);
  return {
    activityType,
    accountName: entities.accountName,
    opportunityName: entities.opportunityName,
    contactName: entities.contactName,
    stakeholderName: entities.contactName,
    stakeholderRole: hasExplicitStakeholderRoleEvidence(request.rawNote, stakeholderRole) ? stakeholderRole : '',
    summary: cleanString(suggestion.summary) || request.rawNote.trim().slice(0, 180),
    nextAction: cleanString(suggestion.nextAction) || firstAction?.title || '',
    dueDate: normalizeDate(suggestion.dueDate) || firstAction?.dueDate || '',
    nextActions,
    competitors: normalizeProperList(suggestion.competitors),
    buyingSignals: normalizeProperList(suggestion.buyingSignals),
    risks: normalizeProperList(suggestion.risks),
    timelineSignals: normalizeProperList(suggestion.timelineSignals),
    tags: normalizeTags(suggestion.tags),
    suggestedOpportunityId: entities.suggestedOpportunityId,
    confidence: entities.needsConfirmation ? 'Low' : confidence,
    reasoning: normalizeReasoning(suggestion.reasoning),
  };
}

function hasExplicitStakeholderRoleEvidence(rawNote: string, role: string) {
  if (!role) return false;
  return new RegExp(`\\b${escapeRegExp(role)}\\b`, 'i').test(rawNote)
    || /\b(champion|economic buyer|technical buyer|procurement|budget owner|decision maker|coach|blocker|user)\b/i.test(rawNote);
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 240) : '';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDate(value: unknown) {
  return sanitizeBusinessDate(cleanString(value));
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanString).filter(Boolean).map((tag) => tag.toLowerCase().slice(0, 32)))).slice(0, 8);
}

function normalizeReasoning(value: unknown) {
  if (!Array.isArray(value)) return ['AI Assist returned a conservative structured suggestion.'];
  return value.map(cleanString).filter(Boolean).slice(0, 5);
}

function normalizeProperList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanString).filter(Boolean))).slice(0, 12);
}

function normalizeNextActions(value: unknown): SalesActivityNextAction[] {
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
    .slice(0, 8) as SalesActivityNextAction[];
}
