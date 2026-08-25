import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, ListTree, Network, Plus, Search, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { getCachedSalesWorkspaceData, loadSalesWorkspaceData, type SalesWorkspaceData } from '../../services/workspaceData';
import { deleteKnowledgeNote, loadKnowledgeNotes, loadKnowledgeNotesForWorkspace, saveKnowledgeNote } from '../../services/knowledgeNoteStore';
import { buildAccountAliasIndex } from '../../utils/accountAliases';
import { buildKnowledgeGraph, knowledgeNodeTypePlurals, type KnowledgeGap, type KnowledgeNodeType } from '../../utils/knowledgeGraph';
import { buildGraphView, buildReplayView } from '../../utils/knowledgeLayout';
import { motionLegend } from '../../utils/vaultMotion';
import { buildReplayTimeline, canReplay, revealedAt } from '../../utils/vaultReplay';
import { VaultReplayButton, VaultReplayControl } from './VaultReplayControl';
import {
  createKnowledgeRecordId,
  type KnowledgeRecord,
} from '../../utils/knowledgeNotes';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';
import { PageContainer, PageHeader } from '../../components/layout/PageFrame';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';
import { KnowledgeDrawer } from './KnowledgeDrawer';
import { NewKnowledgeModal, type KnowledgePrefill } from './NewKnowledgeModal';
import { VaultLibrary } from './VaultLibrary';
import { VaultTimeline } from './VaultTimeline';
import { MapAsList } from './MapAsList';
import { nodeIcon, nodeVisual } from './nodeVisuals';

/**
 * The Business Vault: persistent business memory.
 *
 * What this page used to be, and why it changed. Until 2026-08-09 it drew a
 * customer x line coverage matrix - genuinely useful commercial planning, and
 * not a vault. It answered "which squares have I never filled", which is one
 * good question, and it had no answer at all for the question the name
 * promises: what does this business know?
 *
 * A CRM records who, what, how much and when. Those four are already covered by
 * Accounts, Opportunities, Orders and Plan. What no surface here held was the
 * other half of an operator's knowledge - why things are the way they are, how
 * they connect, what has been learned, what the evidence was, and what is still
 * unknown. That half lives in people's heads and leaves when they do.
 *
 * So the Vault is now three readings of one derived graph:
 *
 *   Library   what you know, searchable, with what changed and what is missing.
 *   Map       how it connects, one neighbourhood at a time.
 *   Timeline  how the knowledge arrived.
 *
 * The coverage matrix was not deleted. It moved to /app/portfolio-coverage
 * under Accounts, where a grid of customers against lines belongs, and the
 * Library links to it.
 */

type VaultView = 'library' | 'map' | 'timeline';

const VIEWS: { id: VaultView; label: string; icon: (className: string) => React.ReactNode }[] = [
  { id: 'library', label: 'Library', icon: (className) => <ListTree className={className} /> },
  { id: 'map', label: 'Map', icon: (className) => <Network className={className} /> },
  { id: 'timeline', label: 'Timeline', icon: (className) => <Layers className={className} /> },
];

