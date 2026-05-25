import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { CrmLiteOpportunity, OpportunityFormInput } from '../services/opportunityStore';
import { opportunityToFormInput } from '../services/opportunityStore';

export type LinkConfidence = 'High' | 'Medium' | 'Low';

export type OpportunityLinkSuggestion = {
  opportunity: CrmLiteOpportunity;
  confidence: LinkConfidence;
  reason: string;
};

export type OpportunityUpdateSuggestion = {
  nextAction?: string;
  nextActionDate?: string;
  objectionDebt?: string;
  evidence?: string;
  procurementPath?: string;
  missingContext?: string;
  reasons: string[];
};

const objectionTerms = /objection|concern|risk|lead time|blocker|hesitat|issue|unresolved|not convinced|lan tan/i;
const evidenceTerms = /evidence|proof|confirmed|proof local|commit|agreed|approved|budget approval|budget approved/i;
const procurementTerms = /procurement|tender|rfq|po|purchase|buying|buyer|quote|quotation/i;
const genericOpportunityTokens = new Set([
  'phase',
  'project',
  'opportunity',
  'workflow',
  'discussion',
  'deal',
  'with',
  'for',
  'the',
  'and',
  'next',
  'gmp',
  'eugmp',
]);

export function suggestOpportunityLinks(
  activity: SalesActivityRecord,
  opportunities: CrmLiteOpportunity[]
): OpportunityLinkSuggestion[] {
  return opportunities
    .map((opportunity) => ({
      opportunity,
      ...calculateLinkConfidence(activity, opportunity),
    }))
    .filter((suggestion) => suggestion.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ opportunity, confidence, reason }) => ({ opportunity, confidence, reason }));
}

export function calculateLinkConfidence(activity: SalesActivityRecord, opportunity: CrmLiteOpportunity): {
  confidence: LinkConfidence;
  reason: string;
  score: number;
} {
  const haystack = normalize([
    activity.rawNote,
    activity.summary,
    activity.accountName,
    activity.opportunityName,
    activity.linkedAccountName,
    activity.linkedOpportunityName,
    activity.contactName,
    activity.stakeholderName,
    activity.buyingSignals?.join(' '),
    activity.timelineSignals?.join(' '),
    activity.tags.join(' '),
  ].join(' '));
  const activityAccount = normalize(activity.accountName);
  const activityOpportunity = normalize(activity.opportunityName);
  const opportunityAccount = normalize(opportunity.accountName);
  const opportunityName = normalize(opportunity.opportunityName);
  const product = normalize(opportunity.productOrSolution);
  const activityTokens = meaningfulTokens([activity.rawNote, activity.summary, activity.opportunityName].join(' '));
  const opportunityTokens = meaningfulTokens([opportunity.opportunityName, opportunity.productOrSolution].join(' '));
  const overlapCount = countTokenOverlap(activityTokens, opportunityTokens);
  const reasons: string[] = [];
  let score = 0;

  if (activityAccount && opportunityAccount && activityAccount === opportunityAccount) {
    score += 5;
    reasons.push('account exact match');
  } else if (hasPartialMatch(activityAccount, opportunityAccount)) {
    score += 3;
    reasons.push('account partial match');
  }

  if (activityOpportunity && opportunityName && activityOpportunity === opportunityName) {
    score += 5;
    reasons.push('opportunity exact match');
  } else if (hasPartialMatch(activityOpportunity, opportunityName)) {
    score += 3;
    reasons.push('opportunity partial match');
  }

  if (opportunityAccount && haystack.includes(opportunityAccount)) {
    score += 3;
    reasons.push('note mentions account');
  }

  if (opportunityName && haystack.includes(opportunityName)) {
    score += 3;
    reasons.push('note mentions opportunity');
  }

  if (product && hasTokenOverlap(haystack, product)) {
    score += 2;
    reasons.push('product or solution overlap');
  }

  if (overlapCount >= 2) {
    score += overlapCount >= 3 ? 4 : 3;
    reasons.push('meaningful opportunity token overlap');
  } else if (overlapCount === 1 && (score > 0 || hasAccountSignal(activity, opportunity))) {
    score += 2;
    reasons.push('product/opportunity token overlap');
  }

  if (hasCommonPhraseSuffix(activityOpportunity, opportunityName)) {
    score += 2;
    reasons.push('common opportunity phrase');
  }

  const confidence: LinkConfidence = score >= 7 ? 'High' : score >= 3 ? 'Medium' : 'Low';
  return {
    confidence,
    reason: reasons.length > 0 ? reasons.join(', ') : 'weak text similarity',
    score,
  };
}

