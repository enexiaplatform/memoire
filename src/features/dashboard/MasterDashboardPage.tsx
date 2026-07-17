import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import JSZip from 'jszip';
import { ArrowRight, Download, RefreshCw } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { DataModePill } from '../../components/common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import { hasLocalSampleData } from '../../utils/dataMode';
import { buildMasterDashboard, type MasterDashboardModel } from '../../utils/masterDashboard';
import { formatCompactCurrencyAmount } from '../../utils/money';
import { trackProductEvent } from '../../utils/productAnalytics';

// Chart palette: fixed hex values (not Tailwind classes) so the SVGs survive
// serialization to PNG for the presentation export.
const CHART = {
  navy: '#16283c',
  blue: '#2563eb',
  blueSoft: '#93c5fd',
  emerald: '#059669',
  amber: '#d97706',
  red: '#dc2626',
  slate: '#64748b',
  grid: '#e2e8f0',
  font: 'Inter, Arial, sans-serif',
};

const EVIDENCE_COLORS: Record<string, string> = {
  Defensible: CHART.emerald,
  'Weak but recoverable': CHART.amber,
  'Hope-based': CHART.red,
  Unsupported: CHART.slate,
};

export function MasterDashboardPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuthContext();
  const [workspace, setWorkspace] = useState<SalesWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const stageChartRef = useRef<SVGSVGElement>(null);
  const activityChartRef = useRef<SVGSVGElement>(null);
  const evidenceChartRef = useRef<SVGSVGElement>(null);

  const loadDashboard = async (force = false) => {
    if (force) setSyncing(true);
    setLoading(!force);
    try {
      setWorkspace(await loadSalesWorkspaceData(dataUserId, { force }));
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!authLoading) void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, dataUserId]);

  useEffect(() => {
    trackProductEvent('master_dashboard_opened');
  }, []);

  const model = useMemo(() => (workspace ? buildMasterDashboard(workspace) : null), [workspace]);
  const hasData = Boolean(workspace && (workspace.opportunities.length || workspace.activities.length || workspace.quotes.length));

  const handleExport = async () => {
    if (!model) return;
    setExporting(true);
    setExportMessage('');
    try {
      const zip = new JSZip();
      const dateKey = new Date().toISOString().slice(0, 10);
      addDashboardCsvFiles(zip, model);

      const charts: Array<[string, SVGSVGElement | null]> = [
        ['pipeline-by-stage.png', stageChartRef.current],
        ['weekly-activity.png', activityChartRef.current],
        ['forecast-evidence.png', evidenceChartRef.current],
      ];
      for (const [name, svg] of charts) {
        if (!svg) continue;
        const png = await svgToPngBlob(svg);
        if (png) zip.file(name, png);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      downloadBlob(content, `memoire-dashboard-${dateKey}.zip`);
      setExportMessage('Export downloaded: PNG charts (drop into PowerPoint/Slides) + CSV data.');
      trackProductEvent('master_dashboard_exported');
    } catch {
      setExportMessage('Export failed. Please retry.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">The whole business, in charts.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Every chart and stat in one place. For what to do next, use Today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !hasData}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90 disabled:opacity-50"
            title="Download charts as PNG and data as CSV for presentations"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            title="Reload dashboard"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Cloud sync
          </button>
          <DataModePill
            compact
            isLoading={authLoading || loading}
            isAuthenticated={isAuthenticated}
            isSupabaseConfigured={isSupabaseConfigured}
            cloudAvailable={isSupabaseConfigured}
            hasSampleData={sampleDataActive}
          />
        </div>
      </header>

      {exportMessage && (
        <p className="rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-700">{exportMessage}</p>
      )}

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">
          Loading dashboard...
        </div>
      ) : !hasData || !model ? (
        <DashboardEmptyState />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key numbers">
            <KpiCard label="Open deals" value={String(model.kpis.openDeals)} sub={`${formatCompactCurrencyAmount(model.kpis.openPipelineBase, model.reportingCurrency)} pipeline`} />
            <KpiCard label="Money in motion" value={formatCompactCurrencyAmount(model.kpis.inMotionBase, model.reportingCurrency)} sub={`${model.kpis.stuckThreads} stuck thread${model.kpis.stuckThreads === 1 ? '' : 's'}`} tone={model.kpis.stuckThreads > 0 ? 'warn' : 'default'} />
            <KpiCard label="Activities · 30 days" value={String(model.kpis.activitiesLast30)} sub={`${model.kpis.openQuotes} open quote${model.kpis.openQuotes === 1 ? '' : 's'}`} />
            <KpiCard
              label="Won / Lost"
              value={`${model.outcomes.won.count} / ${model.outcomes.lost.count}`}
              sub={`${formatCompactCurrencyAmount(model.outcomes.won.totalBase, model.reportingCurrency)} won`}
              tone="positive"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Pipeline by stage" subtitle={`Active deals · value in ${model.reportingCurrency}`}>
              <StageBarChart model={model} svgRef={stageChartRef} />
            </ChartCard>
            <ChartCard title="Activity trend" subtitle="Captured activities per week · last 8 weeks">
              <WeeklyActivityChart model={model} svgRef={activityChartRef} />
            </ChartCard>
            <ChartCard title="Forecast evidence mix" subtitle="How defensible the active pipeline is">
              <EvidenceMixChart model={model} svgRef={evidenceChartRef} />
            </ChartCard>
            <div className="flex flex-col gap-4">
              <OutcomesCard model={model} />
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold text-navy">Go deeper</h2>
                <div className="mt-3 flex flex-col gap-2 text-sm font-semibold">
                  <Link to="/app/revenue" className="inline-flex items-center gap-2 text-brand-blue hover:underline">Money flow, end to end <ArrowRight className="h-4 w-4" /></Link>
                  <Link to="/app/opportunities" className="inline-flex items-center gap-2 text-brand-blue hover:underline">Opportunities <ArrowRight className="h-4 w-4" /></Link>
                  <Link to="/app/weekly-brief" className="inline-flex items-center gap-2 text-brand-blue hover:underline">Business Review <ArrowRight className="h-4 w-4" /></Link>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, tone = 'default' }: { label: string; value: string; sub: string; tone?: 'default' | 'warn' | 'positive' }) {
  const subColor = tone === 'warn' ? 'text-amber-700' : tone === 'positive' ? 'text-emerald-700' : 'text-gray-500';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-navy">{value}</p>
      <p className={`mt-1 text-xs font-semibold ${subColor}`}>{sub}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-navy">{title}</h2>
      <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StageBarChart({ model, svgRef }: { model: MasterDashboardModel; svgRef: Ref<SVGSVGElement> }) {
  const rows = model.stageMix;
  const rowHeight = 30;
  const top = 8;
  const labelWidth = 128;
  const width = 520;
  const height = top + Math.max(rows.length, 1) * rowHeight + 8;
  const maxValue = Math.max(...rows.map((row) => row.totalBase), 1);
  const barArea = width - labelWidth - 118;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Pipeline value by stage">
      {rows.length === 0 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fontFamily={CHART.font} fontSize="13" fill={CHART.slate}>No active deals yet</text>
      )}
      {rows.map((row, index) => {
        const y = top + index * rowHeight;
        const barWidth = Math.max((row.totalBase / maxValue) * barArea, row.totalBase > 0 ? 4 : 2);
        return (
          <g key={row.stage}>
            <text x={labelWidth - 8} y={y + 19} textAnchor="end" fontFamily={CHART.font} fontSize="12" fill={CHART.navy}>{row.stage}</text>
            <rect x={labelWidth} y={y + 7} width={barArea} height={16} rx={4} fill="#f1f5f9" />
            <rect x={labelWidth} y={y + 7} width={barWidth} height={16} rx={4} fill={CHART.blue} />
            <text x={labelWidth + barArea + 8} y={y + 19} fontFamily={CHART.font} fontSize="11" fill={CHART.slate}>
              {row.count} · {formatCompactCurrencyAmount(row.totalBase, model.reportingCurrency)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function WeeklyActivityChart({ model, svgRef }: { model: MasterDashboardModel; svgRef: Ref<SVGSVGElement> }) {
  const points = model.weeklyActivity;
  const width = 520;
  const height = 200;
  const left = 34;
  const bottom = height - 26;
  const chartTop = 14;
  const maxCount = Math.max(...points.map((point) => point.count), 1);
  const slot = (width - left - 12) / points.length;
  const barWidth = Math.min(slot * 0.55, 34);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Activities per week">
      {[0, 0.5, 1].map((fraction) => {
        const y = bottom - fraction * (bottom - chartTop);
        return (
          <g key={fraction}>
            <line x1={left} y1={y} x2={width - 8} y2={y} stroke={CHART.grid} strokeWidth="1" />
            <text x={left - 6} y={y + 4} textAnchor="end" fontFamily={CHART.font} fontSize="10" fill={CHART.slate}>
              {Math.round(fraction * maxCount)}
            </text>
          </g>
        );
      })}
      {points.map((point, index) => {
        const barHeight = (point.count / maxCount) * (bottom - chartTop);
        const x = left + index * slot + (slot - barWidth) / 2;
        return (
          <g key={point.weekStart}>
            <rect x={x} y={bottom - barHeight} width={barWidth} height={Math.max(barHeight, point.count > 0 ? 3 : 0)} rx={3} fill={index === points.length - 1 ? CHART.blueSoft : CHART.blue} />
            {point.count > 0 && (
              <text x={x + barWidth / 2} y={bottom - barHeight - 5} textAnchor="middle" fontFamily={CHART.font} fontSize="10" fill={CHART.navy}>{point.count}</text>
            )}
            <text x={x + barWidth / 2} y={bottom + 15} textAnchor="middle" fontFamily={CHART.font} fontSize="10" fill={CHART.slate}>{point.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function EvidenceMixChart({ model, svgRef }: { model: MasterDashboardModel; svgRef: Ref<SVGSVGElement> }) {
  const rows = model.evidenceMix;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const width = 520;
  const height = 64 + rows.length * 22;
  const segments = rows.map((row) => (total > 0 ? (row.count / total) * (width - 32) : 0));
  const offsets = segments.map((_, index) => 16 + segments.slice(0, index).reduce((sum, segment) => sum + segment, 0));

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Forecast evidence mix">
      {total === 0 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fontFamily={CHART.font} fontSize="13" fill={CHART.slate}>No active deals yet</text>
      )}
      {total > 0 && (
        <>
          {rows.map((row, index) => (
            <rect key={row.category} x={offsets[index]} y={14} width={Math.max(segments[index] - 2, 2)} height={22} rx={4} fill={EVIDENCE_COLORS[row.category] || CHART.slate} />
          ))}
          {rows.map((row, index) => {
            const y = 62 + index * 22;
            return (
              <g key={row.category}>
                <rect x={16} y={y - 10} width={12} height={12} rx={3} fill={EVIDENCE_COLORS[row.category] || CHART.slate} />
                <text x={36} y={y + 1} fontFamily={CHART.font} fontSize="12" fill={CHART.navy}>{row.category}</text>
                <text x={width - 16} y={y + 1} textAnchor="end" fontFamily={CHART.font} fontSize="12" fill={CHART.slate}>
                  {row.count} · {Math.round((row.count / total) * 100)}%
                </text>
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
}

function OutcomesCard({ model }: { model: MasterDashboardModel }) {
  const { won, lost } = model.outcomes;
  const total = won.count + lost.count;
  const winRate = total > 0 ? Math.round((won.count / total) * 100) : null;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-navy">Win / loss record</h2>
      <p className="mt-0.5 text-xs text-gray-500">Closed outcomes recorded in Memoire</p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-emerald-50 p-3">
          <p className="text-xl font-bold text-emerald-700">{won.count}</p>
          <p className="text-xs font-semibold text-emerald-700">Won · {formatCompactCurrencyAmount(won.totalBase, model.reportingCurrency)}</p>
        </div>
        <div className="rounded-lg bg-red-50 p-3">
          <p className="text-xl font-bold text-red-700">{lost.count}</p>
          <p className="text-xs font-semibold text-red-700">Lost · {formatCompactCurrencyAmount(lost.totalBase, model.reportingCurrency)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xl font-bold text-navy">{winRate === null ? '—' : `${winRate}%`}</p>
          <p className="text-xs font-semibold text-gray-500">Win rate</p>
        </div>
      </div>
    </section>
  );
}

function DashboardEmptyState() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
      <h2 className="text-lg font-bold text-navy">No data to chart yet</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        Capture activity and add opportunities, and the dashboard builds itself. Start from Today or Capture.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Link to="/app/today" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90">Go to Today</Link>
        <Link to="/app/capture" className="rounded-full border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">Capture activity</Link>
      </div>
    </div>
  );
}

function addDashboardCsvFiles(zip: JSZip, model: MasterDashboardModel) {
  const csv = (rows: (string | number)[][]) =>
    rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');

  zip.file('dashboard-kpis.csv', csv([
    ['Metric', 'Value'],
    ['Reporting currency', model.reportingCurrency],
    ['Open deals', model.kpis.openDeals],
    [`Open pipeline (${model.reportingCurrency})`, Math.round(model.kpis.openPipelineBase)],
    [`Money in motion (${model.reportingCurrency})`, Math.round(model.kpis.inMotionBase)],
    ['Stuck threads', model.kpis.stuckThreads],
    ['Activities, last 30 days', model.kpis.activitiesLast30],
    ['Open quotes', model.kpis.openQuotes],
    ['Deals won', model.outcomes.won.count],
    [`Won value (${model.reportingCurrency})`, Math.round(model.outcomes.won.totalBase)],
    ['Deals lost', model.outcomes.lost.count],
  ]));

  zip.file('pipeline-by-stage.csv', csv([
    ['Stage', 'Deals', `Value (${model.reportingCurrency})`],
    ...model.stageMix.map((row) => [row.stage, row.count, Math.round(row.totalBase)] as (string | number)[]),
  ]));

  zip.file('weekly-activity.csv', csv([
    ['Week starting', 'Activities'],
    ...model.weeklyActivity.map((point) => [point.weekStart, point.count] as (string | number)[]),
  ]));

  zip.file('forecast-evidence.csv', csv([
    ['Evidence category', 'Deals'],
    ...model.evidenceMix.map((row) => [row.category, row.count] as (string | number)[]),
  ]));
}

async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob | null> {
  const viewBox = svg.viewBox.baseVal;
  const width = viewBox && viewBox.width ? viewBox.width : svg.clientWidth || 520;
  const height = viewBox && viewBox.height ? viewBox.height : svg.clientHeight || 200;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const xml = new XMLSerializer().serializeToString(clone);
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('SVG render failed'));
    image.src = source;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function downloadBlob(content: Blob, filename: string) {
  const url = window.URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
