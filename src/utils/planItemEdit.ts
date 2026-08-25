import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityDetailsInput, SalesActivityRecord } from '../services/salesActivityStore';
import { sameAccount } from './accountIdentity.ts';
import { sanitizeBusinessDate } from './safeDate.ts';
import { SUPPLIER_OBLIGATION_MARKER } from './supplierCommitments.ts';
import {
  getDatedCaptureActions,
  getPlanItemWriteTarget,
  type PlanItem,
  type PlanRecord,
} from './weeklyPlan.ts';

/**
 * Editing one line of the week in full, rather than only its wording.
 *
 * The board could already do two things to an item: drag it to another day, and
 * rewrite its sentence. Everything else a line is actually *about* - which
 * customer, which person, which deal - was fixed at the moment it was typed or
 * captured. A week is not planned that way. The meeting moves to Thursday, the
 * contact turns out to be someone else, the account was spelled wrong on the
 * capture, and the operator's only route to any of that was to delete the line
 * and write it again, losing its link and its history.
 *
 * The rule the board has always lived by does not change: it edits the record
 * that owns the commitment, never a copy of it. So what is editable here is
 * decided by *where the field lives*, not by what would be convenient:
 *
 *  - A line the operator typed is theirs outright. Every field is editable.
 *  - A captured touch owns its own account, its own contact and its own dated
 *    actions, so all of those are editable and land back on the touch.
 *  - A deal item is a window onto an opportunity. Its next action and that
 *    action's date belong to this week and are editable; its customer and its
 *    decision maker belong to the deal, and changing them from a calendar cell
 *    would move an entire opportunity - its money, its history, its coverage -
 *    from a surface that shows none of that. Those stay read-only, with a link
 *    to the record that owns them.
 *  - An obligation's date is held by the quote, expense or supplier commitment
 *    behind it. Nothing here is editable, and the drawer says which record to
 *    open instead.
 */

export type PlanItemEditDraft = {
  label: string;
  date: string;
  /** The customer, or the line you carry, this work is for. */
  accountName: string;
  /**
   * What the account text resolved to when it was picked from the workspace.
   * Empty for text the operator simply typed - which is deliberate: an unknown
   * name stays an unresolved tag so the "create this account" panel below the
   * board can still offer to make it real.
   */
  accountKind: '' | 'account' | 'deal' | 'brand';
  opportunityId: string;
  opportunityName: string;
  /** The person this line is with. */
  contactName: string;
  contactRole: string;
};

export type PlanItemEditSources = {
  records: PlanRecord[];
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
};

export type PlanItemEditPolicy = {
  /** Which fields this surface is allowed to write for this kind of item. */
  fields: { label: boolean; date: boolean; account: boolean; contact: boolean };
  /** Plain words for the record the drawer writes into. */
  ownerLabel: string;
  /** Where the fields this surface will not write actually live. */
  ownerHref: string;
  /** Why they are not editable here. Empty when everything is editable. */
  lockedReason: string;
  deletable: boolean;
};

/**
 * Which record holds an obligation's date, named precisely enough to open.
 *
 * Three different kinds of record can raise one, and a message that says the
 * wrong one sends the operator to the wrong screen. Shared with the drag
 * handler so the board answers "why will this not move" the same way twice.
 */
export function planObligationOwnerMessage(item: PlanItem) {
  return item.id.includes(SUPPLIER_OBLIGATION_MARKER)
    ? `Change the date with the principal on Orders - "${item.tag}" is holding this one.`
    : 'Payments and deliveries you owe move when the quote or expense behind them changes date.';
}

