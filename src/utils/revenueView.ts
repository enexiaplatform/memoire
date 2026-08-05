import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import {
  getQuoteCommercialStage,
  getQuoteRisk,
  getQuoteWorkspaceHref,
  type CommercialStage,
  type QuoteRecord,
  type QuoteRisk,
} from '../services/quoteStore.ts';
import { BASE_CURRENCY, convertMoney, sumMoneyInBase } from './money.ts';
import { buildQuotedOpportunityIds } from './opportunityResolution.ts';
import { isBusinessDateOverdue, todayDateKey } from './safeDate.ts';

export type RevenueRiskKind =
  | 'Weak pipeline'
  | 'Quote expiring'
  | 'Quote expired'
  | 'Waiting on PO'
  | 'Waiting on delivery'
  | 'Delivery overdue'
  | 'Waiting on payment'
  | 'Payment overdue'
  | 'Commercial follow-up'
  | 'Payment term missing';

export type RevenueActionItem = {
  id: string;
  accountName: string;
  label: string;
  amount: number;
  currency: string;
  baseAmount: number;
  status: string;
  risk: RevenueRiskKind;
  nextAction: string;
  dueDate?: string;
  href: string;
  source: 'Opportunity' | 'Quote';
  /**
   * The specific field state that raised this flag, and the field that clears
   * it.
   *
   * "Weak pipeline" is raised by any one of four unrelated conditions, and the
   * label named none of them. The first operator filled in the decision maker,
   * the budget owner and the procurement path on a flagged deal, saved, and the
   * flag stayed - correctly, because none of those four conditions is about
   * those fields. From the outside that is indistinguishable from a product
   * that ignores your edits. A warning that cannot be traced to a field is a
   * warning the operator can only wait out.
   */
  reason?: string;
  /** The edit that clears it, named as the control the operator will look for. */
  clearedBy?: string;
};

/**
 * Why this deal is in the weak-pipeline list, and what clears it.
 *
 * Ordered by which answer is most useful to hear first: a deal with no next
 * action at all is a different problem from one whose evidence is thin, and
 * saying "no next action" is more actionable than saying "weak".
 */
export function explainPipelineRisk(
  // Takes the three fields it reads, not a whole record, so the deal editor can
  // ask the same question of the *unsaved* form. That is what lets the banner
  // clear the moment the right field is filled, instead of after a save and a
  // page load - which is how "I updated it and it still warns me" starts.
  opportunity: Pick<CrmLiteOpportunity, 'nextAction' | 'forecastEvidenceCategory' | 'decisionRecommendation'>,
): { reason: string; clearedBy: string } | null {
  if (!opportunity.nextAction.trim()) {
    return {
      reason: 'This deal has no next action, so nothing will bring it back to you.',
      clearedBy: 'Write one line in Next action, with a date.',
    };
  }
  if (opportunity.forecastEvidenceCategory === 'Unsupported' || opportunity.forecastEvidenceCategory === 'Hope-based') {
    return {
      reason: `Forecast evidence is set to "${opportunity.forecastEvidenceCategory}" - the value is not backed by anything the customer confirmed.`,
      clearedBy: 'Record what the customer actually confirmed in Evidence, then move Forecast evidence to "Weak but recoverable" or "Defensible".',
    };
  }
  if (['Rescue', 'Downgrade', 'Deprioritize'].includes(opportunity.decisionRecommendation)) {
    return {
      reason: `You marked this deal "${opportunity.decisionRecommendation}", which keeps it on the watch-list until the call changes.`,
      clearedBy: 'Change Decision to Defend or Monitor once it has recovered - or close it out.',
    };
  }
  return null;
}

export type RevenueViewSummary = {
  won: number;
  activePipeline: number;
  quoted: number;
  pendingPo: number;
  pendingDelivery: number;
  pendingPayment: number;
  paid: number;
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
  const pendingPo = sumQuotes(quotes.filter((quote) => getQuoteCommercialStage(quote) === 'Pending PO'));
  const pendingDelivery = sumQuotes(quotes.filter((quote) => getQuoteCommercialStage(quote) === 'Pending delivery'));
  const pendingPayment = sumQuotes(quotes.filter((quote) => getQuoteCommercialStage(quote) === 'Pending payment'));
  const paid = sumQuotes(quotes.filter((quote) => getQuoteCommercialStage(quote) === 'Paid'));
  const quoteRisks = buildQuoteRevenueRisks(quotes);
  // Resolved, not read straight off the quote. `opportunityId` is optional and
  // blank on anything imported or created before the picker existed, so keying
  // on it alone left quoted deals sitting in the weak-pipeline list telling
  // their seller to go and quote them.
  const quotedOpportunityIds = buildQuotedOpportunityIds(quotes, opportunities);
  const pipelineRisks = buildPipelineRevenueRisks(opportunities, quotedOpportunityIds);
  const actionItems = [...quoteRisks, ...pipelineRisks]
    .sort((left, right) => riskRank(right.risk) - riskRank(left.risk) || right.baseAmount - left.baseAmount)
    .slice(0, 12);

  return {
    won,
    activePipeline,
    quoted,
    pendingPo,
    pendingDelivery,
    pendingPayment,
    paid,
    atRiskRevenue: sumMoneyInBase(actionItems),
    expiringQuotes: quotes.filter((quote) => getQuoteRisk(quote) === 'Expiring soon').length,
    overdueFollowUps: countOverdueFollowUps(opportunities, quotes),
    topAction: actionItems[0] || null,
    actionItems,
  };
}

