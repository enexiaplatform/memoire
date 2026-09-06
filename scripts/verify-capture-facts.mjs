import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseCapture } from '../src/domain/commercialKernel/parseCapture.ts';
import { capturedFactKinds } from '../src/domain/commercialKernel/capturedFacts.ts';
import { objectionTypes } from '../src/services/objectionStore.ts';
import { commitmentParties } from '../src/domain/commercialKernel/types.ts';

/*
 * Capture is the one surface where Memoire guesses.
 *
 * A guess that writes itself into the commercial record is indistinguishable
 * from a fact the operator entered, and the operator then defends a forecast on
 * it. So the whole architecture is one sentence: the parser proposes, the person
 * decides, and a canonical command does the writing.
 *
 * These assertions hold the three halves of that apart, and hold the parser to
 * saying only what the note supports.
 */

const codeOf = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const readCode = (file) => codeOf(readFileSync(file, 'utf8'));

const parserCode = readCode('src/domain/commercialKernel/parseCapture.ts');
const dispatcherCode = readCode('src/domain/commercialKernel/commitCapturedFacts.ts');
const pageCode = readCode('src/features/dailyCapture/DailyCapturePage.tsx');
const panelCode = readCode('src/features/dailyCapture/CaptureReviewPanel.tsx');

const CAPTURE_DATE = '2026-09-05';
const ACCOUNT = 'Rohto Vietnam';
const NOTE = 'Met Rohto QC today. Trial looks good but they still need clarification on GPT '
  + 'verification. Purchasing wants to decide before Sep 20. Likely PO around 400M. '
  + 'Marc will visit Oct 3. I promised to send the validation explanation by Friday.';

const context = (patch = {}) => ({
  accounts: [{ id: 'acct-1', accountName: ACCOUNT }],
  opportunities: [{
    id: 'opp-1', accountName: ACCOUNT, opportunityName: 'QC analyser rollout',
    stage: 'Proposal', currency: 'VND', estimatedValue: 300_000_000,
  }],
  objections: [], stakeholders: [], openCommitments: [], evidence: [],
  reportingCurrency: 'VND', ...patch,
});
const parse = (raw, patch = {}) => parseCapture({ rawCapture: raw, captureDate: CAPTURE_DATE, context: context(patch) });

// ---------------------------------------------------------------- Contract A
// Nothing derived is written before the operator says so.
{
  const result = parse(NOTE);
  assert.ok(result.facts.length > 0, 'the fixture must produce proposals');
  for (const fact of result.facts) {
    assert.ok(
      fact.status === 'proposed' || fact.status === 'already_recorded',
      `a freshly parsed fact must never arrive accepted: ${fact.kind} was ${fact.status}`,
    );
  }

  // The parser cannot write even if it wanted to.
  for (const line of parserCode.split('\n')) {
    const match = line.match(/^import\s+(type\s+)?.*from\s+'([^']+)'/);
    if (!match) continue;
    const [, isType, specifier] = match;
    if (!specifier.includes('/services/')) continue;
    assert.ok(isType, `the parser imports a service at runtime (${specifier}); types only`);
  }
  for (const forbidden of ['localStorage', 'supabase', 'createObjection', 'createStakeholder', 'updateOpportunity', 'savePlanItem', 'createCommitment']) {
    assert.equal(parserCode.includes(forbidden), false, `the parser must not reach a write path: ${forbidden}`);
  }

  // The dispatcher only ever writes what was accepted.
  assert.ok(
    /fact\.status !== 'accepted'/.test(dispatcherCode),
    'the dispatcher must skip anything the operator did not accept',
  );
}

// ---------------------------------------------------------------- Contract B
// Accepted facts go through the canonical write paths, not around them.
{
  for (const canonical of ['createObjection', 'createStakeholder', 'updateOpportunity', 'createCommitment', 'savePlanItem']) {
    assert.ok(dispatcherCode.includes(canonical), `the dispatcher must route through ${canonical}`);
  }
  // No hand-rolled persistence beside them.
  for (const forbidden of ['localStorage.setItem', 'supabaseClient', 'fetch(']) {
    assert.equal(dispatcherCode.includes(forbidden), false, `the dispatcher must not write directly: ${forbidden}`);
  }

  // And the page no longer holds domain mutations of its own. This is the
  // migration: three bespoke handlers calling three stores from a component.
  for (const retired of ['createStakeholderFromLastActivity', 'createObjectionFromLastActivity', 'buildObjectionFromActivity']) {
    assert.equal(pageCode.includes(retired), false, `capture must no longer mutate from the page: ${retired}`);
  }
  assert.ok(pageCode.includes('commitCapturedFacts'), 'the page must dispatch through the one committer');

  // Every fact kind the parser can emit has a destination in the dispatcher.
  for (const kind of capturedFactKinds) {
    assert.ok(
      new RegExp(`case '${kind}'`).test(dispatcherCode),
      `no canonical destination for the ${kind} fact kind`,
    );
  }
}

