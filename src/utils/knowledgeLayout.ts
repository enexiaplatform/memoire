import type { KnowledgeGraph, KnowledgeNeighbor, KnowledgeNode, KnowledgeNodeType } from './knowledgeGraph.ts';

/**
 * Where the nodes go.
 *
 * Not a force simulation. A force layout is the obvious choice and the wrong
 * one here for three reasons: it lands somewhere slightly different every time
 * (so the map an operator learned yesterday is not the map today), it spends
 * frames settling, and at any real book size it produces the hairball that made
 * the first version of this page worthless.
 *
 * This is a contextual radial layout instead, and it is a pure function of the
 * ids it is given - the same focus always draws the same picture.
 *
 *   focused   the selected node at the centre, its direct relations on a ring
 *             around it grouped into arcs by relation, and a thin second ring
 *             of what those touch.
 *   overview  the parts of the business with the most recorded around them,
 *             spread on a wide ellipse, with the things they have in common
 *             gathered in the middle. A market three customers share, or a
 *             competitor met at four of them, is a fact about the business that
 *             no single record states.
 *
 * Two things keep it legible. The neighbourhood is capped, so this stays cheap
 * however large the graph behind it grows; and every layout finishes with a
 * relaxation pass that pushes overlapping cards apart, because a ring divided
 * into relation groups gives uneven spacing and "mostly fits" is the difference
 * between a map and a pile.
 */

/**
 * Card sizes, owned here rather than by the canvas.
 *
 * The layout has to know how big a node draws or it cannot tell whether two of
 * them collide, and two copies of these numbers is how the overlap check
 * quietly stops matching what is on screen.
 */
export const NODE_SIZES: Record<'focus' | 'near' | 'far', { width: number; height: number }> = {
  focus: { width: 232, height: 78 },
  near: { width: 184, height: 58 },
  far: { width: 156, height: 44 },
};

/**
 * The same map, drawn to sit inside a page rather than fill one.
 *
 * Not the full-size cards scaled down - that was measured and it does not
 * work. At the height an inline panel can spare (~330px) the fit takes a
 * standard node to 0.63 and its title to 7.9px, which is a picture of a map
 * rather than a map. These are pills: no metric line, a shorter label, and a
 * tighter ring, so the fit lands near 1.0 and the type stays the size it was
 * designed to be read at.
 */
export const COMPACT_NODE_SIZES: Record<'focus' | 'near' | 'far', { width: number; height: number }> = {
  focus: { width: 190, height: 44 },
  near: { width: 166, height: 34 },
  far: { width: 148, height: 30 },
};

export function nodeSizeFor(positioned: { ring: number; focused: boolean; compact?: boolean }) {
  const sizes = positioned.compact ? COMPACT_NODE_SIZES : NODE_SIZES;
  if (positioned.focused) return sizes.focus;
  return positioned.ring >= 2 ? sizes.far : sizes.near;
}

export type PositionedNode = {
  node: KnowledgeNode;
  x: number;
  y: number;
  /** 0 = a hub or the focus, 1 = directly related, 2 = one step further out. */
  ring: number;
  /** The relation as read from the focused node. Empty for the focus itself. */
  relation: string;
  focused: boolean;
  /** Drawn as a pill for an inline panel rather than as a full card. */
  compact?: boolean;
};

export type PositionedEdge = {
  id: string;
  from: PositionedNode;
  to: PositionedNode;
  relation: string;
  /** True when this edge touches the focused node. */
  primary: boolean;
};

