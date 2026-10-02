import type { PortfolioNode, PortfolioKind } from '../portfolio/portfolioCatalog.ts';
import { parseReportDefinition, reportTemplate, type ReportField } from './reportDefinition.ts';

export const portfolioReportFields = { unit: 'businessUnit', brand: 'brand', group: 'productGroup', product: 'product' } as const;
export function portfolioReportHref(kind: PortfolioKind, id: string): string {
  return `/app/reports?${new URLSearchParams({ catalogKind: kind, catalogId: id })}`;
}
export function portfolioReportDraft(kind: string | null, id: string | null, nodes: PortfolioNode[]) {
  if (!kind || !Object.hasOwn(portfolioReportFields, kind) || !id || id.length > 200) throw new Error('Invalid portfolio report link. Choose a catalog entry again.');
  const node = nodes.find(row => row.id === id && row.kind === kind);
  if (!node) throw new Error('This catalog entry is unavailable in this workspace. Choose a catalog entry again.');
  const field: ReportField = portfolioReportFields[kind as PortfolioKind];
  return parseReportDefinition({ ...reportTemplate('portfolio'), name: `${node.name} — Performance`.slice(0, 200),
    description: `Current qualified deals classified under ${node.name}.`,
    filters: [{ field, operator: 'equals', value: node.id }], filterMode: 'all', groupBy: [field] });
}
