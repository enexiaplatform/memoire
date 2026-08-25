import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildKnowledgeGraph, accountNodeId, searchKnowledgeNodes } from '../src/utils/knowledgeGraph.ts';
import { buildGraphView } from '../src/utils/knowledgeLayout.ts';
import { edgeMotionFor, memoryAgeFor, memoryAgeOpacity, motionLegend } from '../src/utils/vaultMotion.ts';
import { buildReplayTimeline, canReplay, revealedAt } from '../src/utils/vaultReplay.ts';

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


/**
 * The map's motion is a readout, not decoration.
 *
 * Every animation on the Vault map has to encode something the graph already
 * computed - how complete a file is, how long ago it was touched, which way a
 * relation reads, whether money travels along it. That rule is the difference
 * between a knowledge map and a prettier node-link diagram, and it is only
 * enforceable if the pieces below stay true.
 */
{
  const canvas = readFileSync('src/features/vault/KnowledgeGraphCanvas.tsx', 'utf8');
  const motion = readFileSync('src/utils/vaultMotion.ts', 'utf8');

  // The trap that cost two debugging rounds in 2026-08 and was re-measured in
  // this browser in 2026-08-25: a CSS *transition* on an SVG group's transform
  // never ticks here, while a keyframe *animation* on the same property does.
  // Every moving thing on this canvas is therefore an animation.
  // Tested against the code with its comments removed. The first version of
  // this check failed on the paragraph *explaining* the rule, which is the
  // same class of mistake as a marker a comment satisfies: a substring test
  // cannot tell an instruction from a description of one.
  const canvasCode = canvas
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/transition[^;\n]*transform/.test(canvasCode),
    'no CSS transition on an SVG transform: it does not tick in Chrome, use a keyframe animation',
  );
  for (const name of ['vaultRise', 'vaultDraw', 'vaultFlow', 'vaultPip', 'vaultHalo']) {
    assert.ok(canvas.includes(`@keyframes ${name}`), `${name} must be declared as a keyframe animation`);
  }

  // An operator who has asked their system to stop moving things must get a map
  // that says exactly the same facts and simply holds still.
  assert.match(canvas, /@media \(prefers-reduced-motion: reduce\)/, 'reduced motion is honoured');
  const reduced = canvas.slice(canvas.indexOf('prefers-reduced-motion'));
  for (const cls of ['.vault-flow', '.vault-pip', '.vault-rise', '.vault-halo', '.vault-draw']) {
    assert.ok(reduced.includes(cls), `${cls} must be switched off under reduced motion`);
  }
  assert.ok(
    reduced.includes('.vault-draw { stroke-dasharray: none; }'),
    'the draw-in dash pattern must be cleared under reduced motion, or every relation is invisible',
  );

  // The knowledge marks are a count. `KnowledgeHealth` is deliberately a count
  // and a band rather than a percentage, on the grounds that "six of the nine
  // things worth knowing are written down" is a sentence anyone can check. The
  // marks are that sentence drawn, so they must stay countable.
  assert.match(canvas, /const PIP_MAX = \d+;/, 'the marks have a stated ceiling');
  assert.ok(
    !/completeness \* 100\}%/.test(canvas) && !/toFixed\(/.test(canvas),
    'the map must not render completeness as a percentage - the count is the design',
  );

  // Silence is drawn. An unreadable date is not silence, and must not be drawn
  // as the coldest thing on the map - the same trap that once made a broken
  // date the most recent touch in the account engine.
  assert.equal(memoryAgeFor('not a date', '2026-08-25'), 'undated');
  assert.equal(memoryAgeOpacity.undated, 1, 'an unreadable date is not drawn as long silence');
  assert.ok(memoryAgeOpacity.cold < memoryAgeOpacity.fading, 'longer silence is drawn fainter');
  assert.ok(memoryAgeOpacity.cold >= 0.5, 'a cold card must still be legible');

  // A motion nobody can decode is decoration. The legend ships beside the map.
  const page = readFileSync('src/features/vault/BusinessVaultPage.tsx', 'utf8');
  assert.match(page, /motionLegend\.map\(/, 'the map ships its own key');
  assert.ok(motionLegend.length >= 4, 'every motion on the map is explained');
  // The key has to describe what is drawn now, not what was drawn last week.
  // Two encodings were built and discarded before the marks, and the legend
  // shipped describing one of them for an afternoon - a key that explains a
  // design nobody can see is worse than no key.
  const legendText = motionLegend.map((entry) => `${entry.title} ${entry.meaning}`).join(' ').toLowerCase();
  assert.ok(legendText.includes('marks'), 'the key must describe the marks, which is what the card actually draws');
  assert.ok(!/\bring\b/.test(legendText), 'no ring is drawn on a card, so the key must not describe one');

  // Money on a relation means a deal with a value, not the customer's running
  // total - reading the larger of the two ends made every line out of a
  // customer teal, and a line that is always lit says nothing.
  assert.match(canvas, /candidate\.type === 'opportunity'/, 'value on an edge comes from the deal end');
  assert.equal(edgeMotionFor({ primary: true, valueBase: 0 }).carriesValue, false);
  assert.equal(edgeMotionFor({ primary: false, valueBase: 1 }).carriesValue, false);
}


