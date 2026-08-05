import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import { normalizeEntityName } from './accountIdentity.ts';

/**
 * The deal a record is really about.
 *
 * Quotes carry an `opportunityId`, and most of the time it is written - the
 * quote editor has an Opportunity picker. But it is optional, it is blank on
 * every quote created before the picker existed, and it is blank on anything
 * imported. So a surface that reads `quote.opportunityId` and stops has decided
 * that an unlinked quote belongs to no deal at all.
 *
 * That decision had a visible cost. `buildRevenueView` excludes already-quoted
 * deals from the weak-pipeline watch-list using that id alone, so a seller who
 * had quoted a customer kept being told the deal was unsupported - the exact
 * "I updated this and it still warns me" complaint, arriving from the other
 * direction. Meanwhile the Today cockpit had already grown a name-based
 * fallback for the same problem, privately, and the two surfaces disagreed
 * about which deals were quoted.
 *
 * One resolver now, using the workspace's canonical name rule
 * (`normalizeEntityName`, which is diacritic- and punctuation-insensitive) so
 * "CÔNG TY VNVC" and "Cong ty VNVC." are the same customer here exactly as they
 * are everywhere else.
 */

/**
 * The deal matching a customer and (optionally) a deal name.
 *
 * Returns nothing rather than guessing when a customer has several deals and
 * the name does not pick one out: attaching a quote to an arbitrary deal is
 * worse than leaving it unattached, because the wrong deal then silently drops
 * off the watch-list.
 */
export function resolveOpportunityByName(
  accountName: string | undefined,
  opportunityName: string | undefined,
  opportunities: CrmLiteOpportunity[],
): string | undefined {
  const account = normalizeEntityName(accountName || '');
  if (!account) return undefined;

  const matches = opportunities.filter((item) => normalizeEntityName(item.accountName) === account);
  if (matches.length === 0) return undefined;

  const deal = normalizeEntityName(opportunityName || '');
  if (deal) {
    const exact = matches.find((item) => normalizeEntityName(item.opportunityName) === deal);
    if (exact) return exact.id;
  }

  // One deal with that customer is not a guess. Several is.
  return matches.length === 1 ? matches[0].id : undefined;
}

/** The deal a quote belongs to: its written link first, then its names. */
export function resolveQuoteOpportunityId(
  quote: Pick<QuoteRecord, 'opportunityId' | 'accountName' | 'opportunityName'>,
  opportunities: CrmLiteOpportunity[],
): string | undefined {
  const linked = (quote.opportunityId || '').trim();
  if (linked && opportunities.some((item) => item.id === linked)) return linked;
  return resolveOpportunityByName(quote.accountName, quote.opportunityName, opportunities);
}

/**
 * Every deal that has a live quote against it.
 *
 * "Live" is Sent, Revised or Accepted - a draft is not evidence the customer
 * has been given a number, and a rejected quote is a reason to worry about the
 * deal, not to stop worrying.
 */
export function buildQuotedOpportunityIds(
  quotes: QuoteRecord[],
  opportunities: CrmLiteOpportunity[],
): Set<string> {
  const quoted = new Set<string>();
  quotes.forEach((quote) => {
    if (quote.status !== 'Sent' && quote.status !== 'Revised' && quote.status !== 'Accepted') return;
    const id = resolveQuoteOpportunityId(quote, opportunities);
    if (id) quoted.add(id);
  });
  return quoted;
}
