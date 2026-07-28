import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { QuoteRecord } from '../services/quoteStore';
import { compareSafeBusinessDate, isValidBusinessDate, todayDateKey } from './safeDate.ts';
import { sumMoneyInBase } from './money.ts';

/**
 * The order book: every opportunity the customer has committed to order, walked
 * from commitment to cash.
 *
 * This is the answer to "Money shows me everything; I only care about the deals
 * that are actually going to become orders." An opportunity earns a place here
 * when the customer has committed - 90%+ probability, procurement, or already
 * won - and from that moment the question changes from "will we win it" to
 * "where is the money": contract signed, deposit in, delivered, invoiced,
 * collected.
 *
 * Milestones are derived from the linked quotes wherever a quote already proves
 * them (a received PO, a delivery, a payment), and can be ticked by hand where
 * no record would ever prove them (a deposit). A hand tick never overwrites
 * quote evidence - it fills the gaps between records, the same contract the
 * plan board has with the deals it mirrors.
 */

export const COMMIT_PROBABILITY_THRESHOLD = 90;

export const orderMilestoneKeys = ['contract', 'deposit', 'delivery', 'invoice', 'paid'] as const;
export type OrderMilestoneKey = (typeof orderMilestoneKeys)[number];

export const orderMilestoneLabels: Record<OrderMilestoneKey, string> = {
  contract: 'Contract / PO',
  deposit: 'Deposit',
  delivery: 'Delivered',
  invoice: 'Invoiced',
  paid: 'Collected',
};