export function buildOpportunityUpdateSuggestion(
  activity: SalesActivityRecord,
  opportunity: CrmLiteOpportunity
): OpportunityUpdateSuggestion {
  const text = `${activity.rawNote} ${activity.summary} ${activity.activityType}`.trim();
  const suggestion: OpportunityUpdateSuggestion = { reasons: [] };

  if (activity.nextAction && activity.nextAction !== opportunity.nextAction) {
    suggestion.nextAction = activity.nextAction;
    suggestion.reasons.push('activity captured a next action');
  }

  if (activity.dueDate && activity.dueDate !== opportunity.nextActionDate) {
    suggestion.nextActionDate = activity.dueDate;
    suggestion.reasons.push('activity captured a due date');
  }

  if (activity.activityType === 'Objection handling' || objectionTerms.test(text) || (activity.risks?.length || 0) > 0) {
    suggestion.objectionDebt = appendUnique(opportunity.objectionDebt, activity.risks?.join('; ') || activity.summary);
    suggestion.reasons.push('activity appears to include objection or risk context');
  }

  if (evidenceTerms.test(text) || (activity.buyingSignals?.length || 0) > 0) {
    suggestion.evidence = appendUnique(opportunity.evidence, activity.buyingSignals?.join('; ') || activity.summary);
    suggestion.reasons.push('activity appears to include proof, buying signal, or confirmed evidence');
  }

  if (activity.activityType === 'Tender / procurement' || procurementTerms.test(text)) {
    suggestion.procurementPath = appendUnique(opportunity.procurementPath, activity.summary);
    suggestion.missingContext = appendUnique(opportunity.missingContext, 'Confirm procurement path, owner, and timing.');
    suggestion.reasons.push('activity appears to include procurement or tender context');
  }

  return suggestion;
}

export function applyOpportunityUpdateSuggestion(
  opportunity: CrmLiteOpportunity,
  suggestion: OpportunityUpdateSuggestion
): OpportunityFormInput {
  return {
    ...opportunityToFormInput(opportunity),
    nextAction: suggestion.nextAction ?? opportunity.nextAction,
    nextActionDate: suggestion.nextActionDate ?? opportunity.nextActionDate,
    objectionDebt: suggestion.objectionDebt ?? opportunity.objectionDebt,
    evidence: suggestion.evidence ?? opportunity.evidence,
    procurementPath: suggestion.procurementPath ?? opportunity.procurementPath,
    missingContext: suggestion.missingContext ?? opportunity.missingContext,
  };
}

function hasPartialMatch(left: string, right: string) {
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function hasTokenOverlap(left: string, right: string) {
  const rightTokens = meaningfulTokens(right);
  return rightTokens.some((token) => left.includes(token));
}

function countTokenOverlap(leftTokens: string[], rightTokens: string[]) {
  const left = new Set(leftTokens);
  return rightTokens.filter((token) => left.has(token)).length;
}

function meaningfulTokens(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !genericOpportunityTokens.has(token));
}

function hasAccountSignal(activity: SalesActivityRecord, opportunity: CrmLiteOpportunity) {
  const activityAccount = normalize(activity.accountName || activity.linkedAccountName || '');
  const opportunityAccount = normalize(opportunity.accountName);
  const haystack = normalize(`${activity.rawNote} ${activity.summary}`);
  return Boolean(activityAccount && opportunityAccount && hasPartialMatch(activityAccount, opportunityAccount))
    || Boolean(opportunityAccount && haystack.includes(opportunityAccount));
}

function hasCommonPhraseSuffix(left: string, right: string) {
  if (!left || !right) return false;
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);
  if (leftTokens.length < 2 || rightTokens.length < 2) return false;
  return leftTokens.slice(-2).join(' ') === rightTokens.slice(-2).join(' ');
}

function appendUnique(current: string, addition: string) {
  const cleanAddition = addition.trim();
  if (!cleanAddition) return current;
  if (normalize(current).includes(normalize(cleanAddition))) return current;
  return [current.trim(), cleanAddition].filter(Boolean).join('\n');
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