export function planItemEditPolicy(item: PlanItem): PlanItemEditPolicy {
  if (item.kind === 'personal') {
    return {
      fields: { label: true, date: true, account: true, contact: true },
      ownerLabel: 'this plan line',
      ownerHref: '',
      lockedReason: '',
      deletable: true,
    };
  }

  if (item.kind === 'capture') {
    return {
      fields: { label: true, date: true, account: true, contact: true },
      ownerLabel: 'the touch you captured',
      ownerHref: item.href,
      lockedReason: '',
      deletable: false,
    };
  }

  if (item.kind === 'deal') {
    const target = getPlanItemWriteTarget(item);
    return {
      fields: { label: true, date: true, account: false, contact: false },
      ownerLabel: 'the deal',
      ownerHref: target.kind === 'deal'
        ? `/app/opportunities?opportunityId=${encodeURIComponent(target.opportunityId)}`
        : '/app/opportunities',
      lockedReason: 'The customer and the decision maker belong to the deal itself. Changing them from a day column would move the whole opportunity — its money and its history — so open the deal to change those.',
      deletable: false,
    };
  }

  return {
    fields: { label: false, date: false, account: false, contact: false },
    ownerLabel: 'the record you owe this on',
    ownerHref: item.href,
    lockedReason: planObligationOwnerMessage(item),
    deletable: false,
  };
}

/**
 * What the drawer opens with, read from the record that owns the commitment
 * rather than from the board.
 *
 * The board's label is condensed for a narrow day column, so editing what is on
 * screen would quietly truncate the sentence the operator actually wrote. The
 * source record is the only honest starting point.
 */
export function buildPlanItemEditDraft(item: PlanItem, sources: PlanItemEditSources): PlanItemEditDraft {
  const blank: PlanItemEditDraft = {
    label: item.label,
    date: item.date,
    accountName: item.tag,
    accountKind: '',
    opportunityId: '',
    opportunityName: '',
    contactName: item.contactName || '',
    contactRole: '',
  };

  const target = getPlanItemWriteTarget(item);

  if (target.kind === 'personal') {
    const record = sources.records.find((candidate) => candidate.id === target.recordId);
    if (!record) return blank;
    return {
      label: record.label,
      date: record.date,
      accountName: record.tag || record.linkedAccountName || record.linkedBrand || '',
      accountKind: record.linkedOpportunityId
        ? 'deal'
        : record.linkedAccountName
          ? 'account'
          : record.linkedBrand
            ? 'brand'
            : '',
      opportunityId: record.linkedOpportunityId || '',
      opportunityName: '',
      contactName: record.linkedStakeholderName || '',
      contactRole: '',
    };
  }

  if (target.kind === 'deal') {
    const opportunity = sources.opportunities.find((candidate) => candidate.id === target.opportunityId);
    if (!opportunity) return blank;
    return {
      label: opportunity.nextAction,
      date: opportunity.nextActionDate,
      accountName: opportunity.accountName,
      accountKind: 'deal',
      opportunityId: opportunity.id,
      opportunityName: opportunity.opportunityName,
      contactName: opportunity.decisionMaker || '',
      contactRole: '',
    };
  }

  if (target.kind === 'capture') {
    const activity = sources.activities.find((candidate) => candidate.id === target.activityId);
    if (!activity) return blank;
    const action = getDatedCaptureActions(activity).find((candidate) => candidate.slot === target.slot);
    return {
      label: action?.title || activity.nextAction || item.label,
      date: action?.dueDate || activity.dueDate || item.date,
      accountName: activity.linkedAccountName || activity.accountName || '',
      accountKind: activity.linkedOpportunityId ? 'deal' : activity.linkedAccountName ? 'account' : '',
      opportunityId: activity.linkedOpportunityId || '',
      opportunityName: activity.linkedOpportunityName || '',
      contactName: activity.stakeholderName || activity.contactName || '',
      contactRole: activity.stakeholderRole || '',
    };
  }

  return blank;
}

/**
 * The day this edit lands on. A date the browser could not produce a valid key
 * for leaves the line where it already was, rather than sending it to 1970.
 */
export function planItemEditDate(item: PlanItem, draft: PlanItemEditDraft) {
  return sanitizeBusinessDate(draft.date) || item.date;
}

/** True when the draft says something the owning record does not already say. */
export function planItemEditChangesAnything(before: PlanItemEditDraft, after: PlanItemEditDraft) {
  return before.label.trim() !== after.label.trim()
    || before.date !== after.date
    || before.accountName.trim() !== after.accountName.trim()
    || before.accountKind !== after.accountKind
    || before.opportunityId !== after.opportunityId
    || before.contactName.trim() !== after.contactName.trim()
    || before.contactRole.trim() !== after.contactRole.trim();
}

