import type { OpportunityOutcome, OpportunityOutcomeReasonCategory } from '../services/opportunityOutcomeStore.ts';

/**
 * The close-out, asked as a choice rather than an essay.
 *
 * The retro shipped as five free-text boxes. Every one of them was the right
 * question, and together they were a form nobody fills in twice: the founder's
 * note was that closing a deal cost more typing than the close was worth. A
 * seller finishing a deal at six in the evening will write "Service" and press
 * save - which is what happened - and "Service" is not an answer any win/loss
 * report can read.
 *
 * So the questions stay and the typing goes. These are the answers this trade
 * actually gives, phrased as whole sentences so a picked one reads like
 * something a person said. Free text survives beside them for the case none of
 * them fits, which is the case that matters most and is also the rarest.
 *
 * Each reason carries the category it implies, so picking "Price was too high"
 * files the deal under Price without a second question. The operator can still
 * override the category; the point is that they usually will not have to.
 */

export type ReasonPreset = {
  label: string;
  category: OpportunityOutcomeReasonCategory;
};

const WON: ReasonPreset[] = [
  { label: 'Our price was competitive', category: 'Price' },
  { label: 'Technical fit was proven to them', category: 'Technical fit' },
  { label: 'The relationship carried it', category: 'Relationship' },
  { label: 'We answered faster than the others', category: 'Competitor' },
  { label: 'Budget was already approved', category: 'Budget' },
  { label: 'Renewal of what they already run', category: 'Relationship' },
  { label: 'We cleared the objection they had', category: 'Technical fit' },
  { label: 'We were the only qualified supplier', category: 'Competitor' },
];

const LOST: ReasonPreset[] = [
  { label: 'Our price was too high', category: 'Price' },
  { label: 'A competitor fitted better technically', category: 'Technical fit' },
  { label: 'Budget was cut or never approved', category: 'Budget' },
  { label: 'Procurement chose another supplier', category: 'Procurement' },
  { label: 'The project was postponed', category: 'Timing' },
  { label: 'We never reached the decision maker', category: 'Relationship' },
  { label: 'The requirement changed', category: 'Technical fit' },
  { label: 'They kept the incumbent', category: 'Competitor' },
  { label: 'We could not meet the lead time', category: 'Timing' },
];

const DELAYED: ReasonPreset[] = [
  { label: 'Budget is not approved yet', category: 'Budget' },
  { label: 'Waiting on procurement', category: 'Procurement' },
  { label: 'The project was postponed', category: 'Timing' },
  { label: 'The decision maker is unavailable', category: 'Relationship' },
  { label: 'Technical evaluation is still running', category: 'Technical fit' },
  { label: 'Waiting on a document or certificate', category: 'Procurement' },
];

const NO_DECISION: ReasonPreset[] = [
  { label: 'Nobody owned the decision', category: 'No decision' },
  { label: 'Priority moved somewhere else', category: 'Timing' },
  { label: 'The requirement went away', category: 'No decision' },
  { label: 'Budget never materialised', category: 'Budget' },
  { label: 'They stopped responding', category: 'Relationship' },
];

export function reasonPresetsFor(outcome: OpportunityOutcome): ReasonPreset[] {
  if (outcome === 'Won') return WON;
  if (outcome === 'Lost') return LOST;
  if (outcome === 'Delayed') return DELAYED;
  return NO_DECISION;
}

/**
 * What was never established. Deliberately the same gaps the pipeline rules
 * flag while a deal is live, so the retro and the risk engine speak about the
 * deal in one vocabulary - a lesson filed as "no budget confirmation" can
 * eventually be counted against every open deal missing the same thing.
 */
export const evidenceGapPresets = [
  'The decision maker was never confirmed',
  'Budget was never confirmed',
  'The procurement path was never clear',
  'No technical validation was completed',
  'No written timeline was ever given',
  'We had no read on the competitor',
  'Nothing was missing',
];

export const lessonPresets = [
  'Qualify the budget earlier',
  'Reach the decision maker sooner',
  'Get technical validation before quoting',
  'Ask for the procurement path early',
  'Follow up faster',
  'Price it differently next time',
  'Walk away sooner',
];

/**
 * Picked answers plus anything typed, as one line.
 *
 * Semicolons rather than newlines: these are stored in a single field that gets
 * read back in tables, briefs and exports where a line break becomes a broken
 * row.
 */
export function composeRetroAnswer(picks: string[], note: string): string {
  return [...picks, note.trim()].filter(Boolean).join('; ');
}
