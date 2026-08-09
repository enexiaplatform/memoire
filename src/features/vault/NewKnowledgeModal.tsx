import { useMemo, useState } from 'react';
import { Check, CornerDownLeft, Plus, X } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { todayDateKey } from '../../utils/safeDate';
import {
  authorableNodeTypes,
  authorableNodeTypeHints,
  authoredNodeId,
  knowledgeNodeTypeLabels,
  searchKnowledgeNodes,
  type AuthorableNodeType,
  type KnowledgeGraph,
} from '../../utils/knowledgeGraph';
import {
  createKnowledgeRecordId,
  knowledgeNoteTypeLabels,
  knowledgeNoteTypes,
  type KnowledgeEvidenceRef,
  type KnowledgeRecord,
} from '../../utils/knowledgeNotes';
import { nodeIcon, nodeVisual } from './nodeVisuals';

/**
 * A subject the operator is about to bring into existence.
 *
 * Held apart from a `KnowledgeNode` because it does not exist yet: it has no
 * weight, no connections and no memory, and pretending otherwise would mean
 * building a fake node just to render a chip.
 */
type DraftSubject = {
  nodeId: string;
  label: string;
  type: AuthorableNodeType;
  typeLabel?: string;
};

/**
 * Writing something down, in under thirty seconds.
 *
 * Deliberately not a document editor. A commercial operator writing "they
 * always buy through the parent company" wants to type one sentence, say who
 * it is about, and get back to work - and a rich-text canvas turns that into a
 * decision about formatting.
 *
 * Two fields are required and everything else has a sensible default, because
 * the failure mode of a knowledge system is not badly-structured notes, it is
 * notes nobody wrote.
 */

export type KnowledgePrefill = {
  kind: KnowledgeRecord['kind'];
  title?: string;
  subjectNodeId?: string;
  gapKey?: string;
  evidence?: KnowledgeEvidenceRef[];
};

type Props = {
  open: boolean;
  graph: KnowledgeGraph;
  prefill: KnowledgePrefill | null;
  onClose: () => void;
  onSave: (record: KnowledgeRecord) => void;
};

