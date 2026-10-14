import { useMemo, useRef, useState, useEffect } from 'react';
import type { PointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Download, Minus, Plus, RotateCcw, Search, X, Move, Scan } from 'lucide-react';
import JSZip from 'jszip';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { AccountMergeRecord } from '../../services/accountMergeStore';
import { explorerRows, explorerGroups, filterExplorerRows, explorerCsv, packExplorer, relatedExplorerRows, EXPLORER_STAGES, EXPLORER_PALETTE } from '../../utils/visualExplorer';
import type { ExplorerRow } from '../../utils/visualExplorer';
import { formatCompactCurrencyAmount } from '../../utils/money';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import './visualExplorer.css';

type Bounds = [number, number, number, number];
function parseBounds(value: string | null): Bounds | null {
  if (!value) return null;
  const parts = value.split(',').map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) && parts.every(n => n >= 0 && n <= 1) && parts[0] <= parts[2] && parts[1] <= parts[3] ? parts as Bounds : null;
}
function bounded(value: string | null, min: number, max: number, fallback: number) {
  const n = value === null ? NaN : Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function selectedMapIds(value: string | null): Set<string> | null {
  if (!value || value.length > 60000) return null;
  try { const ids: unknown = JSON.parse(value); return Array.isArray(ids) && ids.length <= 1000 && ids.every(id => typeof id === 'string') ? new Set(ids) : null; } catch { return null; }
}
function valueRange(value: string | null): Bounds | null {
  if (!value) return null;
  try { const a = JSON.parse(value); return Array.isArray(a) && a.length === 4 && a.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) && a[0] <= a[2] && a[1] <= a[3] && a[2] <= 100 ? a as Bounds : null; } catch { return null; }
}
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const total = (rows: ExplorerRow[]) => rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
const known = (rows: ExplorerRow[]) => rows.filter(row => row.value !== null).length;