export function BusinessVaultPage() {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const cachedWorkspace = getCachedSalesWorkspaceData(dataUserId);
  const [workspace, setWorkspace] = useState<SalesWorkspaceData | null>(cachedWorkspace);
  const [knowledge, setKnowledge] = useState<KnowledgeRecord[]>(() => loadKnowledgeNotes());
  const [searchParams, setSearchParams] = useSearchParams();
  const [typeFilter, setTypeFilter] = useState<KnowledgeNodeType | 'all'>('all');
  const [hiddenTypes, setHiddenTypes] = useState<Set<KnowledgeNodeType>>(() => new Set());
  const [prefill, setPrefill] = useState<KnowledgePrefill | null>(null);
  const [wideEnoughToDock, setWideEnoughToDock] = useState(() => matches('(min-width: 1536px)'));
  const [wideEnoughToDraw, setWideEnoughToDraw] = useState(() => matches('(min-width: 1024px)'));

  const view = (searchParams.get('view') as VaultView) || 'library';
  const selectedId = searchParams.get('node') || '';
  const query = searchParams.get('q') || '';

  useEffect(() => {
    let cancelled = false;
    void loadSalesWorkspaceData(dataUserId).then((next) => {
      if (!cancelled) setWorkspace(next);
    });
    void loadKnowledgeNotesForWorkspace(dataUserId, sampleDataActive).then((next) => {
      if (!cancelled) setKnowledge(next);
    });
    return () => { cancelled = true; };
  }, [dataUserId, sampleDataActive]);

  // The drawer docks beside the map on a wide screen and overlays on a narrow
  // one. Tracked rather than done in CSS alone because the docked panel is not
  // a dialog - it should not trap focus or lock the page scroll.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 1536, not 1280. A 360px panel out of a 1280 screen leaves the map about
    // 600px wide, and a customer's neighbourhood fitted into 600px renders its
    // own name at 8px. Below this width the drawer overlays and the map keeps
    // the room.
    const dock = window.matchMedia('(min-width: 1536px)');
    // Below a laptop, the drawn map is the wrong shape entirely: on a 375px
    // phone the fit puts node titles under 8px, and zooming to read them shows
    // two cards at a time. The same neighbourhood is shown as a list instead.
    const draw = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      setWideEnoughToDock(dock.matches);
      setWideEnoughToDraw(draw.matches);
    };
    dock.addEventListener('change', update);
    draw.addEventListener('change', update);
    return () => {
      dock.removeEventListener('change', update);
      draw.removeEventListener('change', update);
    };
  }, []);

  const graph = useMemo(() => buildKnowledgeGraph({
    accounts: workspace?.accounts || [],
    opportunities: workspace?.opportunities || [],
    stakeholders: workspace?.stakeholders || [],
    activities: workspace?.activities || [],
    objections: workspace?.objections || [],
    quotes: workspace?.quotes || [],
    outcomes: workspace?.opportunityOutcomes || [],
    knowledge,
    accountAliases: buildAccountAliasIndex(workspace?.accountMerges || []),
  }), [workspace, knowledge]);

  const selectedNode = selectedId ? graph.byId.get(selectedId) : undefined;

  /**
   * Replay state.
   *
   * `replayAt` is a date key while the story is playing and null the rest of
   * the time, which is also the map's normal state - so nothing about the live
   * map is conditional on a feature nobody has switched on.
   */
  const [replayAt, setReplayAt] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const replayTimeline = useMemo(
    () => buildReplayTimeline(graph.memory, graph.nodes.map((node) => node.id)),
    [graph],
  );
  const revealed = useMemo(
    () => (replayAt ? revealedAt(replayTimeline, replayAt) : undefined),
    [replayAt, replayTimeline],
  );
  /**
   * A replay gets its own board.
   *
   * The overview draws eleven curated hubs - today's best connected - and
   * revealing a subset of those showed almost nothing for most of the story,
   * because today's hubs are mostly things learned late. The replay board is
   * laid out by when things arrived instead, so the order it reveals in and the
   * order it is arranged in are the same order.
   */
  const replayBoard = useMemo(
    () => buildReplayView({
      graph,
      order: replayTimeline.order,
      dated: new Set(replayTimeline.firstSeen.keys()),
      hiddenTypes,
    }),
    [graph, replayTimeline, hiddenTypes],
  );
  const replayView = replayAt ? replayBoard : null;
  // Asked about the board rather than the workspace: an imported book has dates
  // on its captured activity and the import date on everything else, so the
  // cards on screen would sit still for the whole story.
  const replayWorthOffering = useMemo(
    () => canReplay(replayTimeline, replayBoard.nodes.map((positioned) => positioned.node.id)),
    [replayTimeline, replayBoard],
  );
  const exitReplay = useCallback(() => {
    setReplaying(false);
    setReplayAt(null);
  }, []);

  const graphView = useMemo(
    () => buildGraphView({ graph, focusId: selectedNode?.id, hiddenTypes }),
    [graph, selectedNode?.id, hiddenTypes],
  );

  const patchParams = useCallback((patch: Record<string, string | null>) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const select = useCallback((nodeId: string) => patchParams({ node: nodeId }), [patchParams]);
  const closeDrawer = useCallback(() => patchParams({ node: null }), [patchParams]);

  const openMap = useCallback((nodeId?: string) => {
    patchParams({ view: 'map', node: nodeId ?? selectedId ?? null });
  }, [patchParams, selectedId]);

  /**
   * Every write carries the workspace it was made in.
   *
   * Not cosmetic. An untagged record written inside the public demo is
   * indistinguishable from a real one: the cloud sync would offer it to the
   * account, and "clear sample data" would leave it behind for whoever signs in
   * on this browser next. A dismissed gap surviving that way is the worst of
   * the three - it silently suppresses a question the new operator never saw.
   */
  const tagForWorkspace = useCallback(
    (record: KnowledgeRecord): KnowledgeRecord => (sampleDataActive
      ? { ...record, source: 'demo', isSample: true }
      : { ...record, source: 'user' }),
    [sampleDataActive],
  );

  const persist = useCallback((record: KnowledgeRecord) => {
    setKnowledge(saveKnowledgeNote(tagForWorkspace(record)));
  }, [tagForWorkspace]);

  const restoreDimension = useCallback((resolutionId: string) => {
    setKnowledge(deleteKnowledgeNote(resolutionId));
  }, []);

  const answerGap = useCallback((gap: KnowledgeGap) => {
    setPrefill({
      kind: 'note',
      title: '',
      subjectNodeId: gap.nodeId,
      gapKey: gap.key,
    });
  }, []);

  /**
   * "Not relevant" writes a record rather than hiding a row.
   *
   * A dismissal held in component state comes back on the next load, and one
   * held in localStorage alone comes back on the next device. It is a decision
   * about this business - "we do not need to know who signs at this customer" -
   * so it is stored like any other piece of knowledge, and it can be found and
   * undone later.
   */
  const dismissGap = useCallback((gap: KnowledgeGap) => {
    const now = new Date().toISOString();
    setKnowledge(saveKnowledgeNote(tagForWorkspace({
      id: createKnowledgeRecordId(),
      kind: 'question',
      noteType: 'fact',
      title: gap.question,
      body: 'Marked not relevant for this record.',
      subjects: [{ nodeId: gap.nodeId, label: gap.nodeLabel }],
      relation: 'not relevant at',
      evidence: [],
      status: 'dismissed',
      gapKey: gap.key,
      occurredAt: now.slice(0, 10),
      tags: [],
      createdAt: now,
      updatedAt: now,
    })));
  }, [tagForWorkspace]);

  if (!workspace) {
    return (
      <SkeletonScreen label="Reading your business memory">
        <PageContainer><SkeletonCard /></PageContainer>
      </SkeletonScreen>
    );
  }

  const hasAnything = graph.nodes.length > 0;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workspace"
        icon={<Network className="h-5 w-5" />}
        title="Business Vault"
        description="Your long-term memory of customers, markets, people, products and decisions - and an honest account of what you still do not know."
        actions={
          <>
            {/* In the header, not inside the Library.
                Search is how an operator arrives at this page with a name
                already in mind, and putting the box inside one of three tabs
                means two of them cannot be searched from - you have to know to
                go back to Library first, which is a rule about our layout
                rather than about the work. Typing here answers from the whole
                vault whichever tab is open. */}
            <label className="relative block w-full sm:w-[320px] lg:w-[360px]">
              <span className="sr-only">Search your business memory</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => patchParams({ q: event.target.value || null, view: event.target.value ? 'library' : null })}
                placeholder="Search your business memory..."
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-8 text-sm text-navy placeholder:text-gray-400 focus:border-brand-blue focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => patchParams({ q: null })}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:text-navy"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={() => setPrefill({ kind: 'note', subjectNodeId: selectedId || undefined })}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-blue px-3.5 py-2 text-sm font-bold text-white transition hover:bg-brand-blue-dark"
            >
              <Plus className="h-4 w-4" /> New knowledge
            </button>
          </>
        }
      />

      {!hasAnything ? (
        <EmptyState />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Business Vault views" className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              {VIEWS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={view === item.id}
                  onClick={() => patchParams({ view: item.id })}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold transition ${
                    view === item.id ? 'bg-navy text-white' : 'text-gray-600 hover:text-navy'
                  }`}
                >
                  {item.icon('h-3.5 w-3.5')}
                  {item.label}
                </button>
              ))}
            </div>

            {selectedNode && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${nodeVisual(selectedNode.type).chip}`}>
                {nodeIcon(selectedNode.type, 'h-3 w-3')}
                {selectedNode.label}
                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label={`Clear ${selectedNode.label}`}
                  className="rounded-full p-0.5 transition hover:bg-white/70"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>

          {view === 'library' && (
            <VaultLibrary
              graph={graph}
              query={query}
              typeFilter={typeFilter}
              selectedId={selectedId}
              canDrawMap={wideEnoughToDraw}
              onTypeFilterChange={setTypeFilter}
              onSelect={select}
              onOpenMap={openMap}
              onAnswerGap={answerGap}
              onDismissGap={dismissGap}
            />
          )}

          {view === 'map' && (
            <div className="flex gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                {wideEnoughToDraw ? (
                  <>
                    <MapLegend
                      graph={graph}
                      hiddenTypes={hiddenTypes}
                      onToggle={(type) => setHiddenTypes((current) => {
                        const next = new Set(current);
                        if (next.has(type)) next.delete(type);
                        else next.add(type);
                        return next;
                      })}
                    />
                    <div className="h-[calc(100vh-300px)] min-h-[480px] w-full">
                      <KnowledgeGraphCanvas
                        view={replayView || graphView}
                        focusId={selectedNode?.id || ''}
                        onSelect={select}
                        summary={mapSummary(graphView.nodes.length, selectedNode?.label)}
                        health={graph.health}
                        revealed={revealed}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      {selectedNode
                        ? `${graphView.shownNeighborCount} of ${graphView.neighborCount} relationships shown around ${selectedNode.label}. Drag to pan, scroll to zoom, or use the Library tab for a keyboard-friendly list.`
                        : 'Showing the parts of the business with the most recorded around them. Select anything to centre the map on it.'}
                    </p>

                    {/*
                      Replay: the same map, played back in the order the
                      business was learned. Every other view answers "what do I
                      know"; this one answers "how did I come to know it", which
                      is a question only a store that dates its memory can ask.
                    */}
                    {replayAt
                      ? (
                        <VaultReplayControl
                          timeline={replayTimeline}
                          at={replayAt}
                          playing={replaying}
                          onChange={setReplayAt}
                          onPlayingChange={setReplaying}
                          onExit={exitReplay}
                        />
                      )
                      : replayWorthOffering && (
                        <VaultReplayButton
                          onStart={() => {
                            setReplayAt(replayTimeline.steps[0]);
                            setReplaying(true);
                          }}
                        />
                      )}

                    {/*
                      Every motion on the map means something, so every motion
                      is written down. A key the reader has to hunt for turns a
                      readout back into decoration.
                    */}
                    <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs sm:grid-cols-2">
                      {motionLegend.map((entry) => (
                        <div key={entry.id} className="flex gap-2">
                          <dt className="shrink-0 font-semibold text-gray-700">{entry.title}</dt>
                          <dd className="text-gray-500">{entry.meaning}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  <MapAsList view={graphView} focusLabel={selectedNode?.label} onSelect={select} />
                )}
              </div>

              {selectedNode && wideEnoughToDock && (
                <KnowledgeDrawer
                  docked
                  node={selectedNode}
                  graph={graph}
                  onClose={closeDrawer}
                  onSelectNode={select}
                  onAnswerGap={answerGap}
                  onDismissGap={dismissGap}
                  onAddKnowledge={(node) => setPrefill({ kind: 'note', subjectNodeId: node.id })}
                  onShowOnMap={openMap}
                  onRestoreDimension={restoreDimension}
                />
              )}
            </div>
          )}

          {view === 'timeline' && (
            <VaultTimeline
              graph={graph}
              focusNode={selectedNode}
              onSelect={select}
              onClearFocus={closeDrawer}
            />
          )}
        </>
      )}

      {selectedNode && !(view === 'map' && wideEnoughToDock) && (
        <KnowledgeDrawer
          docked={false}
          node={selectedNode}
          graph={graph}
          onClose={closeDrawer}
          onSelectNode={select}
          onAnswerGap={answerGap}
          onDismissGap={dismissGap}
          onAddKnowledge={(node) => setPrefill({ kind: 'note', subjectNodeId: node.id })}
          onShowOnMap={openMap}
          onRestoreDimension={restoreDimension}
        />
      )}

      <NewKnowledgeModal
        // Remounted per prefill so the form opens with the gap's subject already
        // chosen rather than whatever was typed last time.
        key={prefill ? `${prefill.kind}:${prefill.gapKey || prefill.subjectNodeId || 'blank'}` : 'closed'}
        open={Boolean(prefill)}
        graph={graph}
        prefill={prefill}
        onClose={() => setPrefill(null)}
        onSave={persist}
      />
    </PageContainer>
  );
}

