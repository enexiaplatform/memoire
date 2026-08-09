import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildKnowledgeGraph, accountNodeId, searchKnowledgeNodes } from '../src/utils/knowledgeGraph.ts';
import { buildGraphView } from '../src/utils/knowledgeLayout.ts';

/**
 * The Business Vault is business memory, and the coverage matrix still exists.
 *
 * Two product decisions are pinned here, and they pull in opposite directions,
 * which is exactly why they are checked together:
 *
 *   1. The Vault must not drift back into being a customer x line grid. It was
 *      one until 2026-08-09, and it was a good grid answering the wrong
 *      question - "which squares have I never filled" is cross-sell planning,
 *      not memory. The Vault's job is what you know, how it connects, and what
 *      you do not know.
 *
 *   2. The grid must not be lost in the process. It is real commercial
 *      capability with real user value; it moved to /app/portfolio-coverage
 *      under Accounts, unchanged, and it must stay reachable from at least two
 *      places an operator would actually look.
 *
 * This file is also where the "no giant meaningless graph" rule lives. The
 * first version of the Vault, in 2026-07, was a force-directed map of accounts
 * and deals - accurate and worthless, because it showed an operator their own
 * customer list arranged in a circle. `verify-brand-and-supply.mjs` used to ban
 * any graph at all as a result. That ban is lifted deliberately, and replaced
 * by the conditions that made the old graph worthless in the first place: the
 * map must be contextual rather than complete, it must carry semantic
 * relations rather than plain lines, and it must show the operator something
 * their own records do not already say out loud - which is what the gaps and
 * the derived nodes are for.
 */

const vaultDir = 'src/features/vault';
const page = readFileSync(`${vaultDir}/BusinessVaultPage.tsx`, 'utf8');
const library = readFileSync(`${vaultDir}/VaultLibrary.tsx`, 'utf8');
const drawer = readFileSync(`${vaultDir}/KnowledgeDrawer.tsx`, 'utf8');
const canvas = readFileSync(`${vaultDir}/KnowledgeGraphCanvas.tsx`, 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const registry = readFileSync('src/config/featureRegistry.ts', 'utf8');

// 1. The Vault is no longer the coverage matrix.
{
  assert.equal(
    /buildCoverageMatrix/.test(page) || /buildCoverageMatrix/.test(library),
    false,
    'the Business Vault must not render the coverage matrix as its primary experience - that grid has its own surface now',
  );
  for (const marker of ['Library', 'Map', 'Timeline']) {
    assert.ok(page.includes(`label: '${marker}'`), `the Vault must offer the ${marker} view`);
  }
  assert.match(page, /buildKnowledgeGraph/, 'the Vault renders the derived knowledge graph');
  assert.match(page, /long-term memory of customers/, 'the Vault says what it is for');
}

// 2. Portfolio Coverage survives, with a route, a page and two doors.
{
  const coverage = readFileSync('src/features/coverage/PortfolioCoveragePage.tsx', 'utf8');
  assert.match(coverage, /buildCoverageMatrix/, 'the coverage matrix still renders somewhere');
  assert.match(coverage, /Never offered/, 'and keeps the ranked gap list an operator acts on');
  assert.match(coverage, /new=1&account=/, 'and keeps the empty square that starts an opportunity');

  assert.match(app, /path="portfolio-coverage"/, 'the coverage route resolves');
  assert.match(registry, /id: 'portfolio-coverage'/, 'a moved surface still needs a registry record');

  const accounts = readFileSync('src/features/accounts/AccountsPage.tsx', 'utf8');
  assert.match(accounts, /\/app\/portfolio-coverage/, 'Accounts links to the coverage of its own records');
  assert.match(library, /\/app\/portfolio-coverage/, 'the Vault library links to it too - whitespace is a knowledge gap');
}

// 3. The map is contextual, not complete, and its relations are readable.
{
  assert.match(canvas, /aria-label=\{summary\}/, 'the graph carries a text equivalent');
  assert.match(canvas, /role="button"/, 'a node is operable, not decoration');
  assert.match(canvas, /tabIndex=\{0\}/, 'and reachable from the keyboard');
  assert.match(canvas, /motion-reduce:transition-none/, 'motion respects a stated preference');

  const layout = readFileSync('src/utils/knowledgeLayout.ts', 'utf8');
  assert.match(layout, /MAX_FOCUS_NEIGHBORS/, 'the neighbourhood is capped');
  // Checked against the code, not the prose. The file explains at length why it
  // is not a force simulation, and a contract that fails on the explanation
  // teaches people to delete the explanation.
  const layoutCode = layout.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(
    /Math\.random|Date\.now|performance\.now/.test(layoutCode),
    false,
    'the layout stays deterministic - a map that lands somewhere different every time cannot be learned',
  );
}

// 4. No new dependency was taken for any of it.
{
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const banned of ['reactflow', '@xyflow/react', 'cytoscape', 'd3', 'd3-force', 'dagre', 'elkjs', 'vis-network']) {
    assert.equal(
      Object.hasOwn(pkg.dependencies, banned),
      false,
      `the knowledge map must not add ${banned} - it is drawn in SVG from a deterministic layout`,
    );
  }
}