/**
 * The plan record a personal edit produces.
 *
 * `linkedAccountName` is set only for a name the workspace already knows. A
 * customer the operator typed by hand stays an unresolved tag on purpose: the
 * panel under the board offers to create exactly those, and it skips any record
 * that already claims a link. Writing the typed text into the link field would
 * have made the line look filed while leaving the customer nonexistent.
 */
export function applyPersonalPlanEdit(record: PlanRecord, draft: PlanItemEditDraft): PlanRecord {
  const label = draft.label.trim() || record.label;
  const accountName = draft.accountName.trim();
  const linked = draft.accountKind === 'deal' || draft.accountKind === 'account';

  return {
    ...record,
    label,
    date: sanitizeBusinessDate(draft.date) || record.date,
    tag: accountName,
    linkedAccountName: linked ? accountName : undefined,
    linkedBrand: draft.accountKind === 'brand' ? accountName : undefined,
    linkedOpportunityId: draft.accountKind === 'deal' ? draft.opportunityId || undefined : undefined,
    linkedStakeholderName: draft.contactName.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * The write a capture edit produces, against the touch that raised the line.
 *
 * A touch can carry several dated actions, so the wording and the date are
 * rewritten on the one slot this board item came from - the headline action, or
 * a numbered structured action - and the others are left exactly as they were.
 *
 * Changing the customer is the delicate half. The board reads
 * `linkedAccountName || accountName`, so writing only the touch's own account
 * would leave a stale link overruling it on screen: the operator would correct
 * the customer, see nothing change, and have no way to know why. So the link is
 * settled at the same time - re-pointed when a deal was chosen, dropped when the
 * customer moved somewhere the old link no longer describes.
 */
export function buildCaptureEditChanges(input: {
  activity: SalesActivityRecord;
  item: PlanItem;
  slot: string;
  draft: PlanItemEditDraft;
}): SalesActivityDetailsInput {
  const { activity, item, slot, draft } = input;
  const title = draft.label.trim() || item.label;
  const dueDate = planItemEditDate(item, draft);

  const existingActions = activity.nextActions || [];
  const schedule: SalesActivityDetailsInput = slot === 'main'
    ? {
      nextAction: title,
      dueDate,
      // The headline action and its structured copy describe one commitment,
      // so both carry the new wording and the new day.
      nextActions: existingActions.map((action) => (
        action.dueDate === item.date && (action.title || '').trim() === (activity.nextAction || '').trim()
          ? { ...action, title, dueDate }
          : action
      )),
    }
    : {
      nextActions: existingActions.map((action, index) => (
        `n${index}` === slot ? { ...action, title, dueDate } : action
      )),
    };

  const contact: SalesActivityDetailsInput = {
    stakeholderName: draft.contactName.trim(),
    stakeholderRole: draft.contactRole.trim(),
  };

  const accountName = draft.accountName.trim();
  if (!accountName) return { ...schedule, ...contact };

  if (draft.accountKind === 'deal' && draft.opportunityId) {
    return {
      ...schedule,
      ...contact,
      accountName,
      linkStatus: 'Linked',
      linkedOpportunityId: draft.opportunityId,
      linkedOpportunityName: draft.opportunityName,
      linkedAccountName: accountName,
    };
  }

  const shownAccount = (activity.linkedAccountName || activity.accountName || '').trim();
  if (sameAccount(accountName, shownAccount)) return { ...schedule, ...contact };

  return {
    ...schedule,
    ...contact,
    accountName,
    // The old deal link described a different customer. Keeping it would put
    // this touch back under that customer the moment the page reloaded.
    linkStatus: 'Unlinked',
    linkedOpportunityId: '',
    linkedOpportunityName: '',
    linkedAccountName: '',
  };
}

/**
 * Whether saving this draft will detach the touch from the deal it is linked
 * to, so the drawer can say so before the operator commits rather than after.
 */
export function captureEditUnlinksDeal(activity: SalesActivityRecord, draft: PlanItemEditDraft) {
  if (!activity.linkedOpportunityId) return false;
  if (draft.accountKind === 'deal' && draft.opportunityId) return draft.opportunityId !== activity.linkedOpportunityId;
  const accountName = draft.accountName.trim();
  if (!accountName) return false;
  return !sameAccount(accountName, (activity.linkedAccountName || activity.accountName || '').trim());
}
