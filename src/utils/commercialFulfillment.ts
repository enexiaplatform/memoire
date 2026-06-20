export type CommercialStage = 'Draft' | 'Quoted' | 'Pending PO' | 'Pending delivery' | 'Pending payment' | 'Paid' | 'Closed';
export type CommercialCheckpointRisk = 'PO follow-up' | 'Delivery overdue' | 'Payment overdue' | null;

type CommercialProgress = {
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
  today = new Date().toISOString().slice(0, 10),
): CommercialCheckpointRisk {
  if (quote.status !== 'Accepted') return null;
  if (quote.paymentStatus !== 'Paid' && isPast(quote.paymentDueDate, today)) return 'Payment overdue';
  if (quote.deliveryStatus !== 'Delivered' && isPast(quote.expectedDeliveryDate, today)) return 'Delivery overdue';
  if (quote.poStatus === 'Pending') return 'PO follow-up';
  return null;
}

function isPast(dateKey: string, today: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey < today;
}