export function NewKnowledgeModal({ open, graph, prefill, onClose, onSave }: Props) {
  const seedSubject = prefill?.subjectNodeId ? graph.byId.get(prefill.subjectNodeId) : undefined;

  const [title, setTitle] = useState(prefill?.title || '');
  const [body, setBody] = useState('');
  const [noteType, setNoteType] = useState<KnowledgeRecord['noteType']>('insight');
  const [subjects, setSubjects] = useState<DraftSubject[]>(
    seedSubject
      ? [{ nodeId: seedSubject.id, label: seedSubject.label, type: 'topic' }]
      : [],
  );
  const [subjectQuery, setSubjectQuery] = useState('');
  const [creatingType, setCreatingType] = useState<AuthorableNodeType | null>(null);
  const [customTypeLabel, setCustomTypeLabel] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayDateKey());
  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [error, setError] = useState('');

  const isQuestion = prefill?.kind === 'question';

  const suggestions = useMemo(() => {
    if (!subjectQuery.trim()) {
      return graph.nodes.filter((node) => node.type !== 'note' && node.type !== 'question').slice(0, 6);
    }
    return searchKnowledgeNodes(
      graph.nodes.filter((node) => node.type !== 'note' && node.type !== 'question'),
      subjectQuery,
      8,
    );
  }, [graph.nodes, subjectQuery]);

  const trimmedQuery = subjectQuery.trim();
  const alreadyNamed = useMemo(
    () => graph.nodes.some((node) => node.label.toLowerCase() === trimmedQuery.toLowerCase())
      || subjects.some((subject) => subject.label.toLowerCase() === trimmedQuery.toLowerCase()),
    [graph.nodes, subjects, trimmedQuery],
  );
  const canCreate = trimmedQuery.length > 1 && !alreadyNamed;

  const addDraftSubject = () => {
    if (!creatingType || !trimmedQuery) return;
    const typeLabel = creatingType === 'topic' ? customTypeLabel.trim() : '';
    setSubjects((current) => [...current, {
      nodeId: authoredNodeId(creatingType, trimmedQuery),
      label: trimmedQuery,
      type: creatingType,
      typeLabel: typeLabel || undefined,
    }]);
    setSubjectQuery('');
    setCreatingType(null);
    setCustomTypeLabel('');
  };

  const reset = () => {
    setTitle('');
    setBody('');
    setNoteType('insight');
    setSubjects([]);
    setSubjectQuery('');
    setCreatingType(null);
    setCustomTypeLabel('');
    setOccurredAt(todayDateKey());
    setEvidenceLabel('');
    setError('');
  };

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Give it a title - one sentence is enough.');
      return;
    }
    if (subjects.length === 0) {
      // Knowledge with no subject is a diary entry: it can never be found from
      // the customer it is about, which is the only way anyone would look for it.
      setError('Say what this is about. Pick at least one customer, product or person.');
      return;
    }

    const now = new Date().toISOString();
    const evidence: KnowledgeEvidenceRef[] = evidenceLabel.trim()
      ? [{ kind: 'stated', id: '', label: evidenceLabel.trim(), date: occurredAt }]
      : (prefill?.evidence || []);

    onSave({
      id: createKnowledgeRecordId(),
      kind: prefill?.kind || 'note',
      noteType,
      title: trimmed,
      body: body.trim(),
      subjects: subjects.map((subject) => ({
        nodeId: subject.nodeId,
        label: subject.label,
        typeLabel: subject.typeLabel,
      })),
      relation: isQuestion ? 'open question at' : relationForType(noteType),
      evidence,
      status: isQuestion ? 'open' : 'answered',
      gapKey: prefill?.gapKey,
      occurredAt,
      tags: [],
      createdAt: now,
      updatedAt: now,
      // The workspace tag is applied by the page, which is the only place that
      // knows whether this is the demo sandbox.
    });
    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => { reset(); onClose(); }}
      title={isQuestion ? 'Raise an open question' : 'Add business knowledge'}
      size="lg"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="knowledge-title" className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {isQuestion ? 'What do you need to find out?' : 'What did you learn?'}
          </label>
          <input
            id="knowledge-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            /*
             * The example a new operator reads before writing anything, so it
             * has to be true of B2B in general rather than of one trade.
             *
             * It used to read "they will not qualify a second supplier until
             * the audit closes". That is a real sentence and it belongs to
             * regulated manufacturing; to anyone selling software, machinery or
             * services it teaches that this box is for somebody else's job.
             * Buying through a parent company happens everywhere.
             */
            placeholder={isQuestion
              ? 'Who signs off a purchase this size here?'
              : 'Procurement runs through the parent company, not the site'}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-navy focus:border-brand-blue focus:outline-none"
          />
        </div>

        <div>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">What is it about?</span>
          {subjects.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {subjects.map((subject) => (
                <span
                  key={subject.nodeId}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${nodeVisual(existingType(graph, subject)).chip}`}
                >
                  {nodeIcon(existingType(graph, subject), 'h-3 w-3')}
                  {subject.label}
                  {subject.typeLabel && <span className="font-normal opacity-70">{subject.typeLabel}</span>}
                  <button
                    type="button"
                    aria-label={`Remove ${subject.label}`}
                    onClick={() => setSubjects((current) => current.filter((item) => item.nodeId !== subject.nodeId))}
                    className="rounded-full p-0.5 transition hover:bg-white/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            value={subjectQuery}
            onChange={(event) => setSubjectQuery(event.target.value)}
            placeholder="Search customers, people, products, competitors..."
            aria-label="Search for what this knowledge is about"
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-navy focus:border-brand-blue focus:outline-none"
          />
          {suggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestions
                .filter((node) => !subjects.some((subject) => subject.nodeId === node.id))
                .map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      setSubjects((current) => [...current, { nodeId: node.id, label: node.label, type: 'topic' }]);
                      setSubjectQuery('');
                      setCreatingType(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 transition hover:border-brand-blue hover:text-brand-blue"
                  >
                    <Plus className="h-3 w-3" />
                    {node.label}
                  </button>
                ))}
            </div>
          )}

          {/*
            * Writing down something the workspace has never heard of.
            *
            * Until now a subject could only be picked from what already
            * existed, which quietly meant the Vault could hold knowledge about
            * customers and deals and nothing else: the standard a customer has
            * to meet, the job your product does for them, the plant you are
            * selling into - none of those has a record anywhere in the product,
            * so none of them could be named at all.
            *
            * Customers, people and deals are deliberately absent from the type
            * list. They have surfaces that create them, and a second door onto
            * the same thing is how a workspace ends up with two of a customer.
            */}
          {canCreate && (
            <div className="mt-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/70 p-2.5">
              <p className="text-xs font-semibold text-gray-600">
                Nothing here is called &ldquo;{subjectQuery.trim()}&rdquo;. What kind of thing is it?
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {authorableNodeTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCreatingType(type)}
                    aria-pressed={creatingType === type}
                    title={authorableNodeTypeHints[type]}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition ${
                      creatingType === type
                        ? 'bg-navy text-white'
                        : 'border border-gray-300 bg-white text-gray-600 hover:border-brand-blue hover:text-brand-blue'
                    }`}
                  >
                    {nodeIcon(type, 'h-3 w-3')}
                    {type === 'topic' ? 'Something else' : knowledgeNodeTypeLabels[type]}
                  </button>
                ))}
              </div>

              {creatingType && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] leading-4 text-gray-500">{authorableNodeTypeHints[creatingType]}</p>
                  {creatingType === 'topic' && (
                    <input
                      value={customTypeLabel}
                      onChange={(event) => setCustomTypeLabel(event.target.value)}
                      placeholder="What do you call this kind of thing? e.g. Tender, Trade show, Framework"
                      aria-label="Your own name for this kind of thing"
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-navy focus:border-brand-blue focus:outline-none"
                    />
                  )}
                  <button
                    type="button"
                    onClick={addDraftSubject}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white transition hover:bg-navy/90"
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    Add &ldquo;{subjectQuery.trim()}&rdquo;
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {!isQuestion && (
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Kind</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {knowledgeNoteTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNoteType(type)}
                  aria-pressed={noteType === type}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    noteType === type
                      ? 'bg-navy text-white'
                      : 'border border-gray-300 text-gray-600 hover:border-brand-blue hover:text-brand-blue'
                  }`}
                >
                  {knowledgeNoteTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="knowledge-body" className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Detail <span className="font-semibold normal-case text-gray-400">(optional)</span>
          </label>
          <textarea
            id="knowledge-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder="The context somebody reading this in six months would need."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-navy focus:border-brand-blue focus:outline-none"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="knowledge-date" className="text-xs font-bold uppercase tracking-wide text-gray-500">
              When
            </label>
            <input
              id="knowledge-date"
              type="date"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-navy focus:border-brand-blue focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="knowledge-evidence" className="text-xs font-bold uppercase tracking-wide text-gray-500">
              How you know <span className="font-semibold normal-case text-gray-400">(optional)</span>
            </label>
            <input
              id="knowledge-evidence"
              value={evidenceLabel}
              onChange={(event) => setEvidenceLabel(event.target.value)}
              placeholder="Said on the call, 8 Aug"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-navy focus:border-brand-blue focus:outline-none"
            />
          </div>
        </div>

        {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={() => { reset(); onClose(); }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-navy/90"
          >
            <Check className="h-4 w-4" />
            {isQuestion ? 'Add question' : 'Save knowledge'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The colour and icon a chip should wear.
 *
 * A subject that already exists shows its real type; one about to be created
 * shows the type just chosen for it. Reading it off the graph first matters
 * because picking an existing customer must not paint it as a topic.
 */
function existingType(graph: KnowledgeGraph, subject: DraftSubject) {
  return graph.byId.get(subject.nodeId)?.type || subject.type;
}

/** The verb the edge will carry on the map. */
function relationForType(noteType: KnowledgeRecord['noteType']) {
  return {
    insight: 'learned at',
    lesson: 'learned from',
    decision: 'decided for',
    pattern: 'pattern across',
    fact: 'true of',
    risk: 'risk at',
  }[noteType];
}
