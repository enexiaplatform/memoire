import type { FollowUpContext, FollowUpDraft, FollowUpGoal, FollowUpLength, FollowUpTone } from '../../types/v31';

export const followUpGoals: { value: FollowUpGoal; label: string }[] = [
  { value: 'follow_up_after_meeting', label: 'Follow up after meeting' },
  { value: 'address_objection', label: 'Address objection' },
  { value: 'send_requested_information', label: 'Send requested information' },
  { value: 'confirm_next_step', label: 'Confirm next step' },
  { value: 'revive_stale_deal', label: 'Revive stale deal' },
  { value: 'ask_decision_timeline', label: 'Ask for decision timeline' },
];

export const followUpTones: { value: FollowUpTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'consultative', label: 'Consultative' },
  { value: 'concise', label: 'Concise' },
  { value: 'warm', label: 'Warm' },
  { value: 'firm_polite', label: 'Firm but polite' },
];

export const followUpLengths: { value: FollowUpLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'detailed', label: 'Detailed' },
];

export function getMissingFollowUpContext(context: FollowUpContext) {
  const missing: string[] = [];
  if (!context.contactName) missing.push('Contact');
  if (!context.lastInteractionSummary) missing.push('Last interaction');
  if (!context.nextAction) missing.push('Next action');
  if (context.goal === 'address_objection' && (!context.objections || context.objections.length === 0)) {
    missing.push('Objection / concern');
  }
  return missing;
}

export function generateFollowUpDraft(context: FollowUpContext): FollowUpDraft {
  const missingFields = getMissingFollowUpContext(context);
  const contact = context.contactName || 'there';
  const account = context.accountName || 'your team';
  const opportunity = context.opportunityName ? ` regarding ${context.opportunityName}` : '';
  const mainConcern = context.objections?.[0] || context.painPoints?.[0] || '';
  const nextAction = context.nextAction || '';
  const subject = buildSubject(context);
  const lines = buildBodyLines({ context, contact, account, opportunity, mainConcern, nextAction });

  return {
    subject,
    body: lines.join('\n\n'),
    missingFields,
  };
}

function buildSubject(context: FollowUpContext) {
  if (context.goal === 'address_objection') return `Follow-up on ${context.objections?.[0] || 'your concern'}`;
  if (context.goal === 'send_requested_information') return `Information for ${context.accountName}`;
  if (context.goal === 'confirm_next_step') return `Confirming next steps`;
  if (context.goal === 'revive_stale_deal') return `Checking in on ${context.opportunityName || context.accountName}`;
  if (context.goal === 'ask_decision_timeline') return `Decision timeline for ${context.opportunityName || context.accountName}`;
  return `Follow-up after our conversation`;
}

function buildBodyLines({
  context,
  contact,
  account,
  opportunity,
  mainConcern,
  nextAction,
}: {
  context: FollowUpContext;
  contact: string;
  account: string;
  opportunity: string;
  mainConcern: string;
  nextAction: string;
}) {
  const greeting = context.tone === 'warm' ? `Hi ${contact},` : `Hello ${contact},`;
  const lines = [greeting];

  if (context.lastInteractionSummary) {
    lines.push(`Thank you for the recent discussion with ${account}${opportunity}. Based on our last conversation, I understood that ${context.lastInteractionSummary}`);
  } else {
    lines.push(`I wanted to follow up with ${account}${opportunity}.`);
  }

  if (mainConcern) {
    lines.push(`I understand that ${mainConcern} is an important point to clarify.`);
  }

  if (context.painPoints && context.painPoints.length > 0 && context.length !== 'short') {
    lines.push(`I also noted the key priorities around ${context.painPoints.slice(0, 2).join(' and ')}.`);
  }

  lines.push(goalSentence(context, nextAction));

  if (context.length === 'detailed') {
    lines.push('Please let me know if there is anything else you would like me to include before we move to the next step.');
  }

  lines.push(signoff(context.tone));
  return lines;
}

function goalSentence(context: FollowUpContext, nextAction: string) {
  if (context.goal === 'address_objection') {
    return nextAction
      ? `I will follow up with ${nextAction} so we can address this clearly.`
      : 'I would like to address this clearly and agree on the best next step.';
  }
  if (context.goal === 'send_requested_information') {
    return nextAction || 'I will send the requested information for your review.';
  }
  if (context.goal === 'confirm_next_step') {
    return nextAction ? `To confirm, the next step is ${nextAction}.` : 'Could you confirm the best next step from your side?';
  }
  if (context.goal === 'revive_stale_deal') {
    return 'I wanted to check whether this is still a priority and what would be most useful from my side now.';
  }
  if (context.goal === 'ask_decision_timeline') {
    return 'Could you share the decision timeline and any remaining information needed to move forward?';
  }
  return nextAction ? `I will follow up with ${nextAction}.` : 'Please let me know the best next step.';
}

function signoff(tone: FollowUpTone) {
  if (tone === 'concise') return 'Best,';
  if (tone === 'warm') return 'Best regards,';
  if (tone === 'firm_polite') return 'Regards,';
  return 'Best regards,';
}
