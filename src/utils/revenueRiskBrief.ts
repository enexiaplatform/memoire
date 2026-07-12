import type { AccountMemoryRecord } from '../services/accountStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { buildMoneyFlow, formatMoneyFlowAmount } from './moneyFlow.ts';
import { buildRetentionSignals } from './retentionSignals.ts';
import { formatBaseCurrencyAmount, formatCurrencyAmount } from './money.ts';

type RevenueRiskBriefInput = {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  activities?: SalesActivityRecord[];
  accounts?: AccountMemoryRecord[];
  periodLabel: string;
  today?: string;
};

/**
 * The Revenue Risk Brief (direction 7.5): one copyable answer to "where is
 * my money at risk and what do I do about it?". Two risks, both derived:
 * money stuck in the pipeline (money flow checkpoint rules) and paid
 * customers going quiet (the shared retention read-model - future revenue
 * going cold). Nothing here is inferred beyond what those rules state.
 */
export function generateRevenueRiskBriefMarkdown(input: RevenueRiskBriefInput): string {
  const flow = buildMoneyFlow({ opportunities: input.opportunities, quotes: input.quotes, today: input.today });
  const retention = buildRetentionSignals({
    quotes: input.quotes,
    activities: input.activities || [],
    opportunities: input.opportunities,
    accounts: input.accounts,
    today: input.today,
  });

  const lines: string[] = [
    `# Revenue Risk Brief - ${input.periodLabel}`,
    '',
    '> Built from the derived money flow (deal -> quote -> PO -> delivery -> payment) and the retention read-model. A thread is stuck only when a checkpoint rule says so; a customer is going quiet only after a real paid quote and 14+ silent days - nothing is inferred.',
    '',
  ];

  if (flow.threads.length === 0 && retention.length === 0) {
    lines.push('No commercial threads in motion and no paid customer going quiet. Capture the next quote or deal to start the money flow.');
    return lines.join('\n').trimEnd();
  }

  if (flow.threads.length > 0) {
    lines.push(`## Money in motion: ${formatBaseCurrencyAmount(flow.totalInMotionBase, true)}`);
    lines.push('');
    flow.lanes
      .filter((lane) => lane.threads > 0)
      .forEach((lane) => {
        lines.push(`- ${lane.stage}: ${lane.threads} ${lane.threads === 1 ? 'thread' : 'threads'} - ${formatBaseCurrencyAmount(lane.totalBase, true)}${lane.stuckThreads > 0 ? ` (${lane.stuckThreads} stuck)` : ''}`);
      });
    lines.push('');

    lines.push('## Stuck money');
    lines.push('');
    if (flow.stuckThreads.length === 0) {
      lines.push('- Nothing is stuck right now. No checkpoint, quote-validity, or overdue-next-action rule fired.');
    } else {
      flow.stuckThreads.forEach((thread) => {
        const amount = formatMoneyFlowAmount(thread);
        lines.push(`- ${thread.accountName} / ${thread.label} (${thread.stage}${amount ? `, ${amount}` : ''})`);
        lines.push(`  - Why: ${thread.stuckReason}`);
        lines.push(`  - Do next: ${thread.nextAction}`);
      });
    }
    lines.push('');
  }

  lines.push('## Retention risk (paid customers going quiet)');
  lines.push('');
  if (retention.length === 0) {
    lines.push('- No paid customer is going quiet. Every paid relationship is touched, active, or planned.');
  } else {
    retention.forEach((signal) => {
      const amount = typeof signal.amount === 'number' && signal.currency ? ` (${formatCurrencyAmount(signal.amount, signal.currency)})` : '';
      lines.push(`- ${signal.accountName} / ${signal.quoteLabel}${amount}: ${signal.daysQuiet === null ? 'no touch captured since payment' : `quiet ${signal.daysQuiet}d`}`);
      lines.push('  - Do next: Book a retention touch to protect the next order.');
    });
  }

  return lines.join('\n').trimEnd();
}
