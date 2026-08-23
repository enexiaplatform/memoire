import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Minus, Plus } from 'lucide-react';
import { nodeLabelBudget, nodeSizeFor, type GraphView, type PositionedEdge, type PositionedNode } from '../../utils/knowledgeLayout';
import { nodeVisual } from './nodeVisuals';
import { knowledgeNodeTypeLabels } from '../../utils/knowledgeGraph';

/**
 * The map.
 *
 * Drawn by hand in SVG rather than with a graph library, for reasons that are
 * product decisions rather than engineering taste:
 *
 *  - The node is the design. A library's node is a box you decorate; this one
 *    carries a type accent, an icon, a name, and the one number that makes it
 *    worth clicking. That is the difference between a diagram and something an
 *    operator reads.
 *  - The layout is already decided (see `knowledgeLayout.ts`) and is
 *    deterministic on purpose, so there is nothing for a simulation to do.
 *  - No dependency. React Flow and its layout engine are ~120KB before styles,
 *    on a product whose whole argument is that it computes on the operator's
 *    device and loads fast.
 *
 * Everything here is drawn from `view`, which never holds more than a few dozen
 * nodes however large the graph behind it is.
 */

const MIN_SCALE = 0.35;
/**
 * How far "fit" is allowed to shrink the map.
 *
 * Below this the node titles stop being readable and the map becomes a
 * decorative diagram, which is the failure this whole surface was rebuilt to
 * avoid. When the neighbourhood genuinely does not fit, it is framed on the
 * focus and the rest is a drag away.
 */
const MIN_FIT_SCALE = 0.62;
const MAX_SCALE = 2.2;

type Props = {
  view: GraphView;
  focusId: string;
  onSelect: (nodeId: string) => void;
  /** Announced to screen readers as the graph's text equivalent. */
  summary: string;
  /**
   * Drawn to sit inside a page: pills instead of cards, no dotted ground, and
   * the controls reduced to what fits. The layout has to be built with
   * `compact` too - see `buildGraphView`.
   */
  compact?: boolean;
};

