import type { SalesActivityRecord } from '../services/salesActivityStore';

export type SalesRecapPeriod = 'week' | 'month';

export type SalesActivityRecap = {
  periodType: SalesRecapPeriod;
  periodLabel: string;
  totalActivities: number;
  activeDays: number;
  accountsTouched: string[];
  opportunitiesTouched: string[];
  activityTypeBreakdown: Record<string, number>;
  topAccounts: { accountName: string; count: number }[];
  openNextActions: {
    activityId: string;
    accountName?: string;
    opportunityName?: string;
    nextAction: string;
    dueDate?: string;
  }[];
  objectionsCaptured: {
    activityId: string;
    accountName?: string;
    opportunityName?: string;
    summary: string;
    nextAction?: string;
  }[];
  followUpsCaptured: {
    activityId: string;
    accountName?: string;
    opportunityName?: string;
    summary: string;
    nextAction?: string;
  }[];
  insights: string[];
  recommendedActions: string[];
};

export type SalesRecapRange = {
  start: string;
  end: string;
  label: string;
};

export function generateWeeklySalesRecap(activities: SalesActivityRecord[], period: SalesRecapRange): SalesActivityRecap {
  return generateSalesRecap(activities, 'week', period);
}

export function generateMonthlySalesRecap(activities: SalesActivityRecord[], period: SalesRecapRange): SalesActivityRecap {
  return generateSalesRecap(activities, 'month', period);
}

export function getAccountsTouched(activities: SalesActivityRecord[]) {
  return uniqueClean(activities.map((activity) => activity.accountName));
}

export function getOpportunitiesTouched(activities: SalesActivityRecord[]) {
  return uniqueClean(activities.map(getActivityOpportunityName));
}

export function getActivityTypeBreakdown(activities: SalesActivityRecord[]) {
  return countBy(activities.map((activity) => activity.activityType));
}

export function getOpenNextActions(activities: SalesActivityRecord[]) {
  return activities
    .filter((activity) => Boolean(activity.nextAction))
    .map((activity) => ({
      activityId: activity.id,
      accountName: activity.accountName || undefined,
      opportunityName: getActivityOpportunityName(activity) || undefined,
      nextAction: activity.nextAction,
      dueDate: activity.dueDate || undefined,
    }));
}

export function getObjectionActivities(activities: SalesActivityRecord[]) {
  return activities
    .filter((activity) => activity.activityType === 'Objection handling' || activity.tags.includes('risk-signal'))
    .map((activity) => ({
      activityId: activity.id,
      accountName: activity.accountName || undefined,
      opportunityName: getActivityOpportunityName(activity) || undefined,
      summary: activity.summary,
      nextAction: activity.nextAction || undefined,
    }));
}

export function getFollowUpActivities(activities: SalesActivityRecord[]) {
  return activities
    .filter((activity) => activity.activityType === 'Follow-up' || activity.tags.includes('follow-up'))
    .map((activity) => ({
      activityId: activity.id,
      accountName: activity.accountName || undefined,
      opportunityName: getActivityOpportunityName(activity) || undefined,
      summary: activity.summary,
      nextAction: activity.nextAction || undefined,
    }));
}

export function getStalledOrLowActivityAccounts(activities: SalesActivityRecord[]) {
  const byAccount = groupByAccount(activities);
  return Object.entries(byAccount)
    .filter(([, accountActivities]) => {
      const hasRisk = accountActivities.some((activity) =>
        activity.activityType === 'Objection handling' ||
        activity.tags.includes('risk-signal') ||
        /waiting|unclear|no response|blocked/i.test(activity.summary)
      );
      const hasNextAction = accountActivities.some((activity) => Boolean(activity.nextAction));
      return hasRisk || !hasNextAction;
    })
    .map(([accountName]) => accountName);
}

export function generateSalesRecapMarkdown(recap: SalesActivityRecap) {
  const breakdown = Object.entries(recap.activityTypeBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `- ${type}: ${count}`)
    .join('\n') || '- No activity types captured';

  const openActions = recap.openNextActions
    .map((item) => `- ${item.accountName || 'Unknown account'}: ${item.nextAction}${item.dueDate ? ` (due ${item.dueDate})` : ''}`)
    .join('\n') || '- No open next actions captured';

  const objections = recap.objectionsCaptured
    .map((item) => `- ${item.accountName || 'Unknown account'}: ${item.summary}${item.nextAction ? ` | Next: ${item.nextAction}` : ''}`)
    .join('\n') || '- No objection-related activities captured';

  const followUps = recap.followUpsCaptured
    .map((item) => `- ${item.accountName || 'Unknown account'}: ${item.summary}${item.nextAction ? ` | Next: ${item.nextAction}` : ''}`)
    .join('\n') || '- No follow-up activities captured';

  return [
    `# ${capitalize(recap.periodType)} Sales Recap - ${recap.periodLabel}`,
    '',
    '## Summary',
    `- Total activities: ${recap.totalActivities}`,
    `- Active days: ${recap.activeDays}`,
    `- Accounts touched: ${recap.accountsTouched.length}`,
    `- Opportunities touched: ${recap.opportunitiesTouched.length}`,
    `- Open next actions: ${recap.openNextActions.length}`,
    `- Objections captured: ${recap.objectionsCaptured.length}`,
    '',
    '## Insights',
    ...recap.insights.map((item) => `- ${item}`),
    '',
    '## Recommended Actions',
    ...recap.recommendedActions.map((item) => `- ${item}`),
    '',
    '## Activity Type Breakdown',
    breakdown,
    '',
    '## Open Next Actions',
    openActions,
    '',
    '## Objections Captured',
    objections,
    '',
    '## Follow-ups Captured',
    followUps,
  ].join('\n');
}

