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
  const hasStarterPackAsset = input.assets.some((asset) => (
    asset.tags.includes('starter-pack') || asset.id.startsWith('starter-')
  ));
  const hasUserBrief = input.briefs.some((brief) => !brief.isSample && brief.deals.length > 0);

  return [
    {
      id: 'load-demo-or-import-csv',
      title: 'Load demo or import CSV',
      description: 'Start with the demo sandbox or bring in a read-only pipeline copy from CRM/Excel.',
      href: input.sampleDataActive ? '/app/dashboard' : '/app/opportunities?import=csv',
      cta: input.sampleDataActive ? 'Demo loaded' : 'Import CSV',
      done: Boolean(manual['load-demo-or-import-csv'] || input.sampleDataActive || hasCsvImport),
    },
    {
      id: 'review-opportunity',
      title: 'Review one opportunity',
      description: 'Open a deal and inspect MEDDIC gaps, stakeholders, objections, and next actions.',
      href: '/app/opportunities',
      cta: 'Open Opportunities',
      done: Boolean(manual['review-opportunity'] || input.opportunities.length > 0),
    },
    {
      id: 'capture-update',
      title: 'Capture one update',
      description: 'Write one customer update so Memoire can remember signals, risks, and next actions.',
      href: '/app/capture?mode=quick',
      cta: 'Quick Capture',
      done: Boolean(manual['capture-update'] || input.activities.length > 0),
    },
    {
      id: 'import-starter-asset-pack',
      title: 'Import one starter asset pack',
      description: 'Add reusable proof, objection, or compliance snippets for review prep.',
      href: '/app/assets#starter-packs',
      cta: 'Open Assets',
      done: Boolean(manual['import-starter-asset-pack'] || hasStarterPackAsset),
    },
    {
      id: 'generate-defense-brief',
      title: 'Generate Pipeline Defense Brief',
      description: 'Create a manager-ready weekly review pack from selected opportunities.',
      href: '/app/opportunities',
      cta: 'Generate Brief',
      done: Boolean(manual['generate-defense-brief'] || hasUserBrief),
    },
    {
      id: 'copy-manager-summary',
      title: 'Copy Manager Summary',
      description: 'Copy the short manager-facing summary from Pipeline Defense for your review.',
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
