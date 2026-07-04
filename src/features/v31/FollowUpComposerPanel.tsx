import { useEffect, useMemo, useState } from 'react';
import { toLocalDateKey } from '../../utils/safeDate.ts';
import { CheckCircle2, Copy, RefreshCw, X } from 'lucide-react';
import type { FollowUpContext, FollowUpDraft, FollowUpGoal, FollowUpLength, FollowUpTone } from '../../types/v31';
import {
  followUpGoals,
  followUpLengths,
  followUpTones,
  generateFollowUpDraft,
  getMissingFollowUpContext,
} from './followUpComposer';
import { FOLLOWUP_DRAFT_READY_EVENT } from '../onboarding/guidedWorkflow';
import { useAuthContext } from '../../auth/authContext';
import { saveSalesActivity } from '../../services/salesActivityStore';
import { hasLocalSampleData } from '../../utils/dataMode';

interface FollowUpComposerPanelProps {
  initialContext: FollowUpContext;
  onClose: () => void;
  onActivityLogged?: () => void;
  onScheduleNextAction?: (nextAction: string, nextActionDate: string) => Promise<void>;
}

function defaultNextTouchDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return toLocalDateKey(date);
}

export function FollowUpComposerPanel({ initialContext, onClose, onActivityLogged, onScheduleNextAction }: FollowUpComposerPanelProps) {
  const { user } = useAuthContext();
  const [context, setContext] = useState<FollowUpContext>(initialContext);
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [logState, setLogState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [logMessage, setLogMessage] = useState('');
  const [nextTouchText, setNextTouchText] = useState(initialContext.nextAction || 'Follow up on the sent email');
  const [nextTouchDate, setNextTouchDate] = useState(defaultNextTouchDate);
  const [scheduleState, setScheduleState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const missingFields = useMemo(() => getMissingFollowUpContext(context), [context]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const updateContext = <K extends keyof FollowUpContext>(field: K, value: FollowUpContext[K]) => {
    setContext((current) => ({ ...current, [field]: value }));
    setDraft(null);
    setCopyMessage('');
    setDraftStatus('');
  };

  const generate = () => {
    setDraftStatus('Generating...');
    const nextDraft = generateFollowUpDraft(context);
    setDraft(nextDraft);
    setDraftStatus('Draft ready');
    setCopyMessage('');
    window.dispatchEvent(new CustomEvent(FOLLOWUP_DRAFT_READY_EVENT, { detail: { draft: nextDraft } }));
  };

  const copyDraft = async () => {
    if (!draft) return;
    const text = `Subject: ${draft.subject}\n\n${draft.body}`;
    await navigator.clipboard.writeText(text);
    setCopyMessage('Copied.');
  };

  const logAsSentActivity = async () => {
    if (!draft || logState === 'saving' || logState === 'saved') return;
    setLogState('saving');
    setLogMessage('');
    try {
      const result = await saveSalesActivity({
        accountName: context.accountName,
        opportunityName: context.opportunityName || '',
        contactName: context.contactName || undefined,
        activityType: 'Follow-up',
        summary: `Follow-up sent: ${draft.subject}`,
        nextAction: context.nextAction || '',
        dueDate: '',
        tags: ['follow-up'],
        rawNote: `Subject: ${draft.subject}\n\n${draft.body}`,
        activityDate: toLocalDateKey(new Date()),
      }, hasLocalSampleData() ? undefined : user?.id);
      setLogState('saved');
      setLogMessage(result.warning || 'Logged as a customer touch - silence tracking updated.');
      onActivityLogged?.();
    } catch {
      setLogState('idle');
      setLogMessage('Could not log the activity. Your draft is still here - try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/40 px-4 py-6">
      <section role="dialog" aria-modal="true" aria-label="Follow-up Composer" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Follow-up Composer</p>
            <h2 className="mt-1 text-xl font-bold text-navy">Draft from sales memory</h2>
            <p className="mt-1 text-sm text-gray-500">No email is sent. Edit and copy the draft when ready.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close composer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {missingFields.length > 0 && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-900">Missing context - add account, interaction, or Next Action to draft a stronger follow-up.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {missingFields.map((field) => (
                  <span key={field} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800">{field}</span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Recipient / Contact" value={context.contactName || ''} onChange={(value) => updateContext('contactName', value)} />
            <TextField label="Account" value={context.accountName} onChange={(value) => updateContext('accountName', value)} />
            <TextField label="Opportunity" value={context.opportunityName || ''} onChange={(value) => updateContext('opportunityName', value)} />
            <TextField label="Next action" value={context.nextAction || ''} onChange={(value) => updateContext('nextAction', value)} />
            <TextAreaField label="Last interaction" value={context.lastInteractionSummary || ''} onChange={(value) => updateContext('lastInteractionSummary', value)} />
            <TextAreaField label="Known objections" value={(context.objections || []).join('; ')} onChange={(value) => updateContext('objections', splitList(value))} />
            <TextAreaField label="Pain points" value={(context.painPoints || []).join('; ')} onChange={(value) => updateContext('painPoints', splitList(value))} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SelectField label="Goal" value={context.goal} options={followUpGoals} onChange={(value) => updateContext('goal', value as FollowUpGoal)} />
            <SelectField label="Tone" value={context.tone} options={followUpTones} onChange={(value) => updateContext('tone', value as FollowUpTone)} />
            <SelectField label="Message length" value={context.length} options={followUpLengths} onChange={(value) => updateContext('length', value as FollowUpLength)} />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {draftStatus && (
              <span className={`text-sm font-semibold ${draft ? 'text-emerald-700' : 'text-gray-500'}`}>
                {draftStatus}
              </span>
            )}
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" />
              {draft ? 'Regenerate' : 'Generate draft'}
            </button>
          </div>

          {draft && (
            <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-navy">Generated Draft</h3>
                <div className="flex items-center gap-2">
                  {copyMessage && <span className="text-xs font-semibold text-emerald-700">{copyMessage}</span>}
                  <button
                    type="button"
                    onClick={copyDraft}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={logAsSentActivity}
                    disabled={logState !== 'idle'}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {logState === 'saved' ? 'Logged' : logState === 'saving' ? 'Logging...' : 'Log as sent'}
                  </button>
                </div>
              </div>
              {logMessage && (
                <p className={`mb-3 rounded-lg px-3 py-2 text-xs font-semibold ${logState === 'saved' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                  {logMessage}
                </p>
              )}
              {logState === 'saved' && onScheduleNextAction && (
                <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Book the next touch</p>
                  {scheduleState === 'saved' ? (
                    <p className="mt-2 text-xs font-semibold text-emerald-800">Next action scheduled - this deal stays on your radar.</p>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-gray-600">A sent follow-up without a scheduled next action goes quiet again in 7 days.</p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          value={nextTouchText}
                          onChange={(event) => setNextTouchText(event.target.value)}
                          aria-label="Next action"
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none focus:border-brand-blue"
                        />
                        <input
                          type="date"
                          value={nextTouchDate}
                          onChange={(event) => setNextTouchDate(event.target.value)}
                          aria-label="Next action date"
                          className="rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none focus:border-brand-blue"
                        />
                        <button
                          type="button"
                          disabled={scheduleState === 'saving' || !nextTouchText.trim() || !nextTouchDate}
                          onClick={async () => {
                            setScheduleState('saving');
                            try {
                              await onScheduleNextAction(nextTouchText.trim(), nextTouchDate);
                              setScheduleState('saved');
                            } catch {
                              setScheduleState('error');
                            }
                          }}
                          className="rounded-full bg-brand-blue px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {scheduleState === 'saving' ? 'Scheduling...' : 'Schedule'}
                        </button>
                      </div>
                      {scheduleState === 'error' && (
                        <p className="mt-2 text-xs font-semibold text-amber-800">Could not schedule - try again.</p>
                      )}
                    </>
                  )}
                </div>
              )}
              <TextField label="Subject" value={draft.subject} onChange={(value) => setDraft((current) => current ? { ...current, subject: value } : current)} />
              <div className="mt-3">
                <TextAreaField label="Message body" value={draft.body} onChange={(value) => setDraft((current) => current ? { ...current, body: value } : current)} large />
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, large = false }: { label: string; value: string; onChange: (value: string) => void; large?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 ${large ? 'min-h-[220px]' : 'min-h-[84px]'}`}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function splitList(value: string) {
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
