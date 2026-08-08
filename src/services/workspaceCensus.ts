import { writeLocalCollection } from './localWriteGuard.ts';

/**
 * How many records the cloud last held, per collection.
 *
 * This exists to answer one question honestly: is the browser copy worth showing
 * instead of waiting for the cloud?
 *
 * The first-paint fast path used to ask "does the browser copy contain any record
 * at all", and that test passes for a browser copy holding eleven opportunities
 * and nothing else - which is what a signed-in seller's localStorage actually
 * contains, because nothing mirrors a cloud load back into it. Only records the
 * seller created or edited on this device are written there. So the fast path
 * drew a workspace with 0 accounts, 0 stakeholders and 11 of 126 deals, held it
 * for the rest of the session, and every request behind it returned 200. From the
 * seller's chair that is indistinguishable from having lost their business.
 *
 * A census is a few hundred bytes and it is the difference between "this browser
 * has a workspace" and "this browser has some of a workspace". If the counts do
 * not line up, the screen waits for the cloud - which is about a second - instead
 * of confidently rendering a fragment.
 */

const CENSUS_STORAGE_KEY = 'memoire.workspace.census.v1';

/**
 * How much thinner than the cloud a browser copy may be and still be shown.
 *
 * Not zero: a cloud load and a local read are never taken at the same instant,
 * and a record deleted on another device would otherwise pin the fast path off
 * forever. Not generous either - 5% of a 1,738-row collection is 86 rows, and
 * nobody should be shown a stakeholder list missing 87 people.
 */
const ACCEPTABLE_SHORTFALL = 0.05;

export type WorkspaceCensus = {
  /** Collection name to the number of records the cloud returned. */
  counts: Record<string, number>;
  at: string;
};

type CensusFile = Record<string, WorkspaceCensus>;

/** Records what a successful cloud load actually contained. */
export function recordWorkspaceCensus(userId: string, workspace: Record<string, unknown>) {
  const counts: Record<string, number> = {};
  for (const [collection, value] of Object.entries(workspace)) {
    if (Array.isArray(value)) counts[collection] = value.length;
  }

  const file = readCensusFile();
  file[userId] = { counts, at: new Date().toISOString() };
  writeLocalCollection(CENSUS_STORAGE_KEY, JSON.stringify(file));
}

export function getWorkspaceCensus(userId: string): WorkspaceCensus | null {
  return readCensusFile()[userId] || null;
}

export function clearWorkspaceCensus(userId: string) {
  const file = readCensusFile();
  if (!(userId in file)) return;
  delete file[userId];
  writeLocalCollection(CENSUS_STORAGE_KEY, JSON.stringify(file));
}

/**
 * Whether this browser's copy is complete enough to stand in for the cloud.
 *
 * No census means this device has never seen a successful cloud load, so there is
 * nothing to compare against and no basis for claiming the copy is whole. That
 * returns false on purpose: a new device, or one that has cleared its site data,
 * waits for the real answer rather than being told its business is empty.
 */
export function isLocalCopyComplete(userId: string, local: Record<string, unknown>): boolean {
  const census = getWorkspaceCensus(userId);
  if (!census) return false;

  const expected = Object.entries(census.counts).filter(([, count]) => count > 0);
  if (expected.length === 0) return false;

  return expected.every(([collection, count]) => {
    const value = local[collection];
    const have = Array.isArray(value) ? value.length : 0;
    return have >= Math.floor(count * (1 - ACCEPTABLE_SHORTFALL));
  });
}

/**
 * Which collections the browser copy is short on, and by how much. Used for the
 * console warning when the fast path is declined, so a slow first paint can be
 * explained rather than guessed at.
 */
export function describeLocalShortfall(userId: string, local: Record<string, unknown>): string {
  const census = getWorkspaceCensus(userId);
  if (!census) return 'no cloud load has ever completed on this device';

  const short = Object.entries(census.counts)
    .filter(([, count]) => count > 0)
    .map(([collection, count]) => {
      const value = local[collection];
      const have = Array.isArray(value) ? value.length : 0;
      return { collection, have, count };
    })
    .filter((entry) => entry.have < Math.floor(entry.count * (1 - ACCEPTABLE_SHORTFALL)));

  if (short.length === 0) return 'nothing';
  return short.map((entry) => `${entry.collection} ${entry.have}/${entry.count}`).join(', ');
}

function readCensusFile(): CensusFile {
  if (typeof localStorage === 'undefined') return {};
  const raw = localStorage.getItem(CENSUS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as CensusFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
