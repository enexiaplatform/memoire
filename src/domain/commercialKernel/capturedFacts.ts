import type { ObjectionType } from '../../services/objectionStore';
import type { CommitmentParty } from './types.ts';
import type { EvidenceCategory, EvidenceDirection } from './commercialEvidence.ts';

/**
 * What Memoire thinks a note means, before it is allowed to change anything.
 *
 * The whole point of this file is the word *before*. A parser - the
 * deterministic one that exists today, or an optional model later - proposes
 * facts. It never writes them. The operator accepts, edits or ignores each one,
 * and only then does a canonical command run.
 *
 * That separation is not ceremony. Capture is the one surface where the product
 * guesses, and a guess that writes itself into the commercial record is
 * indistinguishable from a fact the operator entered. The review step is what
 * keeps "Memoire read this out of your note" and "this is true" different
 * things.
 *
 * ## What this is not
 *
 * It is not a knowledge graph, and it is deliberately small. Five fact kinds,
 * each with exactly one canonical destination that already exists. A finding
 * with no canonical home stays an `unsupported` line: shown, never saved. A
 * sixth kind may only be added when the record it would write already exists -
 * inventing a destination to make the parser look clever is how a demo becomes
 * a data model nobody asked for.
 *
 * ## The seam
 *
 * `CaptureParser` is the interface a future optional model would implement. It
 * returns the same `ReviewableChangeSet`, so the review UI, the dispatcher, the
 * kernel and everything downstream are unchanged by where the facts came from.
 * There is one implementation today and it is deterministic.
 */

// ------------------------------------------------------------------- vocabulary

export const capturedFactKinds = [
  /** Someone raised a concern that has to be answered. */
  'objection',
  /** A person was present, with the job title the note gave them. */
  'stakeholder',
  /** Somebody owes something by a date - you, the customer, or someone internal. */
  'commitment',
  /** What the deal is thought to be worth. */
  'opportunity_value',
  /** Something happens on a day: a visit, a trial, a review. */
  'scheduled_event',
  /**
   * Something the seller now knows: a trial passed, a technical evaluation
   * failed. Added in 3.1, and only after the record it writes existed - the
   * rule this list is under is that a kind may not be invented to make the
   * parser look clever.
   */
  'commercial_evidence',
] as const;
export type CapturedFactKind = (typeof capturedFactKinds)[number];

/**
 * How sure the parser is, categorically.
 *
 * Not a percentage. A number like 0.72 implies a calibration this parser does
 * not have and cannot get, and the first time somebody sorts by it the number
 * starts making decisions it was never entitled to make.
 *
 *   exact     - the note says it outright. "400,000,000 VND", "by 20 September".
 *   inferred  - the note implies it and the reading is the ordinary one.
 *               "around 400M" is an amount; "I promised to send it" is yours.
 *   ambiguous - the note supports it but something material is missing or
 *               could be read two ways. Shown, and worth a second look before
 *               it is accepted.
 */
export const factCertainties = ['exact', 'inferred', 'ambiguous'] as const;
export type FactCertainty = (typeof factCertainties)[number];

/**
 * Where a fact stands in the review.
 *
 * `already_recorded` is a proposal that the workspace can already answer. It is
 * shown rather than hidden, because silently dropping a fact the operator wrote
 * down looks like the parser missed it.
 */
export const capturedFactStatuses = ['proposed', 'accepted', 'ignored', 'already_recorded'] as const;
export type CapturedFactStatus = (typeof capturedFactStatuses)[number];

/** Which customer and deal a fact would attach to. Editable before it is saved. */
export type CaptureTarget = {
  accountName: string;
  opportunityId: string | null;
  opportunityName: string;
};

// ------------------------------------------------------------------ fact values

/**
 * The proposed content, by kind.
 *
 * Each variant maps to exactly one canonical write path, and the mapping lives
 * in `commitCapturedFacts.ts`. Nothing here is free-form: a value that cannot
 * be expressed in the canonical record is not a fact, it is an unsupported
 * finding.
 */
export type CapturedFactValue =
  | {
    kind: 'objection';
    /** From the shared taxonomy. Capture declares no second list of these. */
    objectionType: ObjectionType;
    text: string;
  }
  | {
    kind: 'stakeholder';
    name: string;
    /**
     * The job title as written. The MEDDIC role stays Unknown on purpose:
     * being in the room is not authority, and "talked to John" has never
     * proved that John decides anything.
     */
    roleTitle: string;
  }
  | {
    kind: 'commitment';
    party: CommitmentParty;
    ownerLabel: string;
    text: string;
    /** Empty when the note gave no date. A promise with no date is still a promise. */
    dueDate: string;
  }
  | {
    kind: 'opportunity_value';
    amount: number;
    currency: string;
    /** "around 400M" is an estimate about an estimate. It is not a quote. */
    approximate: boolean;
  }
  | {
    kind: 'scheduled_event';
    label: string;
    date: string;
  }
  | {
    kind: 'commercial_evidence';
    category: EvidenceCategory;
    /**
     * Which way it points. Never inferred from cheerfulness: "looks promising"
     * is not an acceptance, and this stays `neutral` for a hedge so the
     * operator is the one who decides to call it a pass.
     */
    direction: EvidenceDirection;
    /** The canonical one-liner. The quoted sentence lives in `evidence`. */
    summary: string;
  };

