import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  Flag,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import { formatCompactCurrencyAmount } from '../../utils/currency';
import {
  createOperatingContext,
  deleteOperatingContext,
  emptyOperatingContextInput,
  isOperatingContextClosed,
  loadOperatingContext,
  operatingContextToForm,
  updateOperatingContext,
  type OperatingContextFormInput,
  type OperatingContextRecord,
  type OperatingContextType,
} from '../../services/operatingContextStore';

type Filter = 'active' | 'initiative' | 'play' | 'all';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function OperatingSystemPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;
  const [records, setRecords] = useState<OperatingContextRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [panelMode, setPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingRecord, setEditingRecord] = useState<OperatingContextRecord | null>(null);
  const [form, setForm] = useState<OperatingContextFormInput>(emptyOperatingContextInput);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const requestedContextId = searchParams.get('contextId') || '';

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const next = await loadOperatingContext(dataUserId);
      if (!mounted) return;
      setRecords(next);
      setLoading(false);
    }
    if (!authLoading) load();
    return () => {
      mounted = false;
    };
  }, [authLoading, dataUserId]);

  const activeRecords = useMemo(() => records.filter((record) => !isOperatingContextClosed(record)), [records]);
  const visibleRecords = useMemo(() => records.filter((record) => {
    if (filter === 'active') return !isOperatingContextClosed(record);
    if (filter === 'initiative') return record.contextType === 'initiative';
    if (filter === 'play') return record.contextType === 'play';
    return true;
  }), [filter, records]);
  const focusRecord = useMemo(() => [...activeRecords].sort(operatingPrioritySort)[0] || null, [activeRecords]);
  const dueCount = activeRecords.filter((record) => record.nextDate && record.nextDate <= todayKey()).length;
  const missingActionCount = activeRecords.filter((record) => !record.nextAction.trim()).length;

  const openAdd = () => {
    setEditingRecord(null);
    setForm({ ...emptyOperatingContextInput, payload: {} });
    setPanelMode('add');
    setSaveState('idle');
    setMessage('');
  };

  const openEdit = (record: OperatingContextRecord) => {
    setEditingRecord(record);
    setForm(operatingContextToForm(record));
    setPanelMode('edit');
    setSaveState('idle');
    setMessage('');
  };

  const closePanel = () => {
    setPanelMode('closed');
    setEditingRecord(null);
    setSaveState('idle');
    setMessage('');
  };

  useEffect(() => {
    if (!requestedContextId || loading) return;
    const record = records.find((item) => item.id === requestedContextId);
    if (record) {
      setEditingRecord(record);
      setForm(operatingContextToForm(record));
      setPanelMode('edit');
      setSaveState('idle');
      setMessage('');
    }
    setSearchParams({}, { replace: true });
    // Query parameters are one-shot entry points from Today.
  }, [loading, records, requestedContextId, setSearchParams]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      setSaveState('error');
      setMessage('Add a title first.');
      return;
    }

    setSaveState('saving');
    setMessage('Saving...');
    const result = editingRecord
      ? await updateOperatingContext(editingRecord, form, dataUserId)
      : await createOperatingContext(form, dataUserId);
    setRecords((current) => [result.record, ...current.filter((item) => item.id !== result.record.id)]);
    setEditingRecord(result.record);
    setForm(operatingContextToForm(result.record));
    setPanelMode('edit');
    setSaveState(result.warning ? 'error' : 'saved');
    setMessage(result.warning || (result.mode === 'cloud' ? 'Synced to your account.' : 'Saved in this browser.'));
  };

  const handleDelete = async () => {
    if (!editingRecord) return;
    if (!window.confirm(`Delete ${editingRecord.title}?`)) return;
    await deleteOperatingContext(editingRecord, dataUserId);
    setRecords((current) => current.filter((item) => item.id !== editingRecord.id));
    closePanel();
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Operating System</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Move the must-win work.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Turn targets, initiatives, and account plays into the next action for today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataModePill
            compact
            isLoading={authLoading || loading}
            isAuthenticated={isAuthenticated}
            isSupabaseConfigured={isSupabaseConfigured}
            cloudAvailable={isSupabaseConfigured}
            hasSampleData={sampleDataActive}
          />
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            Add priority
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading operating priorities...
        </div>
      ) : records.length === 0 ? (
        <OperatingEmptyState onAdd={openAdd} />
      ) : (
        <>
          {focusRecord && <OperatingFocus record={focusRecord} onOpen={() => openEdit(focusRecord)} />}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Active" value={activeRecords.length} tone="blue" />
            <Metric label="Initiatives" value={activeRecords.filter((record) => record.contextType === 'initiative').length} tone="green" />
            <Metric label="Due now" value={dueCount} tone={dueCount ? 'red' : 'green'} />
            <Metric label="No next action" value={missingActionCount} tone={missingActionCount ? 'amber' : 'green'} />
          </section>

          <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-navy">Operating priorities</h2>
                <p className="mt-1 text-xs text-gray-500">{visibleRecords.length} visible</p>
              </div>
              <div className="inline-flex w-fit rounded-lg bg-gray-100 p-1" aria-label="Operating priority filter">
                {(['active', 'initiative', 'play', 'all'] as Filter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize ${filter === value ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}
                  >
                    {value === 'play' ? 'Plays' : value === 'initiative' ? 'Initiatives' : value}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {visibleRecords.map((record) => (
                <OperatingRow key={record.id} record={record} onOpen={() => openEdit(record)} />
              ))}
            </div>
          </section>
        </>
      )}

      <OperatingPanel
        mode={panelMode}
        form={form}
        record={editingRecord}
        saveState={saveState}
        message={message}
        onChange={setForm}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={closePanel}
      />
    </div>
  );
}

