import type { PipelineDefenseDeal } from '../data/pipelineDefenseBrief.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import { formatMoneyWithBase } from './money.ts';
import { formatSafeBusinessDate } from './safeDate.ts';

export type PersonalSalesLearningInsightType =
  | 'Recurring loss reason'
  | 'Recurring win signal'
  | 'Evidence gap'
  | 'Objection pattern'
  | 'Forecast overconfidence'
  | 'Win pocket';

export type PersonalSalesLearningInsight = {
  id: string;
  type: PersonalSalesLearningInsightType;
  title: string;
  pattern: string;
  suggestedBehaviorChange: string;
  frequency: number;
  relatedAccounts: string[];
  relatedOpportunities: string[];
  evidence: string[];
};

export type PersonalSalesLearningWarning = {
  opportunityId: string;
  accountName: string;
  opportunityName: string;
  warning: string;
  pattern: string;
  matchedOutcomes: number;
};

export type PersonalSalesLearningAnalysis = {
  totalOutcomes: number;
  hasEnoughData: boolean;
  lowDataMessage: string;
  insights: PersonalSalesLearningInsight[];
  warnings: PersonalSalesLearningWarning[];
  todayNudge: string;
  weeklyBriefSection: {
    heading: 'Personal learning from outcomes';
    recurringPattern: string;
    suggestedBehaviorChange: string;
    dealToApplyItTo: string;
    lowDataMessage?: string;
  };
};

export function analyzePersonalSalesLearning(input: {
  outcomes: OpportunityOutcomeRecord[];
  opportunities?: CrmLiteOpportunity[];
  deals?: PipelineDefenseDeal[];
  limit?: number;
}): PersonalSalesLearningAnalysis {
  const outcomes = [...input.outcomes].sort((left, right) => right.outcomeDate.localeCompare(left.outcomeDate));
  const hasEnoughData = outcomes.length >= 3;
  const lossDelayOutcomes = outcomes.filter((outcome) => ['Lost', 'Delayed', 'No decision'].includes(outcome.outcome));
  const wonOutcomes = outcomes.filter((outcome) => outcome.outcome === 'Won');
  const insights = [
    ...buildReasonInsights(lossDelayOutcomes),
    ...buildWinSignalInsights(wonOutcomes),
    ...buildEvidenceGapInsights(lossDelayOutcomes),
    ...buildObjectionInsights(lossDelayOutcomes),
    ...buildOverconfidenceInsights(lossDelayOutcomes),
    ...buildWinPocketInsights(wonOutcomes),
  ].sort((left, right) => right.frequency - left.frequency || left.title.localeCompare(right.title))
    .slice(0, input.limit || 8);
  const warnings = hasEnoughData
    ? buildLearningWarnings({ insights, outcomes: lossDelayOutcomes, opportunities: input.opportunities || [], deals: input.deals || [] })
    : [];
  const topInsight = insights[0];
  const dealToApplyItTo = warnings[0]
    ? `${warnings[0].accountName} / ${warnings[0].opportunityName}`
    : findActiveDealName(input.opportunities || [], input.deals || []);
  const lowDataMessage = 'Learning will improve after more closed outcomes';

  return {
    totalOutcomes: outcomes.length,
    hasEnoughData,
    lowDataMessage,
    insights,
    warnings,
    todayNudge: warnings.length
      ? `Before review: ${warnings.length} active deal${warnings.length === 1 ? '' : 's'} have the same missing evidence pattern as past delayed/lost deals.`
      : '',
    weeklyBriefSection: {
      heading: 'Personal learning from outcomes',
      recurringPattern: topInsight?.pattern || (outcomes[0] ? formatOutcomeRetro(outcomes[0]) : 'No closed-outcome pattern yet.'),
      suggestedBehaviorChange: topInsight?.suggestedBehaviorChange || lowDataMessage,
      dealToApplyItTo: dealToApplyItTo || 'Capture more outcomes before applying a pattern to a live deal.',
      lowDataMessage: hasEnoughData ? undefined : lowDataMessage,
    },
  };
}

