import type { CrmLiteOpportunity, OpportunityStage } from '../services/opportunityStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import type { StakeholderRecord } from '../services/stakeholderStore.ts';
import type { ObjectionRecord } from '../services/objectionStore.ts';
import type { AccountMemoryRecord } from '../services/accountStore.ts';
import type { OpportunityOutcomeReasonCategory } from '../services/opportunityOutcomeStore.ts';
import { normalizeEntityName } from './accountIdentity.ts';
import { activitiesForOpportunityStrict } from './activityIndex.ts';
import { hasScheduledNextAction } from './nextAction.ts';
import {
  classifyOpportunitySilence,
  type OpportunitySilenceState,
  type PlannedCommitmentSignal,
} from './proactiveNudges.ts';
import {
  daysBetweenBusinessDates,
  formatSafeBusinessDate,
  isValidBusinessDate,
  sanitizeBusinessDate,
  timestampToLocalDateKey,
  todayDateKey,
} from './safeDate.ts';

/**
 * Leads, as one deterministic rule set.
 *
 * ## Why this file exists at all
 *
 * The same fact - "this lead has gone quiet", "this one is ready to qualify",
 * "this revisit is due" - now appears on Leads, on Today and in Review. The
 * failure mode that follows is well documented in this codebase: a threshold
 * gets retyped in a second React component, the two drift, and the product
 * tells the operator two different things about the same record on two pages.
 * Money did exactly that with payment terms - "0 overdue" on Orders and "429.5K
 * past due" on Cash - and it was two engines, not one bug.
 *
 * So every lead question is answered here, once, and the surfaces render the
 * answer. Nothing below reads the DOM, React state or the clock without being
 * handed it.
 *
 * ## What a lead is
 *
 * An opportunity at the Lead stage. Not a separate record type, not a separate
 * table, not a copy. Qualifying moves the stage to Discovery and changes
 * nothing else, so the touches, the people, the evidence, the source and the
 * dates all survive the transition because they were never anywhere else.
 *
 * ## What is deliberately absent
 *
 * A score. There is no lead score out of 100 here and there must not be one.
 * A number implies a calibration nobody has, and the first time it is sorted on
 * it starts making decisions. What the operator gets instead is five named
 * pieces of evidence, each present or absent, each with the record that proves
 * it - and a readiness state that is a plain function of them. The way to
 * improve a lead is to record what you learned, not to edit a number.
 */

/* ------------------------------------------------------------------------- */
/* The stage                                                                  */
/* ------------------------------------------------------------------------- */

export const LEAD_STAGE: OpportunityStage = 'Lead';

/** The stage a qualified lead lands on. The first stage of the real pipeline. */
export const QUALIFIED_STAGE: OpportunityStage = 'Discovery';

/** A lead is an opportunity at the Lead stage - there is no separate record. */
export function isLeadStage(stage: string | undefined | null): boolean {
  return (stage || '').trim().toLowerCase() === 'lead';
}

type OutcomeStageFact = { opportunityId: string; outcome: string; stageBeforeOutcome: string };

/**
 * A lead that was closed out rather than qualified.
 *
 * A disqualified lead's own stage reads Lost - stage and status are reconciled
 * on every write, and a closed record may not sit on an open stage - so the
 * stage cannot say it was ever a lead. Its outcome can: the close-out snapshots
 * the stage it closed from. This is the one predicate that reads it.
 */
export function isDisqualifiedLeadOutcome(outcome: Pick<OutcomeStageFact, 'outcome' | 'stageBeforeOutcome'>): boolean {
  return outcome.outcome === 'Lost' && isLeadStage(outcome.stageBeforeOutcome);
}

/** The ids of every record closed out of the Lead stage. */
export function disqualifiedLeadIds(outcomes: OutcomeStageFact[] = []): Set<string> {
  return new Set(outcomes.filter(isDisqualifiedLeadOutcome).map((outcome) => outcome.opportunityId).filter(Boolean));
}

/**
 * Whether a record belongs on Leads rather than on Opportunities.
 *
 * At the Lead stage, or closed out of it. The two surfaces partition the book on
 * this, so every record is on exactly one of them - a disqualified lead listed
 * among lost deals would count a conversation that never qualified as pipeline
 * that was lost.
 */
export function isLeadRecord(
  opportunity: { id: string; stage: string; status?: string },
  disqualified: Set<string> = new Set(),
): boolean {
  if (isLeadStage(opportunity.stage)) return true;
  return opportunity.status === 'Lost' && disqualified.has(opportunity.id);
}

/** The lead records. The partition Opportunities is the other half of. */
export function selectLeads<T extends { id: string; stage: string; status?: string }>(
  opportunities: T[],
  disqualified: Set<string> = new Set(),
): T[] {
  return opportunities.filter((opportunity) => isLeadRecord(opportunity, disqualified));
}

/** The qualified pipeline: everything that is not a lead record. */
export function selectQualifiedPipeline<T extends { id: string; stage: string; status?: string }>(
  opportunities: T[],
  disqualified: Set<string> = new Set(),
): T[] {
  return opportunities.filter((opportunity) => !isLeadRecord(opportunity, disqualified));
}

