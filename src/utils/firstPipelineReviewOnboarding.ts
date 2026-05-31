import type { ObjectionRecord } from '../services/objectionStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesAssetRecord } from '../services/salesAssetStore';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage';
import { isCsvImportedOpportunity } from './opportunityCsvImport';

export const FIRST_PIPELINE_REVIEW_ONBOARDING_KEY = 'memoire.firstPipelineReviewOnboarding.v1';

export type FirstPipelineReviewStep =
  | 'hasImportedOrAddedOpportunities'
  | 'hasReviewedOpportunities'
  | 'hasViewedGaps'
  | 'hasGeneratedPipelineDefense';

export type FirstPipelineReviewOnboardingState = {
  hasImportedOrAddedOpportunities: boolean;
  hasReviewedOpportunities: boolean;
  hasViewedGaps: boolean;
  hasGeneratedPipelineDefense: boolean;
  completedAt: string;
  updatedAt: string;
};

export type FirstPipelineReviewMetrics = {
  totalOpportunities: number;
  activeOpportunities: number;
  importedOpportunities: number;
  opportunitiesNeedingEnrichment: number;
  missingValue: number;
  missingClosePeriod: number;
  missingEvidence: number;
  missingNextAction: number;
  missingEconomicBuyer: number;
  missingChampion: number;
  unclearDecisionProcess: number;
  unresolvedObjections: number;
  missingProofAssets: number;
  userBriefCount: number;
};

export type FirstPipelineReviewProgressStep = {
  id: FirstPipelineReviewStep;
  title: string;
  description: string;
  status: 'Done' | 'Not started';
  done: boolean;
  cta: string;
  href: string;
};

export const defaultFirstPipelineReviewOnboardingState: FirstPipelineReviewOnboardingState = {
  hasImportedOrAddedOpportunities: false,
  hasReviewedOpportunities: false,
  hasViewedGaps: false,
  hasGeneratedPipelineDefense: false,
  completedAt: '',
  updatedAt: '',
};

export function loadFirstPipelineReviewOnboardingState(): FirstPipelineReviewOnboardingState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return makeState();
    const raw = window.localStorage.getItem(FIRST_PIPELINE_REVIEW_ONBOARDING_KEY);
    if (!raw) return makeState();
    return normalizeState(JSON.parse(raw) as Partial<FirstPipelineReviewOnboardingState>);
  } catch {
    return makeState();
  }
}

export function saveFirstPipelineReviewOnboardingState(state: FirstPipelineReviewOnboardingState) {
  const next = completeIfReady({
    ...state,
    updatedAt: new Date().toISOString(),
  });

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(FIRST_PIPELINE_REVIEW_ONBOARDING_KEY, JSON.stringify(next));
    }
  } catch {
    // This flow is guidance only. Ignore localStorage write failures.
  }

  return next;
}

export function markFirstPipelineReviewStepComplete(step: FirstPipelineReviewStep) {
  return saveFirstPipelineReviewOnboardingState({
    ...loadFirstPipelineReviewOnboardingState(),
    [step]: true,
  });
}

export function resetFirstPipelineReviewOnboarding() {
  return saveFirstPipelineReviewOnboardingState(makeState());
}

export function buildFirstPipelineReviewMetrics(input: {
  opportunities: CrmLiteOpportunity[];
  objections?: ObjectionRecord[];
  assets?: SalesAssetRecord[];
  briefs?: PipelineDefenseBrief[];
}): FirstPipelineReviewMetrics {
  const opportunities = input.opportunities;
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.status === 'Active');
  const importedOpportunities = opportunities.filter(isCsvImportedOpportunity);
  const unresolvedObjections = (input.objections || []).filter((objection) => (
    objection.status === 'Open' || objection.status === 'Addressed'
  ));
  const assets = input.assets || [];

  const missingValue = activeOpportunities.filter((opportunity) => !opportunity.estimatedValue).length;
  const missingClosePeriod = activeOpportunities.filter((opportunity) => !opportunity.expectedClosePeriod.trim()).length;
  const missingEvidence = activeOpportunities.filter((opportunity) => !hasRealEvidence(opportunity)).length;
  const missingNextAction = activeOpportunities.filter((opportunity) => !opportunity.nextAction.trim()).length;
  const missingEconomicBuyer = activeOpportunities.filter((opportunity) => (
    !opportunity.decisionMaker.trim() && !opportunity.budgetOwner.trim()
  )).length;
  const missingChampion = activeOpportunities.filter((opportunity) => !hasChampionSignal(opportunity)).length;
  const unclearDecisionProcess = activeOpportunities.filter((opportunity) => (
    !opportunity.procurementPath.trim() || !opportunity.expectedClosePeriod.trim()
  )).length;
  const missingProofAssets = unresolvedObjections.filter((objection) => !hasRelatedAsset(objection, assets)).length;

  return {
    totalOpportunities: opportunities.length,
    activeOpportunities: activeOpportunities.length,
    importedOpportunities: importedOpportunities.length,
    opportunitiesNeedingEnrichment: activeOpportunities.filter((opportunity) => (
      !opportunity.estimatedValue
      || !opportunity.expectedClosePeriod.trim()
      || !hasRealEvidence(opportunity)
      || !opportunity.nextAction.trim()
      || !opportunity.decisionMaker.trim()
      || !opportunity.budgetOwner.trim()
      || !hasChampionSignal(opportunity)
      || !opportunity.procurementPath.trim()
    )).length,
    missingValue,
    missingClosePeriod,
    missingEvidence,
    missingNextAction,
    missingEconomicBuyer,
    missingChampion,
    unclearDecisionProcess,
    unresolvedObjections: unresolvedObjections.length,
    missingProofAssets,
    userBriefCount: (input.briefs || []).filter(isUserCreatedBrief).length,
  };
}

