import {
  claimLocalCollectionForUser,
  deleteCloudJsonRecordForCurrentUser,
  loadCloudJsonCollection,
  mergeCloudJsonRecords,
  syncCloudJsonCollectionForCurrentUser,
  upsertCloudJsonCollection,
} from './cloudJsonCollectionStore';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import {
  getCommercialCheckpointRisk,
  getNextCommercialProgressAction,
} from '../utils/commercialFulfillment';
import { sumMoneyInBase } from '../utils/money';
import { compareSafeBusinessDate, isValidBusinessDate, sanitizeBusinessDate } from '../utils/safeDate.ts';

export { buildDeliveryScheduleUpdate, getNextCommercialProgressAction, getQuoteCommercialStage, getQuoteWorkspaceHref, requiresExpectedDeliveryDate } from '../utils/commercialFulfillment';
export type { CommercialProgressAction, CommercialStage } from '../utils/commercialFulfillment';

export const QUOTE_STORAGE_KEY = 'memoire.quotes.v1';

export type QuoteStatus = 'Draft' | 'Sent' | 'Revised' | 'Accepted' | 'Rejected' | 'Expired';
export type PurchaseOrderStatus = 'Pending' | 'Received';
export type DeliveryStatus = 'Not scheduled' | 'Scheduled' | 'Delivered';
export type PaymentStatus = 'Not due' | 'Due' | 'Paid';
export type QuoteRisk =
  | 'None'
  | 'Expiring soon'
  | 'Expired'
  | 'PO follow-up'
  | 'Delivery overdue'
  | 'Payment overdue'
  | 'Needs commercial follow-up'
  | 'Margin check';

export type QuoteRecord = {
  id: string;
  quoteId: string;
  accountName: string;
  opportunityId?: string;
  opportunityName?: string;
  title: string;
  quoteDate: string;
  validUntil: string;
  amount: number | null;
  currency: string;
  grossMarginEstimate: number | null;
  discount: number | null;
  paymentTerm: string;
  status: QuoteStatus;
  poStatus: PurchaseOrderStatus;
  deliveryStatus: DeliveryStatus;
  expectedDeliveryDate: string;
  paymentStatus: PaymentStatus;
  paymentDueDate: string;
  nextAction: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

export type QuoteInput = Omit<QuoteRecord, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type QuoteSummary = {
  total: number;
  sentQuotes: number;
  expiringSoon: number;
  pendingPo: number;
  acceptedValue: number;
  topActionQuote: QuoteRecord | null;
};

export const quoteStatuses: QuoteStatus[] = ['Draft', 'Sent', 'Revised', 'Accepted', 'Rejected', 'Expired'];
export const purchaseOrderStatuses: PurchaseOrderStatus[] = ['Pending', 'Received'];
export const deliveryStatuses: DeliveryStatus[] = ['Not scheduled', 'Scheduled', 'Delivered'];
export const paymentStatuses: PaymentStatus[] = ['Not due', 'Due', 'Paid'];

export const emptyQuoteInput: QuoteInput = {
  quoteId: '',
  accountName: '',
  opportunityId: '',
  opportunityName: '',
  title: '',
  quoteDate: todayKey(),
  validUntil: '',
  amount: null,
  currency: 'VND',
  grossMarginEstimate: null,
  discount: null,
  paymentTerm: '',
  status: 'Draft',
  poStatus: 'Pending',
  deliveryStatus: 'Not scheduled',
  expectedDeliveryDate: '',
  paymentStatus: 'Not due',
  paymentDueDate: '',
  nextAction: '',
  notes: '',
  source: 'user',
  isSample: false,
};

export function loadQuotes(): QuoteRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUOTE_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeQuote).filter(Boolean) as QuoteRecord[];
  } catch {
    return [];
  }
}

export async function loadQuotesForUser(userId: string) {
  const local = loadQuotes();
  try {
    const cloud = await loadCloudJsonCollection<QuoteRecord>('quotes', userId);
    const recordsToMerge = claimLocalCollectionForUser('quotes', userId) ? local : [];
    const merged = mergeCloudJsonRecords(recordsToMerge, cloud)
      .map(sanitizeQuote)
      .filter((quote): quote is QuoteRecord => Boolean(quote));
    persistQuotes(merged, false);
    await upsertCloudJsonCollection('quotes', userId, merged);
    return merged;
  } catch {
    return local;
  }
}