export function getLearningWarningForOpportunity(
  analysis: PersonalSalesLearningAnalysis,
  opportunity: { id?: string; accountName?: string; opportunityName?: string },
) {
  const opportunityId = opportunity.id || '';
  const account = normalize(opportunity.accountName || '');
  const name = normalize(opportunity.opportunityName || '');
  return analysis.warnings.find((warning) => (
    (opportunityId && warning.opportunityId === opportunityId) ||
    (normalize(warning.accountName) === account && normalize(warning.opportunityName) === name)
  ));
}

export function formatOutcomeRetro(outcome: OpportunityOutcomeRecord) {
  const money = typeof outcome.finalAmount === 'number'
    ? formatMoneyWithBase(outcome.finalAmount, outcome.currency)
    : 'final amount not captured';
  return `${outcome.outcome} on ${formatSafeBusinessDate(outcome.outcomeDate)} for ${outcome.accountName} / ${outcome.opportunityName}: ${outcome.reasonCategory}${outcome.reasonText ? ` — ${outcome.reasonText}` : ''}. ${money}.`;
}

function buildReasonInsights(outcomes: OpportunityOutcomeRecord[]): PersonalSalesLearningInsight[] {
  return groupOutcomes(outcomes, (outcome) => outcome.reasonCategory)
    .filter(({ key, items }) => key !== 'Other' && items.length >= 2)
    .map(({ key, items }) => ({
      id: `reason-${slugify(key)}`,
      type: 'Recurring loss reason' as const,
      title: `${key} is repeating in lost/delayed deals`,
      pattern: `${key} appeared in ${items.length} lost/delayed/no-decision outcome${items.length === 1 ? '' : 's'}.`,
      suggestedBehaviorChange: `Add explicit ${key.toLowerCase()} proof before moving similar deals to Defend.`,
      frequency: items.length,
      relatedAccounts: unique(items.map((item) => item.accountName)),
      relatedOpportunities: unique(items.map((item) => item.opportunityName)),
      evidence: items.slice(0, 4).map(formatOutcomeRetro),
    }));
}

function buildWinSignalInsights(outcomes: OpportunityOutcomeRecord[]): PersonalSalesLearningInsight[] {
  return groupOutcomes(outcomes, (outcome) => outcome.reasonCategory)
    .filter(({ key, items }) => key !== 'Other' && items.length >= 2)
    .map(({ key, items }) => ({
      id: `win-signal-${slugify(key)}`,
      type: 'Recurring win signal' as const,
      title: `${key} correlates with wins`,
      pattern: `${key} showed up in ${items.length} won deal${items.length === 1 ? '' : 's'}.`,
      suggestedBehaviorChange: `Look for ${key.toLowerCase()} signal early and capture it as forecast evidence.`,
      frequency: items.length,
      relatedAccounts: unique(items.map((item) => item.accountName)),
      relatedOpportunities: unique(items.map((item) => item.opportunityName)),
      evidence: items.slice(0, 4).map(formatOutcomeRetro),
    }));
}

function buildEvidenceGapInsights(outcomes: OpportunityOutcomeRecord[]): PersonalSalesLearningInsight[] {
  return groupOutcomes(outcomes.filter((item) => Boolean(item.evidenceThatWasMissing)), (outcome) => normalizeLabel(outcome.evidenceThatWasMissing || ''))
    .filter(({ items }) => items.length >= 2)
    .map(({ key, label, items }) => ({
      id: `evidence-gap-${slugify(key)}`,
      type: 'Evidence gap' as const,
      title: `${label} keeps showing up as missing evidence`,
      pattern: `${label} was missing in ${items.length} lost/delayed/no-decision deal${items.length === 1 ? '' : 's'}.`,
      suggestedBehaviorChange: `Capture ${label.toLowerCase()} before treating similar deals as review-ready.`,
      frequency: items.length,
      relatedAccounts: unique(items.map((item) => item.accountName)),
      relatedOpportunities: unique(items.map((item) => item.opportunityName)),
      evidence: items.slice(0, 4).map(formatOutcomeRetro),
    }));
}

