import { sanitizeBusinessDate } from './safeDate.ts';

/**
 * Payment terms, as a schedule rather than a sentence.
 *
 * The workspace has carried `paymentTerm` on every quote since the quote tracker
 * shipped, and it has always been free text: "30% deposit, 70% on delivery",
 * "Net 45", "50/50". That is exactly how a distributor writes it and exactly how
 * they say it on the phone, so it is the right thing to keep asking for. It is
 * also unusable for the one question the founder actually needs answered - how
 * much money is owed to me, and on what date - because a sentence cannot be
 * added up, sorted by due date, or aged.
 *
 * So the sentence stays and this derives a schedule from it. Two consequences,
 * and both are the point:
 *
 *   1. **Nothing to migrate and nothing to re-enter.** Every quote already in
 *      the workspace produces a schedule the moment this ships. An operator who
 *      types terms the way they always have gets receivables for free.
 *   2. **The parse is a proposal, not a verdict.** It reports what it understood
 *      and how confident it is, and an operator can override the schedule per
 *      order. A parser that silently guesses wrong about when money is due would
 *      be worse than no parser at all - it would put a confident number on a
 *      collection call.
 *
 * What this is not: an invoicing engine. There is no tax handling, no credit
 * note, no partial-allocation policy. It answers "what is owed, when" for a
 * trade that lives on deposits and net terms.
 */

/**
 * What starts the clock on an installment.
 *
 * These three exist because they are the three a distributor's terms actually
 * name, and they fall on genuinely different dates: a deposit is due when the
 * order is placed, the balance on delivery, and net terms run from the invoice.
 * Collapsing them into "days from order" is what makes a receivables report
 * disagree with the customer's accounts payable.
 */
export const paymentTriggers = ['order', 'delivery', 'invoice'] as const;
export type PaymentTrigger = (typeof paymentTriggers)[number];

export const paymentTriggerLabels: Record<PaymentTrigger, string> = {
  order: 'From order date',
  delivery: 'From delivery',
  invoice: 'From invoice',
};

export type PaymentInstallment = {
  id: string;
  /** What the operator calls this slice: "Deposit", "On delivery", "Retention". */
  label: string;
  /**
   * Share of the order value, 0-100. Null for an installment stated as a flat
   * amount instead - rare, but retention is sometimes a fixed sum.
   */
  percent: number | null;
  /** A flat amount in the order's own currency, when the terms name one. */
  amount: number | null;
  trigger: PaymentTrigger;
  /** Net days after the trigger. `Net 30` is 30; a deposit on order is 0. */
  offsetDays: number;
};

export type ParsedPaymentTerm = {
  installments: PaymentInstallment[];
  /**
   * How much of this came from the text rather than from the fallback.
   *
   * `stated` - percentages or net days were read directly.
   * `partial` - something was read, and the rest was completed to 100%.
   * `assumed` - nothing usable; a single payment on delivery is the stand-in.
   *
   * Surfaces show this. A due date the product inferred and a due date the
   * customer agreed to are different kinds of fact, and a collection call made
   * on the wrong one costs a relationship.
   */
  confidence: 'stated' | 'partial' | 'assumed';
  /** The text this came from, kept so the operator can see what was read. */
  sourceText: string;
};

const DEFAULT_INSTALLMENT_LABEL = 'Balance';

/**
 * Reads a terms sentence into a schedule.
 *
 * Deliberately conservative. It recognises the shapes that appear in this trade
 * and refuses to be clever about the rest: an unrecognised sentence produces one
 * installment marked `assumed` rather than a confident guess, because the
 * failure mode of a wrong due date is a seller chasing money that was never
 * late, or missing money that was.
 */
