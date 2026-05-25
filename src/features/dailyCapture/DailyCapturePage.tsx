import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, CalendarDays, CheckCircle2, Clipboard, Copy, Loader2, Save, Sparkles, Trash2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { classifySalesActivity, type ClassifiedSalesActivity, type SalesActivityType } from '../../utils/salesActivityClassifier';
import {
  canUseSalesActivityCloudStore,
  deleteSalesActivity,
  loadSalesActivities,
  saveSalesActivity,
  updateSalesActivityLink,
  type SalesActivityRecord,
} from '../../services/salesActivityStore';
import { loadOpportunities, updateOpportunity, type CrmLiteOpportunity } from '../../services/opportunityStore';
import { loadAccounts, type AccountMemoryRecord } from '../../services/accountStore';
import { CaptureAiProviderError, getActiveCaptureAiProvider, type CaptureAiSuggestion } from '../../services/captureAiProvider';
import { ActivityOpportunityLinkPanel } from '../opportunities/ActivityOpportunityLinkPanel';
import { applyOpportunityUpdateSuggestion, suggestOpportunityLinks, type OpportunityUpdateSuggestion } from '../../utils/activityOpportunityLinker';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type AiState = 'idle' | 'loading' | 'ready' | 'error';

const activityTypes: SalesActivityType[] = [
  'Customer meeting',
  'Follow-up',
  'Demo / technical discussion',
  'Quote / proposal',
  'Tender / procurement',
  'Internal coordination',
  'Objection handling',
  'Admin / CRM',
  'Other',
];

