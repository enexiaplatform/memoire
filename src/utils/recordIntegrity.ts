import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { QuoteRecord } from '../services/quoteStore';
import { accountKey, normalizeEntityName } from './accountIdentity.ts';
import { resolveAccountName, type AccountAliasIndex } from './accountAliases.ts';

/**
 * Whether a record can stand on its own: is it complete, and does everything it
 * points at still exist?
 *
 * Two questions that look like housekeeping and are not. Both are borrowed from
 * a distributor's tracking workbook, which computes them per row and puts the
 * answer *on the row itself* rather than in a report somewhere else - the whole
 * value is that the record tells you it is broken while you are looking at it.
 *
 * **Named fields, never a percentage.** The workbook's completeness column is a
 * comma-joined list of the mandatory fields that are empty, and its "ready"
 * column is a plain YES or NO. Not a progress bar, not "60% complete". A
 * percentage tells an operator how they are doing; a list of names tells them
 * what to type. Memoire's own hygiene surfaces already report degrees, so this
 * deliberately reports items.
 *
 * **A link that points at nothing says so.** The workbook runs a COUNTIF back
 * against the real list of leads and prints BROKEN in the cell. Memoire has the
 * same weakness in a sharper form: a deal names its customer as *text*, and
 * `account_id` exists in the database but has never been written. So a deal can
 * name a customer nobody has a record for, an activity can point at a deleted
 * deal, and until now nothing anywhere said so.
 *
 * Nothing here writes. Every answer is derived on read from the records the
 * workspace already holds, so it can never disagree with them and there is no
 * second copy to go stale.
 */

/** A link that was supposed to resolve to a record. */
export type LinkIntegrity =
  /** Resolves to a record that exists. */
  | 'ok'
  /** Nothing was linked. Not a fault - most records legitimately link to nothing. */
  | 'none'
  /** Something was linked and the thing it named is gone. */
  | 'broken';

export type RecordIntegrity = {
  /** Mandatory fields that are empty, by the name shown on the form. */
  missingFields: string[];
  /** True when nothing mandatory is missing and no link is broken. */
  complete: boolean;
  links: { label: string; status: LinkIntegrity; detail: string }[];
  /** Every broken link, flattened, for a surface that only wants the bad news. */
  brokenLinks: string[];
};

/**
 * The fields a deal cannot do without.
 *
 * Deliberately short. A mandatory list long enough to be thorough is a list
 * every record fails, and a warning every record carries is one nobody reads.
 * These five are the ones without which the deal cannot appear correctly on any
 * other surface: no customer and it reaches no account, no value or currency
 * and it reaches no forecast, no stage and it reaches no pipeline, no close
 * period and it reaches no quarter.
 */
const OPPORTUNITY_REQUIRED: { label: string; read: (deal: CrmLiteOpportunity) => boolean }[] = [
  { label: 'Customer', read: (deal) => Boolean(deal.accountName.trim()) },
  { label: 'Deal name', read: (deal) => Boolean(deal.opportunityName.trim()) },
  { label: 'Value', read: (deal) => typeof deal.estimatedValue === 'number' && deal.estimatedValue > 0 },
  { label: 'Currency', read: (deal) => Boolean((deal.currency || '').trim()) },
  { label: 'Close period', read: (deal) => Boolean(deal.expectedClosePeriod.trim()) },
];

export function checkOpportunityIntegrity(input: {
  opportunity: CrmLiteOpportunity;
  /**
   * Every customer the workspace knows, by name. A list of names rather than of
   * account records because that is all this check needs, and every surface
   * that wants to run it already holds one.
   */
  accountNames: string[];
  aliases?: AccountAliasIndex;
}): RecordIntegrity {
  const { opportunity } = input;
  const missingFields = OPPORTUNITY_REQUIRED
    .filter((field) => !field.read(opportunity))
    .map((field) => field.label);

  const links: RecordIntegrity['links'] = [];

  const named = opportunity.accountName.trim();
  if (!named) {
    links.push({ label: 'Customer', status: 'none', detail: 'No customer named.' });
  } else {
    /*
     * Resolved through the alias index first, so a customer that was merged
     * under another spelling is found rather than reported missing. Without
     * this the feature would fire hardest on exactly the workspaces that have
     * done the most tidying up, which is the wrong way round.
     */
    const canonical = input.aliases ? resolveAccountName(named, input.aliases) : named;
    const known = input.accountNames.some((accountName) => (
      accountKey(accountName) === accountKey(canonical)
      || normalizeEntityName(accountName) === normalizeEntityName(canonical)
    ));
    links.push(known
      ? { label: 'Customer', status: 'ok', detail: canonical }
      : {
        label: 'Customer',
        status: 'broken',
        // Says what to do, because "broken" on its own is a complaint. The fix
        // is nearly always one click - the account simply was never created.
        detail: `No account record named "${named}". Create it, or merge it into the account it belongs to.`,
      });
  }

  const brokenLinks = links.filter((link) => link.status === 'broken').map((link) => link.detail);
  return {
    missingFields,
    complete: missingFields.length === 0 && brokenLinks.length === 0,
    links,
    brokenLinks,
  };
}

/**
 * The fields a touch cannot do without.
 *
 * A date and something that says what happened. Not the customer: a touch with
 * no customer resolved is the most valuable row in the ledger, not a broken one
 * - it is a company being worked that has no account, no deal and no money
 * attached, which is the leak this product exists to close.
 */
