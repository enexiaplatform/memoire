import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  accountNodeId,
  authorableNodeTypes,
  authoredNodeId,
  buildKnowledgeGraph,
  competitorNodeId,
  inverseRelation,
  objectionNodeId,
  opportunityNodeId,
  personNodeId,
  searchKnowledgeNodes,
} from '../../src/utils/knowledgeGraph.ts';
import { buildGraphView } from '../../src/utils/knowledgeLayout.ts';
import { sanitizeKnowledgeRecord } from '../../src/utils/knowledgeNotes.ts';

const TODAY = '2026-08-09';

const account = (patch = {}) => ({
  id: `acc-${Math.random().toString(36).slice(2)}`,
  accountName: 'Bidiphar', segment: 'Pharma manufacturer', industry: 'Pharma', location: 'Binh Dinh',
  accountPotential: 'High', relationshipStatus: 'Active', keyStakeholders: [], notes: '', tags: [],
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', storageMode: 'local', ...patch,
});

const opportunity = (patch = {}) => ({
  id: `opp-${Math.random().toString(36).slice(2)}`,
  accountName: 'Bidiphar', opportunityName: 'Contact plate trial', stage: 'Proposal', status: 'Active',
  estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: 'Q3', productOrSolution: 'Contact plate',
  decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '', nextAction: '',
  nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Defend',
  createdAt: '2026-07-05T00:00:00.000Z', updatedAt: '2026-07-05T00:00:00.000Z', storageMode: 'local', ...patch,
});

const stakeholder = (patch = {}) => ({
  id: `sh-${Math.random().toString(36).slice(2)}`,
  accountId: '', accountName: 'Bidiphar', opportunityId: '', opportunityName: '',
  name: 'Ms Hoa', roleTitle: 'QA Manager', stakeholderRole: 'Champion', influenceLevel: 'High',
  relationshipStrength: 'Strong', stance: 'Supportive', email: '', phone: '', notes: '', tags: [],
  lastInteractionDate: '', createdAt: '2026-07-06T00:00:00.000Z', updatedAt: '2026-07-06T00:00:00.000Z',
  storageMode: 'local', ...patch,
});

const activity = (patch = {}) => ({
  id: `act-${Math.random().toString(36).slice(2)}`,
  accountName: 'Bidiphar', opportunityName: '', activityType: 'Customer meeting',
  summary: 'Plant visit', rawNote: 'Walked the oncology line', nextAction: '', dueDate: '',
  tags: [], activityDate: '2026-08-01', linkedOpportunityId: '', linkedOpportunityName: '',
  linkedAccountName: 'Bidiphar', linkStatus: 'Linked',
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', storageMode: 'local', ...patch,
});

const objection = (patch = {}) => ({
  id: `obj-${Math.random().toString(36).slice(2)}`,
  accountId: '', accountName: 'Bidiphar', opportunityId: '', opportunityName: '', stakeholderId: '',
  stakeholderName: '', sourceActivityId: '', objectionType: 'Price', objectionText: 'Too dear vs incumbent',
  impact: 'High', status: 'Open', requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '',
  resolvedAt: '', tags: [], createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
  storageMode: 'local', ...patch,
});

const empty = { accounts: [], opportunities: [], stakeholders: [], activities: [], objections: [] };

