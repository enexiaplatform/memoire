import { useState } from 'react';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { StructuredSalesCapture, InteractionType, SalesPriority, SalesStage } from '../../types/v31';
import { EMPTY_CAPTURE, saveStructuredSalesCapture, structureSalesCapture } from './salesMemory';

interface QuickCapturePanelProps {
  compact?: boolean;
  onSaved?: () => void;
}

const typeOptions: InteractionType[] = ['call', 'email', 'meeting', 'note', 'proposal', 'other'];
const stageOptions: SalesStage[] = ['new', 'active', 'proposal', 'negotiation', 'won', 'lost', 'paused'];
const priorityOptions: SalesPriority[] = ['low', 'medium', 'high'];

export function QuickCapturePanel({ compact = false, onSaved }: QuickCapturePanelProps) {
  const { user } = useAuth();
  const [rawNote, setRawNote] = useState('');
  const [structured, setStructured] = useState<StructuredSalesCapture | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const updateStructured = (field: keyof StructuredSalesCapture, value: string) => {
    setStructured((current) => current ? { ...current, [field]: value } : current);
  };

  const handleStructure = async () => {
    if (rawNote.trim().length < 8) {
      setMessage('Add a little more detail before structuring.');
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await structureSalesCapture(rawNote);
      setStructured(result);
    } catch {
      setStructured({ ...EMPTY_CAPTURE, interaction_summary: rawNote.trim() });
      setMessage('AI structure was unavailable, so Memoire prepared an editable draft.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !structured) return;

    setSaving(true);
    setMessage(null);
    try {
      await saveStructuredSalesCapture(user.id, rawNote, structured);
      setRawNote('');
      setStructured(null);
      setMessage('Saved to your sales memory.');
      onSaved?.();
    } catch (err) {
      console.error(err);
      setMessage('Save failed. Check your Supabase migration and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-navy">Quick Capture</h2>
          {!compact && (
            <p className="text-sm text-gray-500 mt-1">Turn a customer interaction into memory and action.</p>
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
        placeholder="Just called John at ABC Pharma. They are reviewing the proposal, concerned about lead time, and asked me to follow up next Tuesday."
        className="min-h-[120px] w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleStructure}
          disabled={loading || saving || rawNote.trim().length < 8}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Structure
        </button>
        {message && <span className="text-sm text-gray-500">{message}</span>}
      </div>

      {structured && (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField label="Type" value={structured.type} options={typeOptions} onChange={(value) => updateStructured('type', value)} />
            <TextField label="Account" value={structured.account} onChange={(value) => updateStructured('account', value)} />
            <TextField label="Contact" value={structured.contact} onChange={(value) => updateStructured('contact', value)} />
            <TextField label="Contact role" value={structured.contact_role} onChange={(value) => updateStructured('contact_role', value)} />
            <TextField label="Opportunity" value={structured.opportunity} onChange={(value) => updateStructured('opportunity', value)} />
            <SelectField label="Stage" value={structured.opportunity_stage} options={stageOptions} onChange={(value) => updateStructured('opportunity_stage', value)} />
            <TextField label="Estimated value" value={structured.estimated_value} onChange={(value) => updateStructured('estimated_value', value)} />
            <TextField label="Follow-up date" value={structured.follow_up_date} type="date" onChange={(value) => updateStructured('follow_up_date', value)} />
            <TextAreaField label="Interaction summary" value={structured.interaction_summary} onChange={(value) => updateStructured('interaction_summary', value)} />
            <TextAreaField label="Pain point" value={structured.pain_point} onChange={(value) => updateStructured('pain_point', value)} />
            <TextAreaField label="Objection / blocker" value={structured.objection} onChange={(value) => updateStructured('objection', value)} />
            <TextAreaField label="Next action" value={structured.next_action} onChange={(value) => updateStructured('next_action', value)} />
            <SelectField label="Urgency" value={structured.urgency} options={priorityOptions} onChange={(value) => updateStructured('urgency', value)} />
            <SelectField label="Confidence" value={structured.confidence} options={priorityOptions} onChange={(value) => updateStructured('confidence', value)} />
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
              Save memory
            </button>
          </div>
        </div>
      )}
    </section>
  );
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
