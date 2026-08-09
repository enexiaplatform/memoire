import { useMemo } from 'react';
import { Network } from 'lucide-react';
import type { GraphView } from '../../utils/knowledgeLayout';
import { knowledgeNodeTypeLabels } from '../../utils/knowledgeGraph';
import { nodeIcon, nodeVisual } from './nodeVisuals';

/**
 * The map, read as a list.
 *
 * Two jobs, one component.
 *
 * On a phone, a graph is the wrong shape. Fitted into 341px the node titles
 * render at under 8px - measured, not guessed - and zooming in shows two cards
 * at a time, so exploring means dragging blind. This shows the same
 * neighbourhood the map would draw, in the same order, grouped by the same
 * relations, in type you can actually read.
 *
 * It is also the graph's accessible equivalent. A canvas of positioned nodes
 * can carry labels and focus states and still be a poor way to read a
 * structure; this is the same content as ordinary rows, and it is what the
 * Map view offers anyone who is not looking at a wide screen.
 */
export function MapAsList({
  view,
  focusLabel,
  onSelect,
}: {
  view: GraphView;
  focusLabel?: string;
  onSelect: (nodeId: string) => void;
}) {
  const fallbackGroup = focusLabel ? 'Also on the map' : 'Most connected';
  const groups = useMemo(() => {
    const focus = view.nodes.find((node) => node.focused);
    const rest = view.nodes.filter((node) => !node.focused);
    const byRelation = new Map<string, typeof rest>();
    for (const node of rest) {
      const key = node.relation || fallbackGroup;
      const list = byRelation.get(key);
      if (list) list.push(node);
      else byRelation.set(key, [node]);
    }
    return {
      focus,
      groups: [...byRelation.entries()].sort((left, right) => right[1].length - left[1].length),
    };
  }, [view.nodes, fallbackGroup]);

  if (view.nodes.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500">Nothing is connected yet. Capture a conversation and the map starts here.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
        <Network className="h-4 w-4 text-brand-blue" />
        {focusLabel ? `Around ${focusLabel}` : 'The most connected parts of your business'}
      </h2>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        {focusLabel
          ? `${view.shownNeighborCount} of ${view.neighborCount} recorded relationships. Tap one to move to it.`
          : 'Tap anything to see what it connects to. The drawn map opens on a wider screen.'}
      </p>

      <div className="mt-3 space-y-3">
        {groups.groups.map(([relation, nodes]) => (
          <div key={relation}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{relation}</p>
            <ul className="mt-1 space-y-1">
              {nodes.map((positioned) => (
                <li key={positioned.node.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(positioned.node.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-gray-200 px-2.5 py-2 text-left transition hover:border-brand-blue"
                  >
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${nodeVisual(positioned.node.type).chip}`}>
                      {nodeIcon(positioned.node.type, 'h-3.5 w-3.5')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-navy">{positioned.node.label}</span>
                      <span className="block text-[11px] text-gray-500">
                        {knowledgeNodeTypeLabels[positioned.node.type]}
                        {positioned.node.connectionCount > 0
                          ? ` · ${positioned.node.connectionCount} link${positioned.node.connectionCount === 1 ? '' : 's'}`
                          : ''}
                        {positioned.node.memoryCount > 0
                          ? ` · ${positioned.node.memoryCount} ${positioned.node.memoryCount === 1 ? 'memory' : 'memories'}`
                          : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
