import { PageHeader } from '../../components/layout/PageFrame';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import { useAuthContext } from '../../auth/authContext';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadPortfolio, type PortfolioScope } from '../../services/portfolioStore';
import { portfolioNodes, type PortfolioNode } from '../../domain/portfolio/portfolioCatalog';
import { loadSavedReports, type ReportLibrary } from '../../services/reportStore';
import { assertDashboardScope, loadSavedDashboards, saveDashboardDefinition, type DashboardLibrary } from '../../services/dashboardStore';
import { executeWorkspaceDashboard } from '../../services/dashboardData';
import { dashboardDimensions, newDashboard, parseDashboardDefinition, type DashboardDefinition, type DashboardDimension, type DashboardWidget } from '../../domain/dashboards/dashboardDefinition';
import { barGroups, measureText, widgetError, type DashboardRun } from '../../domain/dashboards/dashboardEngine';
import type { SavedDashboard } from '../../domain/dashboards/dashboardRecord';
import { reportFields, reportMetricDefinitions } from '../../domain/reports/reportDefinition';
import { reportCsv, reportMetadata, type ReportGroup, type ReportRun } from '../../domain/reports/reportEngine';
const control = 'min-w-0 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-navy';
const primary = 'min-h-11 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-navy disabled:opacity-50';
const kinds = { businessUnit: 'unit', brand: 'brand', productGroup: 'group', product: 'product' } as const;
const text = (value: string | number | boolean | null | undefined) => value == null || value === '' ? '—' : typeof value === 'number' ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value) : String(value);
function Bars({ run, widget, onGroup }: { run: ReportRun; widget: DashboardWidget; onGroup: (group: ReportGroup) => void }) {
  const groups = barGroups(run, widget.metric), values = groups.map(group => group.metrics[widget.metric]?.value ?? 0);
  const min = Math.min(0, ...values), max = widget.metric === 'winRate' ? 1 : Math.max(0, ...values), span = max - min || 1, zero = -min / span * 100;
  return <div className="mt-4 space-y-2">
    <p className="text-xs text-gray-500">{groups.length} of {run.groups.length} groups · descending · shared scale {text(min)}–{widget.metric === 'winRate' ? '100%' : text(max)}</p>
    {!groups.length && <p className="py-4 text-sm text-gray-500">No matching groups.</p>}
    {groups.map(group => { const value = group.metrics[widget.metric]?.value, width = Math.abs(value ?? 0) / span * 100, left = (Math.min(value ?? 0, 0) - min) / span * 100;
      return <button key={group.key} type="button" className="block min-h-11 w-full rounded-lg p-2 text-left hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={() => onGroup(group)}>
        <span className="flex flex-wrap justify-between gap-2 text-sm"><span className="min-w-0 break-words font-semibold text-navy">{group.labels.join(' / ') || 'All records'}</span><span>{measureText(widget.metric, group.metrics[widget.metric])}</span></span>
        <span aria-hidden="true" className="relative mt-2 block h-3 overflow-hidden rounded bg-gray-100"><span className="absolute h-full border-l border-gray-400" style={{ left: `${zero}%` }} /><span className="absolute h-full bg-blue-600" style={{ width: `${width}%`, left: `${left}%` }} /></span>
        <span className="mt-1 block text-xs text-gray-500">{group.sourceIds.length} source records · inspect</span>
      </button>;
    })}
  </div>;
}
function GroupTable({ run, widget, onGroup }: { run: ReportRun; widget: DashboardWidget; onGroup: (group: ReportGroup) => void }) {
  const [page, setPage] = useState(0), size = 20;
  return <div className="mt-4"><div className="overflow-x-auto"><table className="report-table w-full text-left text-sm"><thead><tr>{run.definition.groupBy.map(field => <th key={field}>{reportFields[field].label}</th>)}<th>{reportMetricDefinitions[widget.metric].label}</th><th>Sources</th></tr></thead><tbody>{run.groups.slice(page * size, (page + 1) * size).map(group => <tr key={group.key}>{group.labels.map((label, index) => <td key={index}>{label}</td>)}<td>{measureText(widget.metric, group.metrics[widget.metric])}</td><td><button className="min-h-11 font-semibold text-brand-blue" onClick={() => onGroup(group)}>View {group.sourceIds.length} records</button></td></tr>)}</tbody></table></div>
    {!run.groups.length && <p className="py-4 text-sm text-gray-500">No matching groups.</p>}
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><button className={secondary} disabled={!page} onClick={() => setPage(p => p - 1)}>Previous groups</button><span>{run.groups.length ? page * size + 1 : 0}–{Math.min((page + 1) * size, run.groups.length)} of {run.groups.length} groups</span><button className={secondary} disabled={(page + 1) * size >= run.groups.length} onClick={() => setPage(p => p + 1)}>Next groups</button></div>
  </div>;
}
export function DashboardsPage() {
  const { user, loading } = useAuthContext(), demo = useDemoWorkspaceMode(), sample = demo || hasLocalSampleData();
  const scope = useMemo<PortfolioScope>(() => ({ userId: sample ? null : user?.id || null, sampleDataActive: sample }), [sample, user?.id]);
  const scopeKey = `${scope.userId || 'local'}:${sample}`;
  const [params, setParams] = useSearchParams(), requested = params.get('dashboard') || '';
  const [library, setLibrary] = useState<{ scopeKey: string; boards: DashboardLibrary; reports: ReportLibrary; nodes: PortfolioNode[] } | null>(null);
  const [definition, setDefinition] = useState<DashboardDefinition>(newDashboard), [editing, setEditing] = useState<{ id: string; version: number } | null>(null);
  const [run, setRun] = useState<DashboardRun | null>(null), [stale, setStale] = useState(false), [openEditor, setOpenEditor] = useState(true), [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [reload, setReload] = useState(0), [detailPage, setDetailPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches);
  useEffect(() => { const media = window.matchMedia('(min-width: 640px)'), adapt = () => setFiltersOpen(media.matches); media.addEventListener('change', adapt); return () => media.removeEventListener('change', adapt); }, []);
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setLibrary(null); setRun(null); setEditing(null); setDefinition(newDashboard()); setError(''); setMessage(''); setBusy('library');
    void Promise.all([loadSavedDashboards(scope), loadSavedReports(scope), loadPortfolio(scope)]).then(([boards, reports, catalog]) => {
      if (cancelled) return;
      setLibrary({ scopeKey, boards, reports, nodes: portfolioNodes(catalog.records) });
      const record = requested === 'new' ? undefined : requested ? boards.records.find(row => row.id === requested) : boards.records.find(row => !row.archived);
      if (requested && requested !== 'new' && (!record || record.archived)) { setError('This dashboard is unavailable or archived. Choose an active dashboard or restore it.'); return; }
      if (record) { setDefinition(record.definition); setEditing({ id: record.id, version: record.version }); }
    }).catch(failure => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Dashboard library unavailable.'); })
      .finally(() => { if (!cancelled) setBusy(''); });
    return () => { cancelled = true; };
  }, [scope, scopeKey, loading, requested, reload]);
  const current = library?.scopeKey === scopeKey ? library : null;
  const filterParam = params.get('dashboardFilters');
  const effective = useMemo(() => {
    try { return filterParam ? parseDashboardDefinition({ ...definition, filters: JSON.parse(filterParam) }) : definition; }
    catch { return null; }
  }, [definition, filterParam]);
  const visible = effective && run?.scopeKey === scopeKey && JSON.stringify(run.definition) === JSON.stringify(effective) ? run : null;
  const activeReports = current?.reports.records.filter(report => !report.archived) || [];
  const clearDetail = (next = new URLSearchParams(params)) => { next.delete('widget'); next.delete('group'); setParams(next, { replace: true }); setDetailPage(0); };
  const change = (next: DashboardDefinition) => { setDefinition(next); if (params.has('widget') || params.has('group')) clearDetail(); setMessage(''); };
  const filters = effective?.filters || [];
  const filter = (field: DashboardDimension, value: string) => {
    const next = new URLSearchParams(params), values = filters.filter(row => row.field !== field);
    if (value !== '') values.push({ field, id: value === '__unassigned__' ? null : value });
    next.set('dashboardFilters', JSON.stringify(values));
    next.delete('widget'); next.delete('group'); setParams(next); setDetailPage(0);
  };
  const select = (record: SavedDashboard) => {
    const next = new URLSearchParams(params); next.set('dashboard', record.id); next.delete('dashboardFilters'); next.delete('widget'); next.delete('group'); setParams(next);
    setDefinition(record.definition); setEditing({ id: record.id, version: record.version }); setRun(null); setOpenEditor(true);
  };
  const save = async (record?: SavedDashboard, archive?: boolean) => {
    setBusy('save'); setError(''); setMessage('');
    try {
      const id = record?.id || editing?.id || `dashboard-${crypto.randomUUID()}`;
      const boards = await saveDashboardDefinition(scope, { id, expectedVersion: record?.version || editing?.version || 0,
        state: { definition: parseDashboardDefinition(record?.definition || effective), archived: archive ?? false } });
      setLibrary(old => old?.scopeKey === scopeKey ? { ...old, boards } : old);
      if (!record) { const saved = boards.records.find(row => row.id === id)!; setEditing({ id, version: saved.version }); setDefinition(saved.definition); if (!editing) { const next = new URLSearchParams(params); next.set('dashboard', id); setParams(next, { replace: true }); } }
      if (record?.id === editing?.id) { setEditing(null); setRun(null); setDefinition(newDashboard()); }
      setMessage(boards.message);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Dashboard was not saved.'); }
    finally { setBusy(''); }
  };
  const execute = async () => {
    if (!effective) return;
    setBusy('run'); setError(''); setMessage(''); clearDetail();
    try { const next = await executeWorkspaceDashboard(scope, effective, scopeKey); setDefinition(next.definition); setRun(next); setStale(false); setOpenEditor(false); }
    catch (failure) { setStale(true); setError(failure instanceof Error ? failure.message : 'Refresh failed.'); }
    finally { setBusy(''); }
  };
  const download = async () => {
    if (!visible || stale) return;
    setBusy('export'); setError('');
    try {
      assertDashboardScope(scope); const zip = new JSZip();
      visible.results.forEach((result, index) => { if (!result.run) return; const folder = zip.folder(`report-${index + 1}`)!;
        folder.file('details.csv', reportCsv(result.run, 'details')); folder.file('summary.csv', reportCsv(result.run, 'summary')); folder.file('report-metadata.json', reportMetadata(result.run)); });
      zip.file('dashboard-metadata.json', JSON.stringify({ definition: visible.definition, runAt: visible.runAt, reports: visible.results.map(result => ({ reportId: result.reportId, version: result.version, error: result.error })),
        widgets: visible.definition.widgets.map(widget => ({ id: widget.id, error: widgetError(widget, visible.results.find(result => result.reportId === widget.reportId)) })), mode: 'Current captured run; global filters narrow sources before each report query; not a historical or atomic accounting snapshot.' }, null, 2));
      const blob = await zip.generateAsync({ type: 'blob' }); assertDashboardScope(scope);
      const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'memoire-dashboard.zip'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Exported full report rows, summaries and dashboard metadata. Unavailable sources are identified in metadata.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not export dashboard.'); }
    finally { setBusy(''); }
  };
  const inspect = (widget: DashboardWidget, group?: ReportGroup) => {
    const next = new URLSearchParams(params); next.set('widget', widget.id); if (group) next.set('group', group.key); else next.delete('group'); setParams(next); setDetailPage(0);
  };
  const selectedWidget = visible?.definition.widgets.find(widget => widget.id === params.get('widget'));
  const selectedRun = visible?.results.find(result => result.reportId === selectedWidget?.reportId)?.run;
  const selectedGroup = selectedRun?.groups.find(group => group.key === params.get('group'));
  const invalidGroup = Boolean(selectedRun && params.has('group') && !selectedGroup);
  const selectedIds = selectedGroup ? new Set(selectedGroup.sourceIds) : null;
  const detailRows = selectedRun?.rows.filter(row => !selectedIds || selectedIds.has(row.id)) || [];
  const updateWidget = (index: number, widget: DashboardWidget) => change({ ...definition, widgets: definition.widgets.map((old, i) => i === index ? widget : old) });
  return <div className="min-w-0 space-y-5" data-testid="dashboards-page">
    <PageHeader title="Dashboards" description="Compare saved report results, then inspect the records behind each number." actions={<button className={secondary} disabled={Boolean(busy)} onClick={() => setReload(value => value + 1)}>Reload library</button>} />
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-navy">{message}</p>}
    {filterParam && !effective && <p role="alert">Invalid dashboard filters in this link. <button className={secondary} onClick={() => { const next = new URLSearchParams(params); next.delete('dashboardFilters'); setParams(next); }}>Reset link filters</button></p>}
    {!current ? <p>{busy || loading ? 'Loading dashboards…' : 'Reload the library to try again.'}</p> : <>
      <p className="rounded-lg bg-blue-50 p-3 text-sm text-navy">{current.boards.message}</p>
      <div className="flex flex-wrap items-end gap-3"><label className="w-full min-w-0 text-sm font-semibold sm:w-auto sm:min-w-64 sm:flex-1">Saved dashboard<select aria-label="Saved dashboard" className={control} value={editing?.id || ''} disabled={Boolean(busy)} onChange={event => { const record = current.boards.records.find(row => row.id === event.target.value); if (record) select(record); }}><option value="">Unsaved dashboard</option>{current.boards.records.filter(row => !row.archived).map(row => <option key={row.id} value={row.id}>{row.definition.name}</option>)}</select></label>
        <button className={secondary} disabled={Boolean(busy)} onClick={() => { const next = new URLSearchParams(params); ['dashboardFilters', 'widget', 'group'].forEach(key => next.delete(key)); next.set('dashboard', 'new'); setParams(next); setDefinition(newDashboard()); setEditing(null); setRun(null); setOpenEditor(true); }}>New dashboard</button>
        <button className={primary} disabled={Boolean(busy) || !effective?.widgets.length} onClick={() => void execute()}>{busy === 'run' ? 'Refreshing…' : 'Refresh dashboard'}</button>
        <button className={secondary} disabled={Boolean(busy) || !visible || stale} onClick={() => void download()}>Export dashboard data</button>
      </div>
      <details open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)} className="rounded-xl border border-gray-200 bg-white p-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-navy">Portfolio filters · {filters.length ? filters.map(item => `${dashboardDimensions[item.field]}: ${item.id === null ? 'Unassigned' : current.nodes.find(node => node.id === item.id)?.name || 'Missing entry'}`).join(' / ') : 'All products and units'}</summary><section aria-label="Dashboard filters" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(dashboardDimensions) as DashboardDimension[]).map(field => { const selected = filters.find(f => f.field === field), nodes = current.nodes.filter(node => node.kind === kinds[field]); return <label key={field} className="min-w-0 text-sm font-semibold">{dashboardDimensions[field]} filter<select aria-label={`${dashboardDimensions[field]} filter`} className={control} disabled={Boolean(busy)} value={selected ? selected.id === null ? '__unassigned__' : selected.id : ''} onChange={event => filter(field, event.target.value)}><option value="">All</option><option value="__unassigned__">Unassigned</option>{selected?.id && !nodes.some(node => node.id === selected.id) && <option value={selected.id}>Missing catalog entry ({selected.id})</option>}{nodes.map(node => <option key={node.id} value={node.id}>{node.name}{node.status === 'retired' ? ' (retired)' : ''} · {node.id.slice(-8)}</option>)}</select></label>; })}</section></details>
      {visible ? <section data-testid="dashboard-results" className="space-y-4" aria-busy={busy === 'run'}>
        <div><h3 className="text-lg font-bold text-navy">{visible.definition.name}</h3><p className="mt-1 break-words text-sm text-gray-500">{visible.definition.description}</p><p className="mt-1 text-xs text-gray-500">Captured {visible.runAt} · manual refresh · current classification · filters apply before each report's own conditions.</p>{(stale || busy === 'run') && <p role="status" className="mt-2 font-semibold text-amber-800">{busy === 'run' ? 'Refreshing. Previous captured results remain visible.' : 'Refresh failed. These are previous results; export is disabled until refresh succeeds.'}</p>}</div>
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">{visible.definition.widgets.map(widget => {
          const result = visible.results.find(row => row.reportId === widget.reportId), problem = widgetError(widget, result), source = result?.run;
          return <article key={widget.id} data-testid="dashboard-widget" className={`min-w-0 rounded-xl border border-gray-200 bg-white p-5 ${widget.type === 'metric' ? '' : 'lg:col-span-2'}`}>
            <h4 className="break-words font-bold text-navy">{widget.title}</h4>
            {problem ? <p role="status" className="mt-3 text-sm text-amber-800">{problem}</p> : source && <>
              <p className="mt-1 text-xs text-gray-500">{reportMetricDefinitions[widget.metric].label} · {widget.metric === 'recordCount' || widget.metric === 'winRate' ? 'record based' : source.money.currency}</p>
              {widget.type === 'metric' ? <button className="mt-3 min-h-11 text-left" onClick={() => inspect(widget)}><span className="block break-words text-2xl font-bold text-navy">{measureText(widget.metric, source.totals[widget.metric])}</span><span className="mt-2 block text-sm font-semibold text-brand-blue">Inspect {source.rows.length} source records</span></button>
                : widget.type === 'bar' ? <Bars run={source} widget={widget} onGroup={group => inspect(widget, group)} /> : <GroupTable key={visible.runAt + widget.id} run={source} widget={widget} onGroup={group => inspect(widget, group)} />}
              <details className="mt-4 text-xs text-gray-500"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Source and coverage · {source.rows.length} matching records</summary><p>{source.definition.name} · revision {result?.version} · {source.grain} · {source.definition.population}</p><p className="mt-1">{source.sourceStatus}</p><p className="mt-1">Planning FX {source.money.ratesAsOf}; captured overrides. Won value is not cash. Missing values stay unavailable or mark partial sums; no historical trend is implied.</p></details>
            </>}
            <Link className="mt-3 inline-block min-h-11 py-3 text-sm font-semibold text-brand-blue" to={`/app/reports?report=${encodeURIComponent(widget.reportId)}`}>Open saved report</Link><p className="text-xs text-gray-500">The saved report opens with its own filters; dashboard filters are shown here.</p>
          </article>;
        })}</div>
      </section> : definition.widgets.length ? <p role="status" className="rounded-lg bg-gray-50 p-4 text-sm">Refresh to show the current dashboard configuration. Previous results do not represent these settings.</p> : <p className="rounded-lg bg-gray-50 p-4 text-sm">Add a widget from a saved report to start. <Link className="font-semibold text-brand-blue" to="/app/reports">Create a report</Link></p>}
      {invalidGroup && <p role="alert">This group is not in the current results. <button className={secondary} onClick={() => clearDetail()}>Close invalid selection</button></p>}{selectedRun && selectedWidget && !invalidGroup && <section data-testid="dashboard-detail" className="min-w-0 rounded-xl border border-gray-200 bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold text-navy">{selectedWidget.title} · {selectedGroup?.labels.join(' / ') || 'All matching records'}</h3><button className={secondary} onClick={() => clearDetail()}>Close source records</button></div><p className="my-3 text-sm">{detailRows.length} source records · same captured run</p><p className="mb-3 text-xs text-gray-500">{selectedRun.definition.dataset === 'opportunities' ? 'Full report rows for this selection. Qualified pipeline counts Active deals; Won value counts Won deals.' : 'Full order rows for this selection. Receipts and balances follow the recorded payments and planning schedule.'}</p><div className="overflow-x-auto"><table className="report-table w-full text-left text-sm"><thead><tr>{selectedRun.definition.columns.map(column => <th key={column.field}>{column.label}</th>)}<th>Source</th></tr></thead><tbody>{detailRows.slice(detailPage * 100, (detailPage + 1) * 100).map(row => <tr key={row.id}>{selectedRun.definition.columns.map(column => <td key={column.field}>{text(row.values[column.field])}</td>)}<td><Link className="inline-block min-h-11 py-3 font-semibold text-brand-blue" to={row.href}>Open deal</Link></td></tr>)}</tbody></table></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><button className={secondary} disabled={!detailPage} onClick={() => setDetailPage(p => p - 1)}>Previous records</button><span>{detailRows.length ? detailPage * 100 + 1 : 0}–{Math.min((detailPage + 1) * 100, detailRows.length)} of {detailRows.length} records</span><button className={secondary} disabled={(detailPage + 1) * 100 >= detailRows.length} onClick={() => setDetailPage(p => p + 1)}>Next records</button></div></section>}
      <details open={openEditor} onToggle={event => setOpenEditor(event.currentTarget.open)} className="rounded-xl border border-gray-200 bg-white p-4"><summary className="min-h-11 cursor-pointer py-3 font-bold text-navy">Customize dashboard</summary><fieldset disabled={Boolean(busy)} className="mt-3 min-w-0 space-y-4">
        <label className="block text-sm font-semibold">Dashboard name<input className={control} value={definition.name} onChange={event => change({ ...definition, name: event.target.value })} /></label><label className="block text-sm font-semibold">Dashboard purpose<textarea className={control} value={definition.description} onChange={event => change({ ...definition, description: event.target.value })} /></label>
        {!activeReports.length && <p className="text-sm">No active saved reports. <Link className="font-semibold text-brand-blue" to="/app/reports">Create and save a report first.</Link></p>}
        <ol className="space-y-4">{definition.widgets.map((widget, index) => { const report = activeReports.find(row => row.id === widget.reportId); return <li key={widget.id} className="min-w-0 rounded-lg border border-gray-200 p-3"><div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm">Widget {index + 1} title<input className={control} value={widget.title} onChange={event => updateWidget(index, { ...widget, title: event.target.value })} /></label>
          <label className="min-w-0 text-sm">Widget {index + 1} report<select aria-label={`Widget ${index + 1} report`} className={control} value={widget.reportId} onChange={event => { const next = activeReports.find(row => row.id === event.target.value)!; updateWidget(index, { ...widget, reportId: next.id, metric: next.definition.metrics[0] }); }}>
            {!report && <option value={widget.reportId}>Unavailable report</option>}{activeReports.map(row => <option key={row.id} value={row.id}>{row.definition.name}</option>)}</select></label>
          <label className="min-w-0 text-sm">Widget {index + 1} view<select aria-label={`Widget ${index + 1} view`} className={control} value={widget.type} onChange={event => updateWidget(index, { ...widget, type: event.target.value as DashboardWidget['type'] })}><option value="metric">Metric card</option><option value="bar">Horizontal bar chart</option><option value="table">Summary table</option></select></label>
          <label className="min-w-0 text-sm">Widget {index + 1} measure<select aria-label={`Widget ${index + 1} measure`} className={control} value={widget.metric} onChange={event => updateWidget(index, { ...widget, metric: event.target.value as DashboardWidget['metric'] })}>{!report?.definition.metrics.includes(widget.metric) && <option value={widget.metric}>Unavailable measure</option>}{report?.definition.metrics.map(metric => <option key={metric} value={metric}>{reportMetricDefinitions[metric].label}</option>)}</select></label>
        </div><div className="mt-3 flex flex-wrap gap-2"><button className={secondary} aria-label={`Move widget ${index + 1} up`} disabled={!index} onClick={() => { const widgets = [...definition.widgets]; [widgets[index - 1], widgets[index]] = [widgets[index], widgets[index - 1]]; change({ ...definition, widgets }); }}>Move up</button><button className={secondary} aria-label={`Move widget ${index + 1} down`} disabled={index === definition.widgets.length - 1} onClick={() => { const widgets = [...definition.widgets]; [widgets[index + 1], widgets[index]] = [widgets[index], widgets[index + 1]]; change({ ...definition, widgets }); }}>Move down</button><button className={secondary} aria-label={`Remove widget ${index + 1}`} onClick={() => change({ ...definition, widgets: definition.widgets.filter(row => row.id !== widget.id) })}>Remove</button></div></li>; })}</ol>
        <div className="flex flex-wrap gap-2"><button className={secondary} disabled={!activeReports.length || definition.widgets.length >= 12} onClick={() => { const report = activeReports[0]; change({ ...definition, widgets: [...definition.widgets, { id: `widget-${crypto.randomUUID()}`, title: report.definition.name, reportId: report.id, type: 'metric', metric: report.definition.metrics[0] }] }); }}>Add widget</button><button className={primary} onClick={() => void save()}>{editing ? 'Save dashboard changes' : 'Save dashboard'}</button><button className={secondary} onClick={() => { change({ ...definition, name: `${definition.name} (copy)` }); setEditing(null); }}>Duplicate as new dashboard</button>{editing && <button className={secondary} onClick={() => { const record = current.boards.records.find(row => row.id === editing.id); if (record) void save(record, true); }}>Archive dashboard</button>}</div>
        <p className="text-xs text-gray-500">Up to 12 widgets. Layout follows widget order; charts use report groupings. Save includes the current dashboard filters. Refresh reads current report revisions.</p>
      </fieldset></details>
      <details className="rounded-xl border border-gray-200 bg-white p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold text-navy" onClick={() => setArchived(!archived)}>Archived dashboards</summary>{archived && <ul className="space-y-2">{current.boards.records.filter(row => row.archived).map(record => <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{record.definition.name}</span><button className={secondary} disabled={Boolean(busy)} onClick={() => void save(record, false)}>Restore dashboard</button></li>)}</ul>}</details>
    </>}
  </div>;
}
