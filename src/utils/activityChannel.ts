/**
 * How a piece of work happened - and whether it happened at all.
 *
 * Memoire already types every touch by *what it was about*: `activityType` on
 * the capture ("Quote / proposal", "Objection handling", "Payment / invoice").
 * That is the subject. It has never carried the other half, which is the half a
 * field seller is actually measured on: *where they were*. "Customer meeting"
 * is the same word whether you drove three hours to a plant in Nam Dinh or
 * joined a twenty-minute call between two other calls, and no figure in the app
 * could tell those apart.
 *
 * The two dimensions are orthogonal on purpose and must stay that way. A demo
 * can be on-site or online. A negotiation can happen on the phone or across a
 * table. Folding them into one list is how a vocabulary ends up with
 * "Online demo", "On-site demo", "Online negotiation" and no way to count
 * demos.
 *
 *   activityType     - what the work was about.  Already exists.
 *   activityChannel  - how it happened.          This file.
 *
 * The list is deliberately short and deliberately includes the two entries a
 * CRM vocabulary normally refuses:
 *
 *   `Cold outreach` - because a first unsolicited contact is a different act
 *     from a call to somebody who knows you, and it is the one activity whose
 *     count actually predicts next year's pipeline. Modelling it as "Phone
 *     call" throws that away.
 *
 *   `Out of office` - because a week with two touches is not a bad week if
 *     three of its days were Tet. Every silence detector in this app reads an
 *     empty day as a day the operator did nothing, and says so. A day the
 *     operator was not working is a fact about the calendar, not a performance
 *     signal, and the app needs somewhere to be told.
 *
 * Nothing is migrated. A record written before this field existed has no
 * channel, reads as `''`, and `inferActivityChannel` will offer one from the
 * text without ever writing it - an empty channel means "not stated", which is
 * honest, and is not the same as "Desk work".
 */

export type ActivityChannel =
  | 'On-site visit'
  | 'Hosted visit'
  | 'Online meeting'
  | 'Phone call'
  | 'Cold outreach'
  | 'Email / message'
  | 'Event'
  | 'Desk work'
  | 'Out of office';

export type ActivityChannelSpec = {
  channel: ActivityChannel;
  /** One line, in the operator's words, saying which kind of day this was. */
  hint: string;
  /**
   * True when a customer or prospect was on the other side of it. Drives every
   * "did you actually reach anybody this week" figure; `Desk work` and
   * `Out of office` are the two that are not.
   */
  customerFacing: boolean;
  /**
   * True when the operator was working at all. The only `false` is
   * `Out of office`, and it exists so silence and cadence maths can skip those
   * days rather than counting them against the person who took them.
   */
  working: boolean;
  /** Travel was involved. Separates the expensive touches from the cheap ones. */
  inPerson: boolean;
};

/**
 * Ordered as an operator would scan them: out of the building first, then down
 * the wire, then at the desk, then not working. The order is the order of the
 * dropdown and of every breakdown drawn from it, so it is fixed here once.
 */
export const ACTIVITY_CHANNELS: ActivityChannelSpec[] = [
  {
    channel: 'On-site visit',
    hint: 'You went to them - their plant, lab or office.',
    customerFacing: true,
    working: true,
    inPerson: true,
  },
  {
    channel: 'Hosted visit',
    hint: 'They came to you - your office, demo room or warehouse.',
    customerFacing: true,
    working: true,
    inPerson: true,
  },
  {
    channel: 'Online meeting',
    hint: 'A scheduled call on a screen.',
    customerFacing: true,
    working: true,
    inPerson: false,
  },
  {
    channel: 'Phone call',
    hint: 'Voice only, with somebody who already knows you.',
    customerFacing: true,
    working: true,
    inPerson: false,
  },
  {
    channel: 'Cold outreach',
    hint: 'First contact with somebody not expecting you - call, email or walk-in.',
    customerFacing: true,
    working: true,
    inPerson: false,
  },
  {
    channel: 'Email / message',
    hint: 'Written and asynchronous - mail, chat, messaging apps.',
    customerFacing: true,
    working: true,
    inPerson: false,
  },
  {
    channel: 'Event',
    hint: 'Exhibition, conference, seminar or training you attended or ran.',
    customerFacing: true,
    working: true,
    inPerson: true,
  },
  {
    channel: 'Desk work',
    hint: 'Nobody on the other side - quoting, research, admin, internal work.',
    customerFacing: false,
    working: true,
    inPerson: false,
  },
  {
    channel: 'Out of office',
    hint: 'Public holiday, leave, sick day or a travel day with no customer on it.',
    customerFacing: false,
    working: false,
    inPerson: false,
  },
];