const ACTIVITY_REQUIRED: { label: string; read: (activity: SalesActivityRecord) => boolean }[] = [
  { label: 'Date', read: (activity) => Boolean((activity.activityDate || '').trim()) },
  { label: 'What happened', read: (activity) => Boolean((activity.summary || activity.rawNote || '').trim()) },
];

export function checkActivityIntegrity(input: {
  activity: SalesActivityRecord;
  opportunities: CrmLiteOpportunity[];
}): RecordIntegrity {
  const { activity } = input;
  const missingFields = ACTIVITY_REQUIRED
    .filter((field) => !field.read(activity))
    .map((field) => field.label);

  const links: RecordIntegrity['links'] = [];
  const linkedId = (activity.linkedOpportunityId || '').trim();
  if (!linkedId) {
    links.push({ label: 'Deal', status: 'none', detail: 'Not linked to a deal.' });
  } else {
    const deal = input.opportunities.find((opportunity) => opportunity.id === linkedId);
    links.push(deal
      ? { label: 'Deal', status: 'ok', detail: deal.opportunityName || deal.accountName }
      : {
        label: 'Deal',
        status: 'broken',
        detail: `Linked to a deal that no longer exists${
          activity.linkedOpportunityName ? ` ("${activity.linkedOpportunityName}")` : ''
        }.`,
      });
  }

  const brokenLinks = links.filter((link) => link.status === 'broken').map((link) => link.detail);
  return {
    missingFields,
    complete: missingFields.length === 0 && brokenLinks.length === 0,
    links,
    brokenLinks,
  };
}

/**
 * A quote's own integrity: the money it names, and the deal it belongs to.
 *
 * Payment term is mandatory here and nowhere else, because two money engines
 * read it and disagree when it is absent - one treats a quote with no term as
 * never late, the other as always late, and the same five orders then read
 * "0 overdue" on one page and a large figure on another.
 */
const QUOTE_REQUIRED: { label: string; read: (quote: QuoteRecord) => boolean }[] = [
  { label: 'Customer', read: (quote) => Boolean((quote.accountName || '').trim()) },
  { label: 'Amount', read: (quote) => typeof quote.amount === 'number' && quote.amount > 0 },
  { label: 'Currency', read: (quote) => Boolean((quote.currency || '').trim()) },
  { label: 'Quote date', read: (quote) => Boolean((quote.quoteDate || '').trim()) },
  { label: 'Payment term', read: (quote) => Boolean((quote.paymentTerm || '').trim()) },
];

export function checkQuoteIntegrity(input: {
  quote: QuoteRecord;
  opportunities: CrmLiteOpportunity[];
}): RecordIntegrity {
  const { quote } = input;
  const missingFields = QUOTE_REQUIRED
    .filter((field) => !field.read(quote))
    .map((field) => field.label);

  const links: RecordIntegrity['links'] = [];
  const linkedId = (quote.opportunityId || '').trim();
  if (!linkedId) {
    links.push({ label: 'Deal', status: 'none', detail: 'Not linked to a deal.' });
  } else {
    const deal = input.opportunities.find((opportunity) => opportunity.id === linkedId);
    links.push(deal
      ? { label: 'Deal', status: 'ok', detail: deal.opportunityName || deal.accountName }
      : { label: 'Deal', status: 'broken', detail: 'Linked to a deal that no longer exists.' });
  }

  const brokenLinks = links.filter((link) => link.status === 'broken').map((link) => link.detail);
  return {
    missingFields,
    complete: missingFields.length === 0 && brokenLinks.length === 0,
    links,
    brokenLinks,
  };
}

/**
 * One line saying what is wrong with a record, or '' when nothing is.
 *
 * Names the fields rather than counting them: "Missing Value, Close period" is
 * something an operator can act on without opening anything, where "2 fields
 * missing" makes them open the record to find out which.
 */
export function describeIntegrity(integrity: RecordIntegrity): string {
  if (integrity.complete) return '';
  const parts: string[] = [];
  if (integrity.missingFields.length > 0) parts.push(`Missing ${integrity.missingFields.join(', ')}`);
  parts.push(...integrity.brokenLinks);
  return parts.join('. ');
}

export type IntegritySweep = {
  checked: number;
  incomplete: number;
  brokenLinks: number;
  /** The distinct fields that are empty most often, worst first. */
  topMissingFields: { field: string; count: number }[];
};

/**
 * The whole book at once, for a surface that wants to say how much of the data
 * can be relied on.
 *
 * Counts records, not faults: a deal missing three fields is one incomplete
 * deal, because the operator fixes deals rather than fields and a fault count
 * would make a handful of bad rows look like a systemic problem.
 */
export function sweepIntegrity(results: RecordIntegrity[]): IntegritySweep {
  const fieldCounts = new Map<string, number>();
  results.forEach((result) => {
    result.missingFields.forEach((field) => fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1));
  });

  return {
    checked: results.length,
    incomplete: results.filter((result) => !result.complete).length,
    brokenLinks: results.filter((result) => result.brokenLinks.length > 0).length,
    topMissingFields: [...fieldCounts.entries()]
      .map(([field, count]) => ({ field, count }))
      .sort((left, right) => right.count - left.count || left.field.localeCompare(right.field))
      .slice(0, 5),
  };
}
