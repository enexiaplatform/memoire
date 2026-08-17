import type { NudgeRecord } from '../services/nudgeStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';
import { normalizeEntityName } from './accountIdentity.ts';

export type MorningBriefQuestion = {
  label: string;
  href: string;
};

export type MorningBrief = {
  headline: string;
  focus: string[];
  questions: MorningBriefQuestion[];
};

type MorningBriefInput = {
  nudges: NudgeRecord[];
  activities: SalesActivityRecord[];
  waitingFollowUps?: number;
  /**
   * Paid customers going quiet. Passed as a count (not read from `nudges`)
   * because retention is low urgency and lives below the Today nudge cap -
   * the brief must still be able to offer the retention question.
   */
  retentionCount?: number;
  /**
   * Nudges the cockpit above the brief has already put on screen.
   *
   * The brief opened with `nudges[0]` and the cockpit's "which deals are hot"
   * card picked the same record, formatted the same way - so the top of Today
   * printed one sentence twice, about 100px apart. The brief keeps its headline
   * (a count, not a record) and moves on to the next thing the operator has not
   * already been told.
   */
  claimedNudgeIds?: string[];
  /**
   * Customers the cockpit already named. A workspace usually raises more than
   * one alarm per struggling account, so skipping by nudge id alone just moved
   * the brief onto the *other* alarm about the same customer.
   */
  claimedAccounts?: string[];
  today?: string;
};

/**
 * Ask Memoire, but proactive: instead of waiting for the seller to think of
 * a question, the brief opens the day with the answers that matter and three
 * ready-to-run questions deep-linked into Ask Memoire (?question=...).
 */
export function buildMorningBrief(input: MorningBriefInput): MorningBrief {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const nudges = input.nudges || [];
  const urgent = nudges.filter((nudge) => nudge.urgency === 'critical' || nudge.urgency === 'high');
  const claimed = new Set(input.claimedNudgeIds || []);
  // Both sides on the canonical key. Normalising only one of them would be worse
  // than normalising neither: the comparison would never match at all.
  const claimedAccounts = new Set((input.claimedAccounts || []).map((name) => normalizeEntityName(name)).filter(Boolean));
  const unclaimed = (nudge: NudgeRecord) => (
    !claimed.has(nudge.id) && !claimedAccounts.has(normalizeEntityName(nudge.accountName || ''))
  );
  // No fallback on purpose. If every nudge is already on a card above, the
  // brief has nothing to add about deals, and the honest move is to say the
  // other two things it knows rather than repeat the strip. The headline still
  // carries the count.
  const topNudge = nudges.find(unclaimed);

  const headline = urgent.length > 0
    ? `${urgent.length} ${urgent.length === 1 ? 'deal needs' : 'deals need'} attention before anything else.`
    : 'No deals are at risk this morning. Use today to build momentum.';

  const focus: string[] = [];
  if (topNudge) {
    const entity = [topNudge.accountName, topNudge.opportunityName].filter(Boolean).join(' / ');
    focus.push(entity ? `${topNudge.title}: ${entity}.` : `${topNudge.title}.`);
  }
  const yesterdayTouches = countTouchesOn(input.activities, addDays(today, -1));
  focus.push(yesterdayTouches > 0
    ? `You captured ${yesterdayTouches} customer ${yesterdayTouches === 1 ? 'touch' : 'touches'} yesterday.`
    : 'No touches captured yesterday. Capture the first one right after your next call.');
  if (typeof input.waitingFollowUps === 'number' && input.waitingFollowUps > 0) {
    focus.push(`${input.waitingFollowUps} sent ${input.waitingFollowUps === 1 ? 'follow-up is' : 'follow-ups are'} still waiting on a reply.`);
  }

  return { headline, focus: focus.slice(0, 3), questions: buildQuestions(nudges, input.waitingFollowUps || 0, input.retentionCount || 0) };
}

function buildQuestions(nudges: NudgeRecord[], waitingFollowUps: number, retentionCount: number): MorningBriefQuestion[] {
  const questions: MorningBriefQuestion[] = [];

  const silenceNudge = nudges.find((nudge) => /silent|silence/i.test(nudge.title));
  if (silenceNudge?.accountName) {
    // Scope the question to the flagged deal when possible so Ask Memoire
    // answers from that deal's memory instead of the whole workspace.
    const scoped = silenceNudge.entityType === 'opportunity' && silenceNudge.entityId
      ? { scope: 'opportunity', opportunityId: silenceNudge.entityId }
      : undefined;
    questions.push(askQuestion(`Why is ${silenceNudge.accountName} going quiet and what should I send?`, scoped));
  }

  const objectionNudge = nudges.find((nudge) => nudge.source === 'objection');
  if (objectionNudge) {
    questions.push(askQuestion('Which unresolved objections are blocking my pipeline right now?'));
  }

  // A deal flagged for something other than silence still deserves a
  // one-tap "where does it stand" that Ask answers from the journey model -
  // but only for an account not already covered by an earlier question, so
  // the brief never asks two things about the same deal.
  const dealNudge = nudges.find((nudge) => Boolean(nudge.accountName)
    && (nudge.entityType === 'opportunity' || nudge.entityType === 'quote')
    && !/silent|silence/i.test(nudge.title)
    && !questions.some((question) => question.label.includes(nudge.accountName || '\0')));
  if (dealNudge?.accountName) {
    const scoped = dealNudge.entityType === 'opportunity' && dealNudge.entityId
      ? { scope: 'opportunity', opportunityId: dealNudge.entityId }
      : undefined;
    questions.push(askQuestion(`Where does ${dealNudge.accountName} stand?`, scoped));
  }

  // A paid customer going quiet is a keep-warm prompt; the retention answer
  // lists every such account from measured history.
  if (retentionCount > 0) {
    questions.push(askQuestion('Which customers should I check back with?'));
  }

  if (waitingFollowUps > 0) {
    questions.push(askQuestion('Did my follow-ups work?'));
  }

  questions.push(askQuestion('What should I do first today?'));
  if (questions.length < 3) {
    questions.push(askQuestion('What changed in my pipeline since last week?'));
  }

  return dedupeQuestions(questions).slice(0, 3);
}

function askQuestion(label: string, scoped?: { scope: string; opportunityId: string }): MorningBriefQuestion {
  const params = new URLSearchParams({ question: label });
  if (scoped) {
    params.set('scope', scoped.scope);
    params.set('opportunityId', scoped.opportunityId);
  }
  return { label, href: `/app/ask?${params.toString()}` };
}

function dedupeQuestions(questions: MorningBriefQuestion[]) {
  const seen = new Set<string>();
  return questions.filter((question) => {
    if (seen.has(question.label)) return false;
    seen.add(question.label);
    return true;
  });
}

function countTouchesOn(activities: SalesActivityRecord[], dateKey: string) {
  return activities.filter((activity) => isValidBusinessDate(activity.activityDate) && activity.activityDate === dateKey).length;
}

function addDays(dateKey: string, days: number) {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}
