import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { compareSafeBusinessDate, isValidBusinessDate } from './safeDate.ts';

const PAYLOAD_KEY = 'linkedActivityIds';

export type InitiativeActivityLink = {
  activity: SalesActivityRecord;
  source: 'linked' | 'mentioned';
};

/**
 * Direction 7.2 gap: explicit activity <-> initiative linking. The link
 * list lives inside the existing OperatingContext `payload` column
 * (derive-don't-migrate: no schema change, old records read as empty).
 * Explicit links complement the token matcher - they survive renames and
 * cover captures that never name the initiative.
 */
export function readLinkedActivityIds(payload: Record<string, unknown> | null | undefined): string[] {
  const raw = payload && typeof payload === 'object' ? payload[PAYLOAD_KEY] : null;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  raw.forEach((value) => {
    if (typeof value !== 'string' || !value.trim() || seen.has(value)) return;
    seen.add(value);
    ids.push(value);
  });
  return ids;
}

export function writeLinkedActivityIds(
  payload: Record<string, unknown> | null | undefined,
  ids: string[],
): Record<string, unknown> {
  const base = payload && typeof payload === 'object' ? payload : {};
  const cleaned = readLinkedActivityIds({ [PAYLOAD_KEY]: ids });
  if (cleaned.length === 0) {
    const { [PAYLOAD_KEY]: _removed, ...rest } = base;
    void _removed;
    return rest;
  }
  return { ...base, [PAYLOAD_KEY]: cleaned };
}

export function toggleLinkedActivity(
  payload: Record<string, unknown> | null | undefined,
  activityId: string,
): Record<string, unknown> {
  const current = readLinkedActivityIds(payload);
  const next = current.includes(activityId)
    ? current.filter((id) => id !== activityId)
    : [...current, activityId];
  return writeLinkedActivityIds(payload, next);
}

/**
 * The related-activity read-model: explicitly linked activities first
 * (they are the seller's own statement of relevance and are never dropped
 * by the cap), then token-matched mentions, each group newest first.
 */
export function listInitiativeActivityLinks(
  context: { title: string; payload: Record<string, unknown> | null | undefined },
  activities: SalesActivityRecord[],
  limit = 6,
): InitiativeActivityLink[] {
  const linkedIds = new Set(readLinkedActivityIds(context.payload));
  const byDateDesc = (a: SalesActivityRecord, b: SalesActivityRecord) => compareSafeBusinessDate(b.activityDate, a.activityDate);

  const linked = activities
    .filter((activity) => linkedIds.has(activity.id))
    .sort(byDateDesc)
    .map((activity) => ({ activity, source: 'linked' as const }));

  const tokens = normalize(context.title).split(' ').filter((token) => token.length >= 4);
  const mentioned = tokens.length === 0 ? [] : activities
    .filter((activity) => !linkedIds.has(activity.id))
    .filter((activity) => {
      const text = normalize(`${activity.summary} ${activity.rawNote} ${(activity.tags || []).join(' ')}`);
      return tokens.some((token) => text.includes(token));
    })
    .filter((activity) => isValidBusinessDate(activity.activityDate))
    .sort(byDateDesc)
    .map((activity) => ({ activity, source: 'mentioned' as const }));

  return [...linked, ...mentioned.slice(0, Math.max(0, limit - linked.length))];
}

function normalize(value?: string) {
  return (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
