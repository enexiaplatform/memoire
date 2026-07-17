import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { ExpenseRecord } from '../services/expenseStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import { buildMoneyFlow } from './moneyFlow.ts';
import { buildCashPosition, getOpeningCashBalance } from './cashPosition.ts';
import { buildOwnObligations } from './ownObligations.ts';
import { buildPostWonCustomers } from './postWonCustomers.ts';
import { formatCompactBaseAmount, formatCurrencyAmount } from './money.ts';
import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

export type DailyDigest = {
  subject: string;
  plainText: string;
  headline: string;
  sections: Array<{ title: string; lines: string[] }>;
  hasSignal: boolean;
};

type DailyDigestInput = {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
  activities: SalesActivityRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  ownerName?: string;
  today?: string;
};

/**
 * The digest is the app's outbound voice: it composes the day's silence signals
 * - stuck money, obligations you owe, won customers going quiet, the profit line
 * - into one plain-text brief the seller can copy or mail to themselves. It does
 * not send: true scheduled delivery needs an email service and a cron the
 * operator provisions. This builds the message; the surface offers copy + mailto.
 */
export function buildDailyDigest(input: DailyDigestInput): DailyDigest {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const dateLabel = formatDateLabel(today);

  const moneyFlow = buildMoneyFlow({ opportunities: input.opportunities, quotes: input.quotes, today });
  const cash = buildCashPosition({ quotes: input.quotes, expenses: input.expenses, openingBalanceBase: getOpeningCashBalance(), today });
  const obligations = buildOwnObligations({ quotes: input.quotes, expenses: input.expenses, today });
  const postWon = buildPostWonCustomers({ opportunities: input.opportunities, opportunityOutcomes: input.opportunityOutcomes, quotes: input.quotes, activities: input.activities, today });

  const sections: Array<{ title: string; lines: string[] }> = [];

  const moneyLines = [
    `Realized profit: ${formatCompactBaseAmount(cash.realizedProfitBase)} (collected ${formatCompactBaseAmount(cash.collectedRevenueBase)} - paid out ${formatCompactBaseAmount(cash.paidExpensesBase)})`,
    `Money in motion: ${formatCompactBaseAmount(moneyFlow.totalInMotionBase)} across ${moneyFlow.threads.length} thread(s), ${moneyFlow.stuckThreads.length} stuck`,
    `Projected net flow: ${formatCompactBaseAmount(cash.projectedDeltaBase)}`,
  ];
  if (cash.cashOnHandBase !== null) moneyLines.push(`Cash on hand: ${formatCompactBaseAmount(cash.cashOnHandBase)}`);
  sections.push({ title: 'Money', lines: moneyLines });

  const stuckLines = moneyFlow.stuckThreads.slice(0, 5).map((thread) => (
    `${thread.accountName} / ${thread.label}${moneyLabel(thread.amount, thread.currency)} - ${thread.stuckReason}. ${thread.nextAction}`
  ));
  if (stuckLines.length > 0) sections.push({ title: 'Stuck money', lines: stuckLines });

  const obligationItems = [...obligations.overdue, ...obligations.dueSoon];
  const obligationLines = obligationItems.slice(0, 6).map((obligation) => (
    `[${obligation.status}] ${obligation.kind}: ${obligation.label} (${obligation.counterparty})${moneyLabel(obligation.amount, obligation.currency)}${obligation.dueDate ? ` - due ${obligation.dueDate}` : ''}`
  ));
  if (obligationLines.length > 0) sections.push({ title: 'Obligations you owe', lines: obligationLines });

  const quietLines = postWon.quietCustomers.slice(0, 5).map((customer) => (
    `${customer.accountName} - quiet ${customer.daysSinceTouch} days${customer.wonValueBase > 0 ? `, won ${formatCompactBaseAmount(customer.wonValueBase)}` : ''}. Book the next touch.`
  ));
  if (quietLines.length > 0) sections.push({ title: 'Won customers going quiet', lines: quietLines });

  const hasSignal = stuckLines.length > 0 || obligationLines.length > 0 || quietLines.length > 0;
  const headline = buildHeadline({
    stuck: moneyFlow.stuckThreads.length,
    obligations: obligations.overdue.length,
    quiet: postWon.quietCustomers.length,
  });

  const owner = input.ownerName?.trim();
  const plainText = [
    `Memoire daily digest - ${dateLabel}`,
    owner ? owner : '',
    '',
    headline,
    '',
    ...sections.flatMap((section) => [section.title.toUpperCase(), ...section.lines.map((line) => `- ${line}`), '']),
    'Open Memoire to act: work the top item first.',
  ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');

  return {
    subject: `Memoire digest ${dateLabel} - ${headline}`,
    plainText,
    headline,
    sections,
    hasSignal,
  };
}

function buildHeadline(counts: { stuck: number; obligations: number; quiet: number }) {
  const parts: string[] = [];
  if (counts.obligations > 0) parts.push(`${counts.obligations} obligation${counts.obligations === 1 ? '' : 's'} overdue`);
  if (counts.stuck > 0) parts.push(`${counts.stuck} deal${counts.stuck === 1 ? '' : 's'} stuck`);
  if (counts.quiet > 0) parts.push(`${counts.quiet} won customer${counts.quiet === 1 ? '' : 's'} quiet`);
  if (parts.length === 0) return 'Nothing going silent today - keep it that way.';
  return parts.join(', ') + '.';
}

function moneyLabel(amount: number | null | undefined, currency: string) {
  if (typeof amount !== 'number' || !currency) return '';
  return ` - ${formatCurrencyAmount(amount, currency)}`;
}

function formatDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** A mailto: link that pre-fills the digest for the seller to send to themselves. */
export function buildDigestMailtoLink(digest: DailyDigest, recipient = ''): string {
  const params = new URLSearchParams({ subject: digest.subject, body: digest.plainText });
  return `mailto:${recipient}?${params.toString()}`;
}
