import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { getQuoteRisk, summarizeQuotes, type QuoteRecord } from '../services/quoteStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import { formatCurrencyAmount as formatMoney } from './currency';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage';
import { buildPipelineReviewDashboardSignal } from './shareablePipelineDefenseBrief';
import { buildRevenueView, type RevenueViewSummary } from './revenueView';
import { buildTodayCommandCenter, type CommandCenter } from './salesCommandCenter';
import type { WeeklyExecutionReview } from './weeklyExecutionReview';

export type CommercialReviewMetric = {
  label: string;
  value: string;
  tone: 'green' | 'blue' | 'amber' | 'red';
};

export type CommercialReviewBrief = {
  periodLabel: string;
  summary: string;
  metrics: CommercialReviewMetric[];
  pipelineLine: string;
  quoteLine: string;
  revenueLine: string;
  paymentLine: string;
  topAccounts: string[];
  nextActions: string[];
  markdown: string;
};

export function buildCommercialReviewBrief(input: {
  periodLabel: string;
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
  briefs: PipelineDefenseBrief[];
  quotes: QuoteRecord[];
  executionReview: WeeklyExecutionReview;
}): CommercialReviewBrief {
  const revenue = buildRevenueView({ opportunities: input.opportunities, quotes: input.quotes });
  const commandCenter = buildTodayCommandCenter({
    activities: input.activities,
    opportunities: input.opportunities,
    accounts: input.accounts,
    briefs: input.briefs,
  });
  const pipeline = buildPipelineReviewDashboardSignal(input.briefs);
  const quoteSummary = summarizeQuotes(input.quotes);
  const expiringOrExpired = input.quotes.filter((quote) => {
    const risk = getQuoteRisk(quote);
    return risk === 'Expired' || risk === 'Expiring soon';
  });

  const topAccounts = commandCenter.accountsNeedingTouch
    .slice(0, 3)
    .map((account) => `${account.accountName}: ${account.reason}`);

  const nextActions = buildNextActions({
    revenue,
    commandCenter,
    executionReview: input.executionReview,
  });

  const pipelineLine = pipeline.dealsNeedingReview > 0
    ? `${pipeline.dealsNeedingReview} deal(s) need defense review. ${pipeline.topReason}`
    : 'Pipeline defense is quiet. Keep evidence current before manager review.';
  const quoteLine = quoteSummary.topActionQuote
    ? `${quoteSummary.topActionQuote.accountName}: ${quoteSummary.topActionQuote.title} needs ${quoteSummary.topActionQuote.nextAction || getQuoteRisk(quoteSummary.topActionQuote).toLowerCase()}.`
    : 'No quote follow-up is blocking this review.';
  const revenueLine = revenue.topAction
    ? `${formatMoney(revenue.atRiskRevenue, revenue.topAction.currency)} at risk. Top action: ${revenue.topAction.accountName} - ${revenue.topAction.nextAction}`
    : 'No commercial revenue risk is blocking this review.';
  const paymentLine = revenue.pendingPayment > 0
    ? `${formatMoney(revenue.pendingPayment, 'VND')} is delivered and still waiting for payment.`
    : 'No delivered revenue is waiting for payment.';

  const summary = [
    pipeline.dealsNeedingReview > 0 ? `${pipeline.dealsNeedingReview} pipeline item(s) need defense.` : 'Pipeline defense is under control.',
    expiringOrExpired.length > 0 ? `${expiringOrExpired.length} quote(s) are expiring or expired.` : 'Quote risk is quiet.',
    revenue.topAction ? 'Revenue has action needed this week.' : 'No urgent revenue block detected.',
  ].join(' ');

  const metrics: CommercialReviewMetric[] = [
    {
      label: 'Pipeline review',
      value: String(pipeline.dealsNeedingReview),
      tone: pipeline.dealsNeedingReview ? 'amber' : 'green',
    },
    {
      label: 'Quote risk',
      value: String(expiringOrExpired.length),
      tone: expiringOrExpired.length ? 'amber' : 'green',
    },
    {
      label: 'At-risk money',
      value: formatMoney(revenue.atRiskRevenue, revenue.topAction?.currency || 'VND'),
      tone: revenue.atRiskRevenue ? 'red' : 'green',
    },
    {
      label: 'Pending PO',
      value: formatMoney(revenue.pendingPo, 'VND'),
      tone: revenue.pendingPo ? 'amber' : 'green',
    },
  ];

  const markdown = generateCommercialReviewMarkdown({
    periodLabel: input.periodLabel,
    summary,
    pipelineLine,
    quoteLine,
    revenueLine,
    paymentLine,
    topAccounts,
    nextActions,
    revenue,
    pipelineTitle: pipeline.briefTitle,
    quoteSummary,
  });

  return {
    periodLabel: input.periodLabel,
    summary,
    metrics,
    pipelineLine,
    quoteLine,
    revenueLine,
    paymentLine,
    topAccounts,
    nextActions,
    markdown,
  };
}

function buildNextActions({
  revenue,
  commandCenter,
  executionReview,
}: {
  revenue: RevenueViewSummary;
  commandCenter: CommandCenter;
  executionReview: WeeklyExecutionReview;
}) {
  const actions = [
    revenue.topAction
      ? `${revenue.topAction.accountName}: ${revenue.topAction.nextAction}`
      : '',
    commandCenter.priorityActions[0]
      ? `${commandCenter.priorityActions[0].accountName}: ${commandCenter.priorityActions[0].title}`
      : '',
    ...executionReview.nextWeekFocus.slice(0, 2),
  ].filter(Boolean);

  return Array.from(new Set(actions)).slice(0, 4);
}

function generateCommercialReviewMarkdown(input: {
  periodLabel: string;
  summary: string;
  pipelineLine: string;
  quoteLine: string;
  revenueLine: string;
  paymentLine: string;
  topAccounts: string[];
  nextActions: string[];
  revenue: RevenueViewSummary;
  pipelineTitle: string;
  quoteSummary: ReturnType<typeof summarizeQuotes>;
}) {
  return [
    '# Commercial Review Brief',
    '',
    `Period: ${input.periodLabel}`,
    '',
    '## Summary',
    `- ${input.summary}`,
    '',
    '## Pipeline Defense',
    `- ${input.pipelineLine}`,
    `- Source brief: ${input.pipelineTitle}`,
    '',
    '## Quote Risk',
    `- ${input.quoteLine}`,
    `- Sent/revised quotes: ${input.quoteSummary.sentQuotes}`,
    `- Expiring soon: ${input.quoteSummary.expiringSoon}`,
    '',
    '## Revenue Risk',
    `- ${input.revenueLine}`,
    `- Pending PO: ${formatMoney(input.revenue.pendingPo, 'VND')}`,
    `- Pending delivery: ${formatMoney(input.revenue.pendingDelivery, 'VND')}`,
    `- Pending payment: ${formatMoney(input.revenue.pendingPayment, 'VND')}`,
    `- Paid: ${formatMoney(input.revenue.paid, 'VND')}`,
    '',
    '## Payment Risk',
    `- ${input.paymentLine}`,
    '',
    '## Top Accounts Needing Follow-up',
    ...formatBullets(input.topAccounts, 'No stale account follow-up detected.'),
    '',
    '## Next Actions',
    ...formatBullets(input.nextActions, 'Choose one account to move and capture the result.'),
    '',
  ].join('\n');
}

function formatBullets(items: string[], empty: string) {
  return items.length ? items.map((item) => `- ${item}`) : [`- ${empty}`];
}