const SPEC_BY_CHANNEL = new Map(ACTIVITY_CHANNELS.map((spec) => [spec.channel, spec]));

/** Every value the field may hold, for validation and for dropdowns. */
export const ACTIVITY_CHANNEL_VALUES = ACTIVITY_CHANNELS.map((spec) => spec.channel);

/**
 * Coerces anything read back from storage into a channel, or into `''`.
 *
 * Returns the empty string rather than a default, because "not stated" is a
 * real state - every record written before this field existed is in it - and
 * defaulting them all to `Desk work` would invent months of desk days that
 * nobody had.
 */
export function normalizeActivityChannel(value: unknown): ActivityChannel | '' {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return SPEC_BY_CHANNEL.has(trimmed as ActivityChannel) ? (trimmed as ActivityChannel) : '';
}

export function activityChannelSpec(channel: ActivityChannel | '' | undefined) {
  return channel ? SPEC_BY_CHANNEL.get(channel) : undefined;
}

/** A customer or prospect was on the other side. An unstated channel is not a claim either way. */
export function isCustomerFacingChannel(channel: ActivityChannel | '' | undefined) {
  return activityChannelSpec(channel)?.customerFacing === true;
}

/** A day the operator was not working. The only channel that suppresses a silence alarm. */
export function isOutOfOfficeChannel(channel: ActivityChannel | '' | undefined) {
  return channel === 'Out of office';
}

/** Travel was involved, so this touch cost a day rather than twenty minutes. */
export function isInPersonChannel(channel: ActivityChannel | '' | undefined) {
  return activityChannelSpec(channel)?.inPerson === true;
}

/**
 * Words that name a channel, in both languages this operator writes in.
 *
 * Diacritic-insensitive for the same reason `planWorkKind` is: the same week
 * gets typed "nghỉ lễ" on a phone and "nghi le" on a laptop, and a rule that
 * only matches one of them is a rule that works half the time.
 *
 * Order matters and is the point of the list, not an accident of it:
 *
 *   - `Out of office` is tested first. "nghỉ lễ, không đi khách" contains the
 *     word for a customer visit; read in the other order it becomes a customer
 *     visit made on a public holiday.
 *   - `Cold outreach` is tested before `Phone call`, because a cold call is
 *     also a phone call and the specific reading is the one worth keeping.
 *   - `On-site visit` is tested before `Online meeting`, because "visit" is
 *     unambiguous while "meeting" is not.
 */
