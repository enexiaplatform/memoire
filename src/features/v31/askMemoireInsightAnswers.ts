import type { AskMemoireAnswer } from '../../types/v31';
import type { SalesActivityRecord } from '../../services/salesActivityStore.ts';
import { followUpImpactStatusLabel, type FollowUpImpactSummary } from '../../utils/followUpImpact.ts';
import { formatObjectionResolutionRate, type ObjectionPlaybook } from '../../utils/objectionPlaybook.ts';
import { formatWinRate, type ForecastCalibration } from '../../utils/forecastCalibration.ts';
import type { CrmLiteOpportunity } from '../../services/opportunityStore.ts';
import { classifyBusinessDomain, type BusinessDomain } from '../../utils/businessDomain.ts';
import { type MoneyFlow } from '../../utils/moneyFlow.ts';
import { type OrderBook } from '../../utils/orderToCash.ts';
import { type RetentionSignal, RETENTION_QUIET_DAYS } from '../../utils/retentionSignals.ts';
import { type CommitmentItem } from '../../utils/weeklyBusinessReview.ts';
import { type CommercialJourneySnapshot, formatJourneyCommitment } from '../../utils/commercialJourney.ts';
import { type InitiativeReview } from '../../utils/initiativeReview.ts';
import { initiativeDecisionLabel } from '../../utils/initiativeExperiment.ts';
import { type SignalDigest } from '../../utils/customerSignals.ts';
import { formatBaseCurrencyAmount, formatCurrencyAmount } from '../../utils/money.ts';
import { formatSafeBusinessDate, isValidBusinessDate, todayDateKey } from '../../utils/safeDate.ts';
import { type OwnObligationsModel } from '../../utils/ownObligations.ts';
import { normalizeEntityName } from '../../utils/accountIdentity.ts';

export type InsightQuestionKind =
  | 'follow_up_impact'
  | 'objection_playbook'
  | 'forecast_calibration'
  | 'money_state'
  | 'week_recap'
  | 'retention_check'
  | 'commitments'
  | 'awaiting_customer'
  | 'own_obligations'
  | 'customer_signals'
  | 'initiative_review'
  | 'deal_position';

/**
 * Deterministic questions about the seller's own history are answered from
 * the computed data layers directly - no AI endpoint needed, no hallucination
 * possible. Detection is deliberately narrow: anything ambiguous falls
 * through to the normal answer path.
 */