export function parsePaymentTerm(text: unknown): ParsedPaymentTerm {
  const sourceText = typeof text === 'string' ? text.trim() : '';
  if (!sourceText) return assumedSchedule('');

  const normalized = sourceText.toLowerCase();
  const percentParts = readPercentParts(normalized);
  const netDays = readNetDays(normalized);

  if (percentParts.length > 0) {
    const total = percentParts.reduce((sum, part) => sum + part.percent, 0);
    const installments = percentParts.map((part, index) => ({
      id: `pt-${index + 1}`,
      label: part.label,
      percent: part.percent,
      amount: null,
      trigger: part.trigger,
      // A net-day count stated once applies to the slice that is not a deposit:
      // "30% deposit, 70% net 45" means the balance is the part with terms on it.
      offsetDays: part.trigger === 'order' ? 0 : (part.offsetDays ?? netDays ?? 0),
    }));

    // Terms that do not add up are the norm, not an error: "30% deposit" states
    // one slice and leaves the rest understood. The remainder is completed here
    // rather than dropped, so the schedule always covers the whole order.
    if (total > 0 && total < 99.5) {
      installments.push({
        id: `pt-${installments.length + 1}`,
        label: DEFAULT_INSTALLMENT_LABEL,
        percent: round2(100 - total),
        amount: null,
        trigger: 'delivery',
        offsetDays: netDays ?? 0,
      });
      return { installments, confidence: 'partial', sourceText };
    }

    // Over 100% is a sentence this parser has misread rather than terms that are
    // wrong. Reporting a confident schedule from it would be the worst outcome.
    if (total > 100.5) return assumedSchedule(sourceText);

    return { installments, confidence: 'stated', sourceText };
  }

  if (netDays !== null) {
    return {
      installments: [{
        id: 'pt-1',
        label: netDays === 0 ? 'On invoice' : `Net ${netDays}`,
        percent: 100,
        amount: null,
        trigger: 'invoice',
        offsetDays: netDays,
      }],
      confidence: 'stated',
      sourceText,
    };
  }

  if (/\b(cod|cash on delivery|on delivery)\b/.test(normalized)) {
    return {
      installments: [{ id: 'pt-1', label: 'On delivery', percent: 100, amount: null, trigger: 'delivery', offsetDays: 0 }],
      confidence: 'stated',
      sourceText,
    };
  }

  // `cia` and `pia` are how an export invoice states cash in advance, and they
  // are as common in cross-border terms as `cod`. Without them the term fell
  // through to the assumed schedule, which says "on delivery" - the opposite of
  // what the customer agreed, on the one term that protects the seller.
  if (/\b(advance|prepaid|prepayment|cia|pia|100% before)\b/.test(normalized)) {
    return {
      installments: [{ id: 'pt-1', label: 'In advance', percent: 100, amount: null, trigger: 'order', offsetDays: 0 }],
      confidence: 'stated',
      sourceText,
    };
  }

  return assumedSchedule(sourceText);
}

function assumedSchedule(sourceText: string): ParsedPaymentTerm {
  return {
    installments: [{
      id: 'pt-1',
      label: 'On delivery',
      percent: 100,
      amount: null,
      trigger: 'delivery',
      offsetDays: 0,
    }],
    confidence: 'assumed',
    sourceText,
  };
}

/**
 * The percentage slices in a terms sentence, each with what it is waiting for.
 *
 * "50/50" is handled separately from "50% x, 50% y" because it is written
 * without percent signs and is one of the two most common terms in this trade.
 */
