import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Download, HelpCircle, Printer, RotateCcw, ShieldCheck, Target, Trash2, Upload } from 'lucide-react';
import {
  createInitialPipelineDefenseDeals,
  decisionRecommendations,
  forecastEvidenceCategories,
  forecastEvidenceDefinitions,
  managerQuestions,
  missingContextLabels,
  objectionDebtStatuses,
  pipelineDefenseBriefMeta,
  type DecisionRecommendation,
  type ForecastEvidenceCategory,
  type PipelineDefenseDeal,
} from '../../data/pipelineDefenseBrief';
import { generatePipelineDefenseBriefMarkdown } from '../../utils/exportPipelineDefenseBrief';
import { parsePipelineDeals, type ImportFormat } from '../../utils/importPipelineDefenseBrief';
import {
  clearPipelineDefenseBriefStore,
  createDefaultPipelineDefenseBriefStore,
  createPipelineDefenseBrief,
  deletePipelineDefenseBrief,
  duplicatePipelineDefenseBrief,
  getActivePipelineDefenseBrief,
  loadPipelineDefenseBriefStore,
  savePipelineDefenseBriefStore,
  updatePipelineDefenseBrief,
  type PipelineDefenseBrief,
  type PipelineDefenseBriefStore,
} from '../../utils/pipelineDefenseStorage';
import {
  analyzePipelineDefenseDeal,
  type DealRiskSuggestion,
} from '../../utils/pipelineDefenseRules';
import {
  analyzePipelineDefenseBriefQuality,
  type BriefQualityAnalysis,
  type BriefQualityIssue,
  type BriefReadinessStatus,
} from '../../utils/pipelineDefenseBriefQuality';
import {
  generateActionPlanMarkdown,
  generatePipelineDefenseActionPlan,
  groupActionItemsByPriority,
  type ActionPriority,
  type ActionType,
  type PipelineDefenseActionItem,
} from '../../utils/pipelineDefenseActionPlan';
import {
  buildShareablePipelineDefenseBrief,
  generateShareReadyPipelineDefenseMarkdown,
  type ShareablePipelineDefenseBrief,
} from '../../utils/shareablePipelineDefenseBrief';
import {
  draftAssistTypes,
  type DraftAssistResult,
  type DraftAssistType,
} from '../../utils/pipelineDefenseDraftAssist';
import { getActiveDraftAssistProvider } from '../../services/draftAssistProvider';
import { AuthButton } from '../../components/auth/AuthButton';
import { DataModePill } from '../../components/common/DataModePill';
import { DemoJourneyCard } from '../../components/demo/DemoJourneyCard';
import { useAuthContext } from '../../auth/authContext';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  canUsePipelineDefenseCloudStore,
  createCloudBrief,
  deleteCloudBrief,
  hasCloudBriefId,
  loadCloudBriefs,
  saveCloudBrief,
  syncLocalBriefsToCloud,
} from '../../services/pipelineDefenseCloudStore';
import { PipelineDefensePrintableBrief } from './PipelineDefensePrintableBrief';
import { PipelineDefenseReviewDealCard } from './PipelineDefenseReviewDealCard';
import { markFirstPipelineReviewStepComplete } from '../../utils/firstPipelineReviewOnboarding';
import { getCurrentPipelineReviewWeekId, markPipelineReviewHabitStepComplete } from '../../utils/pipelineReviewHabit';
import { markTrialActivationChecklistItemComplete } from '../../utils/trialActivationChecklist';
import { createDemoFeedback, type PipelineBriefUsefulness } from '../../utils/demoFeedback';
import { markDemoJourneyComplete } from '../../utils/demoJourney';
import {
  createReviewPackSnapshot,
  deleteReviewPack,
  formatReviewPackDate,
  generateReviewPackMarkdown,
  loadReviewPacks,
  saveReviewPack,
  updateReviewPack,
  type ReviewPackSnapshot,
} from '../../utils/reviewPacks';
import { ReviewPackReadOnly } from './PipelineReviewPackPage';

const categoryClasses: Record<ForecastEvidenceCategory, string> = {
  Defensible: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Weak but recoverable': 'border-amber-200 bg-amber-50 text-amber-700',
  'Hope-based': 'border-orange-200 bg-orange-50 text-orange-700',
  Unsupported: 'border-red-200 bg-red-50 text-red-700',
};

const decisionClasses: Record<DecisionRecommendation, string> = {
  Defend: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Rescue: 'border-blue-200 bg-blue-50 text-blue-700',
  Monitor: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  Downgrade: 'border-orange-200 bg-orange-50 text-orange-700',
  Deprioritize: 'border-gray-200 bg-gray-50 text-gray-600',
};

const severityClasses: Record<'low' | 'medium' | 'high', string> = {
  low: 'border-gray-200 bg-gray-50 text-gray-600',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  high: 'border-red-200 bg-red-50 text-red-700',
};

const readinessClasses: Record<BriefReadinessStatus, string> = {
  'Review-ready': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Needs cleanup': 'border-amber-200 bg-amber-50 text-amber-700',
  'High risk / not defensible': 'border-red-200 bg-red-50 text-red-700',
};

const actionPriorityClasses: Record<ActionPriority, string> = {
  Critical: 'border-red-200 bg-red-50 text-red-700',
  High: 'border-orange-200 bg-orange-50 text-orange-700',
  Medium: 'border-amber-200 bg-amber-50 text-amber-700',
  Low: 'border-gray-200 bg-gray-50 text-gray-600',
};

const actionTypeClasses: Record<ActionType, string> = {
  Rescue: 'border-blue-200 bg-blue-50 text-blue-700',
  Clarify: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  Downgrade: 'border-orange-200 bg-orange-50 text-orange-700',
  'Follow-up': 'border-cyan-200 bg-cyan-50 text-cyan-700',
  'Collect evidence': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Resolve objection': 'border-amber-200 bg-amber-50 text-amber-700',
  'Prepare defense answer': 'border-gray-200 bg-gray-50 text-gray-700',
};

type DealRiskAnalysisSummary = {
  totalDeals: number;
  highRiskDeals: number;
  objectionDebtFlags: number;
  unsupportedOrHopeBased: number;
  rescueCount: number;
  downgradeCount: number;
  monitorCount: number;
};

type CloudSyncStatus = 'local' | 'loading' | 'ready' | 'local-only' | 'error';

