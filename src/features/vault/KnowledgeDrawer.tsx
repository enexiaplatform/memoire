import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, MessageCircleQuestionMark, Minus, Plus, Search, Sparkles, X } from 'lucide-react';
import { useModalDrawer } from '../../hooks/useModalDrawer';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { formatCompactBaseAmount } from '../../utils/money';
import {
  knowledgeHealthBandLabels,
  knowledgeNodeTypeLabels,
  type KnowledgeGap,
  type KnowledgeGraph,
  type KnowledgeHealthBand,
  type KnowledgeNode,
} from '../../utils/knowledgeGraph';
import type { KnowledgeRecord } from '../../utils/knowledgeNotes';
import { nodeIcon, nodeVisual } from './nodeVisuals';

/**
 * The intelligence brief for one node.
 *
 * Deliberately not a CRUD form. Everything editable about a customer, a deal or
 * a person already has an owner surface, and this drawer links to it rather
 * than growing a second set of fields that can disagree with the first. What it
 * owns is the reading: why this matters, how well it is understood, what is
 * missing, where the knowledge came from, and what else touches it.
 *
 * The order is the argument. Health before facts, because the first honest
 * thing to say about a customer is how much of them you actually know; gaps
 * before connections, because the missing half is the half a CRM never shows.
 */

const BAND_STYLES: Record<KnowledgeHealthBand, { chip: string; bar: string }> = {
  strong: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500' },
  developing: { chip: 'bg-blue-50 text-brand-blue ring-blue-200', bar: 'bg-brand-blue' },
  thin: { chip: 'bg-amber-50 text-amber-800 ring-amber-200', bar: 'bg-amber-500' },
  unknown: { chip: 'bg-orange-50 text-orange-800 ring-orange-200', bar: 'bg-orange-500' },
};

type Props = {
  node: KnowledgeNode;
  graph: KnowledgeGraph;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
  onAnswerGap: (gap: KnowledgeGap) => void;
  onDismissGap: (gap: KnowledgeGap) => void;
  onAddKnowledge: (node: KnowledgeNode) => void;
  onShowOnMap: (nodeId: string) => void;
  /** Takes back a "not relevant", by deleting the record that carried it. */
  onRestoreDimension: (resolutionId: string) => void;
  /** Rendered as a panel beside the map instead of an overlay dialog. */
  docked: boolean;
};