export function buildFirstPipelineReviewProgress(input: {
  state: FirstPipelineReviewOnboardingState;
  metrics: FirstPipelineReviewMetrics;
  includeDataSignals: boolean;
}): FirstPipelineReviewProgressStep[] {
  const hasOpportunities = input.state.hasImportedOrAddedOpportunities
    || (input.includeDataSignals && input.metrics.totalOpportunities > 0);
  const hasGeneratedBrief = input.state.hasGeneratedPipelineDefense
    || (input.includeDataSignals && input.metrics.userBriefCount > 0);

  return [
    {
      id: 'hasImportedOrAddedOpportunities',
      title: 'Bring in your pipeline',
      description: 'Import a CSV, open the demo sandbox, or add one opportunity manually.',
      cta: 'Start with pipeline data',
      href: '/app/opportunities?import=csv',
      done: hasOpportunities,
      status: hasOpportunities ? 'Done' : 'Not started',
    },
    {
      id: 'hasReviewedOpportunities',
      title: 'Review your opportunities',
      description: 'Check active deals, imported records, and which opportunities need enrichment.',
      cta: 'Review opportunities',
      href: '/app/opportunities',
      done: input.state.hasReviewedOpportunities,
      status: input.state.hasReviewedOpportunities ? 'Done' : 'Not started',
    },
    {
      id: 'hasViewedGaps',
      title: 'Fix top gaps',
      description: 'Review buyer, champion, process, objection, proof, evidence, and next-action gaps.',
      cta: 'Review top gaps',
      href: '/app/onboarding/pipeline-review#gaps',
      done: input.state.hasViewedGaps,
      status: input.state.hasViewedGaps ? 'Done' : 'Not started',
    },
    {
      id: 'hasGeneratedPipelineDefense',
      title: 'Generate Pipeline Defense Brief',
      description: 'Create a manager-ready brief from selected opportunities.',
      cta: 'Prepare Pipeline Review',
      href: '/app/opportunities',
      done: hasGeneratedBrief,
      status: hasGeneratedBrief ? 'Done' : 'Not started',
    },
  ];
}

export function getFirstPipelineReviewNextStep(steps: FirstPipelineReviewProgressStep[]) {
  return steps.find((step) => !step.done) || steps[steps.length - 1];
}

export function getFirstPipelineReviewProgressPercent(steps: FirstPipelineReviewProgressStep[]) {
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((step) => step.done).length / steps.length) * 100);
}

function normalizeState(value: Partial<FirstPipelineReviewOnboardingState>) {
  return completeIfReady({
    hasImportedOrAddedOpportunities: Boolean(value.hasImportedOrAddedOpportunities),
    hasReviewedOpportunities: Boolean(value.hasReviewedOpportunities),
    hasViewedGaps: Boolean(value.hasViewedGaps),
    hasGeneratedPipelineDefense: Boolean(value.hasGeneratedPipelineDefense),
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  });
}

function makeState() {
  return {
    ...defaultFirstPipelineReviewOnboardingState,
    updatedAt: new Date().toISOString(),
  };
}

function completeIfReady(state: FirstPipelineReviewOnboardingState) {
  if (
    state.hasImportedOrAddedOpportunities
    && state.hasReviewedOpportunities
    && state.hasViewedGaps
    && state.hasGeneratedPipelineDefense
    && !state.completedAt
  ) {
    return {
      ...state,
      completedAt: new Date().toISOString(),
    };
  }

  return state;
}

function hasRealEvidence(opportunity: CrmLiteOpportunity) {
  const evidence = opportunity.evidence.trim();
  return Boolean(evidence && !/^CSV import:/i.test(evidence));
}

function hasChampionSignal(opportunity: CrmLiteOpportunity) {
  return /champion|supporter|sponsor|advocate|supports|supportive/i.test(`${opportunity.evidence} ${opportunity.missingContext}`);
}

function hasRelatedAsset(objection: ObjectionRecord, assets: SalesAssetRecord[]) {
  const objectionType = objection.objectionType.toLowerCase();
  const account = objection.accountName.toLowerCase();
  const opportunity = (objection.opportunityName || '').toLowerCase();

  return assets.some((asset) => {
    const combined = `${asset.title} ${asset.summary} ${asset.content} ${asset.relatedAccountName || ''} ${asset.relatedOpportunityName || ''} ${asset.relatedObjectionType || ''}`.toLowerCase();
    return combined.includes(objectionType) || (account && combined.includes(account)) || (opportunity && combined.includes(opportunity));
  });
}

function isUserCreatedBrief(brief: PipelineDefenseBrief) {
  return !brief.title.toLowerCase().includes('sample pipeline defense brief');
}