export function KnowledgeGraphCanvas({ view, focusId, onSelect, summary, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [hovered, setHovered] = useState('');
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(node);
    setSize({ width: node.clientWidth || 900, height: node.clientHeight || 560 });
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    // The bounds already include each card's own box, so the padding here is
    // breathing room rather than a guess at how big a node draws.
    const padding = compact ? 18 : 34;
    const width = Math.max(view.bounds.maxX - view.bounds.minX + padding * 2, 320);
    const height = Math.max(view.bounds.maxY - view.bounds.minY + padding * 2, 240);
    const scale = clamp(Math.min(size.width / width, size.height / height), MIN_FIT_SCALE, 1.15);
    const centerX = (view.bounds.minX + view.bounds.maxX) / 2;
    const centerY = (view.bounds.minY + view.bounds.maxY) / 2;
    setTransform({ scale, x: -centerX * scale, y: -centerY * scale });
  }, [size.width, size.height, view.bounds, compact]);

  // Re-frames whenever the neighbourhood changes, which is what makes selecting
  // a node feel like the map moving to it rather than the map being replaced.
  useEffect(() => {
    fit();
  }, [fit, focusId, view.nodes.length]);

  // Wheel zoom, on a non-passive listener because React's synthetic wheel
  // handler cannot preventDefault and the page would scroll underneath.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setTransform((current) => {
        const next = clamp(current.scale * (event.deltaY > 0 ? 0.9 : 1.1), MIN_SCALE, MAX_SCALE);
        const ratio = next / current.scale;
        return { scale: next, x: current.x * ratio, y: current.y * ratio };
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const labelled = useMemo(() => labellableEdges(view, compact), [view, compact]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of view.edges) {
      addTo(map, edge.from.node.id, edge.to.node.id);
      addTo(map, edge.to.node.id, edge.from.node.id);
    }
    return map;
  }, [view.edges]);

  /**
   * What stays lit.
   *
   * Selecting is the whole point of the map, so a selection has to visibly
   * remove everything it is not about. Unrelated nodes fade rather than
   * disappear, because their being there is the context.
   */
  const lit = useMemo(() => {
    const active = hovered || focusId;
    if (!active) return null;
    const set = new Set<string>([active]);
    for (const id of adjacency.get(active) || []) set.add(id);
    return set;
  }, [hovered, focusId, adjacency]);

  const beginPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[data-node]')) return;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pan = (event: React.PointerEvent<SVGSVGElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    setTransform((current) => ({
      ...current,
      x: state.originX + (event.clientX - state.startX),
      y: state.originY + (event.clientY - state.startY),
    }));
  };

  const endPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState.current) return;
    dragState.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const zoomBy = (factor: number) => setTransform((current) => {
    const next = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
    const ratio = next / current.scale;
    return { scale: next, x: current.x * ratio, y: current.y * ratio };
  });

  return (
    <div className={`relative h-full w-full overflow-hidden ${compact ? '' : 'rounded-xl border border-gray-200 bg-white'}`}>
      {/* A faint grid gives the pan something to move against. Without it,
          dragging an empty white field feels like nothing is happening. */}
      {!compact && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            backgroundPosition: `${transform.x % 26}px ${transform.y % 26}px`,
          }}
        />
      )}
      <div ref={containerRef} className="absolute inset-0">
        <svg
          className={`h-full w-full touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          /* The viewBox starts at 0,0 and the root group carries the centring.
             A viewBox with a negative origin plus a CSS `scale()` scales about
             the reference box's own corner, not about graph coordinate (0,0),
             so the whole map slid out of frame as it zoomed. */
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={summary}
          onPointerDown={beginPan}
          onPointerMove={pan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <defs>
            <marker id="vault-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#94A3B8" />
            </marker>
            <marker id="vault-arrow-primary" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#475569" />
            </marker>
          </defs>

          <g
            style={{
              transformBox: 'view-box',
              transformOrigin: '0 0',
              transform: `translate(${size.width / 2 + transform.x}px, ${size.height / 2 + transform.y}px) scale(${transform.scale})`,
            }}
            /* Deliberately not transitioned. Pan and zoom are direct
               manipulation and must track the pointer exactly - and a CSS
               transition on an SVG group's transform does not reliably tick in
               Chrome: measured here, the group sat on the *start* value
               indefinitely, which put the whole map 90px off-centre and pushed
               two customers past the left edge. The nodes inside it still
               animate, so selecting one still reads as movement. */
          >
            {view.edges.map((edge) => (
              <Edge
                key={edge.id}
                edge={edge}
                lit={lit}
                /* Labelled when the line is about the selected node, when the
                   pointer is on one of its ends, and always in the overview -
                   where there are only a handful of lines and an unlabelled one
                   is just a line. Labelling every edge of a busy neighbourhood
                   is what turns a map back into a diagram. */
                compact={compact}
                /*
                 * Hover overrides the fit test on purpose.
                 *
                 * `labelled` drops any label that would sit under a card, which
                 * is right for the labels that are always on - and wrong for
                 * the one the operator is pointing at. On the inline map the
                 * ring is tight enough that nothing passes the test, so without
                 * this exception a compact map has no way to say what its lines
                 * mean. A label the reader summoned is worth a moment of
                 * overlap; one they did not is not.
                 */
                showLabel={
                  Boolean(hovered && (edge.from.node.id === hovered || edge.to.node.id === hovered))
                  || (labelled.has(edge.id) && (edge.primary || !focusId))
                }
              />
            ))}
            {view.nodes.map((positioned) => (
              <Node
                key={positioned.node.id}
                positioned={positioned}
                selected={positioned.node.id === focusId}
                dimmed={Boolean(lit) && !lit!.has(positioned.node.id)}
                onSelect={onSelect}
                onHover={setHovered}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Top right, where the design puts them and where they stop colliding
          with the node that ends up lowest on the ring. "Fit view" is spelled
          out rather than left as a crosshair: it is the control people reach
          for once they have panned somewhere they cannot get back from. */}
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur">
        <ControlButton label="Recentre on the selected node" onClick={fit}>
          <Crosshair className="h-4 w-4" />
        </ControlButton>
        <button
          type="button"
          onClick={fit}
          className="rounded-md px-2 py-1 text-[11px] font-bold text-gray-600 transition hover:bg-gray-100 hover:text-navy"
        >
          Fit view
        </button>
        <span className="mx-0.5 h-5 w-px bg-gray-200" />
        <ControlButton label="Zoom out" onClick={() => zoomBy(0.85)}><Minus className="h-4 w-4" /></ControlButton>
        {!compact && (
          <span className="w-11 text-center text-[11px] font-bold tabular-nums text-gray-500">
            {Math.round(transform.scale * 100)}%
          </span>
        )}
        <ControlButton label="Zoom in" onClick={() => zoomBy(1.18)}><Plus className="h-4 w-4" /></ControlButton>
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-navy"
    >
      {children}
    </button>
  );
}

/**
 * The curve, and where its label would sit.
 *
 * Shared by the drawing and by the collision pass below, because a label placed
 * at one point and tested at another is a label that hides behind a card.
 */
function edgeGeometry(edge: PositionedEdge, compact = false) {
  const from = anchor(edge.from, edge.to);
  const to = anchor(edge.to, edge.from);

  // A gentle bow rather than a straight line: two nodes on a ring with straight
  // spokes between them read as a wheel, and the eye stops seeing the relations.
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bow = Math.min(length * 0.08, 26);
  const controlX = midX + (-dy / length) * bow;
  const controlY = midY + (dx / length) * bow;

  return {
    from,
    to,
    controlX,
    controlY,
    length,
    labelX: 0.25 * from.x + 0.5 * controlX + 0.25 * to.x,
    labelY: 0.25 * from.y + 0.5 * controlY + 0.25 * to.y,
    plateWidth: edge.relation.length * (compact ? 5.0 : 6.2) + (compact ? 10 : 14),
  };
}

const LABEL_HEIGHT = 16;

/**
 * Which relations have room to be named.
 *
 * Measured, not guessed. Labelling every edge put four of eight plates
 * partly behind a card in the opening view - one of them 88% covered - because
 * the midpoint of a short edge frequently lands on a third node. This tests the
 * plate against every card actually on screen and keeps only the labels that
 * are wholly clear. A relation nobody can read is worse than an unlabelled
 * line; the word is still in the drawer either way.
 */
function labellableEdges(view: GraphView, compact: boolean) {
  const cards = view.nodes.map((node) => {
    const size = nodeSizeFor(node);
    return { minX: node.x - size.width / 2, maxX: node.x + size.width / 2, minY: node.y - size.height / 2, maxY: node.y + size.height / 2 };
  });

  const clear = new Set<string>();
  for (const edge of view.edges) {
    if (!edge.relation) continue;
    const geometry = edgeGeometry(edge, compact);
    if (geometry.length <= geometry.plateWidth + (compact ? 8 : 16)) continue;
    const plate = {
      minX: geometry.labelX - geometry.plateWidth / 2,
      maxX: geometry.labelX + geometry.plateWidth / 2,
      minY: geometry.labelY - (compact ? 12 : LABEL_HEIGHT) / 2,
      maxY: geometry.labelY + (compact ? 12 : LABEL_HEIGHT) / 2,
    };
    const hits = cards.some((card) =>
      plate.minX < card.maxX && plate.maxX > card.minX && plate.minY < card.maxY && plate.maxY > card.minY);
    if (!hits) clear.add(edge.id);
  }
  return clear;
}

function Edge({
  edge,
  lit,
  showLabel,
  compact,
}: {
  edge: PositionedEdge;
  lit: Set<string> | null;
  showLabel: boolean;
  compact: boolean;
}) {
  const dimmed = Boolean(lit) && !(lit!.has(edge.from.node.id) && lit!.has(edge.to.node.id));
  const { from, to, controlX, controlY, labelX, labelY, plateWidth } = edgeGeometry(edge, compact);
  const label = edge.relation;

  return (
    <g
      className="transition-opacity duration-300 motion-reduce:transition-none"
      opacity={dimmed ? 0.12 : 1}
      aria-hidden
    >
      <path
        d={`M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`}
        fill="none"
        stroke={edge.primary ? '#64748B' : '#CBD5E1'}
        strokeWidth={edge.primary ? 1.6 : 1.1}
        markerEnd={edge.primary ? 'url(#vault-arrow-primary)' : 'url(#vault-arrow)'}
      />
      {showLabel && !dimmed && label && (
        <g style={{ transform: `translate(${labelX}px, ${labelY}px)` }}>
          <rect
            x={-plateWidth / 2}
            y={compact ? -6 : -8}
            width={plateWidth}
            height={compact ? 12 : 16}
            rx={compact ? 6 : 8}
            fill="#FFFFFF"
            stroke="#E2E8F0"
          />
          <text textAnchor="middle" y={compact ? 2.8 : 3.5} fontSize={compact ? 8.5 : 10} fontWeight={600} fill="#475569">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

function Node({
  positioned,
  selected,
  dimmed,
  onSelect,
  onHover,
}: {
  positioned: PositionedNode;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
}) {
  const { node, ring, compact } = positioned;
  const size = nodeSizeFor(positioned);
  const visual = nodeVisual(node.type);
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  // Derived from the plate this node actually got, never guessed: see
  // `nodeLabelBudget`. A selected node is drawn a point larger, so it earns
  // slightly fewer characters, not more.
  const titleMax = nodeLabelBudget(size.width, compact) - (selected ? 1 : 0);

  const metric = nodeMetric(node);
  const describedAs = `${node.label}. ${knowledgeNodeTypeLabels[node.type]}. ${metric || 'No records yet'}${positioned.relation ? `. ${positioned.relation}` : ''}`;

  return (
    <g
      data-node={node.id}
      role="button"
      tabIndex={0}
      aria-label={describedAs}
      aria-pressed={selected}
      /* Opacity only. A CSS transition on an SVG group's `transform` does not
         tick in Chrome - the group keeps rendering at the start value while
         `style` reports the end one - so animating position here left every
         node drawn where it used to be, overlapping the focus. Dimming carries
         the state change instead, and it is the part that was doing the work. */
      /* `group`, and no `outline-none`. The global focus ring is declared with
         `:where(...)`, which has zero specificity, so a Tailwind `outline-none`
         on this element silently removed the only keyboard affordance the map
         had. The ring below is drawn rather than outlined, because an outline
         around an SVG group's bounding box tracks the text as well as the card. */
      className="group cursor-pointer transition-opacity duration-300 ease-out motion-reduce:transition-none"
      style={{ transform: `translate(${positioned.x}px, ${positioned.y}px)`, opacity: dimmed ? 0.22 : 1 }}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect(node.id);
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover('')}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover('')}
    >
      {selected && (
        <rect
          x={-halfWidth - 5}
          y={-halfHeight - 5}
          width={size.width + 10}
          height={size.height + 10}
          rx={15}
          fill="none"
          stroke={visual.accent}
          strokeWidth={1.5}
          opacity={0.35}
        />
      )}
      <rect
        x={-halfWidth - 4}
        y={-halfHeight - 4}
        width={size.width + 8}
        height={size.height + 8}
        rx={14}
        fill="none"
        stroke="#1976D2"
        strokeWidth={2}
        className="opacity-0 group-focus-visible:opacity-100"
      />
      <rect
        x={-halfWidth}
        y={-halfHeight}
        width={size.width}
        height={size.height}
        rx={compact ? halfHeight : 11}
        fill={selected ? visual.wash : '#FFFFFF'}
        stroke={selected ? visual.accent : '#E2E8F0'}
        strokeWidth={selected ? 1.5 : 1}
      />

      {compact ? (
        /* A pill: type carried by the icon's colour alone, because there is no
           room for a second line and a truncated type label reads as damage.
           The full type is still spoken by `aria-label` and written in the
           drawer, so nothing is colour-only for anyone who cannot use it. */
        <>
          <g style={{ color: visual.accent, transform: `translate(${-halfWidth + 11}px, ${-7}px)` }}>
            {visual.icon('h-3.5 w-3.5')}
          </g>
          <text
            x={-halfWidth + 32}
            y={4}
            fontSize={selected ? 12 : 11}
            fontWeight={700}
            fill="#0F172A"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            {truncate(node.label, titleMax)}
          </text>
        </>
      ) : (
        <>
          {/* The type accent, as a bar rather than a coloured card: ten pastel
              cards is a rainbow, ten 3px bars is a legend. */}
          <rect x={-halfWidth} y={-halfHeight + 9} width={3} height={size.height - 18} rx={1.5} fill={visual.accent} />

          <g style={{ color: visual.accent, transform: `translate(${-halfWidth + 14}px, ${-halfHeight + 11}px)` }}>
            {visual.icon('')}
          </g>

          <text
            x={-halfWidth + 34}
            y={-halfHeight + 22}
            fontSize={selected ? 14 : 12.5}
            fontWeight={700}
            fill="#0F172A"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            {truncate(node.label, titleMax)}
          </text>
          <text x={-halfWidth + 34} y={-halfHeight + 37} fontSize={10} fontWeight={600} fill="#64748B" letterSpacing={0.4}>
            {knowledgeNodeTypeLabels[node.type].toUpperCase()}
          </text>

          {(selected || ring < 2) && metric && (
            <text x={-halfWidth + 14} y={halfHeight - 12} fontSize={10.5} fontWeight={600} fill="#475569">
              {truncate(metric, selected ? 34 : 26)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

/** The one line that makes a node worth clicking, not everything known about it. */
function nodeMetric(node: { memoryCount: number; connectionCount: number; openDealCount: number }) {
  const parts: string[] = [];
  if (node.memoryCount > 0) parts.push(`${node.memoryCount} ${node.memoryCount === 1 ? 'memory' : 'memories'}`);
  if (node.connectionCount > 0) parts.push(`${node.connectionCount} link${node.connectionCount === 1 ? '' : 's'}`);
  if (node.openDealCount > 0) parts.push(`${node.openDealCount} live`);
  return parts.slice(0, 2).join(' · ');
}

/**
 * Where an edge should stop.
 *
 * At the node's edge rather than its centre, so the arrowhead lands on the card
 * instead of hiding under it. Computed against the box, not a circle, or the
 * line detaches from the corner of a wide node.
 */
function anchor(node: PositionedNode, towards: PositionedNode) {
  const size = nodeSizeFor(node);
  const halfWidth = size.width / 2 + 6;
  const halfHeight = size.height / 2 + 6;
  const dx = towards.x - node.x;
  const dy = towards.y - node.y;
  if (dx === 0 && dy === 0) return { x: node.x, y: node.y };

  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy),
  );
  return { x: node.x + dx * scale, y: node.y + dy * scale };
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(max - 1, 1)).trimEnd()}…`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function addTo(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}
