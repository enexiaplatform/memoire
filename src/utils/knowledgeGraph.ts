import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore';
import type { QuoteRecord } from '../services/quoteStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import type { KnowledgeRecord } from './knowledgeNotes.ts';
import { accountKey } from './accountIdentity.ts';
import { resolveAccountName, type AccountAliasIndex } from './accountAliases.ts';
import { normalizeSearchText } from './textSearch.ts';
import { sumMoneyInBase } from './money.ts';
import { compareSafeBusinessDate, formatSafeBusinessDate, isValidBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * The Business Vault's model: what this workspace knows, how it connects, and
 * what it still does not know.
 *
 * The rule that shapes every line below is **derive, do not duplicate**. An
 * account node is not a copy of an account - it is the account, seen from the
 * question "what do I know about this". Deals, people, products, principals,
 * industries, competitors and recurring objections are all already written
 * somewhere in this workspace, so the map is assembled from them on read. The
 * only thing stored for the Vault is the knowledge no record could prove
 * (see `knowledgeNotes.ts`), and it joins the same graph as another node type.
 *
 * That constraint is what stops this becoming a second CRM. A note-vault whose
 * nodes are typed by hand goes stale in a fortnight, and then there are two
 * answers to "who is the champion at Bidiphar" and no way to tell which is
 * older.
 *
 * Everything here is a single pass over each collection - no nested scans - so
 * it stays linear at the scale the performance budget measures.
 */

export const knowledgeNodeTypes = [
  'account',
  'person',
  'opportunity',
  'brand',
  'product',
  'industry',
  'competitor',
  'objection',
  'note',
  'question',
] as const;

export type KnowledgeNodeType = (typeof knowledgeNodeTypes)[number];

export const knowledgeNodeTypeLabels: Record<KnowledgeNodeType, string> = {
  account: 'Customer',
  person: 'Person',
  opportunity: 'Deal',
  brand: 'Principal',
  product: 'Product',
  industry: 'Market',
  competitor: 'Competitor',
  objection: 'Objection',
  note: 'Knowledge',
  question: 'Open question',
};

/** Plural, for section headings and filter chips. */
export const knowledgeNodeTypePlurals: Record<KnowledgeNodeType, string> = {
  account: 'Customers',
  person: 'People',
  opportunity: 'Deals',
  brand: 'Principals',
  product: 'Products',
  industry: 'Markets',
  competitor: 'Competitors',
  objection: 'Objections',
  note: 'Knowledge',
  question: 'Open questions',
};

export type KnowledgeNode = {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  /** One short line of context. Never invented - read off a record. */
  subtitle: string;
  /** The record surface that owns this node, or '' when nothing owns it. */
  href: string;
  /**
   * How much this node matters, in money and attention. Used to order the
   * library, choose which clusters the map opens on, and rank gaps.
   */
  weight: number;
  /** Last date anything about this node changed. */
  updatedAt: string;
  valueBase: number;
  openDealCount: number;
  memoryCount: number;
  connectionCount: number;
  tags: string[];
  /**
   * The handful of record fields the knowledge-health questions are answered
   * from, carried on the node so a dimension can read the actual field rather
   * than infer it from an edge.
   *
   * Deliberately not "the whole record". A node holding a copy of everything is
   * the duplicate-store failure this file exists to avoid; these are the few
   * values a question is asked about, and each is empty when the record's own
   * field is empty - which is exactly what makes it a gap.
   */
  facts: Record<string, string>;
  /** Pre-normalized for diacritic-insensitive search. */
  searchText: string;
};

export type KnowledgeEdge = {
  id: string;
  from: string;
  to: string;
  /**
   * Directional and human-readable: "evaluating", "works at", "raised at".
   * Never "connected to" where a truer verb exists - a relation that says
   * nothing is a line on a picture, not knowledge.
   */
  relation: string;
  weight: number;
};

export type KnowledgeNeighbor = {
  edge: KnowledgeEdge;
  node: KnowledgeNode;
  /** Which way the relation reads from the node being looked at. */
  direction: 'out' | 'in';
  /** The relation phrased from this node's point of view. */
  relation: string;
};

export const knowledgeMemoryKinds = ['activity', 'deal', 'quote', 'outcome', 'objection', 'note'] as const;
export type KnowledgeMemoryKind = (typeof knowledgeMemoryKinds)[number];

export type KnowledgeMemoryEntry = {
  id: string;
  date: string;
  kind: KnowledgeMemoryKind;
  title: string;
  /** The captured detail, never invented. Empty when the record carried none. */
  detail: string;
  label: string;
  href: string;
};

export type KnowledgeHealthBand = 'strong' | 'developing' | 'thin' | 'unknown';

export const knowledgeHealthBandLabels: Record<KnowledgeHealthBand, string> = {
  strong: 'Strong',
  developing: 'Developing',
  thin: 'Thin',
  unknown: 'Barely known',
};

export type KnowledgeDimension = {
  id: string;
  /** What is known, as a statement. */
  label: string;
  /** What to go and find out, when it is not. */
  question: string;
  known: boolean;
  /** Where the answer came from. Empty when the dimension is unknown. */
  answer: string;
  /** Why the gap is worth closing, one clause. */
  why: string;
  /** How much this dimension counts toward the band. */
  weight: number;
  /**
   * The operator said this one does not apply here. Kept in the list rather
   * than deleted from it, so the decision is visible and can be taken back -
   * a filter you cannot see is a filter you cannot trust.
   */
  dismissed?: boolean;
  /** The record carrying the answer or the dismissal, so it can be undone. */
  resolutionId?: string;
};

/**
 * Deliberately a count and a band, not a percentage to one decimal place.
 *
 * "71%" invites the reader to believe something was measured. What is actually
 * true is "six of the nine things worth knowing about a customer are written
 * down here", which is a sentence anyone can check and argue with - and the
 * nine are listed, so they can.
 */
export type KnowledgeHealth = {
  band: KnowledgeHealthBand;
  known: number;
  total: number;
  dimensions: KnowledgeDimension[];
};

export type KnowledgeGap = {
  key: string;
  nodeId: string;
  nodeLabel: string;
  nodeType: KnowledgeNodeType;
  question: string;
  why: string;
  /** Node importance x dimension weight. Higher is worth asking first. */
  rank: number;
  status: 'open' | 'answered' | 'dismissed';
  /** The knowledge record that answered or waved this away. */
  resolvedBy?: string;
  /** True when the operator raised this themselves rather than the Vault. */
  authored: boolean;
};

export type KnowledgeGraph = {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  byId: Map<string, KnowledgeNode>;
  neighbors: Map<string, KnowledgeNeighbor[]>;
  memory: Map<string, KnowledgeMemoryEntry[]>;
  health: Map<string, KnowledgeHealth>;
  /** Open gaps only, best first. Answered and dismissed ones are dropped. */
  gaps: KnowledgeGap[];
  /** Knowledge records that name a node, keyed by node id. */
  backlinks: Map<string, KnowledgeRecord[]>;
  counts: Record<KnowledgeNodeType, number>;
  stats: {
    nodeCount: number;
    edgeCount: number;
    openGapCount: number;
    /** Nodes whose newest memory entry falls inside the last 7 days. */
    changedThisWeek: number;
    authoredCount: number;
  };
};

export type KnowledgeGraphInput = {
  accounts: AccountMemoryRecord[];
  opportunities: CrmLiteOpportunity[];
  stakeholders: StakeholderRecord[];
  activities: SalesActivityRecord[];
  objections: ObjectionRecord[];
  quotes?: QuoteRecord[];
  outcomes?: OpportunityOutcomeRecord[];
  knowledge?: KnowledgeRecord[];
  accountAliases?: AccountAliasIndex;
  /** Overridable so the derivation is testable without freezing the clock. */
  today?: string;
};

export function accountNodeId(name: string) {
  return `account:${accountKey(name)}`;
}

export function personNodeId(accountName: string, personName: string) {
  return `person:${accountKey(accountName)}:${normalizeSearchText(personName)}`;
}

export function opportunityNodeId(id: string) {
  return `opportunity:${id}`;
}

export function brandNodeId(brand: string) {
  return `brand:${normalizeSearchText(brand)}`;
}

export function productNodeId(product: string) {
  return `product:${normalizeSearchText(product)}`;
}

export function industryNodeId(industry: string) {
  return `industry:${normalizeSearchText(industry)}`;
}

export function competitorNodeId(name: string) {
  return `competitor:${normalizeSearchText(name)}`;
}

export function objectionNodeId(type: string) {
  return `objection:${normalizeSearchText(type)}`;
}

export function knowledgeNodeId(record: KnowledgeRecord) {
  return `${record.kind === 'question' ? 'question' : 'note'}:${record.id}`;
}

const RECENT_CONTACT_DAYS = 90;
const WEEK_DAYS = 7;

export function buildKnowledgeGraph(input: KnowledgeGraphInput): KnowledgeGraph {
  const today = input.today || todayDateKey();
  const aliases = input.accountAliases;
  const knowledge = (input.knowledge || []).filter((record) => record.__deleted !== true);
  // A "not relevant" record answers a question about a customer; it is not a
  // thing you know about the business. Drawing it as a node would put a row of
  // dismissed questions on the map, which is the opposite of what dismissing
  // one was for. It still counts as a resolution below.
  const authored = knowledge.filter((record) => record.status !== 'dismissed');

  const nodes = new Map<string, KnowledgeNode>();
  const edges = new Map<string, KnowledgeEdge>();
  const memory = new Map<string, KnowledgeMemoryEntry[]>();

  const upsert = (
    node: Omit<KnowledgeNode, 'connectionCount' | 'memoryCount' | 'searchText' | 'facts'>
      & { searchExtra?: string; facts?: Record<string, string> },
  ) => {
    const existing = nodes.get(node.id);
    const searchText = normalizeSearchText([node.label, node.subtitle, node.searchExtra, node.tags.join(' ')].filter(Boolean).join(' '));
    if (!existing) {
      nodes.set(node.id, {
        ...node,
        facts: cleanFacts(node.facts),
        connectionCount: 0,
        memoryCount: 0,
        searchText,
      });
      return;
    }
    // Merged rather than replaced: an account can be reached from a deal before
    // its own record is read, and the later, richer version must not lose the
    // money the earlier one accumulated.
    existing.label = existing.label || node.label;
    existing.subtitle = node.subtitle || existing.subtitle;
    existing.href = node.href || existing.href;
    existing.weight += node.weight;
    existing.valueBase += node.valueBase;
    existing.openDealCount += node.openDealCount;
    existing.tags = existing.tags.length ? existing.tags : node.tags;
    existing.updatedAt = laterDate(existing.updatedAt, node.updatedAt);
    // Concatenated, not re-normalized. Both halves are already normalized, and
    // re-running the NFD pass over an ever-growing string on every merge made
    // this the most expensive line in the derivation at 300 deals.
    existing.searchText = `${existing.searchText} ${searchText}`;
    // A later record may fill a field an earlier one left blank; it may never
    // blank one that was already answered.
    Object.assign(existing.facts, cleanFacts(node.facts));
  };

  const link = (from: string, to: string, relation: string, weight = 1) => {
    if (!from || !to || from === to) return;
    const id = `${from}->${to}:${relation}`;
    const existing = edges.get(id);
    if (existing) {
      existing.weight += weight;
      return;
    }
    edges.set(id, { id, from, to, relation, weight });
  };

  const remember = (nodeIds: (string | undefined)[], entry: KnowledgeMemoryEntry) => {
    const seen = new Set<string>();
    for (const nodeId of nodeIds) {
      if (!nodeId || seen.has(nodeId)) continue;
      seen.add(nodeId);
      const list = memory.get(nodeId);
      if (list) list.push(entry);
      else memory.set(nodeId, [entry]);
    }
  };

  // ---------------------------------------------------------------- accounts
  //
  // Both from account records and from names that appear only on a deal or a
  // touch. A customer the operator has been working for a month but never filed
  // an account record for is exactly the row the Vault should show - and, since
  // half its dimensions will be unknown, exactly the one it should ask about.
  const accountDisplayName = new Map<string, string>();
  const registerAccountName = (rawName: string | undefined) => {
    const name = resolveAccountName((rawName || '').trim(), aliases);
    if (!name) return '';
    const key = accountKey(name);
    if (!key) return '';
    if (!accountDisplayName.has(key)) accountDisplayName.set(key, name);
    return `account:${key}`;
  };

  for (const account of input.accounts) {
    const nodeId = registerAccountName(account.accountName);
    if (!nodeId) continue;
    const where = [account.location, account.stateProvince, account.territory].filter(Boolean).join(' · ');
    upsert({
      id: nodeId,
      type: 'account',
      label: accountDisplayName.get(accountKey(resolveAccountName(account.accountName, aliases))) || account.accountName,
      subtitle: [account.industry, account.segment, where].filter(Boolean).join(' · '),
      href: `/app/accounts?accountName=${encodeURIComponent(account.accountName)}`,
      weight: 2,
      updatedAt: dateOf(account.updatedAt),
      valueBase: 0,
      openDealCount: 0,
      tags: account.tags || [],
      searchExtra: [account.notes, account.strategy, (account.keyStakeholders || []).join(' ')].filter(Boolean).join(' '),
      facts: {
        industry: account.industry || '',
        where: where,
        segment: account.segment || '',
        potential: account.accountPotential === 'Unknown' ? '' : account.accountPotential || '',
        strategy: account.strategy || '',
      },
    });

    if (account.industry?.trim()) {
      const industryId = industryNodeId(account.industry);
      upsert({
        id: industryId,
        type: 'industry',
        label: account.industry.trim(),
        subtitle: 'Market',
        href: `/app/accounts?search=${encodeURIComponent(account.industry.trim())}`,
        weight: 1,
        updatedAt: dateOf(account.updatedAt),
        valueBase: 0,
        openDealCount: 0,
        tags: [],
      });
      link(nodeId, industryId, 'operates in', 1);
    }
  }

  // ----------------------------------------------------------- opportunities
  for (const opportunity of input.opportunities) {
    const accountNode = registerAccountName(opportunity.accountName);
    const nodeId = opportunityNodeId(opportunity.id);
    const value = sumMoneyInBase([{ amount: opportunity.estimatedValue, currency: opportunity.currency }]);
    const isOpen = opportunity.status === 'Active';

    upsert({
      id: nodeId,
      type: 'opportunity',
      label: opportunity.opportunityName || 'Untitled deal',
      subtitle: [opportunity.accountName, opportunity.stage, opportunity.status].filter(Boolean).join(' · '),
      href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
      weight: isOpen ? 3 : 1,
      updatedAt: dateOf(opportunity.updatedAt),
      valueBase: value,
      openDealCount: isOpen ? 1 : 0,
      tags: [],
      searchExtra: [opportunity.productOrSolution, opportunity.brand, opportunity.evidence, opportunity.decisionMaker].filter(Boolean).join(' '),
      facts: {
        decisionMaker: opportunity.decisionMaker || '',
        budgetOwner: opportunity.budgetOwner || '',
        procurementPath: opportunity.procurementPath || '',
        closePeriod: opportunity.expectedClosePeriod || '',
        evidence: opportunity.evidence || '',
        nextAction: opportunity.nextAction || '',
      },
    });

    if (accountNode) {
      // The account carries the deal's money so the library and the map can rank
      // customers by what the relationship is actually worth.
      upsert({
        id: accountNode,
        type: 'account',
        label: accountDisplayName.get(accountNode.slice('account:'.length)) || opportunity.accountName,
        subtitle: '',
        href: `/app/accounts?accountName=${encodeURIComponent(opportunity.accountName)}`,
        weight: isOpen ? 2 : 0.5,
        updatedAt: dateOf(opportunity.updatedAt),
        valueBase: value,
        openDealCount: isOpen ? 1 : 0,
        tags: [],
      });
      link(nodeId, accountNode, 'is a deal at', 2);
    }

    const brand = (opportunity.brand || '').trim();
    if (brand) {
      const brandId = brandNodeId(brand);
      upsert({
        id: brandId,
        type: 'brand',
        label: brand,
        subtitle: 'Principal / line',
        href: `/app/opportunities?brand=${encodeURIComponent(brand)}`,
        weight: 1,
        updatedAt: dateOf(opportunity.updatedAt),
        valueBase: value,
        openDealCount: isOpen ? 1 : 0,
        tags: [],
      });
      link(nodeId, brandId, 'carries', 1);
      if (accountNode) link(accountNode, brandId, accountBrandRelation(opportunity.status), 2);
    }

    const product = (opportunity.productOrSolution || '').trim();
    if (product) {
      const productId = productNodeId(product);
      upsert({
        id: productId,
        type: 'product',
        label: product,
        subtitle: 'Product / application',
        href: `/app/opportunities?search=${encodeURIComponent(product)}`,
        weight: 1,
        updatedAt: dateOf(opportunity.updatedAt),
        valueBase: value,
        openDealCount: isOpen ? 1 : 0,
        tags: [],
      });
      link(nodeId, productId, 'is for', 1);
      if (accountNode) link(accountNode, productId, accountProductRelation(opportunity.status), 1);
    }

    remember([nodeId, accountNode], {
      id: `deal:${opportunity.id}`,
      date: dateOf(opportunity.createdAt),
      kind: 'deal',
      title: opportunity.opportunityName || 'Untitled deal',
      detail: opportunity.evidence || opportunity.nextAction || '',
      label: `${opportunity.stage} · ${opportunity.status}`,
      href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
    });
  }

  // ------------------------------------------------------------ stakeholders
  for (const stakeholder of input.stakeholders) {
    const name = (stakeholder.name || '').trim();
    if (!name) continue;
    const accountNode = registerAccountName(stakeholder.accountName);
    const nodeId = personNodeId(stakeholder.accountName || '', name);

    upsert({
      id: nodeId,
      type: 'person',
      label: name,
      subtitle: [stakeholder.roleTitle, stakeholder.accountName].filter(Boolean).join(' · '),
      href: `/app/stakeholders?stakeholderId=${encodeURIComponent(stakeholder.id)}`,
      weight: stakeholder.influenceLevel === 'High' ? 2 : 1,
      updatedAt: dateOf(stakeholder.updatedAt),
      valueBase: 0,
      openDealCount: 0,
      tags: stakeholder.tags || [],
      searchExtra: [stakeholder.notes, stakeholder.stakeholderRole, stakeholder.email].filter(Boolean).join(' '),
      facts: {
        role: stakeholder.roleTitle || '',
        part: stakeholder.stakeholderRole === 'Unknown' ? '' : stakeholder.stakeholderRole || '',
        stance: stakeholder.stance === 'Unknown' ? '' : stakeholder.stance || '',
        strength: stakeholder.relationshipStrength === 'Unknown' ? '' : stakeholder.relationshipStrength || '',
        reachable: [stakeholder.email, stakeholder.phone].filter(Boolean).join(' · '),
      },
    });

    if (accountNode) link(nodeId, accountNode, personAccountRelation(stakeholder), 2);
    if (stakeholder.opportunityId) {
      link(nodeId, opportunityNodeId(stakeholder.opportunityId), personDealRelation(stakeholder), 1);
    }
  }

  // --------------------------------------------------------------- activities
  //
  // The touches are the Vault's evidence layer: every derived claim about a
  // customer should be traceable to one of these, and the competitors named
  // inside them are knowledge that exists nowhere else in the product.
  for (const activity of input.activities) {
    const accountName = activity.linkedAccountName || activity.accountName;
    const accountNode = registerAccountName(accountName);
    const dealNode = activity.linkedOpportunityId ? opportunityNodeId(activity.linkedOpportunityId) : undefined;
    const date = dateOf(activity.activityDate || activity.createdAt);

    const personName = (activity.stakeholderName || activity.contactName || '').trim();
    const personNode = personName && accountName ? personNodeId(accountName, personName) : undefined;
    if (personNode && !nodes.has(personNode)) {
      // A name that appears only in a captured note is still a person you know.
      // Filing them here is what lets the Vault ask "who is this, and what do
      // they decide" rather than losing them inside a paragraph.
      upsert({
        id: personNode,
        type: 'person',
        label: personName,
        subtitle: [activity.stakeholderRole, accountName].filter(Boolean).join(' · '),
        href: `/app/stakeholders?search=${encodeURIComponent(personName)}`,
        weight: 0.5,
        updatedAt: date,
        valueBase: 0,
        openDealCount: 0,
        tags: [],
      });
      if (accountNode) link(personNode, accountNode, 'mentioned at', 1);
    }

    for (const competitor of activity.competitors || []) {
      const label = (competitor || '').trim();
      if (!label) continue;
      const competitorId = competitorNodeId(label);
      upsert({
        id: competitorId,
        type: 'competitor',
        label,
        subtitle: 'Named in a captured touch',
        href: '',
        weight: 1,
        updatedAt: date,
        valueBase: 0,
        openDealCount: 0,
        tags: [],
      });
      if (accountNode) link(competitorId, accountNode, 'competing at', 2);
      if (dealNode) link(competitorId, dealNode, 'in play against', 1);
      // Same id as the touch itself, deliberately: the Timeline flattens every
      // node's memory and dedupes on it, and a per-node id would show one
      // meeting three times because three nodes were named in it.
      remember([competitorId], {
        id: `activity:${activity.id}`,
        date,
        kind: 'activity',
        title: activity.summary || activity.activityType,
        detail: activity.rawNote || '',
        label: accountName || activity.activityType,
        href: `/app/timeline?view=history&activityId=${encodeURIComponent(activity.id)}`,
      });
    }

    remember([accountNode, dealNode, personNode], {
      id: `activity:${activity.id}`,
      date,
      kind: 'activity',
      title: activity.summary || activity.activityType,
      detail: activity.rawNote || '',
      label: activity.activityType,
      href: `/app/timeline?view=history&activityId=${encodeURIComponent(activity.id)}`,
    });
  }

  // --------------------------------------------------------------- objections
  //
  // Grouped by type, not one node per record. A single price objection is an
  // event on a deal; "price comes up at six of your customers" is knowledge,
  // and it is the version that changes what you do next.
  for (const objection of input.objections) {
    const type = (objection.objectionType || '').trim();
    if (!type) continue;
    const nodeId = objectionNodeId(type);
    const accountNode = registerAccountName(objection.accountName);
    const date = dateOf(objection.updatedAt || objection.createdAt);

    upsert({
      id: nodeId,
      type: 'objection',
      label: type,
      subtitle: 'Objection raised in the field',
      href: `/app/objections?type=${encodeURIComponent(type)}`,
      weight: objection.impact === 'High' ? 2 : 1,
      updatedAt: date,
      valueBase: 0,
      openDealCount: 0,
      tags: objection.tags || [],
      searchExtra: objection.objectionText,
    });

    if (accountNode) link(nodeId, accountNode, 'raised at', 2);
    if (objection.opportunityId) link(nodeId, opportunityNodeId(objection.opportunityId), 'blocks', 2);

    remember([nodeId, accountNode, objection.opportunityId ? opportunityNodeId(objection.opportunityId) : undefined], {
      id: `objection:${objection.id}`,
      date,
      kind: 'objection',
      title: objection.objectionText || type,
      detail: objection.responsePlan || objection.requiredProof || '',
      label: `${type} · ${objection.status}`,
      href: `/app/objections?objectionId=${encodeURIComponent(objection.id)}`,
    });
  }

  // ------------------------------------------------------------------ quotes
  for (const quote of input.quotes || []) {
    const accountNode = registerAccountName(quote.accountName);
    const dealNode = quote.opportunityId ? opportunityNodeId(quote.opportunityId) : undefined;
    remember([accountNode, dealNode], {
      id: `quote:${quote.id}`,
      date: dateOf(quote.quoteDate || quote.updatedAt || quote.createdAt),
      kind: 'quote',
      title: quote.title || 'Quote',
      detail: quote.nextAction || '',
      label: `Quote · ${quote.status}`,
      href: `/app/quotes?quoteId=${encodeURIComponent(quote.id)}`,
    });
  }

  // ---------------------------------------------------------------- outcomes
  //
  // A won or lost deal with a reason on it is the highest-grade knowledge this
  // workspace produces: it is the only record that has already been tested
  // against reality.
  for (const outcome of input.outcomes || []) {
    const accountNode = registerAccountName(outcome.accountName);
    const dealNode = outcome.opportunityId ? opportunityNodeId(outcome.opportunityId) : undefined;
    remember([accountNode, dealNode], {
      id: `outcome:${outcome.id}`,
      date: dateOf(outcome.outcomeDate || outcome.createdAt),
      kind: 'outcome',
      title: `${outcome.outcome} · ${outcome.opportunityName || 'deal'}`,
      detail: outcome.lessonLearned || outcome.reasonText || '',
      label: outcome.reasonCategory || outcome.outcome,
      href: `/app/opportunities?opportunityId=${encodeURIComponent(outcome.opportunityId || '')}`,
    });
  }

  // ------------------------------------------------- authored knowledge
  const backlinks = new Map<string, KnowledgeRecord[]>();
  for (const record of authored) {
    const nodeId = knowledgeNodeId(record);
    const date = dateOf(record.occurredAt || record.updatedAt || record.createdAt);
    upsert({
      id: nodeId,
      type: record.kind === 'question' ? 'question' : 'note',
      label: record.title,
      subtitle: record.subjects.map((subject) => subject.label).join(' · ') || 'Business memory',
      href: '',
      weight: record.kind === 'question' ? 1.5 : 1,
      updatedAt: date,
      valueBase: 0,
      openDealCount: 0,
      tags: record.tags,
      searchExtra: record.body,
    });

    for (const subject of record.subjects) {
      link(nodeId, subject.nodeId, record.relation, 2);
      const list = backlinks.get(subject.nodeId);
      if (list) list.push(record);
      else backlinks.set(subject.nodeId, [record]);
      remember([subject.nodeId], {
        id: `note:${record.id}`,
        date,
        kind: 'note',
        title: record.title,
        detail: record.body,
        label: record.kind === 'question' ? 'Open question' : 'Knowledge',
        href: `/app/vault?node=${encodeURIComponent(nodeId)}`,
      });
    }

    remember([nodeId], {
      id: `note:${record.id}`,
      date,
      kind: 'note',
      title: record.title,
      detail: record.body,
      label: record.kind === 'question' ? 'Open question' : 'Knowledge',
      href: `/app/vault?node=${encodeURIComponent(nodeId)}`,
    });
  }

  // A knowledge record can name a node the workspace has no other trace of - a
  // competitor heard about at a trade show, a standard nobody has quoted yet.
  // Those are real knowledge; without this they would be edges pointing at
  // nothing and would silently disappear from the map.
  for (const record of authored) {
    for (const subject of record.subjects) {
      if (nodes.has(subject.nodeId)) continue;
      upsert({
        id: subject.nodeId,
        type: nodeTypeFromId(subject.nodeId),
        label: subject.label,
        subtitle: 'Known only from your own notes',
        href: '',
        weight: 0.5,
        updatedAt: dateOf(record.updatedAt),
        valueBase: 0,
        openDealCount: 0,
        tags: [],
      });
    }
  }

  // ------------------------------------------------------------- assemble
  const edgeList = [...edges.values()].filter((edge) => nodes.has(edge.from) && nodes.has(edge.to));
  const neighbors = new Map<string, KnowledgeNeighbor[]>();

  for (const edge of edgeList) {
    const fromNode = nodes.get(edge.from)!;
    const toNode = nodes.get(edge.to)!;
    fromNode.connectionCount += 1;
    toNode.connectionCount += 1;
    pushNeighbor(neighbors, edge.from, { edge, node: toNode, direction: 'out', relation: edge.relation });
    pushNeighbor(neighbors, edge.to, { edge, node: fromNode, direction: 'in', relation: inverseRelation(edge.relation) });
  }

  for (const [nodeId, entries] of memory) {
    entries.sort((left, right) => compareSafeBusinessDate(right.date, left.date));
    const node = nodes.get(nodeId);
    if (!node) continue;
    node.memoryCount = entries.length;
    node.updatedAt = laterDate(node.updatedAt, entries[0]?.date || '');
  }

  for (const node of nodes.values()) {
    // Attention is weight: a node nobody has touched and nothing links to should
    // not outrank a customer with three live deals just because it exists.
    node.weight += Math.min(node.connectionCount, 12) * 0.5 + Math.min(node.memoryCount, 12) * 0.4;
  }

  const nodeList = [...nodes.values()].sort((left, right) =>
    right.weight - left.weight || left.label.localeCompare(right.label));

  const resolutions = indexResolutions(knowledge);

  const health = new Map<string, KnowledgeHealth>();
  for (const node of nodeList) {
    const dimensions = applyResolutions(node.id, describeDimensions(node, { neighbors, memory, today }), resolutions);
    if (dimensions.length === 0) continue;
    health.set(node.id, summarizeHealth(dimensions));
  }

  const gaps = deriveGaps({ nodes: nodeList, health, knowledge, resolutions });

  const counts = Object.fromEntries(knowledgeNodeTypes.map((type) => [type, 0])) as Record<KnowledgeNodeType, number>;
  for (const node of nodeList) counts[node.type] += 1;

  const weekAgo = shiftDate(today, -WEEK_DAYS);

  return {
    nodes: nodeList,
    edges: edgeList,
    byId: nodes,
    neighbors,
    memory,
    health,
    gaps,
    backlinks,
    counts,
    stats: {
      nodeCount: nodeList.length,
      edgeCount: edgeList.length,
      openGapCount: gaps.length,
      changedThisWeek: nodeList.filter((node) => node.updatedAt && node.updatedAt >= weekAgo).length,
      authoredCount: authored.length,
    },
  };
}

function pushNeighbor(map: Map<string, KnowledgeNeighbor[]>, key: string, value: KnowledgeNeighbor) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * The reverse reading of a relation.
 *
 * A graph edge has one direction and two sentences. Standing on the brand,
 * "Bidiphar — evaluating → PMM" has to read "evaluated by Bidiphar", or the
 * neighbour list on the brand says the brand is evaluating the customer.
 */
const INVERSE_RELATIONS: Record<string, string> = {
  'is a deal at': 'has deal',
  'carries': 'sold through',
  'is for': 'covered by deal',
  'buys': 'bought by',
  'evaluating': 'evaluated by',
  'declined': 'declined by',
  'uses': 'used by',
  'trialing': 'trialed by',
  'considered': 'considered by',
  'works at': 'contact',
  'mentioned at': 'mentioned',
  'champions': 'championed by',
  'blocks': 'blocked by',
  'decides at': 'decision maker',
  'influences': 'influenced by',
  'raised at': 'has objection',
  'operates in': 'includes',
  'competing at': 'faces',
  'in play against': 'competing for',
  // The authored side. Standing on a customer, a note attached to it reads as
  // something you recorded - not as "learned at (from)", which is what the
  // generic fallback produced and which is not a phrase in any language.
  'learned at': 'knowledge recorded',
  'learned from': 'lesson recorded',
  'decided for': 'decision recorded',
  'pattern across': 'pattern recorded',
  'true of': 'fact recorded',
  'risk at': 'risk recorded',
  'open question at': 'open question',
};

export function inverseRelation(relation: string) {
  return INVERSE_RELATIONS[relation] || 'referenced by';
}

function accountBrandRelation(status: CrmLiteOpportunity['status']) {
  if (status === 'Won') return 'buys';
  if (status === 'Lost') return 'declined';
  return 'evaluating';
}

function accountProductRelation(status: CrmLiteOpportunity['status']) {
  if (status === 'Won') return 'uses';
  if (status === 'Lost') return 'declined';
  return 'trialing';
}

function personAccountRelation(stakeholder: StakeholderRecord) {
  if (stakeholder.stakeholderRole === 'Champion') return 'champions';
  if (stakeholder.stakeholderRole === 'Blocker') return 'blocks';
  if (stakeholder.stakeholderRole === 'Economic Buyer') return 'decides at';
  return 'works at';
}

function personDealRelation(stakeholder: StakeholderRecord) {
  if (stakeholder.stakeholderRole === 'Blocker') return 'blocks';
  if (stakeholder.stakeholderRole === 'Champion') return 'champions';
  return 'influences';
}

function nodeTypeFromId(nodeId: string): KnowledgeNodeType {
  const prefix = nodeId.split(':')[0];
  return (knowledgeNodeTypes as readonly string[]).includes(prefix)
    ? (prefix as KnowledgeNodeType)
    : 'note';
}

/**
 * The things worth knowing, per kind of node.
 *
 * Every dimension is answered by a field or a record that already exists, which
 * is the discipline that keeps this from becoming a survey. If nothing in the
 * workspace could ever answer a question, it does not belong on this list.
 */
function describeDimensions(
  node: KnowledgeNode,
  context: {
    neighbors: Map<string, KnowledgeNeighbor[]>;
    memory: Map<string, KnowledgeMemoryEntry[]>;
    today: string;
  },
): KnowledgeDimension[] {
  const near = context.neighbors.get(node.id) || [];
  const entries = context.memory.get(node.id) || [];
  const has = (predicate: (neighbor: KnowledgeNeighbor) => boolean) => near.find(predicate);
  const label = node.label;

  if (node.type === 'account') {
    const industry = has((neighbor) => neighbor.node.type === 'industry');
    const person = near.filter((neighbor) => neighbor.node.type === 'person');
    const decider = person.find((neighbor) => neighbor.relation === 'decision maker' || neighbor.relation === 'decides at');
    const champion = person.find((neighbor) => neighbor.relation === 'championed by' || neighbor.relation === 'champions');
    const buys = near.filter((neighbor) => neighbor.relation === 'bought by' || neighbor.relation === 'used by' || neighbor.relation === 'evaluated by' || neighbor.relation === 'trialed by');
    const competitor = has((neighbor) => neighbor.node.type === 'competitor');
    const objection = has((neighbor) => neighbor.node.type === 'objection');
    const lastTouch = entries.find((entry) => entry.kind === 'activity');
    const recent = Boolean(lastTouch && lastTouch.date >= shiftDate(context.today, -RECENT_CONTACT_DAYS));
    const buyingRoute = near
      .filter((neighbor) => neighbor.node.type === 'opportunity')
      .map((neighbor) => neighbor.node.facts.procurementPath)
      .find(Boolean);

    return [
      dimension('industry', 'What business they are in', `What industry is ${label} in?`, Boolean(industry) || Boolean(node.facts.industry), industry?.node.label || node.facts.industry || '', 'Without it they never appear when you look for everyone in a market.', 1),
      dimension('where', 'Where they operate', `Where is ${label} actually based?`, Boolean(node.facts.where), node.facts.where || '', 'Territory decides who visits them and how fast you can support them.', 0.75),
      dimension('buying-route', 'How they buy', `How does ${label} actually place an order - tender, direct, through a dealer?`, Boolean(buyingRoute), buyingRoute || '', 'The route decides the paperwork and the lead time, and it is discovered late by everyone who did not ask.', 1),
      dimension('people', 'Who you know there', `Who do you actually know at ${label}?`, person.length > 0, person.length ? `${person.length} recorded` : '', 'A customer with no named person is a logo, not a relationship.', 1.5),
      dimension('decision-maker', 'Who signs', `Who signs at ${label}?`, Boolean(decider), decider?.node.label || '', 'Deals stall at the last metre when nobody named the signer.', 2),
      dimension('champion', 'Who is on your side', `Who is your champion inside ${label}?`, Boolean(champion), champion?.node.label || '', 'Without one, every objection has to be answered by you, in the room.', 1.5),
      dimension('portfolio', 'What they buy from you', `Which of your lines has ${label} actually bought?`, buys.length > 0, buys.length ? `${buys.length} line${buys.length === 1 ? '' : 's'}` : '', 'This is what the cross-sell conversation is built on.', 1.5),
      dimension('recent-contact', 'When you last spoke', `When did you last speak to anyone at ${label}?`, recent, friendlyDate(lastTouch?.date), `Nothing captured in ${RECENT_CONTACT_DAYS} days is how a relationship goes quiet without anyone noticing.`, 1),
      dimension('competition', 'Who else is in there', `Who else is selling into ${label}?`, Boolean(competitor), competitor?.node.label || '', 'A price you cannot explain is usually a competitor you did not know about.', 1),
      dimension('objections', 'What could stop it', `What has ${label} pushed back on?`, Boolean(objection), objection?.node.label || '', 'The objection you have not written down is the one you answer badly twice.', 1),
      dimension('value', 'What the relationship is worth', `What is ${label} worth to you?`, node.valueBase > 0, node.valueBase > 0 ? 'From the deals on record' : '', 'Without a number, this customer cannot be ranked against any other.', 1),
    ];
  }

  if (node.type === 'person') {
    const deals = near.filter((neighbor) => neighbor.node.type === 'opportunity');
    const account = has((neighbor) => neighbor.node.type === 'account');
    const lastTouch = entries.find((entry) => entry.kind === 'activity');
    return [
      dimension('role', 'What they do', `What is ${label}'s actual role?`, Boolean(node.facts.role), node.facts.role || '', 'A name with no role cannot be placed in a decision.', 1.5),
      dimension('part', 'Their part in the decision', `Is ${label} a champion, a buyer, a blocker?`, Boolean(node.facts.part), node.facts.part || '', 'Two supportive people and no economic buyer is a deal that never closes.', 1.5),
      dimension('account', 'Where they work', `Which customer does ${label} sit inside?`, Boolean(account), account?.node.label || '', 'A person floating free of an account cannot be found when you need them.', 1),
      dimension('deals', 'What they touch', `Which deal does ${label} influence?`, deals.length > 0, deals.length ? `${deals.length} deal${deals.length === 1 ? '' : 's'}` : '', 'Knowing someone is only useful if you know what they can move.', 1),
      dimension('reachable', 'How to reach them', `Do you have a phone or an email for ${label}?`, Boolean(node.facts.reachable), node.facts.reachable || '', 'A contact you can only reach through somebody else is not yours.', 0.75),
      dimension('contact', 'When you last spoke', `When did you last speak to ${label}?`, Boolean(lastTouch), friendlyDate(lastTouch?.date), 'A contact with no recorded conversation is a business card.', 1),
    ];
  }

  if (node.type === 'opportunity') {
    const people = near.filter((neighbor) => neighbor.node.type === 'person');
    const product = has((neighbor) => neighbor.node.type === 'product' || neighbor.node.type === 'brand');
    const objection = has((neighbor) => neighbor.node.type === 'objection');
    return [
      dimension('value', 'What it is worth', `What is ${label} worth?`, node.valueBase > 0, node.valueBase > 0 ? 'Estimated value on the deal' : '', 'A deal with no number cannot be forecast or defended.', 1.5),
      dimension('people', 'Who is on it', `Who are the people behind ${label}?`, people.length > 0, people.length ? `${people.length} recorded` : '', 'A deal with nobody named is a deal nobody is running.', 1.5),
      dimension('money', 'Who owns the budget', `Who owns the budget for ${label}?`, Boolean(node.facts.budgetOwner), node.facts.budgetOwner || '', 'The person who wants it and the person who pays for it are rarely the same person.', 1.5),
      dimension('route', 'How it gets bought', `What is the procurement route for ${label}?`, Boolean(node.facts.procurementPath), node.facts.procurementPath || '', 'A tender discovered in the last week is a deal you lose on paperwork.', 1),
      dimension('when', 'When it lands', `When is ${label} expected to close?`, Boolean(node.facts.closePeriod), node.facts.closePeriod || '', 'A deal with no period cannot be forecast, so it is carried forever.', 1),
      dimension('what', 'What is being sold', `What exactly are you selling into ${label}?`, Boolean(product), product?.node.label || '', 'Without a line on it, this deal is invisible to portfolio coverage.', 1),
      dimension('resistance', 'What could stop it', `What has been pushed back on in ${label}?`, Boolean(objection) || Boolean(node.facts.evidence), objection?.node.label || (node.facts.evidence ? 'Evidence recorded on the deal' : ''), 'Every deal has resistance; an unrecorded one is not absent, it is unmanaged.', 1),
    ];
  }

  if (node.type === 'brand' || node.type === 'product') {
    const buyers = near.filter((neighbor) => neighbor.relation === 'buys' || neighbor.relation === 'uses');
    const evaluating = near.filter((neighbor) => neighbor.relation === 'evaluating' || neighbor.relation === 'trialing');
    const objection = has((neighbor) => neighbor.node.type === 'objection');
    const competitor = has((neighbor) => neighbor.node.type === 'competitor');
    const noun = node.type === 'brand' ? 'this line' : 'this product';
    return [
      dimension('buyers', 'Who buys it', `Who has actually bought ${label}?`, buyers.length > 0, buyers.length ? `${buyers.length} customer${buyers.length === 1 ? '' : 's'}` : '', `A reference customer is the fastest argument for ${noun}.`, 1.5),
      dimension('pipeline', 'Who is looking at it', `Who is currently evaluating ${label}?`, evaluating.length > 0, evaluating.length ? `${evaluating.length} in play` : '', 'A line with nothing in play is a line quietly falling out of the conversation.', 1),
      dimension('resistance', 'What gets said against it', `What objections come up on ${label}?`, Boolean(objection), objection?.node.label || '', 'The same objection answered well twice becomes a playbook.', 1),
      dimension('competition', 'What it is up against', `Who do you lose ${label} to?`, Boolean(competitor), competitor?.node.label || '', 'Nobody wins a comparison they have not written down.', 1),
    ];
  }

  if (node.type === 'competitor') {
    const accounts = near.filter((neighbor) => neighbor.node.type === 'account');
    const deals = near.filter((neighbor) => neighbor.node.type === 'opportunity');
    return [
      dimension('where', 'Where they are active', `Which customers is ${label} inside?`, accounts.length > 0, accounts.length ? `${accounts.length} customer${accounts.length === 1 ? '' : 's'}` : '', 'A competitor you cannot place is a competitor you cannot plan against.', 1.5),
      dimension('deals', 'What they are contesting', `Which live deals is ${label} in?`, deals.length > 0, deals.length ? `${deals.length} deal${deals.length === 1 ? '' : 's'}` : '', 'Knowing where they turn up is the difference between a surprise and a plan.', 1),
      dimension('why', 'Why customers pick them', `Why do customers choose ${label} over you?`, false, '', 'This is the one question nothing in a CRM will ever answer for you.', 2),
    ];
  }

  if (node.type === 'objection') {
    const accounts = near.filter((neighbor) => neighbor.node.type === 'account');
    return [
      dimension('where', 'Where it comes up', `Which customers raise "${label}"?`, accounts.length > 0, accounts.length ? `${accounts.length} customer${accounts.length === 1 ? '' : 's'}` : '', 'A pattern needs more than one instance to be worth a playbook.', 1),
      dimension('answer', 'What answers it', `What has actually answered "${label}"?`, false, '', 'Write the answer that worked once and it becomes the answer you use every time.', 2),
    ];
  }

  return [];
}

function dimension(
  id: string,
  label: string,
  question: string,
  known: boolean,
  answer: string,
  why: string,
  weight: number,
): KnowledgeDimension {
  return { id, label, question, known, answer, why, weight };
}

/** The operator's own standing answer to each derived gap, newest wins. */
function indexResolutions(knowledge: KnowledgeRecord[]) {
  const byKey = new Map<string, KnowledgeRecord>();
  for (const record of knowledge) {
    if (!record.gapKey) continue;
    const existing = byKey.get(record.gapKey);
    if (!existing || (record.updatedAt || '') > (existing.updatedAt || '')) byKey.set(record.gapKey, record);
  }
  return byKey;
}

/**
 * What the operator has written down counts as known.
 *
 * Without this the two halves of the page disagree: answering "who signs at
 * Apex Labs?" removed the gap from the list and left the drawer still reporting
 * that dimension as "not recorded", which reads as the answer having been lost.
 * A fact written into the Vault is a recorded fact - it simply lives here
 * rather than in a field on a form.
 *
 * A dimension waved away leaves the list entirely rather than counting against
 * the score. "We do not need to know who signs, they buy through a dealer" is a
 * true statement about this customer, and marking it permanently missing would
 * punish the operator for telling the truth.
 */
function applyResolutions(
  nodeId: string,
  dimensions: KnowledgeDimension[],
  resolutions: Map<string, KnowledgeRecord>,
): KnowledgeDimension[] {
  if (resolutions.size === 0) return dimensions;
  return dimensions.flatMap((item) => {
    const resolution = resolutions.get(`gap:${nodeId}:${item.id}`);
    if (!resolution) return [item];
    if (resolution.status === 'dismissed') {
      return [{ ...item, known: false, dismissed: true, resolutionId: resolution.id }];
    }
    if (item.known) return [item];
    return [{ ...item, known: true, answer: resolution.title, resolutionId: resolution.id }];
  });
}

function summarizeHealth(dimensions: KnowledgeDimension[]): KnowledgeHealth {
  // A dimension the operator waved away is out of the score entirely. Counting
  // it as missing would punish them for saying "we buy through a dealer, there
  // is no signer to find" - which is knowledge, not a gap.
  const counted = dimensions.filter((item) => !item.dismissed);
  const total = counted.reduce((sum, item) => sum + item.weight, 0);
  const known = counted.reduce((sum, item) => sum + (item.known ? item.weight : 0), 0);
  const share = total > 0 ? known / total : 0;

  const band: KnowledgeHealthBand = share >= 0.8 ? 'strong'
    : share >= 0.5 ? 'developing'
      : share >= 0.25 ? 'thin'
        : 'unknown';

  return {
    band,
    known: counted.filter((item) => item.known).length,
    total: counted.length,
    dimensions,
  };
}

/**
 * The questions the workspace can see are unanswered.
 *
 * Two rules keep this from becoming a wall of noise. Nodes below a weight floor
 * are skipped entirely - a customer with one stale touch does not need nine
 * questions asked about them - and anything the operator has already answered or
 * waved away disappears, because a gap that keeps coming back after you have
 * dealt with it teaches people to stop reading the list.
 */
const GAP_NODE_WEIGHT_FLOOR = 3;
const MAX_DERIVED_GAPS = 60;

function deriveGaps(input: {
  nodes: KnowledgeNode[];
  health: Map<string, KnowledgeHealth>;
  knowledge: KnowledgeRecord[];
  resolutions: Map<string, KnowledgeRecord>;
}): KnowledgeGap[] {
  const derived: KnowledgeGap[] = [];
  for (const node of input.nodes) {
    if (node.weight < GAP_NODE_WEIGHT_FLOOR) continue;
    const health = input.health.get(node.id);
    if (!health) continue;

    for (const dimensionItem of health.dimensions) {
      if (dimensionItem.known || dimensionItem.dismissed) continue;
      // `health` has already dropped anything waved away and marked anything
      // answered as known, so a dimension still unknown here is genuinely open.
      const key = `gap:${node.id}:${dimensionItem.id}`;
      if (input.resolutions.has(key)) continue;
      derived.push({
        key,
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        question: dimensionItem.question,
        why: dimensionItem.why,
        rank: node.weight * dimensionItem.weight,
        status: 'open',
        authored: false,
      });
    }
  }

  const authored: KnowledgeGap[] = input.knowledge
    .filter((record) => record.kind === 'question' && record.status === 'open' && !record.gapKey)
    .map((record) => ({
      key: `authored:${record.id}`,
      nodeId: record.subjects[0]?.nodeId || knowledgeNodeId(record),
      nodeLabel: record.subjects[0]?.label || record.title,
      nodeType: (record.subjects[0] && nodeTypeFromId(record.subjects[0].nodeId)) || 'question',
      question: record.title,
      why: record.body || 'You raised this yourself.',
      // Deliberately ranked above every derived gap of the same node: a question
      // the operator typed out is one they already decided matters.
      rank: 1000,
      status: 'open',
      resolvedBy: record.id,
      authored: true,
    }));

  // Ranked, then trimmed, then interleaved - in that order. Interleaving first
  // is a quadratic pass over every unanswered dimension of every node in the
  // workspace (thousands at a real book size) to produce a list that is then
  // cut to sixty, and it measured as the single most expensive thing in this
  // file. Trimming to a few times the cap first leaves the result identical:
  // nothing past the cut could have reached the list anyway.
  const ranked = derived.sort((left, right) => right.rank - left.rank).slice(0, MAX_DERIVED_GAPS * 4);
  return [...authored, ...diversify(ranked).slice(0, MAX_DERIVED_GAPS)];
}

/**
 * Stops the list reading like a mail merge.
 *
 * Ranking alone puts the heaviest dimension at the top for every heavy node, so
 * the first thing an operator saw was "Who signs at A?", "Who signs at B?",
 * "Who signs at C?". Every row was true and the list was useless - three
 * identical sentences read as one sentence, and the second and third gaps that
 * actually differ were pushed below the fold.
 *
 * A greedy pass fixes it without touching the ranking: take the best remaining
 * gap whose customer has not been named yet and whose question has not already
 * been asked twice, and relax those two rules once nothing qualifies. Order
 * within the list still follows rank; only the interleaving changes.
 */
function diversify(gaps: KnowledgeGap[]): KnowledgeGap[] {
  const remaining = [...gaps];
  const ordered: KnowledgeGap[] = [];
  const nodesUsed = new Set<string>();
  const dimensionCount = new Map<string, number>();

  while (remaining.length > 0) {
    let index = remaining.findIndex((gap) => {
      const dimensionId = gap.key.split(':').pop() || '';
      return !nodesUsed.has(gap.nodeId) && (dimensionCount.get(dimensionId) || 0) < 2;
    });
    if (index === -1) index = remaining.findIndex((gap) => !nodesUsed.has(gap.nodeId));
    if (index === -1) {
      // Every node has had a turn. Start a fresh round rather than dumping the
      // rest in raw rank order, so the second gap per customer interleaves too.
      nodesUsed.clear();
      dimensionCount.clear();
      index = 0;
    }
    const [gap] = remaining.splice(index, 1);
    const dimensionId = gap.key.split(':').pop() || '';
    nodesUsed.add(gap.nodeId);
    dimensionCount.set(dimensionId, (dimensionCount.get(dimensionId) || 0) + 1);
    ordered.push(gap);
  }

  return ordered;
}

function friendlyDate(date?: string) {
  return date ? formatSafeBusinessDate(date) : '';
}

/** Only fields that were actually filled in. An empty string is a gap, not a fact. */
function cleanFacts(facts?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(facts || {})) {
    const trimmed = (value || '').trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

function dateOf(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  const date = value.slice(0, 10);
  return isValidBusinessDate(date) ? date : '';
}

function laterDate(left: string, right: string) {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

function shiftDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * The nodes that answer what was typed, best first.
 *
 * Reuses the product's one search normalizer, so a Vietnamese book stays
 * findable without the accents - the same rule the account and deal lists
 * follow. Ranked rather than filtered alone: a query that matches the label is
 * a different result from one that matches a word in a note body.
 */
export function searchKnowledgeNodes(nodes: KnowledgeNode[], query: string, limit = 40): KnowledgeNode[] {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return nodes.slice(0, limit);

  const scored: { node: KnowledgeNode; score: number }[] = [];
  for (const node of nodes) {
    const label = normalizeSearchText(node.label);
    if (!tokens.every((token) => node.searchText.includes(token))) continue;
    const startsWith = tokens.every((token) => label.startsWith(token)) ? 40 : 0;
    const inLabel = tokens.every((token) => label.includes(token)) ? 20 : 0;
    scored.push({ node, score: startsWith + inLabel + Math.min(node.weight, 20) });
  }

  return scored
    .sort((left, right) => right.score - left.score || left.node.label.localeCompare(right.node.label))
    .slice(0, limit)
    .map((entry) => entry.node);
}

/** Why a node matched, in the fewest words that are still true. */
export function describeMatch(node: KnowledgeNode, query: string): string {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return '';
  const label = normalizeSearchText(node.label);
  if (tokens.every((token) => label.includes(token))) return 'name';
  return 'mentioned in its records';
}
