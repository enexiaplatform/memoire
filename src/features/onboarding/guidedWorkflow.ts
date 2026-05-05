import type { SaveStructuredSalesCaptureResult } from '../v31/salesMemory';

export const REPLAY_GUIDED_WORKFLOW_EVENT = 'memoire:replay-guided-workflow';
export const USE_SAMPLE_NOTE_EVENT = 'memoire:onboarding-use-sample-note';
export const CAPTURE_STRUCTURED_EVENT = 'memoire:onboarding-capture-structured';
export const CAPTURE_SAVED_EVENT = 'memoire:onboarding-capture-saved';
export const ASK_GUIDED_QUESTION_EVENT = 'memoire:onboarding-ask-guided-question';
export const ASK_ANSWER_READY_EVENT = 'memoire:onboarding-ask-answer-ready';
export const FOLLOWUP_DRAFT_READY_EVENT = 'memoire:onboarding-followup-draft-ready';

export const GUIDED_WORKFLOW_SAMPLE_NOTE =
  'Just called Linh from Northstar Labs. They are reviewing the proposal but are concerned about lead time and local support. Need to send implementation timeline next Tuesday.';

export type GuidedWorkflowStep =
  | 'welcome'
  | 'capture'
  | 'structure'
  | 'review_preview'
  | 'save_memory'
  | 'open_account_memory'
  | 'ask_account'
  | 'draft_followup'
  | 'journey'
  | 'finish';

export interface GuidedWorkflowState {
  active: boolean;
  currentStep: GuidedWorkflowStep;
  completed: boolean;
  skipped: boolean;
  startedAt?: string;
  completedAt?: string;
  sampleMode?: boolean;
  founderMode?: boolean;
}

export interface GuidedWorkflowPreference {
  guidedWorkflowCompleted?: boolean;
  guidedWorkflowDismissedAt?: string;
  guidedWorkflowSkippedAt?: string;
  guidedWorkflowSkippedCount?: number;
  dontShowGuidedWorkflowAgain?: boolean;
}

export type GuidedCaptureSavedDetail = SaveStructuredSalesCaptureResult & {
  accountName?: string;
  actionTitle?: string;
};
