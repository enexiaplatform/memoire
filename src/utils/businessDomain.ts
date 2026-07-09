import type { SalesActivityType } from './salesActivityClassifier.ts';

export const businessDomains = ['Sales', 'Money', 'Delivery', 'Marketing', 'Product', 'Learning', 'Internal'] as const;

export type BusinessDomain = (typeof businessDomains)[number];

const typeToDomain: Record<SalesActivityType, BusinessDomain> = {
  'Customer meeting': 'Sales',
  'Follow-up': 'Sales',
  'Demo / technical discussion': 'Sales',
  'Objection handling': 'Sales',
  Partnership: 'Sales',
  'Quote / proposal': 'Money',
  'Tender / procurement': 'Money',
  'Payment / invoice': 'Money',
  'Delivery / fulfillment': 'Delivery',
  'Marketing / content': 'Marketing',
  'Product / build': 'Product',
  'Learning / research': 'Learning',
  'Internal coordination': 'Internal',
  'Admin / CRM': 'Internal',
  Other: 'Internal',
};

const keywordOverrides: { domain: BusinessDomain; pattern: RegExp }[] = [
  { domain: 'Money', pattern: /\b(payment|invoice|paid|deposit|purchase order|remittance)\b/i },
  { domain: 'Delivery', pattern: /\b(delivery|delivered|shipment|shipped|installation|installed|go-live)\b/i },
  { domain: 'Marketing', pattern: /\b(published|linkedin|newsletter|campaign|webinar)\b/i },
  { domain: 'Product', pattern: /\b(shipped feature|prototype|release|deployed|saas)\b/i },
  { domain: 'Learning', pattern: /\b(research|experiment result|customer discovery|market learning)\b/i },
];

/**
 * Derived, never stored (pivot Hard Rule 3: derive, don't migrate). The
 * activity type decides the domain; keyword overrides catch legacy records
 * captured before the whole-business taxonomy existed. Deterministic so the
 * same record always lands in the same ledger lane.
 */
export function classifyBusinessDomain(activity: {
  activityType: SalesActivityType;
  tags?: string[];
  rawNote?: string;
  summary?: string;
}): BusinessDomain {
  const typeDomain = typeToDomain[activity.activityType] ?? 'Internal';
  // Only generic buckets are eligible for keyword rescue - a specific type
  // ('Payment / invoice') already carries intent and must not be overridden.
  if (typeDomain !== 'Internal' && typeDomain !== 'Sales') return typeDomain;

  const text = `${(activity.tags || []).join(' ')} ${activity.summary || ''} ${activity.rawNote || ''}`;
  const override = keywordOverrides.find(({ pattern }) => pattern.test(text));
  if (override) return override.domain;
  return typeDomain;
}

export function businessDomainTone(domain: BusinessDomain) {
  return {
    Sales: 'bg-blue-50 text-brand-blue border-blue-100',
    Money: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    Delivery: 'bg-violet-50 text-violet-700 border-violet-100',
    Marketing: 'bg-pink-50 text-pink-700 border-pink-100',
    Product: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    Learning: 'bg-amber-50 text-amber-800 border-amber-100',
    Internal: 'bg-gray-100 text-gray-600 border-gray-200',
  }[domain];
}