function OperatingFocus({ record, onOpen }: { record: OperatingContextRecord; onOpen: () => void }) {
  const action = record.nextAction || `Define the next milestone for ${record.title}`;
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge label="Do next" tone="green" />
            <Badge label={record.contextType === 'initiative' ? 'Initiative' : 'Account play'} tone="blue" />
            {record.nextDate && <Badge label={`Due ${record.nextDate}`} tone={record.nextDate <= todayKey() ? 'red' : 'gray'} />}
          </div>
          <h2 className="mt-3 text-xl font-bold text-navy">{action}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-900/75">{record.title}{record.summary ? ` / ${record.summary}` : ''}</p>
        </div>
        <button type="button" onClick={onOpen} className="inline-flex w-fit items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
          Work priority
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function OperatingRow({ record, onOpen }: { record: OperatingContextRecord; onOpen: () => void }) {
  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_160px_44px] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={record.contextType === 'initiative' ? 'Initiative' : 'Play'} tone={record.contextType === 'initiative' ? 'green' : 'blue'} />
          {record.status && <Badge label={record.status} tone={isOperatingContextClosed(record) ? 'gray' : /block|risk|late/i.test(record.status) ? 'red' : 'amber'} />}
        </div>
        <p className="mt-2 truncate text-sm font-bold text-navy" title={record.title}>{record.title}</p>
        <p className="mt-1 truncate text-xs text-gray-500" title={record.summary}>{record.summary || record.period || 'No summary captured'}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-800" title={record.nextAction}>{record.nextAction || 'Define next milestone'}</p>
        <p className="mt-1 text-xs text-gray-500">{record.nextDate ? `Due ${record.nextDate}` : 'No due date'}{record.owner ? ` / ${record.owner}` : ''}</p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Value at stake</p>
        <p className="mt-1 text-sm font-bold text-gray-800">{record.valueAtStake === null ? 'Not set' : formatCompactCurrencyAmount(record.valueAtStake, 'SGD')}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-brand-blue"
        title={`Open ${record.title}`}
        aria-label={`Open ${record.title}`}
      >
        <Eye className="h-4 w-4" />
      </button>
    </div>
  );
}