function generateSalesRecap(
  activities: SalesActivityRecord[],
  periodType: SalesRecapPeriod,
  period: SalesRecapRange
): SalesActivityRecap {
  const accountsTouched = getAccountsTouched(activities);
  const opportunitiesTouched = getOpportunitiesTouched(activities);
  const activityTypeBreakdown = getActivityTypeBreakdown(activities);
  const topAccounts = getTopAccounts(activities);
  const openNextActions = getOpenNextActions(activities);
  const objectionsCaptured = getObjectionActivities(activities);
  const followUpsCaptured = getFollowUpActivities(activities);
  const activeDays = new Set(activities.map((activity) => activity.activityDate)).size;
  const insights = buildInsights(activities, periodType, {
    accountsTouched,
    activityTypeBreakdown,
    openNextActionsCount: openNextActions.length,
    objectionsCount: objectionsCaptured.length,
    activeDays,
    period,
  });
  const recommendedActions = buildRecommendedActions(activities, {
    openNextActionsCount: openNextActions.length,
    objectionsCount: objectionsCaptured.length,
    stalledAccounts: getStalledOrLowActivityAccounts(activities),
    vagueActivityCount: activities.filter((activity) => isVague(activity.summary)).length,
  });

  return {
    periodType,
    periodLabel: period.label,
    totalActivities: activities.length,
    activeDays,
    accountsTouched,
    opportunitiesTouched,
    activityTypeBreakdown,
    topAccounts,
    openNextActions,
    objectionsCaptured,
    followUpsCaptured,
    insights,
    recommendedActions,
  };
}

function buildInsights(
  activities: SalesActivityRecord[],
  periodType: SalesRecapPeriod,
  context: {
    accountsTouched: string[];
    activityTypeBreakdown: Record<string, number>;
    openNextActionsCount: number;
    objectionsCount: number;
    activeDays: number;
    period: SalesRecapRange;
  }
) {
  if (activities.length === 0) return ['No activities were captured in this period.'];

  const topType = topCount(context.activityTypeBreakdown);
  const expectedDays = periodType === 'week' ? 5 : countWorkingDays(context.period.start, context.period.end);
  const missedDays = Math.max(0, expectedDays - context.activeDays);

  return [
    `You touched ${context.accountsTouched.length} account${context.accountsTouched.length === 1 ? '' : 's'} this ${periodType}.`,
    topType ? `Most activity came from ${topType}.` : 'No dominant activity type emerged.',
    `${context.openNextActionsCount} activit${context.openNextActionsCount === 1 ? 'y created' : 'ies created'} next actions.`,
    `${context.objectionsCount} objection-related activit${context.objectionsCount === 1 ? 'y was' : 'ies were'} captured.`,
    missedDays > 0
      ? `No activity was captured for ${missedDays} working day${missedDays === 1 ? '' : 's'}.`
      : 'Activity was captured across the expected working cadence.',
  ];
}

function buildRecommendedActions(
  activities: SalesActivityRecord[],
  context: {
    openNextActionsCount: number;
    objectionsCount: number;
    stalledAccounts: string[];
    vagueActivityCount: number;
  }
) {
  if (activities.length === 0) {
    return ['Capture daily customer activity before generating a sales recap.'];
  }

  const actions = [
    context.openNextActionsCount > 0 ? 'Follow up on open next actions.' : '',
    context.objectionsCount > 0 ? 'Review objection-related accounts.' : '',
    context.stalledAccounts.length > 0 ? 'Prioritize accounts with activity but no clear next action.' : '',
    context.vagueActivityCount > 0 ? 'Capture more detail for accounts with vague summaries.' : '',
  ].filter(Boolean);

  return actions.length > 0 ? actions : ['Pipeline activity looks clean. Prepare concise review notes for key accounts.'];
}

function getTopAccounts(activities: SalesActivityRecord[]) {
  return Object.entries(countBy(activities.map((activity) => activity.accountName).filter(Boolean)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([accountName, count]) => ({ accountName, count }));
}

function groupByAccount(activities: SalesActivityRecord[]) {
  return activities.reduce<Record<string, SalesActivityRecord[]>>((groups, activity) => {
    if (!activity.accountName) return groups;
    groups[activity.accountName] = groups[activity.accountName] || [];
    groups[activity.accountName].push(activity);
    return groups;
  }, {});
}

function uniqueClean(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function getActivityOpportunityName(activity: SalesActivityRecord) {
  return activity.linkStatus === 'Linked'
    ? activity.linkedOpportunityName || activity.opportunityName
    : activity.opportunityName;
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function topCount(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function countWorkingDays(start: string, end: string) {
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  let days = 0;
  while (cursor <= endDate) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function isVague(summary: string) {
  return summary.length < 35 || /\b(good|ok|talked|discussed|followed up|update)\b/i.test(summary);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
