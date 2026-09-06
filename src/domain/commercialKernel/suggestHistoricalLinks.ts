import type { SalesActivityRecord } from '../../services/salesActivityStore';
import {
  resolveCommercialScope,
  type ScopeOpportunity,
  type ScopeReason,
} from './resolveCommercialScope.ts';
import { sanitizeBusinessDate } from '../../utils/safeDate.ts';
import { normalizeEntityName } from '../../utils/accountIdentity.ts';

/**
 * Past interactions that may belong to a deal - offered, never applied.
 *
 * ## Why this is suggestions and not a backfill
 *
 * The temptation with a workspace holding ninety-nine unlinked activities is a
 * one-click "fix my history". It would work, it would be popular, and it would
 * quietly destroy the only thing that makes Commercial Learning worth having:
 * a cohort you can argue with. A wrong link is invisible afterwards - the
 * activity sits on the deal looking exactly like a right one - and it changes
 * what the product tells the seller about their own business.
 *
 * So nothing here writes. It produces a list, the operator decides, and the
 * decision goes through the same canonical update path a manual link uses.
 *
 * ## What may not be used as evidence
 *
 * The deal being the only one open *today*. That is the single most tempting
 * signal and the most wrong: a note from March cannot be about a deal created
 * in August, and the account having exactly one live deal now says nothing
 * about what was live then. Every suggestion is gated on the deal having
 * existed on the day of the interaction.
 *
 * Nothing that Commercial Learning produces may be used either, and that is
 * enforced structurally: this module cannot see it. Learning is a consumer of
 * linkage. Making it an input would mean the product chose the history that
 * made its own findings look better.
 */

export type HistoricalLinkSuggestion = {
  activityId: string;
  activityDate: string;
  /** The note's own summary, so the operator can recognise the interaction. */
  activitySummary: string;
  opportunityId: string;
  opportunityName: string;
  accountName: string;
  /** Why this was offered, from the shared scope vocabulary. */
  reason: Extract<ScopeReason, 'named_in_note' | 'only_open_deal_on_account'>;
};

export type HistoricalLinkReview = {
  suggestions: HistoricalLinkSuggestion[];
  /** Unlinked activities that were examined. The denominator. */
  examined: number;
  /** Grouped for the interface: one heading per deal. */
  byOpportunity: { opportunityId: string; opportunityName: string; accountName: string; count: number }[];
};

export function suggestHistoricalLinks(input: {
  activities: SalesActivityRecord[];
  opportunities: ScopeOpportunity[];
  includeSampleRecords?: boolean;
}): HistoricalLinkReview {
  const includeSamples = input.includeSampleRecords === true;
  const visible = <T extends { isSample?: boolean; source?: string }>(record: T) =>
    includeSamples || (record.isSample !== true && record.source !== 'demo');

  // Indexed once, not per activity. Without this the scan is every activity
  // against every deal in the workspace, which at a real book is millions of
  // comparisons to answer a question about a handful of customers.
  const byAccount = new Map<string, ScopeOpportunity[]>();
  for (const opportunity of input.opportunities) {
    const key = normalizeEntityName(opportunity.accountName || '');
    if (!key) continue;
    const bucket = byAccount.get(key);
    if (bucket) bucket.push(opportunity);
    else byAccount.set(key, [opportunity]);
  }

  const suggestions: HistoricalLinkSuggestion[] = [];
  let examined = 0;

  for (const activity of input.activities.filter(visible)) {
    // Already answered, in either direction. `Ignored` is an answer too, and
    // asking again about something the operator has already declined is how a
    // suggestion list becomes something people stop opening.
    if (activity.linkStatus !== 'Unlinked') continue;

    const activityDate = sanitizeBusinessDate(activity.activityDate);
    // Without a day there is no way to ask what existed at the time, and
    // "cannot establish chronology" means no suggestion rather than a guess.
    if (!activityDate) continue;

    const accountName = (activity.linkedAccountName || activity.accountName || '').trim();
    if (!accountName) continue;

    examined += 1;

    // The same resolver the live capture path uses, given the day the
    // interaction happened rather than today. One definition of "which deal is
    // this", so a suggestion can never disagree with what Capture would have
    // proposed at the time.
    const scope = resolveCommercialScope({
      accountName,
      rawNote: activity.rawNote || activity.summary || '',
      captureDate: activityDate,
      opportunities: byAccount.get(normalizeEntityName(accountName)) || [],
    });

    // Only the two states that identify a deal. `multiple_matches` is exactly
    // the case where a suggestion would be a coin toss dressed as help.
    if (scope.resolution !== 'exact' && scope.resolution !== 'strong_match') continue;
    if (!scope.opportunityId) continue;
    if (scope.reason !== 'named_in_note' && scope.reason !== 'only_open_deal_on_account') continue;

    suggestions.push({
      activityId: activity.id,
      activityDate,
      activitySummary: activity.summary || activity.rawNote.slice(0, 120),
      opportunityId: scope.opportunityId,
      opportunityName: scope.opportunityName,
      accountName: scope.accountName,
      reason: scope.reason,
    });
  }

  const grouped = new Map<string, { opportunityId: string; opportunityName: string; accountName: string; count: number }>();
  for (const suggestion of suggestions) {
    const held = grouped.get(suggestion.opportunityId);
    if (held) held.count += 1;
    else {
      grouped.set(suggestion.opportunityId, {
        opportunityId: suggestion.opportunityId,
        opportunityName: suggestion.opportunityName,
        accountName: suggestion.accountName,
        count: 1,
      });
    }
  }

  return {
    suggestions: suggestions.sort((left, right) => right.activityDate.localeCompare(left.activityDate)),
    examined,
    byOpportunity: [...grouped.values()].sort((left, right) => right.count - left.count),
  };
}
