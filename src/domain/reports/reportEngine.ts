import { summarizePortfolio, type PortfolioFact, type PortfolioMoneyBasis } from '../portfolio/portfolioAnalytics.ts';
import { parseReportDefinition, REPORT_ROW_LIMIT, reportFields, reportMetricDefinitions,
  type ReportCell, type ReportDefinition, type ReportField, type ReportFilter, type ReportMetric, type ReportDataset } from './reportDefinition.ts';
export type ReportRow = { id: string; values: Partial<Record<ReportField, ReportCell>>; references: Partial<Record<ReportField, string | null>>; fact: PortfolioFact; href: string };
export type ReportMeasure = { value: number | null; missing: number; denominator?: number };
export type ReportGroup = { key: string; labels: string[]; sourceIds: string[]; metrics: Partial<Record<ReportMetric, ReportMeasure>> };
export type ReportRun = {
  definition: ReportDefinition; scopeKey: string; runAt: string; timezone: string; today: string; sourceStatus: string;
  money: PortfolioMoneyBasis; rows: ReportRow[]; groups: ReportGroup[]; totals: Partial<Record<ReportMetric, ReportMeasure>>;
  sourceCount: number; grain: string; metricVersions: Partial<Record<ReportMetric, number>>;
};
export function filterMatches(row: ReportRow, filter: ReportFilter): boolean {
  const value = reportFields[filter.field].type === 'catalog' ? row.references[filter.field] ?? null : row.values[filter.field] ?? null;
  const empty = value === null || value === '';
  if (filter.operator === 'empty') return empty;
  if (filter.operator === 'notEmpty') return !empty;
  if (empty) return false;
  if (filter.operator === 'contains') return String(value).toLocaleLowerCase().includes(String(filter.value).toLocaleLowerCase());
  if (filter.operator === 'equals') return typeof value === 'string' && reportFields[filter.field].type === 'text'
    ? value.toLocaleLowerCase() === String(filter.value).toLocaleLowerCase() : value === filter.value;
  return filter.operator === 'gte' ? value >= filter.value! : value <= filter.value!;
}
function measure(rows: ReportRow[], definition: ReportDefinition): Partial<Record<ReportMetric, ReportMeasure>> {
  const totals = summarizePortfolio(rows.map(row => row.fact));
  const sum = (key: ReportField): ReportMeasure => {
    const values = rows.map(row => row.values[key]);
    const known = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return { value: rows.length && !known.length ? null : known.reduce((a, b) => a + b, 0), missing: rows.length - known.length };
  };
  return Object.fromEntries(definition.metrics.map(key => {
    const metric: ReportMeasure = key === 'recordCount' ? { value: new Set(rows.map(row => row.id)).size, missing: 0 }
      : key === 'pipeline' ? { value: totals.pipeline, missing: totals.pipelineMissing }
      : key === 'won' ? { value: totals.won, missing: totals.wonMissing }
      : key === 'winRate' ? { value: totals.winRate, missing: 0, denominator: totals.wonCount + totals.lostCount }
      : sum(key === 'orderValue' ? 'reportingValue' : key);
    return [key, metric];
  }));
}
export function runReport(input: {
  definition: ReportDefinition; sources: Record<ReportDataset, ReportRow[]>; scopeKey: string; runAt: string;
  timezone: string; today: string; money: PortfolioMoneyBasis; sourceStatus: string;
}): ReportRun {
  const definition = parseReportDefinition(input.definition), source = input.sources[definition.dataset];
  if (source.length > REPORT_ROW_LIMIT) throw new Error(`This report supports up to ${REPORT_ROW_LIMIT.toLocaleString('en')} source records. No partial report was produced.`);
  if (new Set(source.map(row => row.id)).size !== source.length) throw new Error('Duplicate report source identity. Resolve source records before running.');
  const matches = (row: ReportRow) => {
    if (definition.population === 'qualified' && !row.fact.qualified || definition.population === 'leads' && row.fact.qualified) return false;
    if (!definition.filters.length) return true;
    return definition.filterMode === 'all' ? definition.filters.every(filter => filterMatches(row, filter)) : definition.filters.some(filter => filterMatches(row, filter));
  };
  const rows = source.filter(matches).sort((a, b) => {
    const left = a.values[definition.sort.field], right = b.values[definition.sort.field];
    const empty = (value: ReportCell | undefined) => value === undefined || value === null || value === '';
    const absence = Number(empty(left)) - Number(empty(right)); if (absence) return absence;
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''));
    return (definition.sort.direction === 'asc' ? order : -order) || a.id.localeCompare(b.id);
  });
  const buckets = new Map<string, { labels: string[]; rows: ReportRow[] }>();
  for (const row of rows) {
    const keys = definition.groupBy.map(key => reportFields[key].type === 'catalog' ? row.references[key] ?? null : row.values[key] ?? null);
    const key = JSON.stringify(keys), labels = definition.groupBy.map(key => String(row.values[key] ?? 'Unassigned') || 'Missing');
    const bucket = buckets.get(key) || { labels, rows: [] }; bucket.rows.push(row); buckets.set(key, bucket);
  }
  const groups = [...buckets].map(([key, bucket]) => ({ key, labels: bucket.labels, sourceIds: bucket.rows.map(row => row.id), metrics: measure(bucket.rows, definition) }));
  return structuredClone({ definition, scopeKey: input.scopeKey, runAt: input.runAt, timezone: input.timezone, today: input.today,
    sourceStatus: input.sourceStatus, money: input.money, rows, groups, totals: measure(rows, definition), sourceCount: source.length,
    grain: definition.dataset === 'opportunities' ? 'One opportunity per row; current classification' : 'One committed qualified order per row; current planning schedule',
    metricVersions: Object.fromEntries(definition.metrics.map(key => [key, reportMetricDefinitions[key].version])) });
}
/** Typed cells retain numeric values. User text cannot execute spreadsheet formulas. */
export function csvCell(value: ReportCell): string {
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(value)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function reportCsv(run: ReportRun, view: 'details' | 'summary'): string {
  const lines: ReportCell[][] = view === 'details' ? [run.definition.columns.map(column => column.label),
    ...run.rows.map(row => run.definition.columns.map(column => row.values[column.field] ?? null))]
    : [[...run.definition.groupBy.map(key => reportFields[key].label), ...run.definition.metrics.flatMap(key => [reportMetricDefinitions[key].label, `${reportMetricDefinitions[key].label} missing`, ...(key === 'winRate' ? ['Decided deals'] : [])])],
      ...run.groups.map(group => [...group.labels, ...run.definition.metrics.flatMap(key => {
        const metric = group.metrics[key]!; return [metric.value, metric.missing, ...(key === 'winRate' ? [metric.denominator ?? 0] : [])];
      })])];
  return '\uFEFF' + lines.map(line => line.map(csvCell).join(',')).join('\r\n');
}
export function reportMetadata(run: ReportRun): string {
  return JSON.stringify({ report: run.definition, runAt: run.runAt, timezone: run.timezone, today: run.today, grain: run.grain,
    rows: run.rows.length, sourceCount: run.sourceCount, sourceStatus: run.sourceStatus, money: run.money,
    metricVersions: run.metricVersions, totals: run.totals, mode: 'Captured current run; not historical reconstruction',
    collections: run.definition.dataset === 'collections' ? 'Only explicitly ID-linked quotes are used, ordered by quote date, then revision timestamp and ID. Payments are recorded receipts; dates/amounts follow the existing planning schedule model. Unlinked legacy quotes are excluded.' : undefined,
    csv: 'Blank cells mean missing, ratios are fractions, amounts use reportingCurrency except Original value. User text that resembles spreadsheet formulas is escaped.' }, null, 2);
}
