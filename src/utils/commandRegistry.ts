/**
 * The things you can do from the search bar, by name.
 *
 * A keyboard-first command is a shortcut to something the product already
 * does - it navigates, opens a create form, or opens a list already filtered to
 * the answer. It never answers a question itself: every command here lands on
 * the surface that owns the answer, computed by that surface's own engine.
 * "Show deals without a champion" opens Opportunities filtered by MEDDIC's
 * champion reading; it does not keep a second list of deals that lack one.
 *
 * Deterministic on purpose, like everything else here. The match is words, not
 * intent: a command is offered when every word typed starts a word in its label
 * or its aliases, and there is nothing to be wrong about.
 */

export type CommandKind = 'create' | 'navigate' | 'filter' | 'answer';

export type CommandDefinition = {
  id: string;
  kind: CommandKind;
  label: string;
  /** Where it lands, said as a place: "Leads · Ready to qualify". */
  detail: string;
  to: string;
  /** Words that should find it, beyond its label. Matched, never shown. */
  aliases: string;
};

export const commandRegistry: CommandDefinition[] = [
  {
    id: 'add-lead',
    kind: 'create',
    label: 'Add lead',
    detail: 'Leads · new lead',
    to: '/app/leads?action=add',
    aliases: 'new lead create prospect contact met someone',
  },
  {
    id: 'capture-meeting',
    kind: 'create',
    label: 'Capture a meeting',
    detail: 'Capture · write it the way you would say it',
    to: '/app/capture',
    aliases: 'capture note meeting call visit log touch record conversation',
  },
  {
    id: 'add-deal',
    kind: 'create',
    label: 'Add opportunity',
    detail: 'Opportunities · new deal',
    to: '/app/opportunities?new=1',
    aliases: 'new deal create opportunity',
  },
  {
    id: 'leads-revisit',
    kind: 'filter',
    label: 'Show leads due for revisit',
    detail: 'Leads · Needs action',
    to: '/app/leads?state=needs-action',
    aliases: 'nurture revisit due parked leads needs action',
  },
  {
    id: 'leads-ready',
    kind: 'filter',
    label: 'Show leads ready to qualify',
    detail: 'Leads · Ready to qualify',
    to: '/app/leads?state=ready',
    aliases: 'qualify ready leads discovery',
  },
  {
    id: 'leads-new',
    kind: 'filter',
    label: 'Show leads never contacted',
    detail: 'Leads · New',
    to: '/app/leads?state=new',
    aliases: 'new leads uncontacted first touch',
  },
  {
    id: 'deals-silent',
    kind: 'filter',
    label: 'Show deals going silent',
    detail: 'Opportunities · Going silent',
    to: '/app/opportunities?filter=goingSilent',
    aliases: 'quiet silent stale deals going no touch',
  },
  {
    id: 'deals-no-champion',
    kind: 'filter',
    label: 'Show deals without a champion',
    detail: 'Opportunities · No champion',
    to: '/app/opportunities?filter=noChampion',
    aliases: 'champion meddic deals without no',
  },
  {
    id: 'deals-no-next-action',
    kind: 'filter',
    label: 'Show deals with no next action',
    detail: 'Opportunities · Needs action',
    to: '/app/opportunities?filter=needsAction',
    aliases: 'next action step missing deals needs',
  },
  {
    id: 'overdue-payments',
    kind: 'filter',
    label: 'Show overdue payments',
    detail: 'Money · Collections',
    to: '/app/revenue?view=collections',
    aliases: 'overdue payments late invoices receivables collections cash owed',
  },
  {
    id: 'money-at-risk',
    kind: 'answer',
    label: 'Where is money stuck?',
    detail: 'Money · Money at risk',
    to: '/app/revenue',
    aliases: 'money at risk stuck orders no po not invoiced margin',
  },
  {
    id: 'what-changed',
    kind: 'answer',
    label: 'What changed this week?',
    detail: 'Review · Changes since last review',
    to: '/app/reviews',
    aliases: 'what changed this week since last review moved slipped',
  },
  {
    id: 'who-owes',
    kind: 'answer',
    label: 'Who owes what?',
    detail: 'Plan · Commitments',
    to: '/app/timeline',
    aliases: 'commitments promises owe customer owes internal plan',
  },
];

/** Normalised words, for the all-words-present match. */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The commands a query asks for.
 *
 * Every typed word must start a word in the label or aliases, so "silent" finds
 * "going silent" and "pay" finds "payments" - and "add" alone offers every
 * create command, which is what someone typing "add" wants to see.
 */
export function matchCommands(query: string, registry: CommandDefinition[] = commandRegistry, limit = 4): CommandDefinition[] {
  const typed = words(query);
  if (typed.length === 0) return [];
  return registry
    .filter((command) => {
      const haystack = words(`${command.label} ${command.aliases}`);
      return typed.every((word) => haystack.some((candidate) => candidate.startsWith(word)));
    })
    .slice(0, limit);
}
