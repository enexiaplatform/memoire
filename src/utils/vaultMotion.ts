import { isValidBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * What the Business Vault's map is allowed to animate, and what each motion
 * means.
 *
 * The rule this file exists to enforce: **every animation on the map encodes a
 * fact the graph already computed.** Nothing moves for decoration. A node that
 * pulses is telling you something is missing; a line that flows is telling you
 * which way the relationship reads and whether money travels along it; a card
 * that has faded is telling you nobody has touched it in months.
 *
 * That constraint is the whole point. A prettier node-link diagram is a
 * weekend's work for anyone. A map whose motion is a readout of how complete
 * your business memory is, and how fast it is going stale, can only be built on
 * top of a knowledge model that knows what "complete" would even mean - which
 * is the part that took the product a year.
 *
 * The corollary is that the legend is not optional. A motion nobody can decode
 * is decoration wearing a lab coat, so `motionLegend` below is rendered beside
 * the map and every entry here appears in it.
 */

/**
 * How long memory stays fresh before the map starts showing its age.
 *
 * These are not arbitrary. A fortnight is one sales cycle's worth of contact,
 * six weeks is the point the silence engine starts calling an account quiet,
 * and four months is longer than any quarter - past it, what you remember about
 * a customer is a claim about the past rather than a description of the present.
 */
export const FRESH_DAYS = 14;
export const SETTLING_DAYS = 45;
export const FADING_DAYS = 120;

export type MemoryAge = 'fresh' | 'settling' | 'fading' | 'cold' | 'undated';

export const memoryAgeLabels: Record<MemoryAge, string> = {
  fresh: 'Touched in the last two weeks',
  settling: 'Touched in the last six weeks',
  fading: 'Nothing new for months',
  cold: 'Not touched since before last quarter',
  undated: 'No readable date on this record',
};

/**
 * How faded the card is drawn, per age band.
 *
 * `undated` is deliberately NOT the most faded. A record whose date cannot be
 * read is not a record nobody has touched, and drawing it as the coldest thing
 * on the map would state something the data does not support - the same trap
 * that made an unreadable date the "most recent touch" elsewhere in this
 * codebase. It renders at full strength and says so in words instead.
 */
export const memoryAgeOpacity: Record<MemoryAge, number> = {
  fresh: 1,
  settling: 0.92,
  fading: 0.78,
  cold: 0.62,
  undated: 1,
};

function daysSince(dateKey: string, today: string) {
  const from = Date.parse(`${dateKey}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * How long ago this part of the business was last touched.
 *
 * A date in the future is treated as fresh rather than as an error: an operator
 * who books next week's site visit has touched that customer today, and the
 * record carrying tomorrow's date is the proof.
 */
export function memoryAgeFor(updatedAt: unknown, today: string = todayDateKey()): MemoryAge {
  const key = typeof updatedAt === 'string' ? updatedAt.slice(0, 10) : '';
  if (!isValidBusinessDate(key)) return 'undated';
  const days = daysSince(key, today);
  if (days === null) return 'undated';
  if (days <= FRESH_DAYS) return 'fresh';
  if (days <= SETTLING_DAYS) return 'settling';
  if (days <= FADING_DAYS) return 'fading';
  return 'cold';
}

export type NodeMotion = {
  /** 0..1 of the things worth knowing that are written down. */
  completeness: number;
  /** Known and total, carried so the UI can say the count rather than a percent. */
  known: number;
  total: number;
  age: MemoryAge;
  /** Card opacity for the age band. */
  opacity: number;
  /**
   * The unknown arc sweeps only when something is genuinely missing AND the
   * node is close enough to the focus to be readable. A map where forty nodes
   * pulse at once is a fairground, and the signal is gone.
   */
  searching: boolean;
};

/**
 * Beyond this ring, motion is switched off.
 *
 * The outer ring is context. It is drawn so you can see the shape of the
 * neighbourhood, not so you can audit it, and forty simultaneous animations
 * destroy the one or two that matter.
 */
export const MOTION_RING_LIMIT = 1;

export function nodeMotionFor(
  input: { updatedAt: unknown; ring: number; focused?: boolean },
  health: { known: number; total: number } | undefined,
  today: string = todayDateKey(),
): NodeMotion {
  const known = health?.known ?? 0;
  const total = health?.total ?? 0;
  const completeness = total > 0 ? Math.min(Math.max(known / total, 0), 1) : 0;
  const age = memoryAgeFor(input.updatedAt, today);
  return {
    completeness,
    known,
    total,
    age,
    opacity: memoryAgeOpacity[age],
    searching: total > 0
      && known < total
      && (input.focused === true || input.ring <= MOTION_RING_LIMIT),
  };
}

export type EdgeMotion = {
  /** Dashes travel from `from` to `to`, so the relation reads in one direction. */
  flowing: boolean;
  /** Seconds for one dash to travel the line. Lower is faster. */
  duration: number;
  /** Money moves along this relation, so it is drawn as the live one. */
  carriesValue: boolean;
};

/**
 * Which relations are drawn as live.
 *
 * Only the ones touching the focus. Every edge flowing at once says nothing
 * about any of them, and the question the map answers when you select a
 * customer is "what runs through this one", not "what runs through everything".
 */
export function edgeMotionFor(input: { primary: boolean; valueBase: number }): EdgeMotion {
  const carriesValue = input.primary && input.valueBase > 0;
  return {
    flowing: input.primary,
    // Money-carrying relations run faster, so the eye lands on them first in a
    // neighbourhood where several things are moving.
    duration: carriesValue ? 1.8 : 3.2,
    carriesValue,
  };
}

/**
 * The map's key, in the order the eye meets it.
 *
 * Rendered beside the map rather than hidden behind a tooltip, because a motion
 * the reader cannot decode is decoration, and this product does not ship
 * numbers or pictures whose rule it will not state.
 */
export const motionLegend: { id: string; title: string; meaning: string }[] = [
  {
    id: 'marks',
    title: 'The marks on a card',
    meaning: 'One per thing worth knowing about that record, filled when it is written down.',
  },
  {
    id: 'breathing',
    title: 'Marks that breathe',
    meaning: 'Still missing. Select the card and the drawer lists exactly which ones.',
  },
  {
    id: 'fade',
    title: 'A faded card',
    meaning: 'Nobody has touched it recently. The longer the silence, the fainter it is drawn.',
  },
  {
    id: 'flow',
    title: 'A line with moving dashes',
    meaning: 'A live relation, read in the direction of travel. Faster dashes carry money.',
  },
];