/** D3 owns collision-free packing. React owns state, SVG rendering and inspection. */
export function VisualExplorer({ opportunities, sample, accountMerges = [] }: { opportunities: CrmLiteOpportunity[]; sample: boolean; accountMerges?: AccountMergeRecord[] }) {
  const [params, setParams] = useSearchParams();
  const root = useRef<HTMLElement>(null), scene = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(780), [hover, setHover] = useState<string | null>(null);
  const [tool, setTool] = useState<'inspect' | 'brush' | 'pan'>('inspect');
  const [dragBounds, setDragBounds] = useState<Bounds | null>(null), [pan, setPan] = useState<[number, number] | null>(null);
  const [exportState, setExportState] = useState(''), [page, setPage] = useState(0);
  const rows = useMemo(() => explorerRows(opportunities, accountMerges), [opportunities, accountMerges]);
  const currencies = useMemo(() => [...new Set(rows.map(row => row.currency))].sort(), [rows]);
  const rawCurrency = params.get('vxCurrency');
  const currency = currencies.includes(rawCurrency || '') ? rawCurrency! : currencies[0] || 'Unspecified';
  const currencyRows = useMemo(() => rows.filter(row => row.currency === currency), [rows, currency]);
  const brands = useMemo(() => [...new Set(rows.map(row => row.brand))].sort(), [rows]);
  const color = (brand: string) => EXPLORER_PALETTE[Math.max(0, brands.indexOf(brand)) % EXPLORER_PALETTE.length];
  const mode = params.get('vxMode') === 'probability' ? 'probability' : 'map', log = params.get('vxScale') === 'log';
  const filters = { currency, brand: params.get('vxBrand') || '', stage: params.get('vxStage') || '', month: params.get('vxMonth') || '', query: params.get('vxQuery') || '' };
  const filtered = filterExplorerRows(rows, filters);
  const chartWidth = Math.max(320, Math.min(width, 1300)), chartHeight = width < 500 ? 410 : 530;
  const focusId = params.get('vxSelected');
  const visibleRows = useMemo(() => {
    const visible = currencyRows.slice(0, 1000);
    const focused = currencyRows.find(row => row.id === focusId);
    if (focused && !visible.some(row => row.id === focusId)) visible[visible.length - 1] = focused;
    return visible;
  }, [currencyRows, focusId]);
  const layout = useMemo(() => packExplorer(visibleRows, chartWidth, chartHeight), [visibleRows, chartWidth, chartHeight]);
  const maxValue = currencyRows.reduce((max, row) => Math.max(max, row.value ?? 0), 1);
  const x = (row: Pick<ExplorerRow, 'probability'>) => 64 + (row.probability ?? 0) / 100 * (chartWidth - 100);
  const y = (row: Pick<ExplorerRow, 'value'>) => 38 + (1 - (log ? Math.log1p(row.value ?? 0) / Math.log1p(maxValue) : (row.value ?? 0) / maxValue)) * (chartHeight - 100);
  const points = mode === 'map' ? layout.points : layout.points.filter(point => point.row.probability !== null && point.row.value !== null).map(point => ({ ...point, x: x(point.row), y: y(point.row), r: 5 }));
  const range = valueRange(params.get('vxRange'));
  const brush: Bounds | null = range ? [x({ probability: range[0] }) / chartWidth, y({ value: range[3] }) / chartHeight, x({ probability: range[2] }) / chartWidth, y({ value: range[1] }) / chartHeight] : parseBounds(params.get('vxBrush'));
  const mapSelection = selectedMapIds(params.get('vxSelection')), pointIndex = new Map(points.map(point => [point.row.id, point]));
  const selected = filtered.filter(row => {
    if (mapSelection && !mapSelection.has(row.id)) return false;
    if (range) return row.probability !== null && row.value !== null && row.probability >= range[0] && row.probability <= range[2] && row.value >= range[1] && row.value <= range[3];
    if (!brush) return true;
    const point = mode === 'probability' && row.value !== null && row.probability !== null ? { x: x(row), y: y(row) } : pointIndex.get(row.id);
    return Boolean(point && point.x / chartWidth >= brush[0] && point.x / chartWidth <= brush[2] && point.y / chartHeight >= brush[1] && point.y / chartHeight <= brush[3]);
  });
  const selectedIds = new Set(selected.map(row => row.id)), focus = currencyRows.find(row => row.id === params.get('vxSelected'));
  const preview = currencyRows.find(row => row.id === hover) || focus, related = relatedExplorerRows(currencyRows, preview);
  const relatedIds = new Set([preview?.id, ...related.map(row => row.id)]), focusedPoint = preview ? pointIndex.get(preview.id) : undefined;
  const focusRelated = relatedExplorerRows(currencyRows, focus);
  // Ignore each view's own filter, retaining alternatives and distribution context.
  const brandContext = explorerGroups(filterExplorerRows(rows, { ...filters, brand: '' }), 'brand');
  const selectedBrands = new Map(explorerGroups(selected, 'brand').map(group => [group.key, group]));
  const monthContext = explorerGroups(filterExplorerRows(rows, { ...filters, month: '' }), 'month').sort((a, b) => a.key.localeCompare(b.key));
  const selectedMonths = new Map(explorerGroups(selected, 'month').map(group => [group.key, group.count]));
  const maxBrandValue = brandContext.reduce((max, group) => Math.max(max, group.value), 1), maxMonthCount = monthContext.reduce((max, group) => Math.max(max, group.count), 1);
  const leader = [...selectedBrands.values()].sort((a, b) => b.value - a.value)[0], sum = total(selected), valueCount = known(selected);
  const cells = new Map<string, Map<string, number>>();
  for (const row of selected) { const cell = cells.get(row.brand) || new Map<string, number>(); cell.set(row.stage, (cell.get(row.stage) || 0) + 1); cells.set(row.brand, cell); }
  let maxCell = 1; for (const group of cells.values()) for (const count of group.values()) maxCell = Math.max(maxCell, count);
  const zoom = bounded(params.get('vxZoom'), 1, 3, 1), panParts = (params.get('vxPan') || '').split(',');
  const tx = (pan?.[0] ?? bounded(panParts[0] || null, -2, 2, 0)) * chartWidth, ty = (pan?.[1] ?? bounded(panParts[1] || null, -2, 2, 0)) * chartHeight;
  const transform = `translate(${chartWidth / 2 + tx} ${chartHeight / 2 + ty}) scale(${zoom}) translate(${-chartWidth / 2} ${-chartHeight / 2})`, activeBounds = dragBounds || (mode === 'probability' ? brush : null);
  const displayValue = (row: ExplorerRow) => row.value === null ? 'Value unknown' : formatCompactCurrencyAmount(row.value, row.currency);
  const stageContext = explorerGroups(filterExplorerRows(rows, { ...filters, stage: '' }), 'stage');

  useEffect(() => { if (!scene.current) return; const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width)); observer.observe(scene.current); return () => observer.disconnect(); }, []);
  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    if (Object.keys(patch).some(key => ['vxBrand', 'vxStage', 'vxMonth', 'vxQuery', 'vxCurrency'].includes(key))) { next.delete('vxSelected'); next.delete('vxBrush'); next.delete('vxSelection'); next.delete('vxRange'); }
    for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
    setPage(0); setHover(null); setParams(next, { replace: Object.keys(patch).every(key => key === 'vxQuery') });
  }
  function reset() { const next = new URLSearchParams(params); for (const key of [...next.keys()]) if (key.startsWith('vx')) next.delete(key); setPage(0); setHover(null); setParams(next); }
  function select(id: string) { update({ vxSelected: params.get('vxSelected') === id ? null : id }); }
  const start = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null), moved = useRef(false);
  function position(event: PointerEvent<SVGSVGElement>) { const bounds = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }; }
  function unproject(p: { x: number; y: number }) { return { x: Math.max(0, Math.min(1, (p.x - .5 - tx / chartWidth) / zoom + .5)), y: Math.max(0, Math.min(1, (p.y - .5 - ty / chartHeight) / zoom + .5)) }; }
  async function exportView() {
    setExportState('Preparing export…');
    try {
      const zip = new JSZip(); zip.file('opportunities.csv', '\uFEFF' + explorerCsv(selected));
      zip.file('view.json', JSON.stringify({ version: 2, source: sample ? 'Demo workspace' : 'Workspace records', currency, mode, filters, brush, range, mapSelection: mapSelection ? [...mapSelection] : null, selectedId: focus?.id || null, count: selected.length, exportedAt: new Date().toISOString(), note: 'Current recorded estimates, not realized revenue. Map connections mean same canonical customer. Map position groups brands; it is not a quantitative axis.', url: window.location.href }, null, 2));
      const svg = root.current?.querySelector('svg[data-export]');
      if (svg) { const clone = svg.cloneNode(true) as SVGSVGElement; clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('font-family', 'Inter, Arial, sans-serif'); zip.file('opportunity-landscape.svg', new XMLSerializer().serializeToString(clone)); }
      download(await zip.generateAsync({ type: 'blob' }), 'memoire-visual-explorer.zip'); setExportState('Downloaded: vector scene, selected records and view settings.');
    } catch { setExportState('Export failed. Please retry.'); }
  }
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(selected.length / 12) - 1));
  return <section className="vx" ref={root} data-testid="visual-explorer" aria-label="Visual Explorer">
    <header className="vx-heading"><div><p className="vx-eyebrow">Memoire / Visual Explorer / {sample ? 'Demo data' : 'Workspace records'}</p><h3>Portfolio, in perspective.</h3><p className="vx-subtitle">Where does your book concentrate — and how are customers connected?</p></div><div className="vx-actions"><button className="vx-icon" aria-label="Reset visual explorer" onClick={reset}><RotateCcw size={16} /></button><button className="vx-button" onClick={exportView} disabled={exportState === 'Preparing export…'}><Download size={15} />Export view</button></div></header>
    <div className="vx-command"><div className="vx-modes" role="group" aria-label="Visualization mode"><button aria-pressed={mode === 'map'} onClick={() => update({ vxMode: null, vxBrush: null, vxPan: null, vxZoom: null })}>Portfolio map</button><button aria-pressed={mode === 'probability'} onClick={() => update({ vxMode: 'probability', vxBrush: null, vxPan: null, vxZoom: null })}>Value & probability</button></div><select aria-label="Explorer currency" value={currency} onChange={event => update({ vxCurrency: event.target.value })}>{currencies.length ? currencies.map(code => <option key={code}>{code}</option>) : <option>Unspecified</option>}</select><label className="vx-search"><Search size={15} /><input aria-label="Search explorer records" placeholder="Customer, opportunity, brand…" value={filters.query} onChange={event => update({ vxQuery: event.target.value })} /></label><select aria-label="Explorer stage" value={filters.stage} onChange={event => update({ vxStage: event.target.value || null })}><option value="">All stages</option>{stageContext.map(group => <option key={group.key} value={group.key}>{group.key} · {group.count}</option>)}{filters.stage && !stageContext.some(group => group.key === filters.stage) && <option>{filters.stage}</option>}</select></div>
    <div className="vx-state" aria-live="polite"><strong>{selected.length} of {currencyRows.length} opportunities</strong><span>{valueCount ? formatCompactCurrencyAmount(sum, currency) : 'Value unknown'} in recorded estimates</span>{(['brand', 'stage', 'month'] as const).filter(key => filters[key]).map(key => <button className="vx-chip" key={key} aria-label={`Clear ${key} filter`} onClick={() => update({ [`vx${key[0].toUpperCase()}${key.slice(1)}`]: null })}>{filters[key]}<X size={12} /></button>)}{(brush || mapSelection) && <button className="vx-chip" onClick={() => update({ vxBrush: null, vxSelection: null, vxRange: null })}>Clear plot selection<X size={12} /></button>}</div>
    <div className="vx-workspace"><div className="vx-scene" ref={scene}>
      <div className="vx-scene-command"><span>{mode === 'map' ? 'AREA → ESTIMATE · COLOR → BRAND' : `PROBABILITY × ESTIMATE (${currency})`}</span><div>{mode === 'probability' && <button className="vx-small" aria-pressed={log} onClick={() => update({ vxScale: log ? null : 'log', vxBrush: null })}>{log ? 'Log value scale' : 'Linear value scale'}</button>}<button className="vx-icon" aria-label="Brush selection" aria-pressed={tool === 'brush'} onClick={() => setTool(tool === 'brush' ? 'inspect' : 'brush')}><Scan size={15} /></button><button className="vx-icon" aria-label="Pan visualization" aria-pressed={tool === 'pan'} onClick={() => setTool(tool === 'pan' ? 'inspect' : 'pan')}><Move size={15} /></button><button className="vx-icon" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => update({ vxZoom: String(Math.max(1, zoom - .25)) })}><Minus size={15} /></button><button className="vx-icon" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => update({ vxZoom: String(Math.min(3, zoom + .25)) })}><Plus size={15} /></button><button className="vx-small" onClick={() => update({ vxZoom: null, vxPan: null })}>{Math.round(zoom * 100)}%</button></div></div>
      <svg data-export="opportunity-landscape" className="vx-plot" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="group" tabIndex={0} aria-label="Opportunity landscape. Arrow keys browse opportunities, Enter selects, Escape clears. Use brand filters for group selection." style={{ touchAction: tool === 'inspect' ? 'pan-y' : 'none' }} onKeyDown={event => {
        if (event.key === 'Escape') { setHover(null); update({ vxSelected: null, vxBrush: null, vxSelection: null, vxRange: null }); }
        if (event.key === 'Enter' && points.length) { event.preventDefault(); select(hover || points[0].row.id); }
        if (['ArrowRight', 'ArrowLeft'].includes(event.key) && points.length) { event.preventDefault(); const index = points.findIndex(point => point.row.id === (hover || focus?.id)); setHover(points[(index + (event.key === 'ArrowRight' ? 1 : -1) + points.length) % points.length].row.id); }
      }} onPointerDown={event => { if ((event.target as Element).closest('[data-point]') || event.button !== 0 || (event.pointerType === 'touch' && tool === 'inspect')) return; const p = position(event); start.current = { ...p, tx: tx / chartWidth, ty: ty / chartHeight }; moved.current = false; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => {
        if (!start.current) return; const p = position(event), s = start.current; moved.current = Math.abs(p.x - s.x) + Math.abs(p.y - s.y) > .015;
        if (tool === 'pan') setPan([Math.max(-2, Math.min(2, s.tx + p.x - s.x)), Math.max(-2, Math.min(2, s.ty + p.y - s.y))]);
        else { const a = unproject(s), b = unproject(p); setDragBounds([Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]); }
      }} onPointerUp={() => { if (!start.current) return; if (moved.current && tool === 'pan' && pan) update({ vxPan: pan.map(n => n.toFixed(4)).join(',') }); else if (moved.current && dragBounds) { if (mode === 'map') { const ids = points.filter(point => point.x / chartWidth >= dragBounds[0] && point.x / chartWidth <= dragBounds[2] && point.y / chartHeight >= dragBounds[1] && point.y / chartHeight <= dragBounds[3]).map(point => point.row.id); update({ vxSelection: JSON.stringify(ids), vxBrush: null, vxRange: null }); } else { const probability = (coordinate: number) => Math.max(0, Math.min(100, (coordinate * chartWidth - 64) / (chartWidth - 100) * 100)); const estimate = (coordinate: number) => { const ratio = Math.max(0, Math.min(1, 1 - (coordinate * chartHeight - 38) / (chartHeight - 100))); return log ? Math.expm1(ratio * Math.log1p(maxValue)) : ratio * maxValue; }; update({ vxRange: JSON.stringify([probability(dragBounds[0]), estimate(dragBounds[3]), probability(dragBounds[2]), estimate(dragBounds[1])]), vxBrush: null, vxSelection: null }); } } else if (!moved.current) update({ vxSelected: null }); start.current = null; setDragBounds(null); setPan(null); }} onPointerCancel={() => { start.current = null; setDragBounds(null); setPan(null); }} onPointerLeave={() => { if (!start.current) setHover(null); }}>
        <title>Memoire portfolio · {currency} · {sample ? 'Demo data' : 'Workspace records'}</title><desc>{selected.length} selected opportunities. {mode === 'map' ? 'Grouped by recorded brand. Circle area encodes estimates, with a minimum size for tiny, zero or unknown amounts. Connections indicate the same canonical customer.' : `Recorded probability on x, estimate on y. ${log ? 'Logarithmic' : 'Linear'} value scale.`} All statuses included; these are not revenue.</desc><rect width={chartWidth} height={chartHeight} fill="#faf8f3" />{mode === 'map' && <text x="12" y="14" fontSize="10" fill="#67736c">{sample ? 'Demo' : 'Workspace'} · {currency} · area = recorded estimate</text>}<g transform={transform}>
          {mode === 'probability' && <g>{[0, .25, .5, .75, 1].map(ratio => <g key={ratio}><line x1="64" x2={chartWidth - 36} y1={38 + ratio * (chartHeight - 100)} y2={38 + ratio * (chartHeight - 100)} stroke="#dedfd7" /><text x="55" y={42 + ratio * (chartHeight - 100)} textAnchor="end" fontSize="11" fill="#67736c">{compact.format(log ? Math.expm1((1 - ratio) * Math.log1p(maxValue)) : (1 - ratio) * maxValue)}</text><text x={64 + ratio * (chartWidth - 100)} y={chartHeight - 34} textAnchor="middle" fontSize="11" fill="#67736c">{ratio * 100}%</text></g>)}<text x="64" y="20" fontSize="11" fill="#67736c">Estimate · {currency}{log ? ' · log scale' : ''}</text><text x={chartWidth / 2} y={chartHeight - 12} textAnchor="middle" fontSize="11" fill="#67736c">Recorded probability</text></g>}
          {mode === 'map' && layout.clusters.map(cluster => <g key={cluster.brand} opacity={preview && preview.brand !== cluster.brand && !related.some(row => row.brand === cluster.brand) ? .35 : 1}><circle cx={cluster.x} cy={cluster.y} r={cluster.r} fill="none" stroke={color(cluster.brand)} strokeOpacity=".12" strokeDasharray="2 5" /><text x={cluster.x} y={cluster.y - cluster.r - 10} textAnchor="middle" fontSize={width < 500 ? 11 : 13} fontWeight="600" fill={color(cluster.brand)}>{cluster.brand.length > 21 ? cluster.brand.slice(0, 19) + '…' : cluster.brand}<title>{cluster.brand}</title></text><text x={cluster.x} y={cluster.y + cluster.r + 17} textAnchor="middle" fontSize="10" fill="#67736c">{currencyRows.filter(row => row.brand === cluster.brand).length} opportunities</text></g>)}
          {focusedPoint && related.filter(row => pointIndex.has(row.id)).map(row => { const point = pointIndex.get(row.id)!; return <path key={row.id} data-relation={row.id} d={`M${focusedPoint.x},${focusedPoint.y} Q${(focusedPoint.x + point.x) / 2},${(focusedPoint.y + point.y) / 2 - 40} ${point.x},${point.y}`} fill="none" stroke={color(row.brand)} strokeOpacity=".6" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />; })}
          {points.map(point => { const emphasized = preview ? relatedIds.has(point.row.id) : selectedIds.has(point.row.id), isFocus = point.row.id === preview?.id; return <g key={point.row.id} data-point={point.row.id} role="button" aria-label={`${point.row.name}, ${point.row.brand}, ${displayValue(point.row)}`} aria-pressed={isFocus} onPointerEnter={() => { if (!start.current) setHover(point.row.id); }} onClick={() => select(point.row.id)} style={{ cursor: 'pointer' }}><circle cx={point.x} cy={point.y} r={Math.max(point.r, 8)} fill="transparent" /><circle cx={point.x} cy={point.y} r={point.r} fill={point.row.value === null || point.row.value === 0 ? '#faf8f3' : color(point.row.brand)} fillOpacity={emphasized ? .86 : .1} stroke={isFocus ? '#183832' : color(point.row.brand)} strokeWidth={isFocus ? 2.5 : point.row.value === null ? 1.2 : .5} strokeOpacity={emphasized ? .9 : .14} strokeDasharray={point.row.value === null ? '2 2' : undefined} />{isFocus && <circle cx={point.x} cy={point.y} r={point.r + 4} fill="none" stroke="#183832" strokeWidth="1" />}<title>{point.row.name} · {point.row.account} · {point.row.stage} · {displayValue(point.row)}</title></g>; })}
          {activeBounds && <rect x={activeBounds[0] * chartWidth} y={activeBounds[1] * chartHeight} width={(activeBounds[2] - activeBounds[0]) * chartWidth} height={(activeBounds[3] - activeBounds[1]) * chartHeight} fill="#183832" fillOpacity=".05" stroke="#183832" strokeDasharray="4 3" pointerEvents="none" />}
        </g>
      </svg>
      <div className="vx-reading-key"><span>{mode === 'map' ? 'Position groups brands; distance has no numerical meaning.' : `${currencyRows.filter(row => row.value === null || row.probability === null).length} records have missing value or probability.`}</span><span>{mode === 'map' ? 'Hollow = zero · dashed = unknown · tiny values have a minimum size.' : 'Color identifies brand. Select a dot to inspect.'}</span>{currencyRows.length > 1000 && <span>First 1,000 marks shown. Search and matching records include all. Map brush selects displayed marks only.</span>}</div>
    </div>
    <aside className="vx-inspector" aria-label="Opportunity inspector" aria-live="polite">{focus ? <>
      <div className="vx-inspector-top"><p className="vx-eyebrow">Selected opportunity</p><button className="vx-icon" aria-label="Close opportunity details" onClick={() => update({ vxSelected: null })}><X size={16} /></button></div><h4>{focus.name}</h4><p className="vx-account">{focus.account || 'Customer not recorded'}</p>
      <dl className="vx-facts"><div><dt>Recorded estimate</dt><dd>{displayValue(focus)}</dd></div><div><dt>Stage / status</dt><dd>{focus.stage} / {focus.status}</dd></div><div><dt>Recorded probability</dt><dd>{focus.probability === null ? 'Unknown' : `${focus.probability}%`}</dd></div><div><dt>Brand</dt><dd style={{ color: color(focus.brand) }}>{focus.brand}</dd></div></dl>{!selectedIds.has(focus.id) && <p className="vx-note">This opportunity is outside the active selection. Its context is still visible.</p>}
      <div className="vx-next"><p className="vx-eyebrow">Next action</p><p>{focus.nextAction || 'No next action recorded'}</p>{focus.nextActionDate && <time>{formatSafeBusinessDate(focus.nextActionDate)}</time>}</div><Link className="vx-open" to={`/app/opportunities?opportunityId=${encodeURIComponent(focus.id)}`}>Open opportunity<ArrowUpRight size={16} /></Link>
      <div className="vx-related"><p className="vx-eyebrow">Same customer · {focusRelated.length} other opportunities</p>{focusRelated.slice(0, 5).map(row => <button key={row.id} onClick={() => select(row.id)}><span className="vx-dot" style={{ background: color(row.brand) }} /><span>{row.name}<small>{row.brand} · {row.stage}</small></span><strong>{displayValue(row)}</strong></button>)}{!focusRelated.length && <p className="vx-note">No other linked opportunities in this currency.</p>}<p className="vx-note">Connections use normalized customer names and confirmed account merges.</p></div>
    </> : <><p className="vx-eyebrow">Read the landscape</p><h4>{leader && sum > 0 ? `${leader.key} carries ${Math.round(100 * leader.value / sum)}% of known estimates.` : 'A different perspective on your book.'}</h4><p className="vx-insight">{leader && sum > 0 ? 'Across the current selection and all recorded statuses. Circle sizes show concentration within each brand.' : 'Every circle is one opportunity. Select a circle to see its customer, next action and connected opportunities.'}</p><dl className="vx-facts"><div><dt>Customer groups</dt><dd>{new Set(selected.map(row => row.accountKey).filter(Boolean)).size}</dd></div><div><dt>Brands</dt><dd>{selectedBrands.size}</dd></div><div><dt>Missing estimates</dt><dd>{selected.length - valueCount}</dd></div></dl><p className="vx-note">Current recorded estimates, including Won and Lost. These are not realized revenue or a weighted forecast.</p><div className="vx-guide"><span>01</span><p>Choose a brand or stage to narrow the view.</p><span>02</span><p>Select a circle to reveal the same customer's connections.</p><span>03</span><p>Compare value with recorded probability in the second view.</p></div></>}</aside></div>
    <details className="vx-support" open={width >= 500}><summary>Supporting insights<span>Brand concentration · stage distribution · creation history</span></summary><div className="vx-support-grid">
      <section aria-label="Brand concentration"><p className="vx-eyebrow">Brand concentration</p><p className="vx-support-note">Known estimates · {currency}</p><div className="vx-brand-list">{[...brandContext].sort((a, b) => b.value - a.value).map(group => { const selectedGroup = selectedBrands.get(group.key); return <button key={group.key} aria-pressed={filters.brand === group.key} aria-label={`Filter brand ${group.key}`} onClick={() => update({ vxBrand: filters.brand === group.key ? null : group.key })}><span>{group.key}<small>{selectedGroup?.count || 0}/{group.count}</small></span><span className="vx-bar"><i style={{ width: `${100 * group.value / maxBrandValue}%`, background: color(group.key), opacity: .13 }} /><i style={{ width: `${100 * (selectedGroup?.value || 0) / maxBrandValue}%`, background: color(group.key) }} /></span><strong>{selectedGroup?.known ? compact.format(selectedGroup.value) : '—'}</strong></button>; })}</div></section>
      <section aria-label="Brand stage distribution"><p className="vx-eyebrow">Brand × stage</p><p className="vx-support-note">Opportunity counts · darker means more</p><div className="vx-matrix"><table><thead><tr><th>Brand</th>{EXPLORER_STAGES.map(stage => <th key={stage}><button title={stage} onClick={() => update({ vxStage: filters.stage === stage ? null : stage })}>{stage === 'Technical discussion' ? 'Tech' : stage === 'Qualification' ? 'Qual.' : stage === 'Negotiation' ? 'Neg.' : stage === 'Procurement' ? 'Proc.' : stage}</button></th>)}</tr></thead><tbody>{brandContext.map(group => <tr key={group.key}><th>{group.key}</th>{EXPLORER_STAGES.map(stage => { const count = cells.get(group.key)?.get(stage) || 0; return <td key={stage}><button aria-label={`${group.key}, ${stage}: ${count} opportunities`} aria-pressed={filters.brand === group.key && filters.stage === stage} onClick={() => update({ vxBrand: group.key, vxStage: stage })} style={{ background: count ? color(group.key) : '#e9e8e1', opacity: count ? .35 + .65 * count / maxCell : 1, color: count ? '#fff' : '#738078' }}>{count || '·'}</button></td>; })}</tr>)}</tbody></table></div></section>
      <section aria-label="Creation history"><p className="vx-eyebrow">When the book was created</p><p className="vx-support-note">Creation month · foreground = selection</p><div className="vx-months">{monthContext.map(group => <button key={group.key} aria-label={`Filter month ${group.key}`} aria-pressed={filters.month === group.key} onClick={() => update({ vxMonth: filters.month === group.key ? null : group.key })}><span>{selectedMonths.get(group.key) || 0}/{group.count}</span><i><b style={{ height: `${100 * group.count / maxMonthCount}%`, background: '#d9ddd5' }} /><b style={{ height: `${100 * (selectedMonths.get(group.key) || 0) / maxMonthCount}%`, background: '#284b42' }} /></i><small>{group.key === 'Unknown date' ? 'Unknown' : group.key.slice(2)}</small></button>)}</div></section>
    </div></details>
    <div className="vx-footer"><span>Source: {sample ? 'explicitly illustrative demo records' : 'workspace records'} · {currency} only · original brand text</span><span role="status">{exportState || 'Select → connect → inspect'}</span></div>{!selected.length && <p className="vx-empty">No records match this selection. Clear a filter or reset to explore the book.</p>}
    <details className="vx-records"><summary>Explore matching records <span>{selected.length} opportunities</span></summary><div className="vx-record-grid">{selected.slice(visiblePage * 12, (visiblePage + 1) * 12).map(row => <button key={row.id} aria-label={`Inspect ${row.name}`} aria-pressed={focus?.id === row.id} onClick={() => select(row.id)}><span className="vx-dot" style={{ background: color(row.brand) }} /><span>{row.name}<small>{row.account} · {row.stage}</small></span><strong>{displayValue(row)}</strong></button>)}</div>{selected.length > 12 && <nav className="vx-pagination" aria-label="Explorer record pages"><button className="vx-button" disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)}>Previous</button><span>{visiblePage + 1} / {Math.ceil(selected.length / 12)}</span><button className="vx-button" disabled={(visiblePage + 1) * 12 >= selected.length} onClick={() => setPage(visiblePage + 1)}>Next</button></nav>}</details>
  </section>;
}
