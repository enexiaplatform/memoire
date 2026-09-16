import type { AccountMemory } from './accountMemory.ts';
import type { StakeholderRecord } from '../services/stakeholderStore.ts';
import type { ObjectionRecord } from '../services/objectionStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import { isLeadRecord } from './leadQueue.ts';
import { convertMoney, formatCompactBaseAmount } from './money.ts';
import { normalizeMeddicRole } from './meddicStakeholderMap.ts';
import { SILENCE_CRITICAL_DAYS, SILENCE_WARNING_DAYS } from './proactiveNudges.ts';
import { daysBetweenBusinessDates, isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * What matters about this customer now.
 *
 * The account drawer already holds everything - memory sections, stakeholders,
 * objections, quotes, history, threads - and a reader had to open five of them
 * to answer the one question they came with. This is the top of the drawer:
 * the relationship's state in a handful of facts and at most three sentences
 * about what needs attention, each derived from a record on this account and
 * each using a threshold some other surface already owns.
 *
 * It separates leads from qualified deals, because "2 active opportunities" on
 * a customer where both are unqualified conversations is the pipeline-inflation
 * the Leads destination exists to stop.
 */

export type AccountGlance = {
  lastTouchDate: string;
  daysSinceTouch: number | null;
  openLeads: CrmLiteOpportunity[];
  openDeals: CrmLiteOpportunity[];
  /** Open qualified pipeline on this customer, in the reporting currency. */
  openDealsBase: number;
  people: number;
  champions: string[];
  decisionMakers: string[];
  openObjections: ObjectionRecord[];
  quotesInPlay: QuoteRecord[];
  quotesInPlayBase: number;
  /** At most three. Empty means nothing needs attention, which is said as such. */
  matters: { tone: 'red' | 'amber' | 'neutral'; text: string }[];
};

export function buildAccountGlance(input: {
  memory: AccountMemory;
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  quotes: QuoteRecord[];
  disqualifiedLeadIds?: Set<string>;
  today?: string;
}): AccountGlance {
  const today = isValidBusinessDate(input.today) ? (input.today as string) : todayDateKey();
  const { memory } = input;
  const disqualified = input.disqualifiedLeadIds || new Set<string>();

  const active = memory.opportunities.filter((opportunity) => opportunity.status === 'Active');
  const openLeads = active.filter((opportunity) => isLeadRecord(opportunity, disqualified));
  const openDeals = active.filter((opportunity) => !isLeadRecord(opportunity, disqualified));
  const openDealsBase = openDeals.reduce((sum, deal) => sum + (convertMoney(deal.estimatedValue, deal.currency) ?? 0), 0);

  const lastTouchDate = sanitizeBusinessDate(memory.latestActivityDate);
  const daysSinceTouch = lastTouchDate ? daysBetweenBusinessDates(lastTouchDate, today) : null;

  const named = input.stakeholders.filter((person) => (person.name || '').trim());
  const champions = named.filter((person) => normalizeMeddicRole(person.stakeholderRole) === 'Champion').map((person) => person.name);
  const decisionMakers = named
    .filter((person) => ['Economic Buyer', 'Decision Committee'].includes(normalizeMeddicRole(person.stakeholderRole)))
    .map((person) => person.name);

  const openObjections = input.objections.filter((objection) => objection.status === 'Open');
  const quotesInPlay = input.quotes.filter((quote) => quote.status === 'Sent' || quote.status === 'Revised');
  const quotesInPlayBase = quotesInPlay.reduce((sum, quote) => sum + (convertMoney(quote.amount, quote.currency) ?? 0), 0);

  const matters: AccountGlance['matters'] = [];
  const openWork = openDeals.length + openLeads.length;

  if (openWork > 0 && daysSinceTouch !== null && daysSinceTouch >= SILENCE_WARNING_DAYS) {
    matters.push({
      tone: daysSinceTouch >= SILENCE_CRITICAL_DAYS ? 'red' : 'amber',
      text: `No touch for ${daysSinceTouch} days, with ${openWork} open ${openWork === 1 ? 'deal or lead' : 'deals and leads'}.`,
    });
  } else if (openWork > 0 && !lastTouchDate) {
    matters.push({ tone: 'amber', text: 'Open work on this customer and no conversation captured yet.' });
  }

  const expiring = quotesInPlay.filter((quote) => {
    const until = sanitizeBusinessDate(quote.validUntil);
    const days = until ? daysBetweenBusinessDates(today, until) : null;
    return days !== null && days >= 0 && days <= 7;
  });
  if (expiring.length) {
    matters.push({
      tone: 'amber',
      text: `${expiring.length === 1 ? 'A quote expires' : `${expiring.length} quotes expire`} within a week${quotesInPlayBase > 0 ? ` - ${formatCompactBaseAmount(quotesInPlayBase)} in play` : ''}.`,
    });
  }

  const highObjection = openObjections.find((objection) => objection.impact === 'High');
  if (highObjection) {
    matters.push({ tone: 'red', text: `Open high-impact objection: ${highObjection.objectionText || highObjection.objectionType}.` });
  }

  if (openDeals.length > 0 && champions.length === 0) {
    matters.push({ tone: 'amber', text: `${openDeals.length} qualified ${openDeals.length === 1 ? 'deal' : 'deals'} and nobody named as champion.` });
  }

  if (openLeads.length > 0) {
    const untouched = openLeads.filter((lead) => !(lead.nextAction || lead.nextActionDate));
    if (untouched.length) {
      matters.push({ tone: 'neutral', text: `${untouched.length} open ${untouched.length === 1 ? 'lead has' : 'leads have'} no next step.` });
    }
  }

  return {
    lastTouchDate,
    daysSinceTouch,
    openLeads,
    openDeals,
    openDealsBase,
    people: named.length,
    champions,
    decisionMakers,
    openObjections,
    quotesInPlay,
    quotesInPlayBase,
    matters: matters.slice(0, 3),
  };
}
