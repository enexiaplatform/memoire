import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import { buildMoneyFlow, formatMoneyFlowAmount } from './moneyFlow.ts';
import { formatBaseCurrencyAmount } from './money.ts';

type RevenueRiskBriefInput = {
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  periodLabel: string;
  today?: string;
};

/**
 * The Revenue Risk Brief (direction 7.5): one copyable answer to "where is
 * my money stuck and what do I do about it?". Composed entirely from the
 * derived money flow - stuck reasons come from the fulfillment checkpoints,
 * expired-quote and overdue-next-action rules that already power the money
 * lanes. Nothing here is inferred beyond what those rules state.
 */
export function generateRevenueRiskBriefMarkdown(input: RevenueRiskBriefInput): string {
  const flow = buildMoneyFlow({ opportunities: input.opportunities, quotes: input.quotes, today: input.today });

  const lines: string[] = [
    `# Revenue Risk Brief - ${input.periodLabel}`,
    '',
    '> Built from the derived money flow (deal -> quote -> PO -> delivery -> payment). A thread is stuck only when a checkpoint rule says so - nothing is inferred.',
    '',
  ];

  if (flow.threads.length === 0) {
    lines.push('No commercial threads in motion. Capture the next quote or deal to start the money flow.');
    return lines.join('\n').trimEnd();
  }

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

  return lines.join('\n').trimEnd();
}
