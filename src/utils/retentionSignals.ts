import type { AccountMemoryRecord } from '../services/accountStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { compareSafeBusinessDate, isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export const RETENTION_QUIET_DAYS = 14;

export type RetentionSignal = {
  accountName: string;
  quoteId: string;
  quoteLabel: string;
  amount: number | null;
  currency: string;
  /** Days since the last captured touch; null when no touch was ever captured. */
  daysQuiet: number | null;
  lastTouchDate: string;
};

type RetentionSignalsInput = {
  quotes: QuoteRecord[];
  activities: SalesActivityRecord[];
  opportunities?: CrmLiteOpportunity[];
  accounts?: AccountMemoryRecord[];
  today?: string;
};

/**
 * Retention read-model (Commercial OS direction 7.3, solo journey tail):
 * paid customers whose relationship is going cold. One signal per paid
 * account when no touch was captured for 14+ days and the relationship has
 * no other motion - any active deal on the account (the silence rules own
 * that case) or a dated account follow-up suppresses it. Shared by the
 * Today nudge and the Ask Memoire retention answer; derived, never stored.
 */
export function buildRetentionSignals(input: RetentionSignalsInput): RetentionSignal[] {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const activities = input.activities || [];
  const opportunities = input.opportunities || [];
  const accounts = input.accounts || [];
  const paidQuotes = (input.quotes || [])
    .filter((quote) => !quote.__deleted && quote.status === 'Accepted' && quote.paymentStatus === 'Paid');

  const latestPaidByAccount = new Map<string, QuoteRecord>();
  paidQuotes.forEach((quote) => {
    const key = normalize(quote.accountName);
    if (!key) return;
    const current = latestPaidByAccount.get(key);
    if (!current || compareSafeBusinessDate(quote.quoteDate, current.quoteDate) > 0) {
      latestPaidByAccount.set(key, quote);
    }
  });

  const signals: RetentionSignal[] = [];
  for (const [accountKey, quote] of latestPaidByAccount) {
    const hasOtherMotion = opportunities.some((opportunity) => opportunity.status === 'Active'
      && normalize(opportunity.accountName) === accountKey)
      || accounts.some((account) => normalize(account.accountName) === accountKey
        && isValidBusinessDate(account.nextFollowUp));
    if (hasOtherMotion) continue;

    const lastTouch = activities
      .filter((activity) => isValidBusinessDate(activity.activityDate)
        && (normalize(activity.accountName) === accountKey || normalize(activity.linkedAccountName) === accountKey))
      .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate))[0] || null;
    const daysQuiet = lastTouch ? daysBetweenBusinessDates(lastTouch.activityDate, today) : null;
    if (daysQuiet !== null && daysQuiet < RETENTION_QUIET_DAYS) continue;

    signals.push({
      accountName: quote.accountName || 'Needs confirmation',
      quoteId: quote.id,
      quoteLabel: quote.title || quote.opportunityName || quote.quoteId || 'Paid quote',
      amount: typeof quote.amount === 'number' ? quote.amount : null,
      currency: quote.currency || '',
      daysQuiet,
      lastTouchDate: lastTouch?.activityDate || '',
    });
  }

  // Never-touched relationships are the most unknown; then coldest first.
  return signals.sort((a, b) => {
    if (a.daysQuiet === null && b.daysQuiet !== null) return -1;
    if (a.daysQuiet !== null && b.daysQuiet === null) return 1;
    return (b.daysQuiet ?? 0) - (a.daysQuiet ?? 0);
  });
}

function daysBetweenBusinessDates(start: string, end: string) {
  if (!isValidBusinessDate(start) || !isValidBusinessDate(end)) return null;
  const elapsed = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.floor(elapsed / 86_400_000);
}

function normalize(value?: string) {
  return (value || '').trim().toLowerCase();
}
