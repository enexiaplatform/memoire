import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { isAttached, type ActivityEntry, type ActivityOrigin, type ActivityRelationType } from './activityLedger.ts';
import { resolveAccountName, type AccountAliasIndex } from './accountAliases.ts';
import { accountKey } from './accountIdentity.ts';
import type { BusinessDomain } from './businessDomain.ts';
import { isMoreRecentBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * The activity ledger read back as analysis.
 *
 * Everything here is a count over the same rows the stream below it shows, so
 * any number on the page can be reached by clicking. That constraint is the
 * whole design: a dashboard whose figures cannot be opened is a dashboard the
 * operator has to take on faith, and the first time one of them looks wrong the
 * page is dead. Nothing is stored, nothing is rounded into a score, and the two
 * measures that could flatter - attachment and follow-through - are both defined
 * so that they cannot.
 */

const DAY_MS = 86_400_000;
/** Below this, a share is a coincidence rather than a pattern. */
const MIN_ROWS_FOR_SHARE = 4;
const QUIET_MIN_DAYS = 14;

export type ActivityCount = { key: string; label: string; count: number; share: number };

export type SubjectRow = {
  key: string;
  name: string;
  type: ActivityRelationType;
  href: string;
  count: number;
  share: number;
  touches: number;
  tasks: number;
  done: number;
  open: number;
  overdue: number;
  /** Empty when nothing in this subject's history carries a readable date. */
  lastDate: string;
  /** Null when recency is unknown, which is never the same as touched today. */
  daysSinceLast: number | null;
  /** How the rows behind this subject got here: capture, a deal, an obligation, or typed. */
  origins: ActivityOrigin[];
};

export type ActivityMomentumReading = {
  current: number;
  previous: number;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
};

export type ActivityFollowThrough = {
  /** Dated work whose day has arrived: done plus overdue. */
  settled: number;
  done: number;
  overdue: number;
  /** Dated and still ahead of its day - not judged. */
  ahead: number;
  rate: number | null;
};

export type AttachmentReading = {
  attached: number;
  unresolved: number;
  internal: number;
  total: number;
  /** attached / (attached + unresolved). Internal work is excluded - see below. */
  rate: number | null;
};

export type SilentSubject = { name: string; type: ActivityRelationType; href: string; daysSinceLast: number | null };

export type CoverageGap = { name: string; href: string; reason: 'open deal' | 'account' };

export type ActivityAnalytics = {
  total: number;
  touches: number;
  tasks: number;
  states: { done: number; open: number; overdue: number };
  activeDays: number;
  perActiveDay: number | null;
  busiestDay: { date: string; count: number } | null;
  momentum: ActivityMomentumReading;
  attachment: AttachmentReading;
  followThrough: ActivityFollowThrough;
  relationMix: ActivityCount[];
  domainMix: ActivityCount[];
  typeMix: ActivityCount[];
  originMix: ActivityCount[];
  subjects: SubjectRow[];
  /** Names the operator is working that the workspace cannot report on yet. */
  unresolvedSubjects: SubjectRow[];
  /** Share of everything that went to the three biggest subjects. */
  concentration: number | null;
  weekTrend: { weekStart: string; count: number; done: number }[];
  weekdayShape: { weekday: number; label: string; count: number }[];
  heatmap: { date: string; count: number }[];
  silentSubjects: SilentSubject[];
  coverageGaps: CoverageGap[];
  headline: string;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildActivityAnalytics(input: {
  /** The ledger for the selected period. */
  entries: ActivityEntry[];
  /** The same length of time immediately before it, for momentum. */
  previousEntries?: ActivityEntry[];
  /**
   * Every entry the workspace has, however old. Recency questions - who has gone
   * quiet - are meaningless inside a window, because a customer last touched
   * before the window starts looks identical to one never touched at all.
   */
  allEntries?: ActivityEntry[];
  range: { start: string; end: string };
  opportunities?: CrmLiteOpportunity[];
  accounts?: AccountMemoryRecord[];
  accountAliases?: AccountAliasIndex;
  today?: string;
}): ActivityAnalytics {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const entries = input.entries;
  const allEntries = input.allEntries || entries;
  const total = entries.length;

  const states = {
    done: entries.filter((entry) => entry.state === 'done').length,
    open: entries.filter((entry) => entry.state === 'open').length,
    overdue: entries.filter((entry) => entry.state === 'overdue').length,
  };

  const dayCounts = tally(entries, (entry) => entry.date);
  const busiest = biggest(dayCounts);
  const subjects = buildSubjects(entries, allEntries, today);
  const attachment = buildAttachment(entries);
  const followThrough = buildFollowThrough(entries);

  const previous = input.previousEntries || [];
  const deltaPct = previous.length === 0 ? null : Math.round(((total - previous.length) / previous.length) * 100);

  return {
    total,
    touches: entries.filter((entry) => entry.kind === 'event').length,
    tasks: entries.filter((entry) => entry.kind === 'task').length,
    states,
    activeDays: dayCounts.size,
    perActiveDay: dayCounts.size === 0 ? null : Math.round((total / dayCounts.size) * 10) / 10,
    busiestDay: busiest ? { date: busiest.key, count: busiest.count } : null,
    momentum: {
      current: total,
      previous: previous.length,
      deltaPct,
      direction: total > previous.length ? 'up' : total < previous.length ? 'down' : 'flat',
    },
    attachment,
    followThrough,
    relationMix: shareOf(tally(entries, (entry) => entry.relatedTo.type), total, relationLabel),
    domainMix: shareOf(tally(entries, (entry) => entry.domain), total),
    typeMix: shareOf(tally(entries, (entry) => entry.type), total),
    originMix: shareOf(tally(entries, (entry) => entry.origin), total, originLabel),
    subjects,
    unresolvedSubjects: subjects.filter((subject) => subject.type === 'unresolved'),
    concentration: total < MIN_ROWS_FOR_SHARE
      ? null
      : subjects.slice(0, 3).reduce((sum, subject) => sum + subject.count, 0) / total,
    weekTrend: buildWeekTrend(entries),
    weekdayShape: WEEKDAY_LABELS.map((label, weekday) => ({
      weekday,
      label,
      count: entries.filter((entry) => entry.weekday === weekday).length,
    })),
    heatmap: buildHeatmap(entries, input.range),
    silentSubjects: buildSilentSubjects(subjects, entries),
    coverageGaps: buildCoverageGaps(entries, input),
    headline: buildHeadline({ total, attachment, followThrough, subjects, deltaPct }),
  };
}

/**
 * Attachment: of the work that could have named a customer or a line, how much
 * did.
 *
 * Internal work is excluded from the denominator on purpose. Filing a KPI report
 * is not a failure to link anything - it genuinely serves the business and
 * nobody else - so counting it as unattached would make a well-run week look
 * careless and, worse, would let the operator improve the number by writing
 * fewer internal items down. What is left is the honest question: of the rows
 * that named a party, how many named one the business can actually report on.
 */
function buildAttachment(entries: ActivityEntry[]): AttachmentReading {
  const attached = entries.filter(isAttached).length;
  const unresolved = entries.filter((entry) => entry.relatedTo.type === 'unresolved').length;
  const internal = entries.filter((entry) => entry.relatedTo.type === 'internal').length;
  const named = attached + unresolved;
  return {
    attached,
    unresolved,
    internal,
    total: entries.length,
    rate: named === 0 ? null : attached / named,
  };
}

/**
 * Follow-through over dated work only, and only over work whose day has come.
 * A task dated next Tuesday is neither kept nor missed, so it sits in `ahead`
 * and stays out of the rate - otherwise a week spent planning properly would
 * report as a week of failure.
 */
function buildFollowThrough(entries: ActivityEntry[]): ActivityFollowThrough {
  const tasks = entries.filter((entry) => entry.kind === 'task');
  const done = tasks.filter((entry) => entry.state === 'done').length;
  const overdue = tasks.filter((entry) => entry.state === 'overdue').length;
  const settled = done + overdue;
  return {
    settled,
    done,
    overdue,
    ahead: tasks.filter((entry) => entry.state === 'open').length,
    rate: settled === 0 ? null : done / settled,
  };
}

function buildSubjects(entries: ActivityEntry[], allEntries: ActivityEntry[], today: string): SubjectRow[] {
  const groups = new Map<string, ActivityEntry[]>();
  entries.forEach((entry) => {
    const key = subjectKey(entry);
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  });

  // Recency is read across the whole workspace, not the window - see the note on
  // `allEntries` above.
  const lastSeen = new Map<string, string>();
  allEntries.forEach((entry) => {
    const key = subjectKey(entry);
    const existing = lastSeen.get(key);
    if (isMoreRecentBusinessDate(entry.date, existing)) lastSeen.set(key, entry.date);
  });

  const total = entries.length;
  return [...groups.entries()]
    .map(([key, rows]) => {
      // No readable date anywhere in this subject's history is a state of its
      // own. It used to arrive here as `rows[0].date`, and `daysBetween` turned
      // that into 0 - "last touched today" - which is the one answer that
      // guarantees the subject is never asked about again.
      const lastDate = lastSeen.get(key) || '';
      const daysSinceLast = lastDate ? daysBetween(lastDate, today) : null;
      return {
        key,
        name: rows[0].relatedTo.name,
        type: rows[0].relatedTo.type,
        href: rows[0].relatedTo.href,
        count: rows.length,
        share: total === 0 ? 0 : rows.length / total,
        touches: rows.filter((row) => row.kind === 'event').length,
        tasks: rows.filter((row) => row.kind === 'task').length,
        done: rows.filter((row) => row.state === 'done').length,
        open: rows.filter((row) => row.state === 'open').length,
        overdue: rows.filter((row) => row.state === 'overdue').length,
        lastDate,
        daysSinceLast,
        origins: [...new Set(rows.map((row) => row.origin))],
      };
    })
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

/**
 * Subjects worked in this period that have since gone quiet. Only customers and
 * lines qualify: internal domains are always "quiet" between reports, and saying
 * so every week would be noise the operator learns to ignore.
 */
function buildSilentSubjects(subjects: SubjectRow[], entries: ActivityEntry[]): SilentSubject[] {
  const worked = new Set(entries.map(subjectKey));
  return subjects
    .filter((subject) => subject.type !== 'internal')
    .filter((subject) => worked.has(subject.key))
    // Unknown recency belongs on this list, not off it. The subject was worked
    // in the period and nothing since can be shown to have happened, which is
    // the same question the operator needs to answer - it just carries no
    // number. Sorted last, so it never displaces a customer measurably quiet.
    .filter((subject) => subject.daysSinceLast === null || subject.daysSinceLast >= QUIET_MIN_DAYS)
    .sort((left, right) => (right.daysSinceLast ?? -1) - (left.daysSinceLast ?? -1))
    .slice(0, 6)
    .map((subject) => ({
      name: subject.name,
      type: subject.type,
      href: subject.href,
      daysSinceLast: subject.daysSinceLast,
    }));
}

/**
 * The reverse question, and the one a calendar can never answer: what the period
 * did *not* touch. An open deal with no activity in the window is the most
 * expensive row on this page.
 */
function buildCoverageGaps(
  entries: ActivityEntry[],
  input: { opportunities?: CrmLiteOpportunity[]; accounts?: AccountMemoryRecord[]; accountAliases?: AccountAliasIndex },
): CoverageGap[] {
  const touched = new Set(entries.map((entry) => accountKey(entry.relatedTo.name)));
  const touchedOpportunities = new Set(
    entries.filter((entry) => entry.relatedTo.type === 'opportunity').map((entry) => accountKey(entry.relatedTo.name)),
  );

  const gaps: CoverageGap[] = [];

  (input.opportunities || [])
    .filter((opportunity) => opportunity.status === 'Active')
    .forEach((opportunity) => {
      const account = resolveAccountName(opportunity.accountName || '', input.accountAliases);
      if (touched.has(accountKey(account)) || touchedOpportunities.has(accountKey(opportunity.opportunityName || ''))) return;
      gaps.push({
        name: `${account || 'Unknown account'} · ${opportunity.opportunityName || 'Deal'}`,
        href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
        reason: 'open deal',
      });
    });

  (input.accounts || []).forEach((account) => {
    const name = resolveAccountName(account.accountName || '', input.accountAliases);
    if (!name || touched.has(accountKey(name))) return;
    if (gaps.some((gap) => gap.name.startsWith(name))) return;
    gaps.push({ name, href: `/app/accounts?accountName=${encodeURIComponent(name)}`, reason: 'account' });
  });

  // Deals first: an untouched deal has a close date, an untouched account only
  // has potential.
  return gaps
    .sort((left, right) => (left.reason === right.reason ? left.name.localeCompare(right.name) : left.reason === 'open deal' ? -1 : 1))
    .slice(0, 8)
    .map((gap) => ({ ...gap, name: gap.name.trim() || 'Unnamed' }));
}

function buildWeekTrend(entries: ActivityEntry[]) {
  const weeks = new Map<string, { count: number; done: number }>();
  entries.forEach((entry) => {
    const bucket = weeks.get(entry.weekStart) || { count: 0, done: 0 };
    bucket.count += 1;
    if (entry.state === 'done') bucket.done += 1;
    weeks.set(entry.weekStart, bucket);
  });
  return [...weeks.entries()]
    .map(([weekStart, bucket]) => ({ weekStart, ...bucket }))
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
}

/**
 * One cell per day across the range, zeros included. The empty days are the
 * point: a heatmap with the gaps removed is a bar chart that lies about rhythm.
 */
function buildHeatmap(entries: ActivityEntry[], range: { start: string; end: string }) {
  const counts = tally(entries, (entry) => entry.date);
  const start = Date.parse(`${sanitizeBusinessDate(range.start)}T00:00:00Z`);
  const end = Date.parse(`${sanitizeBusinessDate(range.end)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];

  const days: { date: string; count: number }[] = [];
  const span = Math.min(Math.round((end - start) / DAY_MS), 400);
  for (let offset = 0; offset <= span; offset += 1) {
    const date = new Date(start + offset * DAY_MS).toISOString().slice(0, 10);
    days.push({ date, count: counts.get(date) || 0 });
  }
  return days;
}

function buildHeadline(input: {
  total: number;
  attachment: AttachmentReading;
  followThrough: ActivityFollowThrough;
  subjects: SubjectRow[];
  deltaPct: number | null;
}): string {
  if (input.total === 0) {
    return 'Nothing dated in this period yet. Capture a touch or plan a day and this reads back who your time went to.';
  }

  const parts: string[] = [];
  const trend = input.deltaPct === null
    ? ''
    : input.deltaPct > 0
      ? `, up ${input.deltaPct}% on the period before`
      : input.deltaPct < 0
        ? `, down ${Math.abs(input.deltaPct)}% on the period before`
        : ', level with the period before';
  parts.push(`${input.total} dated ${input.total === 1 ? 'item' : 'items'}${trend}.`);

  const [top] = input.subjects;
  if (top && top.count > 1) {
    /**
     * "Busiest single subject", not "took the most of it".
     *
     * These are subjects - one customer, one deal, one internal line - and the
     * Business Domain chart directly below this sentence groups the same period
     * by domain. Both are right and they share vocabulary: the sentence read
     * "Internal took the most of it (12%)" above a chart showing Internal at 35%
     * and Sales at 57%, which reads as the product contradicting itself on one
     * screen. Naming the denominator is the whole fix.
     */
    parts.push(`Your busiest single subject was ${top.name}, at ${Math.round(top.share * 100)}% of these items.`);
  }

  if (input.followThrough.settled > 0 && input.followThrough.rate !== null) {
    parts.push(`You closed ${input.followThrough.done} of the ${input.followThrough.settled} dated items that came due.`);
  }

  if (input.attachment.unresolved > 0) {
    parts.push(
      `${input.attachment.unresolved} ${input.attachment.unresolved === 1 ? 'item names someone' : 'items name people'} the workspace does not know yet - that work reaches no deal and no money.`,
    );
  }

  return parts.join(' ');
}

/**
 * The identity of a subject: its type plus its canonical name.
 *
 * Exported because the page filters the ledger by the same key it groups by. Two
 * spellings of one key - "cobetter" here, "Cobetter" there - would have made
 * clicking a leaderboard row show an empty list, which is the kind of bug that
 * survives review because both halves look correct on their own.
 */
export function activitySubjectKey(entry: ActivityEntry) {
  return `${entry.relatedTo.type}:${accountKey(entry.relatedTo.name)}`;
}

const subjectKey = activitySubjectKey;

function relationLabel(type: string) {
  return {
    opportunity: 'Opportunity',
    account: 'Account',
    brand: 'Brand line',
    internal: 'Internal',
    unresolved: 'Not linked yet',
  }[type] || type;
}

function originLabel(origin: string) {
  return { capture: 'Capture', deal: 'Deal', obligation: 'Obligation', typed: 'Typed' }[origin] || origin;
}

function tally<T>(items: T[], keyOf: (item: T) => string) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = keyOf(item);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function shareOf(counts: Map<string, number>, total: number, labelOf: (key: string) => string = (key) => key): ActivityCount[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: labelOf(key), count, share: total === 0 ? 0 : count / total }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function biggest(counts: Map<string, number>) {
  let best: { key: string; count: number } | null = null;
  counts.forEach((count, key) => {
    if (!best || count > best.count) best = { key, count };
  });
  return best as { key: string; count: number } | null;
}

function daysBetween(fromDateKey: string, toDateKey: string) {
  const from = Date.parse(`${sanitizeBusinessDate(fromDateKey)}T00:00:00Z`);
  const to = Date.parse(`${sanitizeBusinessDate(toDateKey)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(Math.round((to - from) / DAY_MS), 0);
}

export function domainBarColor(domain: BusinessDomain) {
  return {
    Sales: '#3b82f6',
    Money: '#10b981',
    Delivery: '#8b5cf6',
    Marketing: '#ec4899',
    Product: '#6366f1',
    Learning: '#f59e0b',
    Internal: '#94a3b8',
  }[domain];
}

export function relationColor(type: ActivityRelationType) {
  return {
    opportunity: '#1976D2',
    account: '#0ea5e9',
    brand: '#8b5cf6',
    internal: '#94a3b8',
    unresolved: '#f59e0b',
  }[type];
}
