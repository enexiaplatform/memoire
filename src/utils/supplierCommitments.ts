import type { OwnObligation } from './ownObligations.ts';
import { convertMoney } from './money.ts';
import { compareSafeBusinessDate, isValidBusinessDate, sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * The other half of a distributor's week.
 *
 * Memoire watches what you owe customers and what customers owe you. An
 * operator carrying a principal's line has a second relationship running in
 * parallel and just as capable of going silent: you owe the brand a forecast
 * and a purchase order, the brand owes you pricing, samples, documents and a
 * ship date. That second relationship is where deals actually stall - a quote
 * that cannot be sent because the principal has not answered on price is not a
 * customer problem, and chasing the customer will not fix it.
 *
 * Modelled separately from the commercial commitment ledger on purpose. A
 * ledger commitment hangs off a customer thread - it has an account and an
 * opportunity - and "send Sartorius the Q4 forecast" has neither. Forcing it
 * into that shape would have meant inventing a fake customer thread for every
 * principal, which is exactly the kind of lie that makes "who owes what"
 * unanswerable later.
 */

export const supplierCommitmentParties = ['self', 'supplier'] as const;
export type SupplierCommitmentParty = (typeof supplierCommitmentParties)[number];

export const supplierCommitmentKinds = [
  'Forecast',
  'Purchase order',
  'Payment',
  'Pricing',
  'Sample',
  'Delivery',
  'Document',
  'Other',
] as const;
export type SupplierCommitmentKind = (typeof supplierCommitmentKinds)[number];

export const supplierCommitmentStatuses = ['open', 'done', 'cancelled'] as const;
export type SupplierCommitmentStatus = (typeof supplierCommitmentStatuses)[number];

/** What each side typically owes, so the composer defaults to the likely party. */
export const defaultPartyForKind: Record<SupplierCommitmentKind, SupplierCommitmentParty> = {
  Forecast: 'self',
  'Purchase order': 'self',
  Payment: 'self',
  Pricing: 'supplier',
  Sample: 'supplier',
  Delivery: 'supplier',
  Document: 'supplier',
  Other: 'self',
};

export type SupplierCommitmentRecord = {
  id: string;
  /** The principal, matching the `brand` recorded on opportunities. */
  brand: string;
  party: SupplierCommitmentParty;
  kind: SupplierCommitmentKind;
  label: string;
  dueDate: string;
  status: SupplierCommitmentStatus;
  doneAt?: string;
  amount?: number | null;
  currency?: string;
  /** The deal this is blocking, when it is blocking one. */
  linkedOpportunityId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

export type SupplierCommitmentView = SupplierCommitmentRecord & {
  daysUntilDue: number | null;
  overdue: boolean;
  dueSoon: boolean;
};

export type SupplierBrandGroup = {
  brand: string;
  /** Open items you owe the principal. */
  iOwe: SupplierCommitmentView[];
  /** Open items the principal owes you - the ones that block your deals. */
  theyOwe: SupplierCommitmentView[];
  overdueCount: number;
  openCount: number;
};

export type SupplierCommitmentsModel = {
  groups: SupplierBrandGroup[];
  openCount: number;
  overdueCount: number;
  /** Open items the principal owes you, across all brands - the blocking set. */
  waitingOnSuppliers: SupplierCommitmentView[];
};

const DUE_SOON_DAYS = 7;
const DAY_MS = 86_400_000;

export function buildSupplierCommitments(input: {
  records: SupplierCommitmentRecord[];
  today?: string;
}): SupplierCommitmentsModel {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();

  const open = input.records
    .filter((record) => record.__deleted !== true && record.status === 'open')
    .map((record) => toView(record, today))
    .sort(compareViews);

  const byBrand = new Map<string, SupplierCommitmentView[]>();
  open.forEach((view) => {
    const brand = view.brand.trim() || 'Unnamed principal';
    const list = byBrand.get(brand) || [];
    list.push(view);
    byBrand.set(brand, list);
  });

  const groups: SupplierBrandGroup[] = [...byBrand.entries()]
    .map(([brand, views]) => ({
      brand,
      iOwe: views.filter((view) => view.party === 'self'),
      theyOwe: views.filter((view) => view.party === 'supplier'),
      overdueCount: views.filter((view) => view.overdue).length,
      openCount: views.length,
    }))
    // Brands with something overdue first: a principal who has gone quiet on
    // you is the reason a deal is not moving.
    .sort((left, right) => right.overdueCount - left.overdueCount || right.openCount - left.openCount);

  return {
    groups,
    openCount: open.length,
    overdueCount: open.filter((view) => view.overdue).length,
    waitingOnSuppliers: open.filter((view) => view.party === 'supplier'),
  };
}

/**
 * The items you owe a principal, in the shape the plan board and the
 * obligations panel already understand - so a forecast due Friday lands on
 * Friday without a second calendar.
 *
 * Only your own side crosses over. What the principal owes you is work too, but
 * it is chasing, not delivering, and filing it under "obligations you owe"
 * would make that number a lie.
 */
/**
 * Marks an obligation as coming from a principal rather than a quote or an
 * expense. Matched with `includes`, never `startsWith`: the plan board wraps
 * every obligation id in a prefix of its own, so the marker ends up in the
 * middle of the id it is being read from.
 */
export const SUPPLIER_OBLIGATION_MARKER = 'obligation-supplier-';

export function supplierCommitmentsAsOwnObligations(input: {
  records: SupplierCommitmentRecord[];
  today?: string;
}): OwnObligation[] {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();

  return input.records
    .filter((record) => record.__deleted !== true && record.status === 'open' && record.party === 'self')
    .filter((record) => isValidBusinessDate(record.dueDate))
    .map((record) => {
      const view = toView(record, today);
      return {
        id: `${SUPPLIER_OBLIGATION_MARKER}${record.id}`,
        kind: record.kind === 'Payment' ? ('Payment' as const) : ('Delivery' as const),
        label: `${record.kind}: ${record.label}`,
        counterparty: record.brand.trim() || 'Principal',
        amount: record.amount ?? null,
        currency: record.currency || 'VND',
        amountBase: convertMoney(record.amount ?? 0, record.currency || 'VND'),
        dueDate: sanitizeBusinessDate(record.dueDate),
        daysUntilDue: view.daysUntilDue,
        status: view.overdue ? ('Overdue' as const) : view.dueSoon ? ('Due soon' as const) : ('Upcoming' as const),
        href: '/app/revenue',
      };
    });
}

export function createSupplierCommitmentRecord(input: {
  brand: string;
  party: SupplierCommitmentParty;
  kind: SupplierCommitmentKind;
  label: string;
  dueDate: string;
  amount?: number | null;
  currency?: string;
  linkedOpportunityId?: string;
  notes?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
}): SupplierCommitmentRecord {
  const now = new Date().toISOString();
  return {
    id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    brand: input.brand.trim(),
    party: input.party,
    kind: input.kind,
    label: input.label.trim(),
    dueDate: sanitizeBusinessDate(input.dueDate),
    status: 'open',
    amount: input.amount ?? null,
    currency: input.currency || 'VND',
    linkedOpportunityId: input.linkedOpportunityId,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
    source: input.source,
    isSample: input.isSample,
  };
}

function toView(record: SupplierCommitmentRecord, today: string): SupplierCommitmentView {
  const hasDate = isValidBusinessDate(record.dueDate);
  const daysUntilDue = hasDate
    ? Math.floor((toTime(record.dueDate) - toTime(today)) / DAY_MS)
    : null;

  return {
    ...record,
    daysUntilDue,
    overdue: hasDate && compareSafeBusinessDate(record.dueDate, today) < 0,
    dueSoon: daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= DUE_SOON_DAYS,
  };
}

function compareViews(a: SupplierCommitmentView, b: SupplierCommitmentView) {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return 0;
}

function toTime(dateKey: string) {
  return Date.parse(`${dateKey}T00:00:00Z`);
}
