import type { SalesActivityRecord } from '../services/salesActivityStore.ts';

/**
 * Finding the touches that belong to a deal, without reading every touch again
 * for every deal.
 *
 * Two places in the app answer "which activities are about this opportunity",
 * and both did it the same way: filter the whole activity array, normalising
 * two or three strings per record, once per opportunity. At the founder's own
 * scale - 300 deals, 900 touches - that is 810,000 `trim().toLowerCase()` calls
 * to answer three hundred questions, and it was the single largest cost of
 * loading Today: 1.6 seconds of a 6.8 second cold load, measured 2026-08-03.
 *
 * The fix is not a faster filter, it is not filtering. Each activity is bucketed
 * once by the keys a deal can match it on, and each lookup then reads a handful
 * of records instead of nine hundred.
 *
 * Two things this deliberately does not do:
 *
 * - It does not unify the two definitions of "related". They differ - one
 *   matches any touch on the account, the other only when the opportunity name
 *   also appears - and quietly making them the same would change what Today and
 *   the playbook say about a deal. One index, two queries.
 * - It does not use `accountKey`. That is the app's canonical, diacritic- and
 *   punctuation-insensitive identity, and these two joins have always used plain
 *   lowercase equality. Switching them here would be a behaviour change hidden
 *   inside a performance change; if they should be canonical, that is its own
 *   decision with its own contract.
 */

type ActivityIndex = {
  byOpportunityId: Map<string, SalesActivityRecord[]>;
  /** `linkedOpportunityName || opportunityName`, lowercased. */
  byOpportunityName: Map<string, SalesActivityRecord[]>;
  /** `linkedOpportunityName` only, and only when the record has one. */
  byLinkedOpportunityName: Map<string, SalesActivityRecord[]>;
  /** `linkedAccountName || accountName`, lowercased. */
  byAccount: Map<string, SalesActivityRecord[]>;
  /** Position in the source array, so a union can be put back in array order. */
  position: Map<SalesActivityRecord, number>;
};

/**
 * Keyed on the array itself. Callers pass the same `activities` array for every
 * opportunity in a render - that is the whole point - and a WeakMap means a
 * workspace that reloads its records drops the old index with them rather than
 * growing a cache nobody clears.
 */
const indexes = new WeakMap<SalesActivityRecord[], ActivityIndex>();

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function push(map: Map<string, SalesActivityRecord[]>, key: string, activity: SalesActivityRecord) {
  const bucket = map.get(key);
  if (bucket) bucket.push(activity);
  else map.set(key, [activity]);
}

export function buildActivityIndex(activities: SalesActivityRecord[]): ActivityIndex {
  const cached = indexes.get(activities);
  if (cached) return cached;

  const index: ActivityIndex = {
    byOpportunityId: new Map(),
    byOpportunityName: new Map(),
    byLinkedOpportunityName: new Map(),
    byAccount: new Map(),
    position: new Map(),
  };

  activities.forEach((activity, order) => {
    index.position.set(activity, order);
    // Indexed even when empty: the filters this replaces compared the raw
    // strings, so an opportunity with no id matched every unlinked activity.
    // Nothing in the app has an id-less opportunity, but a performance change
    // is not the place to decide that.
    push(index.byOpportunityId, activity.linkedOpportunityId || '', activity);
    push(index.byOpportunityName, normalize(activity.linkedOpportunityName || activity.opportunityName || ''), activity);
    if (activity.linkedOpportunityName) {
      push(index.byLinkedOpportunityName, normalize(activity.linkedOpportunityName), activity);
    }
    push(index.byAccount, normalize(activity.linkedAccountName || activity.accountName || ''), activity);
  });

  indexes.set(activities, index);
  return index;
}

/** Buckets back to one array, deduplicated, in the order the source had them. */
function inSourceOrder(index: ActivityIndex, buckets: SalesActivityRecord[][]) {
  const seen = new Set<SalesActivityRecord>();
  buckets.forEach((bucket) => bucket.forEach((activity) => seen.add(activity)));
  if (seen.size === 0) return [];
  return Array.from(seen).sort((left, right) => (index.position.get(left) || 0) - (index.position.get(right) || 0));
}

/**
 * The playbook's definition: this deal by id, or by opportunity name, or any
 * touch on the account at all. Broad on purpose - it is looking for patterns
 * across a customer, not evidence about one deal.
 */
export function activitiesForOpportunityBroad(
  opportunity: { id: string; accountName: string; opportunityName: string },
  activities: SalesActivityRecord[],
): SalesActivityRecord[] {
  if (activities.length === 0) return [];
  const index = buildActivityIndex(activities);

  return inSourceOrder(index, [
    index.byOpportunityId.get(opportunity.id) || [],
    index.byOpportunityName.get(normalize(opportunity.opportunityName)) || [],
    index.byAccount.get(normalize(opportunity.accountName)) || [],
  ]);
}

/**
 * MEDDIC's definition: this deal by id, or by an explicit link, or a touch on
 * the account whose own opportunity name contains this deal's. Narrower,
 * because it is deciding whether there is evidence about *this* deal.
 */
export function activitiesForOpportunityStrict(
  opportunity: { id: string; accountName: string; opportunityName: string },
  activities: SalesActivityRecord[],
): SalesActivityRecord[] {
  if (activities.length === 0) return [];
  const index = buildActivityIndex(activities);
  const opportunityName = normalize(opportunity.opportunityName);

  const onAccount = index.byAccount.get(normalize(opportunity.accountName)) || [];
  const named = onAccount.filter((activity) => normalize(activity.opportunityName || '').includes(opportunityName));

  return inSourceOrder(index, [
    index.byOpportunityId.get(opportunity.id) || [],
    index.byLinkedOpportunityName.get(opportunityName) || [],
    named,
  ]);
}