/* ------------------------------------------------------------------------- */
/* Source                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * How the lead arrived.
 *
 * A short controlled list, because the question it answers in Review - "which
 * of these is worth doing more of" - cannot be answered over free text that
 * spells the same channel four ways. Kept to what a distributor actually has:
 * no "webinar", no "content syndication", no marketing-automation vocabulary.
 */
export const leadSources = [
  'Referral',
  'Inbound',
  'Cold outreach',
  'Existing account',
  'Distributor / Partner',
  'Trade show',
  'Tender / RFQ',
  'Website',
  'LinkedIn',
  'Other',
] as const;
export type LeadSource = (typeof leadSources)[number];

export function normalizeLeadSource(value: unknown): LeadSource | '' {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = leadSources.find((source) => source.toLowerCase() === text.toLowerCase());
  return match || '';
}

/**
 * What an import called the channel, mapped onto the controlled list where the
 * spelling is unambiguous.
 *
 * Only `channel` is read, and the reason is the live book rather than taste.
 * Measured 2026-09-16: `channel` holds the route to market - "Direct", or the
 * distributor a deal runs through - which is genuine context about how the
 * business came in. `opportunity_type` holds the product line ("Instrument",
 * "Media") and `source_system` holds the import batch ("founder_core_fy26").
 * The Leads tab of 2026-09-15 fell back to both, so a lead's "source" read
 * "Instrument" or the name of a spreadsheet. Neither says where a conversation
 * came from.
 *
 * Nothing is rewritten and nothing is migrated: a lead whose source was only
 * ever in `channel` still reports one. Unrecognised spellings are not forced
 * into a bucket - "DKSH" is shown as "DKSH", because it is more use to the
 * operator than "Other", and a distributor name is not something a rule can
 * safely classify.
 */
const LEGACY_SOURCE_MAP: Record<string, LeadSource> = {
  referral: 'Referral',
  referred: 'Referral',
  inbound: 'Inbound',
  'inbound enquiry': 'Inbound',
  outbound: 'Cold outreach',
  'cold call': 'Cold outreach',
  'cold outreach': 'Cold outreach',
  'cold email': 'Cold outreach',
  existing: 'Existing account',
  'existing account': 'Existing account',
  'existing customer': 'Existing account',
  upsell: 'Existing account',
  distributor: 'Distributor / Partner',
  partner: 'Distributor / Partner',
  'distributor / partner': 'Distributor / Partner',
  reseller: 'Distributor / Partner',
  'trade show': 'Trade show',
  tradeshow: 'Trade show',
  exhibition: 'Trade show',
  conference: 'Trade show',
  tender: 'Tender / RFQ',
  rfq: 'Tender / RFQ',
  rfp: 'Tender / RFQ',
  'tender / rfq': 'Tender / RFQ',
  bid: 'Tender / RFQ',
  website: 'Website',
  web: 'Website',
  'web form': 'Website',
  linkedin: 'LinkedIn',
  other: 'Other',
};

export type ResolvedLeadSource = {
  /** The controlled value, when there is one. */
  source: LeadSource | '';
  /** The free-text qualifier: "Pharmedi 2026", "Samil / Mr Kim". */
  detail: string;
  /**
   * What to draw. The controlled source when set, otherwise whatever the import
   * carried, otherwise nothing.
   */
  label: string;
  /** True when the label came from the imported channel rather than the field. */
  fromLegacyField: boolean;
};

/**
 * The one answer to "where did this come from", for every surface.
 *
 * Never invents one. A lead with no recorded source reports no source, because
 * guessing "Inbound" because the operator typed it in by hand would be an
 * identity the operator did not enter.
 */
export function resolveLeadSource(
  opportunity: Pick<CrmLiteOpportunity, 'leadSource' | 'leadSourceDetail' | 'channel'>,
): ResolvedLeadSource {
  const detail = (opportunity.leadSourceDetail || '').trim();
  const declared = normalizeLeadSource(opportunity.leadSource);
  if (declared) return { source: declared, detail, label: declared, fromLegacyField: false };

  const legacyRaw = (opportunity.channel || '').trim();
  if (!legacyRaw) return { source: '', detail, label: '', fromLegacyField: false };

  const mapped = LEGACY_SOURCE_MAP[legacyRaw.toLowerCase()];
  return {
    source: mapped || '',
    detail,
    // The mapped name when it is recognised, the operator's own word when it is
    // not. Either way the import's text is never thrown away.
    label: mapped || legacyRaw,
    fromLegacyField: true,
  };
}

/* ------------------------------------------------------------------------- */
/* Disqualification                                                           */
/* ------------------------------------------------------------------------- */

/**
 * Why a lead is out.
 *
 * Lead-shaped rather than deal-shaped: a lead is rarely lost on price, it is
 * lost because there was no project, nobody answered, or it was never a fit.
 * Each maps onto the outcome record's existing reason category, because the
 * disqualification is written as a Lost outcome on the same record - there is
 * no second store of lost leads, and win/loss learning reads it without being
 * taught about leads at all.
 */
export const leadDisqualifyReasons = [
  'No project',
  'Poor fit',
  'No response',
  'Timing',
  'Duplicate',
  'Competitor locked',
  'No budget',
  'Other',
] as const;
export type LeadDisqualifyReason = (typeof leadDisqualifyReasons)[number];

