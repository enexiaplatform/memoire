export type CommercialStage = 'Draft' | 'Quoted' | 'Pending PO' | 'Pending delivery' | 'Pending payment' | 'Paid' | 'Closed';
export type CommercialCheckpointRisk = 'PO follow-up' | 'Delivery overdue' | 'Payment overdue' | null;
export type CommercialProgressAction = {
  kind: 'receive-po' | 'schedule-delivery' | 'mark-delivered' | 'mark-paid';
  label: string;
  successMessage: string;
  nextAction: string;
};

export type CommercialProgress = {
  status: string;
  poStatus: string;
  deliveryStatus: string;
  expectedDeliveryDate: string;
  paymentStatus: string;
  paymentDueDate: string;
};

export function getQuoteCommercialStage(quote: CommercialProgress): CommercialStage {
  if (quote.status === 'Draft') return 'Draft';
  if (quote.status === 'Sent' || quote.status === 'Revised') return 'Quoted';
  if (quote.status !== 'Accepted') return 'Closed';
  if (quote.paymentStatus === 'Paid') return 'Paid';
  if (quote.deliveryStatus === 'Delivered') return 'Pending payment';
  if (quote.poStatus === 'Received') return 'Pending delivery';
  return 'Pending PO';
}

export function getCommercialCheckpointRisk(
  quote: CommercialProgress,
  today = todayDateKey(),
): CommercialCheckpointRisk {
  if (quote.status !== 'Accepted') return null;
  if (quote.paymentStatus !== 'Paid' && isPast(quote.paymentDueDate, today)) return 'Payment overdue';
  if (quote.deliveryStatus !== 'Delivered' && isPast(quote.expectedDeliveryDate, today)) return 'Delivery overdue';
  if (quote.poStatus === 'Pending') return 'PO follow-up';
  return null;
}

export function getNextCommercialProgressAction(quote: CommercialProgress): CommercialProgressAction | null {
  const stage = getQuoteCommercialStage(quote);
  if (stage === 'Pending PO') {
    return {
      kind: 'receive-po',
      label: 'Mark PO received',
      successMessage: 'PO received',
      nextAction: 'Confirm delivery date and owner.',
    };
  }
  if (stage === 'Pending delivery' && quote.deliveryStatus === 'Not scheduled') {
    return {
      kind: 'schedule-delivery',
      label: 'Schedule delivery',
      successMessage: 'Delivery scheduled',
      nextAction: 'Confirm delivery completion and handover.',
    };
  }
  if (stage === 'Pending delivery' && quote.deliveryStatus === 'Scheduled') {
    return {
      kind: 'mark-delivered',
      label: 'Mark delivered',
      successMessage: 'Delivery completed',
      nextAction: 'Confirm payment date and collection owner.',
    };
  }
  if (stage === 'Pending payment') {
    return {
      kind: 'mark-paid',
      label: 'Mark paid',
      successMessage: 'Payment completed',
      nextAction: '',
    };
  }
  return null;
}

export function buildDeliveryScheduleUpdate(quote: CommercialProgress) {
  const action = getNextCommercialProgressAction(quote);
  if (action?.kind !== 'schedule-delivery' || !isDateKey(quote.expectedDeliveryDate)) return null;
  return {
    deliveryStatus: 'Scheduled' as const,
    expectedDeliveryDate: quote.expectedDeliveryDate,
    nextAction: action.nextAction,
  };
}

export function requiresExpectedDeliveryDate(quote: CommercialProgress) {
  return quote.status === 'Accepted'
    && quote.poStatus === 'Received'
    && quote.deliveryStatus !== 'Delivered'
    && !isDateKey(quote.expectedDeliveryDate);
}

export function getQuoteWorkspaceHref(quote: { id: string }) {
  return `/app/quotes?quoteId=${encodeURIComponent(quote.id)}`;
}

function isPast(dateKey: string, today: string) {
  return isBusinessDateOverdue(dateKey, today);
}

function isDateKey(dateKey: string) {
  return isValidBusinessDate(dateKey);
}
import { isBusinessDateOverdue, isValidBusinessDate, todayDateKey } from './safeDate.ts';
