import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { getQuoteRisk, type QuoteRecord, type QuoteRisk } from '../services/quoteStore';

export type RevenueRiskKind =
  | 'Weak pipeline'
  | 'Quote expiring'
  | 'Quote expired'
  | 'Waiting on PO'
  | 'Commercial follow-up'
  | 'Payment term missing';

export type RevenueActionItem = {
  id: string;
  accountName: string;
  label: string;
  amount: number;
  currency: string;
  status: string;
  risk: RevenueRiskKind;
  nextAction: string;
  href: string;
  source: 'Opportunity' | 'Quote';
};

export type RevenueViewSummary = {
  won: number;
  activePipeline: number;
  quoted: number;
  pendingPo: number;
  pendingPayment: number;
  atRiskRevenue: number;
  expiringQuotes: number;
  overdueFollowUps: number;
  topAction: RevenueActionItem | null;
  actionItems: RevenueActionItem[];
};

export function buildRevenueView({
  opportunities,
  quotes,
}: {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
}): RevenueViewSummary {
  const won = sumOpportunities(opportunities.filter((opportunity) => opportunity.status === 'Won'));
  const activePipeline = sumOpportunities(opportunities.filter((opportunity) => opportunity.status === 'Active'));
  const quoted = sumQuotes(quotes.filter((quote) => quote.status === 'Sent' || quote.status === 'Revised'));
  const pendingPo = sumQuotes(quotes.filter((quote) => quote.status === 'Accepted'));
  const pendingPayment = sumQuotes(quotes.filter((quote) => quote.status === 'Accepted' && !quote.paymentTerm.trim()));
  const quoteRisks = buildQuoteRevenueRisks(quotes);
  const pipelineRisks = buildPipelineRevenueRisks(opportunities);
  const actionItems = [...quoteRisks, ...pipelineRisks]
    .sort((left, right) => riskRank(right.risk) - riskRank(left.risk) || right.amount - left.amount)
    .slice(0, 12);

  return {
    won,
    activePipeline,
    quoted,
    pendingPo,
    pendingPayment,
    atRiskRevenue: actionItems.reduce((total, item) => total + item.amount, 0),
    expiringQuotes: quotes.filter((quote) => getQuoteRisk(quote) === 'Expiring soon').length,
    overdueFollowUps: countOverdueFollowUps(opportunities, quotes),
    topAction: actionItems[0] || null,
    actionItems,
  };
}

function buildQuoteRevenueRisks(quotes: QuoteRecord[]): RevenueActionItem[] {
  return quotes.flatMap((quote) => {
    const risk = getQuoteRisk(quote);
    const mappedRisk = mapQuoteRisk(risk, quote);
    if (!mappedRisk) return [];
    return [{
      id: `quote-${quote.id}`,
      accountName: quote.accountName,
      label: quote.title,
      amount: quote.amount || 0,
      currency: quote.currency,
      status: quote.status,
      risk: mappedRisk,
      nextAction: quote.nextAction || defaultQuoteAction(risk),
      href: '/app/quotes',
      source: 'Quote' as const,
    }];
  });
}

function buildPipelineRevenueRisks(opportunities: CrmLiteOpportunity[]): RevenueActionItem[] {
  return opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .filter((opportunity) => (
      opportunity.forecastEvidenceCategory === 'Unsupported' ||
      opportunity.forecastEvidenceCategory === 'Hope-based' ||
      ['Rescue', 'Downgrade', 'Deprioritize'].includes(opportunity.decisionRecommendation) ||
      !opportunity.nextAction.trim()
    ))
    .map((opportunity) => ({
      id: `opportunity-${opportunity.id}`,
      accountName: opportunity.accountName || 'No account',
      label: opportunity.opportunityName || 'Untitled opportunity',
      amount: opportunity.estimatedValue || opportunity.fy26Value || 0,
      currency: opportunity.currency || 'VND',
      status: opportunity.decisionRecommendation,
      risk: 'Weak pipeline' as const,
      nextAction: opportunity.nextAction || 'Define the next customer-confirmed action.',
      href: '/app/opportunities',
      source: 'Opportunity' as const,
    }));
}

function mapQuoteRisk(risk: QuoteRisk, quote: QuoteRecord): RevenueRiskKind | null {
  if (risk === 'Expired') return 'Quote expired';
  if (risk === 'Expiring soon') return 'Quote expiring';
  if (risk === 'Needs commercial follow-up') return quote.paymentTerm.trim() ? 'Commercial follow-up' : 'Payment term missing';
  if (quote.status === 'Accepted' && !quote.nextAction.trim()) return 'Waiting on PO';
  if (quote.status === 'Accepted') return 'Waiting on PO';
  if (risk === 'Margin check') return 'Commercial follow-up';
  return null;
}

function defaultQuoteAction(risk: QuoteRisk) {
  if (risk === 'Expired') return 'Confirm whether this quote should be revised or closed.';
  if (risk === 'Expiring soon') return 'Follow up before this quote expires.';
  if (risk === 'Needs commercial follow-up') return 'Confirm PO owner, payment term, and next commercial step.';
  if (risk === 'Margin check') return 'Check discount and margin before committing.';
  return 'Review quote status.';
}

function countOverdueFollowUps(opportunities: CrmLiteOpportunity[], quotes: QuoteRecord[]) {
  const today = todayKey();
  return opportunities.filter((opportunity) => opportunity.nextActionDate && opportunity.nextActionDate < today).length
    + quotes.filter((quote) => quote.validUntil && quote.validUntil < today && (quote.status === 'Sent' || quote.status === 'Revised')).length;
}

function sumOpportunities(opportunities: CrmLiteOpportunity[]) {
  return opportunities.reduce((total, opportunity) => total + (opportunity.estimatedValue || opportunity.fy26Value || 0), 0);
}

function sumQuotes(quotes: QuoteRecord[]) {
  return quotes.reduce((total, quote) => total + (quote.amount || 0), 0);
}

function riskRank(risk: RevenueRiskKind) {
  return {
    'Quote expired': 7,
    'Quote expiring': 6,
    'Payment term missing': 5,
    'Waiting on PO': 4,
    'Weak pipeline': 3,
    'Commercial follow-up': 2,
  }[risk];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