const CHANNEL_PATTERNS: { channel: ActivityChannel; pattern: RegExp }[] = [
  {
    channel: 'Out of office',
    pattern: /(\bpublic holiday\b|\bholiday\b|\bannual leave\b|\bday off\b|\bon leave\b|\bsick leave\b|\bsick day\b|\btet\b|\bvacation\b|\bnghi le\b|\bnghi phep\b|\bnghi om\b|\bnghi tet\b|\bngay nghi\b|\bnghi bu\b)/iu,
  },
  {
    channel: 'Cold outreach',
    pattern: /(\bcold call\b|\bcold calling\b|\bcold outreach\b|\bcold email\b|\bfirst contact\b|\bwalk-?in\b|\bprospecting\b|\bcanvass\w*|\bgoi lanh\b|\bchao hang moi\b|\btiep can moi\b)/iu,
  },
  {
    channel: 'Event',
    pattern: /(\bexhibition\b|\btrade ?show\b|\bconference\b|\bseminar\b|\bwebinar\b|\bbooth\b|\bexpo\b|\bsymposium\b|\bworkshop\b|\bhoi cho\b|\bhoi thao\b|\btrien lam\b)/iu,
  },
  {
    // Ahead of `On-site visit`, whose `\bvisit\b` is the generic catch: every
    // phrase here contains the word "visit" or a synonym of it, so tested the
    // other way round "visited our demo room" reads as a trip to the customer.
    channel: 'Hosted visit',
    pattern: /(\bhosted\b|\bcame to our\b|\bcame to us\b|\bvisited our\b|\bour showroom\b|\bdemo room\b|\bat our office\b|\bkhach den\b|\bkhach toi van phong\b)/iu,
  },
  {
    channel: 'On-site visit',
    pattern: /(\bsite visit\b|\bon-?site\b|\bcustomer visit\b|\bfactory visit\b|\bplant visit\b|\bfield visit\b|\bvisited\b|\bvisit\b|\bwent to\b|\btham khach\b|\bdi khach\b|\bden nha may\b|\bxuong khach\b)/iu,
  },
  {
    channel: 'Online meeting',
    pattern: /(\bteams\b|\bzoom\b|\bgoogle ?meet\b|\bvideo call\b|\bonline meeting\b|\bweb ?meeting\b|\bconference call\b|\bhop online\b|\bhop truc tuyen\b)/iu,
  },
  {
    channel: 'Phone call',
    pattern: /(\bphone call\b|\bcalled\b|\bover the phone\b|\bby phone\b|\bhotline\b|\bgoi dien\b|\bdien thoai\b|\bgoi cho\b)/iu,
  },
  {
    channel: 'Email / message',
    pattern: /(\bemailed\b|\be-?mail\b|\bsent a message\b|\bmessaged\b|\bzalo\b|\bwhatsapp\b|\bwechat\b|\bviber\b|\btexted\b|\bgui mail\b|\bnhan tin\b)/iu,
  },
  {
    channel: 'Desk work',
    pattern: /(\bquotation prepared\b|\bprepare quote\b|\bpaperwork\b|\badmin\b|\bcrm entry\b|\bdata entry\b|\breport\b|\bresearch\b|\binternal\b|\blam bao cao\b|\bnhap lieu\b|\bchuan bi bao gia\b|\bnoi bo\b)/iu,
  },
];

/**
 * The channel a free-typed note is probably describing, or `''` when nothing in
 * it says.
 *
 * Only ever used to pre-fill a control the operator can change. It is never
 * written on their behalf without being shown, because a wrong channel is worse
 * than an empty one: an empty channel reads as "not stated" everywhere, while a
 * wrong `Out of office` silently switches off a customer's silence alarm.
 */
export function inferActivityChannel(text: string): ActivityChannel | '' {
  const normalized = normalizeChannelText(text);
  if (!normalized) return '';
  return CHANNEL_PATTERNS.find(({ pattern }) => pattern.test(normalized))?.channel || '';
}

/**
 * How many days of a period the operator was not available.
 *
 * Counts distinct dates carrying an `Out of office` channel, so a cadence
 * figure can say "8 touches over 17 working days" rather than "8 touches over
 * 20 days" in a month with a three-day holiday in it. Distinct dates, because
 * two entries written on the same holiday are still one day off.
 */
export function countOutOfOfficeDays(
  entries: { activityDate?: string; activityChannel?: ActivityChannel | '' }[],
): number {
  const days = new Set<string>();
  entries.forEach((entry) => {
    if (!isOutOfOfficeChannel(entry.activityChannel)) return;
    const date = (entry.activityDate || '').trim();
    if (date) days.add(date);
  });
  return days.size;
}

/**
 * Counts a period by channel, largest first, dropping the ones with nothing in
 * them. Unstated channels are counted separately rather than being hidden: a
 * breakdown that silently omits half the month is worse than one that says how
 * much of the month it cannot describe.
 */
export function summariseActivityChannels(
  entries: { activityChannel?: ActivityChannel | '' }[],
): { channel: ActivityChannel; count: number }[] {
  const counts = new Map<ActivityChannel, number>();
  entries.forEach((entry) => {
    const channel = normalizeActivityChannel(entry.activityChannel);
    if (!channel) return;
    counts.set(channel, (counts.get(channel) || 0) + 1);
  });
  return ACTIVITY_CHANNELS
    .map((spec) => ({ channel: spec.channel, count: counts.get(spec.channel) || 0 }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count);
}

/**
 * NFD-strip rather than a locale lowercase, matching `planWorkKind.normalize`
 * so the two files cannot disagree about whether "Nghỉ Lễ" and "nghi le" are
 * the same word. The đ/Đ pass is the one NFD does not do for Vietnamese: the
 * bar is part of the letter, not a combining mark, so it survives the strip.
 */
function normalizeChannelText(value: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .trim();
}
