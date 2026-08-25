import { isValidBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * When each thing entered your memory.
 *
 * The Vault's map draws the business as it stands today. This turns the same
 * map into the six months that produced it: press play and the customers,
 * deals, products and people appear in the order you actually learned them,
 * with each relationship drawn at the moment it was first recorded.
 *
 * It is not an animation of the data changing - nothing here re-runs the graph.
 * The layout is computed once from the finished graph and the replay only
 * decides what is visible yet, which is both cheap and the reason nothing
 * jumps: a node sits in its final place from the first frame it appears in.
 *
 * What it deliberately does NOT claim: that the marks on a card fill over time.
 * A dimension is answered by a record, and records do not carry the date the
 * answer arrived - only the date the record did. Animating the marks would be
 * inventing a history, so the replay animates only what it can prove: when a
 * thing was first written down, and when a relationship first was.
 */

export type ReplayTimeline = {
  /** Earliest date anything was recorded, or '' when nothing is dated. */
  start: string;
  /** Today, or the newest record if the book runs into the future. */
  end: string;
  /** Every date on which something was first learned, in order. */
  steps: string[];
  /** First date each node appears in memory. Nodes with no dated memory are absent. */
  firstSeen: Map<string, string>;
  /**
   * Nodes with nothing dated behind them.
   *
   * They are shown from the first frame rather than hidden or dumped at the
   * end: a record with no readable date is not a record from the beginning of
   * time, and it is not one from today either. Holding it constant is the only
   * honest position, and the UI says how many are in that state.
   */
  undated: string[];
};

export function buildReplayTimeline(
  memory: Map<string, { date: string }[]>,
  nodeIds: string[],
  today: string = todayDateKey(),
): ReplayTimeline {
  const firstSeen = new Map<string, string>();
  const undated: string[] = [];

  for (const id of nodeIds) {
    const entries = memory.get(id) || [];
    let earliest = '';
    for (const entry of entries) {
      const key = typeof entry.date === 'string' ? entry.date.slice(0, 10) : '';
      if (!isValidBusinessDate(key)) continue;
      if (!earliest || key < earliest) earliest = key;
    }
    if (earliest) firstSeen.set(id, earliest);
    else undated.push(id);
  }

  const steps = [...new Set(firstSeen.values())].sort();
  const newest = steps.length > 0 ? steps[steps.length - 1] : '';
  return {
    start: steps[0] || '',
    // A book can carry a record dated ahead of today; the scrubber has to reach
    // it or the last thing you learned is unreachable.
    end: newest && newest > today ? newest : today,
    steps,
    firstSeen,
    undated,
  };
}

/**
 * Which nodes exist yet at this point in the replay.
 *
 * `at` is a date key. Everything first seen on or before it is revealed, plus
 * everything undated, which is present throughout.
 */
export function revealedAt(timeline: ReplayTimeline, at: string): Set<string> {
  const revealed = new Set<string>(timeline.undated);
  for (const [id, first] of timeline.firstSeen) {
    if (first <= at) revealed.add(id);
  }
  return revealed;
}

/**
 * How many frames the replay plays, and how long each one holds.
 *
 * One frame per date something was learned rather than one per calendar day: a
 * six-month book with activity on thirty days should take about as long to
 * replay as a six-week one with the same thirty, because the story is the
 * thirty, not the gaps between them.
 */
export const REPLAY_FRAME_MS = 420;

/**
 * How many distinct moments a book needs before a replay is worth offering.
 *
 * An imported pipeline arrives on one day, so every record behind it carries
 * the same date and the replay collapses to a single frame that reveals
 * everything at once - which looks broken and says nothing. Below this the
 * control is simply not offered; a workspace built by capture over months
 * clears it easily, and one that does not has no story to play yet.
 */
export const REPLAY_MIN_MOMENTS = 4;

export function canReplay(timeline: ReplayTimeline) {
  return timeline.steps.length >= REPLAY_MIN_MOMENTS;
}

export function replayLabel(timeline: ReplayTimeline, at: string) {
  if (!at || timeline.steps.length === 0) return '';
  const index = timeline.steps.filter((step) => step <= at).length;
  return `${index} of ${timeline.steps.length} moments`;
}
