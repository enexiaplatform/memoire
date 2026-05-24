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
  NotebookPen,
  Plus,
  Target,
} from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { ACCOUNT_STORAGE_KEY, type AccountMemoryRecord } from '../../services/accountStore';
import { loadAccounts } from '../../services/accountStore';
import { OPPORTUNITY_STORAGE_KEY, type CrmLiteOpportunity } from '../../services/opportunityStore';
import { loadOpportunities } from '../../services/opportunityStore';
import { SALES_ACTIVITY_STORAGE_KEY, loadSalesActivities, type SalesActivityRecord } from '../../services/salesActivityStore';
import { canUsePipelineDefenseCloudStore, loadCloudBriefs } from '../../services/pipelineDefenseCloudStore';
import {
  MULTI_BRIEF_STORAGE_KEY,
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
import { classifySalesActivity } from '../../utils/salesActivityClassifier';
import {
  dismissOnboarding,
  loadOnboardingState,
  markOnboardingStepComplete,
  resetOnboarding,
  saveOnboardingState,
  type OnboardingState,
} from '../../utils/onboardingState';
import { generatePipelineDefenseBriefFromOpportunities } from '../../utils/opportunityToPipelineBrief';

type DashboardData = {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
  briefs: PipelineDefenseBrief[];
};

export function DashboardPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [data, setData] = useState<DashboardData>({
    activities: [],
    opportunities: [],
    accounts: [],
    briefs: [],
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [onboarding, setOnboarding] = useState<OnboardingState>(() => loadOnboardingState());
  const [sampleMessage, setSampleMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      setMessage('');

      try {
        const [activities, opportunities, accounts, briefs] = await Promise.all([
          loadSalesActivities(user?.id),
          loadOpportunities(user?.id),
          loadAccounts(user?.id),
          loadPipelineBriefs(user?.id),
        ]);

        if (!mounted) return;
        setData({ activities, opportunities, accounts, briefs });
        setMessage(getStorageMessage(isAuthenticated, user?.id));
        setOnboarding(syncOnboardingFromData({ activities, opportunities, accounts, briefs }));
      } catch (error) {
        if (!mounted) return;
        setMessage(error instanceof Error ? error.message : 'Could not load dashboard data.');
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
  }, [authLoading, isAuthenticated, user?.id]);

  const commandCenter = useMemo(() => buildTodayCommandCenter(data), [data]);
  const onboardingProgress = useMemo(() => buildOnboardingProgress(onboarding, data), [data, onboarding]);

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

  const handleLoadSampleData = () => {
    const nextData = loadSampleSalesData();
    setData(nextData);
    setOnboarding(syncOnboardingFromData(nextData));
    setSampleMessage(isAuthenticated
      ? 'Sample sales data loaded into this browser only. Cloud records were not changed.'
      : 'Sample sales data loaded locally in this browser.');
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
        <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue">
          {message || (loading ? 'Loading sales memory...' : 'Command center ready')}
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
              onDismiss={handleDismissOnboarding}
              onReset={handleResetOnboarding}
              onLoadSampleData={handleLoadSampleData}
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
              <PriorityActionList items={commandCenter.priorityActions} />

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
                  <Link to="/app/capture" className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white">Capture Activity</Link>
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
    { label: 'Capture Activity', href: '/app/capture', icon: <NotebookPen className="h-4 w-4" /> },
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
        <Link to="/app/capture" className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          <NotebookPen className="h-4 w-4" />
          Capture Activity
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
  onDismiss,
  onReset,
  onLoadSampleData,
}: {
  progress: ReturnType<typeof buildOnboardingProgress>;
  sampleMessage: string;
  onDismiss: () => void;
  onReset: () => void;
  onLoadSampleData: () => void;
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
          <button type="button" onClick={onLoadSampleData} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            Load sample sales data
          </button>
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

function getStorageMessage(isAuthenticated: boolean, userId?: string | null) {
  if (isAuthenticated && userId) return 'Cloud + local fallback dashboard';
  return 'Local dashboard mode';
}

function syncOnboardingFromData(data: DashboardData) {
  const current = loadOnboardingState();
  const next = saveOnboardingState({
    ...current,
    hasSeenWelcome: true,
    hasCompletedFirstCapture: current.hasCompletedFirstCapture || data.activities.length > 0,
    hasCreatedFirstOpportunity: current.hasCreatedFirstOpportunity || data.opportunities.length > 0,
    hasCreatedFirstAccount: current.hasCreatedFirstAccount || data.accounts.length > 0,
    hasGeneratedFirstDefenseBrief: current.hasGeneratedFirstDefenseBrief || data.briefs.some(isUserCreatedBrief),
  });

  return next;
}

function buildOnboardingProgress(onboarding: OnboardingState, data: DashboardData) {
  const hasCapture = onboarding.hasCompletedFirstCapture || data.activities.length > 0;
  const hasOpportunity = onboarding.hasCreatedFirstOpportunity || data.opportunities.length > 0;
  const hasAccount = onboarding.hasCreatedFirstAccount || data.accounts.length > 0;
  const hasBrief = onboarding.hasGeneratedFirstDefenseBrief || data.briefs.some(isUserCreatedBrief);

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

function loadSampleSalesData(): DashboardData {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = addDays(now, 1);
  const nextWeek = addDays(now, 7);
  const timestamp = now.toISOString();
  const samplePrefix = `sample-${Date.now()}`;

  const sampleActivities = [
    createSampleActivity({
      id: `${samplePrefix}-activity-tv-pharm`,
      note: 'Met TV Pharm today. Need to clarify tender timeline next week.',
      activityDate: today,
      linkedOpportunityId: `${samplePrefix}-opp-tv-pharm`,
      linkedOpportunityName: 'Tender opportunity',
      linkedAccountName: 'TV Pharm',
      createdAt: timestamp,
    }),
    createSampleActivity({
      id: `${samplePrefix}-activity-control-union`,
      note: 'Gặp Control Union, họ còn lăn tăn lead time. Cần gửi proof local support tuần này.',
      activityDate: today,
      linkedOpportunityId: `${samplePrefix}-opp-control-union`,
      linkedOpportunityName: 'Microbiology workflow',
      linkedAccountName: 'Control Union',
      createdAt: timestamp,
    }),
  ];

  const sampleOpportunities: CrmLiteOpportunity[] = [
    {
      id: `${samplePrefix}-opp-tv-pharm`,
      accountName: 'TV Pharm',
      opportunityName: 'Tender opportunity',
      stage: 'Procurement',
      estimatedValue: 900000000,
      currency: 'VND',
      expectedClosePeriod: 'This quarter',
      productOrSolution: 'Sterility testing workflow',
      decisionMaker: '',
      budgetOwner: '',
      procurementPath: 'Tender path not confirmed',
      technicalCriteria: 'Tender evaluation criteria unclear',
      nextAction: 'Clarify tender timeline and committee owner',
      nextActionDate: nextWeek,
      evidence: 'Customer confirmed tender interest but timing is not final.',
      missingContext: 'Decision committee; budget owner; tender timeline',
      objectionDebt: 'Procurement path and tender timing are unclear.',
      forecastEvidenceCategory: 'Hope-based',
      decisionRecommendation: 'Rescue',
      status: 'Active',
      createdAt: timestamp,
      updatedAt: timestamp,
      storageMode: 'local',
    },
    {
      id: `${samplePrefix}-opp-control-union`,
      accountName: 'Control Union',
      opportunityName: 'Microbiology workflow',
      stage: 'Proposal',
      estimatedValue: 450000000,
      currency: 'VND',
      expectedClosePeriod: 'Next month',
      productOrSolution: 'Microbiology workflow',
      decisionMaker: 'Lab manager',
      budgetOwner: '',
      procurementPath: 'Internal review before PO',
      technicalCriteria: 'Lead time and local support proof required',
      nextAction: 'Send local support proof and lead time response',
      nextActionDate: tomorrow,
      evidence: 'Customer raised specific lead time and support questions.',
      missingContext: 'Budget owner; final approval date',
      objectionDebt: 'Lead time concern and local support proof needed.',
      forecastEvidenceCategory: 'Weak but recoverable',
      decisionRecommendation: 'Rescue',
      status: 'Active',
      createdAt: timestamp,
      updatedAt: timestamp,
      storageMode: 'local',
    },
  ];

  const sampleAccounts: AccountMemoryRecord[] = [
    {
      id: `${samplePrefix}-account-control-union`,
      accountName: 'Control Union',
      segment: 'Testing lab',
      industry: 'Quality testing',
      location: 'Vietnam',
      accountPotential: 'High',
      relationshipStatus: 'Developing',
      keyStakeholders: ['Lab manager'],
      notes: 'Sample account memory. Customer cares about proof, response speed, and local support.',
      tags: ['sample-data', 'microbiology'],
      createdAt: timestamp,
      updatedAt: timestamp,
      storageMode: 'local',
    },
  ];

  const sampleBrief = generatePipelineDefenseBriefFromOpportunities(sampleOpportunities, {
    title: `Demo Defense Brief - ${today}`,
    weekLabel: 'Sample week',
    salesOwner: 'Henry',
    scope: 'Sample opportunities',
  });

  writeLocalArray(SALES_ACTIVITY_STORAGE_KEY, sampleActivities);
  writeLocalArray(OPPORTUNITY_STORAGE_KEY, sampleOpportunities);
  writeLocalArray(ACCOUNT_STORAGE_KEY, sampleAccounts);
  writeLocalBrief(sampleBrief);

  return {
    activities: sampleActivities,
    opportunities: sampleOpportunities,
    accounts: sampleAccounts,
    briefs: [sampleBrief, ...loadPipelineDefenseBriefStore().briefs.filter((brief) => brief.id !== sampleBrief.id)],
  };
}

function createSampleActivity({
  id,
  note,
  activityDate,
  linkedOpportunityId,
  linkedOpportunityName,
  linkedAccountName,
  createdAt,
}: {
  id: string;
  note: string;
  activityDate: string;
  linkedOpportunityId: string;
  linkedOpportunityName: string;
  linkedAccountName: string;
  createdAt: string;
}): SalesActivityRecord {
  const classified = classifySalesActivity(note, activityDate);
  return {
    ...classified,
    id,
    linkedOpportunityId,
    linkedOpportunityName,
    linkedAccountName,
    linkStatus: 'Linked',
    createdAt,
    updatedAt: createdAt,
    storageMode: 'local',
  };
}

function writeLocalArray<T extends { id: string }>(key: string, records: T[]) {
  try {
    const existing = JSON.parse(window.localStorage.getItem(key) || '[]') as T[];
    const sampleIds = new Set(records.map((record) => record.id));
    window.localStorage.setItem(key, JSON.stringify([...records, ...existing.filter((item) => !sampleIds.has(item.id))]));
  } catch {
    window.localStorage.setItem(key, JSON.stringify(records));
  }
}

function writeLocalBrief(brief: PipelineDefenseBrief) {
  const currentStore = loadPipelineDefenseBriefStore();
  const nextStore = {
    activeBriefId: brief.id,
    briefs: [brief, ...currentStore.briefs.filter((item) => item.id !== brief.id)],
  };
  window.localStorage.setItem(MULTI_BRIEF_STORAGE_KEY, JSON.stringify(nextStore));
}

function isUserCreatedBrief(brief: PipelineDefenseBrief) {
  return !brief.title.toLowerCase().includes('sample pipeline defense brief');
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}
