import type { PipelineDefenseDeal } from '../data/pipelineDefenseBrief';
import {
  generatePipelineDefenseDraft,
  type DraftAssistResult,
  type DraftAssistType,
} from '../utils/pipelineDefenseDraftAssist';

export type DraftAssistProviderId = 'local-mock';

export type DraftAssistRequest = {
  deal: PipelineDefenseDeal;
  draftType: DraftAssistType;
  briefContext?: {
    title?: string;
    weekLabel?: string;
    salesOwner?: string;
    scope?: string;
  };
};

export type DraftAssistResponse = {
  providerId: DraftAssistProviderId;
  providerLabel: string;
  result: DraftAssistResult;
};

export type DraftAssistProvider = {
  id: DraftAssistProviderId;
  label: string;
  generateDraft(request: DraftAssistRequest): Promise<DraftAssistResponse>;
};

export const LocalMockDraftProvider: DraftAssistProvider = {
  id: 'local-mock',
  label: 'Local Mock',
  async generateDraft(request) {
    return {
      providerId: this.id,
      providerLabel: this.label,
      result: generatePipelineDefenseDraft(request.deal, request.draftType),
    };
  },
};

export function getActiveDraftAssistProvider(): DraftAssistProvider {
  return LocalMockDraftProvider;
}
