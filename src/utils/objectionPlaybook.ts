import type { ObjectionRecord, ObjectionType } from '../services/objectionStore.ts';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore.ts';

export type ObjectionPlaybookInsight = {
  objectionType: ObjectionType;
  total: number;
  resolved: number;
  open: number;
  resolutionRate: number;
  provenResponses: string[];
  dealsLostTo: number;
  accounts: string[];
};

export type ObjectionPlaybook = {
  insights: ObjectionPlaybookInsight[];
  headline: string;
  needsMoreData: boolean;
};

type ObjectionPlaybookInput = {
  objections: ObjectionRecord[];
  opportunityOutcomes?: OpportunityOutcomeRecord[];
  minObjectionsForPlaybook?: number;
};

const LOST_REASON_TO_OBJECTION_TYPE: Partial<Record<OpportunityOutcomeRecord['reasonCategory'], ObjectionType>> = {
  Price: 'Price',
  Budget: 'Budget',
  Competitor: 'Competitor',
  Procurement: 'Procurement',
  Timing: 'Timing',
  'Technical fit': 'Technical fit',
  Relationship: 'Trust / relationship',
};

/**
 * The learning layer: turns the seller's own objection history into a
 * personal playbook. For each objection type they actually face, show how
 * often they resolve it, which responses worked (their own words from
 * resolution notes), and how many deals that objection type has cost them.
 * Purely rule-based over existing data - the accumulated answer to
 * "how do I sell?" that no fresh CRM can replicate.
 */
export function buildObjectionPlaybook(input: ObjectionPlaybookInput): ObjectionPlaybook {
  const objections = input.objections || [];
  const outcomes = input.opportunityOutcomes || [];
  const minForPlaybook = input.minObjectionsForPlaybook ?? 3;

  const byType = new Map<ObjectionType, ObjectionRecord[]>();
  objections.forEach((objection) => {
    byType.set(objection.objectionType, [...(byType.get(objection.objectionType) || []), objection]);
  });

  const lostByType = new Map<ObjectionType, number>();
  outcomes
    .filter((outcome) => outcome.outcome === 'Lost')
    .forEach((outcome) => {
      const mapped = LOST_REASON_TO_OBJECTION_TYPE[outcome.reasonCategory];
      const matched = mapped || matchObjectionTypeByText(outcome.objectionThatMattered);
      if (!matched) return;
      lostByType.set(matched, (lostByType.get(matched) || 0) + 1);
    });

  const insights: ObjectionPlaybookInsight[] = Array.from(byType.entries()).map(([objectionType, records]) => {
    const resolved = records.filter((record) => record.status === 'Resolved');
    const open = records.filter((record) => record.status === 'Open');
    return {
      objectionType,
      total: records.length,
      resolved: resolved.length,
      open: open.length,
      resolutionRate: records.length === 0 ? 0 : resolved.length / records.length,
      provenResponses: collectProvenResponses(resolved),
      dealsLostTo: lostByType.get(objectionType) || 0,
      accounts: dedupe(records.map((record) => record.accountName).filter(Boolean)).slice(0, 4),
    };
  });

  insights.sort((a, b) => b.total - a.total
    || b.dealsLostTo - a.dealsLostTo
    || a.objectionType.localeCompare(b.objectionType));

  return {
    insights,
    headline: buildHeadline(insights, objections.length),
    needsMoreData: objections.length < minForPlaybook,
  };
}

export function formatObjectionResolutionRate(insight: Pick<ObjectionPlaybookInsight, 'resolved' | 'total'>) {
  return `${insight.resolved} of ${insight.total} resolved`;
}

/** Copy-ready markdown so proven responses can be pasted into a follow-up draft. */
export function generateObjectionPlaybookMarkdown(playbook: ObjectionPlaybook) {
  const lines: string[] = ['# What worked against objections', ''];
  playbook.insights.forEach((insight) => {
    lines.push(`## ${insight.objectionType} (${formatObjectionResolutionRate(insight)}${insight.dealsLostTo > 0 ? `, cost ${insight.dealsLostTo} ${insight.dealsLostTo === 1 ? 'deal' : 'deals'}` : ''})`);
    if (insight.provenResponses.length > 0) {
      insight.provenResponses.forEach((response) => lines.push(`- ${response}`));
    } else {
      lines.push('- No resolution notes captured yet.');
    }
    if (insight.accounts.length > 0) lines.push(`- Seen at: ${insight.accounts.join(', ')}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

function buildHeadline(insights: ObjectionPlaybookInsight[], totalObjections: number) {
  if (totalObjections === 0) return 'Capture objections as they come up and Memoire will learn what works for you.';
  const costly = insights.find((insight) => insight.dealsLostTo > 0);
  if (costly) {
    return `${costly.objectionType} objections have cost you ${costly.dealsLostTo} ${costly.dealsLostTo === 1 ? 'deal' : 'deals'}. Your proven responses are below.`;
  }
  const strongest = [...insights]
    .filter((insight) => insight.resolved > 0)
    .sort((a, b) => b.resolutionRate - a.resolutionRate)[0];
  if (strongest) {
    return `You resolve ${strongest.objectionType} objections most reliably (${formatObjectionResolutionRate(strongest)}). Reuse what worked.`;
  }
  return 'No objections resolved yet. Log the resolution note when one closes - that becomes your playbook.';
}

function collectProvenResponses(resolved: ObjectionRecord[]) {
  const responses = resolved
    .sort((a, b) => (b.resolvedAt || b.updatedAt).localeCompare(a.resolvedAt || a.updatedAt))
    .map((record) => (record.resolutionNote || record.responsePlan || '').trim())
    .filter((text) => text.length > 0);
  return dedupe(responses).slice(0, 3);
}

function matchObjectionTypeByText(text?: string): ObjectionType | null {
  const normalized = (text || '').toLowerCase();
  if (!normalized) return null;
  if (/price|pricing|expensive|cost/.test(normalized)) return 'Price';
  if (/budget/.test(normalized)) return 'Budget';
  if (/competitor|rival/.test(normalized)) return 'Competitor';
  if (/procurement|purchasing|tender/.test(normalized)) return 'Procurement';
  if (/timing|timeline|delay|postpone/.test(normalized)) return 'Timing';
  if (/technical|spec|integration|fit/.test(normalized)) return 'Technical fit';
  if (/lead time|delivery/.test(normalized)) return 'Lead time';
  if (/trust|relationship/.test(normalized)) return 'Trust / relationship';
  if (/compliance|validation|regulatory/.test(normalized)) return 'Compliance / validation';
  return null;
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
