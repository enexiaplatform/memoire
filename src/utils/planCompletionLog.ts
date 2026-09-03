import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ClassifiedSalesActivity, SalesActivityType } from './salesActivityClassifier.ts';
import { getPlanItemWriteTarget, type PlanItem } from './weeklyPlan.ts';
import { isOutOfOfficeChannel, normalizeActivityChannel, type ActivityChannel } from './activityChannel.ts';

/**
 * The touch a ticked plan item becomes.
 *
 * Two surfaces tick the same box - Today's commitment strip and the Plan
 * board - and until 2026-09-03 only one of them recorded anything. Ticking on
 * Today offered to write the work to Activity; ticking the identical item on
 * Plan wrote a completion mark and nothing else. So the same day's work was in
 * the ledger or absent from it depending on which page the operator happened to
 * be looking at, and the page whose entire job is the week was the one that
 * recorded least.
 *
 * Both now call this. The UI stays per-surface, because a day column and a
 * horizontal strip are not the same control, but the *record* has one
 * definition: one shape, one set of tags, one rule for which deal it reaches.
 * A second definition is how a ledger ends up with two kinds of the same row
 * and a count that depends on where the operator was standing.
 *
 * The write itself stays opt-in on both. A tick means "done", not "and here is
 * a paragraph about it", and silently minting an activity from every checkbox
 * would fill the ledger with rows carrying no content - which is exactly the
 * "activities with content under 100 words" problem every CRM rollout has.
 */

export type PlanCompletionLogInput = {
  item: PlanItem;
  /** What the operator typed about it. Required - an empty note writes nothing. */
  note: string;
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

export function buildPlanCompletionActivity(input: PlanCompletionLogInput): PlanCompletionLog | null {
  const text = (input.note || '').trim();
  if (!text) return null;

  const { item } = input;
  // The deal behind a deal item, so the touch reaches the same opportunity the
  // task did rather than landing as a loose note on the account.
  const target = getPlanItemWriteTarget(item);
  const opportunity = target.kind === 'deal'
    ? input.opportunities.find((record) => record.id === target.opportunityId)
    : undefined;

  const channel = normalizeActivityChannel(input.channel ?? item.channel);
  const namedAccount = opportunity?.accountName || (item.workKind === 'customer' ? item.tag : '');
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
      activityType: activityTypeForItem(item),
      activityChannel: channel,
      summary: text,
      nextAction: '',
      dueDate: '',
      // The marker, then the identity of the exact task, so a touch written
      // from here can always be traced back to the box that produced it.
      tags: [PLAN_COMPLETION_TAG, `plan:${item.derivedKey || item.id}`],
      rawNote: `${item.tag ? `[${item.tag}] ` : ''}${item.label}\n\n${text}`,
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
export function planCompletionLogMessage(accountName: string, channel?: ActivityChannel | '') {
  // A day off gets its own sentence, because the other two would both be
  // misleading: it did not reach a customer, and calling it "internal work"
  // would file a public holiday as something the operator did.
  if (isOutOfOfficeChannel(channel)) {
    return 'Recorded as a day out of the office. It counts as a non-working day, not as work, and no customer clock moves.';
  }
  return accountName
    ? `Logged against ${accountName}. It is on Activity and on that customer's history.`
    : 'Logged to Activity as internal work - this task names no customer, so it reaches no deal.';
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