function OperatingPanel({
  mode,
  form,
  record,
  saveState,
  message,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  mode: 'closed' | 'add' | 'edit';
  form: OperatingContextFormInput;
  record: OperatingContextRecord | null;
  saveState: SaveState;
  message: string;
  onChange: (form: OperatingContextFormInput) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  if (mode === 'closed') return null;
  const update = <Key extends keyof OperatingContextFormInput>(key: Key, value: OperatingContextFormInput[Key]) => {
    onChange({ ...form, [key]: value });
  };
  const details = payloadDetails(form.payload);

  return (
    <>
      <button type="button" aria-label="Close operating priority" onClick={onClose} className="fixed inset-y-0 left-0 right-0 top-16 z-40 bg-slate-950/25 lg:left-[220px]" />
      <aside className="fixed bottom-0 right-0 top-16 z-50 w-full overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-2xl sm:max-w-[620px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{mode === 'add' ? 'New priority' : 'Operating priority'}</p>
            <h2 className="mt-2 text-xl font-bold text-navy">{mode === 'add' ? 'Add must-win work' : record?.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Type</p>
            <div className="inline-flex rounded-lg bg-gray-100 p-1">
              {(['initiative', 'play'] as OperatingContextType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update('contextType', type)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold ${form.contextType === type ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}
                >
                  {type === 'initiative' ? 'Initiative' : 'Account play'}
                </button>
              ))}
            </div>
          </div>
          <Field label="Title" value={form.title} onChange={(value) => update('title', value)} required />
          <TextArea label="Objective / summary" value={form.summary} onChange={(value) => update('summary', value)} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status" value={form.status} onChange={(value) => update('status', value)} />
            <Field label="Period / stage" value={form.period} onChange={(value) => update('period', value)} />
            <Field label="Owner" value={form.owner} onChange={(value) => update('owner', value)} />
            <Field
              label="Value at stake (SGD)"
              type="number"
              value={form.valueAtStake?.toString() || ''}
              onChange={(value) => update('valueAtStake', value ? Number(value) : null)}
            />
          </div>
          <TextArea label="Next action" value={form.nextAction} onChange={(value) => update('nextAction', value)} />
          <Field label="Next date" type="date" value={form.nextDate} onChange={(value) => update('nextDate', value)} />

          {details.length > 0 && (
            <details className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <summary className="cursor-pointer text-sm font-bold text-navy">Imported details</summary>
              <dl className="mt-3 space-y-3">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</dt>
                    <dd className="mt-1 text-sm leading-6 text-gray-700">{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>

        {message && (
          <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : saveState === 'error' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
            {message}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onSave} disabled={saveState === 'saving'} className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            <Save className="h-4 w-4" />
            {saveState === 'saving' ? 'Saving...' : 'Save priority'}
          </button>
          {record && (
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function OperatingEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
      <Flag className="mx-auto h-8 w-8 text-brand-blue" />
      <h2 className="mt-4 text-xl font-bold text-navy">No operating priority yet.</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">Add one must-win initiative or import the Operation System workbook, then Memoire can place it into Today.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4" />
          Add priority
        </button>
        <Link to="/app/imports" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">
          Import review
        </Link>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'green' | 'amber' | 'red' }) {
  const classes = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${classes}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  const classes = {
    blue: 'bg-blue-50 text-brand-blue',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-100 text-gray-600',
  }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${classes}`}>{label}</span>;
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}{required ? ' *' : ''}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-brand-blue focus:bg-white" />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold leading-6 text-gray-800 outline-none focus:border-brand-blue focus:bg-white" />
    </label>
  );
}

function payloadDetails(payload: Record<string, unknown>) {
  const labelMap: Record<string, string> = {
    keySteps: 'Key steps',
    trigger: 'Trigger',
    targetAccount: 'Target account',
    brand: 'Brand',
    objective: 'Objective',
    kr1: 'KR1',
    kr2: 'KR2',
    kr3: 'KR3',
    plays: 'Linked plays',
    progress: 'Progress',
  };
  return Object.entries(payload)
    .filter(([key, value]) => key in labelMap && typeof value === 'string' && value.trim())
    .map(([key, value]) => [labelMap[key], String(value)] as [string, string]);
}

function operatingPrioritySort(left: OperatingContextRecord, right: OperatingContextRecord) {
  const today = todayKey();
  const score = (record: OperatingContextRecord) => {
    if (record.nextDate && record.nextDate < today) return 5;
    if (record.nextDate === today) return 4;
    if (!record.nextAction.trim()) return 3;
    if (/block|risk|late/i.test(record.status)) return 3;
    return record.contextType === 'initiative' ? 2 : 1;
  };
  return score(right) - score(left) || (left.nextDate || '9999-12-31').localeCompare(right.nextDate || '9999-12-31');
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