/** A hand-made tick for a milestone no record proves. One row per (order, milestone). */
export type OrderMilestoneRecord = {
  id: string;
  opportunityId: string;
  milestone: OrderMilestoneKey;
  done: boolean;
  doneAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

export type OrderMilestoneState = {
  key: OrderMilestoneKey;
  label: string;
  done: boolean;
  /** What proves it: a linked quote's own state, or the operator's tick. */
  evidence: 'quote' | 'manual' | null;
  /** When this step is expected, where a quote carries a date for it. */
  dueDate: string;
  overdue: boolean;
};

export type CommittedOrder = {
  opportunityId: string;
  accountName: string;
  orderName: string;
  stage: string;
  status: string;
  probability: number | null;
  amount: number | null;
  currency: string;
  amountBase: number;
  /** The commercial terms as written on the freshest linked quote. */
  paymentTerm: string;
  quoteCount: number;
  milestones: OrderMilestoneState[];
  doneCount: number;
  /** The first milestone still open - the thing to chase on this order. */
  nextMilestone: OrderMilestoneState | null;
  fullyCollected: boolean;
  overdue: boolean;
  href: string;
};

export type OrderBook = {
  orders: CommittedOrder[];
  totalCount: number;
  collectedCount: number;
  /** Committed money not yet fully collected, in the base currency. */
  awaitingBase: number;
  overdueCount: number;
};

/**
 * The customer has committed to order: the founder's 90% line, procurement
 * already running, or the deal marked won. Anything colder still belongs to
 * pipeline work on Opportunities, not to the order book.
 */
export function isCommittedToOrder(opportunity: CrmLiteOpportunity): boolean {
  if (opportunity.status === 'Won') return true;
  if (opportunity.status !== 'Active') return false;
  if (opportunity.stage === 'Procurement') return true;
  return typeof opportunity.pipelineProbability === 'number'
    && opportunity.pipelineProbability >= COMMIT_PROBABILITY_THRESHOLD;
}

export function buildOrderBook(input: {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  milestoneRecords: OrderMilestoneRecord[];
  today?: string;
}): OrderBook {
  const today = input.today || todayDateKey();
  const liveMilestones = input.milestoneRecords.filter((record) => record.__deleted !== true);
  const manualByOrder = new Map<string, Map<OrderMilestoneKey, OrderMilestoneRecord>>();
  liveMilestones.forEach((record) => {
    const forOrder = manualByOrder.get(record.opportunityId) || new Map();
    forOrder.set(record.milestone, record);
    manualByOrder.set(record.opportunityId, forOrder);
  });

  const orders = input.opportunities
    .filter(isCommittedToOrder)
    .map((opportunity) => {
      const quotes = linkedQuotes(opportunity, input.quotes);
      const manual = manualByOrder.get(opportunity.id);
      const milestones = orderMilestoneKeys.map((key) =>
        deriveMilestone(key, quotes, manual?.get(key), today));

      const doneCount = milestones.filter((milestone) => milestone.done).length;
      const nextMilestone = milestones.find((milestone) => !milestone.done) || null;
      const freshestQuote = quotes[0];
      const amount = freshestQuote?.amount ?? opportunity.estimatedValue;
      const currency = freshestQuote?.currency || opportunity.currency || 'VND';

      return {
        opportunityId: opportunity.id,
        accountName: opportunity.accountName || 'Unknown account',
        orderName: opportunity.opportunityName || 'Untitled order',
        stage: opportunity.stage,
        status: opportunity.status,
        probability: typeof opportunity.pipelineProbability === 'number' ? opportunity.pipelineProbability : null,
        amount,
        currency,
        amountBase: typeof amount === 'number' ? sumMoneyInBase([{ amount, currency }]) : 0,
        paymentTerm: freshestQuote?.paymentTerm?.trim() || '',
        quoteCount: quotes.length,
        milestones,
        doneCount,
        nextMilestone,
        fullyCollected: milestones[milestones.length - 1].done,
        overdue: milestones.some((milestone) => milestone.overdue),
        href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
      };
    })
    // Money that is stuck first: overdue orders, then the least-progressed,
    // then the largest. Fully collected orders sink to the bottom as receipts.
    .sort((a, b) =>
      Number(a.fullyCollected) - Number(b.fullyCollected)
      || Number(b.overdue) - Number(a.overdue)
      || a.doneCount - b.doneCount
      || b.amountBase - a.amountBase);

  return {
    orders,
    totalCount: orders.length,
    collectedCount: orders.filter((order) => order.fullyCollected).length,
    awaitingBase: sumMoneyInBase(
      orders
        .filter((order) => !order.fullyCollected)
        .map((order) => ({ amount: order.amount || 0, currency: order.currency })),
    ),
    overdueCount: orders.filter((order) => order.overdue).length,
  };
}

/**
 * The quotes that belong to this order: linked by id, or - for quotes written
 * before linking existed - the same account and opportunity name. Freshest
 * first, so the newest quote speaks for the order's terms.
 */
function linkedQuotes(opportunity: CrmLiteOpportunity, quotes: QuoteRecord[]): QuoteRecord[] {
  const name = normalize(opportunity.opportunityName);
  const account = normalize(opportunity.accountName);
  return quotes
    .filter((quote) => quote.__deleted !== true)
    .filter((quote) => quote.status !== 'Rejected')
    .filter((quote) =>
      quote.opportunityId === opportunity.id
      || (account && name && normalize(quote.accountName) === account && normalize(quote.opportunityName || '') === name))
    .sort((a, b) => (b.quoteDate || b.createdAt || '').localeCompare(a.quoteDate || a.createdAt || ''));
}

function deriveMilestone(
  key: OrderMilestoneKey,
  quotes: QuoteRecord[],
  manual: OrderMilestoneRecord | undefined,
  today: string,
): OrderMilestoneState {
  const proof = quoteEvidence(key, quotes);
  // Quote evidence can only assert done, never undone: unticking by hand does
  // not argue with a received PO. A manual tick fills in where quotes are silent.
  const done = proof.done || manual?.done === true;
  const dueDate = proof.dueDate;
  return {
    key,
    label: orderMilestoneLabels[key],
    done,
    evidence: proof.done ? 'quote' : manual?.done ? 'manual' : null,
    dueDate,
    overdue: !done && isValidBusinessDate(dueDate) && compareSafeBusinessDate(dueDate, today) < 0,
  };
}

function quoteEvidence(key: OrderMilestoneKey, quotes: QuoteRecord[]): { done: boolean; dueDate: string } {
  switch (key) {
    case 'contract':
      return {
        done: quotes.some((quote) => quote.status === 'Accepted' && quote.poStatus === 'Received'),
        dueDate: '',
      };
    case 'deposit':
      // No record proves a deposit - it is the one purely manual milestone.
      return { done: false, dueDate: '' };
    case 'delivery':
      return {
        done: quotes.some((quote) => quote.deliveryStatus === 'Delivered'),
        dueDate: earliest(quotes.map((quote) => quote.expectedDeliveryDate)),
      };
    case 'invoice':
      return {
        done: quotes.some((quote) => quote.paymentStatus === 'Due' || quote.paymentStatus === 'Paid'),
        dueDate: '',
      };
    case 'paid':
      return {
        done: quotes.length > 0 && quotes.every((quote) => quote.paymentStatus === 'Paid' || quote.status !== 'Accepted')
          && quotes.some((quote) => quote.paymentStatus === 'Paid'),
        dueDate: earliest(quotes.map((quote) => quote.paymentDueDate)),
      };
  }
}

function earliest(dates: (string | undefined)[]): string {
  return dates
    .filter((date): date is string => Boolean(date && isValidBusinessDate(date)))
    .sort()[0] || '';
}

export function createOrderMilestoneRecord(input: {
  opportunityId: string;
  milestone: OrderMilestoneKey;
  done: boolean;
  existing?: OrderMilestoneRecord;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): OrderMilestoneRecord {
  const now = new Date().toISOString();
  return {
    id: input.existing?.id || `om-${input.opportunityId}-${input.milestone}`,
    opportunityId: input.opportunityId,
    milestone: input.milestone,
    done: input.done,
    doneAt: input.done ? now : undefined,
    createdAt: input.existing?.createdAt || now,
    updatedAt: now,
    source: input.existing?.source ?? input.source,
    isSample: input.existing?.isSample ?? input.isSample,
  };
}

function normalize(value: string) {
  return (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