/**
 * Replay answers a question a CRM cannot ask.
 *
 * A CRM stores the present tense - a field's value, not the moment it arrived.
 * The Vault keeps a dated memory entry behind every node, so the order the
 * business was learned in is recoverable without anyone recording it on
 * purpose. Two properties keep that honest.
 */
{
  const replay = readFileSync('src/utils/vaultReplay.ts', 'utf8');

  // Nothing re-runs the graph mid-replay. The layout is computed once from the
  // finished graph and the replay only decides what is visible yet, which is
  // why a node sits in its final place from the first frame it appears in.
  const page = readFileSync('src/features/vault/BusinessVaultPage.tsx', 'utf8');
  assert.match(page, /revealed=\{revealed\}/, 'the replay reveals nodes rather than rebuilding the layout');
  assert.ok(
    !/buildGraphView\([^)]*replayAt/s.test(page),
    'the layout must not depend on the replay position, or every frame reflows',
  );

  // A record with no readable date is not a record from the beginning of time
  // and not one from today. It is held constant and counted out loud.
  const timeline = buildReplayTimeline(
    new Map([['dated', [{ date: '2026-03-04' }]], ['undated', [{ date: 'whenever' }]]]),
    ['dated', 'undated'],
    '2026-08-25',
  );
  assert.deepEqual(timeline.undated, ['undated'], 'undated records are named, not dropped');
  assert.ok(revealedAt(timeline, '2026-03-04').has('undated'), 'undated records are present throughout');
  assert.match(replay, /REPLAY_MIN_MOMENTS/, 'a book with no story does not offer a replay');

  // An imported pipeline arrives on one day. Offering a replay of it produces a
  // single frame that reveals everything at once, which looks broken.
  // Two dates, not one: a real import often straddles a day boundary, and a
  // threshold that only rejects a single date would let that through.
  const importedDay = buildReplayTimeline(
    new Map([
      ['a', [{ date: '2026-08-23' }]],
      ['b', [{ date: '2026-08-23' }]],
      ['c', [{ date: '2026-08-24' }]],
    ]),
    ['a', 'b', 'c'],
    '2026-08-25',
  );
  assert.equal(importedDay.steps.length, 2, 'the fixture must straddle two days for the threshold to be tested');
  assert.equal(canReplay(importedDay), false, 'a one-day import has no story to replay');

  // The replay draws a network, not a row of names. Seeding the board with the
  // heaviest nodes produced two lines on it: the heaviest things in a book are
  // its customers, and customers are not related to each other - their deals
  // are what join them.
  const layout = readFileSync('src/utils/knowledgeLayout.ts', 'utf8');
  assert.match(layout, /graph\.neighbors\.get\(seed\.id\)/, 'the replay board is filled from what its seeds touch');
  assert.match(layout, /const MAX_REPLAY_NODES = \d+;/, 'the board has a stated ceiling');

  // The gate asks about the board, not the workspace. A book whose deals were
  // imported has dates on its captured activity and the import date on
  // everything else: ten distinct moments existed while the eighteen cards on
  // screen changed on one of them, so the replay opened on six cards and held
  // them for nine of its ten frames.
  const importedBoard = buildReplayTimeline(
    new Map([
      ['elsewhere-1', [{ date: '2026-03-04' }]],
      ['elsewhere-2', [{ date: '2026-04-15' }]],
      ['elsewhere-3', [{ date: '2026-05-20' }]],
      ['elsewhere-4', [{ date: '2026-06-02' }]],
      ['board-a', [{ date: '2026-08-23' }]],
      ['board-b', [{ date: '2026-08-23' }]],
    ]),
    ['elsewhere-1', 'elsewhere-2', 'elsewhere-3', 'elsewhere-4', 'board-a', 'board-b'],
    '2026-08-25',
  );
  assert.equal(canReplay(importedBoard), true, 'the workspace itself has enough moments');
  assert.equal(
    canReplay(importedBoard, ['board-a', 'board-b']),
    false,
    'a board that never changes must not be offered as a replay',
  );
}

console.log('Business Vault knowledge contract verified: memory in the Vault, coverage under Accounts.');
