import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Filter, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  canUseObjectionCloudStore,
  createObjection,
  deleteObjection,
  emptyObjectionInput,
  objectionImpacts,
  objectionStatuses,
  objectionToFormInput,
  objectionTypes,
  updateObjection,
  type ObjectionFormInput,
  type ObjectionRecord,
} from '../../services/objectionStore';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import { analyzeObjectionLedger, objectionStatusTone } from '../../utils/objectionLedger';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const allFilter = 'All';

export function ObjectionsPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const [objections, setObjections] = useState<ObjectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState(searchParams.get('accountName') || allFilter);
  const [opportunityFilter, setOpportunityFilter] = useState(searchParams.get('opportunityName') || allFilter);
  const [typeFilter, setTypeFilter] = useState(allFilter);
  const [statusFilter, setStatusFilter] = useState(allFilter);
  const [impactFilter, setImpactFilter] = useState(allFilter);
  const [selectedObjection, setSelectedObjection] = useState<ObjectionRecord | null>(null);
  const [panelMode, setPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [form, setForm] = useState<ObjectionFormInput>(emptyObjectionInput);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');

  const refreshObjections = async () => {
    setLoading(true);
    const workspaceData = await loadSalesWorkspaceData(dataUserId);
    setObjections(workspaceData.objections);
    setLoading(false);
  };

  useEffect(() => {
    refreshObjections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUserId]);

  useEffect(() => {
    setAccountFilter(searchParams.get('accountName') || allFilter);
    setOpportunityFilter(searchParams.get('opportunityName') || allFilter);
  }, [searchParams]);

  const accounts = useMemo(() => [allFilter, ...Array.from(new Set(objections.map((item) => item.accountName).filter(Boolean))).sort()], [objections]);
  const opportunities = useMemo(() => [allFilter, ...Array.from(new Set(objections.map((item) => item.opportunityName).filter(Boolean))).sort()], [objections]);
  const summary = useMemo(() => analyzeObjectionLedger(objections), [objections]);
  const visibleObjections = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    return objections.filter((objection) => {
      const searchable = [
        objection.accountName,
        objection.opportunityName,
        objection.stakeholderName,
        objection.objectionType,
        objection.objectionText,
        objection.requiredProof,
        objection.responsePlan,
        objection.tags.join(' '),
      ].join(' ').toLowerCase();
      return (
        (!searchText || searchable.includes(searchText)) &&
        (accountFilter === allFilter || objection.accountName === accountFilter) &&
        (opportunityFilter === allFilter || objection.opportunityName === opportunityFilter) &&
        (typeFilter === allFilter || objection.objectionType === typeFilter) &&
        (statusFilter === allFilter || objection.status === statusFilter) &&
        (impactFilter === allFilter || objection.impact === impactFilter)
      );
    });
  }, [accountFilter, impactFilter, objections, opportunityFilter, query, statusFilter, typeFilter]);

  const openAddPanel = (seed: Partial<ObjectionFormInput> = {}) => {
    setSelectedObjection(null);
    setForm({ ...emptyObjectionInput, ...seed });
    setPanelMode('add');
    setSaveState('idle');
    setMessage('');
  };

  const openEditPanel = (objection: ObjectionRecord) => {
    setSelectedObjection(objection);
    setForm(objectionToFormInput(objection));
    setPanelMode('edit');
    setSaveState('idle');
    setMessage('');
    setSearchParams(objection.accountName ? { accountName: objection.accountName } : {});
  };

  const closePanel = () => {
    setSelectedObjection(null);
    setPanelMode('closed');
    setSaveState('idle');
    setMessage('');
  };

  const handleSave = async () => {
    if (!form.objectionText.trim()) {
      setSaveState('error');
      setMessage('Add objection text first.');
      return;
    }
    setSaveState('saving');
    setMessage('Saving objection...');
    const result = panelMode === 'edit' && selectedObjection
      ? await updateObjection(selectedObjection, form, dataUserId)
      : await createObjection(form, dataUserId);
    setObjections((current) => [result.objection, ...current.filter((item) => item.id !== result.objection.id)]);
    setSelectedObjection(result.objection);
    setForm(objectionToFormInput(result.objection));
    setPanelMode('edit');
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Synced to your account.' : 'Saved locally in this browser.'));
  };

  const handleDelete = async (objection: ObjectionRecord) => {
    if (!window.confirm('Delete this objection?')) return;
    await deleteObjection(objection, dataUserId);
    setObjections((current) => current.filter((item) => item.id !== objection.id));
    closePanel();
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Objection Ledger</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Objection Ledger</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Track unresolved commercial debt across your B2B pipeline: proof required, response plan, owner context, and resolution state.
          </p>
        </div>
        <DataModePill
          compact
          isLoading={authLoading}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          cloudAvailable={canUseObjectionCloudStore(dataUserId)}
          hasSampleData={sampleDataActive}
        />
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <button type="button" onClick={() => openAddPanel()} className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            Add Objection
          </button>
          <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1.5fr_repeat(5,1fr)]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search objections..." className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" />
            </label>
            <FilterSelect label="Account" value={accountFilter} options={accounts} onChange={setAccountFilter} />
            <FilterSelect label="Opportunity" value={opportunityFilter} options={opportunities} onChange={setOpportunityFilter} />
            <FilterSelect label="Type" value={typeFilter} options={[allFilter, ...objectionTypes]} onChange={setTypeFilter} />
            <FilterSelect label="Status" value={statusFilter} options={[allFilter, ...objectionStatuses]} onChange={setStatusFilter} />
            <FilterSelect label="Impact" value={impactFilter} options={[allFilter, ...objectionImpacts]} onChange={setImpactFilter} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Total" value={summary.totalObjections} />
        <Metric label="Open" value={summary.openObjections} tone={summary.openObjections ? 'red' : 'green'} />
        <Metric label="High-impact open" value={summary.highImpactOpenObjections} tone={summary.highImpactOpenObjections ? 'red' : 'green'} />
        <Metric label="Addressed" value={summary.addressedButUnresolved} tone={summary.addressedButUnresolved ? 'amber' : 'green'} />
        <Metric label="Resolved" value={summary.resolvedObjections} tone="green" />
        <Metric label="Top type" value={summary.mostCommonType} />
        <Metric label="Opp debt" value={summary.opportunitiesWithOpenObjectionDebt} tone={summary.opportunitiesWithOpenObjectionDebt ? 'amber' : 'green'} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500">Loading objections...</div>
          ) : visibleObjections.length === 0 ? (
            <EmptyState onAdd={() => openAddPanel()} />
          ) : (
            visibleObjections.map((objection) => (
              <ObjectionCard key={objection.id} objection={objection} onOpen={() => openEditPanel(objection)} />
            ))
          )}
        </div>

        <ObjectionPanel
          mode={panelMode}
          form={form}
          saveState={saveState}
          message={message}
          onChange={setForm}
          onSave={handleSave}
          onClose={closePanel}
          onDelete={selectedObjection ? () => handleDelete(selectedObjection) : undefined}
        />
      </section>
    </div>
  );
}

