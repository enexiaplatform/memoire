import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';
import type { QuoteRecord } from '../services/quoteStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { classifyBusinessDomain } from './businessDomain.ts';
import { convertMoney, formatCompactBaseAmount } from './money.ts';
import {
  compareSafeBusinessDate,
  isValidBusinessDate,
  sanitizeBusinessDate,
  timestampToLocalDateKey,
  todayDateKey,
} from './safeDate.ts';

/**
 * How this person sells - the part of it the records know and they do not.
 *
 * Everything else in the product reads a period ("this week against last week")
 * or a single closed deal ("why did this one go"). Neither can answer the
 * question a seller actually cannot answer about themselves: what is my normal?
 * How long does a deal of mine really take, how many touches separate the ones I
 * win from the ones I lose, which size of deal am I quietly bad at, which day of
 * my week never contains a customer.
 *
 * Three rules, because a profile that is wrong once is never trusted again:
 *
 *   1. Nothing is claimed below a minimum sample. A trait either has enough
 *      records behind it or it is not emitted at all - it is returned in `gaps`
 *      instead, saying what is still missing. Two closed deals is an anecdote.
 *   2. Every trait carries its own sample count and confidence, and the reading
 *      names the number. "9 deals" is checkable; "you tend to" is not.
 *   3. This reads and reports. It changes no threshold, no stage, no priority.
 *      Adapting the product's own alarms to a learned rhythm is a separate
 *      decision, and `unusuallyQuiet` below is deliberately the observation form
 *      of it: it says an account is off its normal pace, and leaves the daily
 *      alarm on the fixed threshold everyone can see.
 */

export type ProfileConfidence = 'emerging' | 'reliable';

export type ProfileTraitId =
  | 'cycle'
  | 'dealSize'
  | 'winRate'
  | 'touchPattern'
  | 'sizeBand'
  | 'weekShape'
  | 'returnGap';

export type ProfileTrait = {
  id: ProfileTraitId;
  label: string;
  /** The reading, one sentence, with its own numbers in it. */
  reading: string;
  /** Only where the reading implies a different action. Not every trait does. */
  soWhat?: string;
  /** How many records produced it. */
  sample: number;
  confidence: ProfileConfidence;
};

export type ProfileGap = {
  id: ProfileTraitId;
  label: string;
  have: number;
  need: number;
  /** What recording it would let Memoire say. */
  unlocks: string;
};

/** An account off its own pace - not off a threshold shared with every account. */
export type QuietAgainstOwnRhythm = {
  account: string;
  /** Typical days between touches on this account. */
  normalGapDays: number;
  daysSinceTouch: number;
  /** daysSinceTouch / normalGapDays. */
  ratio: number;
  touches: number;
};

/**
 * The numbers other engines are allowed to do arithmetic with. Kept apart from
 * the traits because a sentence is for reading and a rate is for multiplying,
 * and a null here has to stay a null rather than become a zero downstream.
 */
export type OperatorEconomics = {
  /** Won over everything that closed, including no-decision and delayed. */
  winRate: number | null;
  wonCount: number;
  closedCount: number;
  medianDealValueBase: number | null;
  medianCycleDays: number | null;
  /** Of deals that got a quote and then closed, the share that closed Won. */
  quoteToWinRate: number | null;
  quotedClosedCount: number;
};

export type OperatorProfile = {
  economics: OperatorEconomics;
  traits: ProfileTrait[];
  gaps: ProfileGap[];
  unusuallyQuiet: QuietAgainstOwnRhythm[];
  headline: string;
};

const DAY_MS = 86_400_000;

/**
 * Minimum samples. Chosen to be embarrassing to argue with rather than
 * statistically clever: three closed deals is the point at which "twice" stops
 * being a coincidence, and twelve is where a win rate stops swinging ten points
 * on a single deal.
 */
