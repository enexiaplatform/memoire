import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { QuoteRecord } from '../services/quoteStore';
import { compareSafeBusinessDate, isValidBusinessDate, timestampToLocalDateKey, todayDateKey } from './safeDate.ts';
import { sumMoneyInBase } from './money.ts';
import { parsePaymentTerm } from './paymentTerms.ts';

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

/**
 * Where an order is standing right now, named for what has to happen next.
 *
 * This is the one thing every ERP sales-order list has and this one did not.
 * Odoo, NetSuite and SAP all answer "where is this order" with a single derived
 * status - awaiting confirmation, to deliver, to invoice, paid - computed from
 * which documents exist, and then let you filter the list by it. Memoire has
 * the same information (a quote that is accepted, a PO that was received, a
 * delivery that happened, a payment that landed) and was showing it only as
 * five chips per card, which reads as a progress bar and not as a status you
 * can sort, count or chase.
 *
 * The stage is always the first open milestone, so it cannot drift from the
 * ticks: it *is* the ticks, said as a sentence.
 */
export const orderStages = [
  'To confirm',
  'Deposit due',
  'To deliver',
  'To invoice',
  'Awaiting payment',
  'Collected',
] as const;
export type OrderStage = (typeof orderStages)[number];

const STAGE_BY_MILESTONE: Record<OrderMilestoneKey, OrderStage> = {
  contract: 'To confirm',
  deposit: 'Deposit due',
  delivery: 'To deliver',
  invoice: 'To invoice',
  paid: 'Awaiting payment',
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
  /** When it actually happened, for a step somebody ticked by hand. */
  doneAt: string;
  overdue: boolean;
};

export type CommittedOrder = {
  opportunityId: string;
  accountName: string;
  orderName: string;
  /**
   * What to call this order out loud - the quote reference where there is one,
   * otherwise a stable code derived from the deal. An order somebody is chasing
   * on the phone needs a number, not a row position.
   */
  orderRef: string;
  /** The deal's own pipeline stage. Kept for the header line and filters. */
  stage: string;
  status: string;
  /** Where the order stands on the road to cash. */
  orderStage: OrderStage;
  probability: number | null;
  amount: number | null;
  currency: string;
  amountBase: number;
  /** The commercial terms as written on the freshest linked quote. */
  paymentTerm: string;
  quoteCount: number;
  /** When the customer committed: the freshest quote's date, else the deal's. */
  orderDate: string;
  /** The last time anything on this order actually moved. */
  lastMovedAt: string;
  /**
   * Days since that last movement. The number an ERP calls aging, and the one
   * thing a five-chip progress bar could never say: an order stuck for sixty
   * days looked exactly like an order confirmed this morning.
   */
  daysInStage: number | null;
  milestones: OrderMilestoneState[];
  doneCount: number;
  /** The first milestone still open - the thing to chase on this order. */
  nextMilestone: OrderMilestoneState | null;
  /** When the next step is expected, where any record carries a date for it. */
  nextDueDate: string;
  /** Negative when the next step is already late. Null when nothing is dated. */
  daysUntilDue: number | null;
  fullyCollected: boolean;
  overdue: boolean;
  href: string;
};

export type OrderStageSummary = {
  stage: OrderStage;
  count: number;
  /** Order value sitting at this stage, in the base currency. */
  valueBase: number;
  overdueCount: number;
};

/**
 * The only part of a cost record the order book reads: whose order it is, and
 * the terms written on it.
 *
 * Named separately so `OrderBookPanel` can take these as a prop without
 * importing the cost-analysis module - Orders answers "where is my money" and
 * cost answers "was it worth it", and verify-order-margin case 1b keeps the two
 * apart. Structural, so a full `OrderCostRecord` satisfies it unchanged.
 */
export type OrderTermRecord = {
  opportunityId: string;
  paymentTerm: string;
  __deleted?: boolean;
};

