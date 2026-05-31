import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  NotebookPen,
  Plus,
  Target,
} from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import type { AccountMemoryRecord } from '../../services/accountStore';
import { loadAccounts } from '../../services/accountStore';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import { loadOpportunities } from '../../services/opportunityStore';
import { loadSalesActivities, type SalesActivityRecord } from '../../services/salesActivityStore';
import { loadObjections, type ObjectionRecord } from '../../services/objectionStore';
import { loadStakeholders, type StakeholderRecord } from '../../services/stakeholderStore';
import { loadActionOutcomes, type ActionOutcomeRecord } from '../../services/actionOutcomeStore';
import { loadSalesAssets, type SalesAssetRecord } from '../../services/salesAssetStore';
import { canUsePipelineDefenseCloudStore, loadCloudBriefs } from '../../services/pipelineDefenseCloudStore';
import {
  loadPipelineDefenseBriefStore,
  type PipelineDefenseBrief,
} from '../../utils/pipelineDefenseStorage';
import {
  buildTodayCommandCenter,
  type AccountTouchItem,
  type AtRiskOpportunityItem,
  type CommandActionItem,
  type CommandCenter,
  type CommandPriority,
  type RecentActivityItem,
} from '../../utils/salesCommandCenter';
import {
  dismissOnboarding,
  loadOnboardingState,
  markOnboardingStepComplete,
  resetOnboarding,
  saveOnboardingState,
  type OnboardingState,
} from '../../utils/onboardingState';
import { hasLocalSampleData } from '../../utils/dataMode';
import { clearSampleDataset, loadSampleDataset } from '../../utils/sampleData';
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

type DashboardData = {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
  briefs: PipelineDefenseBrief[];
  objections: ObjectionRecord[];
  stakeholders: StakeholderRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  assets: SalesAssetRecord[];
};

type DashboardInsights = ReturnType<typeof buildDashboardInsights>;

export function DashboardPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [data, setData] = useState<DashboardData>({
    activities: [],
    opportunities: [],
    accounts: [],
    briefs: [],
    objections: [],
    stakeholders: [],
    actionOutcomes: [],
    assets: [],
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [onboarding, setOnboarding] = useState<OnboardingState>(() => loadOnboardingState());
  const [sampleMessage, setSampleMessage] = useState('');
  const [demoSandboxPromptOpen, setDemoSandboxPromptOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      setMessage('');

      try {
        const nextData = await loadDashboardData(hasLocalSampleData() ? undefined : user?.id);

        if (!mounted) return;
        setData(nextData);
        setMessage('Command center ready');
        setOnboarding(syncOnboardingFromData(nextData, { includeDataSignals: !hasLocalSampleData() }));
      } catch (error) {
        if (!mounted) return;
        if (import.meta.env.DEV) {
          console.debug('[Dashboard] load failed', { message: error instanceof Error ? error.message : 'Unknown error' });
        }
        setMessage('Cloud sync issue - your local copy is preserved.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (!authLoading) {
      loadDashboard();
    }

    return () => {
      mounted = false;
    };
  }, [authLoading, isAuthenticated, user?.id, sampleMessage]);

  const sampleDataActive = hasLocalSampleData();
  const commandCenter = useMemo(() => buildTodayCommandCenter(data), [data]);
  const dashboardInsights = useMemo(() => buildDashboardInsights(data), [data]);
  const onboardingProgress = useMemo(
    () => buildOnboardingProgress(onboarding, data, sampleDataActive),
    [data, onboarding, sampleDataActive]
  );

  useEffect(() => {
    setOnboarding(markOnboardingStepComplete('hasSeenWelcome'));
  }, []);

  const handleDismissOnboarding = () => {
    setOnboarding(dismissOnboarding());
  };

  const handleResetOnboarding = () => {
    setSampleMessage('');
    setOnboarding(resetOnboarding());
  };

  const handleLoadDemoSandbox = async () => {
    loadSampleDataset();
    const nextData = await loadDashboardData();
    setData(nextData);
    setOnboarding(syncOnboardingFromData(nextData, { includeDataSignals: false }));
    setSampleMessage(isAuthenticated
      ? 'Demo sandbox active - sample data is local only and was not saved to your cloud account.'
      : 'Demo sandbox active - sample data is local only.');
    setDemoSandboxPromptOpen(false);
  };

  const handleClearDemoSandbox = async () => {
    clearSampleDataset();
    const nextData = await loadDashboardData(user?.id);
    setData(nextData);
    setOnboarding(syncOnboardingFromData(nextData, { includeDataSignals: true }));
    setSampleMessage('Demo data cleared from this browser. Cloud data was not changed.');
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Today and this week command center for your B2B sales work.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">
          Loading dashboard...
        </div>
      ) : (
        <>
          {!onboarding.dismissedAt && (
            <OnboardingWelcomePanel
              progress={onboardingProgress}
              sampleMessage={sampleMessage}
              isDemoSandboxActive={sampleDataActive}
              hasExistingData={commandCenter.hasAnyData}
              isAuthenticated={isAuthenticated}
              onDismiss={handleDismissOnboarding}
              onReset={handleResetOnboarding}
              onOpenDemoSandbox={() => setDemoSandboxPromptOpen(true)}
              onClearDemoSandbox={handleClearDemoSandbox}
            />
          )}
          {sampleDataActive && (
            <section className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 shadow-sm md:flex-row md:items-center md:justify-between">
              <span>Demo sandbox active - sample data is local only. Replace it with real activities when ready.</span>
              <button
                type="button"
                onClick={handleClearDemoSandbox}
                className="inline-flex w-fit rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
              >
                Clear demo data
              </button>
            </section>
          )}
          {demoSandboxPromptOpen && (
            <DemoSandboxPrompt
              hasExistingData={commandCenter.hasAnyData}
              isAuthenticated={isAuthenticated}
              onCancel={() => setDemoSandboxPromptOpen(false)}
              onLoad={handleLoadDemoSandbox}
            />
          )}
          {!commandCenter.hasAnyData ? (
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
              <DashboardEmptyState />
              <QuickActions />
            </section>
          ) : (
            <>
              <TodayFocus commandCenter={commandCenter} />
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
            </>
          )}
        </>
      )}
    </div>
  );
}

