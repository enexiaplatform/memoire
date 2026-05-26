import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Copy, Loader2, RotateCcw } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  canUseSalesActivityCloudStore,
  filterSalesActivitiesByPeriod,
  loadSalesActivities,
  type SalesActivityRecord,
} from '../../services/salesActivityStore';
import { loadObjections, type ObjectionRecord } from '../../services/objectionStore';
import { loadOpportunities, type CrmLiteOpportunity } from '../../services/opportunityStore';
import { loadStakeholders, type StakeholderRecord } from '../../services/stakeholderStore';
import {
  generatePipelineOpportunityActions,
  type OpportunityRecommendedAction,
} from '../../utils/opportunityActionPlan';
import {
  generateMonthlySalesRecap,
  generateSalesRecapMarkdown,
  generateWeeklySalesRecap,
  type SalesActivityRecap,
  type SalesRecapPeriod,
  type SalesRecapRange,
} from '../../utils/salesActivityRecap';

const periodOptions: { value: SalesRecapPeriod; label: string }[] = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

export function SalesReviewsPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [periodType, setPeriodType] = useState<SalesRecapPeriod>('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [objections, setObjections] = useState<ObjectionRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [stakeholders, setStakeholders] = useState<StakeholderRecord[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [recap, setRecap] = useState<SalesActivityRecap | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const period = useMemo(() => getRecapRange(periodType, anchorDate), [anchorDate, periodType]);
  const periodActivities = useMemo(
    () => filterSalesActivitiesByPeriod(activities, period),
    [activities, period]
  );
  const periodObjections = useMemo(
    () => objections.filter((objection) => isObjectionInPeriod(objection, period)),
    [objections, period]
  );
  const recommendedDealActions = useMemo(
    () => buildPeriodDealActions({
      opportunities,
      stakeholders,
      objections: periodObjections,
      activities: periodActivities,
      period,
    }),
    [opportunities, stakeholders, periodObjections, periodActivities, period]
  );
  const refreshActivities = useCallback(async () => {
    setLoadingActivities(true);
    const [loaded, loadedObjections, loadedOpportunities, loadedStakeholders] = await Promise.all([
      loadSalesActivities(dataUserId),
      loadObjections(dataUserId),
      loadOpportunities(dataUserId),
      loadStakeholders(dataUserId),
    ]);
    setActivities(loaded);
    setObjections(loadedObjections);
    setOpportunities(loadedOpportunities);
    setStakeholders(loadedStakeholders);
    setLoadingActivities(false);
  }, [dataUserId]);

  useEffect(() => {
    refreshActivities();
  }, [refreshActivities]);

  useEffect(() => {
    setRecap(null);
    setCopyMessage('');
  }, [periodType, period.start, period.end]);

  const generateRecap = () => {
    const nextRecap = periodType === 'week'
      ? generateWeeklySalesRecap(periodActivities, period)
      : generateMonthlySalesRecap(periodActivities, period);
    setRecap(nextRecap);
  };

  const copyRecap = async () => {
    if (!recap) return;
    const markdown = generateSalesRecapMarkdown(recap);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyMessage('Copied recap.');
    } catch {
      setCopyMessage(markdown);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Sales Reviews</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Weekly and monthly recap from your captured activities.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Generate a deterministic review from Daily Capture. No Gmail, Google Calendar, CRM, or AI integration is connected.
          </p>
        </div>
        <DataModePill
          compact
          isLoading={authLoading}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          cloudAvailable={canUseSalesActivityCloudStore(dataUserId)}
          hasSampleData={sampleDataActive}
        />
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-navy">Review period</p>
            <h2 className="mt-1 text-2xl font-bold text-navy">{period.label}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriodType(option.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    periodType === option.value ? 'bg-navy text-white' : 'text-gray-600 hover:bg-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAnchorDate((date) => shiftRecapAnchor(date, periodType, -1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate(new Date())}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Today
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate((date) => shiftRecapAnchor(date, periodType, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generateRecap}
            disabled={loadingActivities}
            className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {loadingActivities ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate {periodType === 'week' ? 'Weekly' : 'Monthly'} Recap
          </button>
          <button
            type="button"
            onClick={refreshActivities}
            className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            Refresh activities
          </button>
          <span className="text-sm font-semibold text-gray-500">
            {periodActivities.length} activities in this period
          </span>
        </div>
      </section>

      {periodObjections.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold text-amber-950">Objection movement in this period</p>
              <p className="mt-1 text-sm text-amber-800">
                {periodObjections.filter((item) => item.status === 'Open').length} open, {periodObjections.filter((item) => item.status === 'Resolved').length} resolved, {periodObjections.filter((item) => item.impact === 'High').length} high-impact.
              </p>
            </div>
            <Link to="/app/objections" className="inline-flex w-fit rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
              Open Objection Ledger
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {periodObjections.slice(0, 4).map((objection) => (
              <div key={objection.id} className="rounded-lg bg-white p-3 ring-1 ring-amber-100">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{objection.accountName || 'No account'} / {objection.opportunityName || 'No opportunity'}</p>
                <p className="mt-1 text-sm font-bold text-navy">{objection.objectionText}</p>
                <p className="mt-1 text-xs font-semibold text-gray-500">{objection.objectionType} | {objection.impact} | {objection.status}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {recommendedDealActions.length > 0 && (
        <RecommendedDealActionsPanel actions={recommendedDealActions} />
      )}

      {loadingActivities ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading activities...
        </div>
      ) : periodActivities.length === 0 ? (
        <EmptyReviewsState />
      ) : recap ? (
        <RecapContent recap={recap} onCopy={copyRecap} copyMessage={copyMessage} activities={periodActivities} />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm font-bold text-navy">Activities are ready for review.</p>
          <p className="mt-2 text-sm text-gray-500">Generate a recap to see insights, next actions, objections, and follow-ups.</p>
        </div>
      )}
    </div>
  );
}

function RecapContent({
  recap,
  onCopy,
  copyMessage,
  activities,
}: {
  recap: SalesActivityRecap;
  onCopy: () => void;
  copyMessage: string;
  activities: SalesActivityRecord[];
}) {
  const activityByDay = groupActivitiesByDate(activities);
  const accountCounts = recap.topAccounts;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-navy">{capitalize(recap.periodType)} recap</p>
            <h2 className="mt-1 text-2xl font-bold text-navy">{recap.periodLabel}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {copyMessage && <span className="text-xs font-bold text-emerald-700">{copyMessage === 'Copied recap.' ? copyMessage : 'Copy failed - recap shown in message.'}</span>}
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Recap
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <MetricCard label="Activities" value={recap.totalActivities} />
          <MetricCard label="Active days" value={recap.activeDays} />
          <MetricCard label="Accounts" value={recap.accountsTouched.length} />
          <MetricCard label="Opportunities" value={recap.opportunitiesTouched.length} />
          <MetricCard label="Next actions" value={recap.openNextActions.length} tone={recap.openNextActions.length > 0 ? 'blue' : 'amber'} />
          <MetricCard label="Objections" value={recap.objectionsCaptured.length} tone={recap.objectionsCaptured.length > 0 ? 'amber' : 'green'} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Recap insights" items={recap.insights} tone="blue" />
        <Panel title="Recommended actions" items={recap.recommendedActions} tone="amber" />
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <BreakdownPanel title="By activity type" data={recap.activityTypeBreakdown} />
        <AccountBreakdownPanel accounts={accountCounts} />
        <BreakdownPanel title="By day" data={Object.fromEntries(Object.entries(activityByDay).map(([day, items]) => [day, items.length]))} />
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <NextActionsPanel actions={recap.openNextActions} />
        <ObjectionsPanel objections={recap.objectionsCaptured} />
        <FollowUpsPanel followUps={recap.followUpsCaptured} />
      </section>
    </div>
  );
}

function RecommendedDealActionsPanel({ actions }: { actions: OpportunityRecommendedAction[] }) {
  return (
    <section className="rounded-lg border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-950">Recommended Deal Actions</p>
          <p className="mt-1 text-sm text-blue-800">
            Next-best-actions from opportunities touched in this period, related objections, and captured follow-ups.
          </p>
        </div>
        <Link to="/app/opportunities" className="inline-flex w-fit rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          Open Opportunities
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {actions.slice(0, 6).map((action) => (
          <div key={action.id} className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${action.priority === 'High' ? 'bg-red-50 text-red-700' : action.priority === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {action.priority}
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand-blue">{action.sourceType}</span>
              {action.suggestedDueDate && <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-600">Due {action.suggestedDueDate}</span>}
            </div>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{action.accountName} / {action.opportunityName}</p>
            <p className="mt-1 text-sm font-bold text-navy">{action.title}</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">{action.reason}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue' | 'green' | 'amber' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-2xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function Panel({ title, items, tone }: { title: string; items: string[]; tone: 'blue' | 'amber' }) {
  const toneClass = tone === 'blue' ? 'border-blue-100 bg-blue-50/70 text-blue-950' : 'border-amber-100 bg-amber-50/70 text-amber-950';
  return (
    <section className={`rounded-lg border p-5 ${toneClass}`}>
      <h3 className="text-sm font-bold text-navy">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </section>
  );
}

function BreakdownPanel({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-navy">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No data captured.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {entries.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="font-semibold text-gray-700">{label}</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-200">{count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AccountBreakdownPanel({ accounts }: { accounts: { accountName: string; count: number }[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-navy">By account</h3>
      {accounts.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No account names captured.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {accounts.map((item) => (
            <div key={item.accountName} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="font-semibold text-gray-700">{item.accountName}</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-200">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NextActionsPanel({ actions }: { actions: SalesActivityRecap['openNextActions'] }) {
  return (
    <ListPanel
      title="Open Next Actions"
      empty="No open next actions captured."
      items={actions.map((item) => ({
        id: item.activityId,
        title: item.nextAction,
        detail: [item.accountName, item.opportunityName || 'Unlinked', item.dueDate ? `Due ${item.dueDate}` : ''].filter(Boolean).join(' | '),
      }))}
    />
  );
}

function ObjectionsPanel({ objections }: { objections: SalesActivityRecap['objectionsCaptured'] }) {
  return (
    <ListPanel
      title="Objections Captured"
      empty="No objection-related activities captured."
      items={objections.map((item) => ({
        id: item.activityId,
        title: item.summary,
        detail: [item.accountName, item.opportunityName || 'Unlinked', item.nextAction ? `Next: ${item.nextAction}` : ''].filter(Boolean).join(' | '),
      }))}
    />
  );
}

function FollowUpsPanel({ followUps }: { followUps: SalesActivityRecap['followUpsCaptured'] }) {
  return (
    <ListPanel
      title="Follow-ups Captured"
      empty="No follow-up activities captured."
      items={followUps.map((item) => ({
        id: item.activityId,
        title: item.summary,
        detail: [item.accountName, item.opportunityName || 'Unlinked', item.nextAction ? `Next: ${item.nextAction}` : ''].filter(Boolean).join(' | '),
      }))}
    />
  );
}

function ListPanel({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { id: string; title: string; detail: string }[];
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-navy">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-sm font-semibold text-gray-800">{item.title}</p>
              {item.detail && <p className="mt-1 text-xs font-semibold text-gray-500">{item.detail}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyReviewsState() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <p className="text-sm font-bold text-navy">No activities captured for this period.</p>
      <p className="mt-2 text-sm leading-6 text-gray-500">Capture activity before generating a recap.</p>
      <Link to="/app/capture" className="mt-4 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
        Capture activity
      </Link>
    </div>
  );
}

function getRecapRange(periodType: SalesRecapPeriod, anchorDate: Date): SalesRecapRange {
  if (periodType === 'month') {
    const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    return {
      start: toDateKey(start),
      end: toDateKey(end),
      label: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(anchorDate),
    };
  }

  const start = startOfWeek(anchorDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: toDateKey(start),
    end: toDateKey(end),
    label: `${formatShortDate(toDateKey(start))} - ${formatShortDate(toDateKey(end))}`,
  };
}

function shiftRecapAnchor(anchorDate: Date, periodType: SalesRecapPeriod, direction: -1 | 1) {
  const next = new Date(anchorDate);
  if (periodType === 'week') next.setDate(next.getDate() + direction * 7);
  if (periodType === 'month') next.setMonth(next.getMonth() + direction);
  return next;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const daysFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysFromMonday);
  return start;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isObjectionInPeriod(objection: ObjectionRecord, period: SalesRecapRange) {
  const createdDate = objection.createdAt.slice(0, 10);
  const resolvedDate = objection.resolvedAt ? objection.resolvedAt.slice(0, 10) : '';
  return (
    (createdDate >= period.start && createdDate <= period.end) ||
    (resolvedDate >= period.start && resolvedDate <= period.end)
  );
}

function buildPeriodDealActions({
  opportunities,
  stakeholders,
  objections,
  activities,
  period,
}: {
  opportunities: CrmLiteOpportunity[];
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  activities: SalesActivityRecord[];
  period: SalesRecapRange;
}) {
  const touchedOpportunityIds = new Set(activities.map((activity) => activity.linkedOpportunityId).filter(Boolean));
  objections.forEach((objection) => {
    if (objection.opportunityId) touchedOpportunityIds.add(objection.opportunityId);
  });

  const touchedNames = new Set([
    ...activities.map((activity) => `${normalize(activity.linkedAccountName || activity.accountName)}::${normalize(activity.linkedOpportunityName || activity.opportunityName)}`),
    ...objections.map((objection) => `${normalize(objection.accountName)}::${normalize(objection.opportunityName)}`),
  ]);

  const periodOpportunities = opportunities.filter((opportunity) => {
    const updatedDate = opportunity.updatedAt.slice(0, 10);
    const nameKey = `${normalize(opportunity.accountName)}::${normalize(opportunity.opportunityName)}`;
    return (
      opportunity.status === 'Active' &&
      (
        touchedOpportunityIds.has(opportunity.id) ||
        touchedNames.has(nameKey) ||
        (updatedDate >= period.start && updatedDate <= period.end)
      )
    );
  });

  return generatePipelineOpportunityActions({
    opportunities: periodOpportunities,
    stakeholders,
    objections,
    activities,
    limit: 6,
  });
}

function groupActivitiesByDate(activities: SalesActivityRecord[]) {
  return activities.reduce<Record<string, SalesActivityRecord[]>>((groups, activity) => {
    groups[activity.activityDate] = groups[activity.activityDate] || [];
    groups[activity.activityDate].push(activity);
    return groups;
  }, {});
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
