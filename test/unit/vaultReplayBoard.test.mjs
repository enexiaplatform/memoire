import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildReplayView } from '../../src/utils/knowledgeLayout.ts';

/**
 * A hand-built graph in the shape `buildReplayView` reads: four customers that
 * are not related to each other, each with a deal, plus one product two of the
 * deals point at. That is the shape of a real book, and it is the shape that
 * broke the first selection - the heaviest nodes in a book are its customers,
 * and customers have no edges between them.
 */
function graphOf() {
  const node = (id, type, weight) => ({
    id, type, weight, label: id, subtitle: '', href: '', updatedAt: '2026-08-01',
    valueBase: 0, recordedValueCount: 0, openDealCount: 0, memoryCount: 1,
    connectionCount: 1, tags: [], facts: {}, searchText: id,
  });
  const nodes = [
    node('cust-a', 'account', 100), node('cust-b', 'account', 90),
    node('cust-c', 'account', 80), node('cust-d', 'account', 70),
    node('deal-a', 'opportunity', 40), node('deal-b', 'opportunity', 35),
    node('deal-c', 'opportunity', 30), node('deal-d', 'opportunity', 25),
    node('product', 'product', 20),
  ];
  const edges = [
    { id: 'e1', from: 'deal-a', to: 'cust-a', relation: 'is a deal at' },
    { id: 'e2', from: 'deal-b', to: 'cust-b', relation: 'is a deal at' },
    { id: 'e3', from: 'deal-c', to: 'cust-c', relation: 'is a deal at' },
    { id: 'e4', from: 'deal-d', to: 'cust-d', relation: 'is a deal at' },
    { id: 'e5', from: 'deal-a', to: 'product', relation: 'is for' },
    { id: 'e6', from: 'deal-b', to: 'product', relation: 'is for' },
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    neighbors.get(edge.from).push({ node: byId.get(edge.to), relation: edge.relation });
    neighbors.get(edge.to).push({ node: byId.get(edge.from), relation: edge.relation });
  }
  return { nodes, edges, byId, neighbors };
}

const ORDER = [
  'cust-a', 'deal-a', 'product', 'cust-b', 'deal-b',
  'cust-c', 'deal-c', 'cust-d', 'deal-d',
];

describe('the board a replay plays on', () => {
  test('it draws a network, not a row of unrelated names', () => {
    // The first selection took the heaviest nodes and produced a board with two
    // lines on it, because the heaviest things are customers and customers are
    // not related to each other.
    const view = buildReplayView({ graph: graphOf(), order: ORDER });
    assert.ok(view.edges.length >= 4, `expected a connected board, got ${view.edges.length} relations`);
  });

  test('cards are laid out in the order things were learned', () => {
    const view = buildReplayView({ graph: graphOf(), order: ORDER });
    const placed = ORDER.map((id) => view.nodes.find((n) => n.node.id === id)).filter(Boolean);
    // Reading order: never up and to the left of the one before it.
    for (let index = 1; index < placed.length; index += 1) {
      const previous = placed[index - 1];
      const current = placed[index];
      assert.ok(
        current.y > previous.y || (current.y === previous.y && current.x > previous.x),
        `${current.node.id} must be placed after ${previous.node.id}`,
      );
    }
  });

  test('nothing overlaps, so no relaxation pass is needed mid-replay', () => {
    const view = buildReplayView({ graph: graphOf(), order: ORDER });
    const seen = new Set();
    for (const positioned of view.nodes) {
      const key = `${positioned.x}:${positioned.y}`;
      assert.ok(!seen.has(key), 'two cards share a cell');
      seen.add(key);
    }
  });

  test('hidden types stay off the board', () => {
    const view = buildReplayView({
      graph: graphOf(),
      order: ORDER,
      hiddenTypes: new Set(['product']),
    });
    assert.ok(!view.nodes.some((n) => n.node.type === 'product'));
  });

  test('an order naming nothing produces an empty board rather than throwing', () => {
    const view = buildReplayView({ graph: graphOf(), order: ['nobody'] });
    assert.deepEqual(view.nodes, []);
    assert.deepEqual(view.edges, []);
  });

  test('the board is capped, so a large book stays readable', () => {
    const graph = graphOf();
    const many = Array.from({ length: 60 }, (_, i) => ({
      ...graph.nodes[0], id: `extra-${i}`, label: `extra-${i}`, weight: 1,
    }));
    for (const node of many) {
      graph.nodes.push(node);
      graph.byId.set(node.id, node);
      graph.neighbors.set(node.id, []);
    }
    const view = buildReplayView({ graph, order: [...ORDER, ...many.map((n) => n.id)] });
    assert.ok(view.nodes.length <= 18, `board held ${view.nodes.length}`);
  });
});

describe('a chronological board prefers records it can place in time', () => {
  test('dated nodes take the board before undated ones', () => {
    // A record with no readable date is shown from the first frame to the last,
    // so it cannot advance the story - and on the book this was built against,
    // sixteen of them were holding board slots.
    const graph = graphOf();
    const heavyUndated = Array.from({ length: 20 }, (_, i) => ({
      ...graph.nodes[0], id: `undated-${i}`, label: `undated-${i}`, weight: 1000,
    }));
    for (const node of heavyUndated) {
      graph.nodes.push(node);
      graph.byId.set(node.id, node);
      graph.neighbors.set(node.id, []);
    }
    const view = buildReplayView({
      graph,
      order: [...ORDER, ...heavyUndated.map((n) => n.id)],
      dated: new Set(ORDER),
    });
    // The claim is not "few undated cards" - a board bigger than the dated set
    // has to fill up somehow. It is that no dated record was passed over for an
    // undated one, however heavy the undated one is.
    const placed = new Set(view.nodes.map((n) => n.node.id));
    for (const id of ORDER) {
      assert.ok(placed.has(id), `${id} is dated and was left off the board`);
    }
  });

  test('with no dated set it behaves exactly as before', () => {
    const withoutFlag = buildReplayView({ graph: graphOf(), order: ORDER });
    const withEmpty = buildReplayView({ graph: graphOf(), order: ORDER, dated: new Set() });
    assert.equal(withoutFlag.nodes.length, withEmpty.nodes.length);
  });
});