describe('the Business Vault knowledge graph', () => {
  it('survives an empty workspace rather than throwing at it', () => {
    const graph = buildKnowledgeGraph({ ...empty, today: TODAY });
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.edges.length, 0);
    assert.equal(graph.gaps.length, 0);
    assert.equal(graph.stats.nodeCount, 0);

    // And the map does not fall over on nothing, which is the state every new
    // workspace opens in.
    const view = buildGraphView({ graph });
    assert.equal(view.nodes.length, 0);
    assert.equal(view.edges.length, 0);
  });

  it('derives nodes from the records that already exist, not from a second store', () => {
    const graph = buildKnowledgeGraph({
      ...empty,
      accounts: [account()],
      opportunities: [opportunity({ id: 'opp-1', brand: 'PMM' })],
      stakeholders: [stakeholder()],
      today: TODAY,
    });

    assert.ok(graph.byId.has(accountNodeId('Bidiphar')), 'the customer is a node');
    assert.ok(graph.byId.has(opportunityNodeId('opp-1')), 'the deal is a node');
    assert.ok(graph.byId.has(personNodeId('Bidiphar', 'Ms Hoa')), 'the person is a node');
    assert.equal(graph.counts.industry, 1, 'the market is derived from the account record');
    assert.equal(graph.counts.brand, 1, 'the principal is derived from the deal');
  });

  it('names the same customer once however the deal spelled it', () => {
    const graph = buildKnowledgeGraph({
      ...empty,
      accounts: [account({ accountName: 'Bidiphar' })],
      opportunities: [opportunity({ accountName: 'BIDIPHAR.' }), opportunity({ accountName: 'bidiphar' })],
      today: TODAY,
    });
    assert.equal(graph.counts.account, 1, 'punctuation and case are not three customers');
  });

  it('uses a real verb for every relation', () => {
    const graph = buildKnowledgeGraph({
      ...empty,
      accounts: [account()],
      opportunities: [opportunity({ id: 'opp-1', brand: 'PMM', status: 'Won' })],
      stakeholders: [stakeholder({ opportunityId: 'opp-1' })],
      objections: [objection({ opportunityId: 'opp-1' })],
      activities: [activity({ competitors: ['MicronView'] })],
      today: TODAY,
    });

    const relations = new Set(graph.edges.map((edge) => edge.relation));
    assert.ok(relations.has('buys'), 'a won deal means the customer buys that line');
    assert.ok(relations.has('is a deal at'));
    assert.ok(relations.has('champions'), 'a champion is not merely "connected to"');
    assert.ok(relations.has('raised at'));
    assert.ok(relations.has('competing at'));
    assert.equal(relations.has('connected to'), false, 'no relation may be the generic one');
  });

  it('reads a relation the other way round without inventing grammar', () => {
    assert.equal(inverseRelation('evaluating'), 'evaluated by');
    assert.equal(inverseRelation('learned at'), 'knowledge recorded');
    // The fallback still has to be a phrase, not a formatting artefact.
    assert.equal(inverseRelation('some unmapped verb'), 'referenced by');
  });

  it('turns a competitor named only inside a captured note into something you can look up', () => {
    const graph = buildKnowledgeGraph({
      ...empty,
      accounts: [account()],
      activities: [activity({ competitors: ['MicronView'] })],
      today: TODAY,
    });
    const node = graph.byId.get(competitorNodeId('MicronView'));
    assert.ok(node, 'the competitor exists as a node');
    assert.equal(node.type, 'competitor');
    assert.ok((graph.memory.get(node.id) || []).length > 0, 'and carries the touch it was named in');
  });

  it('groups objections by type, because one price objection is an event and six are a pattern', () => {
    const graph = buildKnowledgeGraph({
      ...empty,
      accounts: [account(), account({ accountName: 'Hasan' })],
      objections: [objection(), objection({ accountName: 'Hasan' })],
      today: TODAY,
    });
    assert.equal(graph.counts.objection, 1);
    const near = graph.neighbors.get(objectionNodeId('Price')) || [];
    assert.equal(near.filter((neighbor) => neighbor.node.type === 'account').length, 2);
  });

  it('scores knowledge health as a count of listed things, never as an unexplained percentage', () => {
    const graph = buildKnowledgeGraph({
      ...empty,
      accounts: [account()],
      opportunities: [opportunity()],
      activities: [activity()],
      today: TODAY,
    });
    const health = graph.health.get(accountNodeId('Bidiphar'));
    assert.ok(health, 'a customer has a health reading');
    assert.ok(health.total >= 8, 'the dimensions are enumerated');
    assert.equal(health.known, health.dimensions.filter((item) => item.known).length);
    assert.ok(['strong', 'developing', 'thin', 'unknown'].includes(health.band));
    for (const dimension of health.dimensions) {
      assert.ok(dimension.question.length > 0, 'every dimension can be asked as a question');
      assert.ok(dimension.why.length > 0, 'and says why it matters');
    }
  });

  it('raises a gap for each thing a customer file should hold and does not', () => {
    const graph = buildKnowledgeGraph({
      ...empty,
      accounts: [account()],
      opportunities: [opportunity(), opportunity()],
      activities: [activity()],
      today: TODAY,
    });
    const gaps = graph.gaps.filter((gap) => gap.nodeId === accountNodeId('Bidiphar'));
    assert.ok(gaps.length > 0, 'an account with no named signer has an open gap');
    assert.ok(gaps.every((gap) => gap.key.startsWith('gap:')), 'gap keys are stable and addressable');
    assert.ok(gaps.every((gap) => gap.status === 'open'));
  });

  it('does not ask the same question about six customers in a row', () => {
    const accounts = ['A Pharma', 'B Pharma', 'C Pharma', 'D Pharma'].map((name) => account({ accountName: name }));
    const opportunities = accounts.flatMap((item) => [
      opportunity({ accountName: item.accountName }),
      opportunity({ accountName: item.accountName }),
    ]);
    const graph = buildKnowledgeGraph({ ...empty, accounts, opportunities, today: TODAY });

    const topFour = graph.gaps.slice(0, 4);
    const nodes = new Set(topFour.map((gap) => gap.nodeId));
    assert.equal(nodes.size, topFour.length, 'the top gaps are spread across customers');
    const dimensions = topFour.map((gap) => gap.key.split(':').pop());
    assert.ok(new Set(dimensions).size > 1, 'and are not four copies of one question');
  });

  it('stops asking a question the operator has answered, and counts the answer as known', () => {
    const knowledge = [sanitizeKnowledgeRecord({
      id: 'kn-1',
      kind: 'note',
      title: 'Ms Hoa signs anything under 500M',
      subjects: [{ nodeId: accountNodeId('Bidiphar'), label: 'Bidiphar' }],
      gapKey: `gap:${accountNodeId('Bidiphar')}:decision-maker`,
      status: 'answered',
      updatedAt: '2026-08-09T00:00:00.000Z',
    })];

    const input = { ...empty, accounts: [account()], opportunities: [opportunity(), opportunity()], today: TODAY };
    const before = buildKnowledgeGraph(input);
    const after = buildKnowledgeGraph({ ...input, knowledge });

    const key = `gap:${accountNodeId('Bidiphar')}:decision-maker`;
    assert.ok(before.gaps.some((gap) => gap.key === key), 'the gap was open');
    assert.equal(after.gaps.some((gap) => gap.key === key), false, 'and is closed by the answer');

    const dimension = after.health.get(accountNodeId('Bidiphar')).dimensions.find((item) => item.id === 'decision-maker');
    assert.equal(dimension.known, true, 'what the operator wrote down is knowledge, not a blank');
    assert.match(dimension.answer, /Ms Hoa/);
  });

  it('takes a dismissed question out of the score without hiding the decision', () => {
    const key = `gap:${accountNodeId('Bidiphar')}:decision-maker`;
    const knowledge = [sanitizeKnowledgeRecord({
      id: 'kn-2',
      kind: 'question',
      title: 'Who signs at Bidiphar?',
      subjects: [{ nodeId: accountNodeId('Bidiphar'), label: 'Bidiphar' }],
      gapKey: key,
      status: 'dismissed',
      updatedAt: '2026-08-09T00:00:00.000Z',
    })];

    const graph = buildKnowledgeGraph({
      ...empty, accounts: [account()], opportunities: [opportunity(), opportunity()], knowledge, today: TODAY,
    });

    assert.equal(graph.gaps.some((gap) => gap.key === key), false, 'it stops being asked');
    const dimension = graph.health.get(accountNodeId('Bidiphar')).dimensions.find((item) => item.id === 'decision-maker');
    assert.equal(dimension.dismissed, true, 'but the decision is still on the page');
    assert.equal(dimension.resolutionId, 'kn-2', 'and can be taken back');
    assert.equal(graph.counts.question, 0, 'a dismissal is bookkeeping, not a node on the map');
  });

  it('carries an authored note into the graph as a first-class node with backlinks', () => {
    const knowledge = [sanitizeKnowledgeRecord({
      id: 'kn-3',
      kind: 'note',
      title: 'They will not qualify a second supplier until the Annex 1 audit closes',
      noteType: 'insight',
      relation: 'learned at',
      subjects: [{ nodeId: accountNodeId('Bidiphar'), label: 'Bidiphar' }],
      occurredAt: '2026-08-08',
      updatedAt: '2026-08-08T00:00:00.000Z',
    })];

    const graph = buildKnowledgeGraph({ ...empty, accounts: [account()], knowledge, today: TODAY });
    assert.ok(graph.byId.has('note:kn-3'));
    assert.equal(graph.backlinks.get(accountNodeId('Bidiphar')).length, 1, 'the customer knows it is mentioned');
    assert.ok(graph.edges.some((edge) => edge.relation === 'learned at'));
    assert.ok((graph.memory.get(accountNodeId('Bidiphar')) || []).some((entry) => entry.kind === 'note'));
  });

  it('lets an operator write down a thing no record in the workspace could produce', () => {
    // A standard a customer must satisfy, the job the product does for them,
    // the site they run it at - nothing in a CRM holds any of these, and they
    // are the things a seller of ten years actually knows.
    const knowledge = [
      sanitizeKnowledgeRecord({
        id: 'kn-std',
        kind: 'note',
        title: 'They audit every new supplier against ISO 9001 before a first order',
        subjects: [{ nodeId: authoredNodeId('standard', 'ISO 9001'), label: 'ISO 9001' }],
        updatedAt: '2026-08-09T00:00:00.000Z',
      }),
      sanitizeKnowledgeRecord({
        id: 'kn-site',
        kind: 'note',
        title: 'The northern plant buys separately from head office',
        subjects: [{ nodeId: authoredNodeId('site', 'Northern plant'), label: 'Northern plant' }],
        updatedAt: '2026-08-09T00:00:00.000Z',
      }),
    ];

    const graph = buildKnowledgeGraph({ ...empty, accounts: [account()], knowledge, today: TODAY });
    assert.equal(graph.byId.get(authoredNodeId('standard', 'ISO 9001')).type, 'standard');
    assert.equal(graph.byId.get(authoredNodeId('site', 'Northern plant')).type, 'site');
    assert.equal(graph.counts.standard, 1);
    assert.equal(graph.counts.site, 1);
  });

  it('keeps an escape hatch, and remembers the operator\'s own word for it', () => {
    // Any fixed list of node types is wrong for somebody's trade. A freight
    // forwarder's "customs regime" and a machine builder's "tender" are not on
    // our list and never will be; what matters is that they can still be
    // written down, and still read back in the words they were written in.
    assert.ok(authorableNodeTypes.includes('topic'), 'the escape hatch must be offered');

    const knowledge = [sanitizeKnowledgeRecord({
      id: 'kn-topic',
      kind: 'note',
      title: 'Two of our best accounts were first met at this show',
      subjects: [{
        nodeId: authoredNodeId('topic', 'Hannover Messe 2027'),
        label: 'Hannover Messe 2027',
        typeLabel: 'Trade show',
      }],
      updatedAt: '2026-08-09T00:00:00.000Z',
    })];

    const graph = buildKnowledgeGraph({ ...empty, accounts: [account()], knowledge, today: TODAY });
    const node = graph.byId.get(authoredNodeId('topic', 'Hannover Messe 2027'));
    assert.equal(node.type, 'topic', 'it lands in the bounded set the graph can draw');
    assert.equal(node.subtitle, 'Trade show', 'and carries the word the operator reached for');

    // Two hits, not one: the thing itself and the note written about it. That
    // is the point of a vault rather than a list - searching a name should
    // surface what you know about it, not only the name.
    const hits = searchKnowledgeNodes(graph.nodes, 'hannover messe');
    assert.deepEqual(
      hits.map((hit) => hit.type).sort(),
      ['note', 'topic'],
      'the topic and the knowledge recorded against it both answer to its name',
    );
  });

  it('gives the same name one node however many notes mention it', () => {
    const subject = { nodeId: authoredNodeId('standard', 'ISO 9001'), label: 'ISO 9001' };
    const knowledge = ['kn-a', 'kn-b'].map((id) => sanitizeKnowledgeRecord({
      id, kind: 'note', title: `Note ${id}`, subjects: [subject], updatedAt: '2026-08-09T00:00:00.000Z',
    }));
    const graph = buildKnowledgeGraph({ ...empty, accounts: [account()], knowledge, today: TODAY });
    assert.equal(graph.counts.standard, 1, 'two notes about one standard is still one standard');
  });

  it('finds a Vietnamese customer typed without its accents', () => {
    const graph = buildKnowledgeGraph({
      ...empty,
      accounts: [account({ accountName: 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CỬU LONG' })],
      today: TODAY,
    });
    assert.equal(searchKnowledgeNodes(graph.nodes, 'duoc pham cuu long').length, 1);
    assert.equal(searchKnowledgeNodes(graph.nodes, 'cuu long duoc').length, 1, 'words may arrive out of order');
    assert.equal(searchKnowledgeNodes(graph.nodes, 'sartorius').length, 0);
  });

  it('is stable: the same records draw the same map twice', () => {
    const input = {
      ...empty,
      accounts: [account(), account({ accountName: 'Hasan' })],
      opportunities: [opportunity({ id: 'opp-1' }), opportunity({ id: 'opp-2', accountName: 'Hasan' })],
      stakeholders: [stakeholder()],
      today: TODAY,
    };
    const first = buildGraphView({ graph: buildKnowledgeGraph(input) });
    const second = buildGraphView({ graph: buildKnowledgeGraph(input) });
    assert.deepEqual(
      first.nodes.map((node) => [node.node.id, Math.round(node.x), Math.round(node.y)]),
      second.nodes.map((node) => [node.node.id, Math.round(node.x), Math.round(node.y)]),
    );
  });
});