function buildQuoteRevenueRisks(quotes: QuoteRecord[]): RevenueActionItem[] {
  return quotes.flatMap((quote) => {
    const risk = getQuoteRisk(quote);
    const stage = getQuoteCommercialStage(quote);
    const mappedRisk = mapQuoteRisk(risk, stage, quote);
    if (!mappedRisk) return [];
    const amount = quote.amount || 0;
    return [{
      id: `quote-${quote.id}`,
      accountName: quote.accountName,
      label: quote.title,
      amount,
      currency: quote.currency,
      baseAmount: convertMoney(amount, quote.currency) || 0,
      status: stage,
      risk: mappedRisk,
      nextAction: quote.nextAction || defaultQuoteAction(risk, stage),
      dueDate: getRevenueRiskDueDate(mappedRisk, quote),
      href: getQuoteWorkspaceHref(quote),
      source: 'Quote' as const,
    }];
  });
}

function buildPipelineRevenueRisks(opportunities: CrmLiteOpportunity[], quotedOpportunityIds: Set<string>): RevenueActionItem[] {
  return opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .filter((opportunity) => !quotedOpportunityIds.has(opportunity.id))
    .flatMap((opportunity) => {
      // One predicate, used both to raise the flag and to say why - so the
      // sentence on screen can never drift from the condition behind it.
      const explanation = explainPipelineRisk(opportunity);
      if (!explanation) return [];

      const amount = opportunity.estimatedValue || opportunity.fy26Value || 0;
      const currency = opportunity.currency || BASE_CURRENCY;
      return [{
        id: `opportunity-${opportunity.id}`,
        accountName: opportunity.accountName || 'No account',
        label: opportunity.opportunityName || 'Untitled opportunity',
        amount,
        currency,
        baseAmount: convertMoney(amount, currency) || 0,
        status: opportunity.decisionRecommendation,
        risk: 'Weak pipeline' as const,
        nextAction: opportunity.nextAction || 'Define the next customer-confirmed action.',
        dueDate: opportunity.nextActionDate,
        href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
        source: 'Opportunity' as const,
        reason: explanation.reason,
        clearedBy: explanation.clearedBy,
      }];
    });
}

function getRevenueRiskDueDate(risk: RevenueRiskKind, quote: QuoteRecord) {
  if (risk === 'Quote expired' || risk === 'Quote expiring') return quote.validUntil;
  if (risk === 'Delivery overdue' || risk === 'Waiting on delivery') return quote.expectedDeliveryDate;
  if (risk === 'Payment overdue' || risk === 'Waiting on payment') return quote.paymentDueDate;
  return '';
}

function mapQuoteRisk(risk: QuoteRisk, stage: CommercialStage, quote: QuoteRecord): RevenueRiskKind | null {
  if (risk === 'Expired') return 'Quote expired';
  if (risk === 'Expiring soon') return 'Quote expiring';
  if (risk === 'Payment overdue') return 'Payment overdue';
  if (risk === 'Delivery overdue') return 'Delivery overdue';
  if (!quote.paymentTerm.trim() && quote.status === 'Accepted') return 'Payment term missing';
  if (stage === 'Pending PO') return 'Waiting on PO';
  if (stage === 'Pending delivery') return 'Waiting on delivery';
  if (stage === 'Pending payment') return 'Waiting on payment';
  if (risk === 'Needs commercial follow-up') return 'Commercial follow-up';
  if (risk === 'Margin check') return 'Commercial follow-up';
  return null;
}

function defaultQuoteAction(risk: QuoteRisk, stage: CommercialStage) {
  if (risk === 'Expired') return 'Confirm whether this quote should be revised or closed.';
  if (risk === 'Expiring soon') return 'Follow up before this quote expires.';
  if (risk === 'Payment overdue') return 'Confirm payment owner and collection date.';
  if (risk === 'Delivery overdue') return 'Confirm delivery recovery date with the customer.';
  if (stage === 'Pending PO') return 'Confirm PO owner and expected receipt date.';
  if (stage === 'Pending delivery') return 'Confirm delivery date and unblock fulfillment.';
  if (stage === 'Pending payment') return 'Confirm payment date and collection owner.';
  if (risk === 'Needs commercial follow-up') return 'Confirm PO owner, payment term, and next commercial step.';
  if (risk === 'Margin check') return 'Check discount and margin before committing.';
  return 'Review quote status.';
}

function countOverdueFollowUps(opportunities: CrmLiteOpportunity[], quotes: QuoteRecord[]) {
  const today = todayKey();
  return opportunities.filter((opportunity) => isBusinessDateOverdue(opportunity.nextActionDate, today)).length
    + quotes.filter((quote) => {
      const risk = getQuoteRisk(quote);
      return risk === 'Expired' || risk === 'Delivery overdue' || risk === 'Payment overdue';
    }).length;
}

function sumOpportunities(opportunities: CrmLiteOpportunity[]) {
  return sumMoneyInBase(opportunities.map((opportunity) => ({
    amount: opportunity.estimatedValue || opportunity.fy26Value || 0,
    currency: opportunity.currency,
  })));
}

function sumQuotes(quotes: QuoteRecord[]) {
  return sumMoneyInBase(quotes);
}

function riskRank(risk: RevenueRiskKind) {
  return {
    'Quote expired': 7,
    'Payment overdue': 9,
    'Delivery overdue': 8,
    'Quote expiring': 6,
    'Payment term missing': 5,
    'Waiting on PO': 4,
    'Waiting on delivery': 4,
    'Waiting on payment': 4,
    'Weak pipeline': 3,
    'Commercial follow-up': 2,
  }[risk];
}

function todayKey() {
  return todayDateKey();
}
