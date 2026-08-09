import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { todayDateKey } from '../../utils/safeDate';
import { searchKnowledgeNodes, type KnowledgeGraph, type KnowledgeNode } from '../../utils/knowledgeGraph';
import {
  createKnowledgeRecordId,
  knowledgeNoteTypeLabels,
  knowledgeNoteTypes,
  type KnowledgeEvidenceRef,
  type KnowledgeRecord,
} from '../../utils/knowledgeNotes';
import { nodeIcon, nodeVisual } from './nodeVisuals';

/**
 * Writing something down, in under thirty seconds.
 *
 * Deliberately not a document editor. A commercial operator writing "they will
 * not qualify a second supplier until the Annex 1 audit closes" wants to type
 * one sentence, say who it is about, and get back to work - and a rich-text
 * canvas turns that into a decision about formatting.
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
  const [subjects, setSubjects] = useState<KnowledgeNode[]>(seedSubject ? [seedSubject] : []);
  const [subjectQuery, setSubjectQuery] = useState('');
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

  const reset = () => {
    setTitle('');
    setBody('');
    setNoteType('insight');
    setSubjects([]);
    setSubjectQuery('');
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
      subjects: subjects.map((node) => ({ nodeId: node.id, label: node.label })),
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
            placeholder={isQuestion
              ? 'Who signs off capital purchases at this account?'
              : 'They will not qualify a second supplier until the audit closes'}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-navy focus:border-brand-blue focus:outline-none"
          />
        </div>

        <div>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">What is it about?</span>
          {subjects.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {subjects.map((node) => (
                <span
                  key={node.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${nodeVisual(node.type).chip}`}
                >
                  {nodeIcon(node.type, 'h-3 w-3')}
                  {node.label}
                  <button
                    type="button"
                    aria-label={`Remove ${node.label}`}
                    onClick={() => setSubjects((current) => current.filter((item) => item.id !== node.id))}
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
                .filter((node) => !subjects.some((subject) => subject.id === node.id))
                .map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      setSubjects((current) => [...current, node]);
                      setSubjectQuery('');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 transition hover:border-brand-blue hover:text-brand-blue"
                  >
                    <Plus className="h-3 w-3" />
                    {node.label}
                  </button>
                ))}
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
              placeholder="Said in the QA meeting, 8 Aug"
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
