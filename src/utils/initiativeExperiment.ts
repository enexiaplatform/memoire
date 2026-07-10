import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { compareSafeBusinessDate, isValidBusinessDate } from './safeDate.ts';

export const initiativeDecisions = ['undecided', 'continue', 'adjust', 'stop'] as const;

export type InitiativeDecision = (typeof initiativeDecisions)[number];

export type InitiativeExperimentFields = {
  hypothesis: string;
  expectedSignal: string;
  currentSignal: string;
  decision: InitiativeDecision;
  decisionNote: string;
};

const PAYLOAD_KEY = 'experiment';

/**
 * Stage 2 of the Commercial OS direction: initiatives answer "what am I
 * testing, what do I expect, what is the signal, continue/adjust/stop".
 * The fields live inside the existing OperatingContext `payload` column
 * (derive-don't-migrate: no schema change, old records read as empty).
 */
export function readInitiativeExperiment(payload: Record<string, unknown> | null | undefined): InitiativeExperimentFields {
  const raw = payload && typeof payload === 'object' ? payload[PAYLOAD_KEY] : null;
  const fields = raw && typeof raw === 'object' ? raw as Partial<InitiativeExperimentFields> : {};
  return {
    hypothesis: cleanText(fields.hypothesis),
    expectedSignal: cleanText(fields.expectedSignal),
    currentSignal: cleanText(fields.currentSignal),
    decision: initiativeDecisions.includes(fields.decision as InitiativeDecision)
      ? fields.decision as InitiativeDecision
      : 'undecided',
    decisionNote: cleanText(fields.decisionNote),
  };
}

export function writeInitiativeExperiment(
  payload: Record<string, unknown> | null | undefined,
  fields: InitiativeExperimentFields,
): Record<string, unknown> {
  const base = payload && typeof payload === 'object' ? payload : {};
  const isEmpty = !fields.hypothesis && !fields.expectedSignal && !fields.currentSignal
    && fields.decision === 'undecided' && !fields.decisionNote;
  if (isEmpty) {
    const { [PAYLOAD_KEY]: _removed, ...rest } = base;
    void _removed;
    return rest;
  }
  return { ...base, [PAYLOAD_KEY]: { ...fields } };
}

export function initiativeDecisionLabel(decision: InitiativeDecision) {
  return {
    undecided: 'Undecided',
    continue: 'Continue',
    adjust: 'Adjust',
    stop: 'Stop',
  }[decision];
}

export function initiativeDecisionTone(decision: InitiativeDecision) {
  return {
    undecided: 'bg-gray-100 text-gray-600',
    continue: 'bg-emerald-50 text-emerald-700',
    adjust: 'bg-amber-50 text-amber-800',
    stop: 'bg-red-50 text-red-700',
  }[decision];
}

/**
 * Activities related to an initiative, matched by title tokens against the
 * captured text (same rule the stall detector uses), newest first. This is
 * a read-model: nothing is stored, so renames re-match automatically.
 */
export function listInitiativeActivities(
  title: string,
  activities: SalesActivityRecord[],
  limit = 6,
): SalesActivityRecord[] {
  const tokens = normalize(title).split(' ').filter((token) => token.length >= 4);
  if (tokens.length === 0) return [];
  return activities
    .filter((activity) => {
      const text = normalize(`${activity.summary} ${activity.rawNote} ${(activity.tags || []).join(' ')}`);
      return tokens.some((token) => text.includes(token));
    })
    .filter((activity) => isValidBusinessDate(activity.activityDate))
    .sort((a, b) => compareSafeBusinessDate(b.activityDate, a.activityDate))
    .slice(0, limit);
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalize(value?: string) {
  return (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