export const profileMinimums = {
  cycleEmerging: 3,
  cycleReliable: 8,
  dealSizeEmerging: 3,
  dealSizeReliable: 8,
  winRateEmerging: 5,
  winRateReliable: 12,
  /** Per side. Comparing three wins against one loss is not a comparison. */
  touchPatternPerSide: 3,
  /** Per band, on top of a median that needs deals either side of it. */
  sizeBandPerBand: 3,
  weekShapeActivities: 20,
  weekShapeWeeks: 3,
  returnGapPairs: 5,
  /** Touches on one account before it has a rhythm of its own. */
  cadenceTouches: 4,
  quotedClosed: 5,
} as const;

export function buildOperatorProfile(input: {
  opportunities: CrmLiteOpportunity[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  activities: SalesActivityRecord[];
  quotes: QuoteRecord[];
  today?: string;
}): OperatorProfile {
  const today = sanitizeBusinessDate(input.today) || todayDateKey();
  const outcomes = dedupeOutcomes(input.opportunityOutcomes || []);
  const opportunityById = new Map((input.opportunities || []).map((item) => [item.id, item]));
  const activitiesByOpportunity = groupActivitiesByOpportunity(input.activities || []);

  const closed = outcomes.filter((outcome) => isValidBusinessDate(outcome.outcomeDate));
  const won = closed.filter((outcome) => outcome.outcome === 'Won');

  const cycleDays = closed
    .filter((outcome) => outcome.outcome === 'Won')
    .map((outcome) => cycleDaysFor(outcome, opportunityById.get(outcome.opportunityId), activitiesByOpportunity))
    .filter((days): days is number => days !== null);

  const wonValues = won
    .map((outcome) => dealValueBase(outcome, opportunityById.get(outcome.opportunityId)))
    .filter((value): value is number => value !== null);

  const medianCycleDays = median(cycleDays);
  const medianDealValueBase = median(wonValues);
  const winRate = closed.length > 0 ? won.length / closed.length : null;
  const quoteToWin = buildQuoteToWinRate(closed, input.quotes || []);

  const traits: ProfileTrait[] = [];
  const gaps: ProfileGap[] = [];

  push(traits, gaps, buildCycleTrait(cycleDays, medianCycleDays));
  push(traits, gaps, buildDealSizeTrait(wonValues, medianDealValueBase));
  push(traits, gaps, buildWinRateTrait(closed.length, won.length, winRate));
  push(traits, gaps, buildTouchPatternTrait(closed, activitiesByOpportunity));
  push(traits, gaps, buildSizeBandTrait(closed, opportunityById));
  push(traits, gaps, buildWeekShapeTrait(input.activities || []));
  push(traits, gaps, buildReturnGapTrait(input.activities || []));

  return {
    economics: {
      winRate: closed.length >= profileMinimums.winRateEmerging ? winRate : null,
      wonCount: won.length,
      closedCount: closed.length,
      medianDealValueBase: wonValues.length >= profileMinimums.dealSizeEmerging ? medianDealValueBase : null,
      medianCycleDays: cycleDays.length >= profileMinimums.cycleEmerging ? medianCycleDays : null,
      quoteToWinRate: quoteToWin.rate,
      quotedClosedCount: quoteToWin.sample,
    },
    traits,
    gaps,
    unusuallyQuiet: buildUnusuallyQuiet(input.activities || [], today),
    headline: buildHeadline(traits, gaps),
  };
}

type TraitResult = { trait: ProfileTrait } | { gap: ProfileGap } | null;

function push(traits: ProfileTrait[], gaps: ProfileGap[], result: TraitResult) {
  if (!result) return;
  if ('trait' in result) traits.push(result.trait);
  else gaps.push(result.gap);
}

function buildCycleTrait(cycleDays: number[], medianDays: number | null): TraitResult {
  if (cycleDays.length < profileMinimums.cycleEmerging || medianDays === null) {
    return {
      gap: {
        id: 'cycle',
        label: 'Sales cycle',
        have: cycleDays.length,
        need: profileMinimums.cycleEmerging,
        unlocks: 'how long your deals really take, and whether a deal opened today can still close this quarter',
      },
    };
  }

  const days = Math.round(medianDays);
  const fastest = Math.round(Math.min(...cycleDays));
  const slowest = Math.round(Math.max(...cycleDays));
  return {
    trait: {
      id: 'cycle',
      label: 'Sales cycle',
      reading: `Your won deals take a median of ${days} days from first touch to close (fastest ${fastest}, slowest ${slowest}, across ${cycleDays.length} wins).`,
      soWhat: `A deal opened less than ${days} days before a quarter ends is, on your own history, next quarter's revenue.`,
      sample: cycleDays.length,
      confidence: confidenceFor(cycleDays.length, profileMinimums.cycleReliable),
    },
  };
}

function buildDealSizeTrait(values: number[], medianValue: number | null): TraitResult {
  if (values.length < profileMinimums.dealSizeEmerging || medianValue === null) {
    return {
      gap: {
        id: 'dealSize',
        label: 'Typical deal size',
        have: values.length,
        need: profileMinimums.dealSizeEmerging,
        unlocks: 'what one deal of yours is normally worth, which is what turns a revenue gap into a number of deals',
      },
    };
  }

  return {
    trait: {
      id: 'dealSize',
      label: 'Typical deal size',
      reading: `Your median won deal is ${formatMoney(medianValue)} (${values.length} wins with a recorded amount).`,
      sample: values.length,
      confidence: confidenceFor(values.length, profileMinimums.dealSizeReliable),
    },
  };
}

function buildWinRateTrait(closed: number, won: number, winRate: number | null): TraitResult {
  if (closed < profileMinimums.winRateEmerging || winRate === null) {
    return {
      gap: {
        id: 'winRate',
        label: 'Win rate',
        have: closed,
        need: profileMinimums.winRateEmerging,
        unlocks: 'how much pipeline you need to carry for every deal you actually want to win',
      },
    };
  }

  // The denominator is every deal that ended, not won-versus-lost. A deal that
  // died of no decision consumed the same months as one that was lost on price,
  // and a rate that hides those makes the pipeline arithmetic below optimistic
  // in exactly the way that misses a quarter.
  return {
    trait: {
      id: 'winRate',
      label: 'Win rate',
      reading: `You win ${Math.round(winRate * 100)}% of the deals that end - ${won} of ${closed}, counting no-decision and delayed as not won.`,
      soWhat: winRate > 0
        ? `Revenue you want to close needs about ${(1 / winRate).toFixed(1)}x its value sitting in pipeline first.`
        : undefined,
      sample: closed,
      confidence: confidenceFor(closed, profileMinimums.winRateReliable),
    },
  };
}

/**
 * The one a seller cannot see about themselves: whether the deals they win are
 * simply the ones they worked harder. Counted only on opportunities that have
 * captured touches, because a deal with nothing recorded means "not recorded",
 * not "not touched", and averaging those in would invent a finding.
 */
function buildTouchPatternTrait(
  closed: OpportunityOutcomeRecord[],
  activitiesByOpportunity: Map<string, SalesActivityRecord[]>,
): TraitResult {
  const wonTouches: number[] = [];
  const lostTouches: number[] = [];

  closed.forEach((outcome) => {
    const touches = (activitiesByOpportunity.get(outcome.opportunityId) || [])
      .filter((activity) => compareSafeBusinessDate(activity.activityDate, outcome.outcomeDate) <= 0)
      .length;
    if (touches === 0) return;
    if (outcome.outcome === 'Won') wonTouches.push(touches);
    else lostTouches.push(touches);
  });

  const need = profileMinimums.touchPatternPerSide;
  if (wonTouches.length < need || lostTouches.length < need) {
    return {
      gap: {
        id: 'touchPattern',
        label: 'Touches behind a win',
        have: Math.min(wonTouches.length, lostTouches.length),
        need,
        unlocks: 'whether the deals you win are the ones you actually worked more, and what "worked enough" looks like as a number',
      },
    };
  }

  const wonMedian = median(wonTouches) as number;
  const lostMedian = median(lostTouches) as number;
  const sample = wonTouches.length + lostTouches.length;

  if (wonMedian <= lostMedian) {
    return {
      trait: {
        id: 'touchPattern',
        label: 'Touches behind a win',
        reading: `Effort is not what separates your outcomes: won deals carry a median of ${wonMedian} captured touches, lost ones ${lostMedian}.`,
        soWhat: 'More contact is not your lever. What you bring to the contact is - check the evidence patterns below.',
        sample,
        confidence: confidenceFor(sample, profileMinimums.touchPatternPerSide * 4),
      },
    };
  }

  return {
    trait: {
      id: 'touchPattern',
      label: 'Touches behind a win',
      reading: `Deals you win carry a median of ${wonMedian} captured touches; the ones you lose carry ${lostMedian}.`,
      soWhat: `An active deal still under ${lostMedian + 1} touches has not yet had the attention your wins got.`,
      sample,
      confidence: confidenceFor(sample, profileMinimums.touchPatternPerSide * 4),
    },
  };
}

/**
 * Win rate split at the median of every deal that closed. A seller usually
 * knows their overall rate and almost never knows it is carried entirely by
 * small deals.
 *
 * The split deliberately comes from all closed deals rather than from the won
 * ones: a seller whose wins are all small has a won-median at the bottom of
 * their range, which would leave the "small" band empty and hide precisely the
 * pattern this is looking for.
 */
function buildSizeBandTrait(
  closed: OpportunityOutcomeRecord[],
  opportunityById: Map<string, CrmLiteOpportunity>,
): TraitResult {
  const valued = closed
    .map((outcome) => ({
      outcome,
      value: dealValueBase(outcome, opportunityById.get(outcome.opportunityId)),
    }))
    .filter((row): row is { outcome: OpportunityOutcomeRecord; value: number } => row.value !== null && row.value > 0);

  const split = median(valued.map((row) => row.value));
  const small = valued.filter((row) => split !== null && row.value < split);
  const large = valued.filter((row) => split !== null && row.value >= split);

  const need = profileMinimums.sizeBandPerBand;
  if (split === null || small.length < need || large.length < need) {
    return {
      gap: {
        id: 'sizeBand',
        label: 'Win rate by deal size',
        have: Math.min(small.length, large.length),
        need,
        unlocks: 'whether your win rate holds at the top of your range or is carried by the small deals',
      },
    };
  }

  const smallRate = small.filter((row) => row.outcome.outcome === 'Won').length / small.length;
  const largeRate = large.filter((row) => row.outcome.outcome === 'Won').length / large.length;
  const spread = Math.abs(smallRate - largeRate);
  const sample = valued.length;

  // Below twenty points the two bands are the same story told twice, and
  // dressing that up as a finding is how a profile earns a reputation for
  // pattern-matching noise.
  if (spread < 0.2) {
    return {
      trait: {
        id: 'sizeBand',
        label: 'Win rate by deal size',
        reading: `Deal size does not change your odds: ${Math.round(smallRate * 100)}% on deals under ${formatMoney(split)}, ${Math.round(largeRate * 100)}% above it (${sample} closed).`,
        sample,
        confidence: confidenceFor(sample, need * 4),
      },
    };
  }

  const weakIsLarge = largeRate < smallRate;
  return {
    trait: {
      id: 'sizeBand',
      label: 'Win rate by deal size',
      reading: weakIsLarge
        ? `You win ${Math.round(smallRate * 100)}% of deals under ${formatMoney(split)} but only ${Math.round(largeRate * 100)}% above it (${sample} closed).`
        : `You win ${Math.round(largeRate * 100)}% of deals over ${formatMoney(split)} but only ${Math.round(smallRate * 100)}% below it (${sample} closed).`,
      soWhat: weakIsLarge
        ? 'Your big deals are the ones failing, and they are the ones the number depends on. Look at what the small wins had that they do not.'
        : 'Your small deals cost the same weeks and win less often. Qualifying them out earlier buys time for the ones that close.',
      sample,
      confidence: confidenceFor(sample, need * 4),
    },
  };
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The shape of the week: which day never contains a customer. Read from the
 * same domain classifier the effort mix uses, so the two can never disagree.
 */
function buildWeekShapeTrait(activities: SalesActivityRecord[]): TraitResult {
  const dated = activities.filter((activity) => isValidBusinessDate(activity.activityDate));
  const weeks = new Set(dated.map((activity) => weekKey(activity.activityDate))).size;

  if (dated.length < profileMinimums.weekShapeActivities || weeks < profileMinimums.weekShapeWeeks) {
    return {
      gap: {
        id: 'weekShape',
        label: 'Shape of your week',
        have: dated.length,
        need: profileMinimums.weekShapeActivities,
        unlocks: 'which day of your week never reaches a customer',
      },
    };
  }

  const byWeekday = new Map<number, { total: number; customer: number }>();
  dated.forEach((activity) => {
    const day = weekdayOf(activity.activityDate);
    const bucket = byWeekday.get(day) || { total: 0, customer: 0 };
    bucket.total += 1;
    if (classifyBusinessDomain(activity) === 'Sales') bucket.customer += 1;
    byWeekday.set(day, bucket);
  });

  const overallCustomer = dated.filter((activity) => classifyBusinessDomain(activity) === 'Sales').length / dated.length;

  // A weekday needs a few days of its own behind it before its share means
  // anything - one Friday with two admin notes is not a pattern about Fridays.
  const candidates = [...byWeekday.entries()]
    .filter(([, bucket]) => bucket.total >= 3)
    .map(([day, bucket]) => ({ day, share: bucket.customer / bucket.total, total: bucket.total }))
    .sort((left, right) => left.share - right.share);

  const weakest = candidates[0];
  if (!weakest || overallCustomer - weakest.share < 0.2) {
    return {
      trait: {
        id: 'weekShape',
        label: 'Shape of your week',
        reading: `Your week is even: customer-facing work is ${Math.round(overallCustomer * 100)}% of what you record, with no day noticeably below that.`,
        sample: dated.length,
        confidence: confidenceFor(dated.length, profileMinimums.weekShapeActivities * 3),
      },
    };
  }

  return {
    trait: {
      id: 'weekShape',
      label: 'Shape of your week',
      reading: `${WEEKDAY_NAMES[weakest.day]} is your least commercial day: ${Math.round(weakest.share * 100)}% of what you record on it faces a customer, against ${Math.round(overallCustomer * 100)}% across the week (${weakest.total} ${WEEKDAY_NAMES[weakest.day]}s recorded).`,
      soWhat: `If that is deliberate, it is a good use of a ${WEEKDAY_NAMES[weakest.day]}. If it is not, it is one fifth of your selling time.`,
      sample: dated.length,
      confidence: confidenceFor(dated.length, profileMinimums.weekShapeActivities * 3),
    },
  };
}

/** How long you take to come back to a customer after a commercial touch. */
function buildReturnGapTrait(activities: SalesActivityRecord[]): TraitResult {
  const gaps: number[] = [];
  groupActivitiesByAccount(activities).forEach((records) => {
    for (let index = 0; index < records.length - 1; index += 1) {
      const current = records[index];
      const next = records[index + 1];
      if (classifyBusinessDomain(current) !== 'Sales') continue;
      const gap = daysBetween(current.activityDate, next.activityDate);
      if (gap > 0) gaps.push(gap);
    }
  });

  if (gaps.length < profileMinimums.returnGapPairs) {
    return {
      gap: {
        id: 'returnGap',
        label: 'How fast you come back',
        have: gaps.length,
        need: profileMinimums.returnGapPairs,
        unlocks: 'how long a customer normally waits between hearing from you',
      },
    };
  }

  const gapMedian = Math.round(median(gaps) as number);
  const slow = gaps.filter((gap) => gap > gapMedian * 3).length;
  return {
    trait: {
      id: 'returnGap',
      label: 'How fast you come back',
      reading: `After a customer conversation you come back a median of ${gapMedian} day${gapMedian === 1 ? '' : 's'} later (${gaps.length} gaps recorded).`,
      soWhat: slow > 0
        ? `${slow} of those gaps ran more than three times that long. Those are the conversations that go quiet.`
        : undefined,
      sample: gaps.length,
      confidence: confidenceFor(gaps.length, profileMinimums.returnGapPairs * 4),
    },
  };
}

/**
 * Accounts that have gone quiet **against their own rhythm**, which is not the
 * same question as the fixed silence threshold on Today. A customer you speak to
 * twice a week is already unusual at day eight; one you speak to quarterly is
 * not unusual at day thirty. Reported as an observation only - the alarms keep
 * running on the published threshold, so nothing the user is shown daily changes
 * shape because of a number they cannot see.
 */
function buildUnusuallyQuiet(activities: SalesActivityRecord[], today: string): QuietAgainstOwnRhythm[] {
  const results: QuietAgainstOwnRhythm[] = [];

  groupActivitiesByAccount(activities).forEach((records, account) => {
    if (records.length < profileMinimums.cadenceTouches) return;

    const gaps: number[] = [];
    for (let index = 0; index < records.length - 1; index += 1) {
      const gap = daysBetween(records[index].activityDate, records[index + 1].activityDate);
      if (gap > 0) gaps.push(gap);
    }
    const normalGap = median(gaps);
    if (normalGap === null || normalGap <= 0) return;

    const lastTouch = records[records.length - 1].activityDate;
    const daysSince = daysBetween(lastTouch, today);
    const ratio = daysSince / normalGap;

    // Both tests have to pass. The ratio alone would shout about an account
    // whose normal gap is a day; the absolute floor alone would be the fixed
    // threshold this is meant to be an alternative to.
    if (daysSince < 7 || ratio < 2) return;

    results.push({
      account: records[0].linkedAccountName || records[0].accountName || account,
      normalGapDays: Math.round(normalGap),
      daysSinceTouch: daysSince,
      ratio,
      touches: records.length,
    });
  });

  return results.sort((left, right) => right.ratio - left.ratio).slice(0, 5);
}

function buildQuoteToWinRate(closed: OpportunityOutcomeRecord[], quotes: QuoteRecord[]) {
  const quotedOpportunities = new Set(
    quotes.map((quote) => (quote.opportunityId || '').trim()).filter(Boolean),
  );
  const quotedClosed = closed.filter((outcome) => quotedOpportunities.has(outcome.opportunityId));
  if (quotedClosed.length < profileMinimums.quotedClosed) {
    return { rate: null, sample: quotedClosed.length };
  }
  const won = quotedClosed.filter((outcome) => outcome.outcome === 'Won').length;
  return { rate: won / quotedClosed.length, sample: quotedClosed.length };
}

function buildHeadline(traits: ProfileTrait[], gaps: ProfileGap[]) {
  if (traits.length === 0) {
    return 'Not enough closed history yet to describe how you sell. Record the outcome of your next few deals and this fills in on its own.';
  }
  const reliable = traits.filter((trait) => trait.confidence === 'reliable').length;
  const pending = gaps.length > 0 ? ` ${gaps.length} more reading${gaps.length === 1 ? '' : 's'} unlock as you record.` : '';
  return `${traits.length} reading${traits.length === 1 ? '' : 's'} from your own records, ${reliable} of them on a sample large enough to argue with.${pending}`;
}

/**
 * First touch to close, in days.
 *
 * The start is the earliest of the opportunity's creation and its first captured
 * activity, never creation alone: an imported deal carries the import date, so a
 * relationship that ran for six months before the CSV landed would otherwise
 * report a three-day sales cycle and make every cycle-based number below wrong
 * in the flattering direction.
 */
function cycleDaysFor(
  outcome: OpportunityOutcomeRecord,
  opportunity: CrmLiteOpportunity | undefined,
  activitiesByOpportunity: Map<string, SalesActivityRecord[]>,
): number | null {
  const candidates = [
    timestampToLocalDateKey(opportunity?.createdAt),
    ...(activitiesByOpportunity.get(outcome.opportunityId) || []).map((activity) => sanitizeBusinessDate(activity.activityDate)),
  ].filter(isValidBusinessDate);

  if (candidates.length === 0) return null;
  const start = candidates.sort(compareSafeBusinessDate)[0];
  const days = daysBetween(start, outcome.outcomeDate);
  return days >= 0 ? days : null;
}

function dealValueBase(outcome: OpportunityOutcomeRecord, opportunity: CrmLiteOpportunity | undefined) {
  const fromOutcome = convertMoney(outcome.finalAmount, outcome.currency);
  if (fromOutcome !== null && fromOutcome > 0) return fromOutcome;
  const fromOpportunity = convertMoney(opportunity?.estimatedValue, opportunity?.currency);
  return fromOpportunity !== null && fromOpportunity > 0 ? fromOpportunity : null;
}

/**
 * One outcome per opportunity, newest kept. A deal re-closed after a correction
 * would otherwise count twice in every rate on this page.
 */
function dedupeOutcomes(outcomes: OpportunityOutcomeRecord[]) {
  const byOpportunity = new Map<string, OpportunityOutcomeRecord>();
  outcomes.forEach((outcome) => {
    const key = outcome.opportunityId || outcome.id;
    const existing = byOpportunity.get(key);
    if (!existing || compareSafeBusinessDate(outcome.outcomeDate, existing.outcomeDate) > 0) {
      byOpportunity.set(key, outcome);
    }
  });
  return [...byOpportunity.values()];
}

function groupActivitiesByOpportunity(activities: SalesActivityRecord[]) {
  const grouped = new Map<string, SalesActivityRecord[]>();
  activities.forEach((activity) => {
    const key = (activity.linkedOpportunityId || '').trim();
    if (!key || !isValidBusinessDate(activity.activityDate)) return;
    grouped.set(key, [...(grouped.get(key) || []), activity]);
  });
  grouped.forEach((records) => records.sort((left, right) => compareSafeBusinessDate(left.activityDate, right.activityDate)));
  return grouped;
}

function groupActivitiesByAccount(activities: SalesActivityRecord[]) {
  const grouped = new Map<string, SalesActivityRecord[]>();
  activities.forEach((activity) => {
    const name = (activity.linkedAccountName || activity.accountName || '').trim();
    if (!name || !isValidBusinessDate(activity.activityDate)) return;
    const key = name.toLowerCase();
    grouped.set(key, [...(grouped.get(key) || []), activity]);
  });
  grouped.forEach((records) => records.sort((left, right) => compareSafeBusinessDate(left.activityDate, right.activityDate)));
  return grouped;
}

function confidenceFor(sample: number, reliableAt: number): ProfileConfidence {
  return sample >= reliableAt ? 'reliable' : 'emerging';
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Always currency-labelled. An amount inside a sentence with no code on it is
 * the exact shape of the bug that once printed a VND figure next to "SGD", and
 * a reading a seller has to guess the currency of is a reading they will not
 * act on. The compact form is safe outside the browser: the reporting currency
 * falls back to the base when there is no localStorage to read it from.
 */
function formatMoney(value: number) {
  return formatCompactBaseAmount(value);
}

function weekdayOf(dateKey: string) {
  return new Date(`${sanitizeBusinessDate(dateKey)}T00:00:00Z`).getUTCDay();
}

function weekKey(dateKey: string) {
  const date = new Date(`${sanitizeBusinessDate(dateKey)}T00:00:00Z`);
  const day = date.getUTCDay();
  // Monday-anchored, matching the plan board's week.
  const monday = new Date(date.getTime() - ((day + 6) % 7) * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

function daysBetween(fromDateKey: string, toDateKey: string) {
  const from = Date.parse(`${sanitizeBusinessDate(fromDateKey)}T00:00:00Z`);
  const to = Date.parse(`${sanitizeBusinessDate(toDateKey)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / DAY_MS);
}
