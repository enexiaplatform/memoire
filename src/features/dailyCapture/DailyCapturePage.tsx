import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clipboard, Copy, Loader2, Save, Trash2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { classifySalesActivity } from '../../utils/salesActivityClassifier';
import {
  canUseSalesActivityCloudStore,
  deleteSalesActivity,
  loadSalesActivities,
  saveSalesActivity,
  updateSalesActivityLink,
  type SalesActivityRecord,
} from '../../services/salesActivityStore';
import { loadOpportunities, updateOpportunity, type CrmLiteOpportunity } from '../../services/opportunityStore';
import { ActivityOpportunityLinkPanel } from '../opportunities/ActivityOpportunityLinkPanel';
import { applyOpportunityUpdateSuggestion, suggestOpportunityLinks, type OpportunityUpdateSuggestion } from '../../utils/activityOpportunityLinker';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function DailyCapturePage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [rawNote, setRawNote] = useState('');
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [lastSavedActivity, setLastSavedActivity] = useState<SalesActivityRecord | null>(null);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const storageLabel = useMemo(() => {
    if (authLoading) return 'Checking account...';
    if (canUseSalesActivityCloudStore(user?.id)) return 'Cloud capture enabled';
    if (isAuthenticated) return 'Cloud unavailable - saving locally';
    return 'Local capture mode';
  }, [authLoading, isAuthenticated, user?.id]);

  const preview = useMemo(() => {
    return rawNote.trim().length >= 8 ? classifySalesActivity(rawNote, activityDate) : null;
  }, [activityDate, rawNote]);

  const refreshActivities = async () => {
    setLoadingActivities(true);
    const [loaded, loadedOpportunities] = await Promise.all([
      loadSalesActivities(user?.id),
      loadOpportunities(user?.id),
    ]);
    setActivities(loaded);
    setOpportunities(loadedOpportunities);
    setLoadingActivities(false);
  };

  useEffect(() => {
    refreshActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSave = async () => {
    if (rawNote.trim().length < 8) {
      setMessage('Capture a short sales activity first.');
      setSaveState('error');
      return;
    }

    setSaveState('saving');
    setMessage('Saving activity...');
    const classified = classifySalesActivity(rawNote, activityDate);
    const result = await saveSalesActivity(classified, user?.id);
    setActivities((current) => [result.record, ...current.filter((item) => item.id !== result.record.id)]);
    setLastSavedActivity(result.record);
    setRawNote('');
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Saved to cloud.' : 'Saved locally.'));
  };

  const handleDelete = async (activity: SalesActivityRecord) => {
    await deleteSalesActivity(activity, user?.id);
    setActivities((current) => current.filter((item) => item.id !== activity.id));
    if (lastSavedActivity?.id === activity.id) setLastSavedActivity(null);
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
    if (lastSavedActivity?.id === linkedActivity.id) setLastSavedActivity(linkedActivity);

    if (applyUpdates) {
      const result = await updateOpportunity(opportunity, applyOpportunityUpdateSuggestion(opportunity, updateSuggestion), user?.id);
      setOpportunities((current) => current.map((item) => item.id === result.opportunity.id ? result.opportunity : item));
      setMessage(result.warning || 'Activity linked and opportunity updated.');
      setSaveState(result.warning ? 'error' : 'saved');
      return;
    }

    setMessage('Activity linked to opportunity.');
    setSaveState('saved');
  };

  const handleIgnoreActivityLink = async (activity: SalesActivityRecord) => {
    const updated = await updateSalesActivityLink(activity, { linkStatus: 'Ignored' }, user?.id);
    setActivities((current) => current.map((item) => item.id === updated.id ? updated : item));
    if (lastSavedActivity?.id === updated.id) setLastSavedActivity(updated);
    setMessage('Link suggestion ignored.');
    setSaveState('saved');
  };

  const handleUnlinkActivity = async (activity: SalesActivityRecord) => {
    const updated = await updateSalesActivityLink(activity, { linkStatus: 'Unlinked' }, user?.id);
    setActivities((current) => current.map((item) => item.id === updated.id ? updated : item));
    if (lastSavedActivity?.id === updated.id) setLastSavedActivity(updated);
    setMessage('Activity unlinked.');
    setSaveState('saved');
  };

  const handleCopy = async (activity: SalesActivityRecord) => {
    const summary = formatActivitySummary(activity);
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedId(activity.id);
      window.setTimeout(() => setCopiedId(''), 1600);
    } catch {
      setMessage(summary);
      setSaveState('error');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Daily Capture</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">What happened today?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Capture sales activity in natural language. Memoire classifies it locally into structured activity records.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
          canUseSalesActivityCloudStore(user?.id)
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-amber-100 bg-amber-50 text-amber-700'
        }`}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          {storageLabel}
        </span>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
          <label className="block">
            <span className="text-sm font-bold text-navy">Activity note</span>
            <textarea
              value={rawNote}
              onChange={(event) => {
                setRawNote(event.target.value);
                setSaveState('idle');
                setMessage('');
              }}
              placeholder="Example: Met TV Pharm today. Need to clarify tender timeline next week."
              className="mt-2 min-h-[150px] w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            />
          </label>

          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-navy">Activity date</span>
              <input
                type="date"
                value={activityDate}
                onChange={(event) => setActivityDate(event.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
              />
            </label>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Activity
            </button>
            {message && (
              <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {message}
              </p>
            )}
          </div>
        </div>

        {preview && (
          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Structured preview</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <PreviewFact label="Type" value={preview.activityType} />
              <PreviewFact label="Account" value={preview.accountName || 'Not captured'} />
              <PreviewFact label="Next action" value={preview.nextAction || 'Not captured'} />
            </div>
            <p className="mt-3 text-sm leading-6 text-blue-950">{preview.summary}</p>
            {preview.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {preview.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-800 ring-1 ring-blue-100">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {opportunities.length > 0 && (
              <PreviewOpportunitySuggestions preview={previewToRecord(preview)} opportunities={opportunities} />
            )}
          </div>
        )}
      </section>

      {lastSavedActivity && (
        <ActivityOpportunityLinkPanel
          activity={lastSavedActivity}
          opportunities={opportunities}
          onLink={(opportunity, applyUpdates, updateSuggestion) => handleLinkActivity(lastSavedActivity, opportunity, applyUpdates, updateSuggestion)}
          onIgnore={() => handleIgnoreActivityLink(lastSavedActivity)}
          onUnlink={() => handleUnlinkActivity(lastSavedActivity)}
        />
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">Recent activities</h2>
            <p className="mt-1 text-sm text-gray-500">Your latest structured daily sales captures.</p>
          </div>
          <button
            type="button"
            onClick={refreshActivities}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {loadingActivities ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-6 text-sm font-semibold text-gray-500">
            Loading activities...
          </div>
        ) : activities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
            <Clipboard className="mx-auto h-6 w-6 text-gray-400" />
            <p className="mt-3 text-sm font-bold text-navy">No activities captured yet.</p>
            <p className="mt-1 text-sm text-gray-500">
              Try: "Met TV Pharm today. Need to clarify tender timeline next week."
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                copied={copiedId === activity.id}
                onCopy={() => handleCopy(activity)}
                onDelete={() => handleDelete(activity)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-blue-950">{value}</p>
    </div>
  );
}

function ActivityCard({
  activity,
  copied,
  onCopy,
  onDelete,
}: {
  activity: SalesActivityRecord;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand-blue">
              {activity.activityType}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-600">
              <CalendarDays className="h-3.5 w-3.5" />
              {activity.activityDate}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              activity.storageMode === 'cloud' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {activity.storageMode === 'cloud' ? 'Cloud' : 'Local'}
            </span>
          </div>
          <h3 className="mt-3 text-base font-bold text-navy">{activity.summary}</h3>
          <p className="mt-2 text-xs font-bold text-gray-500">
            Link: {activity.linkStatus === 'Linked'
              ? `${activity.linkedAccountName || 'Account'} / ${activity.linkedOpportunityName || 'Opportunity'}`
              : activity.linkStatus}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <ActivityFact label="Account" value={activity.accountName || 'Not captured'} />
            <ActivityFact label="Opportunity" value={activity.opportunityName || 'Not captured'} />
            <ActivityFact label="Next action" value={activity.nextAction || 'Not captured'} />
            <ActivityFact label="Due date" value={activity.dueDate || 'Not captured'} />
          </div>
          {activity.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activity.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function PreviewOpportunitySuggestions({ preview, opportunities }: { preview: SalesActivityRecord; opportunities: CrmLiteOpportunity[] }) {
  const suggestions = suggestOpportunityLinks(preview, opportunities);
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-blue-100 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Likely opportunity links</p>
      <div className="mt-2 space-y-2">
        {suggestions.slice(0, 3).map((suggestion) => (
          <div key={suggestion.opportunity.id} className="rounded-lg bg-blue-50/70 px-3 py-2 text-sm">
            <p className="font-bold text-blue-950">{suggestion.opportunity.accountName} / {suggestion.opportunity.opportunityName}</p>
            <p className="mt-1 text-xs font-semibold text-blue-700">{suggestion.confidence} confidence | {suggestion.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function previewToRecord(preview: ReturnType<typeof classifySalesActivity>): SalesActivityRecord {
  return {
    ...preview,
    id: 'preview',
    linkedOpportunityId: '',
    linkedOpportunityName: '',
    linkedAccountName: '',
    linkStatus: 'Unlinked',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    storageMode: 'local',
  };
}

function ActivityFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <p className="mt-1 font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function formatActivitySummary(activity: SalesActivityRecord) {
  return [
    `Activity: ${activity.activityType}`,
    `Date: ${activity.activityDate}`,
    activity.accountName ? `Account: ${activity.accountName}` : '',
    activity.opportunityName ? `Opportunity: ${activity.opportunityName}` : '',
    `Summary: ${activity.summary}`,
    activity.nextAction ? `Next action: ${activity.nextAction}` : '',
    activity.dueDate ? `Due: ${activity.dueDate}` : '',
    activity.tags.length > 0 ? `Tags: ${activity.tags.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}