function buildDashboardInsights(data: DashboardData) {
  const period = getCurrentExecutionWeekRange();
  const periodActivities = data.activities.filter((activity) => (
    activity.activityDate >= period.start && activity.activityDate <= period.end
  ));
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
  };
}

function TodayFocus({ commandCenter }: { commandCenter: CommandCenter }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy">Today Focus</h2>
          <p className="text-sm text-gray-500">Start with time-sensitive actions, risk, and accounts that need a touch.</p>
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
          title="Accounts needing touch"
          value={commandCenter.accountsNeedingTouch.length}
          href="/app/accounts"
          tone={commandCenter.accountsNeedingTouch.length ? 'amber' : 'green'}
          helper={commandCenter.accountsNeedingTouch[0]?.accountName || 'No stale account touch needed.'}
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
        <Link to="/app/reviews" className="inline-flex shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Open Reviews
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
          Open Opportunities
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
            {item.dueDate && <Badge label={`Due ${item.dueDate}`} tone={item.dueDate < new Date().toISOString().slice(0, 10) ? 'red' : 'blue'} />}
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
        <EmptyPanel title="No at-risk opportunities detected." helper="Keep opportunity evidence and next actions current." href="/app/opportunities" cta="Open Opportunities" />
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
    { label: 'Add Opportunity', href: '/app/opportunities', icon: <Target className="h-4 w-4" /> },
    { label: 'Add Account', href: '/app/accounts', icon: <BookOpen className="h-4 w-4" /> },
    { label: 'Generate Review', href: '/app/reviews', icon: <ClipboardList className="h-4 w-4" /> },
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

function DashboardEmptyState() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-blue">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-navy">Start by capturing one activity or adding one opportunity.</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        Memoire will turn activity notes, opportunities, account memory, and defense briefs into a focused daily command center.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/app/capture?mode=quick" className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          <NotebookPen className="h-4 w-4" />
          Quick Capture
        </Link>
        <Link to="/app/opportunities" className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
          <Plus className="h-4 w-4" />
          Add Opportunity
        </Link>
      </div>
    </section>
  );
}

