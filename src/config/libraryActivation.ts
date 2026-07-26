import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ObjectionRecord } from '../services/objectionStore';

export const MIN_REAL_COMMERCIAL_EVENTS = 10;

export type LibraryActivation = {
  active: boolean;
  realEventCount: number;
  decidedOpportunityCount: number;
  repeatedObjectionCount: number;
  /** Plain-English reason the library is still hidden, or '' once active. */
  blockedReason: string;
};

const isReal = (record: { isSample?: boolean; source?: string }) =>
  !record.isSample && record.source !== 'demo';

/**
 * Whether the Playbook and Asset library have earned their place.
 *
 * These features look impressive and teach nothing until the workspace has real
 * outcomes behind them: an empty playbook full of templates is a promise the
 * product has not kept, and it makes a first-time user believe Memoire is a
 * content library rather than a control tower. So the gate is evidence, not
 * time and not a manual toggle:
 *
 *   - at least ten real commercial events to draw patterns from,
 *   - at least one opportunity that actually finished (won or lost),
 *   - at least one objection seen more than once, with a response recorded.
 *
 * Sample and demo records never count toward any of the three. A demo workspace
 * can still browse the library through the demo journey; what it cannot do is
 * make a real workspace look mature.
 */
export function evaluateLibraryActivation(input: {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  objections: ObjectionRecord[];
}): LibraryActivation {
  const realEvents = input.activities.filter(isReal);
  const decided = input.opportunities.filter(
    (opportunity) => isReal(opportunity) && (opportunity.status === 'Won' || opportunity.status === 'Lost'),
  );

  // "Repeated" means the same objection type came back on another record - one
  // objection recorded once is an anecdote, not a pattern worth a playbook. It
  // also has to carry a response: an unanswered objection teaches nothing.
  const themeCounts = new Map<string, number>();
  for (const objection of input.objections.filter(isReal)) {
    const theme = (objection.objectionType || '').trim().toLowerCase();
    if (!theme) continue;
    const answered = Boolean(
      objection.responsePlan?.trim() || objection.resolutionNote?.trim(),
    );
    if (!answered) continue;
    themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
  }
  const repeatedObjectionCount = [...themeCounts.values()].filter((count) => count > 1).length;

  const realEventCount = realEvents.length;
  const decidedOpportunityCount = decided.length;

  const missing: string[] = [];
  if (realEventCount < MIN_REAL_COMMERCIAL_EVENTS) {
    missing.push(`${MIN_REAL_COMMERCIAL_EVENTS - realEventCount} more captured activities`);
  }
  if (decidedOpportunityCount < 1) missing.push('one won or lost opportunity');
  if (repeatedObjectionCount < 1) missing.push('one objection you have answered more than once');

  return {
    active: missing.length === 0,
    realEventCount,
    decidedOpportunityCount,
    repeatedObjectionCount,
    blockedReason: missing.length === 0
      ? ''
      : `Your library unlocks once your own history can teach it something: ${missing.join(', ')}.`,
  };
}