function buildObjectionInsights(outcomes: OpportunityOutcomeRecord[]): PersonalSalesLearningInsight[] {
  return groupOutcomes(outcomes.filter((item) => Boolean(item.objectionThatMattered)), (outcome) => normalizeLabel(outcome.objectionThatMattered || ''))
    .filter(({ items }) => items.length >= 2)
    .map(({ key, label, items }) => ({
      id: `objection-${slugify(key)}`,
      type: 'Objection pattern' as const,
      title: `${label} objection mattered repeatedly`,
      pattern: `${label} appeared in ${items.length} lost/delayed/no-decision retro${items.length === 1 ? '' : 's'}.`,
      suggestedBehaviorChange: `Prepare proof for ${label.toLowerCase()} before forecast review.`,
      frequency: items.length,
      relatedAccounts: unique(items.map((item) => item.accountName)),
      relatedOpportunities: unique(items.map((item) => item.opportunityName)),
      evidence: items.slice(0, 4).map(formatOutcomeRetro),
    }));
}

function buildOverconfidenceInsights(outcomes: OpportunityOutcomeRecord[]): PersonalSalesLearningInsight[] {
  const overconfident = outcomes.filter((outcome) => (
    outcome.forecastEvidenceCategoryBeforeOutcome === 'Defensible' ||
    outcome.decisionRecommendationBeforeOutcome === 'Defend'
  ));
  if (overconfident.length === 0) return [];
  return [{
    id: 'forecast-overconfidence-defend',
    type: 'Forecast overconfidence',
    title: 'Some defended deals later slipped or lost',
    pattern: `${overconfident.length} deal${overconfident.length === 1 ? '' : 's'} marked Defend/Defensible later became lost, delayed, or no-decision.`,
    suggestedBehaviorChange: 'Before defending, check whether the next action is customer-confirmed and whether decision path evidence exists.',
    frequency: overconfident.length,
    relatedAccounts: unique(overconfident.map((item) => item.accountName)),
    relatedOpportunities: unique(overconfident.map((item) => item.opportunityName)),
    evidence: overconfident.slice(0, 4).map(formatOutcomeRetro),
  }];
}

function buildWinPocketInsights(outcomes: OpportunityOutcomeRecord[]): PersonalSalesLearningInsight[] {
  const groups = groupOutcomes(outcomes, (outcome) => outcome.stageBeforeOutcome);
  return groups
    .filter(({ items }) => items.length >= 2)
    .map(({ key, items }) => ({
      id: `win-pocket-${slugify(key)}`,
      type: 'Win pocket' as const,
      title: `Wins are clustering from ${key}`,
      pattern: `${items.length} won deal${items.length === 1 ? '' : 's'} had pre-outcome stage ${key}.`,
      suggestedBehaviorChange: `Compare active ${key.toLowerCase()} deals against the evidence that supported these wins.`,
      frequency: items.length,
      relatedAccounts: unique(items.map((item) => item.accountName)),
      relatedOpportunities: unique(items.map((item) => item.opportunityName)),
      evidence: items.slice(0, 4).map(formatOutcomeRetro),
    }));
}