function readPercentParts(normalized: string) {
  const slashSplit = normalized.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
  if (slashSplit && !normalized.includes('%')) {
    const first = Number(slashSplit[1]);
    const second = Number(slashSplit[2]);
    if (first + second === 100) {
      return [
        { label: 'Deposit', percent: first, trigger: 'order' as PaymentTrigger, offsetDays: 0 },
        { label: 'Balance', percent: second, trigger: 'delivery' as PaymentTrigger, offsetDays: null as number | null },
      ];
    }
  }

  const parts: { label: string; percent: number; trigger: PaymentTrigger; offsetDays: number | null }[] = [];

  // The percentages first, then the text between each one and the next as its
  // clause. Matching `%` and everything after it in one pattern does not work:
  // the tail of one slice runs up to the *digits* of the next percentage and
  // swallows them, so "30% deposit, 70% on delivery" found only "30%" and read
  // the whole sentence as a lone deposit.
  const percentMatches = [...normalized.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)];

  percentMatches.forEach((match, index) => {
    const percent = Number(match[1]);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return;

    const clauseStart = (match.index ?? 0) + match[0].length;
    const clauseEnd = index + 1 < percentMatches.length
      ? (percentMatches[index + 1].index ?? normalized.length)
      : normalized.length;
    const clause = normalized.slice(clauseStart, clauseEnd);

    parts.push({
      label: labelForClause(clause),
      percent,
      trigger: triggerForClause(clause),
      offsetDays: readNetDays(clause),
    });
  });

  return parts;
}

function triggerForClause(clause: string): PaymentTrigger {
  if (/\b(deposit|advance|upon order|on order|with order|po|down\s*payment)\b/.test(clause)) return 'order';
  if (/\b(delivery|delivered|shipment|shipped|installation|acceptance|handover)\b/.test(clause)) return 'delivery';
  if (/\b(invoice|invoiced|net|after invoice)\b/.test(clause)) return 'invoice';
  return 'delivery';
}

/**
 * What to call a slice on screen.
 *
 * Named for what it waits on rather than for its position. A schedule reading
 * "Deposit / Balance" hides the fact that the second half is waiting on a
 * delivery that has not happened, which is exactly the thing somebody chasing
 * it needs to know. `Balance` survives only as the name of the remainder this
 * parser completes itself, where by definition nothing was stated about it.
 */
function labelForClause(clause: string) {
  const trigger = triggerForClause(clause);
  if (/\b(retention|warranty)\b/.test(clause)) return 'Retention';
  if (/\b(installation|acceptance|handover)\b/.test(clause)) return 'On acceptance';
  if (trigger === 'order') return 'Deposit';
  if (trigger === 'invoice') return 'On invoice';
  return 'On delivery';
}

/** `net 45`, `net45`, `45 days`, `within 30 days`. */
function readNetDays(text: string): number | null {
  const net = text.match(/\bnet\s*(\d{1,3})\b/);
  if (net) return clampDays(Number(net[1]));
  const days = text.match(/\b(?:within\s*)?(\d{1,3})\s*days?\b/);
  if (days) return clampDays(Number(days[1]));
  return null;
}

