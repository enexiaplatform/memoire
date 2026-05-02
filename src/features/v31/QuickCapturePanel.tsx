import { useState } from 'react';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { StructuredSalesCapture, InteractionType, SalesPriority, SalesStage } from '../../types/v31';
import {
  EMPTY_CAPTURE,
  getMissingInteractionFields,
  loadInteractionStructureContext,
  saveStructuredSalesCapture,
  structureInteraction,
} from './salesMemory';

interface QuickCapturePanelProps {
  compact?: boolean;
  onSaved?: () => void;
}

const typeOptions: InteractionType[] = ['call', 'email', 'meeting', 'note', 'proposal', 'other'];
const stageOptions: SalesStage[] = ['new', 'active', 'proposal', 'negotiation', 'won', 'lost', 'paused'];
const priorityOptions: SalesPriority[] = ['low', 'medium', 'high'];
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function QuickCapturePanel({ compact = false, onSaved }: QuickCapturePanelProps) {
  const { user } = useAuth();
  const [rawNote, setRawNote] = useState('');
  const [structured, setStructured] = useState<StructuredSalesCapture | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const updateStructured = (field: keyof StructuredSalesCapture, value: string) => {
    setStructured((current) => current ? { ...current, [field]: value } : current);
    setSaveStatus('idle');
  };

  const handleStructure = async () => {
    if (rawNote.trim().length < 8) {
      setMessage('Add a short interaction note first.');
      setSaveStatus('idle');
      return;
    }

    setLoading(true);
    setMessage(null);
    setSaveStatus('idle');
    try {
      const context = user ? await loadInteractionStructureContext(user.id) : undefined;
      const result = await structureInteraction(rawNote, context);
      setStructured(result);
      const missing = getMissingInteractionFields(result);
      if (missing.length > 0) {
        setMessage('Some fields are missing. You can still save this, or complete them first.');
      }
    } catch {
      setStructured({ ...EMPTY_CAPTURE, interaction_summary: rawNote.trim() });
      setMessage('Some fields are missing. You can still save this, or complete them first.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !structured) return;

    setSaving(true);
    setSaveStatus('saving');
    setMessage('Saving...');
    try {
      await saveStructuredSalesCapture(user.id, rawNote, structured);
      setRawNote('');
      setStructured(null);
      setMessage('Saved to Account Memory');
      setSaveStatus('saved');
      onSaved?.();
    } catch (err) {
      console.error(err);
      setMessage('Error - please review missing fields');
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const missingFields = structured ? getMissingInteractionFields(structured) : [];

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-navy">Post-Interaction Command</h2>
          {!compact && (
            <p className="text-sm text-gray-500 mt-1">Turn a raw customer note into account memory, opportunity context, and next action.</p>
          )}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-brand-blue">
          <Sparkles className="h-3.5 w-3.5" />
          V1 spine
        </div>
      </div>

      <textarea
        value={rawNote}
        onChange={(event) => setRawNote(event.target.value)}
        placeholder="Paste or type a sales interaction..."
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

      {structured && (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-navy">Structured Preview</h3>
              <p className="mt-1 text-sm text-gray-500">Review and edit before saving to memory.</p>
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
              Save to Memory
            </button>
          </div>
        </div>
      )}
    </section>
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
