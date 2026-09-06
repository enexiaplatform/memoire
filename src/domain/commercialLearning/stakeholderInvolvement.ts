import type { SalesActivityRecord } from '../../services/salesActivityStore';
import type { StakeholderRecord } from '../../services/stakeholderStore';
import { normalizeEntityName } from '../../utils/accountIdentity.ts';
import { compareSafeBusinessDate, sanitizeBusinessDate } from '../../utils/safeDate.ts';

/**
 * Who was involved in a deal, derived rather than stored twice.
 *
 * ## Four things that are not the same thing
 *
 *   Person identity      Lan.
 *   Account relationship Works at Rohto, in QC.
 *   Opportunity context  Was in the room for the PMM rollout.
 *   Decision authority   Is the one who signs.
 *
 * The product has always kept the first, second and fourth apart - that is why
 * a captured attendee is written with `stakeholderRole: 'Unknown'` and why
 * being named in a note has never made anybody an Economic Buyer. The third was
 * the one with nowhere to live.
 *
 * ## Why it is derived and not a column
 *
 * `StakeholderRecord.opportunityId` is a single field, so a person on two deals
 * needs two records - and then the workspace has two Lans, each with half a
 * history, and the merge problem that creates is worse than the gap it fills.
 * The real workspace has 1,741 stakeholders and exactly one of them carries an
 * opportunity id, so nothing is lost by not relying on it.
 *
 * An opportunity-linked activity that names a person is already evidence that
 * the person was involved in that deal, on a known day, with a record behind
 * it. So involvement is read off the activities, which means it costs no
 * migration, cannot duplicate a person, supports two deals at once, and gets
 * better automatically as linkage improves.
 *
 * ## What it deliberately does not do
 *
 * Change anybody's role. Involvement is attendance. The MEDDIC role stays a
 * judgement the operator makes on the person's record, and nothing here writes
 * to it or reads authority out of it.
 */

export type InvolvementSource = 'stakeholder_record' | 'linked_activity';

export type StakeholderInvolvement = {
  stakeholderId: string;
  name: string;
  accountName: string;
  /** The job title as recorded. Never a MEDDIC role. */
  roleTitle: string;
  /**
   * What the operator graded this person as on the account. Carried through
   * unchanged so a reader can see it; being in the room never edits it.
   */
  recordedRole: string;
  /** The earliest dated evidence that this person was on this deal. */
  firstSeenOn: string;
  /** The most recent. */
  lastSeenOn: string;
  /** How many pieces of evidence stand behind it. */
  occurrences: number;
  sources: InvolvementSource[];
};

export type StakeholderInvolvementIndex = {
  /** Keyed by opportunity id. */
  byOpportunity: Map<string, StakeholderInvolvement[]>;
};

export function deriveStakeholderInvolvement(input: {
  stakeholders: StakeholderRecord[];
  activities: SalesActivityRecord[];
  includeSampleRecords?: boolean;
}): StakeholderInvolvementIndex {
  const includeSamples = input.includeSampleRecords === true;
  const visible = <T extends { isSample?: boolean; source?: string }>(record: T) =>
    includeSamples || (record.isSample !== true && record.source !== 'demo');

  const stakeholders = input.stakeholders.filter(visible);

  // People are looked up by name within a customer, which is how a person is
  // identified everywhere else in this workspace. Two records for one name on
  // one account are the same person; the first one wins so the id is stable.
  const peopleByAccountAndName = new Map<string, StakeholderRecord>();
  for (const person of stakeholders) {
    const key = personKey(person.accountName, person.name);
    if (!key || peopleByAccountAndName.has(key)) continue;
    peopleByAccountAndName.set(key, person);
  }

  type Draft = {
    person: StakeholderRecord;
    days: string[];
    sources: Set<InvolvementSource>;
  };
  const drafts = new Map<string, Map<string, Draft>>();

  const note = (opportunityId: string, person: StakeholderRecord, day: string, source: InvolvementSource) => {
    if (!opportunityId || !person.id) return;
    const forOpportunity = drafts.get(opportunityId) || new Map<string, Draft>();
    const existing = forOpportunity.get(person.id)
      || { person, days: [], sources: new Set<InvolvementSource>() };
    if (day) existing.days.push(day);
    existing.sources.add(source);
    forOpportunity.set(person.id, existing);
    drafts.set(opportunityId, forOpportunity);
  };

  // The record's own opportunity id, where one was written. This is what the
  // Capture dispatcher stamps when it creates a person on a scoped note.
  for (const person of stakeholders) {
    if (!person.opportunityId) continue;
    const canonical = peopleByAccountAndName.get(personKey(person.accountName, person.name)) || person;
    note(
      person.opportunityId,
      canonical,
      sanitizeBusinessDate(person.lastInteractionDate) || dayOf(person.createdAt) || '',
      'stakeholder_record',
    );
  }

  // The evidence that scales: a touch attached to a deal, naming a person the
  // workspace already knows. No text scanning - only the fields capture already
  // fills in, so a name mentioned in passing cannot put somebody in a meeting.
  for (const activity of input.activities.filter(visible)) {
    if (activity.linkStatus !== 'Linked' || !activity.linkedOpportunityId) continue;
    const accountName = activity.linkedAccountName || activity.accountName || '';
    const day = sanitizeBusinessDate(activity.activityDate) || '';

    for (const candidate of [activity.stakeholderName, activity.contactName]) {
      const person = peopleByAccountAndName.get(personKey(accountName, candidate || ''));
      if (!person) continue;
      note(activity.linkedOpportunityId, person, day, 'linked_activity');
    }
  }

  const byOpportunity = new Map<string, StakeholderInvolvement[]>();
  for (const [opportunityId, people] of drafts) {
    const involvement = [...people.values()].map(({ person, days, sources }) => {
      const dated = days.filter(Boolean).sort(compareSafeBusinessDate);
      return {
        stakeholderId: person.id,
        name: person.name,
        accountName: person.accountName,
        roleTitle: person.roleTitle,
        recordedRole: person.stakeholderRole,
        firstSeenOn: dated[0] || '',
        lastSeenOn: dated[dated.length - 1] || '',
        occurrences: days.length,
        sources: [...sources].sort(),
      };
    }).sort((left, right) => right.occurrences - left.occurrences || left.name.localeCompare(right.name));
    byOpportunity.set(opportunityId, involvement);
  }

  return { byOpportunity };
}

/** Everyone evidenced on one deal. Empty is a real answer. */
export function involvementFor(
  index: StakeholderInvolvementIndex,
  opportunityId: string | null | undefined,
): StakeholderInvolvement[] {
  if (!opportunityId) return [];
  return index.byOpportunity.get(opportunityId) || [];
}

function personKey(accountName: string, name: string): string {
  const account = normalizeEntityName(accountName || '');
  const person = normalizeEntityName(name || '');
  if (!account || !person) return '';
  return `${account}|${person}`;
}

function dayOf(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  return sanitizeBusinessDate(timestamp.slice(0, 10)) || '';
}