export type CapturedFact = CapturedFactValue & {
  id: string;
  /**
   * The operator's own words that produced this.
   *
   * Not a character offset. Offsets would be exact and would break the moment
   * anything upstream normalises whitespace; the sentence is what a person
   * actually needs to check the proposal, and it survives every transformation
   * the pipeline does.
   */
  evidence: string;
  certainty: FactCertainty;
  target: CaptureTarget;
  status: CapturedFactStatus;
  /** The record that already says this, when `status` is `already_recorded`. */
  duplicateOf?: string;
};

/**
 * Something the parser recognised and has nowhere to put.
 *
 * Kept visible rather than dropped. It is the honest answer to "why did Memoire
 * not pick that up", and over time it is the list that says which fact kind is
 * worth building next.
 */
export type UnsupportedFinding = {
  label: string;
  evidence: string;
};

export type ReviewableChangeSet = {
  /** Preserved verbatim. Never overwritten by what was extracted from it. */
  rawCapture: string;
  /** The business day the note is about, not the instant it was typed. */
  captureDate: string;
  target: CaptureTarget;
  facts: CapturedFact[];
  unsupported: UnsupportedFinding[];
};

// ---------------------------------------------------------------------- parser

/**
 * What the workspace already knows, so a proposal can be checked against it
 * before it is shown.
 *
 * Indexed once by the caller and handed in whole. A parser that reaches back
 * into stores per token is how capture becomes slow on a real book.
 */
export type CaptureParseContext = {
  accounts: { id: string; accountName: string }[];
  opportunities: {
    id: string; accountName: string; opportunityName: string;
    productOrSolution?: string; stage?: string; currency?: string; estimatedValue?: number | null;
  }[];
  /** Existing records, for the duplicate check. */
  objections: { id: string; accountName: string; opportunityId: string; objectionText: string; status: string }[];
  stakeholders: { id: string; accountName: string; name: string }[];
  openCommitments: { id: string; accountName: string; opportunityId?: string | null; commitmentText: string }[];
  /** Findings already on the books, so the same trial is not recorded twice. */
  evidence: {
    id: string; accountName: string; opportunityId?: string | null;
    category: string; direction: string; summary: string;
  }[];
  /** The currency to fall back on when the note names none. */
  reportingCurrency: string;
};

export type CaptureParseInput = {
  rawCapture: string;
  /**
   * The commercial thread the operator confirmed this note is about.
   *
   * When present it *is* the target for every fact, rather than each fact
   * re-deriving one from the text. That is the whole point of confirming a
   * scope once: a note about the PMM rollout does not become an objection on
   * the rollout, a commitment on nothing, and a value change on whichever deal
   * the parser liked best.
   *
   * Absent means the caller has no confirmed scope and the parser should read
   * one out of the note, which is the pre-3.1 behaviour and still correct for
   * any caller that has not been taught about scope.
   */
  scope?: { accountName: string; opportunityId: string | null; opportunityName: string };
  /**
   * The business day the note describes. Every relative date - "Friday",
   * "tomorrow" - is resolved against this and nothing else, so the same note
   * parsed twice produces the same dates, in tests and in December.
   */
  captureDate: string;
  context: CaptureParseContext;
};

/**
 * The seam.
 *
 * One implementation today: `parseCapture`, deterministic and local. A future
 * optional model would implement this same shape and return the same
 * `ReviewableChangeSet`, which is why nothing downstream would have to change:
 * the review UI, the dispatcher, the commands and the kernel all read the
 * output, never the producer.
 */
export type CaptureParser = (input: CaptureParseInput) => ReviewableChangeSet;

// --------------------------------------------------------------------- helpers

/** Whether a fact would actually change anything if it were accepted. */
export function isCommittable(fact: CapturedFact): boolean {
  return fact.status === 'accepted';
}

/** The facts the operator has said yes to, in the order they were proposed. */
export function acceptedFacts(changeSet: ReviewableChangeSet): CapturedFact[] {
  return changeSet.facts.filter(isCommittable);
}

/**
 * A short label for a fact kind, for analytics and for the review heading.
 *
 * Deliberately not the fact's content: the label is a category, and categories
 * are what may leave the device.
 */
export const factKindLabels: Record<CapturedFactKind, string> = {
  objection: 'Objection',
  stakeholder: 'Person',
  commitment: 'Commitment',
  opportunity_value: 'Deal value',
  scheduled_event: 'Event',
  commercial_evidence: 'Finding',
};
