import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ClipboardList,
  FileCheck2,
  FileText,
  NotebookPen,
  RefreshCw,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { DataModePill } from '../../components/common/DataModePill';
import { DemoJourneyCard } from '../../components/demo/DemoJourneyCard';
import { SkeletonScreen, SkeletonCard } from '../../components/common/Skeleton';
import { isFounderWorkspaceEnabled, isSupabaseConfigured } from '../../lib/demoMode';
import type { AccountMemoryRecord } from '../../services/accountStore';
import { opportunityToFormInput, updateOpportunity, type CrmLiteOpportunity } from '../../services/opportunityStore';
import type { OperatingContextRecord } from '../../services/operatingContextStore';
import { type SalesActivityRecord } from '../../services/salesActivityStore';
import { type ObjectionRecord } from '../../services/objectionStore';
import {
  advanceQuoteCommercialProgress,
  getNextCommercialProgressAction,
  getQuoteRisk,
  getQuoteWorkspaceHref,
  quoteRiskTone,
  summarizeQuotes,
  type QuoteRecord,
} from '../../services/quoteStore';
import { type StakeholderRecord } from '../../services/stakeholderStore';
import { type ActionOutcomeRecord } from '../../services/actionOutcomeStore';
import { type OpportunityOutcomeRecord } from '../../services/opportunityOutcomeStore';
import {
  clearAllNudges,
  clearDismissedNudges,
  dismissNudge,
  loadNudges,
  loadNudgesForUser,
  markNudgeDone,
  snoozeNudge,
  type NudgeRecord,
} from '../../services/nudgeStore';
import { type SalesAssetRecord } from '../../services/salesAssetStore';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData } from '../../services/workspaceData';
import { FollowUpComposerPanel } from '../v31/FollowUpComposerPanel';
import { buildReviveFollowUpContext } from '../../utils/followUpFromOpportunity';
import type { FollowUpContext } from '../../types/v31';
import { type PipelineDefenseBrief } from '../../utils/pipelineDefenseStorage';
import {
  buildTodayCommandCenter,
  type AccountTouchItem,
  type AtRiskOpportunityItem,
  type CommandActionItem,
  type CommandCenter,
  type CommandExecutionSummary,
  type CommandPriority,
  type DailyTimeblockItem,
  type RecentActivityItem,
} from '../../utils/salesCommandCenter';
import { buildRevenueView, type RevenueActionItem, type RevenueViewSummary } from '../../utils/revenueView';
import { formatBaseCurrencyAmount, formatCompactBaseAmount, formatCurrencyAmount, getReportingCurrency } from '../../utils/money';
import { buildPipelineHealthSummary, buildRevenueHorizon } from '../../utils/pipelineInsights';
import { SegmentBar } from '../../components/charts/SegmentBar';
import { MiniBarChart } from '../../components/charts/MiniBarChart';
import { hasLocalSampleData } from '../../utils/dataMode';
import { formatSafeBusinessDate, isBusinessDateInRange, isBusinessDateOverdue, toLocalDateKey } from '../../utils/safeDate.ts';
import { loadSampleDataset } from '../../utils/sampleData';
import { analyzeMeddicLitePipeline } from '../../utils/meddicLite';
import { generatePipelineOpportunityActions, type OpportunityRecommendedAction } from '../../utils/opportunityActionPlan';
import { analyzePipelineOutcomeLoop } from '../../utils/actionOutcomeLoop';
import { generateWeeklyExecutionReview, getCurrentExecutionWeekRange } from '../../utils/weeklyExecutionReview';
import {
  generateSalesPlaybookPatterns,
  getTopSalesPlaybookPattern,
  type SalesPlaybookPattern,
} from '../../utils/salesPlaybook';
import { summarizeAssetGaps } from '../../utils/salesAssetSuggestions';
import { buildCaptureNudges, type CaptureNudge } from '../../utils/captureNudges';
import { buildPipelineReviewDashboardSignal } from '../../utils/shareablePipelineDefenseBrief';
import {
  buildFirstPipelineReviewMetrics,
  buildFirstPipelineReviewProgress,
  getFirstPipelineReviewNextStep,
  getFirstPipelineReviewProgressPercent,
  loadFirstPipelineReviewOnboardingState,
  type FirstPipelineReviewProgressStep,
} from '../../utils/firstPipelineReviewOnboarding';
import {
  buildTrialActivationChecklist,
  loadTrialActivationChecklistState,
  markTrialActivationChecklistItemComplete,
  resetTrialActivationChecklist,
  type TrialActivationChecklistItem,
  type TrialActivationChecklistItemId,
} from '../../utils/trialActivationChecklist';
import {
  buildPipelineReviewHabitProgress,
  loadPipelineReviewHabitState,
  PIPELINE_REVIEW_HABIT_UPDATED_EVENT,
  type PipelineReviewHabitProgress,
} from '../../utils/pipelineReviewHabit';
import {
  loadReviewPacks,
  loadReviewPacksForWorkspace,
  REVIEW_PACKS_UPDATED_EVENT,
  type ReviewPackSnapshot,
} from '../../utils/reviewPacks';
import {
  buildSalesOperatingSetupProgress,
  loadSalesOperatingSetupState,
  type SalesOperatingSetupProgress,
} from '../../utils/salesOperatingSetup';
import { generateInterviewScriptText } from '../../utils/demoFeedback';
import { markDemoJourneyStepComplete } from '../../utils/demoJourney';
import {
  clearDailyExecutionDecision,
  loadDailyExecutionState,
  saveDailyExecutionDecision,
  type DailyExecutionStatus,
} from '../../utils/dailyExecution';
import { buildUnifiedTodayCommandCenter, type TodayCommandAction } from '../../utils/todayCommandCenter.ts';
import { loadAccountHygienePreferences } from '../../utils/accountHygiene.ts';
import {
  buildProactiveNudges,
  formatNudgeDueDate,
  formatNudgeMoney,
  type ProactiveNudgeCenter,
} from '../../utils/proactiveNudges.ts';

type DashboardData = {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
  briefs: PipelineDefenseBrief[];
  objections: ObjectionRecord[];
  stakeholders: StakeholderRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  assets: SalesAssetRecord[];
  quotes: QuoteRecord[];
  operatingContext: OperatingContextRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
};

type DashboardInsights = ReturnType<typeof buildDashboardInsights>;
type DashboardLoadOptions = { force?: boolean };
type DashboardCommercialAction = {
  title: string;
  accountName: string;
  label: string;
  reason: string;
  href: string;
  priority: CommandPriority;
  amountLabel: string;
  source: RevenueActionItem['source'];
};

