import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import type { StakeholderRecord } from '../services/stakeholderStore.ts';
import type { CommercialEvent } from '../domain/commercialKernel/types.ts';
import type { OrderReceivableRecord } from './receivables.ts';
import type { WeeklyCommitmentSnapshot } from './weeklyCommitment.ts';
import { closePeriodMoveDirection } from './closePeriod.ts';
import { normalizeEntityName } from './accountIdentity.ts';
import { convertMoney, formatCompactBaseAmount } from './money.ts';
import { SILENCE_CRITICAL_DAYS } from './proactiveNudges.ts';
import {
  addDaysToBusinessDate,
  compareSafeBusinessDate,
  formatSafeBusinessDate,
  isValidBusinessDate,
  sanitizeBusinessDate,
  timestampToLocalDateKey,
  todayDateKey,
} from './safeDate.ts';
import { isDisqualifiedLeadOutcome, isLeadStage } from './leadQueue.ts';

/**
 * Changes since the last review.
 *
 * ## What this is allowed to say
 *
 * Only what the records prove happened inside the window. Every line carries
 * the ids it was counted from and how it is known, and there are exactly four
 * ways to know:
 *
 *   created   - a record's own creation timestamp falls in the window. A lead
 *               created on Tuesday was created on Tuesday.
 *   event     - an observed transition in the commercial event log, written at
 *               the moment of the edit with the value it moved from.
 *   closeout  - an outcome or payment record, dated by the operator.
 *   threshold - a silence that began in the window, computed from the date of
 *               the last touch and the same threshold the watch-list uses. The
 *               crossing day is arithmetic on a recorded date, not a guess.
 *
 * What it is never allowed to use is `updated_at`. A record's last edit says it
 * changed and not what changed, and every "what changed" feature built on it has
 * reported a typo fix as a stage move. A change that is not provable here is
 * simply not listed - the review says less rather than something false.
 *
 * ## What it is not
 *
 * Not the state of the book. "12 deals have no next step" is a condition, and
 * conditions belong to Today and to the deal. This is the week's movement, and
 * keeping the two apart is what lets a reader trust that every line here is news.
 */

export type ChangeProvenance = 'created' | 'event' | 'closeout' | 'threshold';

export type ChangeLineKind =
  | 'leads-added'
  | 'leads-qualified'
  | 'leads-disqualified'
  | 'deals-added'
  | 'deals-slipped'
  | 'deals-pulled-in'
  | 'deals-revalued-down'
  | 'deals-won'
  | 'deals-lost'
  | 'cash-collected'
  | 'accounts-went-quiet'
  | 'champions-recorded';

export type ChangeLine = {
  kind: ChangeLineKind;
  /** "+", "-" or neutral, for the sign a reader scans for. Never colour alone. */
  sign: 'up' | 'down' | 'neutral';
  /** Whether the movement is good news for the business. */
  tone: 'good' | 'bad' | 'neutral';
  count: number;
  /** The sentence: "3 leads qualified". */
  statement: string;
  /** Up to three names it was counted from, so the sentence is checkable. */
  examples: string[];
  /** The money this line moved, in the reporting currency, when it has any. */
  amountBase: number | null;
  amountLabel: string;
  /** Amounts that could not be converted and were left out of `amountBase`. */
  unpricedCount: number;
  provenance: ChangeProvenance;
  sourceIds: string[];
  href: string;
};

export type ChangesSinceLastReview = {
  /** The day the window opens (inclusive), as a business date. */
  since: string;
  /** Why the window opens there. */
  basis: 'last-review' | 'last-7-days';
  sinceLabel: string;
  lines: ChangeLine[];
  /** True when the event log began after the window opened, so moves may be missing. */
  eventHistoryPartial: boolean;
};