const DISQUALIFY_REASON_CATEGORY: Record<LeadDisqualifyReason, OpportunityOutcomeReasonCategory> = {
  'No project': 'No decision',
  'Poor fit': 'Technical fit',
  // Nobody answered is a relationship outcome, not a commercial one: there was
  // never an evaluation to lose.
  'No response': 'Relationship',
  Timing: 'Timing',
  // A duplicate was never a real second conversation. "Other" rather than a
  // commercial category, so it cannot pollute a win/loss reason chart.
  Duplicate: 'Other',
  'Competitor locked': 'Competitor',
  'No budget': 'Budget',
  Other: 'Other',
};

export function outcomeReasonCategoryForLead(reason: LeadDisqualifyReason): OpportunityOutcomeReasonCategory {
  return DISQUALIFY_REASON_CATEGORY[reason] || 'Other';
}

export function isLeadDisqualifyReason(value: unknown): value is LeadDisqualifyReason {
  return leadDisqualifyReasons.includes(String(value || '') as LeadDisqualifyReason);
}

/* ------------------------------------------------------------------------- */
/* Nurture                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * How many days before the revisit date a nurtured lead comes back.
 *
 * Not zero. A revisit that appears on the morning it is due gives the operator
 * no room to book anything, and the whole point of nurturing is that the lead
 * was good and the timing was not.
 */
export const NURTURE_DUE_LEAD_DAYS = 3;

export type NurtureState = {
  /** The lead is parked until a date. */
  nurturing: boolean;
  revisitDate: string;
  /** Today is within NURTURE_DUE_LEAD_DAYS of the revisit, or past it. */
  due: boolean;
  /** Negative once the revisit is overdue. Null when there is no revisit date. */
  daysUntilRevisit: number | null;
  reason: string;
};

export function classifyNurture(
  opportunity: Pick<CrmLiteOpportunity, 'nurturedUntil' | 'nurtureReason'>,
  today = todayDateKey(),
): NurtureState {
  const revisitDate = sanitizeBusinessDate(opportunity.nurturedUntil || '');
  const reason = (opportunity.nurtureReason || '').trim();
  if (!revisitDate) {
    return { nurturing: false, revisitDate: '', due: false, daysUntilRevisit: null, reason };
  }
  const days = daysBetweenBusinessDates(sanitizeBusinessDate(today), revisitDate);
  return {
    nurturing: true,
    revisitDate,
    due: days === null ? false : days <= NURTURE_DUE_LEAD_DAYS,
    daysUntilRevisit: days,
    reason,
  };
}

/* ------------------------------------------------------------------------- */
/* Qualification evidence                                                     */
/* ------------------------------------------------------------------------- */

/**
 * The five questions that decide whether a lead is worth qualifying.
 *
 * Deliberately not MEDDIC. MEDDIC asks who signs, what the paper process is and
 * what the decision criteria are - fair questions about a deal being negotiated
 * and premature ones about somebody you met at a stand last week. Every deal in
 * the live book carried a MEDDIC score and a dozen of them were leads, which
 * made the score say "2/32, weak" about records that had no business being
 * graded on it.
 *
 * Each of these is derived from a record that already exists. None of them is a
 * field the operator fills in to satisfy the product.
 */
export const leadEvidenceDimensions = ['fit', 'contact', 'need', 'engagement', 'nextMove'] as const;
export type LeadEvidenceDimension = (typeof leadEvidenceDimensions)[number];

export type LeadEvidenceItem = {
  dimension: LeadEvidenceDimension;
  label: string;
  present: boolean;
  /** What proves it, or what is missing. One sentence, always readable aloud. */
  detail: string;
};

export const leadEvidenceLabels: Record<LeadEvidenceDimension, string> = {
  fit: 'Fit',
  contact: 'Contact',
  need: 'Need',
  engagement: 'Engagement',
  nextMove: 'Next move',
};

/**
 * Where the lead stands, in words.
 *
 *   New               - nothing has come back yet.
 *   Engaged           - somebody real is on the other end, or a conversation has
 *                       happened.
 *   Ready to qualify  - fit, a contact, a stated need and a two-way exchange.
 *                       The four things Discovery assumes you already have.
 *
 * `nextMove` is deliberately not part of readiness: it is hygiene, not
 * qualification. A lead can be ready to qualify and still have nobody booked to
 * do it - that is a different problem, and the queue says so separately.
 */
export const leadReadinessStates = ['New', 'Engaged', 'Ready to qualify'] as const;
export type LeadReadiness = (typeof leadReadinessStates)[number];

export type LeadQualification = {
  evidence: LeadEvidenceItem[];
  readiness: LeadReadiness;
  /** How many of the five are present. A count of facts, not a score. */
  present: number;
  total: number;
  /** The dimensions still missing, in the order they are worth chasing. */
  missing: LeadEvidenceDimension[];
};

export type LeadQualificationInput = {
  opportunity: CrmLiteOpportunity;
  /** Touches about this lead, resolved by the caller. */
  activities: SalesActivityRecord[];
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  /** Whether the customer is an account on the books. */
  knownAccount: boolean;
};

