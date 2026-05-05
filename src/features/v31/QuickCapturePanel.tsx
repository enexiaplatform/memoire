import { useEffect, useState } from 'react';
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
  structureInteraction,
} from './salesMemory';
import {
  CAPTURE_SAVED_EVENT,
  CAPTURE_STRUCTURED_EVENT,
  GUIDED_WORKFLOW_SAMPLE_NOTE,
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
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type SavedMemory = SaveStructuredSalesCaptureResult & {
  accountName: string;
  actionTitle: string;
  contactName: string;
  opportunityName: string;
  lastInteractionSummary: string;
  objections: string[];
  painPoints: string[];
  missingFields: string[];
};

export function QuickCapturePanel({ compact = false, onSaved }: QuickCapturePanelProps) {
  const { user } = useAuth();
  const [rawNote, setRawNote] = useState('');
  const [structured, setStructured] = useState<StructuredSalesCapture | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedMemory, setSavedMemory] = useState<SavedMemory | null>(null);
  const [followUpContext, setFollowUpContext] = useState<FollowUpContext | null>(null);

  const updateStructured = (field: keyof StructuredSalesCapture, value: string) => {
    setStructured((current) => current ? { ...current, [field]: value } : current);
    setSaveStatus('idle');
  };

  useEffect(() => {
    const useSample = (event: Event) => {
      const note = (event as CustomEvent<{ note?: string }>).detail?.note || GUIDED_WORKFLOW_SAMPLE_NOTE;
      setRawNote(note);
      setStructured(null);
      setSavedMemory(null);
      setSaveStatus('idle');
      setMessage('Sample note added. Structure it when ready.');
    };

    window.addEventListener(USE_SAMPLE_NOTE_EVENT, useSample as EventListener);
    return () => window.removeEventListener(USE_SAMPLE_NOTE_EVENT, useSample as EventListener);
  }, []);

  const handleStructure = async () => {
    if (rawNote.trim().length < 8) {
      setMessage('Add a short interaction note first.');
      setSaveStatus('idle');
      return;
    }

    setLoading(true);
    setMessage('Structuring interaction...');
    setSaveStatus('idle');
    setSavedMemory(null);
    try {
      const context = user ? await loadInteractionStructureContext(user.id) : undefined;
      const result = await structureInteraction(rawNote, context);
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
        setMessage('Interaction structured. Review before saving to Sales Memory.');
      }
    } catch {
      setStructured({ ...EMPTY_CAPTURE, interaction_summary: rawNote.trim() });
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
      const savedMissingFields = getMissingInteractionFields(structured);
      const dailyMissingContext = enrichDailyMissingContext(savedMissingFields, structured);
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
      };
      setSavedMemory(saved);
      window.dispatchEvent(new CustomEvent(CAPTURE_SAVED_EVENT, { detail: saved }));
      setRawNote('');
      setStructured(null);
      setMessage('Saved to Sales Memory.');
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
    <section id="quick-capture" className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-navy">Quick Capture</h2>
          <p className="text-sm text-gray-500 mt-1">
            {compact ? 'Capture after a call, meeting, email, or customer message.' : 'Paste a customer interaction and turn it into Sales Memory, opportunity context, and a Next Action.'}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-brand-blue">
          <Sparkles className="h-3.5 w-3.5" />
          Capture to Memory to Action
        </div>
      </div>

      <textarea
        value={rawNote}
        onChange={(event) => setRawNote(event.target.value)}
        placeholder="Paste a quick note after a call, meeting, or customer message..."
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
          Structure Interaction
        </button>
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
          <p className="text-sm font-semibold text-emerald-900">Saved to Sales Memory.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-5 text-emerald-900 sm:grid-cols-2">
            <SaveOutcome ok={Boolean(savedMemory.accountId)} text={savedMemory.accountId ? 'Added to Account Memory' : 'Account Memory is missing'} />
            <SaveOutcome ok={Boolean(savedMemory.actionId)} text={savedMemory.actionId ? 'Created or linked Next Action' : 'No Next Action created'} />
            <SaveOutcome ok={savedMemory.objections.length > 0} text={savedMemory.objections.length > 0 ? 'Updated blocker / objection context' : 'No blocker captured'} />
            <SaveOutcome ok text="Memory Health may have changed" />
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
              <h3 className="text-base font-bold text-navy">Structured Preview</h3>
              <p className="mt-1 text-sm text-gray-500">Review and edit before saving to Living Memory.</p>
            </div>
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
            <TextField label="Contact" value={structured.contact} onChange={(value) => updateStructured('contact', value)} />
            <SelectField label="Interaction Type" value={structured.type} options={typeOptions} onChange={(value) => updateStructured('type', value)} />
            <TextAreaField label="Interaction Summary" value={structured.interaction_summary} onChange={(value) => updateStructured('interaction_summary', value)} />
            <TextField label="Opportunity" value={structured.opportunity} onChange={(value) => updateStructured('opportunity', value)} />
            <TextAreaField label="Pain Points" value={structured.pain_point} onChange={(value) => updateStructured('pain_point', value)} />
            <TextAreaField label="Objections" value={structured.objection} onChange={(value) => updateStructured('objection', value)} />
            <TextAreaField label="Next Action" value={structured.next_action} onChange={(value) => updateStructured('next_action', value)} />
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

function enrichDailyMissingContext(missingFields: string[], structured: StructuredSalesCapture) {
  const next = new Set(missingFields);
  if (!structured.contact) next.add('Contact');
  next.add('Decision maker');
  next.add('Decision timeline');
  return Array.from(next);
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
