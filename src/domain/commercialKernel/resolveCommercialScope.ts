import { normalizeEntityName } from '../../utils/accountIdentity.ts';
import { sanitizeBusinessDate } from '../../utils/safeDate.ts';

/**
 * Which commercial thread a note is about.
 *
 * ## The problem this exists to fix
 *
 * A real workspace was measured at one opportunity-linked activity in a hundred
 * - while ninety-nine of those hundred carried the customer's name. The history
 * was there. What was missing was the sentence connecting it to the deal it
 * belonged to, and without that sentence Delta cannot show a deal's touches,
 * the silence rules disagree with the touch count beside them, and every
 * learning cohort is empty.
 *
 * The cause was not the seller. It was that resolving the deal happened *after*
 * the save, in a separate panel headed "choose a safe manual link" - which is
 * CRM administration, and people correctly decline to do CRM administration.
 *
 * ## The rule
 *
 * Link when reasonably known. Not "link at any cost".
 *
 * A false link is worse than a missing one, because a missing link leaves a
 * cohort small and a false link leaves it wrong - and nothing downstream can
 * tell the difference. So this resolves to one of four states and only two of
 * them ever preselect anything.
 *
 * ## What is never identity evidence
 *
 * Deal value, closeness of the expected close date, most-recently-edited,
 * alphabetical order, or where a deal sits in the priority ranking. Every one of
 * those would produce a confident link on a note that names no deal at all, and
 * every one of them is a property of the deal rather than of the interaction.
 * This file reads only things that say *which conversation this was*.
 */

// ------------------------------------------------------------------ vocabulary

/**
 * How the scope was arrived at.
 *
 *   exact             - the note or the screen said which deal this is.
 *   strong_match      - exactly one deal on this customer could plausibly be it.
 *   multiple_matches  - several could be. The operator picks; nothing is guessed.
 *   unresolved        - none could be. The note stays with the customer, which
 *                       is a legitimate and common answer, not a failure.
 */
export const scopeResolutions = ['exact', 'strong_match', 'multiple_matches', 'unresolved'] as const;
export type ScopeResolution = (typeof scopeResolutions)[number];

/** Why this deal was proposed. Shown to the operator, never a score. */
export const scopeReasons = [
  'opened_from_opportunity',
  'named_in_note',
  'only_open_deal_on_account',
  'several_open_deals',
  'no_open_deal',
  'no_account',
] as const;
export type ScopeReason = (typeof scopeReasons)[number];

export type ScopeOpportunity = {
  id: string;
  accountName: string;
  opportunityName: string;
  status: string;
  createdAt: string;
};

export type ScopeCandidate = {
  opportunityId: string;
  opportunityName: string;
  /** Won, Lost and On hold are offered but never preselected. */
  isOpen: boolean;
};

/**
 * Where the operator was standing when they started writing.
 *
 * Typed rather than read from the router: the parser and the resolver must be
 * testable without a React tree, and a resolver that reaches into route state
 * is one that behaves differently in a test than in the product.
 */
export type CaptureOrigin =
  | { kind: 'opportunity'; opportunityId: string }
  | { kind: 'account'; accountName: string }
  | { kind: 'global' };

export type CommercialScope = {
  accountName: string;
  opportunityId: string | null;
  opportunityName: string;
  resolution: ScopeResolution;
  reason: ScopeReason;
  /**
   * Everything the operator could reasonably pick instead, newest first.
   * Populated whenever the account has any deal at all, so correcting a
   * strong match never means going somewhere else to do it.
   */
  candidates: ScopeCandidate[];
};

// -------------------------------------------------------------------- resolve

