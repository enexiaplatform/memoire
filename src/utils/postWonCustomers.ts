import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import { normalizeEntityName } from './accountIdentity.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { accountKey } from './accountIdentity.ts';
import { convertMoney, sumMoney } from './money.ts';
import { isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export type WonCustomerNudge = {
  accountName: string;
  wonValueBase: number;
  wonDealCount: number;
  lastTouchDate: string;
  daysSinceTouch: number;
  suggestedAction: string;
};

export type PostWonCustomers = {
  wonCustomerCount: number;
  quietCustomers: WonCustomerNudge[];
};

type PostWonInput = {
  opportunities: CrmLiteOpportunity[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  quotes: QuoteRecord[];
  activities: SalesActivityRecord[];
  today?: string;
  quietAfterDays?: number;
};

const DEFAULT_QUIET_AFTER_DAYS = 45;
const DAY_MS = 86_400_000;

/** Matches a retro to its deal without counting the same win twice. */
/**
 * The canonical fold - see accountIdentity.ts.
 *
 * This one was half-right, which is worse than wrong: the retro key below pairs
 * `accountKey(...)` - already canonical - with this bare lowercase on the
 * opportunity name. A mixed key looks correct and matches nothing when the deal
 * name carries accents.
 */
function normalizeName(value: string) {
  return normalizeEntityName(value || '');
}

/**
 * The pivot promise turned on existing customers: a deal that WON and then went
 * quiet is exactly the "silence" the app exists to catch, yet it is the app's
 * blindest spot once money is collected. A customer is "won" when they have a
 * won outcome or a fully-collected quote; "quiet" when there is no active deal
 * in flight and no touch for `quietAfterDays`. Derived, never stored - so it
 * self-heals the moment the seller logs the next touch.
 */
export function buildPostWonCustomers(input: PostWonInput): PostWonCustomers {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const quietAfterDays = input.quietAfterDays ?? DEFAULT_QUIET_AFTER_DAYS;

  // Accounts with a deal currently in flight are already tracked by pipeline and
  // must not double-surface here as dormant.
  const activeAccountKeys = new Set(
    input.opportunities
      .filter((opportunity) => opportunity.status === 'Active')
      .map((opportunity) => accountKey(opportunity.accountName))
      .filter(Boolean),
  );

  const wonByAccount = new Map<string, {
    accountName: string;
    signals: Array<{ amount: number | null; currency: string; date: string }>;
  }>();

  const addWon = (accountName: string, amount: number | null, currency: string, date: string) => {
    const key = accountKey(accountName);
    if (!key) return;
    const existing = wonByAccount.get(key) || { accountName: accountName.trim(), signals: [] };
    existing.signals.push({ amount, currency, date: sanitizeBusinessDate(date) });
    wonByAccount.set(key, existing);
  };

  // The retros first, because they carry the figure actually signed and the
  // date it was signed on.
  const retroKeys = new Set<string>();
  input.opportunityOutcomes
    .filter((outcome) => outcome.outcome === 'Won')
    .forEach((outcome) => {
      retroKeys.add(`${accountKey(outcome.accountName)}::${normalizeName(outcome.opportunityName)}`);
      addWon(outcome.accountName, outcome.finalAmount, outcome.currency, outcome.outcomeDate);
    });

  // Then the deals marked Won that never got one. A deal can reach Won without
  // a retro - imported that way, or closed before the retro existed - and
  // reading only the retros meant those customers were never watched at all:
  // won, delivered, and then silent, with nothing on any screen to say so.
  // Which is the exact silence this whole model exists to catch.
  input.opportunities
    .filter((opportunity) => opportunity.status === 'Won')
    .filter((opportunity) => !retroKeys.has(`${accountKey(opportunity.accountName)}::${normalizeName(opportunity.opportunityName)}`))
    .forEach((opportunity) => addWon(
      opportunity.accountName,
      opportunity.estimatedValue ?? opportunity.fy26Value ?? null,
      opportunity.currency,
      opportunity.expectedClosePeriod || opportunity.updatedAt.slice(0, 10),
    ));

  input.quotes
    .filter((quote) => !quote.__deleted && quote.deliveryStatus === 'Delivered' && quote.paymentStatus === 'Paid')
    .forEach((quote) => addWon(quote.accountName, quote.amount, quote.currency, quote.paymentDueDate || quote.quoteDate));

  const lastTouchByAccount = new Map<string, string>();
  input.activities.forEach((activity) => {
    const name = activity.linkedAccountName || activity.accountName;
    const key = accountKey(name);
    if (!key) return;
    const date = sanitizeBusinessDate(activity.activityDate);
    if (!date) return;
    const current = lastTouchByAccount.get(key);
    if (!current || date > current) lastTouchByAccount.set(key, date);
  });

  const quietCustomers: WonCustomerNudge[] = [];

  wonByAccount.forEach((won, key) => {
    if (activeAccountKeys.has(key)) return;

    const latestWinDate = won.signals
      .map((signal) => signal.date)
      .filter(isValidBusinessDate)
      .sort()
      .at(-1) || '';
    const lastActivity = lastTouchByAccount.get(key) || '';
    // The clock starts at the later of the win and the last logged touch: a deal
    // won yesterday is not "quiet", and a recent check-in resets it.
    const lastTouchDate = [latestWinDate, lastActivity].filter(isValidBusinessDate).sort().at(-1) || '';
    const daysSinceTouch = lastTouchDate ? Math.floor((toTime(today) - toTime(lastTouchDate)) / DAY_MS) : Number.POSITIVE_INFINITY;

    if (daysSinceTouch < quietAfterDays) return;

    const wonValueBase = sumMoney(won.signals.map((signal) => ({ amount: signal.amount, currency: signal.currency })));
    quietCustomers.push({
      accountName: won.accountName || 'Needs confirmation',
      wonValueBase,
      wonDealCount: won.signals.length,
      lastTouchDate,
      daysSinceTouch: Number.isFinite(daysSinceTouch) ? daysSinceTouch : 0,
      suggestedAction: buildSuggestedAction(won.accountName, lastTouchDate),
    });
  });

  quietCustomers.sort((a, b) => b.wonValueBase - a.wonValueBase || b.daysSinceTouch - a.daysSinceTouch);

  return { wonCustomerCount: wonByAccount.size, quietCustomers };
}

function buildSuggestedAction(accountName: string, lastTouchDate: string) {
  const name = accountName.trim() || 'this customer';
  return lastTouchDate
    ? `Reconnect with ${name}: won customer, no touch since ${lastTouchDate}. Book the next order or check-in.`
    : `Reconnect with ${name}: won customer with no logged touch. Book the next order or check-in.`;
}

function toTime(dateKey: string) {
  return Date.parse(`${dateKey}T00:00:00Z`);
}

export function isSupportedWonValue(nudge: WonCustomerNudge) {
  // A guard the callers can share: a value we could not convert is shown as a
  // count-only nudge, never a fabricated total.
  return convertMoney(nudge.wonValueBase, 'VND') !== null;
}
