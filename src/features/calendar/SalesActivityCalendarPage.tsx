import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import {
  canUseSalesActivityCloudStore,
  deleteSalesActivity,
  loadSalesActivities,
  updateSalesActivityLink,
  type SalesActivityRecord,
} from '../../services/salesActivityStore';
import { loadOpportunities, updateOpportunity, type CrmLiteOpportunity } from '../../services/opportunityStore';
import { ActivityOpportunityLinkPanel } from '../opportunities/ActivityOpportunityLinkPanel';
import { applyOpportunityUpdateSuggestion, type OpportunityUpdateSuggestion } from '../../utils/activityOpportunityLinker';
import type { SalesActivityType } from '../../utils/salesActivityClassifier';

type CalendarViewMode = 'day' | 'week' | 'month';

type ActivitySummary = {
  totalActivities: number;
  accountsTouched: number;
  opportunitiesTouched: number;
  followUps: number;
  objectionsCaptured: number;
  internalCoordinationItems: number;
  activitiesWithNextActions: number;
  overdueDueDates: number;
  activeDays: number;
  topActivityType: string;
  mostTouchedAccount: string;
  openNextActions: number;
};

const viewOptions: { value: CalendarViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const activityTypeTone: Record<SalesActivityType, string> = {
  'Customer meeting': 'border-blue-100 bg-blue-50 text-blue-700',
  'Follow-up': 'border-emerald-100 bg-emerald-50 text-emerald-700',
  'Demo / technical discussion': 'border-violet-100 bg-violet-50 text-violet-700',
  'Quote / proposal': 'border-indigo-100 bg-indigo-50 text-indigo-700',
  'Tender / procurement': 'border-cyan-100 bg-cyan-50 text-cyan-700',
  'Internal coordination': 'border-slate-100 bg-slate-50 text-slate-700',
  'Objection handling': 'border-amber-100 bg-amber-50 text-amber-700',
  'Admin / CRM': 'border-gray-200 bg-gray-50 text-gray-700',
  Other: 'border-gray-200 bg-white text-gray-700',
};

export function SalesActivityCalendarPage() {
  const { user, loading: authLoading } = useAuthContext();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<SalesActivityRecord | null>(null);
  const [copiedId, setCopiedId] = useState('');
  const [message, setMessage] = useState('');

  const storageLabel = canUseSalesActivityCloudStore(user?.id)
    ? 'Cloud sync enabled'
    : authLoading
      ? 'Checking account...'
      : user?.id
        ? 'Cloud unavailable - local calendar'
        : 'Local mode - sign in to sync';

  const refreshActivities = useCallback(async () => {
    setLoadingActivities(true);
    const [loaded, loadedOpportunities] = await Promise.all([
      loadSalesActivities(user?.id),
      loadOpportunities(user?.id),
    ]);
    setActivities(loaded);
    setOpportunities(loadedOpportunities);
    setLoadingActivities(false);
  }, [user?.id]);

  useEffect(() => {
    refreshActivities();
  }, [refreshActivities]);

  const range = useMemo(() => getCalendarRange(viewMode, anchorDate), [anchorDate, viewMode]);
  const visibleActivities = useMemo(() => {
    return activities
      .filter((activity) => activity.activityDate >= range.start && activity.activityDate <= range.end)
      .sort(sortByDateAscending);
  }, [activities, range.end, range.start]);
  const groupedActivities = useMemo(() => groupActivitiesByDate(visibleActivities), [visibleActivities]);
  const summary = useMemo(() => buildActivitySummary(visibleActivities), [visibleActivities]);
  const dateKeys = useMemo(() => getDateKeysForRange(range.start, range.end), [range.end, range.start]);

  const shiftPeriod = (direction: -1 | 1) => {
    setAnchorDate((date) => shiftAnchorDate(date, viewMode, direction));
  };

  const handleCopy = async (activity: SalesActivityRecord) => {
    const summaryText = formatActivitySummary(activity);
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopiedId(activity.id);
      window.setTimeout(() => setCopiedId(''), 1600);
    } catch {
      setMessage(summaryText);
    }
  };

  const handleDelete = async (activity: SalesActivityRecord) => {
    await deleteSalesActivity(activity, user?.id);
    setActivities((current) => current.filter((item) => item.id !== activity.id));
    setSelectedActivity(null);
    setMessage('Activity deleted.');
  };

  const handleLinkActivity = async (
    activity: SalesActivityRecord,
    opportunity: CrmLiteOpportunity,
    applyUpdates: boolean,
    updateSuggestion: OpportunityUpdateSuggestion
  ) => {
    const linkedActivity = await updateSalesActivityLink(activity, {
      linkedOpportunityId: opportunity.id,
      linkedOpportunityName: opportunity.opportunityName,
      linkedAccountName: opportunity.accountName,
      linkStatus: 'Linked',
    }, user?.id);
    setActivities((current) => current.map((item) => item.id === linkedActivity.id ? linkedActivity : item));
    setSelectedActivity(linkedActivity);

    if (applyUpdates) {
      const result = await updateOpportunity(opportunity, applyOpportunityUpdateSuggestion(opportunity, updateSuggestion), user?.id);
      setOpportunities((current) => current.map((item) => item.id === result.opportunity.id ? result.opportunity : item));
      setMessage(result.warning || 'Activity linked and opportunity updated.');
      return;
    }

    setMessage('Activity linked to opportunity.');
  };

  const handleUpdateLinkStatus = async (activity: SalesActivityRecord, linkStatus: SalesActivityRecord['linkStatus']) => {
    const updated = await updateSalesActivityLink(activity, { linkStatus }, user?.id);
    setActivities((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelectedActivity(updated);
    setMessage(linkStatus === 'Unlinked' ? 'Activity unlinked.' : 'Link suggestion ignored.');
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Sales Activity Calendar</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Review sales activity by day, week, and month.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Uses the activities captured in Daily Capture. No Google Calendar, Gmail, CRM sync, or AI integration is connected.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600">
            {storageLabel}
          </span>
          <Link
            to="/app/capture"
            className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
          >
            Capture activity
          </Link>
        </div>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-navy">Selected period</p>
            <h2 className="mt-1 text-2xl font-bold text-navy">{range.label}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
              {viewOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setViewMode(option.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    viewMode === option.value ? 'bg-navy text-white' : 'text-gray-600 hover:bg-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => shiftPeriod(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              aria-label={`Previous ${viewMode}`}
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
              onClick={() => shiftPeriod(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              aria-label={`Next ${viewMode}`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {viewMode === 'month' ? (
          <MonthlySummaryPanel summary={summary} />
        ) : (
          <WeeklySummaryPanel summary={summary} />
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">Activities</h2>
            <p className="mt-1 text-sm text-gray-500">Grouped by activity date.</p>
          </div>
          <button
            type="button"
            onClick={refreshActivities}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {message && (
          <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            {message}
          </p>
        )}

        {loadingActivities ? (
          <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-6 text-sm font-semibold text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading sales activities...
          </div>
        ) : visibleActivities.length === 0 ? (
          <EmptyCalendarState />
        ) : (
          <div className="space-y-4">
            {dateKeys.map((dateKey) => {
              const records = groupedActivities[dateKey] || [];
              if (records.length === 0 && viewMode !== 'day') return null;

              return (
                <section key={dateKey} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-gray-400" />
                    <h3 className="text-sm font-bold text-navy">{formatDateHeading(dateKey)}</h3>
                  </div>
                  {records.length === 0 ? (
                    <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">No activity captured on this day.</p>
                  ) : (
                    <div className="space-y-3">
                      {records.map((activity) => (
                        <ActivityCard
                          key={activity.id}
                          activity={activity}
                          copied={copiedId === activity.id}
                          onOpen={() => setSelectedActivity(activity)}
                          onCopy={() => handleCopy(activity)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </section>

      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          copied={copiedId === selectedActivity.id}
          onClose={() => setSelectedActivity(null)}
          onCopy={() => handleCopy(selectedActivity)}
          onDelete={() => handleDelete(selectedActivity)}
          opportunities={opportunities}
          onLink={(opportunity, applyUpdates, updateSuggestion) => handleLinkActivity(selectedActivity, opportunity, applyUpdates, updateSuggestion)}
          onIgnore={() => handleUpdateLinkStatus(selectedActivity, 'Ignored')}
          onUnlink={() => handleUpdateLinkStatus(selectedActivity, 'Unlinked')}
        />
      )}
    </div>
  );
}

function WeeklySummaryPanel({ summary }: { summary: ActivitySummary }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label="Activities" value={summary.totalActivities} />
      <MetricCard label="Accounts touched" value={summary.accountsTouched} />
      <MetricCard label="Opportunities" value={summary.opportunitiesTouched} />
      <MetricCard label="Follow-ups" value={summary.followUps} />
      <MetricCard label="Objections" value={summary.objectionsCaptured} tone={summary.objectionsCaptured > 0 ? 'amber' : 'green'} />
      <MetricCard label="Internal coordination" value={summary.internalCoordinationItems} />
      <MetricCard label="Next actions" value={summary.activitiesWithNextActions} tone={summary.activitiesWithNextActions > 0 ? 'blue' : 'amber'} />
      <MetricCard label="Overdue due dates" value={summary.overdueDueDates} tone={summary.overdueDueDates > 0 ? 'red' : 'green'} />
    </div>
  );
}

function MonthlySummaryPanel({ summary }: { summary: ActivitySummary }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label="Activities" value={summary.totalActivities} />
      <MetricCard label="Active days" value={summary.activeDays} />
      <MetricCard label="Accounts touched" value={summary.accountsTouched} />
      <MetricTextCard label="Top type" value={summary.topActivityType || 'None'} />
      <MetricTextCard label="Top account" value={summary.mostTouchedAccount || 'None'} />
      <MetricCard label="Open next actions" value={summary.openNextActions} tone={summary.openNextActions > 0 ? 'blue' : 'amber'} />
      <MetricCard label="Objection handling" value={summary.objectionsCaptured} tone={summary.objectionsCaptured > 0 ? 'amber' : 'green'} />
    </div>
  );
}

function MetricCard({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-2xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function MetricTextCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-sm font-bold leading-6 text-navy">{value}</p>
    </div>
  );
}

function ActivityCard({
  activity,
  copied,
  onOpen,
  onCopy,
}: {
  activity: SalesActivityRecord;
  copied: boolean;
  onOpen: () => void;
  onCopy: () => void;
}) {
  return (
    <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${activityTypeTone[activity.activityType]}`}>
              {activity.activityType}
            </span>
            <h4 className="mt-2 text-sm font-bold text-navy">{activity.summary}</h4>
          </div>
          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${
            activity.storageMode === 'cloud' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            {activity.storageMode === 'cloud' ? 'Cloud' : 'Local'}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-5 text-gray-600 sm:grid-cols-2">
          <Fact label="Account" value={activity.accountName || 'Not captured'} />
          <Fact label="Opportunity" value={activity.opportunityName || 'Not captured'} />
          <Fact label="Linked" value={activity.linkStatus === 'Linked' ? `${activity.linkedAccountName} / ${activity.linkedOpportunityName}` : activity.linkStatus} />
          <Fact label="Next action" value={activity.nextAction || 'No next action captured'} />
          <Fact label="Due date" value={activity.dueDate || 'No due date'} />
        </div>
      </button>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <TagList tags={activity.tags} />
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied' : 'Copy summary'}
        </button>
      </div>
    </article>
  );
}

function ActivityDetailModal({
  activity,
  copied,
  onClose,
  onCopy,
  onDelete,
  opportunities,
  onLink,
  onIgnore,
  onUnlink,
}: {
  activity: SalesActivityRecord;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  opportunities: CrmLiteOpportunity[];
  onLink: (opportunity: CrmLiteOpportunity, applyUpdates: boolean, updateSuggestion: OpportunityUpdateSuggestion) => void;
  onIgnore: () => void;
  onUnlink: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-4 py-8">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Activity detail</p>
            <h2 className="mt-2 text-xl font-bold text-navy">{activity.summary}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Close detail">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${activityTypeTone[activity.activityType]}`}>
            {activity.activityType}
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
            {activity.activityDate}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            activity.storageMode === 'cloud' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            {activity.storageMode === 'cloud' ? 'Cloud' : 'Local'}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label="Account" value={activity.accountName || 'Not captured'} />
          <Fact label="Opportunity" value={activity.opportunityName || 'Not captured'} />
          <Fact label="Next action" value={activity.nextAction || 'No next action captured'} />
          <Fact label="Due date" value={activity.dueDate || 'No due date'} />
          <Fact label="Created" value={new Date(activity.createdAt).toLocaleString()} />
          <Fact label="Updated" value={new Date(activity.updatedAt).toLocaleString()} />
          <Fact label="Linked opportunity" value={activity.linkStatus === 'Linked' ? `${activity.linkedAccountName} / ${activity.linkedOpportunityName}` : activity.linkStatus} />
        </div>

        {(activity.linkedAccountName || activity.accountName) && (
          <Link
            to={`/app/accounts?accountName=${encodeURIComponent(activity.linkedAccountName || activity.accountName)}`}
            className="mt-4 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue hover:border-brand-blue/40"
          >
            View Account Memory
          </Link>
        )}

        <div className="mt-5">
          <ActivityOpportunityLinkPanel
            activity={activity}
            opportunities={opportunities}
            onLink={onLink}
            onIgnore={onIgnore}
            onUnlink={onUnlink}
          />
        </div>

        <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Raw note</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-800">{activity.rawNote}</p>
        </div>

        <div className="mt-4">
          <TagList tags={activity.tags} />
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy summary'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" />
            Delete activity
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyCalendarState() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <p className="text-sm font-bold text-navy">No sales activities captured for this period.</p>
      <p className="mt-2 text-sm leading-6 text-gray-500">Capture activity to populate your sales calendar.</p>
      <Link
        to="/app/capture"
        className="mt-4 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
      >
        Capture activity
      </Link>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2 ring-1 ring-gray-100">
      <span className="font-bold text-gray-400">{label}: </span>
      <span className="font-semibold text-gray-700">{value}</span>
    </div>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-xs font-semibold text-gray-400">No tags</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-200">
          {tag}
        </span>
      ))}
    </div>
  );
}

function getCalendarRange(viewMode: CalendarViewMode, anchorDate: Date) {
  if (viewMode === 'day') {
    const start = toDateKey(anchorDate);
    return { start, end: start, label: formatPeriodLabel(start, start) };
  }

  if (viewMode === 'month') {
    const startDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const endDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    return {
      start: toDateKey(startDate),
      end: toDateKey(endDate),
      label: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(anchorDate),
    };
  }

  const startDate = startOfWeek(anchorDate);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  const start = toDateKey(startDate);
  const end = toDateKey(endDate);
  return { start, end, label: formatPeriodLabel(start, end) };
}

function shiftAnchorDate(anchorDate: Date, viewMode: CalendarViewMode, direction: -1 | 1) {
  const next = new Date(anchorDate);
  if (viewMode === 'day') next.setDate(next.getDate() + direction);
  if (viewMode === 'week') next.setDate(next.getDate() + direction * 7);
  if (viewMode === 'month') next.setMonth(next.getMonth() + direction);
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

function formatPeriodLabel(start: string, end: string) {
  if (start === end) return formatDateHeading(start);
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatShortDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateHeading(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDateKeysForRange(start: string, end: string) {
  const keys: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (cursor <= endDate) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function groupActivitiesByDate(activities: SalesActivityRecord[]) {
  return activities.reduce<Record<string, SalesActivityRecord[]>>((groups, activity) => {
    groups[activity.activityDate] = groups[activity.activityDate] || [];
    groups[activity.activityDate].push(activity);
    return groups;
  }, {});
}

function buildActivitySummary(activities: SalesActivityRecord[]): ActivitySummary {
  const accountCounts = countBy(activities.map(getActivityAccountName).filter(Boolean));
  const typeCounts = countBy(activities.map((activity) => activity.activityType));
  const activeDays = new Set(activities.map((activity) => activity.activityDate)).size;
  const today = new Date().toISOString().slice(0, 10);

  return {
    totalActivities: activities.length,
    accountsTouched: Object.keys(accountCounts).length,
    opportunitiesTouched: new Set(activities.map(getActivityOpportunityName).filter(Boolean)).size,
    followUps: activities.filter((activity) => activity.activityType === 'Follow-up').length,
    objectionsCaptured: activities.filter((activity) => activity.activityType === 'Objection handling').length,
    internalCoordinationItems: activities.filter((activity) => activity.activityType === 'Internal coordination').length,
    activitiesWithNextActions: activities.filter((activity) => Boolean(activity.nextAction)).length,
    overdueDueDates: activities.filter((activity) => activity.dueDate && activity.dueDate < today).length,
    activeDays,
    topActivityType: topCount(typeCounts),
    mostTouchedAccount: topCount(accountCounts),
    openNextActions: activities.filter((activity) => Boolean(activity.nextAction)).length,
  };
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function topCount(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function sortByDateAscending(a: SalesActivityRecord, b: SalesActivityRecord) {
  return `${a.activityDate}-${a.createdAt}`.localeCompare(`${b.activityDate}-${b.createdAt}`);
}

function formatActivitySummary(activity: SalesActivityRecord) {
  return [
    `Activity: ${activity.activityType}`,
    `Date: ${activity.activityDate}`,
    getActivityAccountName(activity) ? `Account: ${getActivityAccountName(activity)}` : '',
    getActivityOpportunityName(activity) ? `Opportunity: ${getActivityOpportunityName(activity)}` : '',
    `Summary: ${activity.summary}`,
    activity.nextAction ? `Next action: ${activity.nextAction}` : '',
    activity.dueDate ? `Due: ${activity.dueDate}` : '',
    activity.tags.length > 0 ? `Tags: ${activity.tags.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

function getActivityAccountName(activity: SalesActivityRecord) {
  return activity.linkStatus === 'Linked'
    ? activity.linkedAccountName || activity.accountName
    : activity.accountName;
}

function getActivityOpportunityName(activity: SalesActivityRecord) {
  return activity.linkStatus === 'Linked'
    ? activity.linkedOpportunityName || activity.opportunityName
    : activity.opportunityName;
}