export function resolveCommercialScope(input: {
  /** The customer, already resolved. Empty when the note named none. */
  accountName: string;
  rawNote: string;
  /** The business day the note is about. Decides what already existed. */
  captureDate: string;
  opportunities: ScopeOpportunity[];
  origin?: CaptureOrigin;
}): CommercialScope {
  const captureDay = sanitizeBusinessDate(input.captureDate) || input.captureDate;

  // 1. The screen already said which deal this is.
  //
  // Capture opened from a deal is the strongest evidence there is - stronger
  // than anything in the text, because the operator chose it with a click. It
  // is also the one place a closed deal is legitimate: post-sale work on a won
  // deal is real work, and the operator asked for it explicitly.
  const origin = input.origin;
  if (origin?.kind === 'opportunity') {
    const chosen = input.opportunities.find((item) => item.id === origin.opportunityId);
    if (chosen) {
      return {
        accountName: chosen.accountName,
        opportunityId: chosen.id,
        opportunityName: chosen.opportunityName,
        resolution: 'exact',
        reason: 'opened_from_opportunity',
        candidates: candidatesFor(chosen.accountName, input.opportunities),
      };
    }
  }

  const accountKey = normalizeEntityName(input.accountName || '');
  if (!accountKey) {
    return {
      accountName: '',
      opportunityId: null,
      opportunityName: '',
      resolution: 'unresolved',
      reason: 'no_account',
      candidates: [],
    };
  }

  const onAccount = input.opportunities.filter(
    (item) => normalizeEntityName(item.accountName) === accountKey,
  );
  const candidates = candidatesFor(input.accountName, input.opportunities);

  // 2. The note names the deal.
  //
  // The whole name, as a contiguous phrase. A shared token is not a name: two
  // deals called "PMM media rollout" and "PMM spare parts" share "PMM", and
  // matching on that is how a note about spares lands on the rollout.
  const named = onAccount.filter((item) => noteNames(input.rawNote, item.opportunityName));
  if (named.length === 1) {
    return {
      accountName: named[0].accountName,
      opportunityId: named[0].id,
      opportunityName: named[0].opportunityName,
      resolution: 'exact',
      reason: 'named_in_note',
      candidates,
    };
  }
  if (named.length > 1) {
    return {
      accountName: input.accountName,
      opportunityId: null,
      opportunityName: '',
      resolution: 'multiple_matches',
      reason: 'several_open_deals',
      candidates,
    };
  }

  // 3. One open deal that already existed on the day.
  //
  // Both halves matter. A deal created in August cannot be what a note from
  // March was about, however obviously it is the only one open today - that is
  // reading the present back into the past, and it is the single easiest way to
  // manufacture a history that never happened.
  const plausible = onAccount.filter(
    (item) => isOpen(item.status) && existedOn(item.createdAt, captureDay),
  );

  if (plausible.length === 1) {
    return {
      accountName: plausible[0].accountName,
      opportunityId: plausible[0].id,
      opportunityName: plausible[0].opportunityName,
      resolution: 'strong_match',
      reason: 'only_open_deal_on_account',
      candidates,
    };
  }

  return {
    accountName: input.accountName,
    opportunityId: null,
    opportunityName: '',
    resolution: plausible.length > 1 ? 'multiple_matches' : 'unresolved',
    reason: plausible.length > 1 ? 'several_open_deals' : 'no_open_deal',
    candidates,
  };
}

/** Whether this scope may be written without the operator confirming it. */
export function isPreselectable(scope: CommercialScope): boolean {
  return scope.opportunityId !== null
    && (scope.resolution === 'exact' || scope.resolution === 'strong_match');
}

// ------------------------------------------------------------------- helpers

/**
 * Deals that may be offered for selection, open ones first.
 *
 * Closed deals are listed rather than hidden: post-sale work happens, and a
 * seller who has to leave the page to file a delivery note against a won deal
 * will file it nowhere. They are never preselected, which is the part that
 * matters.
 */
function candidatesFor(accountName: string, opportunities: ScopeOpportunity[]): ScopeCandidate[] {
  const accountKey = normalizeEntityName(accountName || '');
  if (!accountKey) return [];
  return opportunities
    .filter((item) => normalizeEntityName(item.accountName) === accountKey)
    .map((item) => ({
      opportunityId: item.id,
      opportunityName: item.opportunityName,
      isOpen: isOpen(item.status),
    }))
    .sort((left, right) => Number(right.isOpen) - Number(left.isOpen)
      || left.opportunityName.localeCompare(right.opportunityName));
}

/**
 * Only `Active` counts as open.
 *
 * `On hold` is deliberately not open. A paused deal is one the customer is not
 * currently working, so a new interaction is more likely to be about something
 * else - and if it really is about the paused deal, the operator can say so.
 */
function isOpen(status: string): boolean {
  return (status || '').trim() === 'Active';
}

/** Whether the deal existed on the day the interaction happened. */
function existedOn(createdAt: string, day: string): boolean {
  const created = sanitizeBusinessDate((createdAt || '').slice(0, 10));
  // A deal with no readable creation date cannot be shown to have existed yet,
  // and the safe direction here is to decline rather than to assume.
  if (!created) return false;
  return created <= day;
}

/**
 * Whether the note contains this deal's name as a phrase.
 *
 * Normalised on both sides so casing, accents and punctuation do not decide it,
 * and required whole so a shared word cannot. A name shorter than four
 * characters is not distinctive enough to carry a link on its own.
 */
function noteNames(rawNote: string, opportunityName: string): boolean {
  const needle = normalizeEntityName(opportunityName || '');
  if (needle.length < 4) return false;
  return normalizeEntityName(rawNote || '').includes(needle);
}
