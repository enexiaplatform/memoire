import type { CrmLiteOpportunity } from '../../services/opportunityStore.ts';
import type { OpportunityOutcomeRecord } from '../../services/opportunityOutcomeStore.ts';
import { disqualifiedLeadIds, isLeadRecord } from '../../utils/leadIdentity.ts';
import { EXCHANGE_RATES_AS_OF, getExchangeRateToBase, getReportingCurrency } from '../../utils/money.ts';
import { MIN_DECIDED_FOR_BRAND_RATE } from '../../utils/brandPerformance.ts';
import { portfolioAssignments, portfolioNodes, validatePortfolioCatalog, type PortfolioRecord } from './portfolioCatalog.ts';

export const portfolioMetricDefinitions = {
  pipeline: { version: 1, label: 'Qualified pipeline', grain: 'opportunity', definition: 'Estimated value of Active opportunities outside the Lead partition; current state, counted once per opportunity.' },
  won: { version: 1, label: 'Won deal value', grain: 'opportunity', definition: 'Estimated value of Won opportunities outside the Lead partition. This is deal value, not recognized revenue or cash received.' },
  winRate: { version: 1, label: 'Win rate', grain: 'opportunity', definition: 'Won / (Won + Lost), excluding disqualified leads; withheld below three decided deals. The count is shown with the percentage.' },
} as const;
export type PortfolioMoneyBasis = { currency: string; ratesToVnd: Record<string, number>; ratesAsOf: string };
export function capturePortfolioMoneyBasis(currencies: string[]): PortfolioMoneyBasis {
  const currency = getReportingCurrency();
  const ratesToVnd: Record<string, number> = {};
  for (const code of new Set([currency, ...currencies].map(code => code.trim().toUpperCase()))) {
    const rate = getExchangeRateToBase(code);
    if (Number.isFinite(rate) && rate > 0) ratesToVnd[code] = rate;
  }
  return { currency, ratesToVnd, ratesAsOf: EXCHANGE_RATES_AS_OF };
}
export type PortfolioFact = {
  id: string; account: string; opportunity: string; stage: string; status: string;
  businessUnitId: string | null; brandId: string | null; groupId: string | null; productId: string | null;
  businessUnit: string; brand: string; productGroup: string; product: string;
  originalBrand: string; originalProduct: string; amount: number | null; currency: string;
  reportingValue: number | null; closedOn: string; nextAction: string; nextActionDate: string;
  qualified: boolean; mapped: boolean;
};
export function buildPortfolioFacts(input: {
  opportunities: CrmLiteOpportunity[]; outcomes: OpportunityOutcomeRecord[];
  records: PortfolioRecord[]; money: PortfolioMoneyBasis; sample: boolean;
}): PortfolioFact[] {
  validatePortfolioCatalog(input.records);
  const nodes = new Map(portfolioNodes(input.records).map(node => [node.id, node]));
  const assignments = new Map(portfolioAssignments(input.records).map(record => [record.opportunityId, record]));
  const outcomes = input.outcomes.filter(record => (record.isSample === true || record.source === 'demo') === input.sample);
  const disqualified = disqualifiedLeadIds(outcomes);
  const closedDates = new Map(outcomes.filter(record => record.outcomeDate).map(record => [record.opportunityId, record.outcomeDate]));
  const seen = new Set<string>();
  return input.opportunities.filter(opportunity => {
    if ((opportunity.isSample === true || opportunity.source === 'demo') !== input.sample) return false;
    if (seen.has(opportunity.id)) throw new Error('Duplicate opportunity identity. Resolve the source before reporting totals.');
    seen.add(opportunity.id); return true;
  }).map(opportunity => {
    const assignment = assignments.get(opportunity.id);
    const label = (id: string | null | undefined) => id ? nodes.get(id)?.name || 'Missing catalog entry' : 'Unassigned';
    const amount = typeof opportunity.estimatedValue === 'number' && Number.isFinite(opportunity.estimatedValue) ? opportunity.estimatedValue : null;
    const currency = opportunity.currency.trim().toUpperCase();
    const from = input.money.ratesToVnd[currency], to = input.money.ratesToVnd[input.money.currency];
    return { id: opportunity.id, account: opportunity.accountName, opportunity: opportunity.opportunityName,
      stage: opportunity.stage, status: opportunity.status,
      businessUnitId: assignment?.businessUnitId || null, brandId: assignment?.brandId || null,
      groupId: assignment?.groupId || null, productId: assignment?.productId || null,
      businessUnit: label(assignment?.businessUnitId), brand: label(assignment?.brandId),
      productGroup: label(assignment?.groupId), product: label(assignment?.productId),
      originalBrand: opportunity.brand || '', originalProduct: opportunity.productOrSolution || '',
      amount, currency, reportingValue: amount !== null && from > 0 && to > 0 ? amount * from / to : null,
      closedOn: opportunity.closedOn || closedDates.get(opportunity.id) || '',
      nextAction: opportunity.nextAction || '', nextActionDate: opportunity.nextActionDate || '',
      qualified: !isLeadRecord(opportunity, disqualified), mapped: Boolean(assignment && (assignment.brandId || assignment.productId || assignment.businessUnitId || assignment.groupId)) };
  });
}
export type PortfolioReading = { count: number; activeCount: number; pipeline: number | null; pipelineMissing: number;
  won: number | null; wonMissing: number; wonCount: number; lostCount: number; winRate: number | null; unmapped: number };
export function summarizePortfolio(facts: PortfolioFact[]): PortfolioReading {
  const qualified = facts.filter(fact => fact.qualified);
  const active = qualified.filter(fact => fact.status === 'Active');
  const won = qualified.filter(fact => fact.status === 'Won');
  const lost = qualified.filter(fact => fact.status === 'Lost');
  const total = (rows: PortfolioFact[]) => rows.length && rows.every(row => row.reportingValue === null)
    ? null : rows.reduce((sum, row) => sum + (row.reportingValue ?? 0), 0);
  return { count: qualified.length, activeCount: active.length, pipeline: total(active),
    pipelineMissing: active.filter(row => row.reportingValue === null).length,
    won: total(won), wonMissing: won.filter(row => row.reportingValue === null).length,
    wonCount: won.length, lostCount: lost.length,
    winRate: won.length + lost.length >= MIN_DECIDED_FOR_BRAND_RATE ? won.length / (won.length + lost.length) : null,
    unmapped: qualified.filter(fact => !fact.mapped).length };
}