function matches(query: string) {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}

function MapLegend({
  graph,
  hiddenTypes,
  onToggle,
}: {
  graph: ReturnType<typeof buildKnowledgeGraph>;
  hiddenTypes: Set<KnowledgeNodeType>;
  onToggle: (type: KnowledgeNodeType) => void;
}) {
  const present = (Object.entries(graph.counts) as [KnowledgeNodeType, number][])
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 shadow-sm">
      <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Show</span>
      {present.map(([type, count]) => {
        const hidden = hiddenTypes.has(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => onToggle(type)}
            aria-pressed={!hidden}
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold transition ${
              hidden ? 'bg-gray-50 text-gray-400 line-through' : nodeVisual(type).chip
            }`}
          >
            {nodeIcon(type, 'h-3 w-3')}
            {knowledgeNodeTypePlurals[type]}
            <span className="tabular-nums opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function mapSummary(nodeCount: number, focus?: string) {
  return focus
    ? `Knowledge map centred on ${focus}, showing ${nodeCount} related things.`
    : `Knowledge map showing ${nodeCount} of the most connected things in this workspace.`;
}

/**
 * The empty Vault.
 *
 * One primary action, and it is Capture rather than anything inside this page.
 * A Vault with nothing in it cannot be filled from here: the map is derived, so
 * the honest first step is recording one real conversation and watching the
 * customer, the person and the product it names appear.
 */
function EmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-brand-blue">
        <Network className="h-6 w-6" />
      </span>
      <h2 className="mt-3 text-lg font-bold text-navy">Nothing to remember yet</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        Your map grows as Memoire learns how your customers, products, people and decisions connect. Capture one real
        conversation and the customer, the person and the product in it become the first things you know.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link
          to="/app/capture"
          className="inline-flex rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-navy/90"
        >
          Capture a conversation
        </Link>
        <Link
          to="/app/accounts"
          className="inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-600 transition hover:border-brand-blue hover:text-brand-blue"
        >
          Import your accounts
        </Link>
      </div>
    </section>
  );
}