function buildLearningWarnings(input: {
  insights: PersonalSalesLearningInsight[];
  outcomes: OpportunityOutcomeRecord[];
  opportunities: CrmLiteOpportunity[];
  deals: PipelineDefenseDeal[];
}): PersonalSalesLearningWarning[] {
  const riskInsights = input.insights.filter((insight) => (
    insight.type === 'Evidence gap' ||
    insight.type === 'Objection pattern' ||
    insight.type === 'Recurring loss reason' ||
    insight.type === 'Forecast overconfidence'
  ));

  const opportunityWarnings = input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .map((opportunity) => {
      const text = normalize([
        opportunity.accountName,
        opportunity.opportunityName,
        opportunity.productOrSolution,
        opportunity.procurementPath,
        opportunity.technicalCriteria,
        opportunity.missingContext,
        opportunity.objectionDebt,
        opportunity.nextAction,
        opportunity.evidence,
        opportunity.forecastEvidenceCategory,
        opportunity.decisionRecommendation,
      ].join(' '));
      const matched = riskInsights.find((insight) => textMatchesInsight(text, insight));
      if (!matched) return null;
      return {
        opportunityId: opportunity.id,
        accountName: opportunity.accountName || 'Needs confirmation',
        opportunityName: opportunity.opportunityName || 'Needs confirmation',
        warning: `This deal resembles ${matched.frequency} past lost/delayed/no-decision deal${matched.frequency === 1 ? '' : 's'} because ${matched.pattern.toLowerCase()} Pattern observed — treat this as a risk signal, not a prediction.`,
        pattern: matched.title,
        matchedOutcomes: matched.frequency,
      };
    })
    .filter((warning): warning is PersonalSalesLearningWarning => Boolean(warning));

  const dealWarnings = input.deals.map((deal) => {
    const text = normalize([
      deal.account,
      deal.opportunity,
      deal.pipelineContext,
      deal.dealTruth,
      deal.riskType.join(' '),
      deal.missingContext.join(' '),
      deal.objectionDebt.objection,
      deal.objectionDebt.requiredAction,
      deal.recommendedAction,
    ].join(' '));
    const matched = riskInsights.find((insight) => textMatchesInsight(text, insight));
    if (!matched) return null;
    return {
      opportunityId: deal.sourceOpportunityId || deal.id,
      accountName: deal.account || 'Needs confirmation',
      opportunityName: deal.opportunity || 'Needs confirmation',
      warning: `This deal resembles ${matched.frequency} past lost/delayed/no-decision deal${matched.frequency === 1 ? '' : 's'} because ${matched.pattern.toLowerCase()} Pattern observed — treat this as a risk signal, not a prediction.`,
      pattern: matched.title,
      matchedOutcomes: matched.frequency,
    };
  }).filter((warning): warning is PersonalSalesLearningWarning => Boolean(warning));

  const seen = new Set<string>();
  return [...opportunityWarnings, ...dealWarnings].filter((warning) => {
    const key = `${normalize(warning.accountName)}|${normalize(warning.opportunityName)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textMatchesInsight(text: string, insight: PersonalSalesLearningInsight) {
  const candidates = [
    insight.title,
    insight.pattern,
    ...insight.relatedAccounts,
    ...insight.relatedOpportunities,
  ]
    .flatMap((value) => normalize(value).split(' '))
    .filter((token) => token.length >= 5 && !['deals', 'deal', 'past', 'lost', 'delayed', 'appeared', 'missing', 'showing', 'forecast'].includes(token));
  return unique(candidates).some((token) => text.includes(token));
}

function groupOutcomes(outcomes: OpportunityOutcomeRecord[], getKey: (outcome: OpportunityOutcomeRecord) => string) {
  const groups = new Map<string, OpportunityOutcomeRecord[]>();
  const labels = new Map<string, string>();
  outcomes.forEach((outcome) => {
    const label = getKey(outcome).trim();
    const key = normalize(label);
    if (!key) return;
    groups.set(key, [...(groups.get(key) || []), outcome]);
    labels.set(key, label);
  });
  return Array.from(groups.entries()).map(([key, items]) => ({ key, label: labels.get(key) || key, items }));
}

function findActiveDealName(opportunities: CrmLiteOpportunity[], deals: PipelineDefenseDeal[]) {
  const opportunity = opportunities.find((item) => item.status === 'Active');
  if (opportunity) return `${opportunity.accountName || 'Needs confirmation'} / ${opportunity.opportunityName || 'Needs confirmation'}`;
  const deal = deals[0];
  if (deal) return `${deal.account || 'Needs confirmation'} / ${deal.opportunity || 'Needs confirmation'}`;
  return '';
}

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugify(value: string) {
  return normalize(value).replace(/\s+/g, '-').slice(0, 60) || 'pattern';
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
