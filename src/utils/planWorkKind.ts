import type { BusinessDomain } from './businessDomain.ts';

/**
 * What a line on the week is actually for.
 *
 * A distributor's week is not all customer work, and the board used to pretend
 * it was. Anything without a deal or an account behind it fell into one
 * undifferentiated pile of "added by you" - so "Cobetter presentation",
 * "Sartorius market research" and "submit the KPI report" were the same kind of
 * thing to the app, which is to say nothing at all.
 *
 * Three tiers, and the middle one is the one that was missing:
 *
 *   customer  - a deal, an account, or a touch with a customer on it.
 *   principal - work that serves a line you carry. Researching a new brand,
 *               building its presentation, working its pricing. It has an
 *               owner; that owner is simply not a customer.
 *   internal  - your own machinery. Reports, admin, data, claims.
 *
 * Internal work then borrows the seven business domains the activity ledger
 * already uses, rather than inventing a second vocabulary. Timeline > History
 * says you spent the week on Learning and Internal; Timeline > Upcoming can now
 * say the same words about the week ahead.
 *
 * Derived on every read from the tags already written. Nothing is migrated, and
 * a week typed by hand months ago classifies itself the moment brands exist.
 */

export type PlanWorkKind = 'customer' | 'principal' | 'internal';

export type PlanWorkClassification = {
  kind: PlanWorkKind;
  /** The line this serves, for principal work. Empty otherwise. */
  brand: string;
  /** Which of the seven domains internal work belongs to. Null for the rest. */
  domain: BusinessDomain | null;
};

export type PlanWorkSplit = {
  customer: number;
  principal: number;
  internal: number;
  total: number;
  /** Internal items grouped by domain, largest first. Empty when there are none. */
  internalByDomain: { domain: BusinessDomain; count: number }[];
};

/**
 * Words that say what a piece of internal work is, in both languages this
 * operator plans in. Order matters: the first match wins, so the more specific
 * patterns are listed first.
 */
const DOMAIN_PATTERNS: { domain: BusinessDomain; pattern: RegExp }[] = [
  { domain: 'Money', pattern: /\b(invoice|payment|paid|deposit|claim|expense|thanh toan|cong no|chi phi|hoa don)\b/i },
  { domain: 'Delivery', pattern: /\b(delivery|deliver|shipment|install|handover|giao hang|lap dat|ban giao)\b/i },
  { domain: 'Marketing', pattern: /\b(presentation|deck|slide|brochure|campaign|webinar|content|marketing|thuyet trinh|gioi thieu)\b/i },
  { domain: 'Learning', pattern: /\b(research|study|market|competitor|training|learn|nghien cuu|tim hieu|khao sat|dao tao)\b/i },
  { domain: 'Product', pattern: /\b(demo setup|prototype|spec|configuration|cau hinh)\b/i },
  { domain: 'Internal', pattern: /\b(report|kpi|data|admin|crm|meeting|internal|bao cao|so lieu|noi bo|hop)\b/i },
];

export function classifyPlanWork(
  item: {
    tag?: string;
    label?: string;
    linkedOpportunityId?: string;
    linkedAccountName?: string;
    linkedBrand?: string;
  },
  context: { brands: string[]; accountNames: string[] },
): PlanWorkClassification {
  // An explicit link always wins over anything read out of the text. The
  // operator said what this was for; guessing over the top of that would be
  // the board disagreeing with its own author.
  if (item.linkedOpportunityId || (item.linkedAccountName || '').trim()) {
    return { kind: 'customer', brand: '', domain: null };
  }
  if ((item.linkedBrand || '').trim()) {
    return { kind: 'principal', brand: (item.linkedBrand || '').trim(), domain: null };
  }

  // Then the bracket tag, which is how a hand-typed week already names its
  // subject. A tag naming a line you carry is principal work; a tag naming a
  // customer is customer work.
  const tag = normalize(item.tag || '');
  if (tag) {
    const brand = context.brands.find((candidate) => normalize(candidate) === tag);
    if (brand) return { kind: 'principal', brand, domain: null };
    if (context.accountNames.some((candidate) => normalize(candidate) === tag)) {
      return { kind: 'customer', brand: '', domain: null };
    }
  }

  return { kind: 'internal', brand: '', domain: readDomain(`${item.tag || ''} ${item.label || ''}`) };
}

/**
 * The domain a piece of internal work belongs to. Falls back to Internal rather
 * than to nothing: "unclassified" would be a fourth bucket nobody asked for,
 * and admin is the honest default for work with no other signal.
 */
export function readDomain(text: string): BusinessDomain {
  const normalized = normalize(text);
  return DOMAIN_PATTERNS.find(({ pattern }) => pattern.test(normalized))?.domain || 'Internal';
}

export function summarisePlanWork(
  classifications: PlanWorkClassification[],
): PlanWorkSplit {
  const counts = new Map<BusinessDomain, number>();
  classifications
    .filter((entry) => entry.kind === 'internal' && entry.domain)
    .forEach((entry) => counts.set(entry.domain!, (counts.get(entry.domain!) || 0) + 1));

  return {
    customer: classifications.filter((entry) => entry.kind === 'customer').length,
    principal: classifications.filter((entry) => entry.kind === 'principal').length,
    internal: classifications.filter((entry) => entry.kind === 'internal').length,
    total: classifications.length,
    internalByDomain: [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain)),
  };
}

export function planWorkKindLabel(kind: PlanWorkKind) {
  return { customer: 'Customer', principal: 'Principal', internal: 'Internal' }[kind];
}

/**
 * Diacritic-insensitive, because this operator plans in a mix of English and
 * Vietnamese and "nghiên cứu" must match the same rule as "nghien cuu".
 */
function normalize(value: string) {
  return (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
