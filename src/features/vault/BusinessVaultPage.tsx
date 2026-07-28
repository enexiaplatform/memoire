import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Network, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadSalesWorkspaceData } from '../../services/workspaceData';
import { loadAccounts, type AccountMemoryRecord } from '../../services/accountStore';
import type { SalesWorkspaceData } from '../../services/workspaceData';
import { buildBusinessGraph, isQuietAccount, type VaultNode } from '../../utils/businessGraph';
import { formatBaseCurrencyAmount } from '../../utils/money';
import { SkeletonCard, SkeletonScreen } from '../../components/common/Skeleton';

/**
 * The Business Vault: the whole business drawn as one living map, in the spirit
 * of an Obsidian graph. The workspace sits at the center; brands, customers and
 * deals hang off it, sized by the money they carry and colored by their state.
 * Click any node and the panel tells its story, with the real record one click
 * away.
 *
 * The map is derived on every visit from the same stores every other surface
 * reads. It owns no records - it is a way of seeing, not a place where data
 * lives.
 */

type SimNode = VaultNode & { x: number; y: number; vx: number; vy: number; r: number };

const CANVAS_W = 1200;
const CANVAS_H = 800;

export function BusinessVaultPage() {
  const { user } = useAuthContext();
  const [workspace, setWorkspace] = useState<SalesWorkspaceData | null>(null);
  const [accounts, setAccounts] = useState<AccountMemoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [hoveredId, setHoveredId] = useState('');
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadSalesWorkspaceData(dataUserId), loadAccounts(dataUserId)]).then(([data, accountRecords]) => {
      if (cancelled) return;
      setWorkspace(data);
      setAccounts(accountRecords);
    });
    return () => { cancelled = true; };
  }, [dataUserId]);

  const graph = useMemo(() => (workspace ? buildBusinessGraph({
    accounts,
    opportunities: workspace.opportunities,
    activities: workspace.activities,
    quotes: workspace.quotes,
  }) : null), [accounts, workspace]);

  const simNodes = useMemo(() => (graph ? runLayout(graph.nodes, graph.links) : []), [graph]);
  const nodeById = useMemo(() => new Map(simNodes.map((node) => [node.id, node])), [simNodes]);
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    graph?.links.forEach((link) => {
      (map.get(link.source) || map.set(link.source, new Set()).get(link.source)!).add(link.target);
      (map.get(link.target) || map.set(link.target, new Set()).get(link.target)!).add(link.source);
    });
    return map;
  }, [graph]);

  const focusId = hoveredId || selectedId;
  const focusSet = useMemo(() => {
    if (!focusId) return null;
    const set = new Set([focusId]);
    neighbors.get(focusId)?.forEach((id) => set.add(id));
    return set;
  }, [focusId, neighbors]);

  const selected = selectedId ? nodeById.get(selectedId) : undefined;
  const selectedChildren = useMemo(() => {
    if (!selected || !graph) return [];
    return graph.links
      .filter((link) => link.source === selected.id)
      .map((link) => nodeById.get(link.target))
      .filter((node): node is SimNode => Boolean(node))
      .sort((a, b) => b.valueBase - a.valueBase);
  }, [graph, nodeById, selected]);

  // Pan and zoom live in the viewBox, so the SVG stays crisp at any depth.
  const [view, setView] = useState({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H });
  const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
    setView((current) => {
      const w = Math.min(CANVAS_W * 2.5, Math.max(CANVAS_W / 6, current.w * factor));
      const h = w * (CANVAS_H / CANVAS_W);
      return {
        x: current.x + (current.w - w) / 2,
        y: current.y + (current.h - h) / 2,
        w,
        h,
      };
    });
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    panRef.current = { startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  }, [view.x, view.y]);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const pan = panRef.current;
    const svg = svgRef.current;
    if (!pan || !svg) return;
    const scale = view.w / svg.clientWidth;
    setView((current) => ({
      ...current,
      x: pan.viewX - (event.clientX - pan.startX) * scale,
      y: pan.viewY - (event.clientY - pan.startY) * scale,
    }));
  }, [view.w]);

  const onPointerUp = useCallback(() => { panRef.current = null; }, []);

  if (!workspace || !graph) {
    return (
      <SkeletonScreen label="Drawing your business map">
        <div className="w-full px-4 py-5 sm:px-5 lg:px-6"><SkeletonCard /></div>
      </SkeletonScreen>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-brand-blue" />
            <h1 className="text-2xl font-bold tracking-tight text-navy">Business Vault</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
            The whole business as one map: brands, customers, deals - sized by money, colored by state. Click a node to
            read its story; scroll to zoom, drag to pan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-brand-blue">
            Active pipeline: {formatBaseCurrencyAmount(graph.totalActiveBase, true)}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            {graph.brandCount > 0 ? `${graph.brandCount} brands · ` : ''}{graph.accountCount} customers · {graph.opportunityCount} deals
          </span>
        </div>
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-[#243447] bg-navy shadow-xl">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="h-[70vh] min-h-[420px] w-full cursor-grab touch-none active:cursor-grabbing"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          role="img"
          aria-label="Business map"
        >
          <defs>
            <radialGradient id="vault-hub" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#7dd3fc" />
            </radialGradient>
          </defs>

          {graph.links.map((link) => {
            const source = nodeById.get(link.source);
            const target = nodeById.get(link.target);
            if (!source || !target) return null;
            const lit = focusSet ? focusSet.has(link.source) && focusSet.has(link.target) : false;
            return (
              <line
                key={`${link.source}->${link.target}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={lit ? '#7dd3fc' : '#334a63'}
                strokeOpacity={focusSet && !lit ? 0.25 : 0.8}
                strokeWidth={lit ? 1.8 : 0.9}
              />
            );
          })}

          {simNodes.map((node) => {
            const dimmed = focusSet ? !focusSet.has(node.id) : false;
            const showLabel = node.kind !== 'opportunity'
              || node.id === focusId
              || Boolean(focusSet?.has(node.id))
              || node.r >= 13;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                opacity={dimmed ? 0.28 : 1}
                className="cursor-pointer"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setSelectedId((current) => (current === node.id ? '' : node.id))}
                onPointerEnter={() => setHoveredId(node.id)}
                onPointerLeave={() => setHoveredId('')}
              >
                {node.id === selectedId && (
                  <circle r={node.r + 6} fill="none" stroke="#7dd3fc" strokeWidth={1.5} strokeDasharray="3 3" />
                )}
                <circle
                  r={node.r}
                  fill={nodeFill(node)}
                  stroke={nodeStroke(node)}
                  strokeWidth={node.kind === 'opportunity' && !node.committed && node.status !== 'Won' ? 1.5 : 1}
                />
                {showLabel && (
                  <text
                    y={node.r + 12}
                    textAnchor="middle"
                    fill={node.kind === 'hub' ? '#ffffff' : '#cbd5e1'}
                    fontSize={node.kind === 'hub' ? 15 : node.kind === 'opportunity' ? 9.5 : 11.5}
                    fontWeight={node.kind === 'opportunity' ? 500 : 700}
                    style={{ pointerEvents: 'none' }}
                  >
                    {truncateLabel(node.label)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-3 text-[11px] font-semibold text-white/70">
          <LegendDot color="#f0abfc" label="Brand" />
          <LegendDot color="#38bdf8" label="Customer" />
          <LegendDot color="#fbbf24" label="Quiet customer (14d+)" />
          <LegendDot color="#1e3a5f" ring="#60a5fa" label="Active deal" />
          <LegendDot color="#a78bfa" label="Committed to order" />
          <LegendDot color="#34d399" label="Won" />
        </div>

        {selected && (
          <aside className="absolute right-3 top-3 w-72 rounded-xl border border-white/10 bg-[#0d1b2a]/95 p-4 text-white shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">{kindLabel(selected)}</p>
                <h2 className="mt-0.5 text-base font-bold leading-snug">{selected.label}</h2>
              </div>
              <button
                type="button"
                aria-label="Close details"
                onClick={() => setSelectedId('')}
                className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selected.valueBase > 0 && (
              <p className="mt-2 text-sm font-bold text-sky-200">{formatBaseCurrencyAmount(selected.valueBase, true)}</p>
            )}
            <ul className="mt-2 space-y-1 text-xs leading-5 text-white/80">
              {selected.facts.map((fact) => <li key={fact}>{fact}</li>)}
              {isQuietAccount(selected) && (
                <li className="font-bold text-amber-300">Gone quiet - nothing captured in two weeks.</li>
              )}
            </ul>

            {selectedChildren.length > 0 && (
              <div className="mt-3 border-t border-white/10 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">Connected</p>
                <ul className="mt-1 max-h-36 space-y-0.5 overflow-y-auto text-xs">
                  {selectedChildren.slice(0, 12).map((child) => (
                    <li key={child.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(child.id)}
                        className="w-full truncate rounded px-1.5 py-1 text-left font-semibold text-white/85 hover:bg-white/10"
                      >
                        {child.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selected.kind !== 'hub' && (
              <Link
                to={selected.href}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-navy hover:bg-sky-100"
              >
                Open record
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label, ring }: { color: string; label: string; ring?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: ring ? `0 0 0 1.5px ${ring}` : undefined }}
      />
      {label}
    </span>
  );
}

function kindLabel(node: VaultNode) {
  return { hub: 'Workspace', brand: 'Brand', account: 'Customer', opportunity: node.status === 'Won' ? 'Won order' : 'Deal' }[node.kind];
}

function nodeFill(node: SimNode) {
  if (node.kind === 'hub') return 'url(#vault-hub)';
  if (node.kind === 'brand') return '#f0abfc';
  if (node.kind === 'account') return isQuietAccount(node) ? '#fbbf24' : '#38bdf8';
  if (node.status === 'Won') return '#34d399';
  if (node.committed) return '#a78bfa';
  return '#1e3a5f';
}

function nodeStroke(node: SimNode) {
  if (node.kind === 'opportunity' && node.status !== 'Won' && !node.committed) return '#60a5fa';
  return 'rgba(255,255,255,0.35)';
}

function truncateLabel(label: string) {
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
}

/**
 * A small deterministic force layout - enough physics for an honest map, no
 * dependency and no animation loop. Nodes are seeded on rings by layer, then
 * relaxed: neighbors pull along links, everyone repels, gravity keeps the
 * galaxy on screen. Deterministic seeding means the same workspace draws the
 * same map every visit, so the operator's spatial memory keeps working.
 */
function runLayout(nodes: VaultNode[], links: { source: string; target: string }[]): SimNode[] {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const maxValue = Math.max(1, ...nodes.map((node) => node.valueBase));

  const radius = (node: VaultNode) => {
    const base = { hub: 26, brand: 15, account: 10, opportunity: 6 }[node.kind];
    const boost = { hub: 0, brand: 8, account: 9, opportunity: 8 }[node.kind];
    return base + boost * Math.sqrt(node.valueBase / maxValue);
  };

  const ringByKind = { hub: 0, brand: 150, account: 330, opportunity: 430 } as const;
  const sim: SimNode[] = nodes.map((node, index) => {
    const angle = hash01(node.id) * Math.PI * 2;
    const ring = ringByKind[node.kind] * (0.85 + 0.3 * hash01(`${node.id}:r`));
    return {
      ...node,
      x: node.kind === 'hub' ? cx : cx + Math.cos(angle + index * 0.01) * ring,
      y: node.kind === 'hub' ? cy : cy + Math.sin(angle + index * 0.01) * ring,
      vx: 0,
      vy: 0,
      r: radius(node),
    };
  });

  const byId = new Map(sim.map((node) => [node.id, node]));
  const springs = links
    .map((link) => ({ a: byId.get(link.source), b: byId.get(link.target) }))
    .filter((pair): pair is { a: SimNode; b: SimNode } => Boolean(pair.a && pair.b))
    .map((pair) => ({
      ...pair,
      rest: pair.a.kind === 'hub' ? 190 : pair.a.kind === 'brand' ? 165 : pair.b.kind === 'opportunity' ? 62 : 190,
    }));

  for (let step = 0; step < 260; step += 1) {
    for (let i = 0; i < sim.length; i += 1) {
      for (let j = i + 1; j < sim.length; j += 1) {
        const a = sim[i];
        const b = sim[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = Math.max(80, dx * dx + dy * dy);
        const force = (1800 * (a.r + b.r)) / distSq / Math.sqrt(distSq);
        a.vx -= dx * force;
        a.vy -= dy * force;
        b.vx += dx * force;
        b.vy += dy * force;
      }
    }

    springs.forEach(({ a, b, rest }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = 0.02 * (dist - rest) / dist;
      a.vx += dx * force;
      a.vy += dy * force;
      b.vx -= dx * force;
      b.vy -= dy * force;
    });

    sim.forEach((node) => {
      if (node.kind === 'hub') { node.vx = 0; node.vy = 0; node.x = cx; node.y = cy; return; }
      node.vx += (cx - node.x) * 0.0012;
      node.vy += (cy - node.y) * 0.0012;
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x += node.vx;
      node.y += node.vy;
    });
  }

  return sim;
}

/** Deterministic hash to [0, 1) so the map is stable across visits. */
function hash01(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