export function qualifyLeadEvidence(input: LeadQualificationInput): LeadQualification {
  const { opportunity } = input;

  const productLine = [opportunity.productOrSolution, opportunity.brand]
    .map((value) => (value || '').trim())
    .find(Boolean) || '';
  const fitPresent = Boolean(input.knownAccount || productLine);

  const namedPerson = (opportunity.decisionMaker || '').trim();
  const linkedPerson = input.stakeholders.find((stakeholder) => (stakeholder.name || '').trim());
  const contactPresent = Boolean(namedPerson || linkedPerson);

  const statedNeed = [opportunity.evidence, opportunity.technicalCriteria, opportunity.objectionDebt]
    .map((value) => (value || '').trim())
    .find(Boolean) || '';
  const openObjection = input.objections.length > 0;
  const needPresent = Boolean(statedNeed || openObjection);

  const twoWay = input.activities.length;
  const engagementPresent = twoWay > 0;

  const nextMovePresent = hasScheduledNextAction(opportunity);

  const evidence: LeadEvidenceItem[] = [
    {
      dimension: 'fit',
      label: leadEvidenceLabels.fit,
      present: fitPresent,
      detail: input.knownAccount
        ? `${opportunity.accountName} is an account on your books.`
        : productLine
          ? `Recorded against ${productLine}.`
          : 'No account record and no product line - nothing says this is a customer you could serve.',
    },
    {
      dimension: 'contact',
      label: leadEvidenceLabels.contact,
      present: contactPresent,
      detail: linkedPerson
        ? `${linkedPerson.name}${linkedPerson.roleTitle ? `, ${linkedPerson.roleTitle}` : ''} is on the record.`
        : namedPerson
          ? `${namedPerson} is named on the lead.`
          : 'Nobody is named - there is no route into the account.',
    },
    {
      dimension: 'need',
      label: leadEvidenceLabels.need,
      present: needPresent,
      detail: statedNeed
        ? firstSentence(statedNeed)
        : openObjection
          ? 'An objection is recorded, which means they are evaluating something.'
          : 'Nothing recorded about what they are trying to solve.',
    },
    {
      dimension: 'engagement',
      label: leadEvidenceLabels.engagement,
      present: engagementPresent,
      detail: engagementPresent
        ? `${twoWay} ${twoWay === 1 ? 'touch' : 'touches'} recorded.`
        : 'No conversation has been captured yet.',
    },
    {
      dimension: 'nextMove',
      label: leadEvidenceLabels.nextMove,
      present: nextMovePresent,
      detail: nextMovePresent
        ? opportunity.nextActionDate
          ? `${opportunity.nextAction || 'Next step'} - ${formatSafeBusinessDate(opportunity.nextActionDate)}`
          : opportunity.nextAction
        : 'Nothing is scheduled, so nothing will bring this back to you.',
    },
  ];

  const readiness: LeadReadiness = fitPresent && contactPresent && needPresent && engagementPresent
    ? 'Ready to qualify'
    : engagementPresent || contactPresent
      ? 'Engaged'
      : 'New';

  return {
    evidence,
    readiness,
    present: evidence.filter((item) => item.present).length,
    total: evidence.length,
    missing: evidence.filter((item) => !item.present).map((item) => item.dimension),
  };
}

function firstSentence(text: string) {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  const stop = trimmed.search(/[.!?](\s|$)/);
  const sentence = stop > 0 ? trimmed.slice(0, stop + 1) : trimmed;
  return sentence.length > 140 ? `${sentence.slice(0, 137)}...` : sentence;
}

/* ------------------------------------------------------------------------- */
/* The queue                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * The operating states of the lead queue, in the order the page offers them.
 *
 * These are states of the *work*, not of the record: a lead is in exactly one
 * of them, and which one is a question about what the operator has to do next.
 */
export const leadQueueStates = ['new', 'needs-action', 'going-quiet', 'ready', 'nurture'] as const;
export type LeadQueueState = (typeof leadQueueStates)[number];

export const leadQueueStateLabels: Record<LeadQueueState, string> = {
  new: 'New',
  'needs-action': 'Needs action',
  'going-quiet': 'Going quiet',
  ready: 'Ready to qualify',
  nurture: 'Nurture',
};

export type LeadRow = {
  opportunity: CrmLiteOpportunity;
  state: LeadQueueState;
  /** Why it is in that state. Shown on the row; never a code. */
  stateReason: string;
  qualification: LeadQualification;
  silence: OpportunitySilenceState;
  nurture: NurtureState;
  source: ResolvedLeadSource;
  /** The most recent touch, or '' when nothing has come back. */
  lastTouchDate: string;
  touchCount: number;
  /** Days since the lead was created. Null when the timestamp is unreadable. */
  ageDays: number | null;
  contactName: string;
  /** Closed leads (disqualified) stay readable but leave the working queue. */
  closed: boolean;
};

export type LeadQueue = {
  rows: LeadRow[];
  /** Working rows only - closed leads are excluded from every count. */
  counts: Record<LeadQueueState, number>;
  total: number;
  closedCount: number;
};