function clampDays(value: number) {
  if (!Number.isFinite(value)) return null;
  return Math.min(365, Math.max(0, Math.round(value)));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * The average number of days this schedule leaves the operator out of pocket,
 * weighted by how much of the order each slice is worth.
 *
 * This single number is what connects terms to price. Money collected on the
 * order date costs nothing to carry; money collected 60 days after delivery is
 * a loan the seller is making to the customer, and a 30% deposit means only 70%
 * of it is being lent. Weighting is therefore not a refinement - an unweighted
 * "60 days" on terms that collect a third up front overstates the financing cost
 * by half, and the suggested price with it.
 *
 * `deliveryLagDays` is how long after the order the goods actually land. It is
 * part of the credit period for every slice that waits for delivery: a customer
 * paying on delivery of something that ships in 45 days has had 45 days of
 * credit, whatever the terms say.
 */
export function weightedCreditDays(
  installments: PaymentInstallment[],
  options: { deliveryLagDays?: number; invoiceLagDays?: number } = {},
): number {
  const deliveryLag = Math.max(0, Math.round(options.deliveryLagDays ?? 0));
  // Invoicing usually follows delivery rather than the order, so it inherits
  // the delivery lag unless the caller knows better.
  const invoiceLag = Math.max(0, Math.round(options.invoiceLagDays ?? deliveryLag));

  const weighted = installments.reduce(
    (totals, installment) => {
      const share = typeof installment.percent === 'number' && Number.isFinite(installment.percent)
        ? installment.percent
        : 0;
      if (share <= 0) return totals;
      return {
        share: totals.share + share,
        days: totals.days + share * daysFromOrder(installment, deliveryLag, invoiceLag),
      };
    },
    { share: 0, days: 0 },
  );

  if (weighted.share <= 0) return 0;
  return round2(weighted.days / weighted.share);
}

/** When one installment falls, counted from the order date. */
export function daysFromOrder(installment: PaymentInstallment, deliveryLagDays = 0, invoiceLagDays = 0): number {
  const offset = Math.max(0, Math.round(installment.offsetDays || 0));
  if (installment.trigger === 'order') return offset;
  if (installment.trigger === 'delivery') return deliveryLagDays + offset;
  return invoiceLagDays + offset;
}

/** The date one installment falls due, given when the order was placed. */
export function installmentDueDate(
  installment: PaymentInstallment,
  orderDate: string,
  options: { deliveryLagDays?: number; invoiceLagDays?: number; deliveryDate?: string; invoiceDate?: string } = {},
): string {
  // A real delivery date beats a lag assumption. Once the goods have actually
  // shipped, the schedule stops being a forecast and the due date is a fact.
  const anchorDate = installment.trigger === 'delivery'
    ? sanitizeBusinessDate(options.deliveryDate) || ''
    : installment.trigger === 'invoice'
      ? sanitizeBusinessDate(options.invoiceDate) || ''
      : '';

  const base = anchorDate || sanitizeBusinessDate(orderDate);
  if (!base) return '';

  const offsetDays = anchorDate
    ? Math.max(0, Math.round(installment.offsetDays || 0))
    : daysFromOrder(
      installment,
      Math.max(0, Math.round(options.deliveryLagDays ?? 0)),
      Math.max(0, Math.round(options.invoiceLagDays ?? options.deliveryLagDays ?? 0)),
    );

  return addDays(base, offsetDays);
}

export function addDays(dateKey: string, days: number): string {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

/** The money one installment is worth against an order of this value. */
export function installmentAmount(installment: PaymentInstallment, orderAmount: number): number {
  if (typeof installment.amount === 'number' && Number.isFinite(installment.amount)) {
    return installment.amount;
  }
  const percent = typeof installment.percent === 'number' && Number.isFinite(installment.percent)
    ? installment.percent
    : 0;
  return round2((orderAmount * percent) / 100);
}

/** A schedule the operator wrote by hand, checked before it is stored. */
export function sanitizeInstallments(value: unknown): PaymentInstallment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    const percent = Number(raw.percent);
    const amount = Number(raw.amount);
    const trigger = paymentTriggers.includes(raw.trigger as PaymentTrigger)
      ? (raw.trigger as PaymentTrigger)
      : 'delivery';
    return [{
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `pt-${index + 1}`,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 60) : DEFAULT_INSTALLMENT_LABEL,
      percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : null,
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      trigger,
      offsetDays: clampDays(Number(raw.offsetDays)) ?? 0,
    }];
  });
}

/** One line of plain English per installment, for a screen or a brief. */
export function describeInstallment(installment: PaymentInstallment): string {
  const share = typeof installment.percent === 'number' ? `${round2(installment.percent)}%` : 'A fixed amount';
  const when = installment.trigger === 'order'
    ? (installment.offsetDays === 0 ? 'on order' : `${installment.offsetDays} days after order`)
    : installment.trigger === 'delivery'
      ? (installment.offsetDays === 0 ? 'on delivery' : `${installment.offsetDays} days after delivery`)
      : (installment.offsetDays === 0 ? 'on invoice' : `net ${installment.offsetDays} from invoice`);
  return `${share} ${when}`;
}