export function DailyCapturePage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [rawNote, setRawNote] = useState('');
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activities, setActivities] = useState<SalesActivityRecord[]>([]);
  const [opportunities, setOpportunities] = useState<CrmLiteOpportunity[]>([]);
  const [accounts, setAccounts] = useState<AccountMemoryRecord[]>([]);
  const [lastSavedActivity, setLastSavedActivity] = useState<SalesActivityRecord | null>(null);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [aiState, setAiState] = useState<AiState>('idle');
  const [message, setMessage] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<CaptureAiSuggestion | null>(null);
  const [structuredDraft, setStructuredDraft] = useState<ClassifiedSalesActivity | null>(null);
  const [copiedId, setCopiedId] = useState('');
  const aiProvider = useMemo(() => getActiveCaptureAiProvider(), []);
  const aiConfigured = aiProvider.isConfigured();

  const storageLabel = useMemo(() => {
    if (authLoading) return 'Checking account...';
    if (canUseSalesActivityCloudStore(user?.id)) return 'Cloud capture enabled';
    if (isAuthenticated) return 'Cloud unavailable - saving locally';
    return 'Local capture mode';
  }, [authLoading, isAuthenticated, user?.id]);

  const localPreview = useMemo(() => {
    return rawNote.trim().length >= 8 ? classifySalesActivity(rawNote, activityDate, { accounts, opportunities }) : null;
  }, [accounts, activityDate, opportunities, rawNote]);
  const preview = structuredDraft || localPreview;

  const refreshActivities = async () => {
    setLoadingActivities(true);
    const [loaded, loadedOpportunities, loadedAccounts] = await Promise.all([
      loadSalesActivities(user?.id),
      loadOpportunities(user?.id),
      loadAccounts(user?.id),
    ]);
    setActivities(loaded);
    setOpportunities(loadedOpportunities);
    setAccounts(loadedAccounts);
    setLoadingActivities(false);
  };

  useEffect(() => {
    refreshActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSave = async () => {
    if (rawNote.trim().length < 8 || !preview) {
      setMessage('Capture a short sales activity first.');
      setSaveState('error');
      return;
    }

    setSaveState('saving');
    setMessage('Saving activity...');
    const classified: ClassifiedSalesActivity = {
      ...preview,
      rawNote: rawNote.trim(),
      activityDate,
      tags: normalizeTags(preview.tags),
    };
    const result = await saveSalesActivity(classified, user?.id);
    setActivities((current) => [result.record, ...current.filter((item) => item.id !== result.record.id)]);
    setLastSavedActivity(result.record);
    setRawNote('');
    setStructuredDraft(null);
    setAiSuggestion(null);
    setAiMessage('');
    setAiState('idle');
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Saved to cloud.' : 'Saved locally.'));
  };

  const handleClassifyWithAi = async () => {
    if (!aiConfigured) {
      setAiState('error');
      setAiMessage('AI Assist unavailable - using local rules.');
      return;
    }
    if (rawNote.trim().length < 8) {
      setAiState('error');
      setAiMessage('Capture a short sales activity first.');
      return;
    }

    setAiState('loading');
    setAiMessage('Classifying with AI Assist...');
    try {
      const suggestion = await aiProvider.classifyCapture({
        rawNote: rawNote.trim(),
        activityDate,
        opportunities: opportunities.map((opportunity) => ({
          id: opportunity.id,
          accountName: opportunity.accountName,
          opportunityName: opportunity.opportunityName,
          stage: opportunity.stage,
          productOrSolution: opportunity.productOrSolution,
        })),
        accounts: accounts.map((account) => ({
          id: account.id,
          accountName: account.accountName,
          segment: account.segment,
          industry: account.industry,
        })),
      });
      setAiSuggestion(suggestion);
      setAiState('ready');
      setAiMessage('AI suggestion ready. Review it before accepting.');
    } catch (error) {
      setAiState('error');
      setAiMessage(error instanceof CaptureAiProviderError && error.status === 503
        ? 'AI Assist is not configured on the server. Local rules are still available.'
        : 'AI Assist failed. Local rules are still available.');
    }
  };

  const acceptAiSuggestion = () => {
    if (!aiSuggestion) return;
    setStructuredDraft(aiSuggestionToClassified(aiSuggestion, rawNote, activityDate));
    setAiMessage('AI suggestion applied to the editable structured preview.');
  };

  const updateDraft = <Key extends keyof ClassifiedSalesActivity>(key: Key, value: ClassifiedSalesActivity[Key]) => {
    if (!preview) return;
    setStructuredDraft({
      ...preview,
      rawNote: rawNote.trim(),
      activityDate,
      [key]: value,
    });
    setSaveState('idle');
    setMessage('');
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
                setStructuredDraft(null);
                setAiSuggestion(null);
                setAiState('idle');
                setAiMessage('');
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
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-brand-blue" />
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  {aiConfigured ? `AI Assist: ${aiProvider.label}` : 'AI Assist unavailable'}
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {aiConfigured ? 'Optional AI classification. You review before saving.' : 'Using local rules until an AI provider is configured.'}
              </p>
              {aiConfigured && (
                <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  AI Assist sends this note to your configured server-side AI endpoint. Do not use it for confidential customer data unless your provider is approved.
                </p>
              )}
              <button
                type="button"
                onClick={handleClassifyWithAi}
                disabled={!aiConfigured || aiState === 'loading' || rawNote.trim().length < 8}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiState === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiState === 'loading' ? 'Classifying...' : 'Classify with AI'}
              </button>
            </div>
            {message && (
              <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {message}
              </p>
            )}
            {aiMessage && (
              <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                aiState === 'ready' ? 'bg-blue-50 text-blue-700' : aiState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'
              }`}>
                {aiMessage}
              </p>
            )}
          </div>
        </div>

        {aiSuggestion && (
          <AiSuggestionPanel suggestion={aiSuggestion} onAccept={acceptAiSuggestion} />
        )}

        {preview && (
          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Structured preview</p>
              <p className="text-xs font-semibold text-blue-700">
                {structuredDraft ? 'Editable draft' : 'Local rules preview'}
              </p>
            </div>
            <StructuredPreviewEditor preview={preview} onChange={updateDraft} />
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

function AiSuggestionPanel({ suggestion, onAccept }: { suggestion: CaptureAiSuggestion; onAccept: () => void }) {
  return (
    <section className="mt-5 rounded-lg border border-violet-100 bg-violet-50/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-700">AI suggestion</p>
          <h3 className="mt-1 text-base font-bold text-violet-950">{suggestion.summary}</h3>
          <p className="mt-2 text-sm font-semibold text-violet-800">
            {suggestion.activityType} | {suggestion.confidence} confidence
          </p>
        </div>
        <button
          type="button"
          onClick={onAccept}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-violet-700 px-4 py-2 text-sm font-bold text-white"
        >
          <CheckCircle2 className="h-4 w-4" />
          Accept suggestion
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <AiFact label="Account" value={suggestion.accountName || 'Not captured'} />
        <AiFact label="Opportunity" value={suggestion.opportunityName || 'Not captured'} />
        <AiFact label="Contact" value={suggestion.contactName || suggestion.stakeholderName || 'Not captured'} />
        <AiFact label="Next action" value={suggestion.nextAction || 'Not captured'} />
        <AiFact label="Due date" value={suggestion.dueDate || 'Not captured'} />
        <AiFact label="Buying signals" value={suggestion.buyingSignals?.length ? suggestion.buyingSignals.join(', ') : 'None'} />
        <AiFact label="Competitors" value={suggestion.competitors?.length ? suggestion.competitors.join(', ') : 'None'} />
        <AiFact label="Timeline" value={suggestion.timelineSignals?.length ? suggestion.timelineSignals.join(', ') : 'None'} />
        <AiFact label="Tags" value={suggestion.tags.length ? suggestion.tags.join(', ') : 'None'} />
      </div>
      {suggestion.reasoning.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm leading-6 text-violet-900">
          {suggestion.reasoning.map((reason) => <li key={reason}>- {reason}</li>)}
        </ul>
      )}
    </section>
  );
}

function AiFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-violet-100">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-violet-950">{value}</p>
    </div>
  );
}

function StructuredPreviewEditor({
  preview,
  onChange,
}: {
  preview: ClassifiedSalesActivity;
  onChange: <Key extends keyof ClassifiedSalesActivity>(key: Key, value: ClassifiedSalesActivity[Key]) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className="block rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100">
        <span className="text-xs font-bold uppercase tracking-wide text-blue-500">Type</span>
        <select
          value={preview.activityType}
          onChange={(event) => onChange('activityType', event.target.value as SalesActivityType)}
          className="mt-1 w-full bg-transparent text-sm font-semibold text-blue-950 outline-none"
        >
          {activityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      <PreviewInput label="Account" value={preview.accountName} placeholder="Not captured" onChange={(value) => onChange('accountName', value)} />
      <PreviewInput label="Opportunity" value={preview.opportunityName} placeholder="Not captured" onChange={(value) => onChange('opportunityName', value)} />
      <PreviewInput label="Contact" value={preview.contactName || ''} placeholder="Not captured" onChange={(value) => onChange('contactName', value)} />
      <PreviewInput label="Stakeholder" value={preview.stakeholderName || ''} placeholder="Not captured" onChange={(value) => onChange('stakeholderName', value)} />
      <PreviewInput label="Stakeholder role" value={preview.stakeholderRole || ''} placeholder="Optional role" onChange={(value) => onChange('stakeholderRole', value)} />
      <PreviewInput label="Due date" value={preview.dueDate} placeholder="YYYY-MM-DD" onChange={(value) => onChange('dueDate', value)} />
      <PreviewTextArea label="Summary" value={preview.summary} onChange={(value) => onChange('summary', value)} />
      <PreviewTextArea label="Next action" value={preview.nextAction} onChange={(value) => onChange('nextAction', value)} />
      {preview.nextActions && preview.nextActions.length > 0 && (
        <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100 md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wide text-blue-500">Next actions detected</span>
          <div className="mt-2 space-y-2">
            {preview.nextActions.map((action, index) => (
              <div key={`${action.title}-${index}`} className="rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-950">
                {index + 1}. {action.title}
                {action.dueDate ? <span className="text-blue-700"> | Due {action.dueDate}</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}
      <PreviewInput
        label="Competitors"
        value={(preview.competitors || []).join(', ')}
        placeholder="STERIS"
        onChange={(value) => onChange('competitors', parseList(value))}
      />
      <PreviewInput
        label="Buying signals"
        value={(preview.buyingSignals || []).join(', ')}
        placeholder="Budget approved"
        onChange={(value) => onChange('buyingSignals', parseList(value))}
      />
      <PreviewInput
        label="Risks"
        value={(preview.risks || []).join(', ')}
        placeholder="Competitor still active"
        onChange={(value) => onChange('risks', parseList(value))}
      />
      <PreviewInput
        label="Timeline signals"
        value={(preview.timelineSignals || []).join(', ')}
        placeholder="Next quarter"
        onChange={(value) => onChange('timelineSignals', parseList(value))}
      />
      <PreviewInput
        label="Tags"
        value={preview.tags.join(', ')}
        placeholder="follow-up, risk-signal"
        onChange={(value) => onChange('tags', parseTags(value))}
      />
    </div>
  );
}

function PreviewInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100">
      <span className="text-xs font-bold uppercase tracking-wide text-blue-500">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-sm font-semibold text-blue-950 outline-none placeholder:text-blue-300"
      />
    </label>
  );
}

function PreviewTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-white px-3 py-2 ring-1 ring-blue-100 md:col-span-2">
      <span className="text-xs font-bold uppercase tracking-wide text-blue-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        className="mt-1 w-full resize-y bg-transparent text-sm font-semibold leading-6 text-blue-950 outline-none"
      />
    </label>
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
            <ActivityFact label="Contact" value={activity.contactName || activity.stakeholderName || 'Not captured'} />
            <ActivityFact label="Next action" value={activity.nextAction || 'Not captured'} />
            <ActivityFact label="Due date" value={activity.dueDate || 'Not captured'} />
          </div>
          <ActivitySignals activity={activity} />
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

function aiSuggestionToClassified(
  suggestion: CaptureAiSuggestion,
  rawNote: string,
  activityDate: string
): ClassifiedSalesActivity {
  return {
    accountName: suggestion.accountName || '',
    opportunityName: suggestion.opportunityName || '',
    activityType: activityTypes.includes(suggestion.activityType as SalesActivityType)
      ? suggestion.activityType as SalesActivityType
      : 'Other',
    summary: suggestion.summary || rawNote.trim().slice(0, 180),
    nextAction: suggestion.nextAction || '',
    dueDate: suggestion.dueDate || '',
    contactName: suggestion.contactName || '',
    stakeholderName: suggestion.stakeholderName || suggestion.contactName || '',
    stakeholderRole: suggestion.stakeholderRole || '',
    competitors: suggestion.competitors || [],
    buyingSignals: suggestion.buyingSignals || [],
    risks: suggestion.risks || [],
    timelineSignals: suggestion.timelineSignals || [],
    nextActions: suggestion.nextActions || [],
    tags: normalizeTags(suggestion.tags),
    rawNote: rawNote.trim(),
    activityDate,
  };
}

function parseTags(value: string) {
  return normalizeTags(value.split(','));
}

function parseList(value: string) {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 8);
}

function ActivityFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <p className="mt-1 font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function ActivitySignals({ activity }: { activity: SalesActivityRecord }) {
  const rows = [
    { label: 'Competitors', values: activity.competitors || [] },
    { label: 'Buying signals', values: activity.buyingSignals || [] },
    { label: 'Risks', values: activity.risks || [] },
    { label: 'Timeline', values: activity.timelineSignals || [] },
  ].filter((row) => row.values.length > 0);

  if (rows.length === 0 && (!activity.nextActions || activity.nextActions.length === 0)) return null;

  return (
    <div className="mt-3 space-y-2">
      {activity.nextActions && activity.nextActions.length > 0 && (
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Next actions</span>
          <ul className="mt-1 space-y-1 text-sm font-semibold text-gray-800">
            {activity.nextActions.map((action, index) => (
              <li key={`${action.title}-${index}`}>
                {index + 1}. {action.title}{action.dueDate ? ` | Due ${action.dueDate}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{row.label}</span>
          {row.values.map((value) => (
            <span key={value} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
              {value}
            </span>
          ))}
        </div>
      ))}
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
    activity.contactName || activity.stakeholderName ? `Contact: ${activity.contactName || activity.stakeholderName}` : '',
    activity.competitors?.length ? `Competitors: ${activity.competitors.join(', ')}` : '',
    activity.buyingSignals?.length ? `Buying signals: ${activity.buyingSignals.join(', ')}` : '',
    activity.timelineSignals?.length ? `Timeline: ${activity.timelineSignals.join(', ')}` : '',
    activity.nextActions?.length ? `Next actions:\n${activity.nextActions.map((action, index) => `${index + 1}. ${action.title}${action.dueDate ? ` (${action.dueDate})` : ''}`).join('\n')}` : '',
    activity.tags.length > 0 ? `Tags: ${activity.tags.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}
