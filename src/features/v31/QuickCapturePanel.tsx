import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { FollowUpContext, StructuredSalesCapture, InteractionType, SalesPriority, SalesStage } from '../../types/v31';
import {
  EMPTY_CAPTURE,
  getMissingInteractionFields,
  loadInteractionStructureContext,
  type SaveStructuredSalesCaptureResult,
  saveStructuredSalesCapture,
  structureEmailThreadCapture,
  structureInteraction,
} from './salesMemory';
import {
  CAPTURE_SAVED_EVENT,
  CAPTURE_STRUCTURED_EVENT,
  GUIDED_WORKFLOW_SAMPLE_NOTE,
  QUICK_CAPTURE_FOCUS_EVENT,
  USE_SAMPLE_NOTE_EVENT,
} from '../onboarding/guidedWorkflow';
import { FollowUpComposerPanel } from './FollowUpComposerPanel';

interface QuickCapturePanelProps {
  compact?: boolean;
  onSaved?: () => void;
}

const typeOptions: InteractionType[] = ['call', 'email', 'meeting', 'note', 'proposal', 'other'];
const stageOptions: SalesStage[] = ['new', 'active', 'proposal', 'negotiation', 'won', 'lost', 'paused'];
const priorityOptions: SalesPriority[] = ['low', 'medium', 'high'];
const DEMO_EMAIL_THREAD = `Subject: Re: Control Union proposal review

Hi Henry,
Thanks for sending the proposal. We are reviewing internally. Our main concerns are lead time and local support. Could you send a clearer implementation timeline next week?

Regards,
Nam`;
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type CaptureMode = 'quick_note' | 'email_thread';
type SavedMemory = SaveStructuredSalesCaptureResult & {
  accountName: string;
  actionTitle: string;
  contactName: string;
  opportunityName: string;
  lastInteractionSummary: string;
  objections: string[];
  painPoints: string[];
  missingFields: string[];
  sourceType: CaptureMode;
  stuckRisk: string;
};

