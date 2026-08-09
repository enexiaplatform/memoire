import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Grid3x3, Network, Search } from 'lucide-react';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { formatCompactBaseAmount } from '../../utils/money';
import {
  describeMatch,
  knowledgeHealthBandLabels,
  knowledgeNodeTypeLabels,
  knowledgeNodeTypePlurals,
  searchKnowledgeNodes,
  type KnowledgeGap,
  type KnowledgeGraph,
  type KnowledgeNode,
  type KnowledgeNodeType,
} from '../../utils/knowledgeGraph';
import { nodeIcon, nodeVisual } from './nodeVisuals';

/**
 * The Library: what this workspace knows, arranged so it can be found.
 *
 * Not a file manager. A list of everything, alphabetically, is technically a
 * library and practically a filing cabinet nobody opens. What an operator needs
 * on arrival is four answers: what changed, what is missing, what is worth
 * looking at, and - the moment they have a name in mind - a search that finds
 * it on the first try.
 */

type Props = {
  graph: KnowledgeGraph;
  query: string;
  typeFilter: KnowledgeNodeType | 'all';
  onQueryChange: (value: string) => void;
  onTypeFilterChange: (value: KnowledgeNodeType | 'all') => void;
  onSelect: (nodeId: string) => void;
  onOpenMap: (nodeId?: string) => void;
  onAnswerGap: (gap: KnowledgeGap) => void;
  onDismissGap: (gap: KnowledgeGap) => void;
};

