import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ClassifiedSalesActivity, SalesActivityType } from './salesActivityClassifier.ts';
import { getPlanItemWriteTarget, type PlanItem } from './weeklyPlan.ts';
import { isOutOfOfficeChannel, normalizeActivityChannel, type ActivityChannel } from './activityChannel.ts';
import { normalizeEntityName } from './accountIdentity.ts';
import { compareSafeBusinessDate, isValidBusinessDate } from './safeDate.ts';

/**
 * The activity a finished plan item becomes.
 *
 * Until 2026-09-03 the Plan board wrote a completion mark and stopped. From then
 * until 2026-09-15 it *offered* to write the work to Activity, unchecked by
 * default, on the reasoning that a tick means "done" and minting a touch from
 * every checkbox fills the ledger with rows that say nothing.
 *
 * The offer was the wrong compromise, and the numbers said so: 5 activities in
 * the live ledger came from a plan tick. The operator plans the week on the
 * board, works it, ticks it - and Activity, the record every other engine reads,
 * ended the week nearly empty. So finishing a plan item now *is* recording it:
 * the box opens a record, and the item is done when the record is saved.
 *
 * The original worry is answered by what the record requires rather than by
 * making it optional. A touch on a customer must say what happened and who it
 * was with - a named person at that customer - because that is what makes it a
 * touch rather than a click. A row carrying a sentence and a stakeholder is
 * exactly the content a ledger is for.
 *
 * One definition of the record, whichever surface writes it: one shape, one set
 * of tags, one rule for which deal it reaches.
 */

/** Who the work was with. A stakeholder already on the record, or one being added now. */
export type PlanCompletionPerson = {
  name: string;
  roleTitle?: string;
};

export type PlanCompletionLogInput = {
  item: PlanItem;
  /** What the operator typed about it. Required - an empty note writes nothing. */
  note: string;
  /**
   * The person at the customer. Required whenever the item is customer work on a
   * working day - see `planCompletionNeedsPerson` - and ignored on a day out of
   * the office, which reaches no customer.
   */
  person?: PlanCompletionPerson | null;
  /** The workspace's deals, for resolving the one a deal item belongs to. */
  opportunities: CrmLiteOpportunity[];
  /** The date the work happened, normally today. */
  activityDate: string;
  /**
   * How it happened. Defaults to the channel planned on the item, so a line
   * written as an on-site visit is logged as one without being retyped, and an
   * override here wins because the day may not have gone as planned.
   */
  channel?: ActivityChannel | '';
};

export type PlanCompletionLog = {
  activity: ClassifiedSalesActivity;
  /** The customer it landed on, or '' when the task names none. */
  accountName: string;
};

/** Marks every touch written by ticking a box, so they stay traceable as a class. */
export const PLAN_COMPLETION_TAG = 'plan-completion';

