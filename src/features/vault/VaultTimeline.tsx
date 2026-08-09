import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { KnowledgeGraph, KnowledgeMemoryEntry, KnowledgeNode } from '../../utils/knowledgeGraph';
import { nodeIcon, nodeVisual } from './nodeVisuals';

/**
 * How the knowledge got here.
 *
 * Not the activity ledger with a new coat of paint. Plan > History already
 * lists every captured touch in order, and it is the right surface for "what
 * did I do last Tuesday". This answers a different question: what did the
 * business *learn*, and when - so a deal appearing, a quote going out, an
 * objection being raised, an outcome being recorded and a note being written
 * all sit in one column, and each row names the things it changed what we know
 * about.
 */

const MAX_ENTRIES = 120;

type TimelineRow = {
  entry: KnowledgeMemoryEntry;
  nodes: KnowledgeNode[];
};

const KIND_LABELS: Record<KnowledgeMemoryEntry['kind'], string> = {
  activity: 'Touch',
  deal: 'Deal',
  quote: 'Quote',
  outcome: 'Outcome',
  objection: 'Objection',
  note: 'Knowledge',
};

const KIND_STYLES: Record<KnowledgeMemoryEntry['kind'], string> = {
  activity: 'bg-slate-100 text-navy',
  deal: 'bg-blue-50 text-brand-blue',
  quote: 'bg-cyan-50 text-cyan-800',
  outcome: 'bg-emerald-50 text-emerald-700',
  objection: 'bg-amber-50 text-amber-800',
  note: 'bg-violet-50 text-violet-700',
};

export function VaultTimeline({
  graph,
  focusNode,
  onSelect,
  onClearFocus,
}: {
  graph: KnowledgeGraph;
  focusNode?: KnowledgeNode;
  onSelect: (nodeId: string) => void;
  onClearFocus: () => void;
}) {
  const rows = useMemo(() => {
    const byEntry = new Map<string, TimelineRow>();
    const source: [string, KnowledgeMemoryEntry[]][] = focusNode
      ? [[focusNode.id, graph.memory.get(focusNode.id) || []]]
      : [...graph.memory.entries()];

    for (const [nodeId, entries] of source) {
      const node = graph.byId.get(nodeId);
      for (const entry of entries) {
        const existing = byEntry.get(entry.id);
        if (existing) {
          if (node && !existing.nodes.some((item) => item.id === node.id)) existing.nodes.push(node);
          continue;
        }
        byEntry.set(entry.id, { entry, nodes: node ? [node] : [] });
      }
    }

    return [...byEntry.values()]
      .sort((left, right) => (right.entry.date || '').localeCompare(left.entry.date || ''))
      .slice(0, MAX_ENTRIES);
  }, [graph.memory, graph.byId, focusNode]);

  const months = useMemo(() => groupByMonth(rows), [rows]);

  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <h2 className="text-lg font-bold text-navy">Nothing has happened here yet</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
          The timeline fills as the workspace records things: a touch captured, a deal opened, a quote sent, an
          objection raised, an outcome written down.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {focusNode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <span className="text-xs font-semibold text-gray-500">Showing only</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${nodeVisual(focusNode.type).chip}`}>
            {nodeIcon(focusNode.type, 'h-3 w-3')}
            {focusNode.label}
          </span>
          <button
            type="button"
            onClick={onClearFocus}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-gray-500 transition hover:bg-gray-100 hover:text-navy"
          >
            <X className="h-3 w-3" /> Show everything
          </button>
        </div>
      )}

      {months.map((month) => (
        <section key={month.key} className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <h2 className="sticky top-[calc(var(--app-header-h))] z-10 rounded-t-xl border-b border-gray-100 bg-white/95 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-400 backdrop-blur">
            {month.label}
            <span className="ml-2 font-semibold normal-case tracking-normal text-gray-400">
              {month.rows.length} {month.rows.length === 1 ? 'entry' : 'entries'}
            </span>
          </h2>
          <ol className="divide-y divide-gray-100">
            {month.rows.map((row) => (
              <li key={row.entry.id} className="flex gap-3 px-4 py-3">
                <div className="w-14 shrink-0 pt-0.5">
                  {/* Day and month only - the year is the section heading above,
                      and "Aug 9, 2026" truncated to six characters read
                      "Aug 9," with a comma dangling off the end of it. */}
                  <span className="block text-xs font-bold text-navy">{dayLabel(row.entry.date)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${KIND_STYLES[row.entry.kind]}`}>
                      {KIND_LABELS[row.entry.kind]}
                    </span>
                    <span className="text-[11px] font-semibold text-gray-400">{row.entry.label}</span>
                  </div>
                  {row.entry.href ? (
                    <Link to={row.entry.href} className="mt-1 block text-sm font-bold text-navy hover:text-brand-blue hover:underline">
                      {row.entry.title}
                    </Link>
                  ) : (
                    <p className="mt-1 text-sm font-bold text-navy">{row.entry.title}</p>
                  )}
                  {row.entry.detail && (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-500">{row.entry.detail}</p>
                  )}
                  {!focusNode && row.nodes.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {row.nodes.slice(0, 4).map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => onSelect(node.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition hover:brightness-95 ${nodeVisual(node.type).chip}`}
                        >
                          {nodeIcon(node.type, 'h-2.5 w-2.5')}
                          <span className="max-w-[160px] truncate">{node.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {rows.length >= MAX_ENTRIES && (
        <p className="text-center text-xs text-gray-400">
          Showing the {MAX_ENTRIES} most recent entries. Open a node to see only its own history.
        </p>
      )}
    </div>
  );
}

function dayLabel(date: string) {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function groupByMonth(rows: TimelineRow[]) {
  const months = new Map<string, TimelineRow[]>();
  for (const row of rows) {
    const key = row.entry.date ? row.entry.date.slice(0, 7) : 'undated';
    const list = months.get(key);
    if (list) list.push(row);
    else months.set(key, [row]);
  }

  return [...months.entries()].map(([key, monthRows]) => ({
    key,
    label: key === 'undated' ? 'No date recorded' : monthLabel(key),
    rows: monthRows,
  }));
}

function monthLabel(key: string) {
  const date = new Date(`${key}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
