import {
  forecastEvidenceDefinitions,
  managerQuestions,
  missingContextLabels,
  type PipelineDefenseDeal,
} from '../data/pipelineDefenseBrief';

export type PipelineDefenseBriefSummary = {
  dealsReviewed: number;
  atRiskDeals: number;
  highestRiskDeal: PipelineDefenseDeal | null;
  commonMissingContext: { label: string; count: number } | null;
  topRecommendedAction: PipelineDefenseDeal | null;
};

export type PipelineDefenseBriefMarkdownInput = {
  deals: PipelineDefenseDeal[];
  summary: PipelineDefenseBriefSummary;
  salesOwner: string;
  scope: string;
  weekLabel: string;
  pipelinePeriod: string;
};

export function generatePipelineDefenseBriefMarkdown({
  deals,
  summary,
  salesOwner,
  scope,
  weekLabel,
  pipelinePeriod,
}: PipelineDefenseBriefMarkdownInput) {
  const lines: string[] = [
    '# Pipeline Review Defense Brief',
    '',
    '## Brief Header',
    `- Week / date: ${valueOrDash(weekLabel)}`,
    `- Sales owner: ${valueOrDash(salesOwner)}`,
    `- Scope: ${valueOrDash(scope)}`,
    `- Pipeline period: ${valueOrDash(pipelinePeriod)}`,
    '',
    '## Executive Summary',
    `- Deals reviewed: ${summary.dealsReviewed}`,
    `- At-risk deals: ${summary.atRiskDeals}`,
    `- Highest-risk deal: ${formatDealName(summary.highestRiskDeal)}`,
    `- Most common missing context: ${summary.commonMissingContext ? `${summary.commonMissingContext.label} (${summary.commonMissingContext.count} deals)` : 'None'}`,
    `- Top recommended action: ${summary.topRecommendedAction?.recommendedAction || 'None'}`,
    '',
    '## Top At-Risk Deals',
    '',
  ];

  if (deals.length === 0) {
    lines.push('No pipeline deals available for this review.', '');
  } else {
    for (const deal of deals) {
      lines.push(
        `### ${deal.account || 'Unknown Account'} / ${deal.opportunity || 'Unknown Opportunity'}`,
        `- Pipeline context: ${valueOrDash(deal.pipelineContext)}`,
        `- Deal truth: ${valueOrDash(deal.dealTruth)}`,
        '- Risk type:',
        ...formatList(deal.riskType, '  - '),
        '- Evidence:',
        ...formatList(deal.evidence, '  - '),
        '- Missing context:',
        ...formatList(deal.missingContext, '  - '),
        '- Objection debt:',
        `  - Objection: ${valueOrDash(deal.objectionDebt.objection)}`,
        `  - Evidence: ${valueOrDash(deal.objectionDebt.evidence)}`,
        `  - Required proof/action: ${valueOrDash(deal.objectionDebt.requiredAction)}`,
        `  - Owner: ${valueOrDash(deal.objectionDebt.owner)}`,
        `  - Status: ${valueOrDash(deal.objectionDebt.status)}`,
        `- Forecast evidence category: ${deal.forecastEvidenceCategory}`,
        `- Recommended action: ${valueOrDash(deal.recommendedAction)}`,
        `- Pipeline review answer: ${valueOrDash(deal.pipelineReviewAnswer)}`,
        `- Decision recommendation: ${deal.decisionRecommendation}`,
      );

      if (deal.assumption) {
        lines.push(`- Assumption: ${deal.assumption}`);
      }

      lines.push('');
    }
  }

  lines.push(
    '## Missing Context Radar',
    '',
    ...buildMissingContextRadar(deals),
    '',
    '## Objection Debt',
    '',
  );

  if (deals.length === 0) {
    lines.push('No objection debt available because no deals are in this review.', '');
  } else {
    for (const deal of deals) {
      lines.push(
        `### ${deal.account || 'Unknown Account'}`,
        `- Objection: ${valueOrDash(deal.objectionDebt.objection)}`,
        `- Evidence: ${valueOrDash(deal.objectionDebt.evidence)}`,
        `- Required proof/action: ${valueOrDash(deal.objectionDebt.requiredAction)}`,
        `- Owner: ${valueOrDash(deal.objectionDebt.owner)}`,
        `- Status: ${valueOrDash(deal.objectionDebt.status)}`,
        '',
      );
    }
  }

  lines.push(
    '## Forecast Evidence',
    '',
    ...forecastEvidenceDefinitions.map((item) => `- ${item.category}: ${item.description}`),
    '',
    '## Manager Question List',
    '',
    ...managerQuestions.map((item) => `- ${item.question}`),
    '',
    '## Recommended Actions This Week',
    '',
  );

  if (deals.length === 0) {
    lines.push('No recommended actions because no deals are in this review.', '');
  } else {
    for (const deal of deals) {
      lines.push(
        `### ${deal.decisionRecommendation}: ${deal.account || 'Unknown Account'}`,
        `- Opportunity: ${deal.opportunity || 'Unknown Opportunity'}`,
        `- Action: ${valueOrDash(deal.recommendedAction)}`,
        `- Why this week: ${valueOrDash(deal.pipelineReviewAnswer)}`,
        '',
      );
    }
  }

  lines.push('## Decision Log', '');

  if (deals.length === 0) {
    lines.push('No decision log entries because no deals are in this review.', '');
  } else {
    lines.push('| Account | Opportunity | Decision recommendation | Reason | Next action |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const deal of deals) {
      lines.push(`| ${escapeTable(deal.account)} | ${escapeTable(deal.opportunity)} | ${escapeTable(deal.decisionRecommendation)} | ${escapeTable(deal.pipelineReviewAnswer)} | ${escapeTable(deal.recommendedAction)} |`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function buildMissingContextRadar(deals: PipelineDefenseDeal[]) {
  if (deals.length === 0) {
    return ['No missing context radar because no deals are in this review.'];
  }

  return missingContextLabels.map((label) => {
    const affectedDeals = deals.filter((deal) => deal.missingContext.some((context) => normalizeMissingContext(context) === label));
    const accountList = affectedDeals.length > 0 ? affectedDeals.map((deal) => deal.account || 'Unknown Account').join(', ') : 'None';
    return `- ${label}: ${affectedDeals.length} deals affected${affectedDeals.length > 0 ? ` (${accountList})` : ''}`;
  });
}

function formatDealName(deal: PipelineDefenseDeal | null) {
  if (!deal) return 'None';
  return `${deal.account || 'Unknown Account'} / ${deal.opportunity || 'Unknown Opportunity'}`;
}

function formatList(items: string[], prefix: string) {
  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return [`${prefix}None`];
  return visibleItems.map((item) => `${prefix}${item}`);
}

function valueOrDash(value?: string) {
  return value && value.trim().length > 0 ? value : '-';
}

function escapeTable(value?: string) {
  return valueOrDash(value).replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function normalizeMissingContext(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes('decision maker') || lower.includes('decision owner') || lower.includes('active decision')) return 'Decision maker';
  if (lower.includes('decision timeline') || lower.includes('timing')) return 'Decision timeline';
  if (lower.includes('procurement')) return 'Procurement path';
  if (lower.includes('next communication')) return 'Next communication date';
  if (lower.includes('evaluation criteria') || lower.includes('technical')) return 'Technical evaluation criteria';
  if (lower.includes('budget')) return 'Budget owner';
  return value;
}

