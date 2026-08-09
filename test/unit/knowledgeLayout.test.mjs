import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildKnowledgeGraph } from '../../src/utils/knowledgeGraph.ts';
import { buildGraphView, MAX_FOCUS_NEIGHBORS, nodeSizeFor } from '../../src/utils/knowledgeLayout.ts';

/**
 * The one property the map has to hold at every workspace size: no two cards
 * may sit on top of each other.
 *
 * This is not a nicety. Overlapping cards were the measured failure of the
 * first pass - a customer's own name half-covered by a product node - and it is
 * invisible to a type check, a render test and a build. The layout ends with a
 * relaxation pass precisely so this can be asserted rather than eyeballed.
 */

const TODAY = '2026-08-09';

function workspace(customerCount, dealsEach) {
  const accounts = Array.from({ length: customerCount }, (_, index) => ({
    id: `acc-${index}`, accountName: `Customer ${index}`, segment: 'Segment', industry: index % 2 ? 'Pharma' : 'Food',
    location: 'Vietnam', accountPotential: 'High', relationshipStatus: 'Active', keyStakeholders: [], notes: '',
    tags: [], createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', storageMode: 'local',
  }));

  const opportunities = accounts.flatMap((account, accountIndex) =>
    Array.from({ length: dealsEach }, (_, dealIndex) => ({
      id: `opp-${accountIndex}-${dealIndex}`,
      accountName: account.accountName,
      opportunityName: `A deal with quite a long name ${accountIndex}-${dealIndex}`,
      stage: 'Proposal', status: 'Active', estimatedValue: 100_000_000, currency: 'VND',
      expectedClosePeriod: 'Q3', productOrSolution: `Product ${dealIndex % 3}`, brand: `Brand ${dealIndex % 2}`,
      decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '', nextAction: '',
      nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
      forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Defend',
      createdAt: '2026-07-05T00:00:00.000Z', updatedAt: '2026-07-05T00:00:00.000Z', storageMode: 'local',
    })));

  const stakeholders = accounts.map((account, index) => ({
    id: `sh-${index}`, accountId: '', accountName: account.accountName, opportunityId: `opp-${index}-0`,
    opportunityName: '', name: `Person ${index} With A Long Name`, roleTitle: 'QA Manager',
    stakeholderRole: index % 2 ? 'Champion' : 'Economic Buyer', influenceLevel: 'High',
    relationshipStrength: 'Strong', stance: 'Supportive', email: '', phone: '', notes: '', tags: [],
    lastInteractionDate: '', createdAt: '2026-07-06T00:00:00.000Z', updatedAt: '2026-07-06T00:00:00.000Z',
    storageMode: 'local',
  }));

  return buildKnowledgeGraph({
    accounts, opportunities, stakeholders, activities: [], objections: [], today: TODAY,
  });
}

function overlaps(view) {
  const found = [];
  for (let i = 0; i < view.nodes.length; i += 1) {
    for (let j = i + 1; j < view.nodes.length; j += 1) {
      const a = view.nodes[i];
      const b = view.nodes[j];
      const sizeA = nodeSizeFor(a);
      const sizeB = nodeSizeFor(b);
      const overlapX = (sizeA.width + sizeB.width) / 2 - Math.abs(b.x - a.x);
      const overlapY = (sizeA.height + sizeB.height) / 2 - Math.abs(b.y - a.y);
      if (overlapX > 0 && overlapY > 0) found.push(`${a.node.label} / ${b.node.label}`);
    }
  }
  return found;
}

describe('the knowledge map layout', () => {
  it('never draws two cards on top of each other, at any workspace size', () => {
    for (const [customers, deals] of [[1, 1], [3, 2], [6, 4], [20, 5], [60, 3]]) {
      const graph = workspace(customers, deals);
      const overview = buildGraphView({ graph });
      assert.deepEqual(overlaps(overview), [], `overview collides at ${customers}x${deals}`);

      for (const node of graph.nodes.slice(0, 8)) {
        const focused = buildGraphView({ graph, focusId: node.id });
        assert.deepEqual(overlaps(focused), [], `focus on ${node.label} collides at ${customers}x${deals}`);
      }
    }
  });

  it('caps the neighbourhood rather than drawing the whole graph', () => {
    const graph = workspace(1, 12);
    const account = graph.nodes.find((node) => node.type === 'account');
    const view = buildGraphView({ graph, focusId: account.id });

    assert.ok(view.shownNeighborCount <= MAX_FOCUS_NEIGHBORS);
    assert.ok(view.neighborCount >= view.shownNeighborCount, 'it knows what it is not showing');
    assert.ok(view.nodes.length < graph.nodes.length, 'the whole graph is never rendered at once');
  });

  it('frames the focus and its direct relations, letting the outer ring sit past the edge', () => {
    const graph = workspace(4, 3);
    const account = graph.nodes.find((node) => node.type === 'account');
    const view = buildGraphView({ graph, focusId: account.id });

    const inner = view.nodes.filter((node) => node.ring <= 1);
    for (const node of inner) {
      const size = nodeSizeFor(node);
      assert.ok(node.x - size.width / 2 >= view.bounds.minX - 0.001, 'a direct relation is inside the frame');
      assert.ok(node.x + size.width / 2 <= view.bounds.maxX + 0.001);
    }
  });

  it('hides a whole node type when the operator switches it off', () => {
    const graph = workspace(4, 3);
    const account = graph.nodes.find((node) => node.type === 'account');
    const view = buildGraphView({ graph, focusId: account.id, hiddenTypes: new Set(['opportunity']) });
    assert.equal(view.nodes.some((node) => node.node.type === 'opportunity'), false);
  });

  it('draws one line per pair, so a doubly-related pair does not get two labels', () => {
    const graph = workspace(2, 4);
    const view = buildGraphView({ graph });
    const pairs = view.edges.map((edge) => [edge.from.node.id, edge.to.node.id].sort().join('|'));
    assert.equal(new Set(pairs).size, pairs.length);
  });

  it('places the focus at the centre and nothing else there', () => {
    const graph = workspace(3, 2);
    const account = graph.nodes.find((node) => node.type === 'account');
    const view = buildGraphView({ graph, focusId: account.id });
    const focus = view.nodes.find((node) => node.focused);
    assert.equal(focus.node.id, account.id);
    assert.equal(focus.x, 0);
    assert.equal(focus.y, 0);
    assert.equal(view.nodes.filter((node) => node.focused).length, 1);
  });
});