// ---------------------------------------------------------------- Contract C
// Capture produces no recommendations of its own.
{
  for (const forbidden of ['rankRecommendations', 'evaluateCommercialPolicies', 'Recommendation', 'reasonCode']) {
    assert.equal(parserCode.includes(forbidden), false, `capture must not touch the recommendation layer: ${forbidden}`);
    assert.equal(dispatcherCode.includes(forbidden), false, `capture must not touch the recommendation layer: ${forbidden}`);
  }
}

// ---------------------------------------------------------------- Contract D
// Capture writes no events of its own; the commands it calls do that.
{
  for (const forbidden of ['recordCommercialEvent', 'appendEvent', 'commercial_events']) {
    assert.equal(dispatcherCode.includes(forbidden), false,
      `capture must not write history directly - the canonical command already does: ${forbidden}`);
    assert.equal(parserCode.includes(forbidden), false, `the parser must not write history: ${forbidden}`);
  }
}

// ---------------------------------------------------------------- Contract E
// The note itself is kept, exactly.
{
  const padded = `  ${NOTE}  `;
  assert.equal(parse(padded).rawCapture, padded, 'the raw note must survive parsing untouched');
  assert.ok(parserCode.includes('rawCapture: input.rawCapture'),
    'the change set must carry the original text, not a cleaned copy');
}

// ---------------------------------------------------------------- Contract F
// A captured change and a typed change are the same change.
{
  // The value fact routes through `updateOpportunity`, which is the same call a
  // person makes on the deal form - so it emits the same
  // `opportunity_value_changed` event and Delta cannot tell them apart.
  const valueCase = dispatcherCode.slice(dispatcherCode.indexOf("case 'opportunity_value'"));
  assert.ok(
    valueCase.includes('updateOpportunity') && valueCase.includes('opportunityToFormInput'),
    'a captured value change must go through the canonical opportunity update',
  );
  assert.equal(
    /saveLocalOpportunityRecord|opportunities\.v1/.test(dispatcherCode),
    false,
    'capture must not reach past the command into the opportunity store',
  );

  const commitmentCase = dispatcherCode.slice(dispatcherCode.indexOf("case 'commitment'"));
  assert.ok(commitmentCase.includes('createCommitment'), 'a captured promise must use the kernel command');
}

// ---------------------------------------------------------------- Contract G
// An uncertain customer never becomes a new one.
{
  // A note naming nobody on the books resolves to no account rather than to
  // whatever the text happened to look like.
  const stranger = parse('Met Anna Vu today. They are worried about lead time.');
  assert.equal(stranger.target.accountName, '', 'an unknown name must not become an account');

  const ambiguous = parse('Met Rohto today.', {
    accounts: [{ id: 'a', accountName: 'Rohto Vietnam' }, { id: 'b', accountName: 'Rohto Japan' }],
    opportunities: [],
  });
  assert.equal(ambiguous.target.accountName, '', 'two equally good matches is a question, not a guess');

  // And nothing in the write path creates an account.
  assert.equal(dispatcherCode.includes('createAccount'), false,
    'capture must never create a customer record on its own');
}

