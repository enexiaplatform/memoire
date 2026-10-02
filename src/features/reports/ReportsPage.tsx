import { controlClass, fieldLabelClass, primaryPillClass, ghostPillClass } from '../../components/ui/daylightStyles';
import { PageHeader } from '../../components/layout/PageFrame';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import { useAuthContext } from '../../auth/authContext';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadPortfolio, type PortfolioScope } from '../../services/portfolioStore';
import { assertReportScope, loadSavedReports, saveReportDefinition, type ReportLibrary } from '../../services/reportStore';
import { executeWorkspaceReport } from '../../services/reportData';
import { portfolioNodes, type PortfolioNode } from '../../domain/portfolio/portfolioCatalog';
import { parseReportDefinition, fieldsForDataset, operatorsForField, reportFields, reportMetricDefinitions, reportTemplate, REPORT_PREVIEW_LIMIT,
  type ReportCell, type ReportDefinition, type ReportField, type ReportFilter, type ReportMetric } from '../../domain/reports/reportDefinition';
import { reportCsv, reportMetadata, type ReportRun, type ReportRow, type ReportGroup, type ReportMeasure } from '../../domain/reports/reportEngine';
import type { SavedReport } from '../../domain/reports/reportRecord';
import { portfolioReportDraft } from '../../domain/reports/reportHandoffs';
import { moneyViewHref } from '../revenue/moneyViews';
import './reports.css';
const control = `${controlClass} mt-1.5`;
const button = `${primaryPillClass} min-h-11`;
const secondary = `${ghostPillClass} min-h-11`;
const catalogKinds = { businessUnit: 'unit', brand: 'brand', productGroup: 'group', product: 'product' } as const;
function display(value: ReportCell | undefined): string {
  return value == null || value === '' ? '—' : typeof value === 'number' ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value) : String(value);
}
function metricLabel(key: ReportMetric, metric: ReportMeasure | undefined): string {
  if (!metric || metric.value === null) return key === 'winRate' ? `Needs 3 decided deals (${metric?.denominator || 0})` : 'Unavailable';
  const value = key === 'winRate' ? `${(metric.value * 100).toFixed(1)}% (${metric.denominator} decided)` : display(metric.value);
  return metric.missing ? `${value} · partial, ${metric.missing} missing` : value;
}
function DetailTable({ rows, definition, links = true }: { rows: ReportRow[]; definition: ReportDefinition; links?: boolean }) {
  return <table className="report-table w-full text-left text-sm"><thead><tr>{definition.columns.map(column => <th key={column.field}>{column.label}</th>)}{links && <th>Source</th>}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}>{definition.columns.map(column => <td key={column.field}>{display(row.values[column.field])}</td>)}{links && <td><Link to={row.href}>Open</Link></td>}</tr>)}</tbody></table>;
}
function SummaryTable({ groups, definition, onGroup }: { groups: ReportGroup[]; definition: ReportDefinition; onGroup?: (key: string) => void }) {
  return <table className="report-table w-full text-left text-sm"><thead><tr>{definition.groupBy.map(key => <th key={key}>{reportFields[key].label}</th>)}{definition.metrics.map(key => <th key={key}>{reportMetricDefinitions[key].label}</th>)}{onGroup && <th>Source records</th>}</tr></thead>
    <tbody>{groups.map(group => <tr key={group.key}>{group.labels.map((label, i) => <td key={i}>{label}</td>)}{definition.metrics.map(key => <td key={key}>{metricLabel(key, group.metrics[key])}</td>)}{onGroup && <td><button type="button" className="font-semibold text-brand-blue" onClick={() => onGroup(group.key)}>View {group.sourceIds.length} records</button></td>}</tr>)}</tbody></table>;
}
export function ReportsPage() {
  const [reportParams, setReportParams] = useSearchParams(), requestedReport = reportParams.get('report');
  const catalogKind = reportParams.get('catalogKind'), catalogId = reportParams.get('catalogId');
  const handledSelection = useRef('');
  const { user, loading: authLoading } = useAuthContext(), demo = useDemoWorkspaceMode(), sample = demo || hasLocalSampleData();
  const scope = useMemo<PortfolioScope>(() => ({ userId: sample ? null : user?.id || null, sampleDataActive: sample }), [sample, user?.id]);
  const scopeKey = `${scope.userId || 'local'}:${sample}`;
  const [library, setLibrary] = useState<{ scopeKey: string; value: ReportLibrary; nodes: PortfolioNode[] } | null>(null);
  const [definition, setDefinition] = useState<ReportDefinition>(() => reportTemplate('portfolio'));
  const [editing, setEditing] = useState<{ id: string; version: number } | null>(null);
  const [run, setRun] = useState<ReportRun | null>(null), [drillGroup, setDrillGroup] = useState<string | null>(null);
  const [page, setPage] = useState(0), [columnSearch, setColumnSearch] = useState(''), [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const selectionKey = JSON.stringify([scopeKey, requestedReport || '', catalogKind || '', catalogId || '', reload]);
  const [linkBlocked, setLinkBlocked] = useState(false);
  useEffect(() => {
    if (authLoading || handledSelection.current === selectionKey) return;
    let cancelled = false;
    setLibrary(null); setRun(null); setEditing(null); setDefinition(reportTemplate('portfolio')); setError(''); setMessage(''); setLinkBlocked(false); setBusy('library');
    void Promise.all([loadSavedReports(scope), loadPortfolio(scope)]).then(([value, catalog]) => {
      if (!cancelled) {
        setLibrary({ scopeKey, value, nodes: portfolioNodes(catalog.records) });
        if (requestedReport && requestedReport !== 'new') { const record = value.records.find(row => row.id === requestedReport);
          if (!record || record.archived) { setError('This saved report is unavailable or archived. Restore it or choose another report.'); setLinkBlocked(true); }
          else { setDefinition(record.definition); setEditing({ id: record.id, version: record.version }); }
        } else if (catalogKind !== null || catalogId !== null) {
          try { setDefinition(portfolioReportDraft(catalogKind, catalogId, portfolioNodes(catalog.records))); }
          catch (failure) { setError(failure instanceof Error ? failure.message : 'Portfolio report unavailable.'); setLinkBlocked(true); }
        }
        handledSelection.current = selectionKey;
      }
    }).catch(failure => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Could not load reports.'); })
      .finally(() => { if (!cancelled) setBusy(''); });
    return () => { cancelled = true; };
  }, [scope, scopeKey, authLoading, reload, requestedReport, catalogKind, catalogId, selectionKey]);
  const current = library?.scopeKey === scopeKey ? library : null;
  const visibleRun = run?.scopeKey === scopeKey && JSON.stringify(run.definition) === JSON.stringify(definition) ? run : null;
  const fields = fieldsForDataset(definition.dataset), metrics = (Object.keys(reportMetricDefinitions) as ReportMetric[]).filter(key => reportMetricDefinitions[key].datasets.includes(definition.dataset));
  const change = (next: ReportDefinition) => { setDefinition(next); setDrillGroup(null); setPage(0); setMessage(''); };
  const identify = (id: string, replace = false) => {
    const next = new URLSearchParams(reportParams); next.set('report', id); next.delete('catalogKind'); next.delete('catalogId');
    handledSelection.current = JSON.stringify([scopeKey, id, '', '', reload]); setReportParams(next, { replace }); setLinkBlocked(false); setError('');
  };
  const selectSaved = (record: SavedReport) => { if (record.archived) { setMessage('Restore the archived report before editing it.'); return; } change(record.definition); setEditing({ id: record.id, version: record.version }); setRun(null); identify(record.id); };
  const savedDefinition = current?.value.records.find(record => record.id === editing?.id && !record.archived);
  const dashboardReady = Boolean(savedDefinition && JSON.stringify(savedDefinition.definition) === JSON.stringify(definition));
  const save = async (record?: SavedReport, archive?: boolean) => {
    setBusy('save'); setError(''); setMessage('');
    try {
      const id = record?.id || editing?.id || `report-${crypto.randomUUID()}`;
      const value = await saveReportDefinition(scope, { id,
        expectedVersion: record?.version || editing?.version || 0, state: { definition: parseReportDefinition(record?.definition || definition), archived: archive ?? false } });
      setLibrary(previous => previous?.scopeKey === scopeKey ? { ...previous, value } : previous);
      if (!record) { const saved = value.records.find(row => row.id === id)!; setEditing({ id: saved.id, version: saved.version }); identify(saved.id, true); }
      if (record && record.id === editing?.id) { setEditing(null); setRun(null); identify('new', true); }
      setMessage(value.message);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save this report.'); }
    finally { setBusy(''); }
  };
  const execute = async () => {
    setBusy('run'); setError(''); setMessage(''); setRun(null); setPage(0); setDrillGroup(null);
    try { const result = await executeWorkspaceReport(scope, parseReportDefinition(definition), scopeKey); setRun(result); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Report source unavailable.'); }
    finally { setBusy(''); }
  };
  const download = async () => {
    if (!visibleRun) return;
    setBusy('export'); setError('');
    try {
      assertReportScope(scope);
      const zip = new JSZip(); zip.file('details.csv', reportCsv(visibleRun, 'details')); zip.file('summary.csv', reportCsv(visibleRun, 'summary'));
      zip.file('report-metadata.json', reportMetadata(visibleRun));
      const blob = await zip.generateAsync({ type: 'blob' }); assertReportScope(scope);
      const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'memoire-report.zip'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage(`Exported all ${visibleRun.rows.length} matching records, grouped summary and run metadata.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not export this report.'); }
    finally { setBusy(''); }
  };
  const activeGroup = visibleRun?.groups.find(group => group.key === drillGroup);
  const rows = visibleRun?.rows.filter(row => !activeGroup || activeGroup.sourceIds.includes(row.id)) || [];
  const preview = rows.slice(page * REPORT_PREVIEW_LIMIT, (page + 1) * REPORT_PREVIEW_LIMIT);
  const groups = visibleRun?.groups.slice(page * REPORT_PREVIEW_LIMIT, (page + 1) * REPORT_PREVIEW_LIMIT) || [];
  const detailView = Boolean(activeGroup) || definition.view === 'details';
  const count = detailView ? rows.length : visibleRun?.groups.length || 0;
  const printAllowed = Boolean(visibleRun && (definition.view === 'summary' || definition.columns.length <= 8) && (definition.view === 'summary' ? visibleRun.groups.length : visibleRun.rows.length) <= 2000);
  const updateFilter = (index: number, filter: ReportFilter) => change({ ...definition, filters: definition.filters.map((old, i) => i === index ? filter : old) });
  return <div className="reports-page min-w-0" data-testid="reports-page">
    <div className="report-screen flex min-w-0 flex-col gap-5">
      <PageHeader eyebrow="Analysis" title="Reports" description="Ask a repeatable question, inspect the source records, then export the same result." actions={<button type="button" className={secondary} disabled={Boolean(busy)} onClick={() => setReload(value => value + 1)}>Reload library</button>} />
      {error && <p role="alert" className="rounded-lg bg-tint-red-bg p-3 text-sm text-tint-red-ink">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-tint-blue-bg p-3 text-sm text-ink">{message}</p>}
      {!current ? <p>{busy || authLoading ? 'Loading reports…' : 'Reload the library to try again.'}</p> : <>
        <p className="rounded-lg bg-tint-blue-bg p-3 text-sm text-ink">{current.value.message}</p>
        <section className="grid min-w-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-panel bg-white shadow-panel p-4"><h2 className="font-bold text-ink">Start from a template</h2>
            <div className="mt-3 flex flex-col gap-2">{(['portfolio', 'collections'] as const).map(key => <button key={key} className={secondary} disabled={Boolean(busy)} onClick={() => { change(reportTemplate(key)); setEditing(null); setRun(null); identify('new'); }}>{reportTemplate(key).name}</button>)}</div>
            <h2 className="mt-5 font-bold text-ink">Saved reports</h2><label className="mt-2 flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />Show archived reports</label>
            <ul className="mt-3 space-y-3">{current.value.records.filter(record => record.archived === archived).map(record => <li key={record.id} className="break-words rounded-lg border border-line p-3"><button className="text-left text-sm font-semibold text-brand-blue" disabled={Boolean(busy)} onClick={() => selectSaved(record)}>{record.definition.name}</button><p className="mt-1 text-xs text-muted">{record.definition.dataset} · version {record.version}</p><button className="mt-2 text-xs font-semibold text-gray-600" disabled={Boolean(busy)} onClick={() => void save(record, !record.archived)}>{record.archived ? 'Restore report' : 'Archive report'}</button></li>)}</ul>
            {!current.value.records.some(record => record.archived === archived) && <p className="mt-3 text-sm text-muted">No saved reports here yet.</p>}
          </aside>
          <fieldset disabled={Boolean(busy) || linkBlocked} className="flex min-w-0 flex-col gap-4 rounded-panel bg-white shadow-panel p-5">
            <legend className="sr-only">Report builder</legend><h2 className="font-bold text-ink">{editing ? 'Edit saved report' : 'Customize report'}</h2>
            <label className={fieldLabelClass}>Report name<input className={control} value={definition.name} maxLength={200} onChange={event => change({ ...definition, name: event.target.value })} /></label>
            <label className={fieldLabelClass}>Purpose<textarea className={control} value={definition.description} maxLength={2000} onChange={event => change({ ...definition, description: event.target.value })} /></label>
            <p className="text-xs text-muted">Dataset: {definition.dataset === 'opportunities' ? 'One opportunity per row' : 'One committed qualified order per row'}. Current classification and current planning values; no historical reconstruction.</p>
            <div className="grid gap-3 sm:grid-cols-3"><label className={fieldLabelClass}>Population<select aria-label="Population" className={control} value={definition.population} disabled={definition.dataset === 'collections'} onChange={event => change({ ...definition, population: event.target.value as ReportDefinition['population'] })}><option value="qualified">Qualified opportunities</option><option value="leads">Leads only</option><option value="all">All opportunities</option></select></label>
              <label className={fieldLabelClass}>Result view<select aria-label="Result view" className={control} value={definition.view} onChange={event => change({ ...definition, view: event.target.value as ReportDefinition['view'] })}><option value="details">Details</option><option value="summary">Grouped summary</option></select></label>
              <label className={fieldLabelClass}>Sort field<select aria-label="Sort field" className={control} value={definition.sort.field} onChange={event => change({ ...definition, sort: { ...definition.sort, field: event.target.value as ReportField } })}>{fields.map(key => <option key={key} value={key}>{reportFields[key].label}</option>)}</select></label></div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={definition.sort.direction === 'desc'} onChange={event => change({ ...definition, sort: { ...definition.sort, direction: event.target.checked ? 'desc' : 'asc' } })} />Sort descending (missing values stay last)</label>
            <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-semibold text-ink">Columns ({definition.columns.length})</summary>
              <label className={`mt-3 ${fieldLabelClass}`}>Find a field<input className={control} value={columnSearch} onChange={event => setColumnSearch(event.target.value)} /></label>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{fields.filter(key => reportFields[key].label.toLowerCase().includes(columnSearch.toLowerCase())).map(key => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={definition.columns.some(column => column.field === key)} onChange={event => change({ ...definition, columns: event.target.checked ? [...definition.columns, { field: key, label: reportFields[key].label }] : definition.columns.filter(column => column.field !== key) })} />{reportFields[key].label}</label>)}</div>
              <ol className="mt-4 space-y-2">{definition.columns.map((column, index) => <li key={column.field} className="flex flex-wrap items-center gap-2"><span className="w-40 text-xs text-muted">{reportFields[column.field].label}</span><input aria-label={`Label for ${reportFields[column.field].label}`} className={`${control} max-w-52`} value={column.label} maxLength={120} onChange={event => change({ ...definition, columns: definition.columns.map((old, i) => i === index ? { ...old, label: event.target.value } : old) })} />{[-1, 1].map(offset => <button key={offset} type="button" className={secondary} aria-label={`Move ${reportFields[column.field].label} ${offset < 0 ? 'up' : 'down'}`} disabled={index + offset < 0 || index + offset >= definition.columns.length} onClick={() => { const columns = [...definition.columns]; [columns[index], columns[index + offset]] = [columns[index + offset], columns[index]]; change({ ...definition, columns }); }}>{offset < 0 ? '↑' : '↓'}</button>)}</li>)}</ol>
            </details>
            <div className="flex flex-col gap-3"><h3 className="font-semibold text-ink">Filters</h3><label className={fieldLabelClass}>Match conditions<select aria-label="Match conditions" className={control} value={definition.filterMode} onChange={event => change({ ...definition, filterMode: event.target.value as 'all' | 'any' })}><option value="all">All conditions (AND)</option><option value="any">Any condition (OR)</option></select></label>
              {definition.filters.map((filter, index) => <div key={index} className="grid gap-2 rounded-lg bg-canvas p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <select aria-label={`Filter ${index + 1} field`} className={control} value={filter.field} onChange={event => updateFilter(index, { field: event.target.value as ReportField, operator: 'equals', value: '' })}>{fields.map(key => <option key={key} value={key}>{reportFields[key].label}</option>)}</select>
                <select aria-label={`Filter ${index + 1} operator`} className={control} value={filter.operator} onChange={event => updateFilter(index, { ...filter, operator: event.target.value as ReportFilter['operator'] })}>{operatorsForField(filter.field).map(operator => <option key={operator} value={operator}>{({ equals: 'Equals', contains: 'Contains', gte: 'At least / on or after', lte: 'At most / on or before', empty: 'Missing / unassigned', notEmpty: 'Present / assigned' })[operator]}</option>)}</select>
                {['empty', 'notEmpty'].includes(filter.operator) ? <span className="text-sm text-muted">No value needed</span> : reportFields[filter.field].type === 'catalog' ? <select aria-label={`Filter ${index + 1} value`} className={control} value={String(filter.value ?? '')} onChange={event => updateFilter(index, { ...filter, value: event.target.value })}><option value="">Choose a catalog entry</option>{current.nodes.filter(node => node.kind === catalogKinds[filter.field as keyof typeof catalogKinds]).map(node => <option key={node.id} value={node.id}>{node.name}{node.status === 'retired' ? ' (retired)' : ''}</option>)}{filter.value && !current.nodes.some(node => node.id === filter.value) && <option value={String(filter.value)}>Unavailable catalog entry</option>}</select>
                  : reportFields[filter.field].type === 'boolean' ? <select aria-label={`Filter ${index + 1} value`} className={control} value={String(filter.value)} onChange={event => updateFilter(index, { ...filter, value: event.target.value === 'true' })}><option value="">Choose</option><option value="true">True</option><option value="false">False</option></select>
                    : <input aria-label={`Filter ${index + 1} value`} className={control} type={reportFields[filter.field].type === 'number' ? 'number' : reportFields[filter.field].type === 'date' ? 'date' : 'text'} value={String(filter.value ?? '')} onChange={event => updateFilter(index, { ...filter, value: reportFields[filter.field].type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value })} />}
                <button type="button" className={secondary} aria-label={`Remove filter ${index + 1}`} onClick={() => change({ ...definition, filters: definition.filters.filter((_, i) => i !== index) })}>Remove</button>
              </div>)}<button type="button" className={`${secondary} self-start`} disabled={definition.filters.length >= 20} onClick={() => change({ ...definition, filters: [...definition.filters, { field: 'status', operator: 'equals', value: 'Active' }] })}>Add filter</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map(index => <label key={index} className="text-sm">Group {index + 1}<select aria-label={`Group ${index + 1}`} className={control} value={definition.groupBy[index] || ''} disabled={index === 1 && !definition.groupBy.length} onChange={event => { const groupBy = [...definition.groupBy]; if (!event.target.value) groupBy.splice(index); else groupBy[index] = event.target.value as ReportField; change({ ...definition, groupBy }); }}><option value="">No grouping</option>{fields.filter(key => reportFields[key].type !== 'number').map(key => <option key={key} value={key}>{reportFields[key].label}</option>)}</select></label>)}</div>
            <div><h3 className="font-semibold text-ink">Measures</h3><div className="mt-2 flex flex-wrap gap-4">{metrics.map(key => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={definition.metrics.includes(key)} onChange={event => change({ ...definition, metrics: event.target.checked ? [...definition.metrics, key] : definition.metrics.filter(metric => metric !== key) })} />{reportMetricDefinitions[key].label}</label>)}</div></div>
            <p className="text-xs text-muted">Amounts use reporting currency except Original value. Partial totals show missing records. Won value is not cash; win rate needs 3 decided deals. Collections use recorded receipts and planning schedules; missing dates do not mean not overdue.</p>
            <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => void execute()}>Run report</button><button type="button" className={secondary} onClick={() => void save()}>{editing ? 'Save changes' : 'Save report'}</button><button type="button" className={secondary} onClick={() => { setEditing(null); setRun(null); change({ ...definition, name: `${definition.name} (copy)` }); identify('new'); }}>Duplicate as new report</button></div>
            {dashboardReady && !busy ? <Link className="inline-flex min-h-11 items-center self-start font-semibold text-brand-blue" to={`/app/dashboards?${new URLSearchParams({ dashboard: 'new', report: editing!.id })}`}>Create dashboard from this report</Link> : <p className="text-xs text-muted">Save this report before using it in a dashboard. Dashboard widgets use the saved definition.</p>}
          </fieldset>
        </section>
        {busy === 'run' && <p role="status">Loading current report sources…</p>}
        {run && !visibleRun && <p className="text-sm text-tint-amber-ink">Configuration changed. Run the report again to preview or export.</p>}
        {visibleRun && <section className="min-w-0 rounded-panel bg-white shadow-panel p-5" data-testid="report-result">
          <h2 className="text-lg font-bold text-ink">{visibleRun.definition.name}</h2><p className="mt-2 text-sm text-muted">{visibleRun.rows.length} matching records from {visibleRun.sourceCount} loaded source records · {visibleRun.money.currency} · run {visibleRun.runAt}</p>
          <p className="mt-1 text-xs text-muted">{visibleRun.grain}. {visibleRun.sourceStatus} Timezone: {visibleRun.timezone}; planning FX {visibleRun.money.ratesAsOf}, workspace overrides captured.</p>
          {definition.dataset === 'collections' && <p className="mt-2 text-xs text-muted">Only quotes linked by ID are used; legacy name-only quotes are excluded. Open a row’s source deal or <Link className="font-semibold text-brand-blue" to={moneyViewHref('collections')}>open Collections</Link> to manage payments.</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{visibleRun.definition.metrics.map(key => <div key={key} className="rounded-lg bg-canvas p-3"><p className="text-xs text-muted">{reportMetricDefinitions[key].label}</p><p className="mt-1 font-bold text-ink">{metricLabel(key, visibleRun.totals[key])}</p></div>)}</div>
          <div className="my-4 flex flex-wrap gap-2"><button type="button" className={button} disabled={Boolean(busy)} onClick={() => void download()}>Export CSV pack</button><button type="button" className={secondary} disabled={!printAllowed || Boolean(busy)} onClick={() => { assertReportScope(scope); window.print(); }}>Print / save PDF</button>{activeGroup && <button type="button" className={secondary} onClick={() => { setDrillGroup(null); setPage(0); }}>Back to summary</button>}</div>
          {!printAllowed && <p className="mb-3 text-xs text-muted">Print supports up to 8 detail columns and 2,000 rows/groups. Reduce columns or use grouped summary; CSV includes every matching row.</p>}
          {activeGroup && <p className="mb-3 text-sm font-semibold text-ink">Source records: {activeGroup.labels.join(' / ') || 'All matching records'}</p>}
          <p className="mb-2 text-xs text-muted">Preview {count ? page * REPORT_PREVIEW_LIMIT + 1 : 0}–{Math.min((page + 1) * REPORT_PREVIEW_LIMIT, count)} of {count} {detailView ? 'records' : 'groups'}. Export uses the full filtered result.</p>
          <div className="min-w-0 overflow-x-auto">{detailView ? <DetailTable rows={preview} definition={visibleRun.definition} /> : <SummaryTable groups={groups} definition={visibleRun.definition} onGroup={key => { setDrillGroup(key); setPage(0); }} />}</div>
          {!count && <p className="mt-3 text-sm text-muted">No matching records. Change the filters and run again.</p>}
          <div className="mt-3 flex items-center gap-3"><button className={secondary} disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous page</button><button className={secondary} disabled={(page + 1) * REPORT_PREVIEW_LIMIT >= count} onClick={() => setPage(value => value + 1)}>Next page</button></div>
        </section>}
      </>}
    </div>
    {visibleRun && printAllowed && createPortal(<article className="report-print"><h1>{visibleRun.definition.name}</h1><p>{visibleRun.definition.description}</p><p>{visibleRun.grain} · {visibleRun.rows.length} records · {visibleRun.money.currency}</p><p>Run: {visibleRun.runAt}; timezone {visibleRun.timezone}; planning FX {visibleRun.money.ratesAsOf} with captured overrides.</p><p>{visibleRun.sourceStatus}</p><p>Scope: {visibleRun.definition.population}; filters ({visibleRun.definition.filterMode}): {JSON.stringify(visibleRun.definition.filters)}. Current run; not historical reconstruction.</p><ul>{visibleRun.definition.metrics.map(key => <li key={key}>{reportMetricDefinitions[key].label}: {metricLabel(key, visibleRun.totals[key])}</li>)}</ul>{visibleRun.definition.view === 'summary' ? <SummaryTable groups={visibleRun.groups} definition={visibleRun.definition} /> : <DetailTable rows={visibleRun.rows} definition={visibleRun.definition} links={false} />}<footer>Missing values are shown as —; partial sums exclude them. Won value is not cash or accounting revenue. Payment dates are planning schedules with confidence shown in the dataset. Full run definition/rates accompany the CSV pack.</footer></article>, document.body)}
  </div>;
}