function OnboardingWelcomePanel({
  progress,
  sampleMessage,
  isDemoSandboxActive,
  hasExistingData,
  isAuthenticated,
  onDismiss,
  onReset,
  onOpenDemoSandbox,
  onClearDemoSandbox,
}: {
  progress: ReturnType<typeof buildOnboardingProgress>;
  sampleMessage: string;
  isDemoSandboxActive: boolean;
  hasExistingData: boolean;
  isAuthenticated: boolean;
  onDismiss: () => void;
  onReset: () => void;
  onOpenDemoSandbox: () => void;
  onClearDemoSandbox: () => void;
}) {
  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Welcome to Memoire</p>
          <h2 className="mt-2 text-2xl font-bold text-navy">Welcome to Memoire</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-950">
            Your personal B2B sales operating system for capturing activity, managing opportunities, remembering accounts, and preparing pipeline reviews.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onOpenDemoSandbox} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Open Demo Sandbox
          </button>
          {isDemoSandboxActive && (
            <button type="button" onClick={onClearDemoSandbox} className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800">
              Clear demo data
            </button>
          )}
          <button type="button" onClick={onDismiss} className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-800">
            Dismiss guide
          </button>
          <button type="button" onClick={onReset} className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-800">
            Reset guide
          </button>
        </div>
      </div>

      {sampleMessage && (
        <p className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {sampleMessage}
        </p>
      )}

      <p className="mt-4 rounded-lg border border-amber-100 bg-white/80 px-3 py-2 text-sm leading-6 text-amber-900">
        Demo sandbox data stays local in this browser{isAuthenticated ? ' and will not be saved to your cloud account' : ''}.
        {isDemoSandboxActive ? ' The checklist still reflects your real workspace steps, not demo records.' : ''}
        {hasExistingData && !isDemoSandboxActive ? ' You already have workspace data, so Memoire will ask before loading demo records.' : ''}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-5">
        {progress.map((step) => (
          <article key={step.id} className="rounded-lg border border-blue-100 bg-white p-4">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              step.done ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {step.done ? 'Done' : 'Not started'}
            </span>
            <h3 className="mt-3 text-sm font-bold text-navy">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
            <Link to={step.href} className="mt-4 inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-100">
              {step.cta}
            </Link>
          </article>
        ))}
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 px-4">
      <section className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
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

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const toneMap = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${toneMap}`}>{label}</span>;
}

function PriorityBadge({ priority }: { priority: CommandPriority }) {
  const tone = priority === 'Critical' ? 'red' : priority === 'High' ? 'amber' : priority === 'Medium' ? 'blue' : 'green';
  return <Badge label={priority} tone={tone} />;
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

async function loadPipelineBriefs(userId?: string | null) {
  if (userId && canUsePipelineDefenseCloudStore()) {
    try {
      return await loadCloudBriefs(userId);
    } catch {
      return loadPipelineDefenseBriefStore().briefs;
    }
  }

  return loadPipelineDefenseBriefStore().briefs;
}

async function loadDashboardData(userId?: string | null): Promise<DashboardData> {
  const [activities, opportunities, accounts, briefs, objections, stakeholders] = await Promise.all([
    loadSalesActivities(userId),
    loadOpportunities(userId),
    loadAccounts(userId),
    loadPipelineBriefs(userId),
    loadObjections(userId),
    loadStakeholders(userId),
  ]);

  return { activities, opportunities, accounts, briefs, objections, stakeholders, actionOutcomes: loadActionOutcomes(), assets: loadSalesAssets() };
}

function syncOnboardingFromData(data: DashboardData, options: { includeDataSignals: boolean }) {
  const current = loadOnboardingState();
  const next = saveOnboardingState({
    ...current,
    hasSeenWelcome: true,
    hasCompletedFirstCapture: current.hasCompletedFirstCapture || (options.includeDataSignals && data.activities.length > 0),
    hasCreatedFirstOpportunity: current.hasCreatedFirstOpportunity || (options.includeDataSignals && data.opportunities.length > 0),
    hasCreatedFirstAccount: current.hasCreatedFirstAccount || (options.includeDataSignals && data.accounts.length > 0),
    hasGeneratedFirstDefenseBrief: current.hasGeneratedFirstDefenseBrief || (options.includeDataSignals && data.briefs.some(isUserCreatedBrief)),
  });

  return next;
}

function buildOnboardingProgress(onboarding: OnboardingState, data: DashboardData, sampleDataActive: boolean) {
  const shouldUseDataSignals = !sampleDataActive;
  const hasCapture = onboarding.hasCompletedFirstCapture || (shouldUseDataSignals && data.activities.length > 0);
  const hasOpportunity = onboarding.hasCreatedFirstOpportunity || (shouldUseDataSignals && data.opportunities.length > 0);
  const hasAccount = onboarding.hasCreatedFirstAccount || (shouldUseDataSignals && data.accounts.length > 0);
  const hasBrief = onboarding.hasGeneratedFirstDefenseBrief || (shouldUseDataSignals && data.briefs.some(isUserCreatedBrief));

  return [
    {
      id: 'capture',
      title: 'Capture your first sales activity',
      description: 'Write one note from a customer touch, follow-up, demo, or internal sales action.',
      cta: 'Capture activity',
      href: '/app/capture',
      done: hasCapture,
    },
    {
      id: 'opportunity',
      title: 'Add your first opportunity',
      description: 'Track one deal you want to defend, rescue, monitor, or downgrade.',
      cta: 'Add opportunity',
      href: '/app/opportunities',
      done: hasOpportunity,
    },
    {
      id: 'account',
      title: 'Create or confirm an account memory',
      description: 'Keep relationship context, stakeholders, notes, and linked activity in one account view.',
      cta: 'Create account',
      href: '/app/accounts',
      done: hasAccount,
    },
    {
      id: 'dashboard',
      title: 'Review your dashboard',
      description: 'Use the command center to see today actions, overdue work, risk, and recent activity.',
      cta: 'Review dashboard',
      href: '/app/dashboard',
      done: onboarding.hasSeenWelcome,
    },
    {
      id: 'defense',
      title: 'Generate your first pipeline defense brief',
      description: 'Select opportunities and create a review-ready defense brief from structured deal data.',
      cta: 'Generate defense brief',
      href: '/app/opportunities',
      done: hasBrief,
    },
  ];
}

function isUserCreatedBrief(brief: PipelineDefenseBrief) {
  return !brief.title.toLowerCase().includes('sample pipeline defense brief');
}