export function TodayPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dailyExecutionScope = sampleDataActive ? 'demo' : user?.id ? `user-${user.id}` : 'guest';
  const [data, setData] = useState<DashboardData>({
    activities: [],
    opportunities: [],
    accounts: [],
    briefs: [],
    objections: [],
    stakeholders: [],
    actionOutcomes: [],
    assets: [],
    quotes: [],
    operatingContext: [],
    opportunityOutcomes: [],
  });
  const [loading, setLoading] = useState(() => !getCachedSalesWorkspaceData(sampleDataActive ? undefined : user?.id));
  const [message, setMessage] = useState('');
  const [firstReviewOnboarding, setFirstReviewOnboarding] = useState(() => loadFirstPipelineReviewOnboardingState());
  const [trialChecklistState, setTrialChecklistState] = useState(() => loadTrialActivationChecklistState());
  const [salesOperatingSetup, setSalesOperatingSetup] = useState(() => loadSalesOperatingSetupState());
  const [pipelineReviewHabitState, setPipelineReviewHabitState] = useState(() => loadPipelineReviewHabitState());
  const [reviewPacks, setReviewPacks] = useState<ReviewPackSnapshot[]>(() => loadReviewPacks());
  const [validationMessage, setValidationMessage] = useState('');
  const [demoSandboxPromptOpen, setDemoSandboxPromptOpen] = useState(false);
  const [advancedInsightsOpen, setAdvancedInsightsOpen] = useState(false);
  const [setupToolsOpen, setSetupToolsOpen] = useState(false);
  const [workspaceSyncing, setWorkspaceSyncing] = useState(false);
  const [commercialProgressMessage, setCommercialProgressMessage] = useState('');
  const [dailyExecutionState, setDailyExecutionState] = useState(() => loadDailyExecutionState(dailyExecutionScope));
  const [dailyExecutionMessage, setDailyExecutionMessage] = useState('');
  const [lastDailyExecutionActionId, setLastDailyExecutionActionId] = useState('');
  const [nudgeState, setNudgeState] = useState<NudgeRecord[]>(() => loadNudges());
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [followUpContext, setFollowUpContext] = useState<FollowUpContext | null>(null);
  const [followUpOpportunity, setFollowUpOpportunity] = useState<CrmLiteOpportunity | null>(null);

  const refreshDashboard = useCallback(async (options: DashboardLoadOptions = {}) => {
    const sampleActive = hasLocalSampleData();
    const dataUserId = sampleActive ? undefined : user?.id;

    // Cache-first: render an already-loaded workspace instantly instead of
    // flashing the skeleton every time the seller returns to Today. Review
    // packs still refresh in the background.
    if (!options.force) {
      const cachedData = getCachedSalesWorkspaceData(dataUserId);
      if (cachedData) {
        setData(cachedData);
        setFirstReviewOnboarding(loadFirstPipelineReviewOnboardingState());
        setTrialChecklistState(loadTrialActivationChecklistState());
        setSalesOperatingSetup(loadSalesOperatingSetupState());
        setPipelineReviewHabitState(loadPipelineReviewHabitState());
        setLoading(false);
        setMessage('Command center ready');
        void loadReviewPacksForWorkspace(dataUserId, sampleActive).then(setReviewPacks).catch(() => undefined);
        return;
      }
    }

    if (options.force) setWorkspaceSyncing(true);
    if (!options.force) setLoading(true);
    setMessage(options.force ? 'Refreshing cloud workspace...' : '');

    try {
      const nextData = await loadDashboardData(dataUserId, options);
      const nextReviewPacks = await loadReviewPacksForWorkspace(dataUserId, sampleActive);

      setData(nextData);
      setMessage('Command center ready');
      setFirstReviewOnboarding(loadFirstPipelineReviewOnboardingState());
      setTrialChecklistState(loadTrialActivationChecklistState());
      setSalesOperatingSetup(loadSalesOperatingSetupState());
      setPipelineReviewHabitState(loadPipelineReviewHabitState());
      setReviewPacks(nextReviewPacks);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[Dashboard] load failed', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
      setMessage('Cloud sync issue - your local copy is preserved.');
    } finally {
      setLoading(false);
      setWorkspaceSyncing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!authLoading) {
      refreshDashboard();
    }
  }, [authLoading, isAuthenticated, refreshDashboard]);

  useEffect(() => {
    if (sampleDataActive) {
      markDemoJourneyStepComplete('review-today', 'Today daily command center reviewed');
    }
  }, [sampleDataActive]);
  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user || sampleDataActive) {
      setNudgeState(loadNudges());
      return;
    }
    loadNudgesForUser(user.id)
      .then((records) => {
        if (!cancelled) setNudgeState(records);
      })
      .catch(() => {
        if (!cancelled) setNudgeState(loadNudges(user.id));
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, sampleDataActive, user]);
  useEffect(() => {
    setDailyExecutionState(loadDailyExecutionState(dailyExecutionScope));
    setDailyExecutionMessage('');
    setLastDailyExecutionActionId('');
  }, [dailyExecutionScope]);
  const revenueView = useMemo(() => buildRevenueView({
    opportunities: data.opportunities,
    quotes: data.quotes,
  }), [data.opportunities, data.quotes]);
  const accountHygienePreferences = useMemo(() => loadAccountHygienePreferences(user?.id), [user?.id]);
  const commandCenter = useMemo(() => buildTodayCommandCenter({
    ...data,
    commercialActions: revenueView.actionItems,
    executionDecisions: dailyExecutionState.decisions,
  }), [dailyExecutionState.decisions, data, revenueView.actionItems]);
  const pipelineReviewSignal = useMemo(() => buildPipelineReviewDashboardSignal(data.briefs), [data.briefs]);
  const todayCenter = useMemo(() => buildUnifiedTodayCommandCenter({
    briefs: data.briefs,
    revenueActions: revenueView.actionItems,
    opportunities: data.opportunities,
    activities: data.activities,
    stakeholders: data.stakeholders,
    objections: data.objections,
    accounts: data.accounts,
    quotes: data.quotes,
    accountPreferences: accountHygienePreferences,
    opportunityOutcomes: data.opportunityOutcomes,
  }), [accountHygienePreferences, data.accounts, data.activities, data.briefs, data.objections, data.opportunities, data.opportunityOutcomes, data.quotes, data.stakeholders, revenueView.actionItems]);
  const proactiveNudges = useMemo(() => buildProactiveNudges({
    briefs: data.briefs,
    revenueActions: revenueView.actionItems,
    opportunities: data.opportunities,
    activities: data.activities,
    objections: data.objections,
    accounts: data.accounts,
    stakeholders: data.stakeholders,
    quotes: data.quotes,
    accountPreferences: accountHygienePreferences,
    opportunityOutcomes: data.opportunityOutcomes,
    persistedNudges: nudgeState,
  }), [accountHygienePreferences, data.accounts, data.activities, data.briefs, data.objections, data.opportunities, data.opportunityOutcomes, data.quotes, data.stakeholders, nudgeState, revenueView.actionItems]);
  const decidedActionIds = useMemo(() => (
    new Set(dailyExecutionState.decisions.map((decision) => decision.actionId))
  ), [dailyExecutionState.decisions]);
  const commercialAction = useMemo(() => (
    buildDashboardCommercialAction(revenueView, decidedActionIds)
  ), [decidedActionIds, revenueView]);
  const activeRevenueAction = useMemo(() => (
    revenueView.actionItems.find((action) => (
      action.source === 'Quote' && !decidedActionIds.has(`commercial-${action.id}`)
    )) || null
  ), [decidedActionIds, revenueView.actionItems]);
  const dashboardInsights = useMemo(() => (
    advancedInsightsOpen ? buildDashboardInsights(data) : null
  ), [advancedInsightsOpen, data]);
  const firstReviewMetrics = useMemo(() => buildFirstPipelineReviewMetrics({
    opportunities: data.opportunities,
    objections: data.objections,
    assets: data.assets,
    briefs: data.briefs,
  }), [data]);
  const firstReviewProgress = useMemo(() => buildFirstPipelineReviewProgress({
    state: firstReviewOnboarding,
    metrics: firstReviewMetrics,
    includeDataSignals: !sampleDataActive,
  }), [firstReviewMetrics, firstReviewOnboarding, sampleDataActive]);
  const trialChecklist = useMemo(() => buildTrialActivationChecklist({
    activities: data.activities,
    opportunities: data.opportunities,
    assets: data.assets,
    briefs: data.briefs,
    sampleDataActive,
    state: trialChecklistState,
  }), [data, sampleDataActive, trialChecklistState]);
  const salesOperatingSetupProgress = useMemo(
    () => buildSalesOperatingSetupProgress(salesOperatingSetup),
    [salesOperatingSetup],
  );
  const pipelineReviewHabitProgress = useMemo(
    () => buildPipelineReviewHabitProgress(pipelineReviewHabitState),
    [pipelineReviewHabitState],
  );
  const latestWeeklyReviewPack = useMemo(() => (
    reviewPacks.find((pack) => pack.weekId === pipelineReviewHabitProgress.state.currentWeekId) || null
  ), [pipelineReviewHabitProgress.state.currentWeekId, reviewPacks]);

  useEffect(() => {
    const handleHabitUpdate = () => setPipelineReviewHabitState(loadPipelineReviewHabitState());
    window.addEventListener(PIPELINE_REVIEW_HABIT_UPDATED_EVENT, handleHabitUpdate);
    return () => window.removeEventListener(PIPELINE_REVIEW_HABIT_UPDATED_EVENT, handleHabitUpdate);
  }, []);

  useEffect(() => {
    const handleReviewPackUpdate = () => setReviewPacks(loadReviewPacks());
    window.addEventListener(REVIEW_PACKS_UPDATED_EVENT, handleReviewPackUpdate);
    return () => window.removeEventListener(REVIEW_PACKS_UPDATED_EVENT, handleReviewPackUpdate);
  }, []);

  const handleLoadDemoSandbox = async () => {
    loadSampleDataset();
    setTrialChecklistState(markTrialActivationChecklistItemComplete('load-demo-or-import-csv'));
    const nextData = await loadDashboardData();
    setData(nextData);
    setMessage(isAuthenticated
      ? 'Demo is local only and was not saved to your cloud account.'
      : 'Demo is local only.');
    setDemoSandboxPromptOpen(false);
  };

  const handleResetTrialChecklist = () => {
    setTrialChecklistState(resetTrialActivationChecklist());
  };

  const handleMarkTrialChecklistItem = (id: TrialActivationChecklistItemId) => {
    setTrialChecklistState(markTrialActivationChecklistItemComplete(id));
  };

  const handleDailyExecutionDecision = (action: CommandActionItem, status: DailyExecutionStatus) => {
    setDailyExecutionState((current) => (
      saveDailyExecutionDecision(dailyExecutionScope, current, action.id, status)
    ));
    setLastDailyExecutionActionId(action.id);
    setDailyExecutionMessage(status === 'Done'
      ? `${action.title} completed for today. Next action is ready.`
      : `${action.title} moved to the 16:30 closeout.`);
  };

  const persistNudgeState = (record: NudgeRecord, messageText: string) => {
    setNudgeState((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    setNudgeMessage(messageText);
  };

  const nudgeUserId = sampleDataActive ? undefined : user?.id;
  const handleMarkNudgeDone = (nudge: NudgeRecord) => {
    persistNudgeState(markNudgeDone(nudge, nudgeUserId), 'Nudge marked done.');
  };
  const handleDraftFollowUp = (nudge: NudgeRecord) => {
    const opportunity = data.opportunities.find((item) => item.id === nudge.entityId)
      || data.opportunities.find((item) => item.opportunityName === nudge.opportunityName && item.accountName === nudge.accountName);
    setFollowUpOpportunity(opportunity || null);
    if (opportunity) {
      setFollowUpContext(buildReviveFollowUpContext(opportunity, data.activities));
      return;
    }
    setFollowUpContext({
      accountName: nudge.accountName || 'Needs confirmation',
      opportunityName: nudge.opportunityName || '',
      nextAction: nudge.recommendedAction,
      goal: 'revive_stale_deal',
      tone: 'consultative',
      length: 'medium',
    });
  };
  const handleDismissNudge = (nudge: NudgeRecord) => {
    persistNudgeState(dismissNudge(nudge, nudgeUserId), 'Nudge dismissed.');
  };
  const handleSnoozeNudgeTomorrow = (nudge: NudgeRecord) => {
    persistNudgeState(snoozeNudge(nudge, addDaysKey(1), nudgeUserId), 'Nudge snoozed until tomorrow.');
  };
  const handleSnoozeNudgeNextWeek = (nudge: NudgeRecord) => {
    persistNudgeState(snoozeNudge(nudge, addDaysKey(7), nudgeUserId), 'Nudge snoozed until next week.');
  };
  const handleClearDismissedNudges = () => {
    setNudgeState(clearDismissedNudges(nudgeUserId));
    setNudgeMessage('Dismissed local nudges cleared.');
  };
  const handleClearAllNudgeState = () => {
    setNudgeState(clearAllNudges(nudgeUserId));
    setNudgeMessage('All local nudge state cleared. Active risks can reappear if still relevant.');
  };

  const handleRestoreDailyExecution = (actionId: string) => {
    setDailyExecutionState((current) => (
      clearDailyExecutionDecision(dailyExecutionScope, current, actionId)
    ));
    setDailyExecutionMessage('Action restored to today.');
    setLastDailyExecutionActionId('');
  };

  const handleUndoDailyExecution = () => {
    if (!lastDailyExecutionActionId) return;
    handleRestoreDailyExecution(lastDailyExecutionActionId);
  };

  const handleAdvanceQuote = (quote: QuoteRecord) => {
    const action = getNextCommercialProgressAction(quote);
    const updated = advanceQuoteCommercialProgress(quote);
    if (!action || !updated) return;
    setData((current) => ({
      ...current,
      quotes: current.quotes.map((item) => (item.id === updated.id ? updated : item)),
    }));
    setCommercialProgressMessage(`${quote.accountName}: ${action.successMessage}.`);
  };

  const handleCopyInterviewScript = async () => {
    try {
      await navigator.clipboard.writeText(generateInterviewScriptText());
      setValidationMessage('Interview script copied.');
    } catch {
      setValidationMessage('Clipboard failed. Open Feedback Log to copy the interview script manually.');
    }
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Personal Pipeline Defense OS</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Will your forecast survive review?</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Memoire works beside your CRM to prepare review-ready answers, rescue exposed deals, and de-risk the forecast before anyone has to ask.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => refreshDashboard({ force: true })}
            disabled={workspaceSyncing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            title="Reload dashboard from cloud"
          >
            <RefreshCw className={`h-4 w-4 ${workspaceSyncing ? 'animate-spin' : ''}`} />
            Cloud sync
          </button>
          <DataModePill
            compact
            isLoading={authLoading || loading}
            isAuthenticated={isAuthenticated}
            isSupabaseConfigured={isSupabaseConfigured}
            cloudAvailable={isSupabaseConfigured}
            syncError={message.startsWith('Cloud sync issue') ? message : null}
            hasSampleData={sampleDataActive}
          />
          {message && !message.startsWith('Command center ready') ? (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              {message}
            </span>
          ) : null}
        </div>
      </header>

      {loading ? (
        <SkeletonScreen label="Loading your Today command center">
          <div className="space-y-4">
            <SkeletonCard lines={2} />
            <div className="grid gap-4 xl:grid-cols-2">
              <SkeletonCard lines={3} />
              <SkeletonCard lines={3} />
            </div>
            <SkeletonCard lines={4} />
          </div>
        </SkeletonScreen>
      ) : (
        <>
          <ForecastDefenseReadiness center={todayCenter} />
          {demoSandboxPromptOpen && (
            <DemoSandboxPrompt
              hasExistingData={commandCenter.hasAnyData}
              isAuthenticated={isAuthenticated}
              onCancel={() => setDemoSandboxPromptOpen(false)}
              onLoad={handleLoadDemoSandbox}
            />
          )}
          {followUpContext && (
            <FollowUpComposerPanel
              initialContext={followUpContext}
              onClose={() => { setFollowUpContext(null); setFollowUpOpportunity(null); }}
              onActivityLogged={() => { void refreshDashboard(); }}
              onScheduleNextAction={followUpOpportunity ? async (nextAction, nextActionDate) => {
                await updateOpportunity(followUpOpportunity, {
                  ...opportunityToFormInput(followUpOpportunity),
                  nextAction,
                  nextActionDate,
                }, nudgeUserId);
                void refreshDashboard();
              } : undefined}
            />
          )}
          {!todayCenter.hasMeaningfulData ? (
            <TodayCommandEmptyState />
          ) : (
            <>
              <TodayTopThreeActions actions={todayCenter.topActions} />
              <PipelineGlanceSection opportunities={data.opportunities} activities={data.activities} />
              <ProactiveNudgesPanel
                center={proactiveNudges}
                message={nudgeMessage}
                onDraftFollowUp={handleDraftFollowUp}
                onMarkDone={handleMarkNudgeDone}
                onDismiss={handleDismissNudge}
                onSnoozeTomorrow={handleSnoozeNudgeTomorrow}
                onSnoozeNextWeek={handleSnoozeNudgeNextWeek}
                onClearDismissed={handleClearDismissedNudges}
                onClearAll={handleClearAllNudgeState}
              />
              <TodayPipelineReadiness center={todayCenter} />
              <TodayCommercialRisk items={todayCenter.commercialRiskItems} />
              <TodayCaptureInbox items={todayCenter.captureInbox} />
              {sampleDataActive && <DemoJourneyCard compact />}
              <details
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                onToggle={(event) => setAdvancedInsightsOpen(event.currentTarget.open)}
              >
                <summary className="cursor-pointer text-sm font-bold text-navy">
                  Supporting execution detail
                </summary>
                {dashboardInsights && (
                  <div className="mt-4 flex flex-col gap-4">
                    <StartHerePanel
                      commandCenter={commandCenter}
                      signal={pipelineReviewSignal}
                      commercialAction={commercialAction}
                      sampleDataActive={sampleDataActive}
                      onOpenDemoSandbox={() => setDemoSandboxPromptOpen(true)}
                    />
                    <DailyOperatingPlan
                      blocks={commandCenter.dailyTimeblocks}
                      message={dailyExecutionMessage}
                      canUndo={Boolean(lastDailyExecutionActionId)}
                      execution={commandCenter.dailyExecution}
                      onDecision={handleDailyExecutionDecision}
                      onRestore={handleRestoreDailyExecution}
                      onUndo={handleUndoDailyExecution}
                    />
                    <TodayFocus commandCenter={commandCenter} />
                    <DashboardPrimaryWork commandCenter={commandCenter} signal={pipelineReviewSignal} />
                    <QuoteFollowUpCard
                      quotes={data.quotes}
                      revenueView={revenueView}
                      activeTopAction={activeRevenueAction}
                      progressMessage={commercialProgressMessage}
                      onAdvanceQuote={handleAdvanceQuote}
                    />
                    <ThisWeekSummary commandCenter={commandCenter} />
                    <CaptureNudgePanel nudges={dashboardInsights.captureNudges} />
                    <WeeklyExecutionHealth
                      review={dashboardInsights.weeklyExecutionReview}
                      activeOpportunityCount={dashboardInsights.activeOpportunityCount}
                    />
                    <TopSalesPattern pattern={dashboardInsights.topSalesPattern} />
                    <AssetGaps
                      gapSummary={dashboardInsights.assetGapSummary}
                      assetCount={data.assets.length}
                      objectionCount={data.objections.length}
                      patternCount={dashboardInsights.playbookPatterns.length}
                    />
                    <PriorityActionList items={commandCenter.priorityActions} />
                    <CriticalDealActions
                      actions={dashboardInsights.criticalDealActions}
                      outcomeLoop={dashboardInsights.outcomeLoop}
                    />
                    <OpenObjectionSignals objections={data.objections} />
                    <MeddicRiskSignal summary={dashboardInsights.meddicSummary} />
                    <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                      <AtRiskOpportunities items={commandCenter.atRiskOpportunities} />
                      <AccountsNeedingTouch items={commandCenter.accountsNeedingTouch} />
                    </section>
                    <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
                      <RecentActivityFeed items={commandCenter.recentActivities} />
                      <QuickActions />
                    </section>
                  </div>
                )}
              </details>
            </>
          )}
          <details
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            onToggle={(event) => setSetupToolsOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-bold text-navy">
              Review setup
            </summary>
            {setupToolsOpen && (
              <div className="mt-4 flex flex-col gap-4">
                <SalesOperatingSetupCta progress={salesOperatingSetupProgress} />
                <PipelineReviewHabitCard progress={pipelineReviewHabitProgress} latestReviewPack={latestWeeklyReviewPack} />
                <TrialActivationChecklistCard
                  items={trialChecklist}
                  onMarkDone={handleMarkTrialChecklistItem}
                  onReset={handleResetTrialChecklist}
                />
                {!firstReviewOnboarding.completedAt && (
                  <FirstPipelineReviewCta
                    progress={firstReviewProgress}
                    metrics={firstReviewMetrics}
                    hasSampleData={sampleDataActive}
                  />
                )}
                {sampleDataActive && (
                  <>
                    <DemoCommercializationCta onOpenDemoSandbox={() => setDemoSandboxPromptOpen(true)} />
                    {isFounderWorkspaceEnabled && (
                      <ValidationCta message={validationMessage} onCopyInterviewScript={handleCopyInterviewScript} />
                    )}
                  </>
                )}
              </div>
            )}
          </details>
        </>
      )}
    </div>
  );
}

export const DashboardPage = TodayPage;

function buildDashboardInsights(data: DashboardData) {
  const period = getCurrentExecutionWeekRange();
  const periodActivities = data.activities.filter((activity) => isBusinessDateInRange(activity.activityDate, period.start, period.end));
  const weeklyExecutionReview = generateWeeklyExecutionReview({
    periodType: 'week',
    periodLabel: period.label,
    period,
    opportunities: data.opportunities,
    actionOutcomes: data.actionOutcomes,
    stakeholders: data.stakeholders,
    objections: data.objections,
    activities: periodActivities,
  });
  const playbookPatterns = generateSalesPlaybookPatterns({
    opportunities: data.opportunities,
    stakeholders: data.stakeholders,
    objections: data.objections,
    activities: data.activities,
    actionOutcomes: data.actionOutcomes,
    opportunityOutcomes: data.opportunityOutcomes,
    limit: 10,
  });
  const outcomeLoop = analyzePipelineOutcomeLoop({
    opportunities: data.opportunities,
    stakeholders: data.stakeholders,
    objections: data.objections,
    activities: data.activities,
    outcomes: data.actionOutcomes,
  });
  const criticalDealActions = generatePipelineOpportunityActions({
    opportunities: data.opportunities,
    stakeholders: data.stakeholders,
    objections: data.objections,
    activities: data.activities,
    limit: 8,
  })
    .filter((action) => action.priority === 'High')
    .filter((action) => !outcomeLoop.latestCompletedActions.some((outcome) => (
      outcome.opportunityId === action.opportunityId && outcome.actionTitle === action.title
    )))
    .slice(0, 5);

  return {
    activeOpportunityCount: data.opportunities.filter((opportunity) => opportunity.status === 'Active').length,
    weeklyExecutionReview,
    playbookPatterns,
    topSalesPattern: getTopSalesPlaybookPattern(playbookPatterns),
    assetGapSummary: summarizeAssetGaps({
      patterns: playbookPatterns,
      objections: data.objections,
      assets: data.assets,
      opportunities: data.opportunities,
    }),
    outcomeLoop,
    criticalDealActions,
    captureNudges: buildCaptureNudges({
      opportunities: data.opportunities,
      activities: data.activities,
      objections: data.objections,
      stakeholders: data.stakeholders,
      actionOutcomes: data.actionOutcomes,
      limit: 5,
    }),
    meddicSummary: analyzeMeddicLitePipeline({
      opportunities: data.opportunities,
      stakeholders: data.stakeholders,
      objections: data.objections,
      activities: data.activities,
    }),
    pipelineReviewSignal: buildPipelineReviewDashboardSignal(data.briefs),
  };
}

function buildDashboardCommercialAction(
  revenueView: RevenueViewSummary,
  decidedActionIds: Set<string> = new Set(),
): DashboardCommercialAction | null {
  const topAction = revenueView.actionItems.find((action) => (
    !decidedActionIds.has(`commercial-${action.id}`)
  )) || null;
  if (topAction) {
    const amountLabel = formatCurrencyAmount(topAction.amount, topAction.currency);
    return {
      title: topAction.nextAction || `Review ${topAction.label}`,
      accountName: topAction.accountName,
      label: topAction.label,
      reason: `${topAction.risk}: ${amountLabel} needs a commercial decision.`,
      href: topAction.href,
      priority: revenueRiskPriority(topAction.risk),
      amountLabel,
      source: topAction.source,
    };
  }

  if (revenueView.pendingPo > 0 && decidedActionIds.size === 0) {
    const amountLabel = formatBaseCurrencyAmount(revenueView.pendingPo);
    return {
      title: 'Confirm pending PO owners',
      accountName: 'Commercial desk',
      label: 'Pending PO',
      reason: `${amountLabel} is accepted but still waiting for PO confirmation.`,
      href: '/app/revenue',
      priority: 'High',
      amountLabel,
      source: 'Quote',
    };
  }

  return null;
}

function revenueRiskPriority(risk: RevenueActionItem['risk']): CommandPriority {
  if (risk === 'Quote expired' || risk === 'Delivery overdue' || risk === 'Payment overdue') return 'Critical';
  if (risk === 'Quote expiring' || risk === 'Payment term missing') return 'High';
  if (risk === 'Waiting on PO' || risk === 'Waiting on delivery' || risk === 'Waiting on payment' || risk === 'Weak pipeline') return 'High';
  return 'Medium';
}

function PipelineGlanceSection({
  opportunities,
  activities,
}: {
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
}) {
  const health = useMemo(() => buildPipelineHealthSummary(opportunities, activities), [activities, opportunities]);
  const horizon = useMemo(() => buildRevenueHorizon(opportunities), [opportunities]);
  if (health.activeCount === 0) return null;

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Pipeline health</p>
        <h2 className="mt-1 text-xl font-bold text-navy">
          {health.quietValueBase > 0
            ? `${formatCompactBaseAmount(health.quietValueBase)} is going quiet`
            : 'Every active deal has a heartbeat'}
        </h2>
        <div className="mt-4">
          <SegmentBar
            ariaLabel={`Pipeline health: ${health.buckets.healthy.count} healthy, ${health.buckets.atRisk.count} at risk, ${health.buckets.silent.count} silent`}
            segments={[
              { label: 'Healthy', value: health.buckets.healthy.count, color: '#2E7D32', detail: formatCompactBaseAmount(health.buckets.healthy.valueBase) },
              { label: 'At risk', value: health.buckets.atRisk.count, color: '#F59E0B', detail: formatCompactBaseAmount(health.buckets.atRisk.valueBase) },
              { label: 'Silent', value: health.buckets.silent.count, color: '#DC2626', detail: formatCompactBaseAmount(health.buckets.silent.valueBase) },
            ]}
          />
        </div>
        {health.concentration && health.concentration.topAccountShare >= 40 && (
          <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Concentration risk: {health.concentration.topAccountName} holds {health.concentration.topAccountShare}% of your active pipeline value.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-gray-400">
            {health.activeCount} active deals / {formatCompactBaseAmount(health.activeValueBase)} total (Base: {getReportingCurrency()})
          </p>
          {health.quietValueBase > 0 && (
            <Link
              to="/app/opportunities?filter=goingSilent"
              className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-navy/90"
            >
              Rescue the quiet deals
            </Link>
          )}
        </div>
      </div>
      {horizon.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Expected revenue</p>
          <h2 className="mt-1 text-xl font-bold text-navy">When the money lands</h2>
          <div className="mt-4">
            <MiniBarChart
              ariaLabel="Expected revenue by close horizon: weighted by probability against full value"
              items={horizon.map((bucket) => ({
                label: bucket.label,
                value: bucket.weightedValueBase,
                secondaryValue: bucket.rawValueBase,
                valueText: `weighted ${formatCompactBaseAmount(bucket.weightedValueBase)}`,
                secondaryText: `full ${formatCompactBaseAmount(bucket.rawValueBase)} (${bucket.count} deals)`,
              }))}
            />
          </div>
          <p className="mt-3 text-xs font-semibold text-gray-400">
            Solid bar: value weighted by probability. Pale bar: full value. (Base: {getReportingCurrency()})
          </p>
        </div>
      )}
    </section>
  );
}

function ForecastDefenseReadiness({ center }: { center: ReturnType<typeof buildUnifiedTodayCommandCenter> }) {
  return (
    <section className="rounded-2xl border border-brand-blue/20 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Forecast-defense readiness</p>
          <h2 className="mt-2 text-2xl font-black text-navy">Know what you can defend before review starts.</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
            The score reflects whether each deal has a manager-ready position, evidence, money, date, objection context, and next action.
          </p>
        </div>
        <Link to="/app/pipeline-defense" className="inline-flex shrink-0 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white">
          Prepare pipeline review
        </Link>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Review readiness" value={`${center.readinessScore}%`} tone={center.readinessScore >= 75 ? 'green' : center.readinessScore >= 45 ? 'amber' : 'red'} />
        <Metric label="Defendable deals" value={center.defendableDeals} tone={center.defendableDeals ? 'green' : 'blue'} />
        <Metric label="Rescue deals" value={center.rescueDeals} tone={center.rescueDeals ? 'amber' : 'green'} />
        <Metric label="Downgrade candidates" value={center.downgradeCandidates} tone={center.downgradeCandidates ? 'red' : 'green'} />
        <Metric label="Overdue actions" value={center.overdueActions} tone={center.overdueActions ? 'red' : 'green'} />
        <Metric label="Evidence gaps" value={center.missingEvidenceGaps.length} tone={center.missingEvidenceGaps.length ? 'amber' : 'green'} />
      </div>
      <div className="mt-4 rounded-xl border border-amber-100 bg-white/80 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Top 3 missing evidence gaps</p>
        {center.missingEvidenceGaps.length > 0 ? (
          <ol className="mt-2 grid gap-2 text-sm font-semibold text-gray-700 md:grid-cols-3">
            {center.missingEvidenceGaps.slice(0, 3).map((gap, index) => <li key={gap.label}>{index + 1}. {gap.label} ({gap.count})</li>)}
          </ol>
        ) : (
          <p className="mt-2 text-sm font-semibold text-emerald-700">No material evidence gap detected in the active brief.</p>
        )}
      </div>
      {center.importedAccountsHidden > 0 && (
        <p className="mt-3 text-xs font-semibold text-gray-500">{center.importedAccountsHidden.toLocaleString()} imported accounts are available in search but hidden from active work.</p>
      )}
      {(center.learningNudge || center.learningLowDataMessage) && (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/80 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Personal learning from outcomes</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-indigo-950">
            {center.learningNudge || center.learningLowDataMessage}
          </p>
        </div>
      )}
    </section>
  );
}

function TodayTopThreeActions({ actions }: { actions: TodayCommandAction[] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Top 3 Today Actions</p>
          <h2 className="mt-1 text-xl font-bold text-navy">Do these before the deals go quiet.</h2>
        </div>
        <span className="text-xs font-semibold text-gray-500">Ranked across defense, revenue, opportunities, and capture</span>
      </div>
      {actions.length === 0 ? (
        <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm font-semibold text-gray-600">No urgent action found. Capture a sales update to refresh Today.</p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {actions.map((action, index) => (
            <article key={action.id} className="flex flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-navy px-2.5 py-1 text-xs font-black text-white">#{index + 1}</span>
                  <PriorityBadge priority={action.urgency} />
                  <Badge label={action.source} tone="blue" />
                </div>
                <h3 className="mt-3 text-base font-bold text-navy">{action.title}</h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">{action.accountName} / {action.opportunityName}</p>
                <p className="mt-3 text-sm leading-6 text-gray-600">{action.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge label={`Due: ${action.dueDateLabel}`} tone={action.urgency === 'Critical' ? 'red' : 'blue'} />
                  {action.moneyLabel && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-700 ring-1 ring-gray-200">{action.moneyLabel}</span>}
                </div>
              </div>
              <Link to={action.href} className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Open action <ArrowRight className="h-4 w-4" /></Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProactiveNudgesPanel({
  center,
  message,
  onDraftFollowUp,
  onMarkDone,
  onDismiss,
  onSnoozeTomorrow,
  onSnoozeNextWeek,
  onClearDismissed,
  onClearAll,
}: {
  center: ProactiveNudgeCenter;
  message: string;
  onDraftFollowUp: (nudge: NudgeRecord) => void;
  onMarkDone: (nudge: NudgeRecord) => void;
  onDismiss: (nudge: NudgeRecord) => void;
  onSnoozeTomorrow: (nudge: NudgeRecord) => void;
  onSnoozeNextWeek: (nudge: NudgeRecord) => void;
  onClearDismissed: () => void;
  onClearAll: () => void;
}) {
  return (
    <section className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Proactive Nudges</p>
          <h2 className="mt-1 text-xl font-bold text-navy">Memoire is watching the few things that can embarrass you in review.</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            Capped at five active in-app nudges. You can mark done, dismiss, or snooze without changing the underlying CRM data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onClearDismissed} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600">
            Clear dismissed local nudges
          </button>
          <button type="button" onClick={onClearAll} className="rounded-full border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            Clear all local nudge state
          </button>
        </div>
      </div>
      {message && <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">{message}</p>}
      {center.todayNudges.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-600">
          No active proactive nudge right now. Capture updates and Pipeline Defense will refresh the signal.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {center.todayNudges.map((nudge) => (
            <article key={nudge.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <NudgeUrgencyBadge urgency={nudge.urgency} />
                    <Badge label={nudge.source} tone={nudge.source === 'outcome-learning' ? 'purple' : 'blue'} />
                  </div>
                  <h3 className="mt-3 text-base font-bold text-navy">{nudge.title}</h3>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">
                    {nudge.accountName || 'Needs confirmation'}{nudge.opportunityName ? ` / ${nudge.opportunityName}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-200">
                  {formatNudgeDueDate(nudge)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600">{nudge.reason}</p>
              <p className="mt-2 text-sm font-semibold text-navy">Recommended: {nudge.recommendedAction}</p>
              {formatNudgeMoney(nudge) && (
                <p className="mt-2 text-xs font-bold text-gray-500">{formatNudgeMoney(nudge)}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {nudge.entityType === 'opportunity' && (
                  <button type="button" onClick={() => onDraftFollowUp(nudge)} className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">
                    Draft follow-up
                  </button>
                )}
                <button type="button" onClick={() => onMarkDone(nudge)} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                  Mark done
                </button>
                <button type="button" onClick={() => onDismiss(nudge)} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600">
                  Dismiss
                </button>
                <button type="button" onClick={() => onSnoozeTomorrow(nudge)} className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
                  Snooze tomorrow
                </button>
                <button type="button" onClick={() => onSnoozeNextWeek(nudge)} className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
                  Snooze next week
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {center.hiddenImportedAccountCount > 0 && (
        <p className="mt-3 text-xs font-semibold text-gray-500">
          {center.hiddenImportedAccountCount.toLocaleString()} imported accounts are still searchable but do not create urgent nudges.
        </p>
      )}
    </section>
  );
}

function NudgeUrgencyBadge({ urgency }: { urgency: NudgeRecord['urgency'] }) {
  const label = urgency.charAt(0).toUpperCase() + urgency.slice(1);
  const tone = urgency === 'critical' ? 'red' : urgency === 'high' ? 'amber' : urgency === 'medium' ? 'blue' : 'gray';
  return <Badge label={label} tone={tone} />;
}

function TodayPipelineReadiness({ center }: { center: ReturnType<typeof buildUnifiedTodayCommandCenter> }) {
  const visibleCategories = ['Defend now', 'Rescue before review', 'Downgrade / de-risk', 'Missing evidence'];
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Pipeline Review Readiness</p><h2 className="mt-1 text-xl font-bold text-navy">The forecast position, without the theatre.</h2></div>
        <Link to="/app/pipeline-defense" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Open Pipeline Defense</Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {center.pipelineReadiness.groups.filter((group) => visibleCategories.includes(group.category)).map((group) => (
          <div key={group.category} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-bold text-navy">{group.category}</p>
            <p className="mt-1 text-2xl font-black text-navy">{group.items.length}</p>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{group.items[0]?.pipelineReviewAnswer || 'No deal in this category.'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TodayCommercialRisk({ items }: { items: RevenueActionItem[] }) {
  const stuckMoney = items.reduce((total, item) => total + item.baseAmount, 0);
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Commercial Risk</p><h2 className="mt-1 text-xl font-bold text-navy">Stuck money and follow-ups.</h2><p className="mt-1 text-sm text-gray-500">Detail only—Today owns the priority order.</p></div>
        <Link to="/app/revenue" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">Commercial risk detail</Link>
      </div>
      <p className="mt-4 text-lg font-black text-navy">{formatBaseCurrencyAmount(stuckMoney)}</p>
      <div className="mt-3 divide-y divide-gray-100">
        {items.length === 0 ? <p className="py-3 text-sm text-gray-500">No commercial risk needs follow-up.</p> : items.slice(0, 4).map((item) => (
          <Link key={item.id} to={item.href} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-bold text-navy">{item.nextAction}</p><p className="mt-1 text-xs text-gray-500">{item.accountName || 'Needs confirmation'} / {item.label || 'Needs confirmation'} · {item.risk}</p></div>
            <span className="text-xs font-bold text-gray-700">{formatCurrencyAmount(item.amount, item.currency)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TodayCaptureInbox({ items }: { items: ReturnType<typeof buildUnifiedTodayCommandCenter>['captureInbox'] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Capture Inbox</p><h2 className="mt-1 text-xl font-bold text-navy">Turn recent notes into linked evidence.</h2></div>
        <Link to="/app/capture" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Capture a sales update</Link>
      </div>
      <div className="mt-3 divide-y divide-gray-100">
        {items.length === 0 ? <p className="py-3 text-sm text-gray-500">No capture needs linking or confirmation.</p> : items.slice(0, 5).map((item) => (
          <Link key={item.id} to={item.href} className="block py-3">
            <div className="flex flex-wrap items-center gap-2"><Badge label={item.reason} tone="amber" /><span className="text-xs font-semibold text-gray-400">{item.activityDateLabel}</span></div>
            <p className="mt-2 text-sm font-bold text-navy">{item.summary}</p>
            <p className="mt-1 text-xs text-gray-500">{item.accountName} / {item.opportunityName}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TodayCommandEmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-blue-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Start Today</p>
      <h2 className="mt-2 text-2xl font-black text-navy">Give Memoire one real signal.</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Today ignores empty imported account volume. Add an activity, active opportunity, or defense brief to create meaningful priorities.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/app/capture" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Capture a sales update</Link>
        <Link to="/app/opportunities" className="rounded-full border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700">Create or review an opportunity</Link>
        <Link to="/app/pipeline-defense" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">Prepare first pipeline defense brief</Link>
        <Link to="/app/opportunities?import=csv" className="rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">Import or connect data later</Link>
      </div>
    </section>
  );
}

function StartHerePanel({
  commandCenter,
  signal,
  commercialAction,
  sampleDataActive,
  onOpenDemoSandbox,
}: {
  commandCenter: CommandCenter;
  signal: DashboardInsights['pipelineReviewSignal'];
  commercialAction: DashboardCommercialAction | null;
  sampleDataActive: boolean;
  onOpenDemoSandbox: () => void;
}) {
  const activeBlock = getActiveTimeblock(commandCenter.dailyTimeblocks);
  const urgentCommercialAction = commercialAction?.priority === 'Critical' ? commercialAction : null;
  const topAction =
    urgentCommercialAction ||
    activeBlock?.actions[0] ||
    commercialAction ||
    commandCenter.overdueActions[0] ||
    commandCenter.todayActions[0] ||
    commandCenter.priorityActions[0] ||
    null;
  const topActionIsCommercial = Boolean(topAction && commercialAction && topAction === commercialAction);
  const selectedCommercialAction = topActionIsCommercial ? commercialAction : null;
  const topRisk = commandCenter.atRiskOpportunities[0] || null;
  const primaryHref = topAction?.href || activeBlock?.href || topRisk?.href || '/app/capture?mode=quick';
  const primaryLabel = topActionIsCommercial
    ? 'Review commercial risk'
    : activeBlock?.id === 'pipeline-defense'
    ? 'Open defense mode'
    : activeBlock?.id === 'capture-closeout'
      ? 'Capture update'
      : 'Open supporting detail';

  if (sampleDataActive) {
    return (
      <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Supporting demo path</p>
            <h2 className="mt-2 text-2xl font-black text-navy">Explore the demo in this order.</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/opportunities" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              1. Review pipeline
            </Link>
            <Link to="/app/capture?mode=quick" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
              2. Capture activity
            </Link>
            <Link to="/app/pipeline-defense" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
              3. Open defense brief
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!commandCenter.hasAnyData) {
    return (
      <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Supporting setup</p>
            <h2 className="mt-2 text-2xl font-black text-navy">Bring in your first deal.</h2>
            <p className="mt-1 text-sm text-gray-500">Import a CSV, add one opportunity, or explore with demo data before your first review.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/opportunities?import=csv" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              Import CSV
            </Link>
            <Link to="/app/opportunities?new=1" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
              Add opportunity
            </Link>
            <button type="button" onClick={onOpenDemoSandbox} className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
              Try demo first
            </button>
            <Link to="/app/onboarding/sales-operating-setup" className="rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
              Set sales context
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Supporting context</p>
              {activeBlock && <Badge label={`${activeBlock.startTime}-${activeBlock.endTime}`} tone={activeBlock.priority === 'Critical' ? 'red' : activeBlock.priority === 'High' ? 'amber' : 'blue'} />}
              {selectedCommercialAction && <Badge label="Commercial risk" tone={selectedCommercialAction.priority === 'Critical' ? 'red' : 'amber'} />}
            </div>
            <h2 className="mt-2 text-2xl font-black text-navy">
              {selectedCommercialAction ? selectedCommercialAction.title : activeBlock?.focus || topAction?.title || (topRisk ? `Review ${topRisk.accountName}` : 'No additional supporting signal.')}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
              {selectedCommercialAction ? selectedCommercialAction.reason : activeBlock?.reason || topAction?.reason || topRisk?.reason || 'Capture the next customer touch or prepare your next pipeline review.'}
            </p>
            {selectedCommercialAction && (
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-cyan-700">
                {selectedCommercialAction.accountName} / {selectedCommercialAction.label} / {selectedCommercialAction.amountLabel}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={primaryHref} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              {primaryLabel}
            </Link>
            <Link to="/app/opportunities" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
              Review deals
            </Link>
            <Link to="/app/pipeline-defense" className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
              Pipeline Defense
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Pipeline defense</p>
          <p className="mt-2 text-sm font-bold text-navy">
            {signal.dealsNeedingReview > 0
              ? `${signal.dealsNeedingReview} deal(s) need review`
              : 'No defense block is urgent'}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-blue-900/75">{signal.topReason}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="Review" value={signal.dealsNeedingReview} tone={signal.dealsNeedingReview ? 'amber' : 'green'} />
            <Metric label="Rescue" value={signal.rescueDowngradeCandidates} tone={signal.rescueDowngradeCandidates ? 'red' : 'green'} />
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardPrimaryWork({
  commandCenter,
  signal,
}: {
  commandCenter: CommandCenter;
  signal: DashboardInsights['pipelineReviewSignal'];
}) {
  const actionMap = new Map<string, CommandActionItem>();
  [...commandCenter.overdueActions, ...commandCenter.todayActions, ...commandCenter.priorityActions].forEach((action) => {
    if (!actionMap.has(action.id)) actionMap.set(action.id, action);
  });
  const topActions = Array.from(actionMap.values()).slice(0, 3);

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Supporting action signals</p>
            <h2 className="mt-1 text-xl font-bold text-navy">Reference only—Today owns the rank.</h2>
          </div>
          <Link to="/app/capture?mode=quick" className="inline-flex w-fit rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Capture update
          </Link>
        </div>

        {topActions.length === 0 ? (
          <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm font-semibold text-gray-600">
            No urgent action right now. Capture the next customer touch or review your active deals.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-gray-100">
            {topActions.map((action) => (
              <Link key={action.id} to={action.href} className="flex flex-col gap-2 py-3 hover:text-brand-blue sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <PriorityBadge priority={action.priority} />
                    {action.dueDate && <Badge label={`Due ${formatSafeBusinessDate(action.dueDate)}`} tone={isBusinessDateOverdue(action.dueDate) ? 'red' : 'blue'} />}
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-navy">{action.title}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {action.accountName}{action.opportunityName ? ` / ${action.opportunityName}` : ''}
                  </p>
                </div>
                <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Defense drill-down</p>
        <h2 className="mt-1 text-xl font-bold text-navy">Open the supporting brief</h2>
        <p className="mt-2 text-sm leading-6 text-blue-900/75">{signal.topReason}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Review" value={signal.dealsNeedingReview} tone={signal.dealsNeedingReview ? 'amber' : 'green'} />
          <Metric label="Rescue" value={signal.rescueDowngradeCandidates} tone={signal.rescueDowngradeCandidates ? 'red' : 'green'} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={signal.href} className="inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Open Pipeline Defense
          </Link>
          <Link to="/app/weekly-brief" className="inline-flex rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-brand-blue">
            Weekly Brief
          </Link>
        </div>
      </div>
    </section>
  );
}

function DailyOperatingPlan({
  blocks,
  message,
  canUndo,
  execution,
  onDecision,
  onRestore,
  onUndo,
}: {
  blocks: DailyTimeblockItem[];
  message: string;
  canUndo: boolean;
  execution: CommandExecutionSummary;
  onDecision: (action: CommandActionItem, status: DailyExecutionStatus) => void;
  onRestore: (actionId: string) => void;
  onUndo: () => void;
}) {
  const activeBlock = getActiveTimeblock(blocks);
  const activeBlockId = activeBlock?.id || '';
  const firstAction = activeBlock?.actions[0];
  const overridingAction = firstAction && (
    firstAction.executionStatus === 'Deferred' ||
    (firstAction.source === 'Quote' && firstAction.priority === 'Critical')
  )
    ? firstAction
    : null;
  const activeHref = overridingAction?.href || activeBlock?.href || '/app/today';
  const activeFocus = overridingAction?.title || activeBlock?.focus || '';
  const activePriority = overridingAction?.priority || activeBlock?.priority || 'Medium';

  return (
    <section className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Today's timeblocks</p>
          <h2 className="mt-1 text-xl font-bold text-navy">Work the current block first.</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-900/75">
            Memoire turns sales-flow checkpoints, account memory, and forecast risk into one calm daily rhythm.
          </p>
        </div>
        <Link to="/app/pipeline-defense" className="inline-flex w-fit rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Open defense mode
        </Link>
      </div>

      {activeBlock && (
        <div className="mt-4 grid gap-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <Link to={activeHref} className="min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            <div className="flex flex-wrap items-center gap-2">
              <Badge label={firstAction?.executionStatus === 'Deferred' ? 'Later' : 'Do now'} tone={activePriority === 'Critical' ? 'red' : activePriority === 'High' ? 'amber' : 'green'} />
              <span className="text-xs font-black uppercase tracking-wide text-emerald-700">
                {activeBlock.startTime}-{activeBlock.endTime}
              </span>
              <PriorityBadge priority={activePriority} />
            </div>
            <h3 className="mt-2 truncate text-lg font-black text-navy">{activeFocus}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-500">
              {firstAction?.reason || activeBlock.reason}
            </p>
            {firstAction?.title !== activeFocus && (
              <p className="mt-2 truncate text-xs font-bold uppercase tracking-wide text-emerald-700">
                {firstAction ? firstAction.title : 'Create one evidence-producing action.'}
              </p>
            )}
          </Link>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
              {activeBlock.title}
            </span>
            {firstAction && (
              <button
                type="button"
                onClick={() => onDecision(firstAction, 'Done')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                title="Complete this action for today"
              >
                <CheckCircle2 className="h-4 w-4" />
                Done
              </button>
            )}
            {firstAction && firstAction.executionStatus !== 'Deferred' && (
              <button
                type="button"
                onClick={() => onDecision(firstAction, 'Deferred')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                title="Move this action to the 16:30 closeout"
              >
                <Clock3 className="h-4 w-4" />
                Later
              </button>
            )}
            <Link
              to={activeHref}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              title="Open action"
              aria-label={`Open ${activeFocus}`}
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {message && (
        <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900">
          <span>{message}</span>
          {canUndo && (
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-bold text-emerald-800 hover:bg-emerald-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo
            </button>
          )}
        </div>
      )}

      {execution.items.length > 0 && (
        <details className="group mt-3 rounded-lg border border-emerald-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              <span className="shrink-0 text-xs font-bold text-navy">Today progress</span>
              <span className="truncate text-xs text-gray-500">
                {execution.doneCount} done · {execution.deferredCount} later
              </span>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-emerald-100 px-3 py-2">
            {execution.items.map((item) => (
              <div key={item.action.id} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge
                    label={item.status === 'Done' ? 'Done' : 'Later'}
                    tone={item.status === 'Done' ? 'green' : 'amber'}
                  />
                  <p className="truncate text-xs font-semibold text-gray-700" title={item.action.title}>
                    {item.action.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRestore(item.action.id)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                  title={`Restore ${item.action.title}`}
                  aria-label={`Restore ${item.action.title}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-4">
        {blocks.map((block) => {
          const supportingActions = block.actions
            .filter((action) => action.title !== block.focus)
            .slice(0, 2);

          return (
            <Link
              key={block.id}
              to={block.href}
              className={`flex min-h-[210px] flex-col rounded-lg border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md ${
                block.id === activeBlockId ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-emerald-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                      {block.startTime}-{block.endTime}
                    </p>
                    {block.id === activeBlockId && <Badge label="Now" tone="green" />}
                  </div>
                  <h3 className="mt-2 text-base font-bold text-navy">{block.title}</h3>
                </div>
                <PriorityBadge priority={block.priority} />
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-gray-800">{block.focus}</p>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500">{block.reason}</p>
              <div className="mt-auto pt-3">
                {supportingActions.length > 0 ? (
                  <div className="space-y-1.5">
                    {supportingActions.map((action) => (
                      <p key={action.id} className="truncate rounded-md bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-600" title={action.title}>
                        {action.title}
                      </p>
                    ))}
                  </div>
                ) : block.actions.length === 0 ? (
                  <p className="rounded-md bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-600">
                    No queued action. Use this block to create evidence.
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function getActiveTimeblock(blocks: DailyTimeblockItem[], date = new Date()) {
  if (blocks.length === 0) return null;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const active = blocks.find((block) => {
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    return currentMinutes >= start && currentMinutes < end;
  });

  if (active) return active;

  const upcoming = blocks.find((block) => currentMinutes < timeToMinutes(block.startTime));
  return upcoming || blocks[blocks.length - 1];
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function QuoteFollowUpCard({
  quotes,
  revenueView,
  activeTopAction,
  progressMessage,
  onAdvanceQuote,
}: {
  quotes: QuoteRecord[];
  revenueView: RevenueViewSummary;
  activeTopAction: RevenueActionItem | null;
  progressMessage: string;
  onAdvanceQuote: (quote: QuoteRecord) => void;
}) {
  const summary = summarizeQuotes(quotes);
  const revenueQuote = activeTopAction?.source === 'Quote'
    ? quotes.find((quote) => `quote-${quote.id}` === activeTopAction.id) || null
    : null;
  const focusQuote = revenueQuote;
  const progressAction = focusQuote ? getNextCommercialProgressAction(focusQuote) : null;
  const risk = focusQuote ? getQuoteRisk(focusQuote) : null;
  const atRiskLabel = formatBaseCurrencyAmount(revenueView.atRiskRevenue, true);

  if (quotes.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-brand-blue" />
              <h2 className="text-lg font-bold text-navy">Quote follow-ups</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">Create one quote to track expiry, PO risk, and payment terms.</p>
          </div>
          <Link to="/app/quotes" className="inline-flex w-fit rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Create quote
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-cyan-700" />
            <h2 className="text-lg font-bold text-navy">Commercial follow-ups</h2>
          </div>
          <p className="mt-1 text-sm text-cyan-900/75">
            {activeTopAction
              ? `${activeTopAction.accountName}: ${activeTopAction.nextAction}`
              : 'No quote follow-up is blocking today.'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
          <Metric label="At risk" value={atRiskLabel} tone={revenueView.atRiskRevenue ? 'amber' : 'green'} />
          <Metric label="Pending PO" value={summary.pendingPo} tone={summary.pendingPo ? 'blue' : 'green'} />
          <Metric label="Expiring" value={summary.expiringSoon} tone={summary.expiringSoon ? 'amber' : 'green'} />
        </div>
        <div className="flex flex-wrap gap-2">
          {focusQuote && progressAction ? (
            <>
              {progressAction.kind === 'schedule-delivery' ? (
                <Link
                  to={getQuoteWorkspaceHref(focusQuote)}
                  className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
                >
                  <CalendarDays className="h-4 w-4" />
                  {progressAction.label}
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onAdvanceQuote(focusQuote)}
                    className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {progressAction.label}
                  </button>
                  <Link
                    to={getQuoteWorkspaceHref(focusQuote)}
                    className="inline-flex w-fit shrink-0 rounded-full border border-cyan-200 bg-white px-4 py-2 text-sm font-bold text-cyan-700"
                  >
                    Open quote
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              <Link to={focusQuote ? getQuoteWorkspaceHref(focusQuote) : '/app/quotes'} className="inline-flex w-fit shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
                {focusQuote ? 'Open quote' : 'Open quotes'}
              </Link>
              <Link to="/app/revenue" className="inline-flex w-fit shrink-0 rounded-full border border-cyan-200 bg-white px-4 py-2 text-sm font-bold text-cyan-700">
                Open revenue view
              </Link>
            </>
          )}
        </div>
      </div>
      {focusQuote && risk && risk !== 'None' && (
        <div className="mt-3">
          <Badge label={risk} tone={quoteRiskTone(risk)} />
        </div>
      )}
      {progressMessage && (
        <div role="status" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {progressMessage}
        </div>
      )}
    </section>
  );
}

function TodayFocus({ commandCenter }: { commandCenter: CommandCenter }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy">Today Focus</h2>
          <p className="text-sm text-gray-500">Start with must-win work, time-sensitive actions, and deals that need defense.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FocusCard
          title="Today's actions"
          value={commandCenter.todayActions.length}
          href="/app/calendar"
          tone={commandCenter.todayActions.length ? 'blue' : 'green'}
          helper={commandCenter.todayActions[0]?.title || 'No actions due today.'}
        />
        <FocusCard
          title="Overdue actions"
          value={commandCenter.overdueActions.length}
          href="/app/calendar"
          tone={commandCenter.overdueActions.length ? 'red' : 'green'}
          helper={commandCenter.overdueActions[0]?.title || 'No overdue actions.'}
        />
        <FocusCard
          title="At-risk opportunities"
          value={commandCenter.atRiskOpportunities.length}
          href="/app/opportunities"
          tone={commandCenter.atRiskOpportunities.length ? 'amber' : 'green'}
          helper={commandCenter.atRiskOpportunities[0]?.reason || 'Pipeline risk is quiet.'}
        />
        <FocusCard
          title="Operating priorities"
          value={commandCenter.operatingActions.length}
          href="/app/operating-system"
          tone={commandCenter.operatingActions.some((action) => action.priority === 'Critical' || action.priority === 'High') ? 'amber' : 'green'}
          helper={commandCenter.operatingActions[0]?.title || 'No must-win action is waiting.'}
        />
      </div>
    </section>
  );
}

function ThisWeekSummary({ commandCenter }: { commandCenter: CommandCenter }) {
  const summary = commandCenter.thisWeekSummary;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-brand-blue" />
        <h2 className="text-lg font-bold text-navy">This Week Summary</h2>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Activities" value={summary.activitiesThisWeek} />
        <Metric label="Accounts touched" value={summary.accountsTouchedThisWeek} />
        <Metric label="Opp movement" value={summary.opportunitiesWithMovement} />
        <Metric label="Open actions" value={summary.openNextActions} tone={summary.openNextActions ? 'amber' : 'green'} />
        <Metric label="Objections" value={summary.objectionsCaptured} tone={summary.objectionsCaptured ? 'red' : 'green'} />
        <Metric label="Defense briefs" value={summary.pipelineDefenseBriefsCreated} />
      </div>
    </section>
  );
}

function WeeklyExecutionHealth({
  review,
  activeOpportunityCount,
}: {
  review: DashboardInsights['weeklyExecutionReview'];
  activeOpportunityCount: number;
}) {
  const summary = review.executionSummary;
  const dealsNeedingRescue = review.dealMovement.filter((item) => item.movement === 'Needs rescue' || item.movement === 'Consider downgrade');

  if (
    activeOpportunityCount === 0
    && summary.completedActionsCount === 0
    && summary.unresolvedCriticalActionsCount === 0
  ) {
    return null;
  }

  return (
    <section className="rounded-lg border border-purple-100 bg-purple-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-purple-700" />
            <h2 className="text-lg font-bold text-navy">Weekly Execution Health</h2>
          </div>
          <p className="mt-1 text-sm text-purple-900/75">
            Deal execution learning for {review.periodLabel}: completed actions, unresolved critical work, unclear outcomes, and rescue signals.
          </p>
        </div>
        <Link to="/app/weekly-brief" className="inline-flex shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Open Weekly Brief
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Completed actions" value={summary.completedActionsCount} tone={summary.completedActionsCount ? 'green' : 'blue'} />
        <Metric label="Unresolved critical" value={summary.unresolvedCriticalActionsCount} tone={summary.unresolvedCriticalActionsCount ? 'red' : 'green'} />
        <Metric label="Unclear outcomes" value={summary.unclearOutcomeCount} tone={summary.unclearOutcomeCount ? 'amber' : 'green'} />
        <Metric label="Deals needing rescue" value={dealsNeedingRescue.length} tone={dealsNeedingRescue.length ? 'amber' : 'green'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {review.executionQualitySignals.slice(0, 2).map((signal) => (
          <article key={signal} className="rounded-lg bg-white p-3 ring-1 ring-purple-100">
            <Badge label="Signal" tone="amber" />
            <p className="mt-2 text-sm leading-6 text-gray-700">{signal}</p>
          </article>
        ))}
        {review.nextWeekFocus.slice(0, 2).map((focus) => (
          <article key={focus} className="rounded-lg bg-white p-3 ring-1 ring-purple-100">
            <Badge label="Focus" tone="blue" />
            <p className="mt-2 text-sm leading-6 text-gray-700">{focus}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CaptureNudgePanel({ nudges }: { nudges: CaptureNudge[] }) {
  return (
    <section className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-emerald-700" />
            <h2 className="text-lg font-bold text-navy">Capture Nudges</h2>
          </div>
          <p className="mt-1 text-sm text-emerald-900/75">
            Fast prompts for sales updates that would improve deal memory today.
          </p>
        </div>
        <Link to="/app/capture?mode=quick" className="inline-flex shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Quick Capture
        </Link>
      </div>

      {nudges.length === 0 ? (
        <p className="mt-4 rounded-lg bg-white p-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
          No urgent capture nudges right now. Use Quick Capture after the next customer touch.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {nudges.map((nudge) => (
            <Link key={nudge.id} to={nudge.href} className="rounded-lg bg-white p-4 ring-1 ring-emerald-100 hover:ring-emerald-300">
              <div className="flex flex-wrap gap-2">
                <Badge label={nudge.priority} tone={nudge.priority === 'High' ? 'red' : nudge.priority === 'Medium' ? 'amber' : 'green'} />
                <Badge label={nudge.sourceType} tone="blue" />
              </div>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{nudge.accountName} / {nudge.opportunityName || 'No opportunity'}</p>
              <h3 className="mt-1 text-sm font-bold text-navy">{nudge.title}</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">{nudge.reason}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function TopSalesPattern({ pattern }: { pattern?: SalesPlaybookPattern }) {
  if (!pattern) return null;

  return (
    <section className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-700" />
            <h2 className="text-lg font-bold text-navy">Top Sales Pattern</h2>
          </div>
          <p className="mt-1 text-sm text-indigo-900/75">
            Highest-priority reusable learning detected from your current pipeline memory.
          </p>
        </div>
        <Link to="/app/playbook" className="inline-flex shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Open Playbook
        </Link>
      </div>
      <article className="mt-4 rounded-lg bg-white p-4 ring-1 ring-indigo-100">
        <div className="flex flex-wrap gap-2">
          <Badge label={pattern.category} tone="blue" />
          <Badge label={pattern.severity} tone={playbookSeverityTone(pattern)} />
          <Badge label={`${pattern.frequency}x`} tone="gray" />
        </div>
        <h3 className="mt-3 text-base font-bold text-navy">{pattern.title}</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">{pattern.whyItMatters}</p>
        <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900">
          {pattern.suggestedPlaybookResponse}
        </p>
      </article>
    </section>
  );
}

function AssetGaps({
  gapSummary,
  assetCount,
  objectionCount,
  patternCount,
}: {
  gapSummary: DashboardInsights['assetGapSummary'];
  assetCount: number;
  objectionCount: number;
  patternCount: number;
}) {
  if (!gapSummary.topMissingAsset && assetCount === 0 && objectionCount === 0 && patternCount === 0) return null;

  return (
    <section className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-700" />
            <h2 className="text-lg font-bold text-navy">Asset Gaps</h2>
          </div>
          <p className="mt-1 text-sm text-cyan-900/75">
            Reusable proof, response, and proposal assets that would help current deal risks.
          </p>
        </div>
        <Link to="/app/assets" className="inline-flex shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Open Assets
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_220px]">
        <article className="rounded-lg bg-white p-4 ring-1 ring-cyan-100">
          <Badge label={gapSummary.topMissingAsset?.priority || 'Low'} tone={gapSummary.topMissingAsset?.priority === 'High' ? 'red' : gapSummary.topMissingAsset?.priority === 'Medium' ? 'amber' : 'blue'} />
          <h3 className="mt-3 text-base font-bold text-navy">
            {gapSummary.topMissingAsset?.title || 'No urgent asset gap detected'}
          </h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {gapSummary.topMissingAsset?.reason || 'Create assets from Playbook patterns as reusable sales proof accumulates.'}
          </p>
        </article>
        <article className="rounded-lg bg-white p-4 ring-1 ring-cyan-100">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Repeated objections without asset</p>
          <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-2xl font-black ${gapSummary.repeatedObjectionsWithoutAsset ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {gapSummary.repeatedObjectionsWithoutAsset}
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-600">{assetCount} saved assets available.</p>
        </article>
      </div>
    </section>
  );
}

function PriorityActionList({ items }: { items: CommandActionItem[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-brand-blue" />
            <h2 className="text-lg font-bold text-navy">Priority Action List</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">Combined next actions from activities, opportunities, and pipeline risk signals.</p>
        </div>
        <Link to="/app/capture" className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Capture Activity
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyPanel title="No priority actions right now." helper="Add an opportunity next action or capture an activity with a follow-up." href="/app/capture" cta="Capture activity" />
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <ActionItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function OpenObjectionSignals({ objections }: { objections: ObjectionRecord[] }) {
  const openHighImpact = objections.filter((objection) => objection.status === 'Open' && objection.impact === 'High');
  const open = objections.filter((objection) => objection.status === 'Open');
  if (open.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <h2 className="text-lg font-bold text-navy">Open Objection Signals</h2>
          </div>
          <p className="mt-1 text-sm text-amber-800">
            {openHighImpact.length > 0
              ? `${openHighImpact.length} high-impact objection${openHighImpact.length === 1 ? '' : 's'} need attention before review.`
              : `${open.length} open objection${open.length === 1 ? '' : 's'} captured in the ledger.`}
          </p>
        </div>
        <Link to="/app/objections" className="inline-flex shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Open Objection Ledger
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(openHighImpact.length > 0 ? openHighImpact : open).slice(0, 3).map((objection) => (
          <article key={objection.id} className="rounded-lg bg-white p-3 ring-1 ring-amber-100">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{objection.accountName || 'No account'} / {objection.opportunityName || 'No opportunity'}</p>
            <h3 className="mt-1 text-sm font-bold text-navy">{objection.objectionText}</h3>
            <p className="mt-1 text-xs font-semibold text-gray-500">{objection.objectionType} | {objection.impact} impact</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CriticalDealActions({
  actions,
  outcomeLoop,
}: {
  actions: OpportunityRecommendedAction[];
  outcomeLoop: DashboardInsights['outcomeLoop'];
}) {
  if (actions.length === 0 && outcomeLoop.latestCompletedActions.length === 0 && outcomeLoop.negativeOrUnclearOutcomes.length === 0) return null;

  return (
    <section className="rounded-lg border border-red-100 bg-red-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-700" />
            <h2 className="text-lg font-bold text-navy">Critical Deal Actions</h2>
          </div>
          <p className="mt-1 text-sm text-red-800">
            Top next-best-actions plus recent outcomes from MEDDIC gaps, stakeholder risk, objections, stale actions, and competition signals.
          </p>
        </div>
        <Link to="/app/opportunities" className="inline-flex shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Open opportunities
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Metric label="Unresolved critical" value={actions.length} tone={actions.length ? 'red' : 'green'} />
        <Metric label="Completed actions" value={outcomeLoop.latestCompletedActions.length} tone={outcomeLoop.latestCompletedActions.length ? 'green' : 'blue'} />
        <Metric label="Negative/unclear" value={outcomeLoop.negativeOrUnclearOutcomes.length} tone={outcomeLoop.negativeOrUnclearOutcomes.length ? 'amber' : 'green'} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <CriticalDealActionCard key={action.id} action={action} />
        ))}
        {outcomeLoop.negativeOrUnclearOutcomes.slice(0, Math.max(0, 3 - actions.length)).map((outcome) => (
          <article key={outcome.id} className="rounded-lg bg-white p-3 ring-1 ring-amber-100">
            <div className="flex flex-wrap gap-2">
              <Badge label={outcome.outcomeType} tone={outcome.outcomeType === 'Worsened' || outcome.outcomeType === 'Downgrade recommended' ? 'red' : 'amber'} />
              <Badge label={outcome.status} tone="gray" />
            </div>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{outcome.accountName} / {outcome.opportunityName}</p>
            <h3 className="mt-1 text-sm font-bold text-navy">{outcome.actionTitle}</h3>
            {outcome.outcomeNote && <p className="mt-1 text-xs leading-5 text-gray-500">{outcome.outcomeNote}</p>}
          </article>
        ))}
        {actions.length === 0 && outcomeLoop.latestCompletedActions.slice(0, 3).map((outcome) => (
          <article key={outcome.id} className="rounded-lg bg-white p-3 ring-1 ring-emerald-100">
            <div className="flex flex-wrap gap-2">
              <Badge label={outcome.outcomeType} tone={outcome.outcomeType === 'Improved' || outcome.outcomeType === 'Resolved' ? 'green' : 'blue'} />
              <Badge label="Completed" tone="green" />
            </div>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{outcome.accountName} / {outcome.opportunityName}</p>
            <h3 className="mt-1 text-sm font-bold text-navy">{outcome.actionTitle}</h3>
            {outcome.outcomeNote && <p className="mt-1 text-xs leading-5 text-gray-500">{outcome.outcomeNote}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function CriticalDealActionCard({ action }: { action: OpportunityRecommendedAction }) {
  return (
    <article className="rounded-lg bg-white p-3 ring-1 ring-red-100">
      <div className="flex flex-wrap gap-2">
        <Badge label={action.priority} tone={action.priority === 'High' ? 'red' : action.priority === 'Medium' ? 'amber' : 'green'} />
        <Badge label={action.sourceType} tone={action.sourceType === 'Objection' || action.sourceType === 'Competition' ? 'amber' : 'blue'} />
      </div>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{action.accountName} / {action.opportunityName}</p>
      <h3 className="mt-1 text-sm font-bold text-navy">{action.title}</h3>
      <p className="mt-1 text-xs leading-5 text-gray-500">{action.reason}</p>
      {action.suggestedDueDate && <p className="mt-2 text-xs font-bold text-red-700">Suggested due: {action.suggestedDueDate}</p>}
    </article>
  );
}

function MeddicRiskSignal({ summary }: { summary: DashboardInsights['meddicSummary'] }) {
  const totalRisk = summary.missingChampionCount + summary.missingEconomicBuyerCount + summary.decisionProcessGapCount + summary.unsupportedCount + summary.hopeBasedCount;
  if (summary.totalOpportunities === 0 || totalRisk === 0) return null;

  return (
    <section className="rounded-lg border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-brand-blue" />
            <h2 className="text-lg font-bold text-navy">MEDDIC-lite Risk Signal</h2>
          </div>
          <p className="mt-1 text-sm text-blue-900/75">
            {summary.missingChampionCount} missing champion, {summary.missingEconomicBuyerCount} missing economic buyer, {summary.decisionProcessGapCount} unclear decision process.
          </p>
        </div>
        <Link to="/app/opportunities" className="inline-flex shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Review Opportunities
        </Link>
      </div>
      {summary.topRisks.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summary.topRisks.slice(0, 3).map((item) => (
            <article key={item.opportunityId} className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
              <div className="flex flex-wrap gap-2">
                <Badge label={item.category} tone={item.category === 'Unsupported' || item.category === 'Hope-based' ? 'red' : 'amber'} />
              </div>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{item.accountName}</p>
              <h3 className="mt-1 text-sm font-bold text-navy">{item.opportunityName}</h3>
              {item.gaps.length > 0 && (
                <p className="mt-1 text-xs leading-5 text-gray-500">{item.gaps.join('; ')}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionItem({ item }: { item: CommandActionItem }) {
  return (
    <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <PriorityBadge priority={item.priority} />
            <Badge label={item.source} />
            {item.dueDate && <Badge label={`Due ${formatSafeBusinessDate(item.dueDate)}`} tone={isBusinessDateOverdue(item.dueDate) ? 'red' : 'blue'} />}
          </div>
          <h3 className="mt-2 text-base font-bold text-navy">{item.title}</h3>
          <p className="mt-1 text-sm leading-6 text-gray-600">{item.reason}</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            {item.accountName}{item.opportunityName ? ` / ${item.opportunityName}` : ''}
          </p>
        </div>
        <Link to={item.href} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:text-brand-blue">
          Open
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function AtRiskOpportunities({ items }: { items: AtRiskOpportunityItem[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className="text-lg font-bold text-navy">At-Risk Opportunities</h2>
      </div>
      {items.length === 0 ? (
        <EmptyPanel title="No at-risk opportunities detected." helper="Keep opportunity evidence and next actions current." href="/app/opportunities" cta="Open opportunities" />
      ) : (
        <div className="mt-4 space-y-3">
          {items.slice(0, 6).map((item) => (
            <article key={item.id} className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{item.accountName}</p>
                  <h3 className="mt-1 text-base font-bold text-navy">{item.opportunityName}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge label={item.forecastEvidenceCategory} tone={forecastTone(item.forecastEvidenceCategory)} />
                    <Badge label={item.decisionRecommendation} tone={decisionTone(item.decisionRecommendation)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={item.href} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-amber-100">Open Opportunity</Link>
                  <Link to="/app/opportunities" className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">Generate Defense Brief</Link>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <MiniFact label="Missing context" value={item.missingContext} />
                <MiniFact label="Objection debt" value={item.objectionDebt} />
                <MiniFact label="Next action" value={item.nextAction} />
                <MiniFact label="Reason" value={item.reason} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AccountsNeedingTouch({ items }: { items: AccountTouchItem[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-brand-blue" />
        <h2 className="text-lg font-bold text-navy">Accounts Needing Touch</h2>
      </div>
      {items.length === 0 ? (
        <EmptyPanel title="No accounts need a touch right now." helper="Capture activity after customer interactions so account memory stays fresh." href="/app/capture" cta="Capture activity" />
      ) : (
        <div className="mt-4 space-y-3">
          {items.slice(0, 8).map((item) => (
            <article key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-base font-bold text-navy">{item.accountName}</h3>
                  <p className="mt-1 text-sm leading-6 text-gray-600">{item.reason}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                    Last activity: {item.lastActivityDate} | Active opportunities: {item.activeOpportunityCount}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link to={item.href} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700">Open Account</Link>
                  <Link to={`/app/capture?mode=quick&account=${encodeURIComponent(item.accountName)}`} className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">Quick Capture</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentActivityFeed({ items }: { items: RecentActivityItem[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy">Recent Activity Feed</h2>
          <p className="mt-1 text-sm text-gray-500">Latest captured sales activity across accounts and opportunities.</p>
        </div>
        <Link to="/app/calendar" className="text-sm font-bold text-brand-blue">Open Calendar</Link>
      </div>
      {items.length === 0 ? (
        <EmptyPanel title="No recent activity captured." helper="Capture your next customer touch to build the feed." href="/app/capture" cta="Capture activity" />
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={item.type} />
                <span className="text-xs font-bold text-gray-400">{item.date}</span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-navy">{item.accountName}</h3>
              <p className="mt-1 text-sm leading-6 text-gray-600">{item.summary}</p>
              {item.linkedOpportunityName && (
                <p className="mt-1 text-xs font-bold text-brand-blue">Linked: {item.linkedOpportunityName}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function QuickActions() {
  const actions = [
    { label: 'Quick Capture', href: '/app/capture?mode=quick', icon: <NotebookPen className="h-4 w-4" /> },
    { label: 'Sales Setup', href: '/app/onboarding/sales-operating-setup', icon: <Target className="h-4 w-4" /> },
    { label: 'Add Opportunity', href: '/app/opportunities', icon: <Target className="h-4 w-4" /> },
    { label: 'Add Account', href: '/app/accounts', icon: <BookOpen className="h-4 w-4" /> },
    { label: 'Weekly Brief', href: '/app/weekly-brief', icon: <ClipboardList className="h-4 w-4" /> },
    { label: 'Open Pipeline Defense', href: '/app/pipeline-defense', icon: <FileCheck2 className="h-4 w-4" /> },
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-navy">Quick Actions</h2>
      <div className="mt-4 space-y-2">
        {actions.map((action) => (
          <Link
            key={action.href}
            to={action.href}
            className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-brand-blue"
          >
            <span className="flex items-center gap-2">{action.icon}{action.label}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function ValidationCta({ message, onCopyInterviewScript }: { message: string; onCopyInterviewScript: () => void }) {
  return (
    <section className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Validation mode</p>
          <h2 className="mt-2 text-xl font-bold text-navy">Validate Memoire with a real user</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-950">
            Use the demo, capture feedback locally, and decide the next roadmap bet from real conversations instead of instinct.
          </p>
          {message && <p className="mt-2 text-sm font-semibold text-emerald-700">{message}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/demo-guide" className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Open Demo Guide
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/app/validation-feedback" className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800">
            Open Feedback Log
          </Link>
          <button type="button" onClick={onCopyInterviewScript} className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800">
            Copy Interview Script
          </button>
        </div>
      </div>
    </section>
  );
}

function DemoCommercializationCta({ onOpenDemoSandbox }: { onOpenDemoSandbox: () => void }) {
  return (
    <section className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-blue" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Memoire in 5 minutes</p>
          </div>
          <h2 className="mt-2 text-xl font-bold text-navy">Run the pipeline review demo</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Memoire does not replace your CRM. It helps you review and defend your pipeline with a private, read-only working copy.
          </p>
          <p className="mt-2 max-w-3xl text-xs font-semibold leading-5 text-gray-500">
            Local-first by default. CSV import stays in your browser. No CRM writeback. AI assist is optional where configured.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/demo-guide" className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Run 5-minute Memoire Demo
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button type="button" onClick={onOpenDemoSandbox} className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-bold text-brand-blue">
            Load Demo Sandbox
          </button>
        </div>
      </div>
    </section>
  );
}

function SalesOperatingSetupCta({ progress }: { progress: SalesOperatingSetupProgress }) {
  const ready = progress.status === 'Ready';

  return (
    <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Target className="h-4 w-4 text-brand-blue" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Sales operating context</p>
            <Badge label={progress.status} tone={ready ? 'green' : progress.status === 'In progress' ? 'amber' : 'gray'} />
          </div>
          <h2 className="mt-2 text-xl font-bold text-navy">Set Target, GTM, RTM, Cycle, and Daily Log</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            This gives Memoire the operating frame behind pipeline reviews, activity capture, forecast pressure, and next-action prompts.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:min-w-[220px]">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
            <span>{progress.percent}% ready</span>
            <span>{progress.completedRequired}/{progress.requiredCount} required</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-blue" style={{ width: `${progress.percent}%` }} />
          </div>
          <Link to="/app/onboarding/sales-operating-setup" className="mt-1 inline-flex justify-center rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            {ready ? 'Review Setup' : 'Open Setup'}
          </Link>
        </div>
      </div>
    </section>
  );
}

function PipelineReviewHabitCard({
  progress,
  latestReviewPack,
}: {
  progress: PipelineReviewHabitProgress;
  latestReviewPack: ReviewPackSnapshot | null;
}) {
  const nextStep = progress.nextStep;
  const statusTone =
    progress.readinessStatus === 'Review ready'
      ? 'green'
      : progress.readinessStatus === 'Almost ready'
        ? 'amber'
        : progress.readinessStatus === 'In progress'
          ? 'blue'
          : 'gray';

  return (
    <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardList className="h-4 w-4 text-brand-blue" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Weekly pipeline habit</p>
            <Badge label={progress.readinessStatus} tone={statusTone} />
          </div>
          <h2 className="mt-2 text-xl font-bold text-navy">This Week&apos;s Pipeline Review</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            A lightweight checklist for getting from raw pipeline data to a manager-ready review. It resets automatically each week and stays local to this browser.
          </p>
        </div>
        <div className="min-w-[150px] rounded-lg border border-blue-100 bg-blue-50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Progress</p>
          <p className="mt-1 text-3xl font-black text-brand-blue">{progress.progressPercent}%</p>
          <p className="mt-1 text-xs font-semibold text-blue-800">
            {progress.completedCount}/{progress.totalCount} steps complete
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {progress.steps.map((step) => (
          <div key={step.id} className={`rounded-lg border p-3 ${
            step.done ? 'border-emerald-100 bg-emerald-50' : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-start gap-2">
              <CheckCircle2 className={`mt-0.5 h-4 w-4 ${step.done ? 'text-emerald-600' : 'text-gray-300'}`} />
              <div>
                <p className={`text-sm font-bold ${step.done ? 'text-emerald-800' : 'text-navy'}`}>{step.label}</p>
                <p className="mt-1 text-xs leading-5 text-gray-600">{step.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-950">
            {nextStep ? `Next step: ${nextStep.label}` : 'Pipeline review is ready.'}
          </p>
          <p className="mt-1 text-sm text-blue-800">
            {nextStep ? nextStep.description : 'Copy or export the final summary before your pipeline review.'}
          </p>
        </div>
        <Link
          to={nextStep?.href || '/app/pipeline-defense'}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-sm font-bold text-white"
        >
          {nextStep?.cta || 'Open Brief'}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {latestReviewPack ? (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-emerald-900">Latest saved review pack</p>
            <p className="mt-1 text-sm text-emerald-800">
              {latestReviewPack.title} • {latestReviewPack.dealCount} deals • {latestReviewPack.defendCount} defend / {latestReviewPack.rescueCount} rescue / {latestReviewPack.downgradeCount} downgrade
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/app/pipeline-defense/review-pack/${latestReviewPack.id}`} className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
              Open Latest Review Pack
            </Link>
            <Link to="/app/pipeline-defense" className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
              Save This Week's Pack
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-navy">No saved pack for this week yet.</p>
            <p className="mt-1 text-sm text-gray-600">Save a review pack after generating the defense brief so you can reopen what was presented.</p>
          </div>
          <Link to="/app/pipeline-defense" className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
            Go to Pipeline Defense
          </Link>
        </div>
      )}
    </section>
  );
}

function TrialActivationChecklistCard({
  items,
  onMarkDone,
  onReset,
}: {
  items: TrialActivationChecklistItem[];
  onMarkDone: (id: TrialActivationChecklistItemId) => void;
  onReset: () => void;
}) {
  const doneCount = items.filter((item) => item.done).length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Trial activation checklist</p>
          <h2 className="mt-2 text-xl font-bold text-navy">Get to a manager-ready review</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Complete these steps to validate the full Memoire loop: pipeline copy, opportunity review, capture, assets, defense brief, and manager summary.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue">{doneCount}/{items.length} done</span>
          <button type="button" onClick={onReset} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600">
            Reset
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
              item.done ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-gray-600 ring-1 ring-gray-200'
            }`}>
              {item.done ? 'Done' : 'Next'}
            </span>
            <h3 className="mt-3 text-sm font-bold text-navy">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={item.href} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-blue ring-1 ring-blue-100">
                {item.cta}
              </Link>
              {!item.done && (
                <button
                  type="button"
                  onClick={() => onMarkDone(item.id)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600"
                >
                  Mark done
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function FirstPipelineReviewCta({
  progress,
  metrics,
  hasSampleData,
}: {
  progress: FirstPipelineReviewProgressStep[];
  metrics: ReturnType<typeof buildFirstPipelineReviewMetrics>;
  hasSampleData: boolean;
}) {
  const nextStep = getFirstPipelineReviewNextStep(progress);
  const percent = getFirstPipelineReviewProgressPercent(progress);
  const hasPipelineData = metrics.totalOpportunities > 0 || hasSampleData;

  return (
    <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-brand-blue" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">First review path</p>
          </div>
          <h2 className="mt-2 text-xl font-bold text-navy">Prepare Your First Pipeline Review</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            {hasPipelineData
              ? `You have ${metrics.totalOpportunities} opportunity record${metrics.totalOpportunities === 1 ? '' : 's'}. Next: ${nextStep.title.toLowerCase()}.`
              : 'Start with a CSV import, demo sandbox, or one manual opportunity, then generate a Pipeline Defense Brief.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:min-w-[240px]">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
            <span>{percent}% complete</span>
            <span>{progress.filter((step) => step.done).length}/{progress.length} steps</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-blue" style={{ width: `${percent}%` }} />
          </div>
          <Link to="/app/onboarding/pipeline-review" className="mt-1 inline-flex justify-center rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Continue
          </Link>
        </div>
      </div>
    </section>
  );
}

function DemoSandboxPrompt({
  hasExistingData,
  isAuthenticated,
  onCancel,
  onLoad,
}: {
  hasExistingData: boolean;
  isAuthenticated: boolean;
  onCancel: () => void;
  onLoad: () => void;
}) {
  useEscapeToClose(onCancel);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 px-4">
      <section role="dialog" aria-modal="true" aria-label="Load demo sandbox" className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Demo sandbox</p>
        <h2 className="mt-2 text-2xl font-bold text-navy">Load realistic sample data?</h2>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Demo data is stored locally in this browser and will not sync to your account. It includes healthy, weak, hope-based, and unsupported opportunities so you can see how Memoire separates risk levels.
        </p>
        {hasExistingData && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            You already have workspace data. Loading demo data may mix with your local workspace.
          </p>
        )}
        {isAuthenticated && (
          <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
            You are signed in, but demo data will remain local only and will not be saved to your cloud account.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
            Cancel
          </button>
          <button type="button" onClick={onLoad} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Load demo sandbox
          </button>
        </div>
      </section>
    </div>
  );
}

function FocusCard({
  title,
  value,
  helper,
  href,
  tone,
}: {
  title: string;
  value: number;
  helper: string;
  href: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
}) {
  return (
    <Link to={href} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-2xl font-black ${toneClass(tone)}`}>{value}</p>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-600">{helper}</p>
    </Link>
  );
}

function Metric({ label, value, tone = 'blue' }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-lg font-black ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/80 p-3 ring-1 ring-gray-100">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm leading-6 text-gray-700">{value}</p>
    </div>
  );
}

function EmptyPanel({ title, helper, href, cta }: { title: string; helper: string; href: string; cta: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-5 text-center">
      <p className="text-sm font-bold text-navy">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{helper}</p>
      <Link to={href} className="mt-3 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
        {cta}
      </Link>
    </div>
  );
}

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple' }) {
  const toneMap = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
    purple: 'border-indigo-100 bg-indigo-50 text-indigo-700',
  }[tone];

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${toneMap}`}>{label}</span>;
}

function PriorityBadge({ priority }: { priority: CommandPriority }) {
  const tone = priority === 'Critical' ? 'red' : priority === 'High' ? 'amber' : priority === 'Medium' ? 'blue' : 'green';
  return <Badge label={priority} tone={tone} />;
}

function addDaysKey(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function toneClass(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
}

function forecastTone(category: string) {
  if (category === 'Defensible') return 'green';
  if (category === 'Weak but recoverable') return 'amber';
  return 'red';
}

function decisionTone(decision: string) {
  if (decision === 'Defend') return 'green';
  if (decision === 'Monitor') return 'blue';
  if (decision === 'Deprioritize') return 'gray';
  return 'red';
}

function playbookSeverityTone(pattern: SalesPlaybookPattern) {
  if (pattern.severity === 'High') return 'red';
  if (pattern.severity === 'Medium') return 'amber';
  return 'green';
}

async function loadDashboardData(userId?: string | null, options: DashboardLoadOptions = {}): Promise<DashboardData> {
  return loadSalesWorkspaceData(userId, options);
}
