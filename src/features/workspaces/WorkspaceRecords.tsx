import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { controlClass, ghostPillClass, primaryPillClass } from '../../components/ui/daylightStyles';
import { formatCurrencyAmount, SUPPORTED_CURRENCIES } from '../../utils/money';
import { todayDateKey } from '../../utils/safeDate';
import { parseReportDefinition, reportMetricDefinitions } from '../../domain/reports/reportDefinition';
import { parseDashboardDefinition } from '../../domain/dashboards/dashboardDefinition';
import { loadPersonalWorkspaceRecords, savePersonalWorkspaceRecord, type PersonalWorkspaceRecord, type WorkspaceRecordCategory } from './personalWorkspaceStore';
import { WorkspaceAssistant } from './WorkspaceAssistant';

const categories = {
  accounts: 'Accounts', contacts: 'Contacts', catalog: 'Products & Brands', templates: 'Reporting templates',
  opportunities: 'Pipeline', quotes: 'Quotes', orders: 'Orders', activities: 'Activities',
} satisfies Record<WorkspaceRecordCategory, string>;
const statuses = {
  opportunities: ['lead', 'qualified', 'proposal', 'won', 'lost'],
  quotes: ['draft', 'sent', 'accepted', 'declined'],
  orders: ['confirmed', 'delivered', 'invoiced', 'paid', 'cancelled'],
};
const inputClass = `${controlClass} mt-1`;
const labelClass = 'block text-sm font-semibold text-ink';

function hasAmount(category: string): category is keyof typeof statuses {
  return Object.hasOwn(statuses, category);
}

function moneyTotal(records: PersonalWorkspaceRecord[]) {
  const totals = new Map<string, number>();
  for (const { details } of records) {
    if (typeof details.currency !== 'string' || typeof details.amount !== 'number') continue;
    totals.set(details.currency, (totals.get(details.currency) ?? 0) + details.amount);
  }
  return [...totals].map(([currency, amount]) => formatCurrencyAmount(amount, currency)).join(' · ') || '0';
}