export function PipelineReviewDefenseBriefPage() {
  const { user, loading: accountLoading, isAuthenticated } = useAuthContext();
  const [localMigrationStore] = useState<PipelineDefenseBriefStore>(() => loadPipelineDefenseBriefStore());
  const [store, setStore] = useState<PipelineDefenseBriefStore>(localMigrationStore);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [markdownPreview, setMarkdownPreview] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [saveStatus, setSaveStatus] = useState('Saved locally in this browser');
  const [importOpen, setImportOpen] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [parsedDeals, setParsedDeals] = useState<PipelineDefenseDeal[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importFormat, setImportFormat] = useState<ImportFormat>('unknown');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importMessage, setImportMessage] = useState('');
  const [dealSuggestions, setDealSuggestions] = useState<Record<string, DealRiskSuggestion>>({});
  const [analysisSummary, setAnalysisSummary] = useState<DealRiskAnalysisSummary | null>(null);
  const [briefQualityAnalysis, setBriefQualityAnalysis] = useState<BriefQualityAnalysis | null>(null);
  const [actionPlanItems, setActionPlanItems] = useState<PipelineDefenseActionItem[] | null>(null);
  const [doneActionIds, setDoneActionIds] = useState<Set<string>>(() => new Set());
  const [actionPlanCopyStatus, setActionPlanCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [managerSummaryCopyStatus, setManagerSummaryCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [shareMarkdownCopyStatus, setShareMarkdownCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [draftAssistDealId, setDraftAssistDealId] = useState<string | null>(null);
  const [draftAssistType, setDraftAssistType] = useState<DraftAssistType>('Deal truth');
  const [draftAssistResult, setDraftAssistResult] = useState<DraftAssistResult | null>(null);
  const [draftAssistCopyStatus, setDraftAssistCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [draftAssistProviderLabel, setDraftAssistProviderLabel] = useState(getActiveDraftAssistProvider().label);
  const [draftAssistGenerating, setDraftAssistGenerating] = useState(false);
  const [draftAssistError, setDraftAssistError] = useState('');
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('local');
  const [cloudSyncMessage, setCloudSyncMessage] = useState('');
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [reviewPacks, setReviewPacks] = useState<ReviewPackSnapshot[]>(() => loadReviewPacks());
  const [reviewPackMessage, setReviewPackMessage] = useState('');
  const [reviewPackCopyStatus, setReviewPackCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [printableReviewPack, setPrintableReviewPack] = useState<ReviewPackSnapshot | null>(null);

  const activeBrief = getActivePipelineDefenseBrief(store);
  const deals = activeBrief?.deals || [];
  const summary = buildSummary(deals);
  const activeActionPlanItems = actionPlanItems || generatePipelineDefenseActionPlan(activeBrief);
  const shareableBrief = buildShareablePipelineDefenseBrief({ brief: activeBrief, deals, actionItems: activeActionPlanItems });
  const currentWeekReviewPack = reviewPacks.find((pack) => (
    pack.sourceBriefId === activeBrief?.id && pack.weekId === getCurrentPipelineReviewWeekId()
  )) || null;
  const sampleDataActive = hasLocalSampleData();
  const cloudSyncReady = Boolean(user && !sampleDataActive && canUsePipelineDefenseCloudStore() && cloudSyncStatus === 'ready');

  useEffect(() => {
    if (!sampleDataActive && activeBrief && deals.length > 0 && !activeBrief.title.toLowerCase().includes('sample pipeline defense brief')) {
      markFirstPipelineReviewStepComplete('hasGeneratedPipelineDefense');
    }
  }, [activeBrief, deals.length, sampleDataActive]);

  useEffect(() => {
    if (accountLoading) {
      setCloudSyncStatus('loading');
      setCloudSyncMessage('');
      return;
    }

    if (sampleDataActive) {
      setCloudSyncStatus('local');
      setCloudSyncMessage('Demo sandbox active - sample data is local only.');
      setShowMigrationPrompt(false);
      return;
    }

    if (!user) {
      setCloudSyncStatus('local');
      setCloudSyncMessage('');
      setShowMigrationPrompt(false);
      return;
    }

    if (!canUsePipelineDefenseCloudStore()) {
      setCloudSyncStatus('error');
      setCloudSyncMessage('Cloud sync issue - your local copy is preserved.');
      setShowMigrationPrompt(false);
      return;
    }

    let cancelled = false;
    setCloudSyncStatus('loading');
    setCloudSyncMessage('Loading cloud briefs...');

    loadCloudBriefs(user.id)
      .then((cloudBriefs) => {
        if (cancelled) return;
        const hasLocalOnlyBriefs = localMigrationStore.briefs.some((localBrief) => (
          !cloudBriefs.some((cloudBrief) => cloudBrief.id === localBrief.id)
        ));
        if (cloudBriefs.length > 0) {
          setStore({ activeBriefId: cloudBriefs[0].id, briefs: cloudBriefs });
          setCloudSyncStatus('ready');
          setCloudSyncMessage('');
        } else {
          setCloudSyncStatus('local-only');
          setCloudSyncMessage('Sync local briefs to make them available across devices.');
        }
        setShowMigrationPrompt(hasLocalOnlyBriefs);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCloudSyncStatus('error');
        if (import.meta.env.DEV) {
          console.debug('[PipelineDefense] cloud load failed', { message: error instanceof Error ? error.message : 'Unknown error' });
        }
        setCloudSyncMessage('Cloud sync issue - your local copy is preserved.');
      });

    return () => {
      cancelled = true;
    };
  }, [accountLoading, localMigrationStore.briefs, sampleDataActive, user]);

  useEffect(() => {
    setSaveStatus('Unsaved changes');
    const timeoutId = window.setTimeout(async () => {
      const localBackupSaved = savePipelineDefenseBriefStore(store);

      if (accountLoading || cloudSyncStatus === 'loading') {
        setSaveStatus('Loading cloud briefs...');
        return;
      }

      if (sampleDataActive || !user) {
        setSaveStatus(localBackupSaved ? 'Saved locally in this browser' : 'Local save unavailable');
        return;
      }

      if (!canUsePipelineDefenseCloudStore() || cloudSyncStatus === 'error') {
        setSaveStatus(localBackupSaved ? 'Cloud sync issue - your local copy is preserved' : 'Cloud sync issue');
        return;
      }

      if (cloudSyncStatus !== 'ready') {
        setSaveStatus(localBackupSaved ? 'Saved locally in this browser' : 'Local save unavailable');
        return;
      }

      if (!store.briefs.every((brief) => hasCloudBriefId(brief))) {
        setSaveStatus(localBackupSaved ? 'Sync local briefs to enable cloud save' : 'Local save unavailable');
        return;
      }

      try {
        await Promise.all(store.briefs.map((brief) => saveCloudBrief(brief, user.id)));
        setSaveStatus('Synced to your account');
      } catch {
        debugCloudSync('cloud save failed');
        setSaveStatus(localBackupSaved ? 'Cloud sync issue - your local copy is preserved' : 'Cloud sync issue');
      }
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [accountLoading, cloudSyncStatus, sampleDataActive, store, user]);

  const buildMarkdown = () => generatePipelineDefenseBriefMarkdown({
    deals,
    summary,
    salesOwner: activeBrief?.salesOwner || pipelineDefenseBriefMeta.salesOwner,
    scope: activeBrief?.scope || pipelineDefenseBriefMeta.scope,
    weekLabel: activeBrief?.weekLabel || pipelineDefenseBriefMeta.week,
    pipelinePeriod: pipelineDefenseBriefMeta.pipelinePeriod,
  });

  const updateActiveBrief = (patch: Partial<PipelineDefenseBrief>) => {
    if (!activeBrief) return;
    setStore((currentStore) => updatePipelineDefenseBrief(currentStore, activeBrief.id, patch));
  };

  const clearAnalysis = () => {
    setDealSuggestions({});
    setAnalysisSummary(null);
    setBriefQualityAnalysis(null);
    setActionPlanItems(null);
    setDoneActionIds(new Set());
    setActionPlanCopyStatus('idle');
    closeDraftAssist();
  };

  const clearDealAnalysis = (dealId: string) => {
    setDealSuggestions((currentSuggestions) => {
      if (!currentSuggestions[dealId]) return currentSuggestions;
      const nextSuggestions = { ...currentSuggestions };
      delete nextSuggestions[dealId];
      return nextSuggestions;
    });
    setAnalysisSummary(null);
    setBriefQualityAnalysis(null);
    if (draftAssistDealId === dealId) {
      setDraftAssistResult(null);
      setDraftAssistCopyStatus('idle');
      setDraftAssistError('');
    }
  };

  const updateActiveDeals = (updater: (currentDeals: PipelineDefenseDeal[]) => PipelineDefenseDeal[]) => {
    if (!activeBrief) return;
    updateActiveBrief({ deals: updater(activeBrief.deals) });
  };

  const updateDeal = (dealId: string, patch: Partial<PipelineDefenseDeal>) => {
    updateActiveDeals((currentDeals) => currentDeals.map((deal) => (deal.id === dealId ? { ...deal, ...patch } : deal)));
    clearDealAnalysis(dealId);
  };

  const updateObjectionDebt = (dealId: string, patch: Partial<PipelineDefenseDeal['objectionDebt']>) => {
    updateActiveDeals((currentDeals) => currentDeals.map((deal) => (
      deal.id === dealId
        ? { ...deal, objectionDebt: { ...deal.objectionDebt, ...patch } }
        : deal
    )));
    clearDealAnalysis(dealId);
  };

  const addDeal = () => {
    const id = `deal-${Date.now()}`;
    const newDeal: PipelineDefenseDeal = {
      id,
      account: 'New Account',
      opportunity: 'New Opportunity',
      pipelineContext: 'Add pipeline period, stage, and source context.',
      dealTruth: 'Describe what is actually known versus assumed.',
      riskType: ['Missing decision context'],
      evidence: ['Add the customer evidence that supports or weakens this deal.'],
      missingContext: ['Decision maker', 'Decision timeline'],
      objectionDebt: {
        objection: 'Add unresolved objection or context gap.',
        evidence: 'Add source evidence.',
        requiredAction: 'Add required proof or action.',
        owner: 'Henry',
        status: 'Open',
      },
      forecastEvidenceCategory: 'Unsupported',
      recommendedAction: 'Clarify the deal truth before defending this opportunity.',
      pipelineReviewAnswer: 'This deal needs clearer evidence before it can be defended in review.',
      decisionRecommendation: 'Monitor',
    };

    updateActiveDeals((currentDeals) => [newDeal, ...currentDeals]);
    setEditingDealId(id);
    clearAnalysis();
  };

  const removeDeal = (dealId: string) => {
    updateActiveDeals((currentDeals) => currentDeals.filter((deal) => deal.id !== dealId));
    setEditingDealId((currentId) => (currentId === dealId ? null : currentId));
    clearDealAnalysis(dealId);
  };

  const resetDeals = () => {
    updateActiveBrief({ deals: createInitialPipelineDefenseDeals() });
    setEditingDealId(null);
    clearAnalysis();
  };

  const clearLocalBriefStorage = () => {
    if (cloudSyncReady) {
      clearPipelineDefenseBriefStore();
      setSaveStatus('Local backup cleared; cloud briefs unchanged');
      return;
    }

    const freshStore = createDefaultPipelineDefenseBriefStore();
    clearPipelineDefenseBriefStore();
    setStore(freshStore);
    setEditingDealId(null);
    clearAnalysis();
    setSaveStatus(savePipelineDefenseBriefStore(freshStore) ? 'Local brief storage cleared' : 'Local save unavailable');
  };

  const createNewBrief = async () => {
    const brief = createPipelineDefenseBrief({
      title: 'New Weekly Pipeline Defense Brief',
      weekLabel: 'Current Week',
      deals: createInitialPipelineDefenseDeals(),
    });

    if (cloudSyncReady && user) {
      try {
        const cloudBrief = await createCloudBrief(brief, user.id);
        setStore((currentStore) => ({
          activeBriefId: cloudBrief.id,
          briefs: [cloudBrief, ...currentStore.briefs],
        }));
        setSaveStatus('Synced to your account');
      } catch {
        setStore((currentStore) => ({
          activeBriefId: brief.id,
          briefs: [brief, ...currentStore.briefs],
        }));
        setSaveStatus('Cloud sync issue - your local copy is preserved');
      }
      setEditingDealId(null);
      clearAnalysis();
      return;
    }

    setStore((currentStore) => ({
      activeBriefId: brief.id,
      briefs: [brief, ...currentStore.briefs],
    }));
    setEditingDealId(null);
    clearAnalysis();
  };

  const duplicateCurrentBrief = async () => {
    if (!activeBrief) return;
    const duplicate = duplicatePipelineDefenseBrief(activeBrief);

    if (cloudSyncReady && user) {
      try {
        const cloudBrief = await createCloudBrief(duplicate, user.id);
        setStore((currentStore) => ({
          activeBriefId: cloudBrief.id,
          briefs: [cloudBrief, ...currentStore.briefs],
        }));
        setSaveStatus('Synced to your account');
      } catch {
        setStore((currentStore) => ({
          activeBriefId: duplicate.id,
          briefs: [duplicate, ...currentStore.briefs],
        }));
        setSaveStatus('Cloud sync issue - your local copy is preserved');
      }
      setEditingDealId(null);
      clearAnalysis();
      return;
    }

    setStore((currentStore) => ({
      activeBriefId: duplicate.id,
      briefs: [duplicate, ...currentStore.briefs],
    }));
    setEditingDealId(null);
    clearAnalysis();
  };

  const deleteCurrentBrief = async () => {
    if (!activeBrief) return;
    if (cloudSyncReady && hasCloudBriefId(activeBrief)) {
      try {
        await deleteCloudBrief(activeBrief.id);
      } catch {
        setSaveStatus('Cloud delete failed. Local view updated.');
      }
    }
    setStore((currentStore) => deletePipelineDefenseBrief(currentStore, activeBrief.id));
    setEditingDealId(null);
    clearAnalysis();
  };

  const syncLocalBriefs = async () => {
    if (!user || !canUsePipelineDefenseCloudStore()) {
      setCloudSyncStatus('error');
      setCloudSyncMessage('Cloud sync issue - your local copy is preserved.');
      return;
    }

    setMigrationBusy(true);
    setCloudSyncMessage('Syncing local briefs...');
    try {
      const syncedStore = await syncLocalBriefsToCloud(localMigrationStore, user.id);
      setStore(syncedStore);
      savePipelineDefenseBriefStore(syncedStore);
      setShowMigrationPrompt(false);
      setCloudSyncStatus('ready');
      setCloudSyncMessage('');
      setSaveStatus('Synced to your account');
    } catch (error) {
      setCloudSyncStatus('error');
      if (import.meta.env.DEV) {
        console.debug('[PipelineDefense] local migration failed', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
      setCloudSyncMessage('Cloud sync issue - your local copy is preserved.');
      setSaveStatus('Cloud sync issue - your local copy is preserved');
      debugCloudSync('local migration failed');
    } finally {
      setMigrationBusy(false);
    }
  };

  const keepLocalOnly = () => {
    setShowMigrationPrompt(false);
    setCloudSyncStatus(cloudSyncStatus === 'ready' ? 'ready' : 'local-only');
    setCloudSyncMessage(cloudSyncStatus === 'ready' ? '' : 'Keeping local briefs only in this browser.');
  };

  const switchBrief = (briefId: string) => {
    setStore((currentStore) => ({ ...currentStore, activeBriefId: briefId }));
    setEditingDealId(null);
    setMarkdownPreview('');
    clearAnalysis();
  };

  const exportMarkdown = () => {
    setMarkdownPreview(buildMarkdown());
    setCopyStatus('idle');
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdownPreview);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  const downloadMarkdown = () => {
    const blob = new Blob([markdownPreview], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pipeline-review-defense-brief.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const openImportPanel = () => {
    setImportOpen(true);
    setImportMessage('');
  };

  const parseImport = () => {
    const result = parsePipelineDeals(importInput);
    setParsedDeals(result.deals);
    setImportWarnings(result.warnings);
    setImportFormat(result.format);
    setImportMessage(result.deals.length > 0 ? `Parsed ${result.deals.length} deals.` : 'No deals detected. Check your headers or markdown format.');
  };

  const applyImport = () => {
    if (parsedDeals.length === 0) {
      setImportMessage('No parsed deals to apply.');
      return;
    }

    updateActiveDeals((currentDeals) => (importMode === 'replace' ? parsedDeals : [...currentDeals, ...parsedDeals]));
    setEditingDealId(null);
    setImportMessage(`Imported ${parsedDeals.length} deals.`);
    setParsedDeals([]);
    setImportInput('');
    clearAnalysis();
  };

  const analyzeDeal = (deal: PipelineDefenseDeal) => {
    const suggestion = analyzePipelineDefenseDeal(deal);
    setDealSuggestions((currentSuggestions) => ({ ...currentSuggestions, [deal.id]: suggestion }));
    setAnalysisSummary(null);
  };

  const analyzeAllDeals = () => {
    const suggestions = deals.reduce<Record<string, DealRiskSuggestion>>((acc, deal) => {
      acc[deal.id] = analyzePipelineDefenseDeal(deal);
      return acc;
    }, {});
    setDealSuggestions(suggestions);
    setAnalysisSummary(buildDealRiskAnalysisSummary(Object.values(suggestions)));
  };

  const reviewBriefQuality = () => {
    setBriefQualityAnalysis(analyzePipelineDefenseBriefQuality(activeBrief));
  };

  const generateWeeklyActionPlan = () => {
    setActionPlanItems(generatePipelineDefenseActionPlan(activeBrief));
    setDoneActionIds(new Set());
    setActionPlanCopyStatus('idle');
  };

  const toggleActionDone = (actionId: string) => {
    setDoneActionIds((currentDoneIds) => {
      const nextDoneIds = new Set(currentDoneIds);
      if (nextDoneIds.has(actionId)) {
        nextDoneIds.delete(actionId);
      } else {
        nextDoneIds.add(actionId);
      }
      return nextDoneIds;
    });
  };

  const copyActionPlan = async () => {
    const markdown = generateActionPlanMarkdown(activeBrief, actionPlanItems || []);
    try {
      await navigator.clipboard.writeText(markdown);
      setActionPlanCopyStatus('copied');
    } catch {
      setActionPlanCopyStatus('failed');
    }
  };

  const copyManagerSummary = async () => {
    try {
      await navigator.clipboard.writeText(shareableBrief.managerSummary);
      setManagerSummaryCopyStatus('copied');
      markTrialActivationChecklistItemComplete('copy-manager-summary');
      markPipelineReviewHabitStepComplete('copiedManagerSummaryAt');
      if (sampleDataActive) {
        markDemoJourneyComplete('Manager Summary copied from Pipeline Defense');
      }
    } catch {
      setManagerSummaryCopyStatus('failed');
    }
  };

  const copyShareReadyMarkdown = async () => {
    const markdown = generateShareReadyPipelineDefenseMarkdown({ brief: activeBrief, shareable: shareableBrief });
    try {
      await navigator.clipboard.writeText(markdown);
      setShareMarkdownCopyStatus('copied');
      markPipelineReviewHabitStepComplete('copiedManagerSummaryAt');
      if (sampleDataActive) {
        markDemoJourneyComplete('Share-ready Pipeline Defense Markdown copied');
      }
    } catch {
      setShareMarkdownCopyStatus('failed');
    }
  };

  const buildCurrentReviewPack = (existing?: ReviewPackSnapshot | null) => createReviewPackSnapshot({
    brief: activeBrief,
    shareable: shareableBrief,
    id: existing?.id,
    createdAt: existing?.createdAt,
    qualityChecklistSummary: briefQualityAnalysis
      ? `${briefQualityAnalysis.status}; ${briefQualityAnalysis.highRiskIssues} high, ${briefQualityAnalysis.mediumRiskIssues} medium, ${briefQualityAnalysis.lowRiskIssues} low issue(s).`
      : undefined,
  });

  const saveCurrentReviewPack = () => {
    if (!activeBrief) {
      setReviewPackMessage('No active brief to save yet.');
      return;
    }

    const pack = buildCurrentReviewPack();
    setReviewPacks(saveReviewPack(pack));
    setReviewPackMessage('Review pack saved as a new local snapshot.');
    markPipelineReviewHabitStepComplete('generatedBriefAt');
    if (sampleDataActive) {
      markDemoJourneyComplete('Review Pack saved from Pipeline Defense');
    }
  };

  const updateCurrentReviewPack = () => {
    if (!currentWeekReviewPack) {
      saveCurrentReviewPack();
      return;
    }

    const pack = buildCurrentReviewPack(currentWeekReviewPack);
    setReviewPacks(updateReviewPack(currentWeekReviewPack.id, pack));
    setReviewPackMessage('Saved review pack updated for this week.');
    markPipelineReviewHabitStepComplete('generatedBriefAt');
    if (sampleDataActive) {
      markDemoJourneyComplete('Review Pack updated from Pipeline Defense');
    }
  };

  const copyReviewPackManagerSummary = async (pack: ReviewPackSnapshot) => {
    try {
      await navigator.clipboard.writeText(pack.managerSummary);
      setReviewPackCopyStatus('copied');
      setReviewPackMessage('Saved pack manager summary copied.');
      markPipelineReviewHabitStepComplete('copiedManagerSummaryAt');
      if (sampleDataActive) {
        markDemoJourneyComplete('Saved Review Pack manager summary copied');
      }
    } catch {
      setReviewPackCopyStatus('failed');
      setReviewPackMessage('Clipboard failed. Open the saved pack to copy manually.');
    }
  };

  const copyReviewPackMarkdown = async (pack: ReviewPackSnapshot) => {
    try {
      await navigator.clipboard.writeText(pack.shareReadyMarkdown || generateReviewPackMarkdown(pack));
      setReviewPackCopyStatus('copied');
      setReviewPackMessage('Saved review pack Markdown copied.');
    } catch {
      setReviewPackCopyStatus('failed');
      setReviewPackMessage('Clipboard failed. Open the saved pack to copy manually.');
    }
  };

  const printReviewPack = (pack: ReviewPackSnapshot) => {
    setPrintableReviewPack(pack);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => setPrintableReviewPack(null), 250);
    }, 0);
  };

  const removeReviewPack = (packId: string) => {
    const confirmed = window.confirm('Delete this saved review pack from this browser?');
    if (!confirmed) return;
    setReviewPacks(deleteReviewPack(packId));
    setReviewPackMessage('Review pack deleted from this browser.');
  };

  const openDraftAssist = (dealId: string) => {
    const provider = getActiveDraftAssistProvider();
    setDraftAssistDealId((currentDealId) => (currentDealId === dealId ? null : dealId));
    setDraftAssistProviderLabel(provider.label);
    setDraftAssistType('Deal truth');
    setDraftAssistResult(null);
    setDraftAssistCopyStatus('idle');
    setDraftAssistGenerating(false);
    setDraftAssistError('');
  };

  const closeDraftAssist = () => {
    setDraftAssistDealId(null);
    setDraftAssistResult(null);
    setDraftAssistCopyStatus('idle');
    setDraftAssistGenerating(false);
    setDraftAssistError('');
  };

  const generateDraftForDeal = async (deal: PipelineDefenseDeal) => {
    const provider = getActiveDraftAssistProvider();
    setDraftAssistProviderLabel(provider.label);
    setDraftAssistGenerating(true);
    setDraftAssistError('');
    setDraftAssistCopyStatus('idle');

    try {
      const response = await provider.generateDraft({
        deal,
        draftType: draftAssistType,
        briefContext: {
          title: activeBrief?.title,
          weekLabel: activeBrief?.weekLabel,
          salesOwner: activeBrief?.salesOwner,
          scope: activeBrief?.scope,
        },
      });
      setDraftAssistProviderLabel(response.providerLabel);
      setDraftAssistResult(response.result);
    } catch {
      setDraftAssistError('Draft provider failed. No deal data changed. You can retry.');
    } finally {
      setDraftAssistGenerating(false);
    }
  };

  const copyDraft = async () => {
    if (!draftAssistResult) return;
    try {
      await navigator.clipboard.writeText(draftAssistResult.content);
      setDraftAssistCopyStatus('copied');
    } catch {
      setDraftAssistCopyStatus('failed');
    }
  };

  const applyDraft = (dealId: string) => {
    if (!draftAssistResult?.targetField) return;
    updateDeal(dealId, { [draftAssistResult.targetField]: draftAssistResult.content });
    setDraftAssistResult(null);
    setDraftAssistCopyStatus('idle');
    setDraftAssistError('');
  };

  const goToDeal = (dealId: string) => {
    document.getElementById(`pipeline-deal-${dealId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const applyDealSuggestion = (dealId: string) => {
    const suggestion = dealSuggestions[dealId];
    if (!suggestion) return;

    updateActiveDeals((currentDeals) => currentDeals.map((deal) => (
      deal.id === dealId
        ? {
          ...deal,
          forecastEvidenceCategory: suggestion.forecastEvidenceCategory,
          decisionRecommendation: suggestion.decisionRecommendation,
          recommendedAction: suggestion.suggestedAction,
        }
        : deal
    )));
    clearDealAnalysis(dealId);
  };

  const enterReviewMode = () => {
    setIsReviewMode(true);
    markPipelineReviewHabitStepComplete('generatedBriefAt');
    if (sampleDataActive) {
      markDemoJourneyComplete('Pipeline Defense Review Mode reached');
    }
    setImportOpen(false);
    setEditingDealId(null);
    setMarkdownPreview('');
    closeDraftAssist();
  };

  const exitReviewMode = () => {
    setIsReviewMode(false);
  };

  const printBrief = () => {
    setPrintableReviewPack(null);
    setImportOpen(false);
    setMarkdownPreview('');
    setCopyStatus('idle');
    window.setTimeout(() => window.print(), 0);
  };

  return (
    <>
    <div className="no-print mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Brief workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Pipeline Review Defense Brief</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">
              The Pipeline Defense Brief is your weekly review pack: defend the strong deals, rescue weak ones, and downgrade anything that cannot be supported with evidence.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 no-print">
              <a href="/app/opportunities" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100">
                Generate your first Pipeline Defense Brief
              </a>
              <a href="/app/demo-guide" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                Run 5-minute demo
              </a>
            </div>
            <div className="mt-3 no-print">
              <DataModePill
                showDescription
                isLoading={accountLoading || cloudSyncStatus === 'loading'}
                isAuthenticated={isAuthenticated}
                isSupabaseConfigured={isSupabaseConfigured}
                cloudAvailable={cloudSyncStatus !== 'error'}
                syncError={cloudSyncStatus === 'error' ? cloudSyncMessage || 'Cloud sync issue' : null}
                hasSampleData={sampleDataActive}
              />
            </div>
            {cloudSyncMessage && (
              <p className="mt-3 max-w-3xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                {cloudSyncMessage}
              </p>
            )}
            {isReviewMode && (
              <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                Use this before pipeline review. Editing controls are hidden.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <AuthButton />
            {isReviewMode ? (
              <div className="grid min-w-[320px] gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                <MetaRow label="Brief" value={activeBrief?.title || 'Pipeline Defense Brief'} />
                <MetaRow label="Week" value={activeBrief?.weekLabel || pipelineDefenseBriefMeta.week} />
                <MetaRow label="Sales owner" value={activeBrief?.salesOwner || pipelineDefenseBriefMeta.salesOwner} />
                <MetaRow label="Scope" value={activeBrief?.scope || pipelineDefenseBriefMeta.scope} />
                <MetaRow label="Period" value={pipelineDefenseBriefMeta.pipelinePeriod} />
              </div>
            ) : (
              <div className="grid min-w-[320px] gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Current brief</span>
                  <select
                    value={activeBrief?.id || ''}
                    onChange={(event) => switchBrief(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
                  >
                    {store.briefs.map((brief) => (
                      <option key={brief.id} value={brief.id}>{brief.title}</option>
                    ))}
                  </select>
                </label>
                <Field label="Brief title" value={activeBrief?.title || ''} onChange={(value) => updateActiveBrief({ title: value })} />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Week label" value={activeBrief?.weekLabel || ''} onChange={(value) => updateActiveBrief({ weekLabel: value })} />
                  <Field label="Sales owner" value={activeBrief?.salesOwner || ''} onChange={(value) => updateActiveBrief({ salesOwner: value })} />
                </div>
                <Field label="Scope" value={activeBrief?.scope || ''} onChange={(value) => updateActiveBrief({ scope: value })} />
                <MetaRow label="Period" value={pipelineDefenseBriefMeta.pipelinePeriod} />
                <MetaRow label="Draft" value={saveStatus} />
                <p className="text-xs leading-5 text-gray-500">
                  {isAuthenticated ? 'Pipeline Defense follows the workspace data mode shown above.' : 'Sign in to sync briefs across devices.'}
                </p>
              </div>
            )}
            <div className="grid gap-4">
              <div className="rounded-lg border border-brand-blue/20 bg-blue-50/60 p-4">
                <div className="mb-3 flex flex-col gap-1">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Primary actions</p>
                  <p className="text-sm text-gray-600">Review, export, print, and run deterministic prep checks for the active brief.</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={isReviewMode ? exitReviewMode : enterReviewMode}
                    className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
                  >
                    {isReviewMode ? 'Exit Review Mode' : 'Enter Review Mode'}
                  </button>
                  <button type="button" onClick={exportMarkdown} className="inline-flex items-center gap-2 rounded-full border border-brand-blue bg-white px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100">
                    <Download className="h-4 w-4" />
                    Export Brief
                  </button>
                  <button type="button" onClick={printBrief} className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                    <Printer className="h-4 w-4" />
                    Print / Save PDF
                  </button>
                  {currentWeekReviewPack ? (
                    <>
                      <button type="button" onClick={updateCurrentReviewPack} className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
                        <ClipboardCheck className="h-4 w-4" />
                        Update saved pack
                      </button>
                      <button type="button" onClick={saveCurrentReviewPack} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                        Save as new pack
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={saveCurrentReviewPack} className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
                      <ClipboardCheck className="h-4 w-4" />
                      Save Review Pack
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={analyzeAllDeals}
                    disabled={deals.length === 0}
                    className="rounded-full border border-brand-blue bg-white px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Analyze Deal Risks
                  </button>
                  <button
                    type="button"
                    onClick={reviewBriefQuality}
                    className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Check Review Readiness
                  </button>
                  <button
                    type="button"
                    onClick={generateWeeklyActionPlan}
                    className="rounded-full border border-brand-blue bg-white px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100"
                  >
                    Generate This Week's Actions
                  </button>
                </div>
                {reviewPackMessage && (
                  <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                    reviewPackCopyStatus === 'failed' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {reviewPackMessage}
                  </p>
                )}
              </div>

              {!isReviewMode && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 flex flex-col gap-1">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Secondary / admin actions</p>
                    <p className="text-sm text-gray-500">
                      Use these for setup, data changes, and local storage maintenance. Storage follows the workspace data mode shown above.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button type="button" onClick={openImportPanel} className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                      <Upload className="h-4 w-4" />
                      Import Deals
                    </button>
                    <button type="button" onClick={addDeal} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                      Add Deal
                    </button>
                    <button type="button" onClick={createNewBrief} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                      New Brief
                    </button>
                    <button type="button" onClick={duplicateCurrentBrief} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                      Duplicate Brief
                    </button>
                    <button type="button" onClick={resetDeals} className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                      <RotateCcw className="h-4 w-4" />
                      Reset sample data
                    </button>
                    <button type="button" onClick={deleteCurrentBrief} className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50">
                      Delete Brief
                    </button>
                    <button type="button" onClick={clearLocalBriefStorage} className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50">
                      Clear local storage
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {sampleDataActive && (
        <div className="mb-6">
          <DemoJourneyCard compact />
        </div>
      )}

      {showMigrationPrompt && isAuthenticated && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Local briefs found</p>
              <h2 className="mt-1 text-lg font-bold text-amber-950">Sync local briefs to your account?</h2>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                You have local briefs on this browser. Sync them to your account to use them across devices, or keep them local only.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={syncLocalBriefs}
                disabled={migrationBusy}
                className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {migrationBusy ? 'Syncing...' : 'Sync local briefs'}
              </button>
              <button
                type="button"
                onClick={keepLocalOnly}
                disabled={migrationBusy}
                className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Keep local only
              </button>
              <button
                type="button"
                onClick={() => setShowMigrationPrompt(false)}
                disabled={migrationBusy}
                className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </section>
      )}

      {importOpen && !isReviewMode && (
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Import</p>
            <h2 className="mt-1 text-xl font-bold text-navy">Import Pipeline Deals</h2>
            <p className="mt-1 text-sm text-gray-500">
              Paste CSV or Markdown, preview the parsed deals, then append or replace the active brief.
            </p>
          </div>
            <button type="button" onClick={() => setImportOpen(false)} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <div>
              <textarea
                value={importInput}
                onChange={(event) => {
                  setImportInput(event.target.value);
                  setImportMessage('');
                }}
                rows={12}
                placeholder="CSV headers: account,opportunity,pipelineContext,dealTruth,riskType,evidence,missingContext,objectionDebt,forecastEvidenceCategory,recommendedAction,pipelineReviewAnswer,decisionRecommendation&#10;&#10;Markdown:&#10;### TV Pharm / Tender Opportunity&#10;Pipeline context: ...&#10;Deal truth: ...&#10;Risk type: ...&#10;Evidence: ..."
                className="w-full rounded-lg border border-gray-300 bg-gray-50 p-4 font-mono text-xs leading-5 text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={parseImport} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90">
                  Parse Import
                </button>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="radio"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                  />
                  Append
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="radio"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  Replace
                </label>
                <button
                  type="button"
                  onClick={applyImport}
                  disabled={parsedDeals.length === 0}
                  className="rounded-full border border-brand-blue bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply Import
                </button>
              </div>
              {importMessage && <p className="mt-3 text-sm font-semibold text-gray-700">{importMessage}</p>}
              {importWarnings.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {importWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">Parsed preview</p>
                  <p className="text-xs text-gray-500">Format: {importFormat}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-600">{parsedDeals.length} deals</span>
              </div>
              {parsedDeals.length === 0 ? (
                <p className="text-sm text-gray-500">No parsed deals yet. Paste input and click Parse Import to preview what will be added.</p>
              ) : (
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {parsedDeals.map((deal) => (
                    <div key={deal.id} className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-sm font-bold text-gray-900">{deal.account}</p>
                      <p className="mt-1 text-sm text-gray-500">{deal.opportunity}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge className={categoryClasses[deal.forecastEvidenceCategory]}>{deal.forecastEvidenceCategory}</Badge>
                        <Badge className={decisionClasses[deal.decisionRecommendation]}>{deal.decisionRecommendation}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-gray-500">{deal.dealTruth}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {markdownPreview && (
        <section className="mb-6 rounded-xl border border-brand-blue/20 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Markdown export</p>
              <h2 className="mt-1 text-xl font-bold text-navy">Generated Pipeline Review Defense Brief</h2>
              <p className="mt-1 text-sm text-gray-500">This output reflects the current edited state on this page.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyMarkdown} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90">
                Copy Markdown
              </button>
              <button type="button" onClick={downloadMarkdown} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                Download .md
              </button>
              <button type="button" onClick={() => setMarkdownPreview('')} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
          {copyStatus === 'copied' && <p className="mb-2 text-sm font-semibold text-emerald-700">Copied</p>}
          {copyStatus === 'failed' && <p className="mb-2 text-sm font-semibold text-amber-700">Clipboard failed. The Markdown is visible below for manual copy.</p>}
          <textarea
            readOnly
            value={markdownPreview}
            rows={16}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 p-4 font-mono text-xs leading-5 text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          />
        </section>
      )}

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Deals reviewed" value={String(summary.dealsReviewed)} detail="Current editable review set" />
        <SummaryCard label="At-risk deals" value={String(summary.atRiskDeals)} detail="Not marked Defensible" tone="amber" />
        <SummaryCard label="Highest-risk deal" value={summary.highestRiskDeal?.account || 'None'} detail={summary.highestRiskDeal?.opportunity || 'No active deal'} tone="red" />
        <SummaryCard label="Most common missing context" value={summary.commonMissingContext?.label || 'None'} detail={`${summary.commonMissingContext?.count || 0} deals affected`} />
        <SummaryCard label="Top action this week" value={summary.topRecommendedAction?.decisionRecommendation || 'None'} detail={summary.topRecommendedAction?.recommendedAction || 'Add a deal to review'} tone="blue" />
      </section>

      <ReviewPackHistory
        packs={reviewPacks}
        currentPackId={currentWeekReviewPack?.id}
        onCopyManagerSummary={copyReviewPackManagerSummary}
        onCopyMarkdown={copyReviewPackMarkdown}
        onPrint={printReviewPack}
        onDelete={removeReviewPack}
      />

      <ShareableBriefPanel
        shareableBrief={shareableBrief}
        managerSummaryCopyStatus={managerSummaryCopyStatus}
        shareMarkdownCopyStatus={shareMarkdownCopyStatus}
        onCopyManagerSummary={copyManagerSummary}
        onCopyShareMarkdown={copyShareReadyMarkdown}
      />

      {isReviewMode && (
        <ReviewModeSummaryStrip deals={deals} qualityAnalysis={briefQualityAnalysis} onReviewQuality={reviewBriefQuality} />
      )}

      <IntelligencePanelStatus
        hasRiskSummary={Boolean(analysisSummary)}
        hasQualityReview={Boolean(briefQualityAnalysis)}
        hasActionPlan={Boolean(actionPlanItems)}
        hasDeals={deals.length > 0}
        onAnalyzeRisks={analyzeAllDeals}
        onReviewQuality={reviewBriefQuality}
        onGenerateActions={generateWeeklyActionPlan}
      />

      {briefQualityAnalysis && (
        <BriefQualityReviewPanel analysis={briefQualityAnalysis} onGoToDeal={goToDeal} />
      )}

      {actionPlanItems && (
        <WeeklyActionPlanPanel
          activeBrief={activeBrief}
          items={actionPlanItems}
          doneActionIds={doneActionIds}
          copyStatus={actionPlanCopyStatus}
          onToggleDone={toggleActionDone}
          onCopy={copyActionPlan}
          onGoToDeal={goToDeal}
        />
      )}

      {analysisSummary && (
        <section className="mb-6 rounded-xl border border-brand-blue/20 bg-white p-5 shadow-sm">
          <SectionHeader
            eyebrow="Rules analysis"
            title="Deal Risk Rules Summary"
            description="Generated from the current active brief. Suggestions remain separate until applied deal by deal."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="High-risk deals" value={String(analysisSummary.highRiskDeals)} detail={`${analysisSummary.totalDeals} deals analyzed`} tone="red" />
            <SummaryCard label="Objection debt flags" value={String(analysisSummary.objectionDebtFlags)} detail="Open objection debt signals" tone="amber" />
            <SummaryCard label="Hope / unsupported" value={String(analysisSummary.unsupportedOrHopeBased)} detail="Suggested forecast evidence categories" tone="amber" />
            <SummaryCard label="Rescue" value={String(analysisSummary.rescueCount)} detail="Suggested rescue decisions" tone="blue" />
            <SummaryCard label="Downgrade / monitor" value={`${analysisSummary.downgradeCount} / ${analysisSummary.monitorCount}`} detail="Suggested downgrade and monitor counts" />
          </div>
        </section>
      )}

      {!isReviewMode && (
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <details>
          <summary className="cursor-pointer text-sm font-bold text-navy">How rules work</summary>
          <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
            <p>Missing decision context increases risk because the deal is harder to defend in review.</p>
            <p>Unresolved objection debt increases rescue priority until proof, response, or a confirmed next step exists.</p>
            <p>Weak evidence makes the forecast less defensible, especially when language is unclear, waiting, possible, or not confirmed.</p>
            <p>Confirmed next customer action, decision ownership, procurement proof, or completed technical evaluation improves defensibility.</p>
          </div>
        </details>
      </section>
      )}

      {deals.length === 0 ? (
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-900">No pipeline deals available for this review.</p>
          {!isReviewMode && (
            <>
              <p className="mt-1 text-sm text-gray-500">
                Import deals, add one manually, or create a brief from selected opportunities in the Opportunities workspace.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" onClick={addDeal} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90">
                  Add Deal
                </button>
                <a href="/app/opportunities" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100">
                  Create from opportunities
                </a>
                <a href="/app/onboarding/pipeline-review" className="rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
                  Start First Pipeline Review
                </a>
                <button type="button" onClick={resetDeals} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                  Reset to sample data
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <section className="mb-8">
            <SectionHeader
              eyebrow="Deal defense"
              title="Top At-Risk Deals"
              description={isReviewMode ? 'Compact read-only deal view for pipeline review.' : 'Edit each card while preparing review. Changes update the summary, radar, debt, actions, and decision log immediately.'}
            />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {deals.map((deal) => (
                isReviewMode ? (
                  <PipelineDefenseReviewDealCard key={deal.id} deal={deal} />
                ) : (
                  <DealDefenseCard
                    key={deal.id}
                    deal={deal}
                    editing={editingDealId === deal.id}
                    onEdit={() => setEditingDealId(deal.id)}
                    onCancel={() => setEditingDealId(null)}
                    onRemove={() => removeDeal(deal.id)}
                    onUpdate={(patch) => updateDeal(deal.id, patch)}
                    onUpdateObjection={(patch) => updateObjectionDebt(deal.id, patch)}
                    suggestion={dealSuggestions[deal.id]}
                    onAnalyze={() => analyzeDeal(deal)}
                    onApplySuggestion={() => applyDealSuggestion(deal.id)}
                    draftAssistOpen={draftAssistDealId === deal.id}
                    draftAssistType={draftAssistType}
                    draftAssistResult={draftAssistDealId === deal.id ? draftAssistResult : null}
                    draftAssistCopyStatus={draftAssistDealId === deal.id ? draftAssistCopyStatus : 'idle'}
                    draftAssistProviderLabel={draftAssistProviderLabel}
                    draftAssistGenerating={draftAssistDealId === deal.id ? draftAssistGenerating : false}
                    draftAssistError={draftAssistDealId === deal.id ? draftAssistError : ''}
                    onOpenDraftAssist={() => openDraftAssist(deal.id)}
                    onCloseDraftAssist={closeDraftAssist}
                    onDraftAssistTypeChange={(value) => {
                      setDraftAssistType(value);
                      setDraftAssistResult(null);
                      setDraftAssistCopyStatus('idle');
                      setDraftAssistError('');
                    }}
                    onGenerateDraft={() => generateDraftForDeal(deal)}
                    onCopyDraft={copyDraft}
                    onApplyDraft={() => applyDraft(deal.id)}
                  />
                )
              ))}
            </div>
          </section>

          {!isReviewMode && (
            <>
              <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
                <MissingContextRadar deals={deals} />
                <ObjectionDebt deals={deals} />
              </div>

              <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <ForecastEvidence />
                <ManagerQuestions />
              </div>

              <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <RecommendedActions deals={deals} />
                <DecisionLog deals={deals} />
              </div>
            </>
          )}
        </>
      )}
    </div>
    {printableReviewPack ? (
      <div className="print-only">
        <ReviewPackReadOnly pack={printableReviewPack} />
      </div>
    ) : (
      <PipelineDefensePrintableBrief brief={activeBrief} deals={deals} summary={summary} actionItems={activeActionPlanItems} />
    )}
    </>
  );
}

function ReviewPackHistory({
  packs,
  currentPackId,
  onCopyManagerSummary,
  onCopyMarkdown,
  onPrint,
  onDelete,
}: {
  packs: ReviewPackSnapshot[];
  currentPackId?: string;
  onCopyManagerSummary: (pack: ReviewPackSnapshot) => void;
  onCopyMarkdown: (pack: ReviewPackSnapshot) => void;
  onPrint: (pack: ReviewPackSnapshot) => void;
  onDelete: (packId: string) => void;
}) {
  const latestPack = packs[0];
  const previousPack = packs[1];

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          eyebrow="Review pack history"
          title="Saved Review Packs"
          description="Local snapshots of what was presented, copied, and exported for pipeline review. These do not create public share links."
        />
        {latestPack && previousPack && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">
            Previous week: {previousPack.defendCount} defend / {previousPack.rescueCount} rescue / {previousPack.downgradeCount} downgrade
          </div>
        )}
      </div>

      {packs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-5 text-center">
          <p className="text-sm font-bold text-navy">No saved review packs yet.</p>
          <p className="mt-1 text-sm text-gray-500">Save a review pack after generating or entering Review Mode to keep a weekly record.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packs.slice(0, 8).map((pack) => (
            <article key={pack.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-navy">{pack.title}</h3>
                    {pack.id === currentPackId && (
                      <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Current week</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {pack.dealCount} deals • {pack.defendCount} defend / {pack.rescueCount} rescue / {pack.downgradeCount} downgrade • saved {formatReviewPackDate(pack.createdAt)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-gray-400">Week ID: {pack.weekId}</p>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Link to={`/app/pipeline-defense/review-pack/${pack.id}`} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90">
                    Open
                  </Link>
                  <button type="button" onClick={() => onCopyManagerSummary(pack)} className="rounded-full border border-brand-blue bg-white px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-50">
                    Copy Manager Summary
                  </button>
                  <button type="button" onClick={() => onCopyMarkdown(pack)} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                    Copy Markdown
                  </button>
                  <button type="button" onClick={() => onPrint(pack)} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                    Print / Save PDF
                  </button>
                  <button type="button" onClick={() => onDelete(pack.id)} className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100">
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ShareableBriefPanel({
  shareableBrief,
  managerSummaryCopyStatus,
  shareMarkdownCopyStatus,
  onCopyManagerSummary,
  onCopyShareMarkdown,
}: {
  shareableBrief: ShareablePipelineDefenseBrief;
  managerSummaryCopyStatus: 'idle' | 'copied' | 'failed';
  shareMarkdownCopyStatus: 'idle' | 'copied' | 'failed';
  onCopyManagerSummary: () => void;
  onCopyShareMarkdown: () => void;
}) {
  const summary = shareableBrief.executiveSummary;
  const [briefUsefulness, setBriefUsefulness] = useState<PipelineBriefUsefulness>('Yes, useful');
  const [briefFeedbackNote, setBriefFeedbackNote] = useState('');
  const [briefFeedbackMessage, setBriefFeedbackMessage] = useState('');

  const submitBriefFeedback = () => {
    createDemoFeedback({
      context: 'Pipeline Defense',
      userPersona: 'Pipeline review demo user',
      understoodIn30Seconds: briefUsefulness === 'Yes, useful' ? 'Yes' : briefUsefulness === 'Partly useful' ? 'Partly' : 'No',
      mostValuableWorkflow: 'Pipeline Defense Brief',
      likelyUsageFrequency: 'Before pipeline review',
      willingnessToPay: 'Not asked',
      topAdoptionBlocker: briefUsefulness === 'Not useful yet' ? 'Brief is not manager-ready yet' : '',
      featureRequest: briefFeedbackNote,
      freeTextFeedback: briefFeedbackNote,
      briefUsefulness,
    });
    setBriefFeedbackMessage('Brief feedback saved locally.');
    setBriefFeedbackNote('');
  };

  return (
    <section className="mb-6 rounded-xl border border-brand-blue/20 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          eyebrow="Share-ready brief"
          title="Manager Review Summary"
          description="A compact manager-ready view for weekly pipeline review, Markdown sharing, and clean print/PDF output."
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopyManagerSummary}
            className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
          >
            Copy Manager Summary
          </button>
          <button
            type="button"
            onClick={onCopyShareMarkdown}
            className="rounded-full border border-brand-blue bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100"
          >
            Copy Share-ready Markdown
          </button>
        </div>
      </div>

      {(managerSummaryCopyStatus === 'copied' || shareMarkdownCopyStatus === 'copied') && (
        <p className="mb-3 text-sm font-semibold text-emerald-700">Copied to clipboard.</p>
      )}
      {(managerSummaryCopyStatus === 'failed' || shareMarkdownCopyStatus === 'failed') && (
        <p className="mb-3 text-sm font-semibold text-amber-700">Clipboard failed. The summary and export sections remain visible for manual copy.</p>
      )}

      <section className="mb-4 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold text-blue-950">Was this brief useful for a real pipeline review?</p>
            <p className="mt-1 text-xs leading-5 text-blue-800">Save a local validation signal after showing this to a real sales user.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['Yes, useful', 'Partly useful', 'Not useful yet'] as PipelineBriefUsefulness[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setBriefUsefulness(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  briefUsefulness === option
                    ? 'bg-navy text-white'
                    : 'border border-blue-100 bg-white text-brand-blue'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={briefFeedbackNote}
            onChange={(event) => setBriefFeedbackNote(event.target.value)}
            placeholder="What would make this manager-ready?"
            className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          />
          <button type="button" onClick={submitBriefFeedback} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Save feedback
          </button>
        </div>
        {briefFeedbackMessage && <p className="mt-2 text-sm font-semibold text-emerald-700">{briefFeedbackMessage}</p>}
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-bold text-gray-900">Manager summary</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-700">{shareableBrief.managerSummary}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniMetric label="Total deals" value={String(summary.totalDeals)} />
            <MiniMetric label="Defendable" value={String(summary.defendableDeals)} tone="green" />
            <MiniMetric label="Rescue" value={String(summary.rescueDeals)} tone="amber" />
            <MiniMetric label="Downgrade" value={String(summary.downgradeDeals)} tone="red" />
          </div>
          <p className="mt-3 text-xs font-semibold text-gray-500">Pipeline value captured: {summary.totalPipelineValueLabel}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4">
            <p className="text-sm font-bold text-gray-900">Deal Defense Table</p>
            <p className="mt-1 text-xs text-gray-500">Account, forecast posture, main evidence, main gap, and next defense action.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Deal</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Forecast</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Evidence / gap</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {shareableBrief.dealRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-3 align-top">
                      <p className="font-bold text-gray-900">{row.account}</p>
                      <p className="mt-1 text-gray-500">{row.opportunity}</p>
                      <p className="mt-1 text-gray-400">{row.currentStage} · {row.value}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-gray-700">{row.forecastCategory}</td>
                    <td className="px-3 py-3 align-top">
                      <Badge className={defenseStatusClass(row.defenseStatus)}>{row.defenseStatus}</Badge>
                    </td>
                    <td className="px-3 py-3 align-top text-gray-600">
                      <p><span className="font-bold text-gray-700">Evidence:</span> {row.mainEvidence}</p>
                      <p className="mt-1"><span className="font-bold text-gray-700">Gap:</span> {row.mainGap}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-gray-600">{row.nextDefenseAction}</td>
                  </tr>
                ))}
                {shareableBrief.dealRows.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-sm text-gray-500" colSpan={5}>No deals available for a share-ready brief.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <DealGroup title="Deals to defend" deals={shareableBrief.dealsToDefend} empty="No defendable deals yet." />
        <DealGroup title="Deals to rescue" deals={shareableBrief.dealsToRescue} empty="No rescue deals flagged." />
        <DealGroup title="Downgrade / deprioritize" deals={shareableBrief.dealsToDowngrade} empty="No downgrade candidates flagged." />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-bold text-gray-900">Top Missing Proof / MEDDIC Gaps</p>
          {shareableBrief.topMissingProofGaps.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No repeated proof or MEDDIC gap detected.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {shareableBrief.topMissingProofGaps.slice(0, 5).map((gap) => (
                <li key={gap.label} className="rounded-lg bg-white p-3 text-sm ring-1 ring-gray-100">
                  <span className="font-bold text-gray-900">{gap.label}</span>
                  <span className="text-gray-500"> · {gap.count} deal(s): {gap.accounts.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-bold text-gray-900">Brief Quality Checklist</p>
          <div className="mt-3 grid gap-2">
            {shareableBrief.qualityChecklist.map((item) => (
              <div key={item.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={item.status === 'pass' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                    {item.status === 'pass' ? 'Pass' : 'Warning'}
                  </Badge>
                  <p className="text-sm font-bold text-gray-900">{item.label}</p>
                </div>
                <p className="mt-1 text-sm text-gray-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-bold text-gray-900">Next Defense Actions</p>
        {shareableBrief.nextDefenseActions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No next defense actions defined yet.</p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {shareableBrief.nextDefenseActions.slice(0, 6).map((action) => (
              <article key={action.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
                <div className="flex flex-wrap gap-2">
                  <Badge className={action.priority === 'Critical' || action.priority === 'High' ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}>
                    {action.priority}
                  </Badge>
                  <Badge className="border-gray-200 bg-gray-50 text-gray-600">{action.source}</Badge>
                </div>
                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{action.account} / {action.opportunity}</p>
                <p className="mt-1 text-sm font-bold text-gray-900">{action.title}</p>
                <p className="mt-1 text-sm text-gray-500">{action.detail}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'amber' | 'red' }) {
  const toneClass = {
    default: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];

  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-lg font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function DealGroup({ title, deals, empty }: { title: string; deals: PipelineDefenseDeal[]; empty: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-bold text-gray-900">{title}</p>
      {deals.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {deals.map((deal) => (
            <li key={deal.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
              <p className="text-sm font-bold text-gray-900">{deal.account}</p>
              <p className="mt-1 text-sm text-gray-500">{deal.opportunity}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function defenseStatusClass(status: string) {
  if (status === 'Defend') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Rescue') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'Downgrade') return 'border-orange-200 bg-orange-50 text-orange-700';
  return 'border-indigo-200 bg-indigo-50 text-indigo-700';
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-right font-semibold text-gray-800">{value}</span>
    </div>
  );
}

function SummaryCard({ label, value, detail, tone = 'default' }: { label: string; value: string; detail: string; tone?: 'default' | 'amber' | 'red' | 'blue' }) {
  const toneClass = {
    default: 'text-navy',
    amber: 'text-amber-700',
    red: 'text-red-700',
    blue: 'text-brand-blue',
  }[tone];

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 line-clamp-2 text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 line-clamp-3 text-sm text-gray-500">{detail}</p>
    </article>
  );
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="mb-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold text-navy">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-gray-500">{description}</p>
    </header>
  );
}

function ReviewModeSummaryStrip({
  deals,
  qualityAnalysis,
  onReviewQuality,
}: {
  deals: PipelineDefenseDeal[];
  qualityAnalysis: BriefQualityAnalysis | null;
  onReviewQuality: () => void;
}) {
  const unsupportedOrHopeBased = deals.filter((deal) => (
    deal.forecastEvidenceCategory === 'Unsupported' || deal.forecastEvidenceCategory === 'Hope-based'
  )).length;
  const rescueOrDowngrade = deals.filter((deal) => (
    deal.decisionRecommendation === 'Rescue' || deal.decisionRecommendation === 'Downgrade'
  )).length;

  return (
    <section className="mb-6 rounded-xl border border-brand-blue/20 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          eyebrow="Review mode"
          title="Pipeline Review Summary"
          description="Compact review strip for the active brief. No data changes are made in this mode."
        />
        {!qualityAnalysis && (
          <button type="button" onClick={onReviewQuality} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
            Check Review Readiness
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total deals" value={String(deals.length)} detail="Current active brief" />
        <SummaryCard label="At-risk deals" value={String(deals.filter((deal) => deal.forecastEvidenceCategory !== 'Defensible').length)} detail="Not marked Defensible" tone="amber" />
        <SummaryCard label="Unsupported / hope" value={String(unsupportedOrHopeBased)} detail="Forecast evidence risk" tone="red" />
        <SummaryCard label="Rescue / downgrade" value={String(rescueOrDowngrade)} detail="Review decisions to prepare" tone="blue" />
        <SummaryCard
          label="Readiness"
          value={qualityAnalysis?.status || 'Not run'}
          detail={qualityAnalysis ? `${qualityAnalysis.highRiskIssues} high-risk issues` : 'Quality review not run yet'}
          tone={qualityAnalysis?.status === 'High risk / not defensible' ? 'red' : qualityAnalysis?.status === 'Needs cleanup' ? 'amber' : 'default'}
        />
      </div>
    </section>
  );
}

function IntelligencePanelStatus({
  hasRiskSummary,
  hasQualityReview,
  hasActionPlan,
  hasDeals,
  onAnalyzeRisks,
  onReviewQuality,
  onGenerateActions,
}: {
  hasRiskSummary: boolean;
  hasQualityReview: boolean;
  hasActionPlan: boolean;
  hasDeals: boolean;
  onAnalyzeRisks: () => void;
  onReviewQuality: () => void;
  onGenerateActions: () => void;
}) {
  const allGenerated = hasRiskSummary && hasQualityReview && hasActionPlan;

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <SectionHeader
        eyebrow="Intelligence panels"
        title="Review Prep Checks"
        description="Run deterministic checks when Henry needs risk analysis, readiness review, or weekly actions."
      />
      {allGenerated ? (
        <p className="text-sm font-semibold text-emerald-700">Risk analysis, review readiness, and weekly actions are generated for the current brief.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {!hasRiskSummary && (
            <EmptyPrepCard
              title="Deal risk analysis not run yet"
              description="Classifies deal risk and flags weak evidence, objection debt, and missing context."
              actionLabel="Analyze Deal Risks"
              disabled={!hasDeals}
              onAction={onAnalyzeRisks}
            />
          )}
          {!hasQualityReview && (
            <EmptyPrepCard
              title="Review readiness not checked yet"
              description="Checks whether the brief is defensible before review."
              actionLabel="Check Review Readiness"
              onAction={onReviewQuality}
            />
          )}
          {!hasActionPlan && (
            <EmptyPrepCard
              title="No weekly action plan generated yet"
              description="Turns weak deals and unresolved risks into weekly actions."
              actionLabel="Generate This Week's Actions"
              onAction={onGenerateActions}
            />
          )}
        </div>
      )}
    </section>
  );
}

function EmptyPrepCard({
  title,
  description,
  actionLabel,
  disabled = false,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-bold text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="mt-3 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function BriefQualityReviewPanel({ analysis, onGoToDeal }: { analysis: BriefQualityAnalysis; onGoToDeal: (dealId: string) => void }) {
  const highIssues = analysis.issues.filter((issue) => issue.severity === 'high');
  const mediumIssues = analysis.issues.filter((issue) => issue.severity === 'medium');
  const lowIssues = analysis.issues.filter((issue) => issue.severity === 'low');

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          eyebrow="Brief readiness"
          title="Brief Quality Review"
          description="Checks whether the brief is defensible before review."
        />
        <Badge className={readinessClasses[analysis.status]}>{analysis.status}</Badge>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total deals" value={String(analysis.totalDeals)} detail="Current active brief" />
        <SummaryCard label="High-risk issues" value={String(analysis.highRiskIssues)} detail="Must resolve before review" tone="red" />
        <SummaryCard label="Medium-risk issues" value={String(analysis.mediumRiskIssues)} detail="Cleanup recommended" tone="amber" />
        <SummaryCard label="Low-risk issues" value={String(analysis.lowRiskIssues)} detail="Polish before sharing" />
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-bold text-gray-900">Recommended cleanup actions</p>
        {analysis.cleanupActions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No cleanup actions detected.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {analysis.cleanupActions.map((action) => (
              <li key={action} className="flex gap-2 text-sm text-gray-600">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue/40" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <BriefQualityIssueGroup title="High" issues={highIssues} onGoToDeal={onGoToDeal} />
        <BriefQualityIssueGroup title="Medium" issues={mediumIssues} onGoToDeal={onGoToDeal} />
        <BriefQualityIssueGroup title="Low" issues={lowIssues} onGoToDeal={onGoToDeal} />
      </div>
    </section>
  );
}

function BriefQualityIssueGroup({
  title,
  issues,
  onGoToDeal,
}: {
  title: 'High' | 'Medium' | 'Low';
  issues: BriefQualityIssue[];
  onGoToDeal: (dealId: string) => void;
}) {
  const severity = title.toLowerCase() as BriefQualityIssue['severity'];

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        <Badge className={severityClasses[severity]}>{issues.length}</Badge>
      </div>
      {issues.length === 0 ? (
        <p className="text-sm text-gray-500">No {severity}-risk issues.</p>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div key={issue.id} className="rounded-lg border border-gray-200 bg-white p-3">
              {issue.account && <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{issue.account}</p>}
              <p className="mt-1 text-sm font-bold text-gray-900">{issue.label}</p>
              <p className="mt-1 text-sm text-gray-600">{issue.reason}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">Cleanup</p>
              <p className="mt-1 text-sm text-gray-600">{issue.suggestedCleanupAction}</p>
              {issue.dealId && (
                <button
                  type="button"
                  onClick={() => onGoToDeal(issue.dealId as string)}
                  className="mt-3 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  Go to deal
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeeklyActionPlanPanel({
  activeBrief,
  items,
  doneActionIds,
  copyStatus,
  onToggleDone,
  onCopy,
  onGoToDeal,
}: {
  activeBrief: PipelineDefenseBrief | null;
  items: PipelineDefenseActionItem[];
  doneActionIds: Set<string>;
  copyStatus: 'idle' | 'copied' | 'failed';
  onToggleDone: (actionId: string) => void;
  onCopy: () => void;
  onGoToDeal: (dealId: string) => void;
}) {
  const grouped = groupActionItemsByPriority(items);
  const markdown = generateActionPlanMarkdown(activeBrief, items);

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          eyebrow="This week"
          title="Weekly Action Plan"
          description="Turns weak deals and unresolved risks into weekly actions. Done state is local to this session."
        />
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            type="button"
            onClick={onCopy}
            disabled={items.length === 0}
            className="rounded-full border border-brand-blue bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Copy Action Plan
          </button>
        </div>
      </div>

      {copyStatus === 'copied' && <p className="mb-3 text-sm font-semibold text-emerald-700">Copied</p>}
      {copyStatus === 'failed' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-800">Clipboard failed. The action plan is visible below for manual copy.</p>
          <textarea
            readOnly
            value={markdown}
            rows={10}
            className="mt-3 w-full rounded-lg border border-amber-200 bg-white p-3 font-mono text-xs leading-5 text-gray-800"
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-center">
          <p className="text-sm font-semibold text-gray-900">No deals available to generate action plan.</p>
          <p className="mt-1 text-sm text-gray-500">Add or import deals, then generate this week's actions again.</p>
        </div>
      ) : (
        <div className="grid gap-5">
          {(['Critical', 'High', 'Medium', 'Low'] as ActionPriority[]).map((priority) => (
            <ActionPriorityGroup
              key={priority}
              priority={priority}
              items={grouped[priority]}
              doneActionIds={doneActionIds}
              onToggleDone={onToggleDone}
              onGoToDeal={onGoToDeal}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionPriorityGroup({
  priority,
  items,
  doneActionIds,
  onToggleDone,
  onGoToDeal,
}: {
  priority: ActionPriority;
  items: PipelineDefenseActionItem[];
  doneActionIds: Set<string>;
  onToggleDone: (actionId: string) => void;
  onGoToDeal: (dealId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge className={actionPriorityClasses[priority]}>{priority}</Badge>
          <p className="text-sm font-bold text-gray-900">{items.length} actions</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No {priority.toLowerCase()} action items.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const done = doneActionIds.has(item.id);
            return (
              <article key={item.id} className={`rounded-lg border border-gray-200 bg-white p-4 ${done ? 'opacity-70' : ''}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={actionPriorityClasses[item.priority]}>{item.priority}</Badge>
                      <Badge className={actionTypeClasses[item.actionType]}>{item.actionType}</Badge>
                    </div>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-400">{item.account} / {item.opportunity}</p>
                    <h3 className={`mt-1 text-base font-bold text-navy ${done ? 'line-through' : ''}`}>{item.title}</h3>
                  </div>
                  <label className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => onToggleDone(item.id)}
                    />
                    Done
                  </label>
                </div>
                <p className="mt-3 text-sm text-gray-700">{item.detail}</p>
                <p className="mt-2 text-sm text-gray-500">Reason: {item.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-gray-50 px-2.5 py-1 text-gray-600">Owner: {item.suggestedOwner}</span>
                  <span className="rounded-full bg-gray-50 px-2.5 py-1 text-gray-600">Due: {item.suggestedDueTiming}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onGoToDeal(item.dealId)}
                  className="mt-3 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  Go to deal
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DealDefenseCard({
  deal,
  editing,
  onEdit,
  onCancel,
  onRemove,
  onUpdate,
  onUpdateObjection,
  suggestion,
  onAnalyze,
  onApplySuggestion,
  draftAssistOpen,
  draftAssistType,
  draftAssistResult,
  draftAssistCopyStatus,
  draftAssistProviderLabel,
  draftAssistGenerating,
  draftAssistError,
  onOpenDraftAssist,
  onCloseDraftAssist,
  onDraftAssistTypeChange,
  onGenerateDraft,
  onCopyDraft,
  onApplyDraft,
}: {
  deal: PipelineDefenseDeal;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<PipelineDefenseDeal>) => void;
  onUpdateObjection: (patch: Partial<PipelineDefenseDeal['objectionDebt']>) => void;
  suggestion?: DealRiskSuggestion;
  onAnalyze: () => void;
  onApplySuggestion: () => void;
  draftAssistOpen: boolean;
  draftAssistType: DraftAssistType;
  draftAssistResult: DraftAssistResult | null;
  draftAssistCopyStatus: 'idle' | 'copied' | 'failed';
  draftAssistProviderLabel: string;
  draftAssistGenerating: boolean;
  draftAssistError: string;
  onOpenDraftAssist: () => void;
  onCloseDraftAssist: () => void;
  onDraftAssistTypeChange: (value: DraftAssistType) => void;
  onGenerateDraft: () => void;
  onCopyDraft: () => void;
  onApplyDraft: () => void;
}) {
  if (editing) {
    return (
      <article id={`pipeline-deal-${deal.id}`} className="scroll-mt-24 rounded-xl border border-brand-blue/30 bg-white p-5 shadow-sm ring-2 ring-brand-blue/10">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Editing deal</p>
            <h3 className="mt-1 text-lg font-bold text-navy">{deal.account}</h3>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onAnalyze} className="rounded-full border border-brand-blue bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-100">
              Analyze Deal
            </button>
            <button type="button" onClick={onCancel} className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
              Done
            </button>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Account" value={deal.account} onChange={(value) => onUpdate({ account: value })} />
            <Field label="Opportunity" value={deal.opportunity} onChange={(value) => onUpdate({ opportunity: value })} />
          </div>

          <TextAreaField label="Pipeline context" value={deal.pipelineContext} onChange={(value) => onUpdate({ pipelineContext: value })} />
          <TextAreaField label="Deal truth" value={deal.dealTruth} onChange={(value) => onUpdate({ dealTruth: value })} />
          <ListField label="Risk type" value={deal.riskType} onChange={(value) => onUpdate({ riskType: splitLines(value) })} />
          <ListField label="Evidence" value={deal.evidence} onChange={(value) => onUpdate({ evidence: splitLines(value) })} />
          <ListField label="Missing context" value={deal.missingContext} onChange={(value) => onUpdate({ missingContext: splitLines(value) })} />

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="mb-3 text-sm font-bold text-amber-900">Objection debt</p>
            <div className="grid gap-3">
              <Field label="Objection" value={deal.objectionDebt.objection} onChange={(value) => onUpdateObjection({ objection: value })} />
              <TextAreaField label="Evidence" value={deal.objectionDebt.evidence} onChange={(value) => onUpdateObjection({ evidence: value })} />
              <TextAreaField label="Required proof / action" value={deal.objectionDebt.requiredAction} onChange={(value) => onUpdateObjection({ requiredAction: value })} />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Owner" value={deal.objectionDebt.owner} onChange={(value) => onUpdateObjection({ owner: value })} />
                <SelectField
                  label="Status"
                  value={deal.objectionDebt.status}
                  options={objectionDebtStatuses}
                  onChange={(value) => onUpdateObjection({ status: value as PipelineDefenseDeal['objectionDebt']['status'] })}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="Forecast evidence category"
              value={deal.forecastEvidenceCategory}
              options={forecastEvidenceCategories}
              onChange={(value) => onUpdate({ forecastEvidenceCategory: value as ForecastEvidenceCategory })}
            />
            <SelectField
              label="Decision recommendation"
              value={deal.decisionRecommendation}
              options={decisionRecommendations}
              onChange={(value) => onUpdate({ decisionRecommendation: value as DecisionRecommendation })}
            />
          </div>

          <TextAreaField label="Recommended action" value={deal.recommendedAction} onChange={(value) => onUpdate({ recommendedAction: value })} />
          <TextAreaField label="Pipeline review answer" value={deal.pipelineReviewAnswer} onChange={(value) => onUpdate({ pipelineReviewAnswer: value })} />
          <TextAreaField label="Assumption note" value={deal.assumption || ''} onChange={(value) => onUpdate({ assumption: value || undefined })} />

          {suggestion && <RiskSuggestionPanel suggestion={suggestion} onApply={onApplySuggestion} />}

          {draftAssistOpen && (
            <DraftAssistPanel
              draftType={draftAssistType}
              result={draftAssistResult}
              copyStatus={draftAssistCopyStatus}
              providerLabel={draftAssistProviderLabel}
              generating={draftAssistGenerating}
              error={draftAssistError}
              onTypeChange={onDraftAssistTypeChange}
              onGenerate={onGenerateDraft}
              onCopy={onCopyDraft}
              onApply={onApplyDraft}
              onClose={onCloseDraftAssist}
            />
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onOpenDraftAssist} className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
              Draft Assist
            </button>
            <button type="button" onClick={onAnalyze} className="rounded-full border border-brand-blue bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-100">
              Analyze Deal
            </button>
            <button type="button" onClick={onRemove} className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100">
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article id={`pipeline-deal-${deal.id}`} className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{deal.account}</p>
          <h3 className="mt-1 text-lg font-bold text-navy">{deal.opportunity}</h3>
          <p className="mt-2 text-sm text-gray-500">{deal.pipelineContext}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Badge className={categoryClasses[deal.forecastEvidenceCategory]}>{deal.forecastEvidenceCategory}</Badge>
          <Badge className={decisionClasses[deal.decisionRecommendation]}>{deal.decisionRecommendation}</Badge>
        </div>
      </div>

      <div className="grid gap-4">
        <InfoBlock icon={<ShieldCheck className="h-4 w-4" />} title="Deal truth" items={[deal.dealTruth]} />
        <InfoBlock icon={<AlertTriangle className="h-4 w-4" />} title="Risk type" items={deal.riskType} />
        <InfoBlock icon={<ClipboardCheck className="h-4 w-4" />} title="Evidence" items={deal.evidence} />
        <InfoBlock icon={<HelpCircle className="h-4 w-4" />} title="Missing context" items={deal.missingContext} />

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">Objection debt</p>
          <p className="mt-1 text-sm text-amber-800">{deal.objectionDebt.objection || 'No objection entered yet.'}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Required proof / action</p>
          <p className="mt-1 text-sm text-amber-800">{deal.objectionDebt.requiredAction || 'No required proof entered yet.'}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-white px-2.5 py-1 text-amber-700">Owner: {deal.objectionDebt.owner || 'Unassigned'}</span>
            <span className="rounded-full bg-white px-2.5 py-1 text-amber-700">Status: {deal.objectionDebt.status}</span>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">Recommended action</p>
          <p className="mt-1 text-sm text-blue-800">{deal.recommendedAction}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-bold text-gray-900">Pipeline review answer</p>
          <p className="mt-1 text-sm leading-6 text-gray-700">{deal.pipelineReviewAnswer}</p>
          {deal.assumption && <p className="mt-3 text-xs font-medium text-gray-500">Assumption: {deal.assumption}</p>}
        </div>

        {suggestion && <RiskSuggestionPanel suggestion={suggestion} onApply={onApplySuggestion} />}

        {draftAssistOpen && (
          <DraftAssistPanel
            draftType={draftAssistType}
            result={draftAssistResult}
            copyStatus={draftAssistCopyStatus}
            providerLabel={draftAssistProviderLabel}
            generating={draftAssistGenerating}
            error={draftAssistError}
            onTypeChange={onDraftAssistTypeChange}
            onGenerate={onGenerateDraft}
            onCopy={onCopyDraft}
            onApply={onApplyDraft}
            onClose={onCloseDraftAssist}
          />
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onRemove} className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
          <button type="button" onClick={onAnalyze} className="rounded-full border border-brand-blue bg-blue-50 px-4 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-100">
            Analyze Deal
          </button>
          <button type="button" onClick={onOpenDraftAssist} className="rounded-full border border-gray-300 bg-white px-4 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
            Draft Assist
          </button>
          <button type="button" onClick={onEdit} className="rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white hover:bg-navy/90">
            Edit
          </button>
        </div>
      </div>
    </article>
  );
}

function RiskSuggestionPanel({ suggestion, onApply }: { suggestion: DealRiskSuggestion; onApply: () => void }) {
  return (
    <div className="rounded-lg border border-brand-blue/20 bg-blue-50/60 p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Rules suggestion</p>
          <h4 className="mt-1 text-base font-bold text-navy">Transparent deal risk analysis</h4>
        </div>
        <button type="button" onClick={onApply} className="rounded-full bg-navy px-4 py-2 text-xs font-bold text-white hover:bg-navy/90">
          Apply Suggestions
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Suggested forecast category</p>
          <div className="mt-2">
            <Badge className={categoryClasses[suggestion.forecastEvidenceCategory]}>{suggestion.forecastEvidenceCategory}</Badge>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Suggested decision</p>
          <div className="mt-2">
            <Badge className={decisionClasses[suggestion.decisionRecommendation]}>{suggestion.decisionRecommendation}</Badge>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Risk flags</p>
        {suggestion.riskFlags.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No rule flags detected.</p>
        ) : (
          <div className="mt-2 grid gap-2">
            {suggestion.riskFlags.map((flag) => (
              <div key={flag.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={severityClasses[flag.severity]}>{flag.severity}</Badge>
                  <p className="text-sm font-bold text-gray-900">{flag.label}</p>
                </div>
                <p className="mt-1 text-sm text-gray-600">{flag.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Suggested next action</p>
        <p className="mt-2 text-sm text-gray-700">{suggestion.suggestedAction}</p>
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Explanation</p>
        <ul className="mt-2 space-y-1.5">
          {suggestion.explanation.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-gray-600">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue/40" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DraftAssistPanel({
  draftType,
  result,
  copyStatus,
  providerLabel,
  generating,
  error,
  onTypeChange,
  onGenerate,
  onCopy,
  onApply,
  onClose,
}: {
  draftType: DraftAssistType;
  result: DraftAssistResult | null;
  copyStatus: 'idle' | 'copied' | 'failed';
  providerLabel: string;
  generating: boolean;
  error: string;
  onTypeChange: (value: DraftAssistType) => void;
  onGenerate: () => void;
  onCopy: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Local draft assist</p>
          <h4 className="mt-1 text-base font-bold text-navy">Mock AI draft</h4>
          <p className="mt-1 text-sm text-gray-600">Deterministic local drafting only. No AI API or network request is used.</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-indigo-700">Draft provider: {providerLabel}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
          Close
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Draft type</span>
          <select
            value={draftType}
            onChange={(event) => onTypeChange(event.target.value as DraftAssistType)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          >
            {draftAssistTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generating ? 'Generating local draft...' : 'Generate Draft'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {!result && !error && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-sm font-semibold text-gray-900">No draft generated yet.</p>
          <p className="mt-1 text-sm text-gray-500">Choose a draft type, then generate a local mock draft.</p>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{result.type}</p>
              <p className="mt-1 text-sm text-gray-600">{result.explanation}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onCopy} className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
                Copy Draft
              </button>
              {result.targetField && (
                <button type="button" onClick={onApply} className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-navy/90">
                  Apply Draft
                </button>
              )}
            </div>
          </div>
          {copyStatus === 'copied' && <p className="mb-2 text-sm font-semibold text-emerald-700">Copied</p>}
          {copyStatus === 'failed' && <p className="mb-2 text-sm font-semibold text-amber-700">Clipboard failed. The draft is visible below for manual copy.</p>}
          <textarea
            readOnly
            value={result.content}
            rows={6}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm leading-6 text-gray-800"
          />
          {!result.targetField && (
            <p className="mt-2 text-xs font-medium text-gray-500">Copy-only draft. This draft type does not map to a safe editable field.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
      <textarea
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string) => void }) {
  return (
    <TextAreaField label={`${label} (one per line)`} value={value.join('\n')} onChange={onChange} />
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

function InfoBlock({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  const visibleItems = items.filter(Boolean);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
        <span className="text-brand-blue">{icon}</span>
        {title}
      </div>
      {visibleItems.length > 0 ? (
        <ul className="space-y-1.5">
          {visibleItems.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-gray-600">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">No entry yet.</p>
      )}
    </div>
  );
}

function MissingContextRadar({ deals }: { deals: PipelineDefenseDeal[] }) {
  const counts = buildMissingContextCounts(deals);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <SectionHeader
        eyebrow="Context radar"
        title="Missing Context Radar"
        description="The gaps that make a pipeline answer weak before review."
      />
      <div className="space-y-3">
        {missingContextLabels.map((label) => {
          const match = counts.find((item) => item.label === label);
          const affectedDeals = deals.filter((deal) => deal.missingContext.some((context) => normalizeMissingContext(context) === label));
          return (
            <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-gray-900">{label}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {affectedDeals.length > 0 ? affectedDeals.map((deal) => deal.account).join(', ') : 'No explicit sample gap'}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-600">{match?.count || affectedDeals.length} deals</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ObjectionDebt({ deals }: { deals: PipelineDefenseDeal[] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <SectionHeader
        eyebrow="Commercial debt"
        title="Objection Debt"
        description="Unresolved objections are treated as commercial debt until proof, response, or a customer-confirmed next step exists."
      />
      <div className="space-y-3">
        {deals.map((deal) => (
          <div key={deal.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-gray-900">{deal.account}</p>
                <p className="mt-1 text-sm text-gray-600">{deal.objectionDebt.objection || 'No objection entered yet.'}</p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{deal.objectionDebt.status}</span>
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-400">Evidence</p>
            <p className="mt-1 text-sm text-gray-600">{deal.objectionDebt.evidence || 'No evidence entered yet.'}</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-400">Required proof/action</p>
            <p className="mt-1 text-sm text-gray-600">{deal.objectionDebt.requiredAction || 'No required proof entered yet.'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ForecastEvidence() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <SectionHeader
        eyebrow="Forecast truth"
        title="Forecast Evidence"
        description="Categories only. No numeric score, win probability, or forecast model."
      />
      <div className="space-y-3">
        {forecastEvidenceDefinitions.map((item) => (
          <div key={item.category} className="rounded-lg border border-gray-200 p-4">
            <Badge className={categoryClasses[item.category]}>{item.category}</Badge>
            <p className="mt-2 text-sm text-gray-600">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ManagerQuestions() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <SectionHeader
        eyebrow="Review prep"
        title="Manager Question List"
        description="Questions Henry should ask himself, a rep, or the customer before review."
      />
      <div className="grid gap-3">
        {managerQuestions.map((item) => (
          <div key={item.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
            <p className="text-sm font-semibold text-gray-800">{item.question}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecommendedActions({ deals }: { deals: PipelineDefenseDeal[] }) {
  const grouped = deals.reduce<Record<string, PipelineDefenseDeal[]>>((acc, deal) => {
    const type = deriveActionType(deal);
    acc[type] = acc[type] || [];
    acc[type].push(deal);
    return acc;
  }, {});

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <SectionHeader
        eyebrow="This week"
        title="Recommended Actions This Week"
        description="Only actions that change deal truth: rescue, clarify, downgrade, follow up, or collect evidence."
      />
      <div className="space-y-4">
        {Object.entries(grouped).map(([type, groupedDeals]) => (
          <div key={type}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
              <Target className="h-4 w-4 text-brand-blue" />
              {type}
            </h3>
            <div className="space-y-2">
              {groupedDeals.map((deal) => (
                <div key={deal.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="font-bold text-gray-900">{deal.account}</p>
                  <p className="mt-1 text-sm text-gray-500">{deal.opportunity}</p>
                  <p className="mt-2 text-sm text-gray-700">{deal.recommendedAction || 'Add the action Henry should take this week.'}</p>
                  <p className="mt-2 text-xs font-medium text-gray-500">Why this week: {deal.pipelineReviewAnswer || 'Pipeline answer is not written yet.'}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function deriveActionType(deal: PipelineDefenseDeal) {
  const text = `${deal.decisionRecommendation} ${deal.recommendedAction}`.toLowerCase();
  if (text.includes('rescue')) return 'Rescue';
  if (text.includes('clarify') || text.includes('confirm')) return 'Clarify';
  if (text.includes('downgrade') || text.includes('remove')) return 'Downgrade';
  if (text.includes('follow')) return 'Follow-up';
  if (text.includes('collect evidence') || text.includes('evidence')) return 'Collect evidence';
  return 'Monitor';
}

function DecisionLog({ deals }: { deals: PipelineDefenseDeal[] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <SectionHeader
        eyebrow="Review decision"
        title="Decision Log"
        description="What Henry should decide during pipeline review."
      />
      <div className="space-y-3">
        {deals.map((deal) => (
          <div key={deal.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-gray-900">{deal.account}</p>
                <p className="mt-1 text-sm text-gray-500">{deal.opportunity}</p>
              </div>
              <Badge className={decisionClasses[deal.decisionRecommendation]}>{deal.decisionRecommendation}</Badge>
            </div>
            <p className="mt-3 text-sm text-gray-600">{deal.recommendedAction || 'No next action entered yet.'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function buildSummary(deals: PipelineDefenseDeal[]) {
  const counts = buildMissingContextCounts(deals);
  const highestRiskDeal =
    deals.find((deal) => deal.forecastEvidenceCategory === 'Unsupported')
    || deals.find((deal) => deal.forecastEvidenceCategory === 'Hope-based')
    || deals.find((deal) => deal.forecastEvidenceCategory === 'Weak but recoverable')
    || deals[0]
    || null;
  const topRecommendedAction =
    deals.find((deal) => deal.decisionRecommendation === 'Rescue')
    || deals.find((deal) => deal.recommendedAction.trim().length > 0)
    || null;

  return {
    dealsReviewed: deals.length,
    atRiskDeals: deals.filter((deal) => deal.forecastEvidenceCategory !== 'Defensible').length,
    highestRiskDeal,
    commonMissingContext: counts[0] || null,
    topRecommendedAction,
  };
}

function debugCloudSync(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[PipelineDefenseCloudSync] ${message}`, context || {});
  }
}

function buildDealRiskAnalysisSummary(suggestions: DealRiskSuggestion[]): DealRiskAnalysisSummary {
  return {
    totalDeals: suggestions.length,
    highRiskDeals: suggestions.filter((suggestion) => (
      suggestion.forecastEvidenceCategory === 'Unsupported'
      || suggestion.riskFlags.some((flag) => flag.severity === 'high')
    )).length,
    objectionDebtFlags: suggestions.reduce((count, suggestion) => (
      count + suggestion.riskFlags.filter((flag) => flag.id === 'objection-debt').length
    ), 0),
    unsupportedOrHopeBased: suggestions.filter((suggestion) => (
      suggestion.forecastEvidenceCategory === 'Unsupported'
      || suggestion.forecastEvidenceCategory === 'Hope-based'
    )).length,
    rescueCount: suggestions.filter((suggestion) => suggestion.decisionRecommendation === 'Rescue').length,
    downgradeCount: suggestions.filter((suggestion) => suggestion.decisionRecommendation === 'Downgrade').length,
    monitorCount: suggestions.filter((suggestion) => suggestion.decisionRecommendation === 'Monitor').length,
  };
}

function buildMissingContextCounts(deals: PipelineDefenseDeal[]) {
  const counts = new Map<string, number>();

  for (const deal of deals) {
    for (const context of deal.missingContext.filter(Boolean)) {
      const normalized = normalizeMissingContext(context);
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function normalizeMissingContext(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes('decision maker') || lower.includes('decision owner') || lower.includes('active decision')) return 'Decision maker';
  if (lower.includes('decision timeline') || lower.includes('timing')) return 'Decision timeline';
  if (lower.includes('procurement')) return 'Procurement path';
  if (lower.includes('next communication')) return 'Next communication date';
  if (lower.includes('evaluation criteria') || lower.includes('technical')) return 'Technical evaluation criteria';
  if (lower.includes('budget')) return 'Budget owner';
  return value;
}

function splitLines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}
