import type { QuoteRecord } from '../services/quoteStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import { buildOrderBook, type OrderMilestoneRecord } from './orderToCash.ts';
import { buildReceivables, type OrderReceivableRecord } from './receivables.ts';

/** Transient receipt proof. Contract amounts and legacy operator claims stay intact. */
export function withQuoteCollectionEvidence(input: {
  quotes: QuoteRecord[]; opportunities: CrmLiteOpportunity[];
  receivableRecords: OrderReceivableRecord[]; milestoneRecords?: OrderMilestoneRecord[]; today?: string;
}): QuoteRecord[] {
  const book = buildOrderBook({ ...input, linkage: 'explicit-id', milestoneRecords: input.milestoneRecords || [] });
  const collections = buildReceivables({orders: book.orders, records: input.receivableRecords, today: input.today});
  const byId = new Map(collections.orders.map(order => [order.opportunityId, order]));
  const orders = new Map(book.orders.map(order => [order.opportunityId, order]));
  return input.quotes.map(quote => ({...quote, paymentReceiptVerified: Boolean(quote.opportunityId &&
    quote.status === 'Accepted' && orders.get(quote.opportunityId)?.orderRef === quote.quoteId &&
    orders.get(quote.opportunityId)?.fullyCollected && byId.get(quote.opportunityId)?.settled && !byId.get(quote.opportunityId)?.valueUnavailable)}));
}