// ---------------------------------------------------------------- Contract H
// Being in the room is not authority.
{
  const result = parse('Met John Pham from purchasing today. He was there for the demo.');
  assert.equal(
    /champion|economic buyer|decision maker|final approver/i.test(JSON.stringify(result)),
    false,
    'attendance must never be written up as decision authority',
  );
  const stakeholderCase = dispatcherCode.slice(dispatcherCode.indexOf("case 'stakeholder'"));
  assert.ok(
    /stakeholderRole:\s*'Unknown'/.test(stakeholderCase),
    'a captured person must land with an Unknown MEDDIC role, always',
  );
  assert.equal(
    /stakeholderRole:\s*['"](?!Unknown)/.test(dispatcherCode),
    false,
    'capture may never assign a MEDDIC role',
  );
}

// ---------------------------------------------------------------- Contract I
// Money kinds stay distinct, and an unpriced number stays unpriced.
{
  const approximate = parse('Likely PO around 400M.').facts.find((fact) => fact.kind === 'opportunity_value');
  assert.ok(approximate);
  assert.equal(approximate.approximate, true, 'an estimate must be marked as one');

  const exact = parse('PO value is 400,000,000 VND.').facts.find((fact) => fact.kind === 'opportunity_value');
  assert.equal(exact.approximate, false);
  assert.equal(exact.certainty, 'exact');

  // A quantity is not money.
  assert.deepEqual(
    parse('They asked about 400 units of the filter.').facts.filter((fact) => fact.kind === 'opportunity_value'),
    [],
    'a bare number in a sales note is a quantity until something makes it money',
  );

  // The parser has no currency table of its own.
  assert.ok(parserCode.includes('isSupportedCurrency'), 'currency validity comes from the shared money model');
  assert.equal(/EXCHANGE_RATES|26_000/.test(parserCode), false, 'capture must not carry a second currency model');

  // A value fact writes the deal estimate, never a quote or a payment.
  const valueCase = dispatcherCode.slice(dispatcherCode.indexOf("case 'opportunity_value'"));
  assert.equal(/createQuote|paymentStatus|poStatus/.test(valueCase), false,
    'an estimate must never be written as a quote or an order');
}

// ---------------------------------------------------------------- Contract J
// Dates keep their local, business-day meaning.
{
  const early = parseCapture({ rawCapture: 'I will send the quote Friday.', captureDate: '2026-09-05', context: context() });
  const later = parseCapture({ rawCapture: 'I will send the quote Friday.', captureDate: '2026-09-08', context: context() });
  const dueOf = (result) => result.facts.find((fact) => fact.kind === 'commitment')?.dueDate;

  assert.equal(dueOf(early), '2026-09-11');
  assert.equal(dueOf(later), '2026-09-11', 'the same week resolves to the same Friday');
  assert.match(dueOf(early), /^\d{4}-\d{2}-\d{2}$/, 'a due date is a day, never a timestamp');

  assert.ok(parserCode.includes('captureDate'), 'relative dates must resolve against an injected reference date');
  assert.equal(
    (parserCode.match(/new Date\(\)/g) || []).length,
    0,
    'the parser must read no clock of its own',
  );

  // A meeting that already happened is not a scheduled event.
  assert.deepEqual(
    parse('Met them on Sep 3. Nothing else agreed.').facts.filter((fact) => fact.kind === 'scheduled_event'),
    [],
  );
}

// ---------------------------------------------------------------- Contract K
// No AI, and no network, anywhere in this path.
{
  for (const source of [parserCode, dispatcherCode, panelCode]) {
    for (const marker of ['openai', 'anthropic', 'llm', 'fetch(', 'XMLHttpRequest', 'apiKey']) {
      assert.equal(source.toLowerCase().includes(marker.toLowerCase()), false,
        `capture must stay local and deterministic: ${marker}`);
    }
  }
  // The parser seam exists and has exactly one implementation.
  const irCode = readCode('src/domain/commercialKernel/capturedFacts.ts');
  assert.ok(irCode.includes('CaptureParser'), 'the parser interface must exist as the future seam');
}

// ---------------------------------------------------------------- Contract L
// No seventh destination. Capture stays the surface it already was.
{
  const app = readCode('src/App.tsx');
  for (const marker of ['CaptureReviewPanel', 'parseCapture', 'commitCapturedFacts']) {
    assert.equal(app.includes(marker), false, `capture review must not become a route: ${marker}`);
  }
  assert.equal(
    readCode('src/config/featureRegistry.ts').includes('capture-review'),
    false,
    'capture review must not become a navigable feature',
  );
}

// ---------------------------------------------------------------- Contract N
// Review is per fact: accept some, ignore others, edit before saving.
{
  assert.ok(panelCode.includes('type="checkbox"'), 'each proposal must be individually acceptable');
  assert.ok(/onSave\(/.test(panelCode) && /filter\(isAccepted\)/.test(panelCode),
    'only the accepted proposals may be saved');
  assert.ok(panelCode.includes('FactEditor'), 'a proposal must be correctable before it is saved');
  assert.ok(panelCode.includes('fact.evidence'), 'every proposal must show the words it came from');
  assert.ok(/already_recorded/.test(panelCode),
    'a proposal the workspace can already answer must be shown, not silently dropped');
}

// ---------------------------------------------------------------- Contract O
// One objection taxonomy, one commitment model.
{
  assert.ok(parserCode.includes('classifyObjectionType'), 'objections must use the shared classifier');
  for (const type of objectionTypes) {
    assert.equal(
      new RegExp(`'${type.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}'\\s*:`).test(parserCode),
      false,
      `the parser declares its own objection category "${type}" - there must be one taxonomy`,
    );
  }

  // The three parties come from the kernel, not from a second list.
  assert.equal(
    /const\s+\w*[Pp]arties\s*=\s*\[/.test(parserCode),
    false,
    'capture must not declare a second commitment-party list',
  );
  for (const party of commitmentParties) {
    assert.ok(
      parserCode.includes(`'${party}'`),
      `the parser must use the kernel's own commitment party: ${party}`,
    );
  }
}

// ---------------------------------------------------------------- Contract P
// No new table. Capture reuses the records that already exist.
{
  const sql = readdirSync('supabase/migrations')
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
    .join('\n')
    .toLowerCase();

  for (const speculative of ['captured_facts', 'capture_facts', 'capture_drafts', 'capture_review', 'proposed_facts']) {
    assert.equal(sql.includes(speculative), false, `capture must add no table: ${speculative}`);
  }
}

// ------------------------------------------------------------ measurement
{
  const metrics = readCode('src/services/captureFactMetrics.ts');
  // Categories and counts only. Nothing that could carry a customer's words.
  for (const forbidden of ['rawCapture', 'accountName', 'opportunityName', 'objectionText', 'amount', 'evidence']) {
    assert.equal(metrics.includes(forbidden), false,
      `capture measurement must never touch commercial content: ${forbidden}`);
  }
  assert.equal(/fetch\(|endpoint/.test(metrics), false, 'capture measurement stays on the device');
}

console.log('Capture facts verified: the parser proposes, the operator decides, and canonical commands write.');