export type OrderBook = {
  orders: CommittedOrder[];
  totalCount: number;
  collectedCount: number;
  /** Committed money not yet fully collected, in the base currency. */
  awaitingBase: number;
  overdueCount: number;
  /** Every stage, in road-to-cash order, including the empty ones. */
  stages: OrderStageSummary[];
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
  /**
   * The buy side, which is also where terms are worked out before a quote
   * exists. Optional: a caller that has not loaded costs still gets an order
   * book, it just falls back to the quote for terms as it always did.
   */
  costRecords?: OrderTermRecord[];
  today?: string;
}): OrderBook {
  const today = input.today || todayDateKey();
  const termByOrder = new Map(
    (input.costRecords || [])
      .filter((record) => record.__deleted !== true && record.paymentTerm?.trim())
      .map((record) => [record.opportunityId, record.paymentTerm.trim()]),
  );
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
      // An order on net terms has no deposit, so it cannot be waiting for one.
      // The deposit is a fixed step in the road to cash and nothing can prove
      // it, so every Net 30 order - the ordinary shape of B2B outside
      // deposit-heavy markets - sat at "Deposit due" from the day it was won,
      // counted in the deposit bucket, with Today proposing a deposit that was
      // never part of the deal. The terms are already parsed for the collection
      // schedule; this reads the same answer.
      const term = freshestPaymentTerm(quotes, termByOrder.get(opportunity.id));
      const expectsDeposit = term ? parsePaymentTerm(term).installments.some((part) => part.trigger === 'order') : true;
      const milestones = orderMilestoneKeys
        .filter((key) => key !== 'deposit' || expectsDeposit)
        .map((key) => deriveMilestone(key, quotes, manual?.get(key), today));

      const doneCount = milestones.filter((milestone) => milestone.done).length;
      const nextMilestone = milestones.find((milestone) => !milestone.done) || null;
      const freshestQuote = quotes[0];
      const amount = freshestQuote?.amount ?? opportunity.estimatedValue;
      const currency = freshestQuote?.currency || opportunity.currency || 'VND';

      /**
       * When the order was actually placed.
       *
       * The ticked Contract / PO milestone leads, because it is the only source
       * here that *means* "the order was placed on this date" - an operator
       * ticking it with a date is stating the fact directly, where a quote date
       * is when the quote went out, some time before.
       *
       * The last resort used to be `opportunity.updatedAt`, and for a deal won
       * without a quote - the ordinary handshake, and the same gap that left the
       * order book showing "No payment term" - that is the record's last edit,
       * not the order's date. It moved. A deposit falls due "on order", so it
       * anchors here: on a 242,000 order signed 12 June with 30% down, opening
       * the deal and typing a note re-dated the deposit from 12 June to today
       * and took both it and the balance out of overdue. Same contract, same
       * money, same customer - and the page stopped saying it was late because
       * the operator had looked at it.
       */
      const contractSignedOn = sanitize(timestampToLocalDateKey(manual?.get('contract')?.done
        ? manual.get('contract')?.doneAt
        : undefined));
      const orderDate = contractSignedOn
        || sanitize(freshestQuote?.quoteDate)
        || sanitize(timestampToLocalDateKey(freshestQuote?.createdAt))
        || sanitize(timestampToLocalDateKey(opportunity.updatedAt))
        || '';
      // The freshest dated thing that happened *on this order*, so aging is
      // measured from real movement rather than from when the row was created.
      const lastMovedAt = milestones
        .map((milestone) => milestone.doneAt)
        .filter(isValidBusinessDate)
        .sort()
        .pop() || orderDate;

      return {
        opportunityId: opportunity.id,
        accountName: opportunity.accountName || 'Unknown account',
        orderName: opportunity.opportunityName || 'Untitled order',
        orderRef: freshestQuote?.quoteId?.trim() || fallbackOrderRef(opportunity.id),
        stage: opportunity.stage,
        status: opportunity.status,
        orderStage: nextMilestone ? STAGE_BY_MILESTONE[nextMilestone.key] : 'Collected',
        probability: typeof opportunity.pipelineProbability === 'number' ? opportunity.pipelineProbability : null,
        amount,
        currency,
        amountBase: typeof amount === 'number' ? sumMoneyInBase([{ amount, currency }]) : 0,
        // A quote the customer has seen outranks a working assumption, but an
        // assumption the operator recorded outranks nothing at all.
        paymentTerm: freshestQuote?.paymentTerm?.trim() || termByOrder.get(opportunity.id) || '',
        quoteCount: quotes.length,
        orderDate,
        lastMovedAt,
        daysInStage: daysBetween(lastMovedAt, today),
        milestones,
        doneCount,
        nextMilestone,
        nextDueDate: nextMilestone?.dueDate || '',
        daysUntilDue: nextMilestone?.dueDate ? daysBetween(today, nextMilestone.dueDate) : null,
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
    // Every stage is reported, including the empty ones: a row of counters
    // with a gap in it says "nothing is waiting to be invoiced", which is
    // information. A list that silently omits empty stages says nothing.
    stages: orderStages.map((stage) => {
      const atStage = orders.filter((order) => order.orderStage === stage);
      return {
        stage,
        count: atStage.length,
        valueBase: atStage.reduce((sum, order) => sum + order.amountBase, 0),
        overdueCount: atStage.filter((order) => order.overdue).length,
      };
    }),
  };
}

/** A stable, readable reference for an order with no quote behind it yet. */
function fallbackOrderRef(opportunityId: string): string {
  const tail = opportunityId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  return `ORD-${tail || '000000'}`;
}

/** Whole days from `from` to `to`. Negative when `to` is already past. */
function daysBetween(from: string, to: string): number | null {
  if (!isValidBusinessDate(from) || !isValidBusinessDate(to)) return null;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function sanitize(value: string | undefined | null): string {
  return isValidBusinessDate(value) ? value : '';
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

/** The terms this order actually runs on: the freshest quote's, or the one recorded against the order. */
function freshestPaymentTerm(quotes: QuoteRecord[], recorded: string | undefined): string {
  return quotes[0]?.paymentTerm?.trim() || recorded?.trim() || '';
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
    doneAt: done && manual?.done ? timestampToLocalDateKey(manual.doneAt) : '',
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
  /**
   * When the step actually happened, where that is not the moment it was ticked.
   *
   * Without this the factory stamped `now` unconditionally, so every date on the
   * road to cash was a click time rather than an event time - a PO signed three
   * weeks ago was recorded as signed today, and an operator entering the orders
   * already on their desk could not tell the truth about any of them. It still
   * defaults to now, which is right for ticking something off as it happens.
   */
  doneAt?: string;
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
    doneAt: input.done ? (input.doneAt || input.existing?.doneAt || now) : undefined,
    createdAt: input.existing?.createdAt || now,
    updatedAt: now,
    source: input.existing?.source ?? input.source,
    isSample: input.existing?.isSample ?? input.isSample,
  };
}

function normalize(value: string) {
  return (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