export type LeadQueueInput = {
  opportunities: CrmLiteOpportunity[];
  activities?: SalesActivityRecord[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  accounts?: AccountMemoryRecord[];
  /** Dated open promises, so a booked follow-up is not called silence. */
  plannedCommitments?: PlannedCommitmentSignal[];
  /**
   * Close-outs, so a disqualified lead - whose stage now reads Lost - is still
   * recognised as a lead and kept off the pipeline.
   */
  opportunityOutcomes?: OutcomeStageFact[];
  today?: string;
};

/**
 * The lead queue, built once and read by every surface that asks about leads.
 *
 * Today, Leads and Review all call this. That is the whole point: when Today
 * says "3 new leads have never been contacted", the number came from the same
 * rows the Leads page will show when the operator clicks through, and it cannot
 * be a different number.
 */
export function buildLeadQueue(input: LeadQueueInput): LeadQueue {
  const today = isValidBusinessDate(input.today) ? (input.today as string) : todayDateKey();
  const activities = input.activities || [];
  const stakeholders = input.stakeholders || [];
  const objections = input.objections || [];
  const accountKeys = new Set((input.accounts || [])
    .map((account) => normalizeEntityName(account.accountName || ''))
    .filter(Boolean));

  const rows = selectLeads(input.opportunities, disqualifiedLeadIds(input.opportunityOutcomes)).map((opportunity): LeadRow => {
    const linked = activitiesForOpportunityStrict(opportunity, activities);
    const accountKey = normalizeEntityName(opportunity.accountName || '');
    const leadStakeholders = stakeholders.filter((stakeholder) => (
      stakeholder.opportunityId === opportunity.id
      || (accountKey && normalizeEntityName(stakeholder.accountName || '') === accountKey)
    ));
    const leadObjections = objections.filter((objection) => (
      objection.opportunityId === opportunity.id
      || (accountKey && normalizeEntityName(objection.accountName || '') === accountKey)
    ));
    const qualification = qualifyLeadEvidence({
      opportunity,
      activities: linked,
      stakeholders: leadStakeholders,
      objections: leadObjections,
      knownAccount: Boolean(accountKey && accountKeys.has(accountKey)),
    });
    const silence = classifyOpportunitySilence(opportunity, activities, today, input.plannedCommitments || []);
    const nurture = classifyNurture(opportunity, today);
    const lastTouchDate = silence.lastTouchDate;
    const closed = opportunity.status !== 'Active';
    const { state, reason } = classifyLeadQueueState({
      closed, nurture, qualification, silence, touchCount: linked.length,
    });

    return {
      opportunity,
      state,
      stateReason: reason,
      qualification,
      silence,
      nurture,
      source: resolveLeadSource(opportunity),
      lastTouchDate,
      touchCount: linked.length,
      ageDays: daysBetweenBusinessDates(
        sanitizeBusinessDate(timestampToLocalDateKey(opportunity.createdAt)),
        sanitizeBusinessDate(today),
      ),
      contactName: (leadStakeholders.find((item) => (item.name || '').trim())?.name
        || (opportunity.decisionMaker || '').trim()),
      closed,
    };
  });

  const working = rows.filter((row) => !row.closed);
  const counts = leadQueueStates.reduce((accumulator, state) => {
    accumulator[state] = working.filter((row) => row.state === state).length;
    return accumulator;
  }, {} as Record<LeadQueueState, number>);

  return {
    rows: rows.sort(compareLeadRows),
    counts,
    total: working.length,
    closedCount: rows.length - working.length,
  };
}

/**
 * Which state a lead is in, as one ordered decision.
 *
 * The order is the argument. A parked lead is not "going quiet" - silence was
 * the plan. A revisit that has come due outranks everything, because it is a
 * promise the operator made to themselves. Readiness beats silence because
 * "you can qualify this now" is a better instruction than "this has been quiet
 * for nine days" about the same record.
 */
function classifyLeadQueueState(input: {
  closed: boolean;
  nurture: NurtureState;
  qualification: LeadQualification;
  silence: OpportunitySilenceState;
  touchCount: number;
}): { state: LeadQueueState; reason: string } {
  const { nurture, qualification, silence, touchCount } = input;

  if (nurture.nurturing && nurture.due) {
    const days = nurture.daysUntilRevisit;
    return {
      state: 'needs-action',
      reason: days !== null && days < 0
        ? `Revisit was due ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago.`
        : days === 0
          ? 'Revisit is due today.'
          : `Revisit is due in ${days} ${days === 1 ? 'day' : 'days'}.`,
    };
  }
  if (nurture.nurturing) {
    return {
      state: 'nurture',
      reason: nurture.reason
        ? `Parked until ${formatSafeBusinessDate(nurture.revisitDate)} - ${nurture.reason}`
        : `Parked until ${formatSafeBusinessDate(nurture.revisitDate)}.`,
    };
  }
  if (qualification.readiness === 'Ready to qualify') {
    return {
      state: 'ready',
      reason: 'Fit, a contact, a stated need and a conversation - enough to take into Discovery.',
    };
  }
  if (touchCount === 0) {
    return { state: 'new', reason: 'Nobody has spoken to them yet.' };
  }
  if (silence.status === 'silent' || silence.status === 'at-risk') {
    return {
      state: 'going-quiet',
      reason: silence.daysQuiet === null
        ? 'No recent contact and nothing scheduled.'
        : `Quiet for ${silence.daysQuiet} days with nothing scheduled.`,
    };
  }
  const missing = qualification.missing[0];
  return {
    state: 'needs-action',
    reason: missing
      ? qualification.evidence.find((item) => item.dimension === missing)?.detail || 'Something is still missing.'
      : 'Keep it moving.',
  };
}

/**
 * Queue order: the work that needs doing, then the rest.
 *
 * Within a state, oldest quiet first - a lead that has been waiting longest is
 * the one closest to being wasted. Ties break on the account name so the order
 * is stable across renders rather than on whatever `updatedAt` happened to be.
 */
const STATE_ORDER: Record<LeadQueueState, number> = {
  'needs-action': 0,
  ready: 1,
  'going-quiet': 2,
  new: 3,
  nurture: 4,
};

function compareLeadRows(left: LeadRow, right: LeadRow) {
  if (left.closed !== right.closed) return left.closed ? 1 : -1;
  const byState = STATE_ORDER[left.state] - STATE_ORDER[right.state];
  if (byState !== 0) return byState;
  const leftQuiet = left.silence.daysQuiet ?? left.ageDays ?? 0;
  const rightQuiet = right.silence.daysQuiet ?? right.ageDays ?? 0;
  if (leftQuiet !== rightQuiet) return rightQuiet - leftQuiet;
  return (left.opportunity.accountName || '').localeCompare(right.opportunity.accountName || '');
}

/* ------------------------------------------------------------------------- */
/* What Today needs to know                                                   */
/* ------------------------------------------------------------------------- */

export type LeadSignalKind = 'never-contacted' | 'revisit-due' | 'going-quiet' | 'ready-to-qualify';

export type LeadSignal = {
  kind: LeadSignalKind;
  /** The rows this signal stands for. Never empty. */
  rows: LeadRow[];
  /** What happened, in the operator's own terms. */
  headline: string;
  /** Why it matters. */
  detail: string;
  /** What to do about it - a verb, and a name when there is one lead. */
  action: string;
  /**
   * How much it matters today, as the two levels Today ranks on. High when the
   * exception is already costing something - a revisit past its date, a lead
   * that has waited a week for a first touch, one that is ready and not moved.
   */
  urgency: 'High' | 'Medium';
  /** The soonest date in the group, when the signal is about a date. */
  dueDate: string;
  href: string;
};

/** How long a new lead may wait for a first touch before it is late. */
export const FIRST_TOUCH_LATE_DAYS = 7;

const nameOf = (row: LeadRow) => row.opportunity.accountName || row.opportunity.opportunityName || 'a lead';

/** "ABC Pharma", "ABC Pharma and Rohto", "ABC Pharma, Rohto and 3 more". */
function namesOf(rows: LeadRow[]) {
  const names = rows.map(nameOf);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/**
 * The lead exceptions worth interrupting a day for.
 *
 * Exceptions, not a count. "12 leads" is a fact about a list and tells nobody
 * what to do; "3 leads have never been contacted, the oldest 11 days ago" names
 * work. Each signal carries its rows, so the surface can say which leads and
 * link to them rather than restating the number - and each says what happened,
 * why it matters and what to do, because a signal that stops at "at risk"
 * leaves the operator to work out the rest.
 */
export function buildLeadSignals(queue: LeadQueue): LeadSignal[] {
  const working = queue.rows.filter((row) => !row.closed);
  const signals: LeadSignal[] = [];

  const revisitDue = working.filter((row) => row.nurture.nurturing && row.nurture.due);
  if (revisitDue.length) {
    const overdue = revisitDue.filter((row) => (row.nurture.daysUntilRevisit ?? 0) < 0);
    const soonest = [...revisitDue].sort((left, right) => left.nurture.revisitDate.localeCompare(right.nurture.revisitDate))[0];
    signals.push({
      kind: 'revisit-due',
      rows: revisitDue,
      headline: revisitDue.length === 1
        ? (soonest.nurture.daysUntilRevisit ?? 0) < 0
          ? `${nameOf(soonest)} was parked until ${formatSafeBusinessDate(soonest.nurture.revisitDate)}, and that date has passed`
          : `${nameOf(soonest)} is due for its revisit on ${formatSafeBusinessDate(soonest.nurture.revisitDate)}`
        : `${revisitDue.length} nurtured leads are due to be revisited`,
      detail: overdue.length
        ? `${overdue.length === revisitDue.length ? 'The date you set has passed' : `${overdue.length} of them passed the date you set`}. You parked ${revisitDue.length === 1 ? 'it' : 'them'} because the timing was wrong - the timing has arrived${soonest.nurture.reason ? ` (${soonest.nurture.reason})` : ''}.`
        : `You parked ${revisitDue.length === 1 ? 'it' : 'them'} because the timing was wrong, and the date you chose is here.`,
      action: revisitDue.length === 1
        ? `Revisit ${nameOf(soonest)}: book a touch, qualify it, or park it again`
        : `Revisit ${namesOf(revisitDue)}`,
      urgency: overdue.length ? 'High' : 'Medium',
      dueDate: soonest.nurture.revisitDate,
      href: '/app/leads?state=needs-action',
    });
  }

  const ready = working.filter((row) => row.state === 'ready');
  if (ready.length) {
    signals.push({
      kind: 'ready-to-qualify',
      rows: ready,
      headline: `${ready.length === 1 ? nameOf(ready[0]) : `${ready.length} leads`} ${ready.length === 1 ? 'has' : 'have'} enough evidence to qualify`,
      detail: 'Fit, a contact, a stated need and a two-way conversation are all on record. Until it is qualified it is not in the pipeline, the forecast or Review.',
      action: ready.length === 1 ? `Qualify ${nameOf(ready[0])} into Discovery` : `Qualify ${namesOf(ready)}`,
      urgency: 'High',
      dueDate: '',
      href: '/app/leads?state=ready',
    });
  }

  const neverContacted = working.filter((row) => row.state === 'new');
  if (neverContacted.length) {
    const oldest = neverContacted.reduce((worst, row) => (
      (row.ageDays ?? 0) > (worst.ageDays ?? 0) ? row : worst
    ), neverContacted[0]);
    const waited = oldest.ageDays ?? 0;
    signals.push({
      kind: 'never-contacted',
      rows: neverContacted,
      headline: `${neverContacted.length} new ${neverContacted.length === 1 ? 'lead has' : 'leads have'} never been contacted`,
      detail: waited > 0
        ? `The oldest has been waiting ${waited} ${waited === 1 ? 'day' : 'days'} - ${nameOf(oldest)}. A lead that hears nothing in the first week rarely answers the second.`
        : 'They arrived and nothing has gone back out yet.',
      action: neverContacted.length === 1 ? `Make first contact with ${nameOf(oldest)}` : `Make first contact, starting with ${nameOf(oldest)}`,
      urgency: waited >= FIRST_TOUCH_LATE_DAYS ? 'High' : 'Medium',
      dueDate: '',
      href: '/app/leads?state=new',
    });
  }

  const quiet = working.filter((row) => row.state === 'going-quiet');
  if (quiet.length) {
    const worst = quiet[0];
    signals.push({
      kind: 'going-quiet',
      rows: quiet,
      headline: quiet.length === 1
        ? `${nameOf(worst)} has been quiet for ${worst.silence.daysQuiet ?? 0} days with no next step`
        : `${quiet.length} leads are going quiet with no next step`,
      detail: quiet.length === 1
        ? 'Nothing is scheduled, so nothing will bring it back to you.'
        : `${nameOf(worst)} is the quietest, at ${worst.silence.daysQuiet ?? 0} days. Nothing is scheduled on any of them.`,
      action: quiet.length === 1
        ? `Book a next step with ${nameOf(worst)}, park it with a date, or disqualify it`
        : `Book a next step or park each of ${namesOf(quiet)}`,
      urgency: 'Medium',
      dueDate: '',
      href: '/app/leads?state=going-quiet',
    });
  }

  return signals;
}

/* ------------------------------------------------------------------------- */
/* Need, read from a note                                                     */
/* ------------------------------------------------------------------------- */

/**
 * The sentences in a note that say what a lead might need.
 *
 * Capture's classifier reads buying signals for a deal in motion - a quote
 * asked for, a PO promised - and on a first conversation it finds none, so a
 * lead created from "New microbiology laboratory planned next year. Interested
 * in rapid testing." arrived with nothing under Need, and the queue called it
 * a lead with no stated need. The need was in the note the whole time.
 *
 * Sentences, not phrases, and quoted as written: this is the operator's own
 * words moved into the Evidence field they would otherwise retype, shown to them
 * before the lead is created. Nothing is summarised, scored or guessed.
 */
const NEED_CUES = /\b(interested in|interest in|looking (?:for|at|to)|evaluating|considering|planned|planning|plans? (?:to|for)|new (?:lab|laboratory|plant|facility|line|site|project|building)|expan(?:d|sion|ding)|replac(?:e|ing|ement)|upgrade|needs?|requires?|requirement|tender|rfq|rfp|budget (?:for|approved)|currently uses?|switching from|pain|problem|issue with)\b/iu;

export function extractLeadNeedSentences(note: string, limit = 3): string[] {
  return (note || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8 && NEED_CUES.test(sentence))
    // A follow-up instruction is a next step, not a need, even when it says
    // "needs": "Need to call back Tuesday" belongs on the Plan.
    .filter((sentence) => !/^(?:follow[ -]?up|call(?: back)?|send|email|remind|need to (?:call|send|email|follow))\b/iu.test(sentence))
    .slice(0, limit);
}

/* ------------------------------------------------------------------------- */
/* What leads taught - Review's lead funnel                                   */
/* ------------------------------------------------------------------------- */

/**
 * The minimum number of leads a source needs before its conversion is quoted.
 *
 * Below it, "Referral converts 100%" is one lead that worked. The row is still
 * listed, with its counts, and says there is not enough to call it a rate.
 */
export const MIN_LEADS_FOR_RATE = 5;

export type LeadFunnelSourceRow = {
  label: string;
  leads: number;
  qualified: number;
  won: number;
  /** Null below MIN_LEADS_FOR_RATE. */
  qualifiedRate: number | null;
};

export type LeadFunnel = {
  /** Every record that has ever been a lead, as far as the records can prove. */
  leads: number;
  /** Leads with at least one recorded touch. */
  engaged: number;
  qualified: number;
  /** Qualified leads still in the pipeline or closed from it. */
  won: number;
  disqualified: number;
  /** Median days from a lead's creation to its first touch. */
  medianDaysToFirstTouch: number | null;
  /** Median days from creation to the observed qualification. */
  medianDaysToQualify: number | null;
  qualifiedRate: number | null;
  bySource: LeadFunnelSourceRow[];
  disqualifyReasons: { reason: string; count: number }[];
  /** Why a number is missing, when it is: the event log started after the leads. */
  notes: string[];
};

type FunnelEvent = { eventType: string; opportunityId?: string | null; occurredAt: string; structuredPayload?: Record<string, unknown> };
type FunnelOutcome = { opportunityId: string; outcome: string; stageBeforeOutcome: string; reasonText: string; createdAt: string };

/**
 * Lead to pipeline, as seller learning rather than a marketing funnel.
 *
 * A record counts as a lead when the records prove it was one: it is at the
 * Lead stage now, an observed stage change moved it off Lead, or it was closed
 * out of Lead. A deal that was qualified before stage changes were observed is
 * not counted - there is no way to know it started as a lead, and counting every
 * Discovery deal as a former lead would invent a conversion rate.
 */
export function buildLeadFunnel(input: {
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  events: FunnelEvent[];
  outcomes: FunnelOutcome[];
  includeSampleRecords?: boolean;
}): LeadFunnel {
  const include = input.includeSampleRecords === true;
  const opportunities = input.opportunities.filter((record) => include || record.isSample !== true);
  const qualifiedAt = new Map<string, string>();
  for (const event of input.events) {
    if (event.eventType !== 'opportunity_stage_changed' || !event.opportunityId) continue;
    const from = String(event.structuredPayload?.from || '');
    const to = String(event.structuredPayload?.to || '');
    if (!isLeadStage(from) || !to || isLeadStage(to) || to === 'Lost' || to === 'Won') continue;
    const current = qualifiedAt.get(event.opportunityId);
    if (!current || event.occurredAt < current) qualifiedAt.set(event.opportunityId, event.occurredAt);
  }
  const disqualified = new Map(input.outcomes.filter(isDisqualifiedLeadOutcome).map((outcome) => [outcome.opportunityId, outcome]));

  const leads = opportunities.filter((record) => isLeadStage(record.stage) || qualifiedAt.has(record.id) || disqualified.has(record.id));
  const firstTouchDays: number[] = [];
  const qualifyDays: number[] = [];
  let engaged = 0;
  let won = 0;
  const sources = new Map<string, LeadFunnelSourceRow>();

  for (const lead of leads) {
    const created = timestampToLocalDateKey(lead.createdAt);
    const touches = activitiesForOpportunityStrict(lead, input.activities)
      .map((activity) => sanitizeBusinessDate(activity.activityDate))
      .filter(Boolean)
      .sort();
    if (touches.length) {
      engaged += 1;
      const days = daysBetweenBusinessDates(created, touches[0]);
      if (days !== null && days >= 0) firstTouchDays.push(days);
    }
    const qualifiedOn = qualifiedAt.get(lead.id);
    if (qualifiedOn) {
      const days = daysBetweenBusinessDates(created, timestampToLocalDateKey(qualifiedOn));
      if (days !== null && days >= 0) qualifyDays.push(days);
      if (lead.status === 'Won') won += 1;
    }
    const source = resolveLeadSource(lead).label || 'Not recorded';
    const row = sources.get(source) || { label: source, leads: 0, qualified: 0, won: 0, qualifiedRate: null };
    row.leads += 1;
    if (qualifiedOn) row.qualified += 1;
    if (qualifiedOn && lead.status === 'Won') row.won += 1;
    sources.set(source, row);
  }

  const reasons = new Map<string, number>();
  for (const outcome of disqualified.values()) {
    const reason = (outcome.reasonText || '').split(' - ')[0].trim() || 'No reason given';
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }

  const notes: string[] = [];
  if (leads.length > 0 && qualifiedAt.size === 0) {
    notes.push('No qualification has been observed yet. A deal qualified before stage changes were recorded cannot be shown to have started as a lead, so it is not counted here.');
  }

  return {
    leads: leads.length,
    engaged,
    qualified: qualifiedAt.size,
    won,
    disqualified: disqualified.size,
    medianDaysToFirstTouch: median(firstTouchDays),
    medianDaysToQualify: median(qualifyDays),
    qualifiedRate: leads.length >= MIN_LEADS_FOR_RATE ? qualifiedAt.size / leads.length : null,
    bySource: [...sources.values()]
      .map((row) => ({ ...row, qualifiedRate: row.leads >= MIN_LEADS_FOR_RATE ? row.qualified / row.leads : null }))
      .sort((left, right) => right.leads - left.leads || left.label.localeCompare(right.label)),
    disqualifyReasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    notes,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