export function detectInsightQuestion(question: string): InsightQuestionKind | null {
  const normalized = question.toLowerCase();
  if (/saved from silence|back in motion|reviv\w*|follow.?ups?\s+(work|help|impact|pay|revive|rescue)|did my follow.?up/.test(normalized)) {
    return 'follow_up_impact';
  }
  if (/objection/.test(normalized) && /\b(work(s|ed)?|handled?|beat|overcome|respond(ed)?|resolved?|answer(ed)?)\b/.test(normalized)) {
    return 'objection_playbook';
  }
  if (/win rate|calibrat|how often do i win|defensible.*\b(win|hold)|\b(accurate|accuracy|trust\w*)\b.*forecast|forecast.*\b(accurate|accuracy|trust\w*)\b/.test(normalized)) {
    return 'forecast_calibration';
  }
  if (/where.*\b(money|cash)\b|\bmoney\b.*(sit|stuck|waiting|stand)|what am i owed|outstanding (invoice|payment)/.test(normalized)) {
    return 'money_state';
  }
  if (/what happened (this|last) week|recap (of )?(this|last|my) week|(this|last) week.*(recap|summary|review)\b|week in review/.test(normalized)) {
    return 'week_recap';
  }
  if (/\bretention\b|check back with|keep warm|(customers?|clients?|accounts?)\b.*\b(check back|revisit|reconnect|going (quiet|cold))|paid\b.*\b(gone|going|went) (quiet|cold)/.test(normalized)) {
    return 'retention_check';
  }
  if (/did i keep (my )?(promises?|commitments?|word)|(promises?|commitments?)\b.*\b(kept|missed|due|overdue|outstanding|slipped|status)|\b(kept|missed) (promises?|commitments?)|commitments? this week/.test(normalized)) {
    return 'commitments';
  }
  // Both of these were printed in the page's own "What this can answer" panel
  // and matched nothing, so they fell through to the generic memory answer.
  // Checked before customer_signals so "waiting for from customers" is not
  // swallowed by the signals matcher, which also looks for "customers".
  if (/waiting (on|for)\b.*\b(customers?|clients?|them|buyers?)|what am i waiting|(customers?|clients?|they)\b.*\bowe me|chase(d|s)? (up )?(for )?(payment|decision)/.test(normalized)) {
    return 'awaiting_customer';
  }
  if (/what do i owe|what i owe|do i owe (today|this week|anyone)|my (own )?obligations?|\b(bills?|payments?|deliveries)\b.*\bi owe\b|owe (today|this week)/.test(normalized)) {
    return 'own_obligations';
  }
  // Customer signals: what buyers are telling the seller (buying signals,
  // risks, timeline, competitors). Checked after retention so "check back
  // with" keeps its own answer.
  if (/customers?\b.*\b(telling|saying|said|signal|signals)|what.*\bsignals?\b|buying signals?|customer signals?/.test(normalized)) {
    return 'customer_signals';
  }
  // Initiatives/experiments: checked before deal_position so "how is the
  // experiment going" is not swallowed by the generic "how is ... going".
  if (/\b(initiative|experiment|bet|play)s?\b.*(going|doing|stalled|revisit|stop|adjust|continue|drop|work|worth|progress|status|learn)|(which|what|how|any)\b.*\b(initiative|experiment)s?\b/.test(normalized)) {
    return 'initiative_review';
  }
  // Deal position asks where a named (or scoped) deal stands. Checked after
  // money_state so "where is the money" keeps the money answer; resolution
  // failure falls through to the normal path, so loose detection is safe.
  if (/where (do|does)\b.*\bstand|where do we stand|status of (the |my |this )?.*\bdeal|how('s| is| are)\b.*\bdeal\b.*(go|going|progress|doing|stand)|where (is|are)\b.*\bdeal\b/.test(normalized)) {
    return 'deal_position';
  }
  return null;
}

/**
 * Resolve which deal a position question is about: the scoped opportunity
 * wins, otherwise match the deal whose opportunity or account name appears
 * in the question. Returns null when nothing resolves, so the caller can
 * fall through instead of answering about the wrong deal.
 */
export function resolveDealForQuestion(
  question: string,
  opportunities: CrmLiteOpportunity[],
  selectedOpportunityId?: string,
): CrmLiteOpportunity | null {
  if (selectedOpportunityId) {
    const scoped = opportunities.find((opportunity) => opportunity.id === selectedOpportunityId);
    if (scoped) return scoped;
  }
  // The question goes through the same fold as the names it is searched for.
  // Normalising only the names would be worse than normalising neither: a folded
  // "cong ty duoc pham" cannot be found inside a raw-lowercased question that
  // still carries its accents.
  const normalized = normalizeEntityName(question);
  const candidates = opportunities
    .map((opportunity) => {
      const oppName = normalizeEntityName(opportunity.opportunityName || '');
      const accName = normalizeEntityName(opportunity.accountName || '');
      let score = 0;
      // Opportunity names are more specific than account names, so they win.
      if (oppName.length >= 3 && normalized.includes(oppName)) score = Math.max(score, oppName.length + 1000);
      if (accName.length >= 3 && normalized.includes(accName)) score = Math.max(score, accName.length);
      if (score > 0 && opportunity.status === 'Active') score += 1;
      return { opportunity, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.opportunity || null;
}

export function answerFromDealPosition(snapshot: CommercialJourneySnapshot, opportunity: CrmLiteOpportunity): AskMemoireAnswer {
  const name = [opportunity.accountName, opportunity.opportunityName].filter(Boolean).join(' / ') || 'This deal';
  const sentence = [
    `${name} is at ${snapshot.position}${snapshot.positionSource === 'money-flow' ? ' (from the money flow)' : ''}.`,
    `Money: ${snapshot.moneyStatus}.`,
    `Risk: ${snapshot.riskStatus}.`,
    snapshot.blocker ? `Blocker: ${snapshot.blocker}.` : '',
    snapshot.lastTouch ? `Last touch ${formatSafeBusinessDate(snapshot.lastTouch.date)}.` : 'No touch captured yet.',
  ].filter(Boolean).join(' ');

  return {
    answer: sentence,
    contextUsed: ['Commercial journey (stage, money flow, captured touches, objections)'],
    missingContext: snapshot.evidence ? [] : ['Evidence for this deal'],
    suggestedNextAction: snapshot.nextCommitment
      ? formatJourneyCommitment(snapshot.nextCommitment)
      : snapshot.riskStatus !== 'No active risk signal'
        ? 'Book the next touch to protect this deal.'
        : 'Keep the next step dated so the deal stays on track.',
    suggestedQuestions: ['Where is the money?', 'Which deals may go silent?'],
    cards: [{
      kind: 'insight',
      title: `Where ${name} stands`,
      fields: [
        { label: 'Position', value: `${snapshot.position}${snapshot.positionSource === 'money-flow' ? ' (money flow)' : ' (sales stage)'}` },
        { label: 'Money', value: snapshot.moneyStatus, tone: snapshot.moneyStatus.includes('stuck') ? 'warning' : 'default' },
        { label: 'Risk', value: snapshot.riskStatus, tone: snapshot.riskStatus === 'No active risk signal' ? 'good' : 'warning' },
        { label: 'Blocker', value: snapshot.blocker || 'None open' },
        { label: 'Next commitment', value: formatJourneyCommitment(snapshot.nextCommitment) },
        { label: 'Last touch', value: snapshot.lastTouch ? `${formatSafeBusinessDate(snapshot.lastTouch.date)} - ${snapshot.lastTouch.summary}` : 'None captured' },
        { label: 'Evidence', value: snapshot.evidence || 'Not captured yet' },
      ],
      ctas: [
        { label: 'Open Pipeline Defense', href: '/app/pipeline-defense' },
        { label: 'Open Activity Ledger', href: '/app/timeline?view=history' },
      ],
    }],
  };
}

/**
 * "Where is the money?" - both pools of it.
 *
 * `buildMoneyFlow` covers deals and quotes and stops at Paid, so this answered
 * a six-month book with "3.6M EUR is in motion" and never mentioned the 429.5K
 * EUR of committed orders sitting uncollected, the oldest waiting a hundred and
 * seventy-one days. That is the money the operator can actually do something
 * about today, and it was missing from the answer to the question that asks for
 * it by name. Pipeline is money you might get; the order book is money you are
 * owed, and they are not the same answer.
 *
 * `orderBook` is optional so a caller that has not built one behaves as before.
 */
export function answerFromMoneyFlow(moneyFlow: MoneyFlow, orderBook?: OrderBook): AskMemoireAnswer {
  const awaitingBase = orderBook?.awaitingBase ?? 0;
  const owedSentence = awaitingBase > 0
    ? ` ${formatBaseCurrencyAmount(awaitingBase, true)} is already committed and not yet collected${orderBook?.stalledCount ? `, ${orderBook.stalledCount} of those orders not moved in a month` : ''}.`
    : '';

  if (moneyFlow.threads.length === 0) {
    // Nothing in the pipeline is not the same as no money anywhere. A book that
    // has won everything it is working on still has money to collect, and
    // "no commercial threads are in motion" reads as "you have nothing".
    if (awaitingBase > 0) {
      return {
        answer: `Nothing is open in the pipeline right now.${owedSentence}`,
        contextUsed: ['Money flow (deals, quotes, POs, deliveries, payments)', 'Order book'],
        missingContext: ['Open opportunities or quotes'],
        suggestedNextAction: 'Chase what is already owed, then capture the next opportunity.',
        suggestedQuestions: ['What should I do first today?', 'What happened this week?'],
        cards: [{
          kind: 'insight',
          title: 'Where the money sits',
          fields: [{ label: 'Committed, not collected', value: formatBaseCurrencyAmount(awaitingBase, true), tone: 'warning' }],
          ctas: [{ label: 'Open Cash collection', href: '/app/cash-collection', note: 'What each customer still owes lives there.' }],
        }],
      };
    }
    return {
      answer: 'No commercial threads are in motion - no open deals, quotes, POs, deliveries, or payments. Capture the next quote or opportunity and the money flow starts here.',
      contextUsed: ['Money flow (deals, quotes, POs, deliveries, payments)'],
      missingContext: ['Open opportunities or quotes'],
      suggestedNextAction: 'Capture the next commercial step.',
      suggestedQuestions: ['What should I do first today?', 'What happened this week?'],
    };
  }

  const activeLanes = moneyFlow.lanes.filter((lane) => lane.threads > 0 && lane.stage !== 'Paid');
  const laneSummary = activeLanes
    .map((lane) => `${lane.stage}: ${lane.threads} (${formatBaseCurrencyAmount(lane.totalBase, true)})`)
    .join('; ');
  const stuck = moneyFlow.stuckThreads;

  return {
    answer: `${formatBaseCurrencyAmount(moneyFlow.totalInMotionBase, true)} is in motion across ${laneSummary || 'no active lanes'}. ${stuck.length > 0
      ? `${stuck.length} ${stuck.length === 1 ? 'thread is' : 'threads are'} stuck: ${stuck.slice(0, 3).map((thread) => `${thread.accountName} (${thread.stuckReason})`).join('; ')}.`
      // "Nothing is stuck" is about pipeline threads. Said flatly, one sentence
      // before "1 of those orders not moved in a month", it contradicts its own
      // paragraph - so it says which nothing it means.
      : orderBook?.stalledCount ? 'Nothing in the pipeline is stuck.' : 'Nothing is stuck right now.'}${owedSentence}`,
    contextUsed: awaitingBase > 0
      ? ['Money flow (deals, quotes, POs, deliveries, payments)', 'Order book']
      : ['Money flow (deals, quotes, POs, deliveries, payments)'],
    missingContext: [],
    suggestedNextAction: stuck[0] ? `${stuck[0].nextAction} (${stuck[0].accountName})` : 'Keep the next commercial steps dated.',
    suggestedQuestions: ['Which customers should I check back with?', 'Which deals may go silent?'],
    cards: [{
      kind: 'insight',
      title: 'Where the money sits',
      fields: [
        { label: 'In motion', value: formatBaseCurrencyAmount(moneyFlow.totalInMotionBase, true), tone: 'good' },
        ...(awaitingBase > 0
          ? [{
            label: 'Committed, not collected',
            value: `${formatBaseCurrencyAmount(awaitingBase, true)}${orderBook?.stalledCount ? ` - ${orderBook.stalledCount} stalled` : ''}`,
            tone: 'warning' as const,
          }]
          : []),
        ...activeLanes.map((lane) => ({
          label: lane.stage,
          value: `${lane.threads} ${lane.threads === 1 ? 'thread' : 'threads'} - ${formatBaseCurrencyAmount(lane.totalBase, true)}${lane.stuckThreads > 0 ? ` (${lane.stuckThreads} stuck)` : ''}`,
          tone: lane.stuckThreads > 0 ? 'warning' as const : 'default' as const,
        })),
        ...(stuck.length > 0
          ? [{
            label: 'Stuck money first',
            value: stuck.slice(0, 4).map((thread) => `${thread.accountName} / ${thread.label}${typeof thread.amount === 'number' && thread.currency ? ` (${formatCurrencyAmount(thread.amount, thread.currency)})` : ''}: ${thread.stuckReason} - ${thread.nextAction}`),
            tone: 'warning' as const,
          }]
          : []),
      ],
      ctas: awaitingBase > 0
        ? [
          { label: 'Open Money', href: '/app/revenue', note: 'The full money flow lives on the Money page.' },
          { label: 'Open Cash collection', href: '/app/cash-collection', note: 'What each customer still owes lives there.' },
        ]
        : [{ label: 'Open Money', href: '/app/revenue', note: 'The full money flow lives on the Money page.' }],
    }],
  };
}

export function answerFromWeekRecap(activities: SalesActivityRecord[], today = todayDateKey()): AskMemoireAnswer {
  const weekStart = addDaysKey(today, -7);
  const weekActivities = activities.filter((activity) => (
    isValidBusinessDate(activity.activityDate)
      && activity.activityDate > weekStart
      && activity.activityDate <= today
  ));

  if (weekActivities.length === 0) {
    return {
      answer: 'No activity was captured in the last 7 days, so there is nothing to recap. Capture what happened - even one line per touch keeps the business memory alive.',
      contextUsed: ['Activity Ledger (last 7 days)'],
      missingContext: ['Captured activities'],
      suggestedNextAction: 'Capture the most recent customer touch or business update.',
      suggestedQuestions: ['What should I do first today?', 'Where is the money?'],
    };
  }

  const byDomain = new Map<BusinessDomain, SalesActivityRecord[]>();
  weekActivities.forEach((activity) => {
    const domain = classifyBusinessDomain(activity);
    byDomain.set(domain, [...(byDomain.get(domain) || []), activity]);
  });
  const domainSummary = Array.from(byDomain.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([domain, records]) => `${domain} ${records.length}`)
    .join(', ');
  const accountsTouched = new Set(weekActivities
    .map((activity) => activity.accountName || activity.linkedAccountName)
    .filter(Boolean));

  return {
    answer: `${weekActivities.length} activities captured in the last 7 days (${domainSummary}) across ${accountsTouched.size} ${accountsTouched.size === 1 ? 'account' : 'accounts'}.`,
    contextUsed: ['Activity Ledger (last 7 days)'],
    missingContext: [],
    suggestedNextAction: 'Open the Weekly Business Review for money, wins/losses, and next-week priorities.',
    suggestedQuestions: ['Did I keep my promises this week?', 'Where is the money?'],
    cards: [{
      kind: 'insight',
      title: 'Your week, from the ledger',
      fields: [
        { label: 'Activities captured', value: String(weekActivities.length) },
        {
          label: 'By business domain',
          value: Array.from(byDomain.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([domain, records]) => `${domain}: ${records.length} - latest ${formatSafeBusinessDate(records.map((record) => record.activityDate).sort().at(-1) || '')}`),
        },
        { label: 'Accounts touched', value: accountsTouched.size > 0 ? Array.from(accountsTouched).slice(0, 6).join(', ') : 'None linked yet' },
      ],
      ctas: [
        { label: 'Open Activity Ledger', href: '/app/timeline?view=history' },
        { label: 'Open Business Review', href: '/app/reviews' },
      ],
    }],
  };
}

function addDaysKey(dateKey: string, days: number) {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

export function answerFromFollowUpImpact(impact: FollowUpImpactSummary): AskMemoireAnswer {
  const backInMotion = impact.dealsRevived + impact.dealsWon + impact.dealsProtected;
  if (impact.followUpsSent === 0) {
    return {
      answer: `No follow-ups were logged in the last ${impact.windowDays} days, so there is no rescue evidence yet. When you send one from the composer, use "Log as sent" - that is what makes this measurable.`,
      contextUsed: ['Follow-up impact (last 30 days)'],
      missingContext: ['Logged follow-ups'],
      suggestedNextAction: 'Draft a follow-up for a quiet deal and log it as sent.',
      suggestedQuestions: ['Which deals may go silent?', 'What should I do first today?'],
    };
  }

  return {
    answer: `In the last ${impact.windowDays} days you sent ${impact.followUpsSent} follow-up${impact.followUpsSent === 1 ? '' : 's'}, ${impact.quietDealsContacted} to quiet deals. ${backInMotion} ${backInMotion === 1 ? 'deal is' : 'deals are'} back in motion (${impact.dealsRevived} revived, ${impact.dealsWon} won, ${impact.dealsProtected} with the next touch booked), worth ${formatBaseCurrencyAmount(impact.valueBackInMotionBase, true)}. ${impact.dealsWaiting > 0 ? `${impact.dealsWaiting} still ${impact.dealsWaiting === 1 ? 'waits' : 'wait'} on a reply.` : 'Nothing is waiting on a reply.'}`,
    contextUsed: ['Follow-up impact (last 30 days)', 'Logged follow-up activities', 'Opportunity outcomes'],
    missingContext: [],
    suggestedNextAction: impact.dealsWaiting > 0 ? 'Send the next follow-up to the deals still waiting on a reply.' : 'Keep logging follow-ups as sent so this stays measurable.',
    suggestedQuestions: ['Which deals may go silent?', 'How accurate is my forecast?'],
    cards: [{
      kind: 'insight',
      title: 'Saved from silence',
      fields: [
        { label: 'Follow-ups sent', value: String(impact.followUpsSent) },
        { label: 'Quiet deals contacted', value: String(impact.quietDealsContacted) },
        { label: 'Back in motion', value: `${backInMotion} (${formatBaseCurrencyAmount(impact.valueBackInMotionBase, true)})`, tone: backInMotion > 0 ? 'good' : 'default' },
        { label: 'Still waiting', value: String(impact.dealsWaiting), tone: impact.dealsWaiting > 0 ? 'warning' : 'default' },
        {
          label: 'Evidence',
          value: impact.events.map((event) => `${event.accountName} / ${event.opportunityName}: ${followUpImpactStatusLabel(event.status)} - follow-up ${formatSafeBusinessDate(event.followUpDate)}. ${event.evidence}`),
        },
      ],
      ctas: [
        { label: 'Open Today', href: '/app/today', note: 'The Saved from silence panel lives on Today.' },
        { label: 'Open opportunities', href: '/app/opportunities' },
      ],
    }],
  };
}

export function answerFromObjectionPlaybook(playbook: ObjectionPlaybook): AskMemoireAnswer {
  const withResponses = playbook.insights.filter((insight) => insight.provenResponses.length > 0);
  if (playbook.insights.length === 0 || playbook.needsMoreData) {
    return {
      answer: 'Not enough objection history yet. Capture objections as they come up and log the resolution note when one closes - those notes become your reusable playbook.',
      contextUsed: ['Objection ledger'],
      missingContext: ['Captured objections with resolution notes'],
      suggestedNextAction: 'Log the most recent objection you heard, even if it is still open.',
      suggestedQuestions: ['Which objections are unresolved?', 'What should I do first today?'],
    };
  }

  return {
    answer: playbook.headline,
    contextUsed: ['Objection ledger', 'Deal outcomes'],
    missingContext: withResponses.length === 0 ? ['Resolution notes on resolved objections'] : [],
    suggestedNextAction: withResponses.length > 0
      ? `Reuse your proven ${withResponses[0].objectionType.toLowerCase()} responses in the next follow-up.`
      : 'Log what worked when you resolve the next objection.',
    suggestedQuestions: ['Which objections are unresolved?', 'Did my follow-ups work?'],
    cards: playbook.insights.slice(0, 3).map((insight) => ({
      kind: 'insight' as const,
      title: `${insight.objectionType} (${formatObjectionResolutionRate(insight)})`,
      fields: [
        {
          label: 'Your proven responses',
          value: insight.provenResponses.length > 0 ? insight.provenResponses : ['No resolution notes yet - log what worked when one resolves.'],
          tone: insight.provenResponses.length > 0 ? 'good' : 'default',
        },
        ...(insight.dealsLostTo > 0
          ? [{ label: 'Cost so far', value: `${insight.dealsLostTo} ${insight.dealsLostTo === 1 ? 'deal' : 'deals'} lost to this objection type`, tone: 'warning' as const }]
          : []),
        ...(insight.accounts.length > 0 ? [{ label: 'Seen at', value: insight.accounts.join(', ') }] : []),
      ],
      ctas: [{ label: 'Open Playbook', href: '/app/playbook', note: 'Copy proven responses from the Playbook page.' }],
    })),
  };
}

export function answerFromRetentionSignals(signals: RetentionSignal[]): AskMemoireAnswer {
  if (signals.length === 0) {
    return {
      answer: `No paid customer needs a retention touch right now - every paid relationship either has a touch in the last ${RETENTION_QUIET_DAYS} days, active deal work, or a dated follow-up. This reads only paid quotes; it never guesses.`,
      contextUsed: ['Paid quotes', 'Activity Ledger', 'Open deals and follow-up dates'],
      missingContext: [],
      suggestedNextAction: 'Keep capturing touches so this stays true.',
      suggestedQuestions: ['Where is the money?', 'Which deals may go silent?'],
    };
  }

  const coldest = signals[0];
  return {
    answer: `${signals.length} paid ${signals.length === 1 ? 'customer is' : 'customers are'} going quiet with nothing planned: ${signals.slice(0, 4).map((signal) => `${signal.accountName} (${signal.daysQuiet === null ? 'no touch captured since payment' : `quiet ${signal.daysQuiet}d`})`).join('; ')}. A check-in or thank-you keeps the next order alive.`,
    contextUsed: ['Paid quotes', 'Activity Ledger', 'Open deals and follow-up dates'],
    missingContext: [],
    suggestedNextAction: `Book a retention touch with ${coldest.accountName}.`,
    suggestedQuestions: ['Where is the money?', 'Did I keep my promises this week?'],
    cards: [{
      kind: 'insight',
      title: 'Customers to check back with',
      fields: [
        {
          label: 'Going quiet after payment',
          value: signals.slice(0, 6).map((signal) => `${signal.accountName} / ${signal.quoteLabel}${typeof signal.amount === 'number' && signal.currency ? ` (${formatCurrencyAmount(signal.amount, signal.currency)})` : ''}: ${signal.daysQuiet === null ? 'no touch captured since payment' : `last touch ${formatSafeBusinessDate(signal.lastTouchDate)}, quiet ${signal.daysQuiet}d`}`),
          tone: 'warning',
        },
        { label: 'Basis', value: `Paid quotes with no captured touch for ${RETENTION_QUIET_DAYS}+ days and no active deal or dated follow-up. Derived from what you captured - nothing inferred.` },
      ],
      ctas: [
        { label: 'Open Accounts', href: '/app/accounts' },
        { label: 'Capture a touch', href: '/app/capture' },
      ],
    }],
  };
}

export function answerFromCommitments(commitments: CommitmentItem[]): AskMemoireAnswer {
  if (commitments.length === 0) {
    return {
      answer: 'No dated commitments to check - none of your active deals carries a dated next action in this window. Put dates on next actions and Memoire can hold you to them.',
      contextUsed: ['Active deals (dated next actions)', 'Activity Ledger'],
      missingContext: ['Dated next actions on active deals'],
      suggestedNextAction: 'Add a date to the next action on your most important deal.',
      suggestedQuestions: ['Which deals may go silent?', 'What should I do first today?'],
    };
  }

  const kept = commitments.filter((item) => item.status === 'kept');
  const missed = commitments.filter((item) => item.status === 'missed');
  const upcoming = commitments.filter((item) => item.status === 'upcoming');

  return {
    answer: `${kept.length} kept, ${missed.length} missed, ${upcoming.length} upcoming. ${missed.length > 0
      ? `Missed first: ${missed.slice(0, 3).map((item) => `${item.accountName} - ${item.action} (${formatSafeBusinessDate(item.date)})`).join('; ')}.`
      : 'Nothing promised has slipped.'} Current promises only - past periods are not reconstructed.`,
    contextUsed: ['Active deals (dated next actions)', 'Activity Ledger'],
    missingContext: [],
    suggestedNextAction: missed.length > 0
      ? `Recover the missed promise at ${missed[0].accountName}: ${missed[0].action}.`
      : upcoming.length > 0
        ? `Next up: ${upcoming[0].accountName} - ${upcoming[0].action} (${formatSafeBusinessDate(upcoming[0].date)}).`
        : 'Book the next dated commitment.',
    suggestedQuestions: ['Which deals may go silent?', 'Which customers should I check back with?'],
    cards: [{
      kind: 'insight',
      title: 'Your promises, checked against the ledger',
      fields: [
        { label: 'Kept', value: String(kept.length), tone: kept.length > 0 ? 'good' : 'default' },
        { label: 'Missed', value: String(missed.length), tone: missed.length > 0 ? 'warning' : 'default' },
        { label: 'Upcoming', value: String(upcoming.length) },
        ...(missed.length > 0
          ? [{ label: 'Missed promises', value: missed.slice(0, 4).map((item) => `${item.accountName} / ${item.opportunityName}: ${item.action} - promised ${formatSafeBusinessDate(item.date)}`), tone: 'warning' as const }]
          : []),
        ...(upcoming.length > 0
          ? [{ label: 'Coming up', value: upcoming.slice(0, 4).map((item) => `${item.accountName} / ${item.opportunityName}: ${item.action} - due ${formatSafeBusinessDate(item.date)}`) }]
          : []),
        { label: 'Basis', value: 'Kept = a captured touch on or after the promised date. Honest, not reconstructed.' },
      ],
      ctas: [{ label: 'Open Business Review', href: '/app/reviews', note: 'The full commitments ledger lives in the Weekly Business Review.' }],
    }],
  };
}

export function answerFromInitiativeReview(review: InitiativeReview): AskMemoireAnswer {
  if (review.openCount === 0) {
    return {
      answer: 'No open initiatives or experiments to review. When you start a bet - an outbound push, an offer test, a partnership - track it on the operating page so Memoire can tell you what is testing, what the signal is, and whether to continue.',
      contextUsed: ['Operating contexts (initiatives, plays, offers, experiments)'],
      missingContext: ['Tracked initiatives'],
      suggestedNextAction: 'Add the initiative or experiment you are running now.',
      suggestedQuestions: ['What should I do first today?', 'Where is the money?'],
    };
  }

  const stalledLine = review.stalled.length > 0
    ? `${review.stalled.length} stalled: ${review.stalled.slice(0, 3).map((item) => `${item.title} (${item.reason.replace(/\.$/, '')})`).join('; ')}.`
    : 'None are stalled.';
  const decidedLine = review.decidedToChange.length > 0
    ? ` ${review.decidedToChange.length} marked to adjust or stop but still open.`
    : '';

  return {
    answer: `${review.openCount} open ${review.openCount === 1 ? 'initiative' : 'initiatives'}. ${stalledLine}${decidedLine}`,
    contextUsed: ['Operating contexts', 'Activity Ledger (initiative mentions)'],
    missingContext: [],
    suggestedNextAction: review.stalled[0]
      ? `${review.stalled[0].nextAction || 'Capture an update, book the next step, or close it'} (${review.stalled[0].title})`
      : review.decidedToChange[0]
        ? `Follow through on your decision to ${initiativeDecisionLabel(review.decidedToChange[0].decision).toLowerCase()}: ${review.decidedToChange[0].title}.`
        : 'Keep capturing activity so the signal stays current.',
    suggestedQuestions: ['Which deals may go silent?', 'What happened this week?'],
    cards: [{
      kind: 'insight',
      title: 'Your initiatives and experiments',
      fields: [
        { label: 'Open', value: String(review.openCount) },
        ...(review.stalled.length > 0
          ? [{
            label: 'Stalled - needs a decision',
            value: review.stalled.slice(0, 4).map((item) => {
              const signal = item.currentSignal ? ` Signal so far: ${item.currentSignal}.` : item.hypothesis ? ` Testing: ${item.hypothesis}.` : '';
              return `${item.title}: ${item.reason}${signal}`;
            }),
            tone: 'warning' as const,
          }]
          : [{ label: 'Stalled', value: 'None - every open initiative has recent activity.', tone: 'good' as const }]),
        ...(review.decidedToChange.length > 0
          ? [{
            label: 'Decided but still open',
            value: review.decidedToChange.slice(0, 4).map((item) => `${item.title}: ${initiativeDecisionLabel(item.decision)}${item.currentSignal ? ` - ${item.currentSignal}` : ''}`),
            tone: 'warning' as const,
          }]
          : []),
        { label: 'Basis', value: 'Health measured from captured activity; hypothesis and signal from what you recorded. Nothing inferred.' },
      ],
      ctas: [{ label: 'Open initiatives', href: '/app/operating-system' }],
    }],
  };
}

export function answerFromCustomerSignals(digest: SignalDigest): AskMemoireAnswer {
  if (digest.total === 0) {
    return {
      answer: 'No customer signals captured yet. Signals appear when your captures mention buying intent, risks, timelines, or competitors - capture what customers actually say and they roll up here.',
      contextUsed: ['Captured activity signals'],
      missingContext: ['Captured buying signals, risks, timelines, or competitors'],
      suggestedNextAction: 'Capture the last thing a customer told you.',
      suggestedQuestions: ['What happened this week?', 'Which deals may go silent?'],
    };
  }

  const parts: string[] = [];
  if (digest.buying.length > 0) parts.push(`${digest.buying.length} buying`);
  if (digest.risks.length > 0) parts.push(`${digest.risks.length} risk`);
  if (digest.timeline.length > 0) parts.push(`${digest.timeline.length} timeline`);
  if (digest.competitors.length > 0) parts.push(`${digest.competitors.length} competitor`);

  const signalGroup = (label: string, items: SignalDigest['buying']) => (
    items.length > 0
      ? [{ label, value: items.map((item) => `${item.text}${item.accountName ? ` - ${item.accountName}` : ''} (${formatSafeBusinessDate(item.date)})`) }]
      : []
  );

  return {
    answer: `Captured customer signals: ${parts.join(', ')}. ${digest.risks.length > 0 ? `Watch the risks first: ${digest.risks[0].text}${digest.risks[0].accountName ? ` (${digest.risks[0].accountName})` : ''}.` : 'No risks flagged.'}`,
    contextUsed: ['Captured activity signals (buying, risk, timeline, competitor)'],
    missingContext: [],
    suggestedNextAction: digest.risks[0]
      ? `Address the risk at ${digest.risks[0].accountName || 'the flagged account'}.`
      : digest.buying[0]
        ? `Act on the buying signal at ${digest.buying[0].accountName || 'the flagged account'}.`
        : 'Keep capturing what customers tell you.',
    suggestedQuestions: ['What happened this week?', 'Which deals may go silent?'],
    cards: [{
      kind: 'insight',
      title: 'What customers are telling you',
      fields: [
        ...signalGroup('Buying signals', digest.buying),
        ...signalGroup('Risks', digest.risks),
        ...signalGroup('Timeline', digest.timeline),
        ...signalGroup('Competitors', digest.competitors),
        { label: 'Basis', value: 'Rolled up from what you captured - nothing inferred.' },
      ],
      ctas: [
        { label: 'Open Activity Ledger', href: '/app/timeline?view=history' },
        { label: 'Open Business Review', href: '/app/reviews' },
      ],
    }],
  };
}

export function answerFromForecastCalibration(calibration: ForecastCalibration): AskMemoireAnswer {
  if (calibration.totalClosed === 0) {
    return {
      answer: 'No closed outcomes are logged yet, so there is no win-rate history to calibrate against. Log the outcome when a deal closes - won or lost - and this becomes your personal calibration.',
      contextUsed: ['Opportunity outcomes'],
      missingContext: ['Closed deal outcomes'],
      suggestedNextAction: 'Log the outcome of the last deal that closed.',
      suggestedQuestions: ['Which deals may go silent?', 'What should I do first today?'],
    };
  }

  const ratedRows = calibration.rows.filter((row) => row.sufficientSample && row.winRate !== null);
  return {
    answer: calibration.headline,
    contextUsed: [`${calibration.totalClosed} closed outcomes`, 'Pre-outcome forecast evidence labels'],
    missingContext: calibration.hasEnoughData ? [] : ['More closed outcomes'],
    suggestedNextAction: calibration.warnings.length > 0
      ? 'Review what evidence you require before labeling a deal Defensible.'
      : 'Keep logging outcomes so the calibration stays honest.',
    suggestedQuestions: ['Did my follow-ups work?', 'Which deals may go silent?'],
    cards: [{
      kind: 'insight',
      title: 'Personal forecast calibration',
      fields: [
        ...ratedRows.map((row) => ({
          label: `${row.category} win rate`,
          value: `${formatWinRate(row.winRate)} (${row.won} won / ${row.lost} lost / ${row.stalled} stalled)`,
          tone: (row.winRate as number) >= 0.5 ? 'good' as const : 'warning' as const,
        })),
        ...(ratedRows.length === 0 ? [{ label: 'Win rates', value: 'No category has enough closed outcomes to rate yet.' }] : []),
        ...(calibration.calibratedPipelineBase !== null
          ? [{ label: 'Calibrated pipeline value', value: formatBaseCurrencyAmount(calibration.calibratedPipelineBase, true) }]
          : []),
        ...calibration.warnings.map((warning, index) => ({ label: index === 0 ? 'Calibration warning' : 'Also', value: warning.message, tone: 'warning' as const })),
        { label: 'Basis', value: 'Your own closed outcomes. History, not prediction.' },
      ],
      ctas: [{ label: 'Open Pipeline Defense', href: '/app/pipeline-defense', note: 'The full calibration table lives on Pipeline Defense.' }],
    }],
  };
}

/**
 * "What am I waiting for from customers?" - the ball on their side of the net.
 *
 * The page advertised this question in its own "What this can answer" panel and
 * routed it nowhere: it fell through to the generic memory answer, which knows
 * nothing about money. Every part of the real answer already existed - the
 * order book knows what is committed and uncollected, the money flow knows
 * which quotes went out and never came back - and neither was ever asked.
 *
 * The two are kept apart because they are different waits. A quote with no
 * answer is waiting on a decision; a signed order with no payment is waiting on
 * money that is already yours. Chasing them is not the same phone call.
 */
export function answerFromAwaitingCustomer(orderBook: OrderBook, moneyFlow: MoneyFlow): AskMemoireAnswer {
  const awaitingBase = orderBook.awaitingBase;
  const openOrders = orderBook.orders.filter((order) => !order.fullyCollected);
  const oldestOrder = [...openOrders].sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0))[0];
  const decisionLanes = moneyFlow.lanes.filter((lane) => lane.stage === 'Quoted' || lane.stage === 'Pending PO');
  const decisionThreads = decisionLanes.reduce((sum, lane) => sum + lane.threads, 0);
  const decisionBase = decisionLanes.reduce((sum, lane) => sum + lane.totalBase, 0);
  const waitingQuotes = moneyFlow.threads.filter((thread) => thread.stage === 'Quoted' || thread.stage === 'Pending PO');

  if (openOrders.length === 0 && decisionThreads === 0) {
    return {
      answer: 'Nothing is sitting on the customer side right now - no quote is out without an answer, and no committed order is waiting to be paid. Everything open is waiting on you.',
      contextUsed: ['Order book', 'Money flow (deals, quotes, POs, deliveries, payments)'],
      missingContext: [],
      suggestedNextAction: 'Check what you owe today instead.',
      suggestedQuestions: ['What do I owe today?', 'Which deals may go silent?'],
    };
  }

  const decisionSentence = decisionThreads > 0
    ? `${decisionThreads} ${decisionThreads === 1 ? 'quote is' : 'quotes are'} out without an answer (${formatBaseCurrencyAmount(decisionBase, true)}).`
    : 'No quote is out without an answer.';
  const moneySentence = awaitingBase > 0
    ? ` ${formatBaseCurrencyAmount(awaitingBase, true)} is committed and not yet collected across ${openOrders.length} ${openOrders.length === 1 ? 'order' : 'orders'}${oldestOrder?.daysInStage ? `, the oldest untouched for ${oldestOrder.daysInStage} days` : ''}.`
    : '';

  return {
    answer: `${decisionSentence}${moneySentence}`,
    contextUsed: ['Order book', 'Money flow (deals, quotes, POs, deliveries, payments)'],
    missingContext: [],
    suggestedNextAction: oldestOrder
      ? `Chase ${oldestOrder.accountName} on ${oldestOrder.orderRef}${oldestOrder.nextMilestone ? ` - ${oldestOrder.nextMilestone.label}` : ''}.`
      : waitingQuotes[0]
        ? `Ask ${waitingQuotes[0].accountName} where the decision stands.`
        : 'Pick the oldest wait and close it.',
    suggestedQuestions: ['What do I owe today?', 'Where is the money?'],
    cards: [{
      kind: 'insight',
      title: 'Waiting on them',
      fields: [
        ...(decisionThreads > 0
          ? [{ label: 'Awaiting a decision', value: `${decisionThreads} ${decisionThreads === 1 ? 'quote' : 'quotes'} - ${formatBaseCurrencyAmount(decisionBase, true)}` }]
          : []),
        ...(awaitingBase > 0
          ? [{
            label: 'Awaiting payment',
            value: `${formatBaseCurrencyAmount(awaitingBase, true)} across ${openOrders.length} ${openOrders.length === 1 ? 'order' : 'orders'}${orderBook.stalledCount ? ` - ${orderBook.stalledCount} not moved in a month` : ''}`,
            tone: 'warning' as const,
          }]
          : []),
        ...(waitingQuotes.length > 0
          ? [{ label: 'Quotes with no answer', value: waitingQuotes.slice(0, 4).map((thread) => `${thread.accountName} / ${thread.label} - ${thread.nextAction}`) }]
          : []),
        ...(openOrders.length > 0
          ? [{
            label: 'Oldest waits',
            value: [...openOrders]
              .sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0))
              .slice(0, 4)
              .map((order) => `${order.accountName} / ${order.orderRef}: ${formatBaseCurrencyAmount(order.amountBase, true)}${order.daysInStage ? ` - ${order.daysInStage} days` : ''}`),
            tone: 'warning' as const,
          }]
          : []),
        { label: 'Basis', value: 'A quote with no answer is waiting on a decision. A signed order with no payment is waiting on money that is already yours.' },
      ],
      ctas: [
        { label: 'Open Cash collection', href: '/app/cash-collection', note: 'What each customer still owes lives there.' },
        { label: 'Open Money', href: '/app/revenue', note: 'The full money flow lives on the Money page.' },
      ],
    }],
  };
}

/**
 * "What do I owe today?" - the same silence detection, pointed at the operator.
 *
 * Also advertised on the page and also unrouted. Two different debts answer to
 * it and both already exist: money and deliveries you owe (own obligations),
 * and promises you made to customers (the commitment ledger). Neither is more
 * true than the other, so it reports both rather than picking one.
 */
export function answerFromOwnObligations(
  obligations: OwnObligationsModel,
  commitments: CommitmentItem[],
): AskMemoireAnswer {
  const missed = commitments.filter((item) => item.status === 'missed');
  const dueToday = commitments.filter((item) => item.status === 'upcoming' && item.date === todayDateKey());
  const overdue = obligations.overdue;
  const dueSoon = obligations.dueSoon;
  const nothingOwed = overdue.length === 0 && dueSoon.length === 0 && missed.length === 0 && dueToday.length === 0;

  if (nothingOwed) {
    return {
      answer: 'Nothing you owe is overdue or due in the next week - no payment, no delivery, and no promise you made to a customer has slipped. Only dated obligations can be checked, so anything undated is invisible here rather than clear.',
      contextUsed: ['Own obligations (payments, deliveries)', 'Active deals (dated next actions)'],
      missingContext: ['Undated obligations cannot be checked'],
      suggestedNextAction: 'Date the next payment or delivery you owe.',
      suggestedQuestions: ['What am I waiting for from customers?', 'Which deals may go silent?'],
    };
  }

  const owedSentence = overdue.length > 0
    ? `${overdue.length} ${overdue.length === 1 ? 'obligation is' : 'obligations are'} already overdue.`
    : 'Nothing you owe is overdue yet.';
  const soonSentence = dueSoon.length > 0 ? ` ${dueSoon.length} due within the week.` : '';
  const promiseSentence = missed.length > 0
    ? ` You have also missed ${missed.length} ${missed.length === 1 ? 'promise' : 'promises'} to customers.`
    : dueToday.length > 0
      ? ` ${dueToday.length} ${dueToday.length === 1 ? 'promise is' : 'promises are'} due today.`
      : '';

  return {
    answer: `${owedSentence}${soonSentence}${promiseSentence}`,
    contextUsed: ['Own obligations (payments, deliveries)', 'Active deals (dated next actions)'],
    missingContext: [],
    suggestedNextAction: overdue[0]
      ? `Settle ${overdue[0].label} to ${overdue[0].counterparty}.`
      : missed[0]
        ? `Recover the missed promise at ${missed[0].accountName}: ${missed[0].action}.`
        : dueSoon[0]
          ? `${dueSoon[0].label} to ${dueSoon[0].counterparty} is due ${formatSafeBusinessDate(dueSoon[0].dueDate)}.`
          : 'Clear the nearest obligation.',
    suggestedQuestions: ['What am I waiting for from customers?', 'Where is the money?'],
    cards: [{
      kind: 'insight',
      title: 'What you owe',
      fields: [
        ...(overdue.length > 0
          ? [{
            label: 'Overdue',
            value: overdue.slice(0, 4).map((item) => `${item.label} - ${item.counterparty} (due ${formatSafeBusinessDate(item.dueDate)})`),
            tone: 'warning' as const,
          }]
          : []),
        ...(dueSoon.length > 0
          ? [{ label: 'Due this week', value: dueSoon.slice(0, 4).map((item) => `${item.label} - ${item.counterparty} (due ${formatSafeBusinessDate(item.dueDate)})`) }]
          : []),
        ...(obligations.paymentsOwedBase > 0
          ? [{ label: 'Money owed out', value: formatBaseCurrencyAmount(obligations.paymentsOwedBase, true), tone: 'warning' as const }]
          : []),
        ...(missed.length > 0
          ? [{
            label: 'Promises missed',
            value: missed.slice(0, 4).map((item) => `${item.accountName}: ${item.action} - promised ${formatSafeBusinessDate(item.date)}`),
            tone: 'warning' as const,
          }]
          : []),
        ...(dueToday.length > 0
          ? [{ label: 'Promised for today', value: dueToday.slice(0, 4).map((item) => `${item.accountName}: ${item.action}`) }]
          : []),
        { label: 'Basis', value: 'Only dated obligations can be checked. Anything undated is invisible here rather than clear.' },
      ],
      ctas: [{ label: 'Open Money', href: '/app/revenue', note: 'Money out and obligations live on the Money page.' }],
    }],
  };
}

/**
 * Interrogatives. A question is a question even when it also names a customer,
 * and "What changed at Grupo Calvo this week?" belongs to the change engine,
 * not to a record lookup.
 */
const QUESTION_CUES = /\b(what|which|who|whom|whose|how|when|why|where|should|shall|can|could|would|will|do|does|did|is|are|am|was|were|any|show|list|summar\w*|draft|help)\b/;

export type RecordFind = {
  query: string;
  /** Deals whose own name matched. The most specific kind of hit. */
  deals: CrmLiteOpportunity[];
  /** Account names that matched, each with the deals filed under them. */
  accounts: { name: string; deals: CrmLiteOpportunity[] }[];
};

/**
 * The "Search" half of Search & Insights.
 *
 * The page is titled "Find anything, and ask what it means" and had no way to
 * find anything: the box only answered questions, so typing a customer's name -
 * the first thing anyone does on a page called Search - matched no engine and
 * fell through to the workspace summary, which answered about the whole book
 * and never mentioned the customer whose name was typed.
 *
 * A lookup is only attempted when the text is not a question. Names are folded
 * through `normalizeEntityName`, the same fold the deal resolver uses, so an
 * accented or differently-cased name still finds its record.
 */
export function findRecords(
  question: string,
  opportunities: CrmLiteOpportunity[],
): RecordFind | null {
  const raw = question.trim();
  if (!raw || QUESTION_CUES.test(raw.toLowerCase())) return null;
  const needle = normalizeEntityName(raw);
  if (needle.length < 3) return null;

  const matches = (name: string) => {
    const folded = normalizeEntityName(name || '');
    if (folded.length < 3) return false;
    return folded.includes(needle) || needle.includes(folded);
  };

  const deals = opportunities.filter((opportunity) => matches(opportunity.opportunityName || ''));
  const byAccount = new Map<string, CrmLiteOpportunity[]>();
  opportunities
    .filter((opportunity) => matches(opportunity.accountName || ''))
    .forEach((opportunity) => {
      const name = (opportunity.accountName || '').trim();
      byAccount.set(name, [...(byAccount.get(name) || []), opportunity]);
    });

  if (deals.length === 0 && byAccount.size === 0) return null;
  return {
    query: raw,
    deals,
    accounts: [...byAccount.entries()].map(([name, accountDeals]) => ({ name, deals: accountDeals })),
  };
}

export function answerFromRecordFind(find: RecordFind): AskMemoireAnswer {
  const activeOf = (deals: CrmLiteOpportunity[]) => deals.filter((deal) => deal.status === 'Active');
  const dealLine = (deal: CrmLiteOpportunity) => {
    const value = typeof deal.estimatedValue === 'number' && deal.estimatedValue > 0 && deal.currency
      ? ` - ${formatCurrencyAmount(deal.estimatedValue, deal.currency)}`
      : '';
    const next = deal.nextAction
      ? ` - next: ${deal.nextAction}${isValidBusinessDate(deal.nextActionDate || '') ? ` (${formatSafeBusinessDate(deal.nextActionDate)})` : ''}`
      : ' - no next action recorded';
    return `${deal.opportunityName || 'Untitled deal'} (${deal.stage}${deal.status !== 'Active' ? `, ${deal.status}` : ''})${value}${next}`;
  };

  const account = find.accounts[0];
  if (find.accounts.length === 1 && find.deals.length === 0) {
    const open = activeOf(account.deals);
    return {
      answer: `${account.name}: ${account.deals.length} ${account.deals.length === 1 ? 'deal' : 'deals'} on record, ${open.length} still open.`,
      contextUsed: [`Account: ${account.name}`, 'Opportunities'],
      missingContext: open.some((deal) => !deal.nextAction) ? ['A next action on every open deal'] : [],
      suggestedNextAction: open[0]?.nextAction || `Book the next step with ${account.name}.`,
      suggestedQuestions: ['Which deals may go silent?', 'Where is the money?'],
      cards: [{
        kind: 'insight',
        title: `Found: ${account.name}`,
        fields: [
          { label: 'Open deals', value: open.length > 0 ? open.map(dealLine) : 'None open right now.' },
          ...(account.deals.length > open.length
            ? [{ label: 'Closed', value: account.deals.filter((deal) => deal.status !== 'Active').map(dealLine) }]
            : []),
        ],
        ctas: [{ label: 'Open Accounts', href: '/app/accounts', note: 'The full record lives on the Accounts page.' }],
      }],
    };
  }

  const hits = [...find.deals, ...find.accounts.flatMap((entry) => entry.deals)];
  const unique = [...new Map(hits.map((deal) => [deal.id, deal])).values()];
  const open = activeOf(unique);
  return {
    answer: `"${find.query}" matches ${unique.length} ${unique.length === 1 ? 'record' : 'records'}${find.accounts.length > 1 ? ` across ${find.accounts.length} customers` : ''}, ${open.length} still open.`,
    contextUsed: ['Opportunities', 'Accounts'],
    missingContext: [],
    suggestedNextAction: open[0]?.nextAction || 'Pick one record and book its next step.',
    suggestedQuestions: ['Which deals may go silent?', 'Where is the money?'],
    cards: [{
      kind: 'insight',
      title: `Found: ${find.query}`,
      fields: [
        { label: 'Open', value: open.length > 0 ? open.slice(0, 6).map(dealLine) : 'None open right now.' },
        ...(unique.length > open.length
          ? [{ label: 'Closed', value: unique.filter((deal) => deal.status !== 'Active').slice(0, 6).map(dealLine) }]
          : []),
        { label: 'Basis', value: 'Names are matched after folding accents and case, so a differently written name still finds its record.' },
      ],
      ctas: [{ label: 'Open opportunities', href: '/app/opportunities', note: 'Filter and edit the records there.' }],
    }],
  };
}
