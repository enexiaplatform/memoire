import type { AskMemoireAnswer } from '../../types/v31';
import type { SalesActivityRecord } from '../../services/salesActivityStore.ts';
import { followUpImpactStatusLabel, type FollowUpImpactSummary } from '../../utils/followUpImpact.ts';
import { formatObjectionResolutionRate, type ObjectionPlaybook } from '../../utils/objectionPlaybook.ts';
import { formatWinRate, type ForecastCalibration } from '../../utils/forecastCalibration.ts';
import { classifyBusinessDomain, type BusinessDomain } from '../../utils/businessDomain.ts';
import { type MoneyFlow } from '../../utils/moneyFlow.ts';
import { formatBaseCurrencyAmount, formatCurrencyAmount } from '../../utils/money.ts';
import { formatSafeBusinessDate, isValidBusinessDate, todayDateKey } from '../../utils/safeDate.ts';

export type InsightQuestionKind =
  | 'follow_up_impact'
  | 'objection_playbook'
  | 'forecast_calibration'
  | 'money_state'
  | 'week_recap';

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
  return null;
}

export function answerFromMoneyFlow(moneyFlow: MoneyFlow): AskMemoireAnswer {
  if (moneyFlow.threads.length === 0) {
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
      : 'Nothing is stuck right now.'}`,
    contextUsed: ['Money flow (deals, quotes, POs, deliveries, payments)'],
    missingContext: [],
    suggestedNextAction: stuck[0] ? `${stuck[0].nextAction} (${stuck[0].accountName})` : 'Keep the next commercial steps dated.',
    suggestedQuestions: ['What happened this week?', 'Which deals may go silent?'],
    cards: [{
      kind: 'insight',
      title: 'Where the money sits',
      fields: [
        { label: 'In motion', value: formatBaseCurrencyAmount(moneyFlow.totalInMotionBase, true), tone: 'good' },
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
      ctas: [{ label: 'Open Money', href: '/app/revenue', note: 'The full money flow lives on the Money page.' }],
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
    suggestedQuestions: ['Where is the money?', 'Did my follow-ups work?'],
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
        { label: 'Open Activity Ledger', href: '/app/activity' },
        { label: 'Open Business Review', href: '/app/weekly-brief' },
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
