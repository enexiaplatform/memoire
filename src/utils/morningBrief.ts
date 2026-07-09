import type { NudgeRecord } from '../services/nudgeStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

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
  const topNudge = nudges[0];

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

  return { headline, focus: focus.slice(0, 3), questions: buildQuestions(nudges) };
}

function buildQuestions(nudges: NudgeRecord[]): MorningBriefQuestion[] {
  const questions: MorningBriefQuestion[] = [];

  const silenceNudge = nudges.find((nudge) => /silent|silence/i.test(nudge.title));
  if (silenceNudge?.accountName) {
    questions.push(askQuestion(`Why is ${silenceNudge.accountName} going quiet and what should I send?`));
  }

  const objectionNudge = nudges.find((nudge) => nudge.source === 'objection');
  if (objectionNudge) {
    questions.push(askQuestion('Which unresolved objections are blocking my pipeline right now?'));
  }

  questions.push(askQuestion('What should I do first today?'));
  if (questions.length < 3) {
    questions.push(askQuestion('What changed in my pipeline since last week?'));
  }

  return dedupeQuestions(questions).slice(0, 3);
}

function askQuestion(label: string): MorningBriefQuestion {
  return { label, href: `/app/ask?question=${encodeURIComponent(label)}` };
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
