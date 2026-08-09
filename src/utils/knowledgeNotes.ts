/**
 * The knowledge an operator writes down that no commercial record could prove.
 *
 * Everything else in the Business Vault is derived: accounts, deals, people,
 * products, objections and outcomes are already written somewhere, and deriving
 * them means the Vault is never a second copy of the business that can disagree
 * with the first one. But a CRM stores who, what, how much and when. It has
 * nowhere to put "they always buy through the parent company, never the site"
 * - a fact that outlives the deal it was learned on, applies to the next three,
 * and today survives only in somebody's head.
 *
 * Two shapes, one record, because they are the same thing at two stages:
 *
 *   note     - something learned. Points at what it is about, and at the
 *              record that evidences it.
 *   question - something not known yet. The Vault derives most of these from
 *              missing fields; this is the one the operator raises themselves,
 *              and it is also how a derived gap is marked answered or waved
 *              away.
 *
 * `gapKey` is the join between the two halves. A derived gap has a stable key
 * (`gap:<nodeId>:<dimension>`), and a record carrying that key is the operator's
 * standing answer to it - so the gap stops being asked without anything having
 * to edit the derivation.
 */

export const knowledgeRecordKinds = ['note', 'question'] as const;
export type KnowledgeRecordKind = (typeof knowledgeRecordKinds)[number];

/**
 * What kind of knowledge this is. Deliberately short: six words an operator
 * would actually use, not an ontology.
 */
export const knowledgeNoteTypes = ['insight', 'lesson', 'decision', 'pattern', 'fact', 'risk'] as const;
export type KnowledgeNoteType = (typeof knowledgeNoteTypes)[number];

export const knowledgeNoteTypeLabels: Record<KnowledgeNoteType, string> = {
  insight: 'Insight',
  lesson: 'Lesson learned',
  decision: 'Decision',
  pattern: 'Pattern',
  fact: 'Fact',
  risk: 'Risk',
};

/**
 * `open` and `dismissed` are about questions. A note is knowledge that already
 * exists, so it is written `answered` and nothing reads it.
 */
export const knowledgeStatuses = ['open', 'answered', 'dismissed'] as const;
export type KnowledgeStatus = (typeof knowledgeStatuses)[number];

/** What this knowledge is about. `nodeId` is a Vault node id, stable by name. */
export type KnowledgeSubjectRef = {
  nodeId: string;
  label: string;
};

export const knowledgeEvidenceKinds = ['activity', 'opportunity', 'quote', 'outcome', 'account', 'stated'] as const;
export type KnowledgeEvidenceKind = (typeof knowledgeEvidenceKinds)[number];

/**
 * Where the claim came from.
 *
 * `stated` is the honest default: the operator says so, and no record in this
 * workspace proves it. Naming that is the point - a knowledge system whose
 * claims all look equally supported is a rumour mill with better typography.
 */
export type KnowledgeEvidenceRef = {
  kind: KnowledgeEvidenceKind;
  /** The record id, empty for `stated`. */
  id: string;
  label: string;
  date: string;
};

export type KnowledgeRecord = {
  id: string;
  kind: KnowledgeRecordKind;
  noteType: KnowledgeNoteType;
  title: string;
  body: string;
  subjects: KnowledgeSubjectRef[];
  /**
   * How this knowledge relates to its subjects, in words that read on an edge:
   * "learned at", "applies to", "still unknown at". Never "connected to" where
   * a truer verb exists.
   */
  relation: string;
  evidence: KnowledgeEvidenceRef[];
  status: KnowledgeStatus;
  /** Set when this record answers, or waves away, a gap the Vault derived. */
  gapKey?: string;
  /** The date the knowledge is about, not the date it was typed. */
  occurredAt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  __deleted?: boolean;
};

export function createKnowledgeRecordId() {
  return `kn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeKnowledgeRecord(value: unknown): KnowledgeRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<KnowledgeRecord>;
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
  // A record with no title is not knowledge, it is a blank row. Dropping it here
  // is what stops a half-submitted form becoming a permanent empty node.
  if (!title) return null;

  const now = new Date().toISOString();
  const kind = knowledgeRecordKinds.find((item) => item === candidate.kind) || 'note';

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createKnowledgeRecordId(),
    kind,
    noteType: knowledgeNoteTypes.find((item) => item === candidate.noteType) || 'insight',
    title,
    body: typeof candidate.body === 'string' ? candidate.body : '',
    subjects: sanitizeSubjects(candidate.subjects),
    relation: typeof candidate.relation === 'string' && candidate.relation.trim()
      ? candidate.relation.trim()
      : (kind === 'question' ? 'open question at' : 'learned at'),
    evidence: sanitizeEvidence(candidate.evidence),
    status: knowledgeStatuses.find((item) => item === candidate.status)
      || (kind === 'question' ? 'open' : 'answered'),
    gapKey: typeof candidate.gapKey === 'string' && candidate.gapKey ? candidate.gapKey : undefined,
    occurredAt: typeof candidate.occurredAt === 'string' ? candidate.occurredAt : '',
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())).map((tag) => tag.trim())
      : [],
    createdAt: typeof candidate.createdAt === 'string' && candidate.createdAt ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : now,
    source: candidate.source === 'demo' ? 'demo' : candidate.source === 'user' ? 'user' : undefined,
    isSample: candidate.isSample === true ? true : undefined,
    __deleted: candidate.__deleted === true ? true : undefined,
  };
}

function sanitizeSubjects(value: unknown): KnowledgeSubjectRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const subject = entry as Partial<KnowledgeSubjectRef>;
    const nodeId = typeof subject.nodeId === 'string' ? subject.nodeId.trim() : '';
    if (!nodeId || seen.has(nodeId)) return [];
    seen.add(nodeId);
    return [{
      nodeId,
      label: typeof subject.label === 'string' && subject.label.trim() ? subject.label.trim() : nodeId,
    }];
  });
}

function sanitizeEvidence(value: unknown): KnowledgeEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const evidence = entry as Partial<KnowledgeEvidenceRef>;
    const label = typeof evidence.label === 'string' ? evidence.label.trim() : '';
    if (!label) return [];
    return [{
      kind: knowledgeEvidenceKinds.find((item) => item === evidence.kind) || 'stated',
      id: typeof evidence.id === 'string' ? evidence.id : '',
      label,
      date: typeof evidence.date === 'string' ? evidence.date : '',
    }];
  });
}