export function QuickCapturePanel({ compact = false, onSaved }: QuickCapturePanelProps) {
  const { user } = useAuth();
  const [rawNote, setRawNote] = useState('');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('quick_note');
  const [structured, setStructured] = useState<StructuredSalesCapture | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedMemory, setSavedMemory] = useState<SavedMemory | null>(null);
  const [followUpContext, setFollowUpContext] = useState<FollowUpContext | null>(null);
  const [highlighted, setHighlighted] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const updateStructured = (field: keyof StructuredSalesCapture, value: string) => {
    setStructured((current) => current ? { ...current, [field]: value } : current);
    setSaveStatus('idle');
  };

  const isEmailThread = captureMode === 'email_thread';

  useEffect(() => {
    const useSample = (event: Event) => {
      const note = (event as CustomEvent<{ note?: string }>).detail?.note || GUIDED_WORKFLOW_SAMPLE_NOTE;
      setRawNote(note);
      setCaptureMode('quick_note');
      setStructured(null);
      setSavedMemory(null);
      setSaveStatus('idle');
      setMessage('Sample note added. Structure it when ready.');
    };

    window.addEventListener(USE_SAMPLE_NOTE_EVENT, useSample as EventListener);
    return () => window.removeEventListener(USE_SAMPLE_NOTE_EVENT, useSample as EventListener);
  }, []);

  const focusQuickCapture = useCallback(() => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlighted(true);
    window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 250);
    window.setTimeout(() => setHighlighted(false), 1800);
  }, []);

  useEffect(() => {
    const onFocusRequest = () => focusQuickCapture();
    window.addEventListener(QUICK_CAPTURE_FOCUS_EVENT, onFocusRequest);
    if (window.location.hash === '#quick-capture') {
      window.setTimeout(focusQuickCapture, 150);
    }
    return () => window.removeEventListener(QUICK_CAPTURE_FOCUS_EVENT, onFocusRequest);
  }, [focusQuickCapture]);

  const handleStructure = async () => {
    if (rawNote.trim().length < 8) {
      setMessage('Add a short interaction note first.');
      setSaveStatus('idle');
      return;
    }

    setLoading(true);
    setMessage(isEmailThread ? 'Structuring email thread...' : 'Structuring interaction...');
    setSaveStatus('idle');
    setSavedMemory(null);
    try {
      const context = user ? await loadInteractionStructureContext(user.id) : undefined;
      const result = isEmailThread
        ? await structureEmailThreadCapture(rawNote, context)
        : await structureInteraction(rawNote, context);
      setStructured(result);
      window.dispatchEvent(new CustomEvent(CAPTURE_STRUCTURED_EVENT, {
        detail: {
          structured: result,
          missingFields: getMissingInteractionFields(result),
        },
      }));
      const missing = getMissingInteractionFields(result);
      if (missing.length > 0) {
        setMessage('Missing context - add account, interaction, or next action if you have it.');
      } else {
        setMessage(isEmailThread ? 'Email thread structured. Review before saving to Sales Memory.' : 'Interaction structured. Review before saving to Sales Memory.');
      }
    } catch {
      setStructured({ ...EMPTY_CAPTURE, source_type: captureMode, type: isEmailThread ? 'email' : 'note', interaction_summary: rawNote.trim() });
      setMessage('Missing context - add account, interaction, or next action if you have it.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !structured) return;

    setSaving(true);
    setSaveStatus('saving');
    setMessage('Saving...');
    setSavedMemory(null);
    try {
      const result = await saveStructuredSalesCapture(user.id, rawNote, structured);
      const dailyMissingContext = getMissingInteractionFields(structured);
      const saved = {
        ...result,
        accountName: structured.account,
        actionTitle: structured.next_action,
        contactName: structured.contact,
        opportunityName: structured.opportunity,
        lastInteractionSummary: structured.interaction_summary,
        objections: structured.objection ? [structured.objection] : [],
        painPoints: structured.pain_point ? [structured.pain_point] : [],
        missingFields: dailyMissingContext,
        sourceType: structured.source_type || captureMode,
        stuckRisk: structured.stuck_risk || '',
      };
      setSavedMemory(saved);
      window.dispatchEvent(new CustomEvent(CAPTURE_SAVED_EVENT, { detail: saved }));
      setRawNote('');
      setStructured(null);
      setMessage(isEmailThread ? 'Saved email thread to Account Memory.' : 'Saved to Sales Memory.');
      setSaveStatus('saved');
      onSaved?.();
    } catch (err) {
      console.error(err);
      setMessage('Error - please try again');
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const missingFields = structured ? getMissingInteractionFields(structured) : [];

  return (
    <section
      id="quick-capture"
      ref={sectionRef}
      className={`rounded-lg border bg-white p-5 shadow-sm transition-all duration-300 ${
        highlighted ? 'border-brand-blue ring-4 ring-brand-blue/15' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-navy">Quick Capture</h2>
          <p className="text-sm text-gray-500 mt-1">
            {isEmailThread
              ? 'Paste selected customer email messages and turn them into account context, concerns, and follow-up signals.'
              : compact ? 'Capture after a call, meeting, email, or customer message.' : 'Paste a customer interaction and turn it into Sales Memory, opportunity context, and a Next Action.'}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-brand-blue">
          <Sparkles className="h-3.5 w-3.5" />
          Capture to Memory to Action
        </div>
      </div>

      <div className="mb-3 inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
        {([
          ['quick_note', 'Quick Note'],
          ['email_thread', 'Email Thread'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              setCaptureMode(mode);
              setStructured(null);
              setSavedMemory(null);
              setSaveStatus('idle');
              setMessage(null);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              captureMode === mode ? 'bg-navy text-white' : 'text-gray-600 hover:bg-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isEmailThread && (
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
          Memoire will extract account context, customer concerns, next actions, and stuck-deal signals from the thread.
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={rawNote}
        onChange={(event) => setRawNote(event.target.value)}
        placeholder={isEmailThread ? 'Paste a customer email thread or selected email messages here...' : 'Paste a quick note after a call, meeting, or customer message...'}
        className="min-h-[120px] w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleStructure}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isEmailThread ? 'Structure Email Thread' : 'Structure Interaction'}
        </button>
        {isEmailThread && (
          <button
            type="button"
            onClick={() => {
              setRawNote(DEMO_EMAIL_THREAD);
              setStructured(null);
              setSavedMemory(null);
              setSaveStatus('idle');
              setMessage('Demo email thread added. Structure it when ready.');
            }}
            className="rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-brand-blue"
          >
            Use demo email thread
          </button>
        )}
        {message && (
          <span className={`text-sm ${
            saveStatus === 'saved'
              ? 'text-emerald-700'
              : saveStatus === 'error'
                ? 'text-red-600'
                : 'text-gray-500'
          }`}>
            {message}
          </span>
        )}
      </div>

      {savedMemory && saveStatus === 'saved' && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            {savedMemory.sourceType === 'email_thread' ? 'Saved email thread to Account Memory.' : 'Saved to Sales Memory.'}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-5 text-emerald-900 sm:grid-cols-2">
            <SaveOutcome ok={Boolean(savedMemory.accountId)} text={savedMemory.accountId ? 'Added to Account Memory' : 'Account Memory is missing'} />
            <SaveOutcome ok text={savedMemory.sourceType === 'email_thread' ? 'Added thread summary' : 'Added interaction summary'} />
            <SaveOutcome ok={savedMemory.objections.length > 0} text={savedMemory.objections.length > 0 ? 'Updated customer concerns' : 'No customer concern captured'} />
            <SaveOutcome ok={Boolean(savedMemory.actionId)} text={savedMemory.actionId ? 'Created or linked next action' : 'No next action created'} />
            <SaveOutcome ok={Boolean(savedMemory.stuckRisk)} text={savedMemory.stuckRisk ? 'Updated stuck-deal signal' : 'No stuck-deal signal captured'} />
            <SaveOutcome ok text="Ask Memoire can now use this context" />
          </div>
          {savedMemory.missingFields.length > 0 && (
            <div className="mt-3 rounded-lg bg-white/70 p-3">
              <p className="text-xs font-bold text-amber-800">Some context is still missing.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {savedMemory.missingFields.map((field) => (
                  <span key={field} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{field}</span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {savedMemory.accountId && (
              <Link
                to={`/app/accounts/${savedMemory.accountId}`}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
              >
                Open Account Memory
              </Link>
            )}
            {savedMemory.actionId && (
              <Link
                to="/app/today"
                className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
              >
                View Next Action
              </Link>
            )}
            {savedMemory.accountId && (
              <Link
                to={`/app/ask?scope=account&accountId=${savedMemory.accountId}`}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
              >
                Ask about this Account
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setRawNote('');
                setStructured(null);
                setSavedMemory(null);
                setSaveStatus('idle');
                setMessage(null);
                textareaRef.current?.focus();
              }}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
            >
              {savedMemory.sourceType === 'email_thread' ? 'Capture another thread' : 'Capture another note'}
            </button>
            <button
              type="button"
              onClick={() => setFollowUpContext({
                accountName: savedMemory.accountName || 'Unknown account',
                contactName: savedMemory.contactName,
                opportunityName: savedMemory.opportunityName,
                lastInteractionSummary: savedMemory.lastInteractionSummary,
                objections: savedMemory.objections,
                painPoints: savedMemory.painPoints,
                nextAction: savedMemory.actionTitle,
                goal: savedMemory.objections.length > 0 ? 'address_objection' : 'confirm_next_step',
                tone: 'consultative',
                length: 'medium',
              })}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
            >
              Draft Follow-up
            </button>
          </div>
        </div>
      )}

      {structured && (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-navy">{structured.source_type === 'email_thread' ? 'Email Thread Preview' : 'Structured Preview'}</h3>
              <p className="mt-1 text-sm text-gray-500">
                {structured.source_type === 'email_thread'
                  ? 'Review thread context, customer concern, stuck risk, and missing context before saving.'
                  : 'Review and edit before saving to Living Memory.'}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
              Source type: {structured.source_type === 'email_thread' ? 'Email Thread' : 'Quick Note'}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
              structured.confidence === 'high'
                ? 'bg-emerald-50 text-emerald-700'
                : structured.confidence === 'low'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-blue-50 text-brand-blue'
            }`}>
              Confidence: {capitalize(structured.confidence)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Account" value={structured.account} onChange={(value) => updateStructured('account', value)} />
            <TextField label={structured.source_type === 'email_thread' ? 'Contact / Sender' : 'Contact'} value={structured.contact} onChange={(value) => updateStructured('contact', value)} />
            {structured.source_type === 'email_thread' && (
              <TextField label="Subject" value={structured.email_subject || ''} onChange={(value) => updateStructured('email_subject', value)} />
            )}
            <SelectField label="Interaction Type" value={structured.type} options={typeOptions} onChange={(value) => updateStructured('type', value)} />
            <TextAreaField label={structured.source_type === 'email_thread' ? 'Thread Summary' : 'Interaction Summary'} value={structured.interaction_summary} onChange={(value) => updateStructured('interaction_summary', value)} />
            {structured.source_type === 'email_thread' && (
              <TextAreaField label="Current Status" value={structured.current_status || ''} onChange={(value) => updateStructured('current_status', value)} />
            )}
            {structured.source_type === 'email_thread' && (
              <TextField label="Decision Maker" value={structured.decision_maker_name || ''} onChange={(value) => updateStructured('decision_maker_name', value)} />
            )}
            {structured.source_type === 'email_thread' && (
              <TextField label="Decision Role" value={structured.decision_maker_role || ''} onChange={(value) => updateStructured('decision_maker_role', value)} />
            )}
            {structured.source_type === 'email_thread' && (
              <TextAreaField label="Decision Context" value={structured.decision_context || ''} onChange={(value) => updateStructured('decision_context', value)} />
            )}
            {structured.source_type === 'email_thread' && (
              <TextField label="Secondary Contact" value={structured.secondary_contact || ''} onChange={(value) => updateStructured('secondary_contact', value)} />
            )}
            <TextField label="Opportunity" value={structured.opportunity} onChange={(value) => updateStructured('opportunity', value)} />
            <TextAreaField label={structured.source_type === 'email_thread' ? 'Customer Concern' : 'Pain Points'} value={structured.pain_point} onChange={(value) => updateStructured('pain_point', value)} />
            <TextAreaField label={structured.source_type === 'email_thread' ? 'Concern / Objection' : 'Objections'} value={structured.objection} onChange={(value) => updateStructured('objection', value)} />
            <TextAreaField label={structured.source_type === 'email_thread' ? 'Suggested Next Action' : 'Next Action'} value={structured.next_action} onChange={(value) => updateStructured('next_action', value)} />
            {structured.source_type === 'email_thread' && (
              <TextAreaField label="Stuck Risk" value={structured.stuck_risk || ''} onChange={(value) => updateStructured('stuck_risk', value)} />
            )}
            <TextField label="Due Date" value={structured.follow_up_date} type="date" onChange={(value) => updateStructured('follow_up_date', value)} />
            <SelectField label="Confidence" value={structured.confidence} options={priorityOptions} onChange={(value) => updateStructured('confidence', value)} />
          </div>

          <details className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700">Additional fields</summary>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField label="Contact role" value={structured.contact_role} onChange={(value) => updateStructured('contact_role', value)} />
              <SelectField label="Stage" value={structured.opportunity_stage} options={stageOptions} onChange={(value) => updateStructured('opportunity_stage', value)} />
              <TextField label="Estimated value" value={structured.estimated_value} onChange={(value) => updateStructured('estimated_value', value)} />
              <SelectField label="Urgency" value={structured.urgency} options={priorityOptions} onChange={(value) => updateStructured('urgency', value)} />
            </div>
          </details>

          <div className="mt-4 rounded-lg border border-gray-100 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Missing Fields</p>
            {missingFields.length === 0 ? (
              <p className="mt-2 text-sm text-emerald-700">No important fields missing.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {missingFields.map((field) => (
                  <span key={field} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{field}</span>
                ))}
              </div>
            )}
            {structured.source_type === 'email_thread' && (
              <details className="mt-3 rounded-lg bg-gray-50 p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-gray-500">Raw email preserved</summary>
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-gray-600">{rawNote}</p>
              </details>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setStructured(null)}
              className="rounded-full px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Edit raw note
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save to Sales Memory
            </button>
          </div>
        </div>
      )}
      {followUpContext && (
        <FollowUpComposerPanel
          initialContext={followUpContext}
          onClose={() => setFollowUpContext(null)}
        />
      )}
    </section>
  );
}

function SaveOutcome({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2">
      <span className={ok ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-800'}>{ok ? 'Done: ' : 'Missing: '}</span>
      {text}
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function TextField({ label, value, onChange, type = 'text' }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-[84px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