function ObjectionCard({ objection, onOpen }: { objection: ObjectionRecord; onOpen: () => void }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{objection.accountName || 'No account'} / {objection.opportunityName || 'No opportunity'}</p>
          <h2 className="mt-1 text-lg font-bold text-navy">{objection.objectionText}</h2>
          {objection.stakeholderName && <p className="mt-1 text-sm text-gray-500">From: {objection.stakeholderName}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge label={objection.objectionType} tone={objection.objectionType === 'Competitor' ? 'amber' : 'blue'} />
          <Badge label={objection.impact} tone={objection.impact === 'High' ? 'red' : objection.impact === 'Medium' ? 'amber' : 'gray'} />
          <Badge label={objection.status} tone={objectionStatusTone(objection.status)} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Fact label="Required proof" value={objection.requiredProof || 'Not captured'} />
        <Fact label="Due date" value={objection.dueDate || 'Not captured'} />
        <Fact label="Response plan" value={objection.responsePlan || 'Not captured'} />
      </div>
      <button type="button" onClick={onOpen} className="mt-4 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Open Objection</button>
    </article>
  );
}

function ObjectionPanel({
  mode,
  form,
  saveState,
  message,
  onChange,
  onSave,
  onClose,
  onDelete,
}: {
  mode: 'closed' | 'add' | 'edit';
  form: ObjectionFormInput;
  saveState: SaveState;
  message: string;
  onChange: (form: ObjectionFormInput) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  if (mode === 'closed') {
    return (
      <aside className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <AlertTriangle className="h-6 w-6 text-brand-blue" />
        <h2 className="mt-3 text-xl font-bold text-navy">Select or add an objection</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">Track objections as commercial debt with proof, plan, status, and resolution notes.</p>
      </aside>
    );
  }

  const update = <Key extends keyof ObjectionFormInput>(key: Key, value: ObjectionFormInput[Key]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{mode === 'add' ? 'Add Objection' : 'Objection Detail'}</p>
          <h2 className="mt-2 text-xl font-bold text-navy">{mode === 'add' ? 'New objection' : form.objectionType}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-5 space-y-4">
        <TextArea label="Objection text" value={form.objectionText} onChange={(value) => update('objectionText', value)} required />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Account" value={form.accountName} onChange={(value) => update('accountName', value)} />
          <Field label="Opportunity" value={form.opportunityName} onChange={(value) => update('opportunityName', value)} />
          <Field label="Stakeholder" value={form.stakeholderName} onChange={(value) => update('stakeholderName', value)} />
          <SelectField label="Type" value={form.objectionType} options={objectionTypes} onChange={(value) => update('objectionType', value)} />
          <SelectField label="Impact" value={form.impact} options={objectionImpacts} onChange={(value) => update('impact', value)} />
          <SelectField label="Status" value={form.status} options={objectionStatuses} onChange={(value) => update('status', value)} />
          <Field label="Due date" type="date" value={form.dueDate} onChange={(value) => update('dueDate', value)} />
          <Field label="Resolved at" type="datetime-local" value={form.resolvedAt ? form.resolvedAt.slice(0, 16) : ''} onChange={(value) => update('resolvedAt', value ? new Date(value).toISOString() : '')} />
          <Field label="Tags" value={form.tags.join(', ')} onChange={(value) => update('tags', parseCommaList(value))} />
        </div>
        <TextArea label="Required proof" value={form.requiredProof} onChange={(value) => update('requiredProof', value)} />
        <TextArea label="Response plan" value={form.responsePlan} onChange={(value) => update('responsePlan', value)} />
        <TextArea label="Resolution note" value={form.resolutionNote} onChange={(value) => update('resolutionNote', value)} />
      </div>
      {message && <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : saveState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{message}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onSave} disabled={saveState === 'saving'} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saveState === 'saving' ? 'Saving...' : 'Save Objection'}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>
    </aside>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-bold text-navy">No objections captured yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">Add objections manually or capture sales activity with risk, competitor, procurement, support, or proof signals.</p>
      <button type="button" onClick={onAdd} className="mt-5 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">Add Objection</button>
    </div>
  );
}

function Metric({ label, value, tone = 'blue' }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p><p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-lg font-black ${toneClass(tone)}`}>{value}</p></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-sm text-gray-700">{value}</p></div>;
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

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2"><Filter className="h-4 w-4 text-gray-400" /><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-gray-700 outline-none">{options.map((option) => <option key={option} value={option}>{option === allFilter ? label : option}</option>)}</select></label>;
}

function SelectField<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: readonly Value[]; onChange: (value: Value) => void }) {
  return <label className="block"><span className="text-sm font-bold text-navy">{label}</span><select value={value} onChange={(event) => onChange(event.target.value as Value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><span className="text-sm font-bold text-navy">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" /></label>;
}

function TextArea({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block"><span className="text-sm font-bold text-navy">{label}{required ? ' *' : ''}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-[100px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10" /></label>;
}

function parseCommaList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function toneClass(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
}