/** A query parameter out of a board item's own link. */
function hrefParam(href: string, key: string): string {
  const match = new RegExp(`[?&]${key}=([^&]+)`).exec(href || '');
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * The deal a plan item belongs to: the deal item's own, or - for a line the
 * operator linked to a deal - the one its link points at. A board item carries
 * its link as the href it opens, which is written from the record's
 * `linkedOpportunityId`.
 */
export function planItemOpportunity(item: PlanItem, opportunities: CrmLiteOpportunity[]) {
  const target = getPlanItemWriteTarget(item);
  const id = target.kind === 'deal' ? target.opportunityId : hrefParam(item.href, 'opportunityId');
  return id ? opportunities.find((record) => record.id === id) : undefined;
}

/**
 * The customer a plan item is work for, or '' for internal work.
 *
 * The deal's account first, then the account the line links to, then the tag -
 * but the tag only when the board already classified the line as customer work.
 * "[Internal] Submit KPI" carries a tag and is not about a customer.
 */
export function planItemAccountName(item: PlanItem, opportunities: CrmLiteOpportunity[]): string {
  const opportunity = planItemOpportunity(item, opportunities);
  return (
    opportunity?.accountName
    || hrefParam(item.href, 'accountName')
    || (item.workKind === 'customer' ? item.tag : '')
    || ''
  ).trim();
}

/**
 * Whether finishing this item has to name who it was with.
 *
 * Customer work on a working day does. Internal work has nobody to name, and a
 * day out of the office reaches no customer at all, so asking for a person there
 * would push the operator to invent one.
 */
export function planCompletionNeedsPerson(
  item: PlanItem,
  opportunities: CrmLiteOpportunity[],
  channel?: ActivityChannel | '',
): boolean {
  if (isOutOfOfficeChannel(normalizeActivityChannel(channel ?? item.channel))) return false;
  return Boolean(planItemAccountName(item, opportunities));
}

/** What is still missing before the record can be saved, in the order it is asked. */
export function planCompletionProblems(input: PlanCompletionLogInput): string[] {
  const problems: string[] = [];
  if (!(input.note || '').trim()) problems.push('Write what happened.');
  if (planCompletionNeedsPerson(input.item, input.opportunities, input.channel) && !(input.person?.name || '').trim()) {
    problems.push('Name who it was with.');
  }
  return problems;
}

/**
 * The people this item could have been with: the ones filed under its customer,
 * the person already named on the line first.
 */
export function peopleForPlanAccount<Person extends { name: string; accountName: string }>(
  people: Person[],
  accountName: string,
  preferredName = '',
): Person[] {
  const key = normalizeEntityName(accountName);
  if (!key) return [];
  const preferred = normalizeEntityName(preferredName);
  return people
    .filter((person) => normalizeEntityName(person.accountName) === key)
    .sort((left, right) => (
      Number(normalizeEntityName(right.name) === preferred) - Number(normalizeEntityName(left.name) === preferred)
      || left.name.localeCompare(right.name)
    ));
}

/**
 * The day the work happened.
 *
 * The day the line sat on, when that day has passed: a Tuesday visit ticked off
 * on Friday is still a Tuesday visit, and stamping it Friday would reset the
 * customer's silence clock to the wrong date. But a line finished *before* its
 * day happened today - recording Friday's call on Tuesday as a Friday touch
 * would put an activity in the future and a stakeholder's last interaction on a
 * day that has not come.
 */
export function planCompletionActivityDate(item: Pick<PlanItem, 'date'>, today: string): string {
  if (!isValidBusinessDate(item.date)) return today;
  return compareSafeBusinessDate(item.date, today) > 0 ? today : item.date;
}

/** The tag that ties a written activity back to the exact plan line. */
export function planCompletionItemTag(item: Pick<PlanItem, 'id' | 'derivedKey'>): string {
  return `plan:${item.derivedKey || item.id}`;
}

/** The activity already recorded for this line, when there is one. */
export function findPlanCompletionActivity<Activity extends { tags?: string[] }>(
  item: Pick<PlanItem, 'id' | 'derivedKey'>,
  activities: Activity[],
): Activity | undefined {
  const tag = planCompletionItemTag(item);
  return activities.find((activity) => (activity.tags || []).includes(tag));
}

export function buildPlanCompletionActivity(input: PlanCompletionLogInput): PlanCompletionLog | null {
  const text = (input.note || '').trim();
  if (!text) return null;
  // Customer work with nobody named is not written. The UI asks before it gets
  // here; this is the line that stops a caller that forgot to.
  if (planCompletionProblems(input).length > 0) return null;

  const { item } = input;
  // The deal behind a deal item, so the touch reaches the same opportunity the
  // task did rather than landing as a loose note on the account.
  const opportunity = planItemOpportunity(item, input.opportunities);

  const channel = normalizeActivityChannel(input.channel ?? item.channel);
  const namedAccount = planItemAccountName(item, input.opportunities);
  const person = isOutOfOfficeChannel(channel) ? null : input.person;
  const personName = (person?.name || '').trim();
  /*
   * A day off is not about a customer, whatever the line was tagged with.
   *
   * Without this, ticking "[Frulact] follow up" and marking it `Out of office`
   * writes a touch dated that day against Frulact - and every silence engine in
   * the app then reads the customer as freshly contacted on the day nobody was
   * working. An alarm that fires late gets noticed; an alarm switched off by a
   * public holiday never fires at all, which is the worse of the two failures
   * and the harder one to find.
   *
   * Fixed here, at the writer, rather than in each reader: there are a dozen
   * places that ask when an account was last touched, and a rule that has to be
   * remembered in all of them is a rule that will be missing from one.
   *
   * `Desk work` deliberately keeps its account. Preparing a customer's
   * quotation is genuinely work on that customer and belongs on their history;
   * it is simply not a touch, which is a judgement the silence maths makes for
   * itself.
   */
  const accountName = isOutOfOfficeChannel(channel) ? '' : namedAccount;

  return {
    accountName,
    activity: {
      accountName,
      opportunityName: isOutOfOfficeChannel(channel) ? '' : (opportunity?.opportunityName || ''),
      // Written to both fields: the ledger and the stakeholder views read the
      // stakeholder, the older capture surfaces read the contact.
      contactName: personName,
      stakeholderName: personName,
      stakeholderRole: (person?.roleTitle || '').trim(),
      activityType: activityTypeForItem(item),
      activityChannel: channel,
      summary: text,
      nextAction: '',
      dueDate: '',
      // The marker, then the identity of the exact task, so a touch written
      // from here can always be traced back to the box that produced it.
      tags: [PLAN_COMPLETION_TAG, planCompletionItemTag(item)],
      rawNote: `${item.tag ? `[${item.tag}] ` : ''}${item.label}${personName ? ` - with ${personName}` : ''}\n\n${text}`,
      activityDate: input.activityDate,
    },
  };
}

/**
 * What to tell the operator about where it went.
 *
 * Says the truth rather than the comfortable version. A task typed onto a day
 * with no customer attached produces a touch with no customer attached, and
 * telling the operator it landed on "this account's history" when there is no
 * account is the kind of small lie that costs a product its numbers later: they
 * go looking for it under the customer, do not find it, and stop trusting that
 * anything they tick is being recorded at all.
 */
export function planCompletionLogMessage(accountName: string, channel?: ActivityChannel | '', personName = '') {
  // A day off gets its own sentence, because the other two would both be
  // misleading: it did not reach a customer, and calling it "internal work"
  // would file a public holiday as something the operator did.
  if (isOutOfOfficeChannel(channel)) {
    return 'Recorded as a day out of the office. It counts as a non-working day, not as work, and no customer clock moves.';
  }
  if (accountName) {
    return personName
      ? `Recorded with ${personName} at ${accountName}. It is on Activity, on that customer's history and on ${personName}'s record.`
      : `Recorded against ${accountName}. It is on Activity and on that customer's history.`;
  }
  return 'Recorded on Activity as internal work - this task names no customer, so it reaches no deal.';
}

/**
 * The subject a ticked item is about. Deliberately coarse: the operator's note
 * carries the detail, and guessing a finer type from a one-line task label
 * would be a confident answer built on a sentence fragment.
 */
export function activityTypeForItem(item: PlanItem): SalesActivityType {
  if (item.kind === 'obligation') return 'Payment / invoice';
  if (item.workKind === 'customer') return 'Follow-up';
  if (item.workKind === 'principal') return 'Internal coordination';
  return 'Admin / CRM';
}