export function KnowledgeDrawer({
  node,
  graph,
  onClose,
  onSelectNode,
  onAnswerGap,
  onDismissGap,
  onAddKnowledge,
  onShowOnMap,
  onRestoreDimension,
  docked,
}: Props) {
  const { ref, dialogProps } = useModalDrawer({
    onClose,
    label: `${node.label} - business memory`,
    enabled: !docked,
  });

  const health = graph.health.get(node.id);
  const memory = graph.memory.get(node.id) || [];
  const neighbors = useMemo(() => graph.neighbors.get(node.id) || [], [graph.neighbors, node.id]);
  const backlinks = graph.backlinks.get(node.id) || [];
  const gaps = useMemo(
    () => graph.gaps.filter((gap) => gap.nodeId === node.id),
    [graph.gaps, node.id],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof neighbors>();
    for (const neighbor of neighbors) {
      const list = map.get(neighbor.relation);
      if (list) list.push(neighbor);
      else map.set(neighbor.relation, [neighbor]);
    }
    return [...map.entries()].sort((left, right) => right[1].length - left[1].length);
  }, [neighbors]);

  const visual = nodeVisual(node.type);
  const question = `What do I know about ${node.label}?`;

  const body = (
    <>
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${visual.chip}`}>
                {nodeIcon(node.type, 'h-3 w-3')}
                {knowledgeNodeTypeLabels[node.type]}
              </span>
              {node.openDealCount > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-navy">
                  {node.openDealCount} live deal{node.openDealCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <h2 className="mt-1.5 truncate text-lg font-bold tracking-tight text-navy" title={node.label}>
              {node.label}
            </h2>
            {node.subtitle && <p className="mt-0.5 truncate text-xs text-gray-500" title={node.subtitle}>{node.subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {node.href && (
            <Link
              to={node.href}
              className="inline-flex items-center gap-1 rounded-lg bg-navy px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-navy/90"
            >
              Open record <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => onAddKnowledge(node)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-navy transition hover:border-brand-blue hover:text-brand-blue"
          >
            <Plus className="h-3.5 w-3.5" /> Add knowledge
          </button>
          <Link
            to={`/app/ask?question=${encodeURIComponent(question)}`}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-navy transition hover:border-brand-blue hover:text-brand-blue"
          >
            <Search className="h-3.5 w-3.5" /> Ask about this
          </Link>
          <button
            type="button"
            onClick={() => onShowOnMap(node.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-navy transition hover:border-brand-blue hover:text-brand-blue"
          >
            <Sparkles className="h-3.5 w-3.5" /> Centre the map
          </button>
        </div>
      </header>

      <div className="space-y-5 px-5 py-4">
        <Section title="Why this matters">
          <p className="text-sm leading-6 text-gray-600">{whyThisMatters(node, graph)}</p>
        </Section>

        {health && (
          <Section title="Knowledge health">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${BAND_STYLES[health.band].chip}`}>
                {knowledgeHealthBandLabels[health.band]}
              </span>
              <span className="text-xs font-semibold text-gray-500">
                {health.known} of {health.total} things worth knowing are written down
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${BAND_STYLES[health.band].bar}`}
                style={{ width: `${Math.round((health.known / Math.max(health.total, 1)) * 100)}%` }}
              />
            </div>

            <ul className="mt-3 space-y-1.5">
              {health.dimensions.map((dimension) => (
                <li key={dimension.id} className="flex items-start gap-2 text-xs">
                  {dimension.dismissed ? (
                    <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  ) : dimension.known ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <MessageCircleQuestionMark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                  )}
                  <span className={dimension.known ? 'text-gray-700' : 'text-gray-500'}>
                    <span className={`font-semibold ${dimension.dismissed ? 'text-gray-400' : ''}`}>{dimension.label}</span>
                    {dimension.known && dimension.answer && <span className="text-gray-500"> — {dimension.answer}</span>}
                    {!dimension.known && !dimension.dismissed && <span className="text-gray-400"> — not recorded</span>}
                    {/* A dismissal is shown, not hidden. The operator decided
                        this question does not apply here, and a decision they
                        cannot see is one they cannot take back. */}
                    {dimension.dismissed && (
                      <>
                        <span className="text-gray-400"> — not relevant here · </span>
                        {dimension.resolutionId && (
                          <button
                            type="button"
                            onClick={() => onRestoreDimension(dimension.resolutionId!)}
                            className="ml-1.5 font-bold text-gray-400 underline transition hover:text-brand-blue"
                          >
                            restore
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {gaps.length > 0 && (
          <Section title={`Knowledge gaps (${gaps.length})`}>
            <ul className="space-y-2">
              {gaps.map((gap) => (
                <li key={gap.key} className="rounded-lg border border-orange-200 bg-orange-50/60 px-3 py-2.5">
                  <p className="text-sm font-semibold text-navy">{gap.question}</p>
                  <p className="mt-0.5 text-xs leading-5 text-gray-600">{gap.why}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAnswerGap(gap)}
                      className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-navy ring-1 ring-inset ring-orange-300 transition hover:bg-orange-100"
                    >
                      Write what you know
                    </button>
                    <Link
                      to={`/app/ask?question=${encodeURIComponent(gap.question)}`}
                      className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-gray-600 ring-1 ring-inset ring-gray-300 transition hover:text-brand-blue"
                    >
                      Ask Memoire
                    </Link>
                    <button
                      type="button"
                      onClick={() => onDismissGap(gap)}
                      className="rounded-md px-2 py-1 text-[11px] font-bold text-gray-400 transition hover:text-gray-600"
                    >
                      Not relevant
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {grouped.length > 0 && (
          <Section title={`Connected knowledge (${neighbors.length})`}>
            <div className="space-y-3">
              {grouped.map(([relation, items]) => (
                <div key={relation}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{relation}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {items.slice(0, 12).map((neighbor) => (
                      <button
                        key={neighbor.edge.id}
                        type="button"
                        onClick={() => onSelectNode(neighbor.node.id)}
                        className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition hover:brightness-95 ${nodeVisual(neighbor.node.type).chip}`}
                      >
                        {nodeIcon(neighbor.node.type, 'h-3 w-3 shrink-0')}
                        <span className="truncate">{neighbor.node.label}</span>
                      </button>
                    ))}
                    {items.length > 12 && (
                      <span className="self-center text-xs font-semibold text-gray-400">+{items.length - 12} more</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {memory.length > 0 && (
          <Section title={`Recent memory (${memory.length})`}>
            <ol className="space-y-2.5">
              {memory.slice(0, 8).map((entry) => (
                <li key={entry.id} className="border-l-2 border-gray-200 pl-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                      {entry.date ? formatSafeBusinessDate(entry.date) : 'Undated'}
                    </span>
                    <span className="text-[11px] font-semibold text-gray-500">{entry.label}</span>
                  </div>
                  {entry.href ? (
                    <Link to={entry.href} className="mt-0.5 block text-sm font-semibold text-navy hover:text-brand-blue hover:underline">
                      {entry.title}
                    </Link>
                  ) : (
                    <p className="mt-0.5 text-sm font-semibold text-navy">{entry.title}</p>
                  )}
                  {entry.detail && <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-500">{entry.detail}</p>}
                </li>
              ))}
            </ol>
            {memory.length > 8 && (
              <p className="mt-2 text-xs text-gray-400">{memory.length - 8} older entries are in the Timeline tab.</p>
            )}
          </Section>
        )}

        {backlinks.length > 0 && (
          <Section title="Mentioned in">
            <ul className="space-y-1.5">
              {backlinks.map((record) => (
                <li key={record.id}>
                  <BacklinkRow record={record} onSelect={onSelectNode} />
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  );

  if (docked) {
    return (
      <aside
        aria-label={`${node.label} - business memory`}
        className="hidden h-full w-[360px] shrink-0 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm 2xl:block"
      >
        {body}
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close business memory"
        className="absolute inset-0 bg-navy/25 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        ref={ref as React.RefObject<HTMLElement>}
        {...dialogProps}
        className="relative h-full w-full max-w-[440px] overflow-y-auto bg-white shadow-elevated"
      >
        {body}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function BacklinkRow({ record, onSelect }: { record: KnowledgeRecord; onSelect: (nodeId: string) => void }) {
  const nodeId = `${record.kind === 'question' ? 'question' : 'note'}:${record.id}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(nodeId)}
      className="w-full rounded-md px-2 py-1.5 text-left transition hover:bg-gray-50"
    >
      <span className="text-sm font-semibold text-navy">{record.title}</span>
      <span className="ml-2 text-[11px] font-semibold text-gray-400">{record.relation}</span>
    </button>
  );
}

/**
 * One paragraph, assembled from what is on the record.
 *
 * Nothing here is generated prose about the business - every clause is a count
 * or a field this workspace holds, so the sentence cannot claim more than the
 * data does.
 */
function whyThisMatters(node: KnowledgeNode, graph: KnowledgeGraph): string {
  const parts: string[] = [];
  const neighbors = graph.neighbors.get(node.id) || [];
  const memory = graph.memory.get(node.id) || [];

  if (node.valueBase > 0) {
    parts.push(`${formatCompactBaseAmount(node.valueBase)} of recorded deal value sits behind this`);
  }
  if (node.openDealCount > 0) {
    parts.push(`${node.openDealCount} deal${node.openDealCount === 1 ? ' is' : 's are'} live`);
  }
  if (memory.length > 0) {
    const newest = memory[0];
    parts.push(`${memory.length} record${memory.length === 1 ? '' : 's'} mention it, the newest on ${newest.date ? formatSafeBusinessDate(newest.date) : 'an undated entry'}`);
  }
  if (neighbors.length > 0) {
    parts.push(`it connects to ${neighbors.length} other thing${neighbors.length === 1 ? '' : 's'} you know`);
  }

  if (parts.length === 0) {
    return 'Nothing else in this workspace refers to it yet. Capture a touch or write down what you know and it will start connecting.';
  }

  return `${capitalize(parts.join(', '))}.`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