export type ChangesInput = {
  opportunities: CrmLiteOpportunity[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  activities: SalesActivityRecord[];
  stakeholders: StakeholderRecord[];
  events: CommercialEvent[];
  receivables?: OrderReceivableRecord[];
  weeklyReviews?: WeeklyCommitmentSnapshot[];
  today?: string;
  includeSampleRecords?: boolean;
};

const FALLBACK_WINDOW_DAYS = 7;

/**
 * Where "since last review" starts.
 *
 * The last time the operator confirmed a week - the one act in the product that
 * is unambiguously "I reviewed and committed" - provided it was before today.
 * Without one, the last seven days, and the page says so rather than claiming a
 * review that never happened.
 */
export function resolveReviewWindowStart(
  weeklyReviews: WeeklyCommitmentSnapshot[] = [],
  today = todayDateKey(),
  includeSampleRecords = false,
): { since: string; basis: ChangesSinceLastReview['basis']; sinceLabel: string } {
  const confirmed = weeklyReviews
    .filter((review) => !review.__deleted && (includeSampleRecords || review.isSample !== true))
    .map((review) => timestampToLocalDateKey(review.confirmedAt))
    .filter((day) => isValidBusinessDate(day) && compareSafeBusinessDate(day, today) < 0)
    .sort(compareSafeBusinessDate);
  const last = confirmed.at(-1);
  if (last) {
    return { since: last, basis: 'last-review', sinceLabel: `since your review on ${formatSafeBusinessDate(last)}` };
  }
  const since = addDaysToBusinessDate(today, -FALLBACK_WINDOW_DAYS);
  return { since, basis: 'last-7-days', sinceLabel: 'in the last 7 days' };
}

export function buildChangesSinceLastReview(input: ChangesInput): ChangesSinceLastReview {
  const today = isValidBusinessDate(input.today) ? (input.today as string) : todayDateKey();
  const includeSample = input.includeSampleRecords === true;
  const real = <T extends { isSample?: boolean }>(record: T) => includeSample || record.isSample !== true;
  const window = resolveReviewWindowStart(input.weeklyReviews, today, includeSample);
  const inWindow = (day: string) => isValidBusinessDate(day)
    && compareSafeBusinessDate(day, window.since) >= 0
    && compareSafeBusinessDate(day, today) <= 0;

  const opportunities = input.opportunities.filter(real);
  const byId = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const events = input.events.filter(real).filter((event) => inWindow(timestampToLocalDateKey(event.occurredAt)));
  const outcomes = input.opportunityOutcomes.filter(real);
  const lines: ChangeLine[] = [];

  const push = (line: Omit<ChangeLine, 'examples' | 'amountLabel'> & { names: string[] }) => {
    if (line.count === 0) return;
    const { names, ...rest } = line;
    lines.push({
      ...rest,
      examples: [...new Set(names.filter(Boolean))].slice(0, 3),
      amountLabel: line.amountBase !== null && line.amountBase > 0 ? formatCompactBaseAmount(line.amountBase) : '',
    });
  };

  const sumBase = (records: CrmLiteOpportunity[]) => {
    let total = 0;
    let unpriced = 0;
    let priced = 0;
    for (const record of records) {
      if (!record.estimatedValue) continue;
      const converted = convertMoney(record.estimatedValue, record.currency);
      if (converted === null) unpriced += 1;
      else { total += converted; priced += 1; }
    }
    return { amountBase: priced > 0 ? total : null, unpricedCount: unpriced };
  };

  // ---- leads
  const stageEvents = events.filter((event) => event.eventType === 'opportunity_stage_changed');
  const fromLead = stageEvents.filter((event) => isLeadStage(String(event.structuredPayload?.from || '')));
  const qualifiedIds = uniqueIds(fromLead
    .filter((event) => {
      const to = String(event.structuredPayload?.to || '');
      return to && !isLeadStage(to) && to !== 'Lost' && to !== 'Won';
    })
    .map((event) => event.opportunityId));
  // Anything that ever left the Lead stage started as a lead, even if it was
  // qualified the same day it was created.
  const everLead = new Set(uniqueIds(input.events.filter(real)
    .filter((event) => event.eventType === 'opportunity_stage_changed' && isLeadStage(String(event.structuredPayload?.from || '')))
    .map((event) => event.opportunityId)));
  const disqualifiedOutcomes = outcomes.filter(isDisqualifiedLeadOutcome);
  const disqualifiedAll = new Set(disqualifiedOutcomes.map((outcome) => outcome.opportunityId));
  disqualifiedAll.forEach((id) => everLead.add(id));

  const createdInWindow = opportunities.filter((opportunity) => inWindow(timestampToLocalDateKey(opportunity.createdAt)));
  const leadsAdded = createdInWindow.filter((opportunity) => isLeadStage(opportunity.stage) || everLead.has(opportunity.id));
  push({
    kind: 'leads-added', sign: 'up', tone: 'good', count: leadsAdded.length,
    statement: `${leadsAdded.length} new ${plural(leadsAdded.length, 'lead')}`,
    names: leadsAdded.map((record) => record.accountName),
    amountBase: null, unpricedCount: 0, provenance: 'created',
    sourceIds: leadsAdded.map((record) => record.id), href: '/app/leads',
  });

  const qualified = qualifiedIds.map((id) => byId.get(id)).filter((record): record is CrmLiteOpportunity => Boolean(record));
  push({
    kind: 'leads-qualified', sign: 'up', tone: 'good', count: qualifiedIds.length,
    statement: `${qualifiedIds.length} ${plural(qualifiedIds.length, 'lead')} qualified into the pipeline`,
    names: qualified.map((record) => record.accountName),
    amountBase: null, unpricedCount: 0, provenance: 'event',
    sourceIds: qualifiedIds, href: '/app/opportunities',
  });

  const disqualifiedInWindow = disqualifiedOutcomes.filter((outcome) => inWindow(timestampToLocalDateKey(outcome.createdAt)));
  push({
    kind: 'leads-disqualified', sign: 'down', tone: 'neutral', count: disqualifiedInWindow.length,
    statement: `${disqualifiedInWindow.length} ${plural(disqualifiedInWindow.length, 'lead')} disqualified`,
    names: disqualifiedInWindow.map((outcome) => `${outcome.accountName}${outcome.reasonText ? ` (${outcome.reasonText.split(' - ')[0]})` : ''}`),
    amountBase: null, unpricedCount: 0, provenance: 'closeout',
    sourceIds: disqualifiedInWindow.map((outcome) => outcome.id), href: '/app/leads?state=closed',
  });

  // ---- deals
  const dealsAdded = createdInWindow.filter((opportunity) => !isLeadStage(opportunity.stage) && !everLead.has(opportunity.id));
  push({
    kind: 'deals-added', sign: 'up', tone: 'good', count: dealsAdded.length,
    statement: `${dealsAdded.length} new ${plural(dealsAdded.length, 'opportunity', 'opportunities')} opened directly`,
    names: dealsAdded.map((record) => record.accountName),
    ...sumBase(dealsAdded), provenance: 'created',
    sourceIds: dealsAdded.map((record) => record.id), href: '/app/opportunities',
  });

  const closeMoves = events.filter((event) => event.eventType === 'opportunity_close_period_changed');
  const slippedIds = uniqueIds(closeMoves
    .filter((event) => closePeriodMoveDirection(String(event.structuredPayload?.from || ''), String(event.structuredPayload?.to || ''), event.occurredAt) === 'weakened')
    .map((event) => event.opportunityId));
  const pulledIds = uniqueIds(closeMoves
    .filter((event) => closePeriodMoveDirection(String(event.structuredPayload?.from || ''), String(event.structuredPayload?.to || ''), event.occurredAt) === 'improved')
    .map((event) => event.opportunityId))
    .filter((id) => !slippedIds.includes(id));
  const slipped = slippedIds.map((id) => byId.get(id)).filter((record): record is CrmLiteOpportunity => Boolean(record));
  const slippedMoney = sumBase(slipped);
  push({
    kind: 'deals-slipped', sign: 'down', tone: 'bad', count: slippedIds.length,
    statement: `${slippedIds.length} ${plural(slippedIds.length, 'opportunity', 'opportunities')} slipped to a later close${slippedMoney.amountBase ? `, ${formatCompactBaseAmount(slippedMoney.amountBase)} of pipeline moved out` : ''}`,
    names: slipped.map((record) => record.accountName),
    ...slippedMoney, provenance: 'event',
    sourceIds: slippedIds, href: '/app/opportunities',
  });
  const pulled = pulledIds.map((id) => byId.get(id)).filter((record): record is CrmLiteOpportunity => Boolean(record));
  push({
    kind: 'deals-pulled-in', sign: 'up', tone: 'good', count: pulledIds.length,
    statement: `${pulledIds.length} ${plural(pulledIds.length, 'opportunity', 'opportunities')} pulled in to an earlier close`,
    names: pulled.map((record) => record.accountName),
    ...sumBase(pulled), provenance: 'event',
    sourceIds: pulledIds, href: '/app/opportunities',
  });

  const valueDown = events.filter((event) => {
    if (event.eventType !== 'opportunity_value_changed') return false;
    const from = Number(event.structuredPayload?.from);
    const to = Number(event.structuredPayload?.to);
    return Number.isFinite(from) && Number.isFinite(to) && to < from;
  });
  const valueDownIds = uniqueIds(valueDown.map((event) => event.opportunityId));
  let valueLostBase = 0;
  let valueUnpriced = 0;
  for (const event of valueDown) {
    const drop = Number(event.structuredPayload?.from) - Number(event.structuredPayload?.to);
    const currency = String(event.structuredPayload?.currency || byId.get(event.opportunityId || '')?.currency || '');
    const converted = convertMoney(drop, currency);
    if (converted === null) valueUnpriced += 1;
    else valueLostBase += converted;
  }
  push({
    kind: 'deals-revalued-down', sign: 'down', tone: 'bad', count: valueDownIds.length,
    statement: `${valueDownIds.length} ${plural(valueDownIds.length, 'opportunity', 'opportunities')} revalued down${valueLostBase > 0 ? ` by ${formatCompactBaseAmount(valueLostBase)}` : ''}`,
    names: valueDownIds.map((id) => byId.get(id || '')?.accountName || ''),
    amountBase: valueLostBase > 0 ? valueLostBase : null, unpricedCount: valueUnpriced, provenance: 'event',
    sourceIds: valueDownIds, href: '/app/opportunities',
  });

  const closedInWindow = outcomes
    .filter((outcome) => !isDisqualifiedLeadOutcome(outcome))
    .filter((outcome) => inWindow(sanitizeBusinessDate(outcome.outcomeDate)));
  for (const kind of ['Won', 'Lost'] as const) {
    const group = closedInWindow.filter((outcome) => outcome.outcome === kind);
    let base = 0;
    let unpriced = 0;
    for (const outcome of group) {
      if (!outcome.finalAmount) continue;
      const converted = convertMoney(outcome.finalAmount, outcome.currency);
      if (converted === null) unpriced += 1;
      else base += converted;
    }
    push({
      kind: kind === 'Won' ? 'deals-won' : 'deals-lost',
      sign: kind === 'Won' ? 'up' : 'down',
      tone: kind === 'Won' ? 'good' : 'bad',
      count: group.length,
      statement: `${group.length} ${plural(group.length, 'deal')} ${kind.toLowerCase()}${base > 0 ? ` (${formatCompactBaseAmount(base)})` : ''}`,
      names: group.map((outcome) => outcome.accountName),
      amountBase: base > 0 ? base : null, unpricedCount: unpriced, provenance: 'closeout',
      sourceIds: group.map((outcome) => outcome.id), href: '/app/reviews?view=analytics',
    });
  }

  // ---- cash
  const receipts = (input.receivables || [])
    .filter((record) => !record.__deleted && real(record))
    .flatMap((record) => record.receipts.map((receipt) => ({ record, receipt })))
    .filter(({ receipt }) => inWindow(sanitizeBusinessDate(receipt.receivedOn)));
  let cashBase = 0;
  let cashUnpriced = 0;
  for (const { receipt } of receipts) {
    const converted = convertMoney(receipt.amount, receipt.currency);
    if (converted === null) cashUnpriced += 1;
    else cashBase += converted;
  }
  push({
    kind: 'cash-collected', sign: 'up', tone: 'good', count: receipts.length,
    statement: cashBase > 0
      ? `${formatCompactBaseAmount(cashBase)} cash collected across ${receipts.length} ${plural(receipts.length, 'payment')}`
      : `${receipts.length} ${plural(receipts.length, 'payment')} received`,
    names: receipts.map(({ record }) => byId.get(record.opportunityId)?.accountName || ''),
    amountBase: cashBase > 0 ? cashBase : null, unpricedCount: cashUnpriced, provenance: 'closeout',
    sourceIds: receipts.map(({ receipt }) => receipt.id), href: '/app/revenue?view=collections',
  });

  // ---- silence that began in the window
  const openAccounts = new Map<string, string>();
  for (const opportunity of opportunities) {
    if (opportunity.status !== 'Active') continue;
    const key = normalizeEntityName(opportunity.accountName || '');
    if (key && !openAccounts.has(key)) openAccounts.set(key, opportunity.accountName);
  }
  const lastTouchByAccount = new Map<string, string>();
  for (const activity of input.activities.filter(real)) {
    const key = normalizeEntityName(activity.linkedAccountName || activity.accountName || '');
    const day = sanitizeBusinessDate(activity.activityDate);
    if (!key || !day || compareSafeBusinessDate(day, today) > 0) continue;
    const current = lastTouchByAccount.get(key);
    if (!current || compareSafeBusinessDate(day, current) > 0) lastTouchByAccount.set(key, day);
  }
  const wentQuiet = [...openAccounts.entries()].filter(([key]) => {
    const last = lastTouchByAccount.get(key);
    if (!last) return false;
    // The day the silence threshold was crossed. In the window, it began this
    // period; before it, the account was already quiet at the last review and
    // is not news.
    return inWindow(addDaysToBusinessDate(last, SILENCE_CRITICAL_DAYS));
  });
  push({
    kind: 'accounts-went-quiet', sign: 'down', tone: 'bad', count: wentQuiet.length,
    statement: `${wentQuiet.length} ${plural(wentQuiet.length, 'account')} with open work went quiet (${SILENCE_CRITICAL_DAYS} days without a touch)`,
    names: wentQuiet.map(([, name]) => name),
    amountBase: null, unpricedCount: 0, provenance: 'threshold',
    sourceIds: wentQuiet.map(([key]) => key), href: '/app/accounts',
  });

  const champions = input.stakeholders
    .filter(real)
    .filter((stakeholder) => stakeholder.stakeholderRole === 'Champion')
    .filter((stakeholder) => inWindow(timestampToLocalDateKey(stakeholder.createdAt)));
  push({
    kind: 'champions-recorded', sign: 'up', tone: 'good', count: champions.length,
    statement: `${champions.length} new ${plural(champions.length, 'champion')} recorded`,
    names: champions.map((stakeholder) => `${stakeholder.name}${stakeholder.accountName ? `, ${stakeholder.accountName}` : ''}`),
    amountBase: null, unpricedCount: 0, provenance: 'created',
    sourceIds: champions.map((stakeholder) => stakeholder.id), href: '/app/stakeholders',
  });

  const earliestEvent = input.events.filter(real)
    .map((event) => timestampToLocalDateKey(event.occurredAt))
    .filter(isValidBusinessDate)
    .sort(compareSafeBusinessDate)[0];

  return {
    since: window.since,
    basis: window.basis,
    sinceLabel: window.sinceLabel,
    lines,
    eventHistoryPartial: !earliestEvent || compareSafeBusinessDate(earliestEvent, window.since) > 0,
  };
}

function uniqueIds(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function plural(count: number, one: string, many = `${one}s`) {
  return count === 1 ? one : many;
}
