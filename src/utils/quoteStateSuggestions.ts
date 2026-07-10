import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';

export type QuoteStateSuggestionKind = 'payment-paid' | 'delivery-delivered' | 'po-received';

export type QuoteStateSuggestion = {
  quoteRecordId: string;
  quoteLabel: string;
  kind: QuoteStateSuggestionKind;
  actionLabel: string;
  reason: string;
  patch: Partial<Pick<QuoteRecord, 'status' | 'poStatus' | 'deliveryStatus' | 'paymentStatus' | 'nextAction'>>;
};

const PAYMENT_PATTERN = /\b(payment received|paid in full|paid\b|invoice (paid|settled)|remittance received)\b/i;
const DELIVERY_PATTERN = /\b(delivered|delivery completed|installation (completed|done)|installed|handover (completed|done)|go-live completed)\b/i;
const PO_PATTERN = /\b(po received|purchase order received|po issued|po confirmed|received the po)\b/i;

/**
 * Stage 1 keystone of the Commercial OS direction: a captured activity
 * proposes the commercial state change it implies - "payment received"
 * offers to mark the matching quote Paid; "delivered" offers Delivered;
 * "PO received" offers Received. Suggestions only: the user confirms every
 * change (assistive intelligence, never autonomous state mutation), and
 * detection is deliberately literal - no inference beyond the note's words.
 */
export function suggestQuoteStateChanges(
  activity: Pick<SalesActivityRecord, 'accountName' | 'linkedAccountName' | 'activityType' | 'rawNote' | 'summary'>,
  quotes: QuoteRecord[],
): QuoteStateSuggestion[] {
  const accountKey = normalize(activity.accountName) || normalize(activity.linkedAccountName);
  if (!accountKey) return [];
  const text = `${activity.summary || ''} ${activity.rawNote || ''}`;
  const accountQuotes = quotes.filter((quote) => !quote.__deleted && normalize(quote.accountName) === accountKey);
  if (accountQuotes.length === 0) return [];

  const suggestions: QuoteStateSuggestion[] = [];

  if ((activity.activityType === 'Payment / invoice' || PAYMENT_PATTERN.test(text)) && PAYMENT_PATTERN.test(text)) {
    const target = pickQuote(accountQuotes, (quote) => quote.status === 'Accepted' && quote.paymentStatus !== 'Paid');
    if (target) {
      suggestions.push({
        quoteRecordId: target.id,
        quoteLabel: quoteLabel(target),
        kind: 'payment-paid',
        actionLabel: 'Mark payment as Paid',
        reason: 'This capture says a payment was received.',
        patch: { paymentStatus: 'Paid', nextAction: 'Confirm the payment is reconciled and thank the customer.' },
      });
    }
  }

  if ((activity.activityType === 'Delivery / fulfillment' || DELIVERY_PATTERN.test(text)) && DELIVERY_PATTERN.test(text)) {
    const target = pickQuote(accountQuotes, (quote) => quote.status === 'Accepted' && quote.deliveryStatus !== 'Delivered');
    if (target) {
      suggestions.push({
        quoteRecordId: target.id,
        quoteLabel: quoteLabel(target),
        kind: 'delivery-delivered',
        actionLabel: 'Mark delivery as Delivered',
        reason: 'This capture says the delivery or installation completed.',
        patch: {
          deliveryStatus: 'Delivered',
          paymentStatus: target.paymentStatus === 'Paid' ? 'Paid' : 'Due',
          nextAction: 'Confirm the payment date now that delivery is complete.',
        },
      });
    }
  }

  if (PO_PATTERN.test(text)) {
    const target = pickQuote(accountQuotes, (quote) => (
      (quote.status === 'Sent' || quote.status === 'Revised' || quote.status === 'Accepted') && quote.poStatus !== 'Received'
    ));
    if (target) {
      suggestions.push({
        quoteRecordId: target.id,
        quoteLabel: quoteLabel(target),
        kind: 'po-received',
        actionLabel: 'Mark PO as Received',
        reason: 'This capture says the purchase order arrived.',
        patch: {
          status: 'Accepted',
          poStatus: 'Received',
          nextAction: 'Schedule the delivery.',
        },
      });
    }
  }

  return suggestions;
}

function pickQuote(quotes: QuoteRecord[], eligible: (quote: QuoteRecord) => boolean) {
  return [...quotes]
    .filter(eligible)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}

function quoteLabel(quote: QuoteRecord) {
  return `${quote.accountName} / ${quote.title || quote.opportunityName || quote.quoteId}`;
}

function normalize(value?: string) {
  return (value || '').trim().toLowerCase();
}