export function saveQuotes(quotes: QuoteRecord[]) {
  return persistQuotes(quotes, true);
}

function persistQuotes(quotes: QuoteRecord[], syncCloud: boolean) {
  if (typeof window === 'undefined') return false;
  try {
    const sanitized = quotes.map(sanitizeQuote).filter((quote): quote is QuoteRecord => Boolean(quote));
    window.localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(sanitized));
    if (syncCloud) syncCloudJsonCollectionForCurrentUser('quotes', sanitized);
    invalidateWorkspaceDataCache();
    return true;
  } catch {
    return false;
  }
}

export function createQuote(input: QuoteInput) {
  const now = new Date().toISOString();
  const quote = sanitizeQuote({
    ...input,
    id: input.id || createQuoteRecordId(input.quoteId || input.title),
    quoteId: input.quoteId || createReadableQuoteId(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }) as QuoteRecord;

  saveQuotes([
    quote,
    ...loadQuotes().filter((item) => item.id !== quote.id),
  ]);
  return quote;
}

export function updateQuote(quote: QuoteRecord, input: QuoteInput) {
  const updated = sanitizeQuote({
    ...quote,
    ...input,
    id: quote.id,
    createdAt: quote.createdAt,
    updatedAt: new Date().toISOString(),
  }) as QuoteRecord;

  saveQuotes(loadQuotes().map((item) => (item.id === quote.id ? updated : item)));
  return updated;
}

export function advanceQuoteCommercialProgress(quote: QuoteRecord) {
  const action = getNextCommercialProgressAction(quote);
  if (!action) return null;

  const { id, createdAt, updatedAt, ...input } = quote;
  void id;
  void createdAt;
  void updatedAt;

  if (action.kind === 'receive-po') {
    return updateQuote(quote, {
      ...input,
      poStatus: 'Received',
      nextAction: action.nextAction,
    });
  }
  if (action.kind === 'schedule-delivery') return null;
  if (action.kind === 'mark-delivered') {
    return updateQuote(quote, {
      ...input,
      deliveryStatus: 'Delivered',
      paymentStatus: quote.paymentStatus === 'Paid' ? 'Paid' : 'Due',
      nextAction: action.nextAction,
    });
  }
  return updateQuote(quote, {
    ...input,
    paymentStatus: 'Paid',
    nextAction: action.nextAction,
  });
}

export function deleteQuote(quoteId: string) {
  const saved = saveQuotes(loadQuotes().filter((item) => item.id !== quoteId));
  deleteCloudJsonRecordForCurrentUser('quotes', quoteId);
  return saved;
}

export function summarizeQuotes(quotes: QuoteRecord[]): QuoteSummary {
  const actionable = quotes
    .filter((quote) => ['Sent', 'Revised', 'Accepted'].includes(quote.status))
    .sort((a, b) => quoteRiskRank(getQuoteRisk(b)) - quoteRiskRank(getQuoteRisk(a)) || compareSafeBusinessDate(a.validUntil, b.validUntil));

  return {
    total: quotes.length,
    sentQuotes: quotes.filter((quote) => quote.status === 'Sent' || quote.status === 'Revised').length,
    expiringSoon: quotes.filter((quote) => getQuoteRisk(quote) === 'Expiring soon').length,
    pendingPo: quotes.filter((quote) => quote.status === 'Accepted' && quote.poStatus === 'Pending').length,
    acceptedValue: sumMoneyInBase(quotes.filter((quote) => quote.status === 'Accepted')),
    topActionQuote: actionable[0] || null,
  };
}

export function getQuoteRisk(quote: QuoteRecord): QuoteRisk {
  const activeQuote = quote.status === 'Sent' || quote.status === 'Revised';
  if (activeQuote && quote.validUntil && daysUntil(quote.validUntil) < 0) return 'Expired';
  if (activeQuote && quote.validUntil && daysUntil(quote.validUntil) <= 7) return 'Expiring soon';
  const checkpointRisk = getCommercialCheckpointRisk(quote);
  if (checkpointRisk) return checkpointRisk;
  if (quote.status === 'Accepted' && quote.paymentStatus === 'Paid') return 'None';
  if (quote.status === 'Accepted' && (!quote.paymentTerm.trim() || !quote.nextAction.trim())) return 'Needs commercial follow-up';
  if ((quote.discount !== null && quote.discount >= 20) || (quote.grossMarginEstimate !== null && quote.grossMarginEstimate < 25)) return 'Margin check';
  return 'None';
}

export function quoteNeedsAction(quote: QuoteRecord) {
  return getQuoteRisk(quote) !== 'None' || Boolean(quote.nextAction.trim());
}

export function quoteRiskTone(risk: QuoteRisk): 'green' | 'amber' | 'red' | 'blue' | 'gray' {
  if (risk === 'Expired' || risk === 'Delivery overdue' || risk === 'Payment overdue') return 'red';
  if (risk === 'Expiring soon' || risk === 'Margin check' || risk === 'PO follow-up') return 'amber';
  if (risk === 'Needs commercial follow-up') return 'blue';
  return 'green';
}

function sanitizeQuote(raw: Partial<QuoteRecord> | null): QuoteRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  const accountName = String(raw.accountName || '').trim();
  if (!title || !accountName) return null;
  const now = new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createQuoteRecordId(raw.quoteId || title),
    quoteId: String(raw.quoteId || createReadableQuoteId()).trim(),
    accountName,
    opportunityId: String(raw.opportunityId || '').trim(),
    opportunityName: String(raw.opportunityName || '').trim(),
    title,
    quoteDate: sanitizeBusinessDate(raw.quoteDate) || todayKey(),
    validUntil: sanitizeBusinessDate(raw.validUntil),
    amount: normalizeNumber(raw.amount),
    currency: String(raw.currency || 'VND').trim().toUpperCase(),
    grossMarginEstimate: normalizeNumber(raw.grossMarginEstimate),
    discount: normalizeNumber(raw.discount),
    paymentTerm: String(raw.paymentTerm || '').trim(),
    status: isQuoteStatus(raw.status) ? raw.status : 'Draft',
    poStatus: isPurchaseOrderStatus(raw.poStatus) ? raw.poStatus : 'Pending',
    deliveryStatus: isDeliveryStatus(raw.deliveryStatus) ? raw.deliveryStatus : 'Not scheduled',
    expectedDeliveryDate: sanitizeBusinessDate(raw.expectedDeliveryDate),
    paymentStatus: isPaymentStatus(raw.paymentStatus) ? raw.paymentStatus : 'Not due',
    paymentDueDate: sanitizeBusinessDate(raw.paymentDueDate),
    nextAction: String(raw.nextAction || '').trim(),
    notes: String(raw.notes || '').trim(),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    source: raw.source === 'demo' ? 'demo' : raw.source === 'user' ? 'user' : undefined,
    isSample: raw.isSample === true,
  };
}