export function WorkspaceRecords({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const [query, setQuery] = useSearchParams();
  const requested = query.get('view') ?? '';
  const view = Object.hasOwn(categories, requested) ? requested as WorkspaceRecordCategory : requested === 'assistant' ? 'assistant' : 'overview';
  const [records, setRecords] = useState<PersonalWorkspaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; record?: PersonalWorkspaceRecord } | null>(null);

  useEffect(() => {
    let current = true;
    void loadPersonalWorkspaceRecords(userId, workspaceId).then(result => { if (current) setRecords(result); })
      .catch(() => { if (current) setError('Workspace records could not be loaded. Reload to retry.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [userId, workspaceId]);

  if (loading) return <p role="status" className="text-sm text-muted">Loading workspace records…</p>;
  if (error) return <p role="alert" className="text-sm text-tint-red-solid">{error}</p>;
  const accounts = records.filter(record => record.category === 'accounts');
  const selectView = (next: string) => { setEditing(null); setQuery({ workspace: workspaceId, view: next }); };
  const selectedRows = records.filter(record => record.category === view);
  const pipeline = records.filter(record => record.category === 'opportunities' && ['qualified','proposal'].includes(String(record.details.status)));
  const orders = records.filter(record => record.category === 'orders' && record.details.status !== 'cancelled');

  return <div className="space-y-4">
    <nav aria-label="Workspace sections" className="flex flex-wrap gap-2">
      {Object.entries({ overview: 'Overview', ...categories, assistant: 'Ask Memoire' }).map(([key, label]) => (
        <button key={key} type="button" aria-current={key === view ? 'page' : undefined} onClick={() => selectView(key)} className={`${ghostPillClass} ${key === view ? 'ring-2 ring-brand-blue/40' : ''}`}>{label}</button>
      ))}
    </nav>
    {view === 'overview' ? <dl className="grid grid-cols-2 gap-4 rounded-panel bg-white p-5 shadow-panel sm:grid-cols-4">
      {[
        ['Qualified pipeline', `${pipeline.length} · ${moneyTotal(pipeline)}`],
        ['Quotes', records.filter(row => row.category === 'quotes').length],
        ['Orders', orders.length],
        ['Recorded sales', moneyTotal(orders.filter(row => ['invoiced','paid'].includes(String(row.details.status))))],
      ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-muted">{label}</dt><dd className="mt-1 font-display text-xl font-bold">{value}</dd></div>)}
    </dl> : view === 'assistant' ? <WorkspaceAssistant key={workspaceId} userId={userId} workspaceId={workspaceId} /> : (
      <section className="rounded-panel bg-white p-5 shadow-panel" aria-label={categories[view]}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display font-bold">{categories[view]}</h2>
          {view !== 'templates' && (!editing || editing.record) && <button type="button" className={primaryPillClass} disabled={Boolean(editing) || (view === 'contacts' && !accounts.length)}
            onClick={() => setEditing({ id: crypto.randomUUID() })}>Add record</button>}
        </div>
        {view === 'contacts' && !accounts.length && <p className="text-sm text-muted">Add an account before adding a contact.</p>}
        {editing && <RecordForm key={editing.id} category={view} original={editing.record} accounts={accounts} onCancel={() => setEditing(null)} onSave={async draft => {
          const saved = await savePersonalWorkspaceRecord(userId, workspaceId, draft, editing.id, Boolean(editing.record));
          setRecords(current => [...current.filter(row => row.id !== saved.id), saved]);
          setEditing(null);
        }} />}
        {!selectedRows.length && !editing && <p className="text-sm text-muted">None yet</p>}
        <ul className="divide-y divide-line">{selectedRows.map(record => <li key={record.id} className="flex items-start justify-between gap-3 py-3 text-sm">
          <div className="min-w-0 break-words">
            <p className="font-semibold">{record.name}</p>
            <p className="text-xs text-muted">{[accounts.find(row => row.id === record.account_id)?.name, record.details.status,
              hasAmount(record.category) ? formatCurrencyAmount(Number(record.details.amount), String(record.details.currency)) : null,
              record.details.date, record.details.email, record.details.kind].filter(Boolean).join(' · ')}</p>
            {record.category === 'templates' && <WorkspaceTemplateResult template={record} records={records} />}
          </div>
          <button type="button" className={ghostPillClass} onClick={() => setEditing({ id: record.id, record })} aria-label={`Edit ${record.name}`}>Edit</button>
        </li>)}</ul>
      </section>
    )}
  </div>;
}

function WorkspaceTemplateResult({ template, records }: { template: PersonalWorkspaceRecord; records: PersonalWorkspaceRecord[] }) {
  const [open, setOpen] = useState(false);
  let values: Array<{ label: string; value: string }> = [];
  let error = '';
  if (open) {
    try {
      if (template.details.kind === 'dashboard') {
        const dashboard = parseDashboardDefinition(template.details.layout);
        values = dashboard.widgets.map(widget => {
          const report = records.find(row => row.category === 'templates' && row.id === widget.reportId);
          const metric = report ? templateMetrics(report, records).find(row => row.key === widget.metric) : undefined;
          return { label: widget.title, value: metric?.value || 'Unavailable' };
        });
      } else {
        values = templateMetrics(template, records);
      }
    } catch {
      error = 'This template could not be run.';
    }
  }
  return <div className="mt-2">
    <button className={ghostPillClass} type="button" aria-expanded={open} onClick={() => setOpen(current => !current)}>{open ? 'Hide results' : 'Run template'}</button>
    {open && (error ? <p role="alert" className="mt-2 text-sm text-tint-red-solid">{error}</p> : <dl className="mt-2 space-y-1">
      {values.map((row, index) => <div key={`${row.label}:${index}`} className="flex gap-2"><dt className="font-semibold">{row.label}</dt><dd className="text-muted">{row.value}</dd></div>)}
      {!values.length && <div className="text-sm text-muted"><dt>Metrics</dt><dd>None configured</dd></div>}
    </dl>)}
  </div>;
}

function templateMetrics(template: PersonalWorkspaceRecord, records: PersonalWorkspaceRecord[]) {
  const definition = parseReportDefinition(template.details.layout);
  const opportunities = definition.dataset === 'opportunities';
  const rows = records.filter(row => opportunities
    ? row.category === 'opportunities' && (definition.population === 'all' || (row.details.status === 'lead') === (definition.population === 'leads'))
    : row.category === 'orders' && row.details.status !== 'cancelled');
  return definition.metrics.map(key => {
    let value = 'Unavailable';
    if (key === 'recordCount') value = String(rows.length);
    else if (key === 'pipeline') value = moneyTotal(rows.filter(row => ['qualified','proposal'].includes(String(row.details.status))));
    else if (key === 'won') value = moneyTotal(rows.filter(row => row.details.status === 'won'));
    else if (key === 'orderValue') value = moneyTotal(rows);
    else if (key === 'received') value = moneyTotal(rows.filter(row => row.details.status === 'paid'));
    else if (key === 'outstanding') value = moneyTotal(rows.filter(row => row.details.status === 'invoiced'));
    else if (key === 'winRate') {
      const decided = rows.filter(row => ['won','lost'].includes(String(row.details.status)));
      if (decided.length >= 3) value = `${(100 * decided.filter(row => row.details.status === 'won').length / decided.length).toFixed(1)}%`;
    }
    return { key, label: reportMetricDefinitions[key].label, value };
  });
}

function RecordForm({ category, original, accounts, onSave, onCancel }: {
  category: WorkspaceRecordCategory; original?: PersonalWorkspaceRecord; accounts: PersonalWorkspaceRecord[];
  onSave: (record: Omit<PersonalWorkspaceRecord, 'id'>) => Promise<void>; onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const details = original?.details ?? {};
  const monetary = hasAmount(category);
  const displayValue = (key: string) => String(details[key] ?? '');
  const textFields = category === 'accounts' ? ['industry','location'] : category === 'contacts' ? ['role','email','phone']
    : category === 'catalog' ? ['kind','code','description'] : category === 'templates' ? [] : ['notes'];

  return <form className="mb-3 grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2" onSubmit={async event => {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    const next = { ...details };
    for (const key of textFields) next[key] = String(data.get(key) ?? '').trim();
    if (monetary) {
      next.amount = Number(data.get('amount'));
      next.currency = String(data.get('currency'));
      next.status = String(data.get('status'));
    }
    if (data.has('date')) next.date = String(data.get('date'));
    setSaving(true);
    setError('');
    try { await onSave({ category, name, details: next, account_id: String(data.get('account') ?? '') || null }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The change could not be saved.'); }
    finally { setSaving(false); }
  }}>
    <label className={labelClass}>Name<input className={inputClass} name="name" required maxLength={200} defaultValue={original?.name} /></label>
    {(category === 'contacts' || category === 'activities' || monetary) && <label className={labelClass}>Account<select className={inputClass} name="account" required={category === 'contacts'} defaultValue={original?.account_id ?? ''}>
      <option value="">Choose an account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
    </select></label>}
    {monetary && <>
      <label className={labelClass}>Stage or status<select name="status" className={`${inputClass} capitalize`} defaultValue={displayValue('status') || statuses[category][0]}>{statuses[category].map(status => <option key={status} value={status}>{status}</option>)}</select></label>
      <label className={labelClass}>Amount<input className={inputClass} name="amount" type="number" min="0" max="1000000000000000" step="any" required defaultValue={displayValue('amount') || '0'} /></label>
      <label className={labelClass}>Currency<select className={inputClass} name="currency" defaultValue={displayValue('currency') || 'VND'}>{SUPPORTED_CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label>
    </>}
    {(monetary || category === 'activities') && <label className={labelClass}>Date<input className={inputClass} required type="date" name="date" defaultValue={displayValue('date') || todayDateKey()} /></label>}
    {textFields.map(key => <label key={key} className={`${labelClass} capitalize`}>{key}<input className={inputClass} name={key} type={key === 'email' ? 'email' : 'text'} maxLength={2000} defaultValue={displayValue(key)} /></label>)}
    {error && <p role="alert" className="text-sm text-tint-red-solid sm:col-span-2">{error}</p>}
    <div className="flex gap-2 sm:col-span-2"><button type="submit" className={primaryPillClass} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button type="button" className={ghostPillClass} disabled={saving} onClick={onCancel}>Cancel</button></div>
  </form>;
}