export function VaultLibrary({
  graph,
  query,
  typeFilter,
  onQueryChange,
  onTypeFilterChange,
  onSelect,
  onOpenMap,
  onAnswerGap,
  onDismissGap,
}: Props) {
  const pool = useMemo(
    () => (typeFilter === 'all' ? graph.nodes : graph.nodes.filter((node) => node.type === typeFilter)),
    [graph.nodes, typeFilter],
  );

  const results = useMemo(() => searchKnowledgeNodes(pool, query, 60), [pool, query]);
  const searching = query.trim().length > 0 || typeFilter !== 'all';

  const recentlyChanged = useMemo(
    () => [...graph.nodes]
      .filter((node) => node.updatedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.weight - left.weight)
      .slice(0, 6),
    [graph.nodes],
  );

  const exploring = useMemo(
    () => graph.nodes.filter((node) => node.connectionCount > 0).slice(0, 8),
    [graph.nodes],
  );

  const availableTypes = useMemo(
    () => (Object.entries(graph.counts) as [KnowledgeNodeType, number][])
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1]),
    [graph.counts],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search your business memory - a customer, a person, a product, a competitor..."
            aria-label="Search your business memory"
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-3 text-sm text-navy placeholder:text-gray-400 focus:border-brand-blue focus:outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <FilterChip active={typeFilter === 'all'} onClick={() => onTypeFilterChange('all')}>
            Everything <span className="tabular-nums opacity-60">{graph.nodes.length}</span>
          </FilterChip>
          {availableTypes.map(([type, count]) => (
            <FilterChip key={type} active={typeFilter === type} onClick={() => onTypeFilterChange(type)}>
              {nodeIcon(type, 'h-3 w-3')}
              {knowledgeNodeTypePlurals[type]} <span className="tabular-nums opacity-60">{count}</span>
            </FilterChip>
          ))}
        </div>
      </div>

      {searching ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-navy">
            {results.length === 0
              ? 'Nothing here answers that yet'
              : `${results.length} ${results.length === 1 ? 'thing' : 'things'} you know`}
          </h2>
          {results.length === 0 ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-gray-500">
              The Vault searches every customer, person, deal, product, competitor and note in this workspace, accents
              or no accents. If it is not here, nothing has been captured about it yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {results.map((node) => (
                <li key={node.id}>
                  <NodeRow node={node} graph={graph} query={query} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <MapPreview graph={graph} onOpenMap={onOpenMap} />

          <div className="grid gap-5 lg:grid-cols-2">
            <GapsPanel graph={graph} onSelect={onSelect} onAnswerGap={onAnswerGap} onDismissGap={onDismissGap} />

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-navy">Recently changed</h2>
              <p className="mt-0.5 text-xs text-gray-500">What the workspace learned most recently.</p>
              <ul className="mt-2.5 divide-y divide-gray-100">
                {recentlyChanged.map((node) => (
                  <li key={node.id}>
                    <NodeRow node={node} graph={graph} query="" onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-navy">Continue exploring</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  The most connected things you know. Open one to see its neighbourhood.
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {exploring.map((node) => (
                <ExploreCard key={node.id} node={node} graph={graph} onSelect={onSelect} />
              ))}
            </div>
          </section>

          <CoverageCard />
        </>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition ${
        active
          ? 'bg-navy text-white'
          : 'border border-gray-300 text-gray-600 hover:border-brand-blue hover:text-brand-blue'
      }`}
    >
      {children}
    </button>
  );
}

function NodeRow({
  node,
  graph,
  query,
  onSelect,
}: {
  node: KnowledgeNode;
  graph: KnowledgeGraph;
  query: string;
  onSelect: (nodeId: string) => void;
}) {
  const health = graph.health.get(node.id);
  const matched = describeMatch(node, query);

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-gray-50"
    >
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${nodeVisual(node.type).chip}`}>
        {nodeIcon(node.type, 'h-4 w-4')}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-bold text-navy group-hover:text-brand-blue">{node.label}</span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
            {knowledgeNodeTypeLabels[node.type]}
          </span>
          {matched && query && (
            <span className="text-[11px] font-semibold text-gray-400">matched on {matched}</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">
          {node.subtitle || 'No context recorded yet'}
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-3 text-right sm:flex">
        {node.valueBase > 0 && (
          <span className="text-xs font-bold text-navy">{formatCompactBaseAmount(node.valueBase)}</span>
        )}
        {health && (
          <span className="text-[11px] font-bold text-gray-400">
            {health.known}/{health.total} known
          </span>
        )}
        {node.updatedAt && (
          <span className="w-20 text-[11px] font-semibold text-gray-400">{formatSafeBusinessDate(node.updatedAt)}</span>
        )}
      </span>
    </button>
  );
}

function ExploreCard({
  node,
  graph,
  onSelect,
}: {
  node: KnowledgeNode;
  graph: KnowledgeGraph;
  onSelect: (nodeId: string) => void;
}) {
  const health = graph.health.get(node.id);
  const visual = nodeVisual(node.type);
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className="group rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-blue hover:shadow-card motion-reduce:hover:translate-y-0"
      style={{ borderLeftColor: visual.accent, borderLeftWidth: 3 }}
    >
      <span className="flex items-center gap-1.5">
        <span style={{ color: visual.accent }}>{nodeIcon(node.type, 'h-3.5 w-3.5')}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {knowledgeNodeTypeLabels[node.type]}
        </span>
      </span>
      <span className="mt-1 block truncate text-sm font-bold text-navy group-hover:text-brand-blue" title={node.label}>
        {node.label}
      </span>
      <span className="mt-1 block text-xs text-gray-500">
        {node.connectionCount} connection{node.connectionCount === 1 ? '' : 's'}
        {node.memoryCount > 0 ? ` · ${node.memoryCount} ${node.memoryCount === 1 ? 'memory' : 'memories'}` : ''}
      </span>
      {health && (
        <span className="mt-1.5 block text-[11px] font-bold text-gray-400">
          {knowledgeHealthBandLabels[health.band]} · {health.known}/{health.total} known
        </span>
      )}
    </button>
  );
}

function MapPreview({ graph, onOpenMap }: { graph: KnowledgeGraph; onOpenMap: (nodeId?: string) => void }) {
  const hubs = graph.nodes.filter((node) => node.connectionCount > 0).slice(0, 5);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-white via-white to-slate-50 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
            <Network className="h-4 w-4 text-brand-blue" />
            Your business map
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-gray-600">
            {graph.stats.nodeCount} things you know, joined by {graph.stats.edgeCount} recorded relationships. Open a
            customer and the rest of the map steps back.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenMap()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white transition hover:bg-navy/90"
        >
          Open the map <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {hubs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-gray-100 bg-white/60 px-4 py-3">
          {hubs.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onOpenMap(node.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition hover:brightness-95 ${nodeVisual(node.type).chip}`}
            >
              {nodeIcon(node.type, 'h-3 w-3')}
              {node.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function GapsPanel({
  graph,
  limit = 6,
  onSelect,
  onAnswerGap,
  onDismissGap,
}: {
  graph: KnowledgeGraph;
  limit?: number;
  onSelect: (nodeId: string) => void;
  onAnswerGap: (gap: KnowledgeGap) => void;
  onDismissGap: (gap: KnowledgeGap) => void;
}) {
  const gaps = graph.gaps.slice(0, limit);

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">Knowledge gaps</h2>
        {graph.gaps.length > limit && (
          <span className="text-xs font-semibold text-gray-500">{graph.gaps.length} in total</span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-gray-600">
        What a customer file should contain and this one does not. Ranked by what the relationship is worth.
      </p>

      {gaps.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-orange-200 bg-white px-3 py-4 text-sm text-gray-500">
          No important gaps detected. Everything the workspace knows how to ask about has an answer on record.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {gaps.map((gap) => (
            <li key={gap.key} className="rounded-lg border border-orange-100 bg-white px-3 py-2.5">
              <button
                type="button"
                onClick={() => onSelect(gap.nodeId)}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 transition hover:text-brand-blue"
              >
                {nodeIcon(gap.nodeType, 'h-3 w-3')}
                {gap.nodeLabel}
              </button>
              <p className="mt-0.5 text-sm font-semibold text-navy">{gap.question}</p>
              <p className="mt-0.5 text-xs leading-5 text-gray-500">{gap.why}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onAnswerGap(gap)}
                  className="rounded-md bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-900 ring-1 ring-inset ring-orange-200 transition hover:bg-orange-100"
                >
                  Write what you know
                </button>
                <Link
                  to={`/app/ask?question=${encodeURIComponent(gap.question)}`}
                  className="rounded-md px-2 py-1 text-[11px] font-bold text-gray-500 ring-1 ring-inset ring-gray-200 transition hover:text-brand-blue"
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
      )}
    </section>
  );
}

/**
 * The customer x line grid, which used to be the whole of this page.
 *
 * It is genuinely useful commercial planning and it is not business memory, so
 * it moved to its own surface under Accounts. It keeps a door here because
 * "which of my lines has this customer never been offered" is a knowledge gap
 * in every sense the rest of this page uses the word.
 */
function CoverageCard() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-brand-blue">
            <Grid3x3 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-navy">Portfolio coverage</h2>
            <p className="mt-0.5 max-w-xl text-sm leading-6 text-gray-600">
              Every customer against every line you carry. The squares you have never filled are the business you have
              never asked for.
            </p>
          </div>
        </div>
        <Link
          to="/app/portfolio-coverage"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-navy transition hover:border-brand-blue hover:text-brand-blue"
        >
          Open coverage <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