function isQuoteStatus(value: unknown): value is QuoteStatus {
  return quoteStatuses.includes(value as QuoteStatus);
}

function isPurchaseOrderStatus(value: unknown): value is PurchaseOrderStatus {
  return purchaseOrderStatuses.includes(value as PurchaseOrderStatus);
}

function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return deliveryStatuses.includes(value as DeliveryStatus);
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return paymentStatuses.includes(value as PaymentStatus);
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function daysUntil(dateKey: string) {
  if (!isValidBusinessDate(dateKey)) return Number.POSITIVE_INFINITY;
  const target = new Date(`${dateKey}T00:00:00`);
  const today = new Date(`${todayKey()}T00:00:00`);
  return Math.floor((target.getTime() - today.getTime()) / 86_400_000);
}

function quoteRiskRank(risk: QuoteRisk) {
  return {
    Expired: 9,
    'Payment overdue': 8,
    'Delivery overdue': 7,
    'Expiring soon': 6,
    'PO follow-up': 4,
    'Needs commercial follow-up': 3,
    'Margin check': 2,
    None: 1,
  }[risk];
}

function createReadableQuoteId() {
  return `Q-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function createQuoteRecordId(seed: string) {
  return `quote-${slugify(seed)}-${Date.now()}`;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'commercial';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
