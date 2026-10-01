import { parseDashboardDefinition, type DashboardDefinition } from './dashboardDefinition.ts';
import { filterMatches, runReport, type ReportRun, type ReportMeasure, type ReportGroup } from '../reports/reportEngine.ts';
import { REPORT_ROW_LIMIT, type ReportMetric } from '../reports/reportDefinition.ts';
import { parseSavedReport, type SavedReport } from '../reports/reportRecord.ts';
import type { WorkspaceReportContext } from '../../services/reportData.ts';
export type DashboardReportResult = { reportId: string; version: number | null; run: ReportRun | null; error: string | null };
export type DashboardRun = { definition: DashboardDefinition; scopeKey: string; runAt: string; results: DashboardReportResult[] };
export function runDashboard(definition: DashboardDefinition, reports: SavedReport[], context: WorkspaceReportContext): DashboardRun {
  const parsed = parseDashboardDefinition(definition), registry = new Map<string, SavedReport>();
  for (const input of reports) {
    const report = parseSavedReport(input);
    if (registry.has(report.id)) throw new Error('Duplicate dashboard report identity. Reload the report library.');
    registry.set(report.id, report);
  }
  const results = [...new Set(parsed.widgets.map(widget => widget.reportId))].map(reportId => {
    const report = registry.get(reportId);
    try {
      if (!report || report.archived) throw new Error(report ? 'The source report is archived. Restore it or choose another report.' : 'The source report is missing. Choose another saved report.');
      const source = context.sources[report.definition.dataset];
      if (source.length > REPORT_ROW_LIMIT) throw new Error('The source exceeds 10,000 records. No partial report was produced.');
      if (new Set(source.map(row => row.id)).size !== source.length) throw new Error('Duplicate report source identity.');
      // Global dimensions narrow sources first, preserving each report's own AND/OR semantics.
      const sources = { ...context.sources, [report.definition.dataset]: source.filter(row => parsed.filters.every(filter =>
        filterMatches(row, { field: filter.field, operator: filter.id === null ? 'empty' : 'equals', value: filter.id }))) };
      return { reportId, version: report.version, run: runReport({ ...context, sources, definition: report.definition }), error: null };
    } catch (error) { return { reportId, version: report?.version ?? null, run: null, error: error instanceof Error ? error.message : 'Report unavailable.' }; }
  });
  return structuredClone({ definition: parsed, scopeKey: context.scopeKey, runAt: context.runAt, results });
}
export function widgetError(widget: DashboardDefinition['widgets'][number], result: DashboardReportResult | undefined): string | null {
  if (!result?.run) return result?.error || 'Run the dashboard to load this report.';
  if (!result.run.definition.metrics.includes(widget.metric)) return 'This measure is no longer selected in the source report. Edit the widget or report.';
  if (widget.type === 'bar' && !result.run.definition.groupBy.length) return 'Bar charts need a grouped report. Add a grouping in Reports or use a metric card.';
  return null;
}
export function measureText(key: ReportMetric, metric: ReportMeasure | undefined): string {
  if (!metric || metric.value === null) return key === 'winRate' ? `Needs 3 decided deals (${metric?.denominator || 0})` : 'Unavailable';
  const value = key === 'winRate' ? `${(metric.value * 100).toFixed(1)}% (${metric.denominator} decided)` : new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(metric.value);
  return metric.missing ? `${value} · partial, ${metric.missing} missing` : value;
}
/** Top groups are labelled as a subset; never folded into a misleading 'Other' rate. */
export function barGroups(run: ReportRun, metric: ReportMetric): ReportGroup[] {
  return [...run.groups].sort((a, b) => {
    const left = a.metrics[metric]?.value, right = b.metrics[metric]?.value;
    if (left == null || right == null) return Number(left == null) - Number(right == null) || a.key.localeCompare(b.key);
    return right - left || a.key.localeCompare(b.key);
  }).slice(0, 12);
}