export type GraphView = {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  /** Total direct relations the focus has, so the UI can say what it is hiding. */
  neighborCount: number;
  shownNeighborCount: number;
  /**
   * What "fit to view" should frame: the focus and its direct relations.
   *
   * Deliberately not every node drawn. Framing the second ring as well pushes
   * the scale down by a third, and the price is paid on the cards that matter
   * most - at a docked drawer width it took the customer's own name below 8px.
   * The outer ring is context; it is allowed to sit past the edge, where the
   * zoom control and a drag will find it.
   */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

/**
 * Wide rather than round.
 *
 * The panel this draws into is about twice as wide as it is tall, so a circular
 * ring wastes the sides and forces the fit to shrink everything to fit the
 * height. An ellipse in the panel's own proportions buys roughly a third more
 * readable type at the same node count.
 */
const FOCUS_RING = { rx: 360, ry: 195 };
const FOCUS_RING_TWO = { rx: 560, ry: 320 };
const OVERVIEW_RING = { rx: 440, ry: 195 };
const OVERVIEW_CORE = { rx: 155, ry: 78 };

/** The same shapes, sized for an inline panel's proportions. */
const COMPACT = {
  focusRing: { rx: 252, ry: 100 },
  focusRingTwo: { rx: 400, ry: 168 },
  overviewRing: { rx: 292, ry: 104 },
  overviewCore: { rx: 104, ry: 44 },
};

export const MAX_FOCUS_NEIGHBORS = 10;
const MAX_SECOND_RING = 6;
const MAX_OVERVIEW_HUBS = 6;
const MAX_OVERVIEW_CORE = 5;

/**
 * An inline map shows fewer things, on purpose.
 *
 * It is a way in, not the place you study the business - the Map tab is that.
 * Seven relations is what fits here before the relaxation pass has to push the
 * ring wide enough to shrink the type again, and the second ring is dropped
 * entirely: at this size it is dots, not context.
 */
const COMPACT_FOCUS_NEIGHBORS = 7;
const COMPACT_SECOND_RING = 0;
const COMPACT_OVERVIEW_HUBS = 5;
const COMPACT_OVERVIEW_CORE = 3;

export function buildGraphView(input: {
  graph: KnowledgeGraph;
  focusId?: string;
  /** Types the operator has switched off. Filtered before layout, not after. */
  hiddenTypes?: Set<KnowledgeNodeType>;
  /** Lay out for an inline panel: pills, a tighter ring, fewer relations. */
  compact?: boolean;
}): GraphView {
  const { graph, focusId, compact = false } = input;
  const hidden = input.hiddenTypes || new Set<KnowledgeNodeType>();
  const focus = focusId ? graph.byId.get(focusId) : undefined;
  return focus ? focusedView(graph, focus, hidden, compact) : overviewView(graph, hidden, compact);
}

function focusedView(
  graph: KnowledgeGraph,
  focus: KnowledgeNode,
  hidden: Set<KnowledgeNodeType>,
  compact: boolean,
): GraphView {
  const ring = compact ? COMPACT.focusRing : FOCUS_RING;
  const ringTwo = compact ? COMPACT.focusRingTwo : FOCUS_RING_TWO;
  const maxNeighbors = compact ? COMPACT_FOCUS_NEIGHBORS : MAX_FOCUS_NEIGHBORS;
  const maxSecond = compact ? COMPACT_SECOND_RING : MAX_SECOND_RING;

  const placed = new Map<string, PositionedNode>();
  placed.set(focus.id, { node: focus, x: 0, y: 0, ring: 0, relation: '', focused: true, compact });

  const all = (graph.neighbors.get(focus.id) || []).filter((neighbor) => !hidden.has(neighbor.node.type));
  const ranked = rankNeighbors(all);
  const shown = ranked.slice(0, maxNeighbors);

  // Grouped into arcs by relation so the ring reads as sentences rather than as
  // a shuffled circle: every person together, every line together.
  const groups = groupByRelation(shown);
  const totalShown = shown.length || 1;
  const gap = 0.18;
  let angle = -Math.PI / 2;

  const angleByNode = new Map<string, number>();
  for (const group of groups) {
    const share = (group.items.length / totalShown) * (Math.PI * 2 - gap * groups.length);
    const start = angle + gap / 2;
    group.items.forEach((neighbor, index) => {
      const at = group.items.length === 1
        ? start + share / 2
        : start + (share * index) / (group.items.length - 1);
      angleByNode.set(neighbor.node.id, at);
      placed.set(neighbor.node.id, {
        node: neighbor.node,
        x: Math.cos(at) * ring.rx,
        y: Math.sin(at) * ring.ry,
        ring: 1,
        relation: neighbor.relation,
        focused: false,
        compact,
      });
    });
    angle += share + gap;
  }

  // The second ring: what the closest few relations themselves touch. Kept
  // small and placed beside their parent, so it reads as "and beyond that" and
  // never as a second hairball.
  let secondRing = 0;
  for (const neighbor of shown.slice(0, 5)) {
    if (secondRing >= maxSecond) break;
    const parentAngle = angleByNode.get(neighbor.node.id);
    if (parentAngle === undefined) continue;
    const outward = rankNeighbors((graph.neighbors.get(neighbor.node.id) || [])
      .filter((candidate) => !hidden.has(candidate.node.type))
      .filter((candidate) => candidate.node.id !== focus.id && !placed.has(candidate.node.id)))
      .slice(0, 2);

    outward.forEach((candidate, index) => {
      if (secondRing >= maxSecond) return;
      const spread = (index - (outward.length - 1) / 2) * 0.2;
      const at = parentAngle + spread;
      placed.set(candidate.node.id, {
        node: candidate.node,
        x: Math.cos(at) * ringTwo.rx,
        y: Math.sin(at) * ringTwo.ry,
        ring: 2,
        relation: candidate.relation,
        focused: false,
        compact,
      });
      secondRing += 1;
    });
  }

  relax(placed, focus.id);
  return assemble(graph, placed, focus.id, { neighborCount: ranked.length, shownNeighborCount: shown.length });
}

/**
 * What the map shows before anything is selected.
 *
 * Not "everything, smaller". The nodes that carry the business sit on the
 * outside, and what they have in common sits in the middle - so the opening
 * picture says something a list cannot: these four customers are all in the
 * same market, three of them have met the same competitor, two of them are
 * looking at the same product.
 */
function overviewView(
  graph: KnowledgeGraph,
  hidden: Set<KnowledgeNodeType>,
  compact: boolean,
): GraphView {
  const ring = compact ? COMPACT.overviewRing : OVERVIEW_RING;
  const coreRing = compact ? COMPACT.overviewCore : OVERVIEW_CORE;
  const maxHubs = compact ? COMPACT_OVERVIEW_HUBS : MAX_OVERVIEW_HUBS;
  const maxCore = compact ? COMPACT_OVERVIEW_CORE : MAX_OVERVIEW_CORE;

  const placed = new Map<string, PositionedNode>();
  const visible = graph.nodes.filter((node) => !hidden.has(node.type));

  const hubs = (visible.filter((node) => node.type === 'account').length > 0
    ? visible.filter((node) => node.type === 'account')
    : visible
  ).slice(0, maxHubs);

  if (hubs.length === 0) {
    return { nodes: [], edges: [], neighborCount: 0, shownNeighborCount: 0, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  hubs.forEach((hub, index) => {
    // Started from the left rather than the top so an odd hub count still
    // spreads across the panel's width instead of stacking down its middle.
    const at = Math.PI + (index / hubs.length) * Math.PI * 2;
    placed.set(hub.id, {
      node: hub,
      x: Math.cos(at) * ring.rx,
      y: Math.sin(at) * ring.ry,
      ring: 0,
      relation: '',
      focused: false,
      compact,
    });
  });

  // What more than one hub touches, most-shared first. A market or a competitor
  // that two customers have in common is the whole reason to draw this at all.
  const shareCount = new Map<string, { node: KnowledgeNode; hubs: number; weight: number }>();
  for (const hub of hubs) {
    for (const neighbor of graph.neighbors.get(hub.id) || []) {
      if (hidden.has(neighbor.node.type)) continue;
      if (placed.has(neighbor.node.id)) continue;
      const entry = shareCount.get(neighbor.node.id);
      if (entry) entry.hubs += 1;
      else shareCount.set(neighbor.node.id, { node: neighbor.node, hubs: 1, weight: neighbor.node.weight });
    }
  }

  const shared = [...shareCount.values()]
    .sort((left, right) =>
      right.hubs - left.hubs
      || right.weight - left.weight
      || left.node.label.localeCompare(right.node.label))
    .slice(0, maxCore);

  shared.forEach((entry, index) => {
    const at = -Math.PI / 2 + (index / Math.max(shared.length, 1)) * Math.PI * 2;
    placed.set(entry.node.id, {
      node: entry.node,
      x: Math.cos(at) * coreRing.rx,
      y: Math.sin(at) * coreRing.ry,
      // Drawn at the smaller size: these are context for the hubs, not rivals
      // to them, and the size difference is what makes the ring read as a ring.
      ring: 2,
      relation: '',
      focused: false,
      compact,
    });
  });

  relax(placed, '');
  return assemble(graph, placed, '', { neighborCount: 0, shownNeighborCount: 0 });
}

/**
 * Pushes overlapping cards apart.
 *
 * The ring maths gives even spacing only when every relation group is the same
 * size, which is never. Rather than tune the angles per case - which is how a
 * layout ends up with a table of magic numbers and still collides on the next
 * workspace - this measures the actual cards and separates any pair that
 * touches, moving the less important one.
 *
 * Deterministic: pairs are visited in a fixed order, the anchor never moves,
 * and the pass is bounded. Same input, same picture, every time.
 */
function relax(placed: Map<string, PositionedNode>, anchorId: string) {
  const nodes = [...placed.values()];
  const gap = nodes[0]?.compact ? 10 : 14;

  for (let pass = 0; pass < 24; pass += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const sizeA = nodeSizeFor(a);
        const sizeB = nodeSizeFor(b);
        const minX = (sizeA.width + sizeB.width) / 2 + gap;
        const minY = (sizeA.height + sizeB.height) / 2 + gap;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = minX - Math.abs(dx);
        const overlapY = minY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        // Separate along whichever axis needs the smaller nudge, so a card
        // slides sideways out of a row rather than being flung across the map.
        const useX = overlapX / minX < overlapY / minY;
        const push = (useX ? overlapX : overlapY) / 2 + 0.5;
        const signX = dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx);
        const signY = dy === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dy);

        const aFixed = a.node.id === anchorId;
        const bFixed = b.node.id === anchorId;
        const aShare = aFixed ? 0 : bFixed ? 2 : 1;
        const bShare = bFixed ? 0 : aFixed ? 2 : 1;

        if (useX) {
          a.x -= signX * push * aShare;
          b.x += signX * push * bShare;
        } else {
          a.y -= signY * push * aShare;
          b.y += signY * push * bShare;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function assemble(
  graph: KnowledgeGraph,
  placed: Map<string, PositionedNode>,
  focusId: string,
  counts: { neighborCount: number; shownNeighborCount: number },
): GraphView {
  const edges: PositionedEdge[] = [];
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to) continue;
    // One line per pair: two nodes can be related twice ("carries" and "is for"
    // through different deals) and drawing both puts two labels on one line.
    const pairKey = [edge.from, edge.to].sort().join('|');
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    edges.push({
      id: edge.id,
      from,
      to,
      relation: edge.relation,
      primary: Boolean(focusId) && (edge.from === focusId || edge.to === focusId),
    });
  }

  const nodes = [...placed.values()];
  const bounds = nodes.filter((node) => node.ring <= 1).reduce(
    (acc, node) => {
      const size = nodeSizeFor(node);
      return {
        minX: Math.min(acc.minX, node.x - size.width / 2),
        minY: Math.min(acc.minY, node.y - size.height / 2),
        maxX: Math.max(acc.maxX, node.x + size.width / 2),
        maxY: Math.max(acc.maxY, node.y + size.height / 2),
      };
    },
    { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  );

  return { nodes, edges, bounds, ...counts };
}

/**
 * Which relations are worth drawing when there are more than fit.
 *
 * Money and liveness first, then how much has been written about the other end.
 * The tie-break is the label, so the answer never depends on insertion order.
 */
function rankNeighbors(neighbors: KnowledgeNeighbor[]): KnowledgeNeighbor[] {
  return [...neighbors].sort((left, right) => {
    const score = (neighbor: KnowledgeNeighbor) =>
      neighbor.edge.weight * 2 + neighbor.node.weight + neighbor.node.openDealCount * 3;
    return score(right) - score(left) || left.node.label.localeCompare(right.node.label);
  });
}

function groupByRelation(neighbors: KnowledgeNeighbor[]) {
  const groups = new Map<string, KnowledgeNeighbor[]>();
  for (const neighbor of neighbors) {
    const list = groups.get(neighbor.relation);
    if (list) list.push(neighbor);
    else groups.set(neighbor.relation, [neighbor]);
  }
  return [...groups.entries()]
    .map(([relation, items]) => ({ relation, items }))
    .sort((left, right) => right.items.length - left.items.length || left.relation.localeCompare(right.relation));
}
