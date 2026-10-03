import type { CrmLiteOpportunity } from '../../services/opportunityStore.ts';
import type { QuoteRecord } from '../../services/quoteStore.ts';
import type { OpportunityOutcomeRecord } from '../../services/opportunityOutcomeStore.ts';
import { buildOrderBook, type OrderMilestoneRecord, type OrderTermRecord } from '../../utils/orderToCash.ts';
import { buildReceivables, type OrderReceivableRecord } from '../../utils/receivables.ts';
import { sanitizeBusinessDate } from '../../utils/safeDate.ts';
import type { PortfolioFact, PortfolioMoneyBasis } from '../portfolio/portfolioAnalytics.ts';
import { reportFields, type ReportCell, type ReportDataset, type ReportField } from './reportDefinition.ts';
import type { ReportRow } from './reportEngine.ts';
type Mode = { source?: string; isSample?: boolean; __deleted?: boolean };
export function buildReportSources(input: {
  facts: PortfolioFact[]; opportunities: CrmLiteOpportunity[]; quotes: QuoteRecord[]; outcomes: OpportunityOutcomeRecord[];
  milestones: OrderMilestoneRecord[]; costs: (OrderTermRecord & Mode)[]; receivables: OrderReceivableRecord[];
  sample: boolean; today: string; money: PortfolioMoneyBasis;
}): Record<ReportDataset, ReportRow[]> {
  const inScope = <T extends Mode>(rows: T[]) => rows.filter(row => !row.__deleted && (row.isSample === true || row.source === 'demo') === input.sample);
  const opportunities = inScope(input.opportunities), byOpportunity = new Map(opportunities.map(row => [row.id, row]));
  const opportunitiesRows = input.facts.map(fact => {
    const opportunity = byOpportunity.get(fact.id); if (!opportunity) throw new Error('Report source opportunity is unavailable in this scope.');
    const values: Partial<Record<ReportField, ReportCell>> = { ...fact, reportingCurrency: input.money.currency };
    for (const key of Object.keys(reportFields) as ReportField[]) {
      if (key in opportunity && !(key in values)) {
        const value = opportunity[key as keyof CrmLiteOpportunity];
        if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) values[key] = value;
        else values[key] = null;
      }
      if (reportFields[key].type === 'date' && key in values) values[key] = sanitizeBusinessDate(values[key]) || null;
    }
    return { id: fact.id, values, fact, references: { businessUnit: fact.businessUnitId, brand: fact.brandId, productGroup: fact.groupId, product: fact.productId },
      href: `/app/opportunities?opportunityId=${encodeURIComponent(fact.id)}` };
  });
  const qualified = new Set(input.facts.filter(row => row.qualified).map(row => row.id));
  const receivables = inScope(input.receivables), milestones = inScope(input.milestones), costs = inScope(input.costs);
  for (const records of [receivables, costs]) if (new Set(records.map(row => row.opportunityId)).size !== records.length) throw new Error('Duplicate order-linked report source. Resolve it before running.');
  const orders = buildOrderBook({ opportunities: opportunities.filter(row => qualified.has(row.id)), quotes: inScope(input.quotes), linkage: 'explicit-id',
    milestoneRecords: milestones, costRecords: costs, outcomes: inScope(input.outcomes), receivableRecords: receivables, today: input.today }).orders;
  const money = buildReceivables({ orders, records: receivables, today: input.today });
  if (money.reportingCurrency !== input.money.currency) throw new Error('Reporting currency changed. Run the report again.');
  const cashByOrder = new Map(money.orders.map(row => [row.opportunityId, row]));
  const rowsById = new Map(opportunitiesRows.map(row => [row.id, row]));
  const recordsByOrder = new Map(receivables.map(row => [row.opportunityId, row]));
  const collections = orders.map(order => {
    const row = rowsById.get(order.opportunityId)!;
    const cash = cashByOrder.get(order.opportunityId)!, record = recordsByOrder.get(order.opportunityId);
    const incomplete = cash.valueUnavailable || order.amount === null || !Number.isFinite(order.amount)
      || (record?.receipts || []).some(receipt => !(input.money.ratesToVnd[(receipt.currency || order.currency).trim().toUpperCase()] > 0));
    return { ...row, values: { ...row.values,
      amount: order.amount, currency: order.currency, reportingValue: incomplete ? null : cash.orderValueBase,
      orderRef: order.orderRef, orderStage: order.orderStage, orderDate: sanitizeBusinessDate(order.orderDate) || null,
      nextDueDate: cash.nextDueDate || null, received: incomplete ? null : cash.receivedBase,
      outstanding: incomplete ? null : cash.outstandingBase, overdue: incomplete ? null : cash.overdueBase,
      overpaid: incomplete ? null : cash.overpaidBase, termConfidence: cash.termConfidence, valueUnavailable: incomplete } };
  });
  return { opportunities: opportunitiesRows, collections };
}
