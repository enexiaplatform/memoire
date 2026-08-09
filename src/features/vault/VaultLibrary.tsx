import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, Clock, CircleQuestionMark, Grid3x3, Network, Waypoints } from 'lucide-react';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { formatCompactBaseAmount } from '../../utils/money';
import {
  describeMatch,
  knowledgeNodeTypeLabels,
  knowledgeNodeTypePlurals,
  searchKnowledgeNodes,
  type KnowledgeGap,
  type KnowledgeGraph,
  type KnowledgeNode,
  type KnowledgeNodeType,
} from '../../utils/knowledgeGraph';
import { buildGraphView } from '../../utils/knowledgeLayout';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';
import { nodeIcon, nodeVisual } from './nodeVisuals';

/**
 * The Library: what this workspace knows, arranged so it can be found.
 *
 * Not a file manager. A list of everything, alphabetically, is technically a
 * library and practically a filing cabinet nobody opens. What an operator needs
 * on arrival is four answers - what the business looks like, what changed, what
 * is missing, and what is worth opening next - and then, the moment they have a
 * name in mind, a search that finds it on the first try.
 *
 * The map is live here rather than a card advertising one. A picture of a map
 * with a button under it asks the operator to take a step before they have been
 * given a reason to; the real thing, small, gives them the reason and the step
 * at once. It is deliberately reduced - seven relations, no second ring, pills
 * instead of cards - because this is a way in, and the Map tab is where the
 * business is actually studied.
 */

type Props = {
  graph: KnowledgeGraph;
  query: string;
  typeFilter: KnowledgeNodeType | 'all';
  selectedId: string;
  /**
   * Whether this screen is wide enough for a drawn map.
   *
   * The same signal the Map tab uses. Measured on a 375px phone the inline
   * canvas fits to 341x300, which puts node titles at 6.8px and clips three of
   * eight off the sides - a picture of a map that cannot be read or used. The
   * doors it offers are the same ones "Continue exploring" lists as text right
   * below, so on a phone the panel keeps its heading and drops the canvas.
   */
  canDrawMap: boolean;
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
  selectedId,
  canDrawMap,
  onTypeFilterChange,
  onSelect,
  onOpenMap,
  onAnswerGap,
  onDismissGap,
}: Props) {
  const searching = query.trim().length > 0;

  const pool = useMemo(
    () => (typeFilter === 'all' ? graph.nodes : graph.nodes.filter((node) => node.type === typeFilter)),
    [graph.nodes, typeFilter],
  );
  const results = useMemo(() => searchKnowledgeNodes(pool, query, 60), [pool, query]);

  const recentlyChanged = useMemo(
    () => [...graph.nodes]
      .filter((node) => node.updatedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.weight - left.weight)
      .slice(0, 5),
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

  const mapView = useMemo(
    () => (canDrawMap ? buildGraphView({ graph, focusId: selectedId || undefined, compact: true }) : null),
    [graph, selectedId, canDrawMap],
  );

  if (searching) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* The map and the four counts, side by side. The counts read as a column
          beside the picture rather than a banner above it, which is what stops
          the page opening on a row of numbers before it has shown anything. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2 pt-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
                <Network className="h-4 w-4 text-brand-blue" />
                Your business map
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {selectedId && graph.byId.get(selectedId)
                  ? `Around ${graph.byId.get(selectedId)!.label}. Open the full map to go further out.`
                  : 'Explore how customers, products, people and opportunities connect.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenMap()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-navy transition hover:border-brand-blue hover:text-brand-blue"
            >
              Open full map <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {mapView ? (
            <div className="h-[300px] w-full">
              <KnowledgeGraphCanvas
                compact
                view={mapView}
                focusId={selectedId}
                onSelect={onSelect}
                summary={`Knowledge map${selectedId && graph.byId.get(selectedId) ? ` centred on ${graph.byId.get(selectedId)!.label}` : ''}, showing ${mapView.nodes.length} related things. The list below is the same content as text.`}
              />
            </div>
          ) : (
            <p className="px-4 pb-4 text-xs leading-5 text-gray-500">
              {graph.stats.nodeCount} things you know, joined by {graph.stats.edgeCount} recorded relationships. The
              drawn map needs a wider screen - open it from the Map tab to read the same neighbourhood as a list.
            </p>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <StatCard
            icon={<Waypoints className="h-4 w-4" />}
            tone="blue"
            label="Knowledge nodes"
            value={graph.stats.nodeCount}
            hint="Customers, people, products, notes"
          />
          <StatCard
            icon={<CircleQuestionMark className="h-4 w-4" />}
            tone="orange"
            label="Open knowledge gaps"
            value={graph.stats.openGapCount}
            hint="Things worth knowing, unrecorded"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            tone="emerald"
            label="Recently updated"
            value={graph.stats.changedThisWeek}
            hint="In the last 7 days"
          />
          <StatCard
            icon={<Network className="h-4 w-4" />}
            tone="violet"
            label="Active connections"
            value={graph.stats.edgeCount}
            hint="Recorded relationships"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
            <Clock className="h-4 w-4 text-brand-blue" />
            Recently changed
          </h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {recentlyChanged.map((node) => (
              <li key={node.id}>
                <NodeRow node={node} graph={graph} query="" onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>

        <GapsPanel graph={graph} onSelect={onSelect} onAnswerGap={onAnswerGap} onDismissGap={onDismissGap} />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-navy">Continue exploring</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          The most connected things you know. Open one to see its neighbourhood.
        </p>
        {/* One scrolling row rather than a grid: these are doors, and a grid of
            eight equal cards reads as a decision to make. */}
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {exploring.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 py-2 pl-2.5 pr-2 text-left transition hover:border-brand-blue hover:shadow-sm"
            >
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${nodeVisual(node.type).chip}`}>
                {nodeIcon(node.type, 'h-3.5 w-3.5')}
              </span>
              <span className="max-w-[150px] truncate text-sm font-bold text-navy group-hover:text-brand-blue">
                {node.label}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-brand-blue" />
            </button>
          ))}
        </div>
      </section>

      <CoverageCard />
    </div>
  );
}

const STAT_TONES: Record<string, string> = {
  blue: 'bg-blue-50 text-brand-blue',
  orange: 'bg-orange-50 text-orange-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  violet: 'bg-violet-50 text-violet-700',
};

function StatCard({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  tone: keyof typeof STAT_TONES;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-2xl font-black leading-tight tabular-nums text-navy">{value}</p>
        <p className="text-[11px] leading-4 text-gray-500">{hint}</p>
      </div>
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

export function GapsPanel({
  graph,
  limit = 5,
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
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
          <CircleQuestionMark className="h-4 w-4 text-orange-500" />
          Knowledge gaps
        </h2>
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
