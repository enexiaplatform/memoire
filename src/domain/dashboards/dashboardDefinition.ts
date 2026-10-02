import { reportMetricDefinitions, type ReportMetric } from '../reports/reportDefinition.ts';
import type { SavedReport } from '../reports/reportRecord.ts';
export const dashboardDimensions = { businessUnit: 'Business unit', brand: 'Brand', productGroup: 'Product group', product: 'Product / solution' } as const;
export type DashboardDimension = keyof typeof dashboardDimensions;
export type DashboardFilter = { field: DashboardDimension; id: string | null };
export type DashboardWidget = { id: string; title: string; reportId: string; type: 'metric' | 'bar' | 'table'; metric: ReportMetric };
export type DashboardDefinition = { schemaVersion: 1; name: string; description: string; filters: DashboardFilter[]; widgets: DashboardWidget[] };
export function newDashboard(): DashboardDefinition { return { schemaVersion: 1, name: 'My dashboard', description: '', filters: [], widgets: [] }; }
export function dashboardFromReport(report: SavedReport, widgetId: string): DashboardDefinition {
  if (report.archived) throw new Error('Restore this report before using it in a dashboard.');
  const preferred: ReportMetric = report.definition.dataset === 'collections' ? 'outstanding' : 'pipeline';
  const metric = report.definition.metrics.includes(preferred) ? preferred : report.definition.metrics[0];
  const compareGroups = report.definition.groupBy.some(field => report.definition.filterMode !== 'all'
    || !report.definition.filters.some(filter => filter.field === field && filter.operator === 'equals'));
  return parseDashboardDefinition({ ...newDashboard(), name: `${report.definition.name} dashboard`.slice(0, 200),
    widgets: [{ id: widgetId, title: reportMetricDefinitions[metric].label, reportId: report.id,
      type: compareGroups ? 'bar' : 'metric', metric }] });
}
export function parseDashboardDefinition(value: unknown): DashboardDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid dashboard definition.');
  const raw = value as DashboardDefinition;
  const text = (v: unknown, max: number, required = true): string => {
    if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error('Enter valid dashboard text.');
    return v.trim();
  };
  if (raw.schemaVersion !== 1) throw new Error('Unsupported dashboard version. Update Memoire before opening it.');
  if (!Array.isArray(raw.filters) || raw.filters.length > 4 || new Set(raw.filters.map(f => f?.field)).size !== raw.filters.length) throw new Error('Choose each dashboard dimension only once.');
  const filters = raw.filters.map(filter => {
    if (!filter || !Object.hasOwn(dashboardDimensions, filter.field)) throw new Error('Invalid dashboard filter.');
    return { field: filter.field, id: filter.id === null ? null : text(filter.id, 200) };
  });
  if (!Array.isArray(raw.widgets) || raw.widgets.length > 12 || new Set(raw.widgets.map(w => w?.id)).size !== raw.widgets.length) throw new Error('A dashboard supports up to 12 uniquely identified widgets.');
  const widgets = raw.widgets.map(widget => {
    if (!widget || !['metric', 'bar', 'table'].includes(widget.type) || !Object.hasOwn(reportMetricDefinitions, widget.metric)) throw new Error('Invalid dashboard widget.');
    return { id: text(widget.id, 200), title: text(widget.title, 200), reportId: text(widget.reportId, 200), type: widget.type, metric: widget.metric };
  });
  return { schemaVersion: 1, name: text(raw.name, 200), description: text(raw.description, 2000, false), filters, widgets };
}
