export type ReportDataset = 'opportunities' | 'collections';
export type ReportCell = string | number | boolean | null;
export type ReportFieldType = 'text' | 'number' | 'date' | 'boolean' | 'catalog';
const both: ReportDataset[] = ['opportunities', 'collections'];
const deals: ReportDataset[] = ['opportunities'];
const orders: ReportDataset[] = ['collections'];
const field = (label: string, type: ReportFieldType = 'text', datasets = both) => ({ label, type, datasets });
export const reportFields = {
  id: field('Source ID'), account: field('Account'), opportunity: field('Deal / order'),
  businessUnit: field('Business unit', 'catalog'), brand: field('Brand', 'catalog'),
  productGroup: field('Product group', 'catalog'), product: field('Product / solution', 'catalog'),
  stage: field('Deal stage'), status: field('Deal status'), originalBrand: field('Original brand'), originalProduct: field('Original product'),
  amount: field('Original value', 'number'), currency: field('Original currency'), reportingValue: field('Value in reporting currency', 'number'),
  reportingCurrency: field('Reporting currency'), nextAction: field('Next action'), nextActionDate: field('Next action date', 'date'),
  closedOn: field('Closed on', 'date'), missingContext: field('Missing context / blocker'), objectionDebt: field('Open objections'),
  channel: field('Channel'), opportunityType: field('Opportunity type'), expectedClosePeriod: field('Expected close period', 'text', deals),
  decisionMaker: field('Decision maker', 'text', deals), budgetOwner: field('Budget owner', 'text', deals),
  procurementPath: field('Procurement path', 'text', deals), technicalCriteria: field('Technical criteria', 'text', deals),
  forecastEvidenceCategory: field('Forecast evidence category', 'text', deals), decisionRecommendation: field('Decision recommendation', 'text', deals),
  pipelineProbability: field('Pipeline probability (%)', 'number', deals), leadSource: field('Lead source', 'text', deals),
  orderRef: field('Order reference', 'text', orders), orderStage: field('Order stage', 'text', orders),
  orderDate: field('Order anchor date', 'date', orders), nextDueDate: field('Next payment due', 'date', orders),
  received: field('Recorded receipts', 'number', orders), outstanding: field('Outstanding', 'number', orders),
  overdue: field('Overdue balance', 'number', orders), overpaid: field('Overpayment', 'number', orders),
  termConfidence: field('Payment schedule confidence', 'text', orders), valueUnavailable: field('Money data incomplete', 'boolean', orders),
} as const;
export type ReportField = keyof typeof reportFields;
export const reportMetricDefinitions = {
  recordCount: { label: 'Records', datasets: both, version: 1 },
  pipeline: { label: 'Qualified pipeline', datasets: deals, version: 1 },
  won: { label: 'Won deal value', datasets: deals, version: 1 },
  winRate: { label: 'Win rate', datasets: deals, version: 1 },
  orderValue: { label: 'Order value', datasets: orders, version: 1 },
  received: { label: 'Recorded receipts', datasets: orders, version: 1 },
  outstanding: { label: 'Outstanding', datasets: orders, version: 1 },
  overdue: { label: 'Overdue balance', datasets: orders, version: 1 },
} as const;
export type ReportMetric = keyof typeof reportMetricDefinitions;
export type ReportOperator = 'equals' | 'contains' | 'gte' | 'lte' | 'empty' | 'notEmpty';
export type ReportFilter = { field: ReportField; operator: ReportOperator; value: ReportCell };
export type ReportDefinition = {
  schemaVersion: 1; dataset: ReportDataset; datasetVersion: 1; name: string; description: string;
  population: 'qualified' | 'leads' | 'all'; columns: { field: ReportField; label: string }[];
  filters: ReportFilter[]; filterMode: 'all' | 'any'; groupBy: ReportField[]; metrics: ReportMetric[];
  sort: { field: ReportField; direction: 'asc' | 'desc' }; view: 'details' | 'summary';
};
export const REPORT_ROW_LIMIT = 10000;
export const REPORT_PREVIEW_LIMIT = 100;
export function fieldsForDataset(dataset: ReportDataset): ReportField[] {
  return (Object.keys(reportFields) as ReportField[]).filter(key => reportFields[key].datasets.includes(dataset));
}
export function operatorsForField(key: ReportField): ReportOperator[] {
  const type = reportFields[key].type;
  return type === 'number' || type === 'date' ? ['equals', 'gte', 'lte', 'empty', 'notEmpty']
    : type === 'text' ? ['equals', 'contains', 'empty', 'notEmpty'] : ['equals', 'empty', 'notEmpty'];
}
function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid report text.');
  return value;
}
export function parseReportDefinition(value: unknown): ReportDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid report definition.');
  const raw = value as ReportDefinition;
  if (raw.schemaVersion !== 1 || raw.datasetVersion !== 1) throw new Error('Unsupported report version. Update Memoire before opening it.');
  if (!['opportunities', 'collections'].includes(raw.dataset)) throw new Error('Unsupported report dataset.');
  const validField = (key: ReportField) => fieldsForDataset(raw.dataset).includes(key);
  const name = string(raw.name, 200).trim(), description = string(raw.description, 2000);
  if (!name) throw new Error('Enter a report name.');
  if (!['qualified', 'leads', 'all'].includes(raw.population) || (raw.dataset === 'collections' && raw.population !== 'qualified')) throw new Error('Invalid report population.');
  if (!Array.isArray(raw.columns) || !raw.columns.length || raw.columns.length > fieldsForDataset(raw.dataset).length
    || new Set(raw.columns.map(column => column?.field)).size !== raw.columns.length) throw new Error('Choose unique report columns.');
  const columns = raw.columns.map(column => {
    if (!column || !validField(column.field)) throw new Error('Unsupported report field.');
    const label = string(column.label, 120).trim(); if (!label) throw new Error('Enter a column label.');
    return { field: column.field, label };
  });
  if (!['all', 'any'].includes(raw.filterMode) || !Array.isArray(raw.filters) || raw.filters.length > 20) throw new Error('Invalid report filters.');
  const filters = raw.filters.map(filter => {
    if (!filter || !validField(filter.field) || !operatorsForField(filter.field).includes(filter.operator)) throw new Error('Invalid report filter operator/field.');
    const type = reportFields[filter.field].type, noValue = ['empty', 'notEmpty'].includes(filter.operator);
    if (!noValue) {
      if (type === 'number' && (typeof filter.value !== 'number' || !Number.isFinite(filter.value))) throw new Error('Enter a finite number for the filter.');
      if (type === 'boolean' && typeof filter.value !== 'boolean') throw new Error('Choose true or false for the filter.');
      if (type === 'date' && (typeof filter.value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(filter.value)
        || !Number.isFinite(Date.parse(filter.value)) || new Date(filter.value).toISOString().slice(0, 10) !== filter.value)) throw new Error('Enter a valid date for the filter.');
      if (type === 'text' || type === 'catalog') { if (!string(filter.value, 2000).trim()) throw new Error('Enter a filter value.'); }
    }
    return { field: filter.field, operator: filter.operator, value: noValue ? null : filter.value };
  });
  if (!Array.isArray(raw.groupBy) || raw.groupBy.length > 2 || new Set(raw.groupBy).size !== raw.groupBy.length
    || raw.groupBy.some(key => !validField(key) || reportFields[key].type === 'number')) throw new Error('Choose up to two distinct dimensions for grouping.');
  if (!Array.isArray(raw.metrics) || !raw.metrics.length || new Set(raw.metrics).size !== raw.metrics.length
    || raw.metrics.some(key => !Object.hasOwn(reportMetricDefinitions, key) || !reportMetricDefinitions[key].datasets.includes(raw.dataset))) throw new Error('Unsupported report measure.');
  if (!raw.sort || !validField(raw.sort.field) || !['asc', 'desc'].includes(raw.sort.direction)) throw new Error('Invalid report sort.');
  if (!['details', 'summary'].includes(raw.view)) throw new Error('Unsupported report view.');
  return { schemaVersion: 1, dataset: raw.dataset, datasetVersion: 1, name, description, population: raw.population,
    columns, filters, filterMode: raw.filterMode, groupBy: [...raw.groupBy], metrics: [...raw.metrics], sort: { ...raw.sort }, view: raw.view };
}
const columns = (...fields: ReportField[]) => fields.map(key => ({ field: key, label: reportFields[key].label }));
export function reportTemplate(key: 'portfolio' | 'collections'): ReportDefinition {
  return parseReportDefinition(key === 'portfolio' ? {
    schemaVersion: 1, dataset: 'opportunities', datasetVersion: 1, name: 'Portfolio Performance', description: 'Current qualified pipeline and all-time outcomes by accepted portfolio classification.',
    population: 'qualified', columns: columns('account', 'opportunity', 'brand', 'status', 'reportingValue', 'reportingCurrency', 'nextAction'),
    filters: [], filterMode: 'all', groupBy: ['brand'], metrics: ['recordCount', 'pipeline', 'won', 'winRate'], sort: { field: 'account', direction: 'asc' }, view: 'summary',
  } : {
    schemaVersion: 1, dataset: 'collections', datasetVersion: 1, name: 'Collections & Blockers', description: 'One committed order per row. Recorded receipts, payment schedule and source-deal blockers; current planning view.',
    population: 'qualified', columns: columns('account', 'orderRef', 'orderStage', 'outstanding', 'overdue', 'received', 'reportingCurrency', 'nextDueDate', 'missingContext', 'nextAction'),
    filters: [], filterMode: 'all', groupBy: ['businessUnit'], metrics: ['recordCount', 'outstanding', 'overdue', 'received'], sort: { field: 'nextDueDate', direction: 'asc' }, view: 'details',
  });
}