// 5. The model: derived from records that already exist, and honest about gaps.
{
  const accounts = [{
    id: 'a1', accountName: 'Bidiphar', segment: 'Pharma', industry: 'Pharma', location: 'Binh Dinh',
    accountPotential: 'High', relationshipStatus: 'Active', keyStakeholders: [], notes: '', tags: [],
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', storageMode: 'local',
  }];
  const opportunities = [{
    id: 'o1', accountName: 'Bidiphar', opportunityName: 'Contact plate trial', stage: 'Proposal',
    status: 'Active', estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: 'Q3',
    productOrSolution: 'Contact plate', brand: 'PMM', decisionMaker: '', budgetOwner: '', procurementPath: '',
    technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '', missingContext: '',
    objectionDebt: '', forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Defend',
    createdAt: '2026-07-05T00:00:00.000Z', updatedAt: '2026-07-05T00:00:00.000Z', storageMode: 'local',
  }];

  const graph = buildKnowledgeGraph({
    accounts, opportunities, stakeholders: [], activities: [], objections: [], today: '2026-08-09',
  });

  assert.ok(graph.byId.has(accountNodeId('Bidiphar')), 'a customer on record is a node in the Vault');
  assert.ok(graph.edges.length > 0, 'and it is connected to what the records say about it');
  assert.ok(
    graph.edges.every((edge) => edge.relation && edge.relation !== 'connected to'),
    'every relation names what it is - "connected to" is a line, not knowledge',
  );
  assert.ok(graph.gaps.length > 0, 'a customer with no named signer has an open gap');
  assert.ok(
    graph.gaps.every((gap) => gap.question.endsWith('?') && gap.why.length > 0),
    'a gap is a question with a reason, or it is not actionable',
  );

  // Health is explainable: a band and a count of listed things, never a bare
  // percentage nobody can check.
  const health = graph.health.get(accountNodeId('Bidiphar'));
  assert.ok(health && health.dimensions.length === health.total);
  assert.ok(['strong', 'developing', 'thin', 'unknown'].includes(health.band));
  assert.equal(
    /\d+%/.test(readFileSync(`${vaultDir}/KnowledgeDrawer.tsx`, 'utf8').match(/Knowledge health[\s\S]{0,900}/)?.[0] || ''),
    false,
    'knowledge health is a band and a count, not an invented percentage',
  );

  // Vietnamese search keeps working, the same rule every other list follows.
  const vn = buildKnowledgeGraph({
    accounts: [{ ...accounts[0], accountName: 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CỬU LONG' }],
    opportunities: [], stakeholders: [], activities: [], objections: [], today: '2026-08-09',
  });
  assert.equal(searchKnowledgeNodes(vn.nodes, 'duoc pham cuu long').length, 1, 'diacritic-insensitive search survives');

  // Nothing at all must render, not throw.
  const emptyGraph = buildKnowledgeGraph({
    accounts: [], opportunities: [], stakeholders: [], activities: [], objections: [],
  });
  assert.equal(buildGraphView({ graph: emptyGraph }).nodes.length, 0);
  // And a relation pointing at a record that is gone must not draw a ghost.
  const orphaned = buildKnowledgeGraph({
    accounts: [], opportunities: [], stakeholders: [{
      id: 's1', accountId: '', accountName: '', opportunityId: 'missing-deal', opportunityName: '',
      name: 'Ms Hoa', roleTitle: '', stakeholderRole: 'Champion', influenceLevel: 'High',
      relationshipStrength: 'Strong', stance: 'Supportive', email: '', phone: '', notes: '', tags: [],
      lastInteractionDate: '', createdAt: '', updatedAt: '', storageMode: 'local',
    }], activities: [], objections: [], today: '2026-08-09',
  });
  assert.ok(
    orphaned.edges.every((edge) => orphaned.byId.has(edge.from) && orphaned.byId.has(edge.to)),
    'an edge to a record that no longer exists is dropped, not drawn into nothing',
  );
}

// 6. The drawer is an intelligence brief, not a second editor.
{
  for (const section of ['Why this matters', 'Knowledge health', 'Knowledge gaps', 'Connected knowledge', 'Recent memory', 'Mentioned in']) {
    assert.ok(drawer.includes(section), `the node drawer must answer "${section}"`);
  }
  assert.match(drawer, /\/app\/ask\?question=/, 'every node can be taken to Ask Memoire');
  for (const writer of ['saveOpportunity', 'saveAccount', 'saveStakeholder', 'updateOpportunity']) {
    assert.equal(
      drawer.includes(writer),
      false,
      `the drawer must not edit canonical records (found ${writer}) - it links to the surface that owns them`,
    );
  }
  assert.match(drawer, /restore/, 'a dismissed gap can be taken back');
}

// 7. Memoire is for B2B, not for one trade in it.
//
//    The founder's own book is pharma and lab supply, so every example that
//    comes to hand is a pharma example. That is how a general product quietly
//    becomes a niche one - not by a decision, but by a placeholder.
//
//    Two rules, both narrow enough to check:
{
  const graphSource = readFileSync('src/utils/knowledgeGraph.ts', 'utf8');

  // (a) The escape hatch stays. Any fixed list of node types is wrong for
  //     somebody's trade; `topic` is where the trade nobody anticipated gets
  //     to name the thing in its own words. Losing it is a real regression,
  //     and it would not fail anything else.
  assert.match(graphSource, /'topic',/, 'the Vault must keep a node type for things its list did not anticipate');
  assert.match(
    graphSource,
    /authorableNodeTypes = \[[^\]]*'topic'/s,
    'the escape hatch has to be offered when writing knowledge, not merely exist in the type union',
  );
  assert.match(
    readFileSync(`${vaultDir}/NewKnowledgeModal.tsx`, 'utf8'),
    /Something else/,
    'the escape hatch needs a name a person would pick',
  );

  // (b) No node may be derived by matching words in free text. Reading "GMP"
  //     or "sterility" out of a deal's technical criteria would fill this
  //     founder's map beautifully and return nothing at all for a software
  //     reseller or a freight forwarder - silently, with no error to explain
  //     the empty page. Derivation reads structured fields only.
  const derivationCode = graphSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const trade of ['gmp', 'sterility', 'oncology', 'annex', 'pharma', 'cleanroom']) {
    assert.equal(
      new RegExp(trade, 'i').test(derivationCode),
      false,
      `the graph derivation names "${trade}" - one trade's vocabulary in the engine is how this stops working for every other trade`,
    );
  }

  // (c) The example copy an operator reads before typing anything has to be
  //     recognisable to any B2B seller. Checked on the placeholders only:
  //     a *list* of examples spanning several industries (ISO, SOC 2, HACCP,
  //     CE) is exactly right and must not trip this.
  const modalCode = readFileSync(`${vaultDir}/NewKnowledgeModal.tsx`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  // Every literal inside every placeholder, not just the first. These are
  // ternaries - one example for a note and another for a question - and a
  // regex that stops at the opening quote checks half the copy while reporting
  // success on all of it.
  const placeholders = [...modalCode.matchAll(/placeholder=(?:"([^"]*)"|\{([\s\S]*?)\})/g)]
    .flatMap((match) => (match[1]
      ? [match[1]]
      : [...match[2].matchAll(/'([^']*)'/g)].map((literal) => literal[1])));
  assert.ok(placeholders.length >= 4, `expected the capture form to still carry its examples, found ${placeholders.length}`);
  for (const placeholder of placeholders) {
    for (const trade of ['GMP', 'sterility', 'oncology', 'Annex', 'QA meeting', 'contact plate']) {
      assert.equal(
        placeholder.toLowerCase().includes(trade.toLowerCase()),
        false,
        `a capture-form example is written in one trade's language ("${trade}" in "${placeholder}") - it is the only instruction the field gives, so it decides what people believe the feature is for`,
      );
    }
  }
}

// 8. Storage: one owned collection, a real table behind it, and it is backed up.
{
  const cloudStore = readFileSync('src/services/cloudJsonCollectionStore.ts', 'utf8');
  assert.match(cloudStore, /'knowledge_notes'/, 'knowledge notes are a registered JSON collection');

  const migrations = readdirSync('supabase/migrations')
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
    .join('\n');
  assert.match(migrations, /create table if not exists public\.knowledge_notes/i, 'the collection has a table');
  assert.match(migrations, /alter table public\.knowledge_notes enable row level security/i, 'one operator cannot read another\'s memory');

  const restore = readFileSync('src/services/workspaceRestore.ts', 'utf8');
  assert.match(restore, /'memoire\.knowledgeNotes\.v1': 'knowledge_notes'/, 'a restored backup puts business memory back in the cloud too');

  const store = readFileSync('src/services/knowledgeNoteStore.ts', 'utf8');
  assert.match(store, /writeLocalRecords\(/, 'writes go through the guarded local path');
  assert.match(store, /record\.source !== 'demo'/, 'a demo note never reaches a paying account');

  // api/ is at the Vercel Hobby ceiling of twelve; this feature adds none.
  // Underscore-prefixed files are shared modules, not deployed functions.
  const apiFunctions = readdirSync('api').filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(apiFunctions.length <= 12, `api/ is at the Vercel Hobby ceiling: ${apiFunctions.length} functions`);
}

console.log('Business Vault knowledge contract verified: memory in the Vault, coverage under Accounts.');
