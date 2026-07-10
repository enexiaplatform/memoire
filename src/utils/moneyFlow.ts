import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import {
  getCommercialCheckpointRisk,
  getQuoteCommercialStage,
} from './commercialFulfillment.ts';
import { convertMoney, sumMoneyInBase } from './money.ts';
import { compareSafeBusinessDate, isBusinessDateOverdue, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export const moneyFlowStages = ['Opportunity', 'Quoted', 'Pending PO', 'Pending delivery', 'Pending payment', 'Paid'] as const;

export type MoneyFlowStage = (typeof moneyFlowStages)[number];

export type MoneyFlowThread = {
  id: string;
  accountName: string;
  label: string;
  amount: number | null;
  currency: string;
  stage: MoneyFlowStage;
  stuck: boolean;
  stuckReason: string;
  nextAction: string;
};

export type MoneyFlowLane = {
  stage: MoneyFlowStage;
  threads: number;
  totalBase: number;
  stuckThreads: number;
};

export type MoneyFlow = {
  threads: MoneyFlowThread[];
  lanes: MoneyFlowLane[];
  stuckThreads: MoneyFlowThread[];
  totalInMotionBase: number;
};

type MoneyFlowInput = {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  today?: string;
};

/**
 * Phase 3 of the Business Activity OS pivot: one commercial lifecycle -
 * deal -> quote -> PO -> delivery -> payment - instead of separate modules.
 * A thread is quote-centric once a quote exists (the quote carries the
 * money state); active opportunities without a quote form the head of the
 * flow. Stuck detection reuses the fulfillment checkpoint rules plus
 * expired-quote and overdue-next-action dates. Derived, never stored.
 */
export function buildMoneyFlow(input: MoneyFlowInput): MoneyFlow {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();

  const quotedOpportunityIds = new Set(
    input.quotes.map((quote) => quote.opportunityId).filter(Boolean) as string[],
  );
  const quotedAccountAndName = new Set(
    input.quotes.map((quote) => `${normalize(quote.accountName)}|${normalize(quote.opportunityName || '')}`),
  );

  const quoteThreads = input.quotes
    .filter((quote) => !quote.__deleted && quote.status !== 'Rejected' && quote.status !== 'Expired')
    .map((quote) => buildQuoteThread(quote, today))
    .filter((thread): thread is MoneyFlowThread => Boolean(thread));

  const opportunityThreads = input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .filter((opportunity) => !quotedOpportunityIds.has(opportunity.id)
      && !quotedAccountAndName.has(`${normalize(opportunity.accountName)}|${normalize(opportunity.opportunityName)}`))
    .map((opportunity) => ({
      id: `opp-${opportunity.id}`,
      accountName: opportunity.accountName || 'Needs confirmation',
      label: opportunity.opportunityName || 'Needs confirmation',
      amount: opportunity.estimatedValue ?? opportunity.fy26Value ?? null,
      currency: opportunity.currency || '',
      stage: 'Opportunity' as MoneyFlowStage,
      stuck: isBusinessDateOverdue(opportunity.nextActionDate, today),
      stuckReason: isBusinessDateOverdue(opportunity.nextActionDate, today) ? 'Next action overdue' : '',
      nextAction: opportunity.nextAction || 'Confirm the next customer-facing step.',
    }));

  const threads = [...opportunityThreads, ...quoteThreads]
    .sort((a, b) => Number(b.stuck) - Number(a.stuck) || stageRank(b.stage) - stageRank(a.stage));

  const lanes = moneyFlowStages.map((stage) => {
    const stageThreads = threads.filter((thread) => thread.stage === stage);
    return {
      stage,
      threads: stageThreads.length,
      totalBase: sumMoneyInBase(stageThreads.map((thread) => ({ amount: thread.amount || 0, currency: thread.currency }))),
      stuckThreads: stageThreads.filter((thread) => thread.stuck).length,
    };
  });

  const inMotion = threads.filter((thread) => thread.stage !== 'Paid');
  return {
    threads,
    lanes,
    stuckThreads: threads.filter((thread) => thread.stuck),
    totalInMotionBase: sumMoneyInBase(inMotion.map((thread) => ({ amount: thread.amount || 0, currency: thread.currency }))),
  };
}

function buildQuoteThread(quote: QuoteRecord, today: string): MoneyFlowThread | null {
  const commercialStage = getQuoteCommercialStage(quote);
  if (commercialStage === 'Closed') return null;
  const stage: MoneyFlowStage = commercialStage === 'Draft' ? 'Quoted' : commercialStage;

  const checkpointRisk = getCommercialCheckpointRisk(quote, today);
  const quoteExpired = commercialStage === 'Quoted'
    && Boolean(quote.validUntil) && compareSafeBusinessDate(quote.validUntil, today) < 0;
  const stuckReason = checkpointRisk || (quoteExpired ? 'Quote validity passed' : '');

  return {
    id: `quote-${quote.id}`,
    accountName: quote.accountName || 'Needs confirmation',
    label: quote.title || quote.opportunityName || quote.quoteId || 'Quote',
    amount: quote.amount,
    currency: quote.currency || '',
    stage,
    stuck: Boolean(stuckReason),
    stuckReason,
    nextAction: quote.nextAction || defaultNextAction(stage),
  };
}

function defaultNextAction(stage: MoneyFlowStage) {
  if (stage === 'Quoted') return 'Follow up on the quote before it expires.';
  if (stage === 'Pending PO') return 'Confirm the PO owner and date.';
  if (stage === 'Pending delivery') return 'Schedule or confirm the delivery.';
  if (stage === 'Pending payment') return 'Confirm the payment date.';
  return 'Confirm the next commercial step.';
}

function stageRank(stage: MoneyFlowStage) {
  return moneyFlowStages.indexOf(stage);
}

export function formatMoneyFlowAmount(thread: Pick<MoneyFlowThread, 'amount' | 'currency'>) {
  if (typeof thread.amount !== 'number' || !thread.currency) return '';
  return convertMoney(thread.amount, thread.currency) === null ? '' : `${thread.amount.toLocaleString()} ${thread.currency}`;
}

function normalize(value?: string) {
  return (value || '').trim().toLowerCase();
}
