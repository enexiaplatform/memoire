import type { PlanDay, PlanRecord } from './weeklyPlan.ts';
import { splitBracketTag } from './weeklyPlan.ts';
import { accountKey } from './accountIdentity.ts';

/**
 * A week drafted somewhere else, pasted in whole.
 *
 * Somebody who plans their week at the weekend arrives with twenty-odd lines
 * already written - in a note, a spreadsheet, last week's plan. Retyping them
 * one Add box at a time is precisely the duplicate work this product exists to
 * remove, and it is the one place the plan board still demanded it.
 *
 * The parser is deliberately forgiving about shape and strict about meaning: it
 * reads the day headings and bullet characters people actually type, but it
 * never guesses a day for a line that has none, and it never silently drops a
 * line. Anything it could not place is handed back so the operator sees it.
 */

export type ParsedPlanLine = {
  /** The day heading this line sat under, as written. */
  dayLabel: string;
  date: string;
  tag: string;
  label: string;
  /** Already on the board for that day - offered, but not created again. */
  duplicate: boolean;
};

export type ParsedPlanPaste = {
  lines: ParsedPlanLine[];
  /** Lines that appeared before any day heading, so no day could be honest. */
  unassigned: string[];
  /** Day headings in the text that are not days of the period being viewed. */
  unknownDays: string[];
  newCount: number;
  duplicateCount: number;
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT_DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Reads pasted text against the days actually on screen, so "Monday" means the
 * Monday of the week being viewed rather than some other Monday.
 */
export function parsePlanPaste(input: {
  text: string;
  days: PlanDay[];
  existing: PlanRecord[];
}): ParsedPlanPaste {
  const dayByName = new Map<string, PlanDay>();
  input.days.forEach((day) => {
    dayByName.set(day.weekdayLabel.toLowerCase(), day);
    dayByName.set(day.weekdayLabel.toLowerCase().slice(0, 3), day);
    // "Jul 27" as written in the column header, for pastes that carry dates.
    dayByName.set(day.dayLabel.toLowerCase(), day);
  });

  // The account is part of what makes a line unique. "[Achison] Meeting" and
  // "[KN] Meeting" on the same Thursday are two customers, not one line typed
  // twice - keying on the day and the words alone would have quietly dropped
  // one of them.
  const taken = new Set(
    input.existing
      .filter((record) => record.__deleted !== true)
      .map((record) => signatureFor(record.date, record.tag, record.label)),
  );

  const lines: ParsedPlanLine[] = [];
  const unassigned: string[] = [];
  const unknownDays: string[] = [];
  let currentDay: PlanDay | null = null;

  input.text.split(/\r?\n/).forEach((rawLine) => {
    const line = stripBullet(rawLine);
    if (!line) return;

    const heading = matchDayHeading(line, dayByName);
    if (heading.isHeading) {
      currentDay = heading.day;
      if (!heading.day) unknownDays.push(line);
      return;
    }

    if (!currentDay) {
      // No day yet: guessing one would put real work on a day nobody chose.
      unassigned.push(line);
      return;
    }

    const { tag, label } = splitBracketTag(line);
    if (!label) return;

    const signature = signatureFor(currentDay.date, tag, label);
    lines.push({
      dayLabel: currentDay.weekdayLabel,
      date: currentDay.date,
      tag,
      label,
      duplicate: taken.has(signature),
    });
    taken.add(signature);
  });

  return {
    lines,
    unassigned,
    unknownDays,
    newCount: lines.filter((line) => !line.duplicate).length,
    duplicateCount: lines.filter((line) => line.duplicate).length,
  };
}

/**
 * A heading is a line that is only a day name, optionally with a date or
 * punctuation after it - "Monday", "Mon:", "Monday Jul 27". A line that merely
 * mentions a day ("Call Mai on Monday") is work, not a heading.
 */
function matchDayHeading(line: string, dayByName: Map<string, PlanDay>): { isHeading: boolean; day: PlanDay | null } {
  const cleaned = line.replace(/[:.\-–—]+\s*$/, '').trim();
  const lower = cleaned.toLowerCase();

  const direct = dayByName.get(lower);
  if (direct) return { isHeading: true, day: direct };

  // "Monday Jul 27" / "Mon 27 Jul": starts with a day word, and everything after
  // it is date-ish rather than a sentence.
  const [firstWord, ...rest] = lower.split(/\s+/);
  const isDayWord = DAY_NAMES.includes(firstWord) || SHORT_DAY_NAMES.includes(firstWord);
  if (isDayWord && rest.every((part) => /^[0-9]{1,4}(st|nd|rd|th)?$/.test(part) || /^[a-z]{3,9}$/.test(part) && isMonthWord(part))) {
    return { isHeading: true, day: dayByName.get(firstWord) || null };
  }

  // A day word alone that is not in this period at all (e.g. "Saturday" on a
  // board hiding weekends) still reads as a heading, so its items do not get
  // silently attached to the previous day.
  if (isDayWord && rest.length === 0) return { isHeading: true, day: null };

  return { isHeading: false, day: null };
}

function isMonthWord(value: string) {
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october',
    'november', 'december'].includes(value);
}

/** Bullets and numbering people paste in from notes and docs. */
function stripBullet(rawLine: string) {
  return rawLine
    .replace(/^\s*[-*•·–—]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/^\s*\[[ xX]\]\s*/, '')
    .trim();
}

/** A line is the same line when the day, the account, and the words all match. */
function signatureFor(date: string, tag: string, label: string) {
  return `${date}|${accountKey(tag || '')}|${accountKey(label)}`;
}
