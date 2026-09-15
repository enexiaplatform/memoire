import type { CapturedFact, CapturedFactKind } from '../domain/commercialKernel/capturedFacts';
import { formatCurrencyAmount } from './money.ts';
import { formatSafeBusinessDate } from './safeDate.ts';

/**
 * The two readings the Capture review draws beside the facts themselves: the
 * note with the words each fact came from marked in place, and one plain
 * statement of what saving the ticked facts will change.
 *
 * Both are read from the facts and nothing else. The parser already keeps each
 * fact's own words in `evidence` - "not a character offset", on purpose - so the
 * marks are found by looking for those words in the note rather than by asking
 * the parser for positions it deliberately does not keep.
 */

export type NoteMarkKind = 'account' | 'person' | 'promise' | 'risk' | 'value' | 'event' | 'finding';

export type NoteSegment = { text: string; kind: NoteMarkKind | null };

export const FACT_MARK_KIND: Record<CapturedFactKind, NoteMarkKind> = {
  objection: 'risk',
  stakeholder: 'person',
  commitment: 'promise',
  opportunity_value: 'value',
  scheduled_event: 'event',
  commercial_evidence: 'finding',
};

export const NOTE_MARK_LABELS: Record<NoteMarkKind, string> = {
  account: 'Customer',
  person: 'Person',
  promise: 'Promise',
  risk: 'Objection',
  value: 'Deal value',
  event: 'Event',
  finding: 'Finding',
};

/**
 * Splits a note into plain and marked runs.
 *
 * Longest words first, so a fact's sentence is marked before the customer name
 * inside it; a later mark that would overlap an earlier one is skipped rather
 * than nested, because a run of text can only wear one tint. Matching folds
 * case, and falls back to collapsing whitespace, which is the one thing that
 * can differ between the note as typed and the sentence the parser quoted.
 */
export function markCaptureNote(note: string, marks: { text: string; kind: NoteMarkKind }[]): NoteSegment[] {
  if (!note) return [];
  const lower = note.toLowerCase();
  const ranges: { start: number; end: number; kind: NoteMarkKind }[] = [];
  const overlaps = (start: number, end: number) => ranges.some((range) => start < range.end && end > range.start);

  [...marks]
    .map((mark) => ({ ...mark, text: mark.text.trim() }))
    .filter((mark) => mark.text.length >= 2)
    .sort((left, right) => right.text.length - left.text.length)
    .forEach((mark) => {
      const found = findFree(lower, mark.text.toLowerCase(), overlaps);
      if (found) ranges.push({ ...found, kind: mark.kind });
    });

  ranges.sort((left, right) => left.start - right.start);
  const segments: NoteSegment[] = [];
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start > cursor) segments.push({ text: note.slice(cursor, range.start), kind: null });
    segments.push({ text: note.slice(range.start, range.end), kind: range.kind });
    cursor = range.end;
  });
  if (cursor < note.length) segments.push({ text: note.slice(cursor), kind: null });
  return segments;
}

function findFree(
  haystack: string,
  needle: string,
  overlaps: (start: number, end: number) => boolean,
): { start: number; end: number } | null {
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    if (!overlaps(index, index + needle.length)) return { start: index, end: index + needle.length };
    index = haystack.indexOf(needle, index + 1);
  }
  // Whitespace-tolerant second try: the quoted words with any run of spaces or
  // line breaks between them.
  const pattern = needle.split(/\s+/).filter(Boolean).map(escapeRegExp).join('\\s+');
  if (!pattern) return null;
  const expression = new RegExp(pattern, 'giu');
  let match: RegExpExecArray | null;
  while ((match = expression.exec(haystack)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!overlaps(start, end)) return { start, end };
    if (match[0].length === 0) expression.lastIndex += 1;
  }
  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * What saving the ticked facts does, in at most four sentences.
 *
 * Every sentence names the record a kind of fact writes - the commitment ledger,
 * the objection ledger, the plan, the deal's own value - because that is the
 * difference between "Memoire found things" and "this is what will be true
 * after you press Save". A person is added with an Unknown role, and the
 * sentence says so: being named in a note is not a buying role.
 */
export function describeCaptureConsequences(facts: CapturedFact[]): string[] {
  if (facts.length === 0) return ['Nothing is ticked, so saving changes nothing.'];
  const sentences: string[] = [];
  const of = <Kind extends CapturedFactKind>(kind: Kind) =>
    facts.filter((fact): fact is Extract<CapturedFact, { kind: Kind }> => fact.kind === kind);

  const promises = of('commitment');
  const yours = promises.filter((fact) => fact.party === 'self');
  const theirs = promises.filter((fact) => fact.party !== 'self');
  if (yours.length > 0) {
    const dated = yours.map((fact) => fact.dueDate).filter(Boolean).sort();
    sentences.push(
      `${count(yours.length, 'promise you made', 'promises you made')} ${yours.length === 1 ? 'joins' : 'join'} your commitments`
      + (dated.length > 0 ? `, the first due ${formatSafeBusinessDate(dated[0])}.` : ', with no date yet.'),
    );
  }
  if (theirs.length > 0) {
    sentences.push(`${count(theirs.length, 'thing you are waiting for', 'things you are waiting for')} ${theirs.length === 1 ? 'is' : 'are'} now tracked.`);
  }

  const objections = of('objection');
  if (objections.length > 0) {
    sentences.push(`${count(objections.length, 'objection opens', 'objections open')} on ${where(objections[0])}'s ledger.`);
  }

  const people = of('stakeholder');
  if (people.length > 0) {
    const names = people.map((fact) => fact.name).filter(Boolean);
    sentences.push(
      `${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} added at ${people[0].target.accountName || 'this customer'} with the role Unknown until you set it.`,
    );
  }

  const values = of('opportunity_value');
  if (values.length > 0) {
    const latest = values[values.length - 1];
    sentences.push(`${latest.target.opportunityName || 'The deal'} is valued at ${formatCurrencyAmount(latest.amount, latest.currency)}${latest.approximate ? ', as an estimate' : ''}.`);
  }

  const events = of('scheduled_event');
  if (events.length > 0) {
    sentences.push(`${count(events.length, 'dated event goes', 'dated events go')} on your Plan.`);
  }

  const findings = of('commercial_evidence');
  if (findings.length > 0) {
    sentences.push(`${count(findings.length, 'finding is', 'findings are')} recorded as evidence on ${where(findings[0])}.`);
  }

  return sentences.slice(0, 4);
}

function where(fact: CapturedFact) {
  return fact.target.opportunityName || fact.target.accountName || 'this customer';
}

function count(value: number, singular: string, plural: string) {
  return `${value === 1 ? 'One' : value} ${value === 1 ? singular : plural}`;
}

function joinNames(names: string[]) {
  if (names.length === 0) return 'The people named';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
