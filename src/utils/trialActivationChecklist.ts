import type { PipelineDefenseBrief } from './pipelineDefenseStorage';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesAssetRecord } from '../services/salesAssetStore';
import { isCsvImportedOpportunity } from './opportunityCsvImport';

export const TRIAL_ACTIVATION_CHECKLIST_KEY = 'memoire.trialActivationChecklist.v1';

export type TrialActivationChecklistItemId =
  | 'load-demo-or-import-csv'
  | 'review-opportunity'
  | 'capture-update'
  | 'import-starter-asset-pack'
  | 'generate-defense-brief'
  | 'copy-manager-summary';

export type TrialActivationChecklistState = {
  manualCompleted: Partial<Record<TrialActivationChecklistItemId, boolean>>;
  dismissedAt?: string;
  updatedAt: string;
};

export type TrialActivationChecklistItem = {
  id: TrialActivationChecklistItemId;
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
};

const defaultState: TrialActivationChecklistState = {
  manualCompleted: {},
  updatedAt: new Date(0).toISOString(),
};

export function loadTrialActivationChecklistState(): TrialActivationChecklistState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TRIAL_ACTIVATION_CHECKLIST_KEY) || 'null') as Partial<TrialActivationChecklistState> | null;
    if (!parsed || typeof parsed !== 'object') return defaultState;
    return {
      manualCompleted: normalizeManualCompleted(parsed.manualCompleted),
      dismissedAt: typeof parsed.dismissedAt === 'string' ? parsed.dismissedAt : undefined,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultState;
  }
}

export function saveTrialActivationChecklistState(state: TrialActivationChecklistState) {
  const nextState = {
    ...state,
    manualCompleted: normalizeManualCompleted(state.manualCompleted),
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(TRIAL_ACTIVATION_CHECKLIST_KEY, JSON.stringify(nextState));
    } catch {
      // Checklist state is convenience-only.
    }
  }
  return nextState;
}

export function markTrialActivationChecklistItemComplete(id: TrialActivationChecklistItemId) {
  const state = loadTrialActivationChecklistState();
  return saveTrialActivationChecklistState({
    ...state,
    manualCompleted: {
      ...state.manualCompleted,
      [id]: true,
    },
  });
}

export function dismissTrialActivationChecklist() {
  return saveTrialActivationChecklistState({
    ...loadTrialActivationChecklistState(),
    dismissedAt: new Date().toISOString(),
  });
}

export function resetTrialActivationChecklist() {
  return saveTrialActivationChecklistState(defaultState);
}

export function buildTrialActivationChecklist(input: {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  assets: SalesAssetRecord[];
  briefs: PipelineDefenseBrief[];
  sampleDataActive: boolean;
  state?: TrialActivationChecklistState;
}): TrialActivationChecklistItem[] {
  const state = input.state || loadTrialActivationChecklistState();
  const manual = state.manualCompleted;
  const hasCsvImport = input.opportunities.some(isCsvImportedOpportunity);
  const hasUserBrief = input.briefs.some((brief) => !brief.isSample && brief.deals.length > 0);

  return [
    {
      id: 'capture-update',
      title: 'Capture first evidence',
      description: 'Paste a sales email/thread or note so Memoire can extract reviewed sales evidence.',
      href: '/app/capture?mode=email',
      cta: 'Open Capture',
      done: Boolean(manual['capture-update'] || input.activities.length > 0),
    },
    {
      id: 'load-demo-or-import-csv',
      title: 'Load proof-path demo',
      description: 'Use the local demo sandbox if you do not have real evidence ready yet.',
      href: input.sampleDataActive ? '/app/today' : '/demo',
      cta: input.sampleDataActive ? 'Demo loaded' : 'Load demo',
      done: Boolean(manual['load-demo-or-import-csv'] || input.sampleDataActive || hasCsvImport),
    },
    {
      id: 'review-opportunity',
      title: 'Review Today command center',
      description: 'See Top 3 actions, proactive nudges, capture inbox, and forecast-defense readiness.',
      href: '/app/today',
      cta: 'Open Today',
      done: Boolean(manual['review-opportunity'] || input.opportunities.length > 0),
    },
    {
      id: 'generate-defense-brief',
      title: 'Prepare Pipeline Defense Brief',
      description: 'Open the review artifact and check defend, rescue, downgrade, MEDDIC, and missing evidence.',
      href: '/app/pipeline-defense',
      cta: 'Open Pipeline Defense',
      done: Boolean(manual['generate-defense-brief'] || hasUserBrief),
    },
    {
      id: 'copy-manager-summary',
      title: 'Copy manager-ready answer',
      description: 'Copy a concise manager brief with evidence, missing context, next action, and due date.',
      href: '/app/pipeline-defense',
      cta: 'Open Brief',
      done: Boolean(manual['copy-manager-summary']),
    },
  ];
}

function normalizeManualCompleted(value: unknown): Partial<Record<TrialActivationChecklistItemId, boolean>> {
  if (!value || typeof value !== 'object') return {};
  const allowed: TrialActivationChecklistItemId[] = [
    'load-demo-or-import-csv',
    'review-opportunity',
    'capture-update',
    'import-starter-asset-pack',
    'generate-defense-brief',
    'copy-manager-summary',
  ];
  return allowed.reduce<Partial<Record<TrialActivationChecklistItemId, boolean>>>((acc, id) => {
    if ((value as Partial<Record<TrialActivationChecklistItemId, boolean>>)[id] === true) acc[id] = true;
    return acc;
  }, {});
}
