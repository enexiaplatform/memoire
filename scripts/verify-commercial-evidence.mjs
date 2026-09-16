import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  evidenceCategories,
  evidenceCategoryDimensions,
  evidenceDirections,
  projectCurrentEvidence,
} from '../src/domain/commercialKernel/commercialEvidence.ts';
import { deriveCommercialDelta } from '../src/domain/commercialKernel/deriveDelta.ts';
import { evaluateCommercialPolicies } from '../src/domain/commercialKernel/policyEngine.ts';
import { rankRecommendations } from '../src/domain/commercialKernel/rankRecommendations.ts';
import { parseCapture } from '../src/domain/commercialKernel/parseCapture.ts';
import { capturedFactKinds } from '../src/domain/commercialKernel/capturedFacts.ts';
import { objectionTypes } from '../src/services/objectionStore.ts';

/*
 * Commercial Evidence is what the seller has learned - as distinct from what
 * Memoire watched happen, from what the seller did, and from what the customer
 * objected to. Those are four different commercial truths and the product is
 * only worth trusting while it keeps them apart.
 *
 * The pressure on this record is always the same: it looks like a place to put
 * anything. These assertions are what stops it becoming one.
 */

const codeOf = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const readCode = (file) => codeOf(readFileSync(file, 'utf8'));

const domainCode = readCode('src/domain/commercialKernel/commercialEvidence.ts');
const storeCode = readCode('src/services/commercialKernel/evidenceStore.ts');
const parserCode = readCode('src/domain/commercialKernel/parseCapture.ts');
const dispatcherCode = readCode('src/domain/commercialKernel/commitCapturedFacts.ts');
const commandCode = readCode('src/domain/commercialKernel/commands.ts');
const deltaCode = readCode('src/domain/commercialKernel/deriveDelta.ts');
const rankingCode = readCode('src/domain/commercialKernel/rankRecommendations.ts');
const opportunityChangesCode = readCode('src/domain/commercialKernel/opportunityChanges.ts');
const capturePageCode = readCode('src/features/dailyCapture/DailyCapturePage.tsx');

const migrationSql = readdirSync('supabase/migrations')
  .filter((file) => file.endsWith('.sql'))
  .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
  .join('\n')
  .toLowerCase();

const TODAY = new Date('2026-09-06T00:00:00.000Z');
const ACCOUNT = 'Rohto Pharma';
const OPPORTUNITY_ID = 'opp-1';
const day = (offset) => new Date(TODAY.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

const evidence = (patch = {}) => ({
  id: 'ev-1', userId: null, accountName: ACCOUNT, accountId: '', opportunityId: OPPORTUNITY_ID,
  threadId: null, category: 'technical_outcome', direction: 'positive', summary: 'Trial passed',
  evidenceText: 'Trial passed but QC still needs clarification on GPT verification.',
  observedAt: day(-1), recordedAt: day(-1), sourceActivityId: 'act-1', sourceType: 'capture',
  sourceId: 'act-1', sourceUrl: null, sourceUpdatedAt: null, createdAt: day(-1), updatedAt: day(-1),
  ...patch,
});

const opportunity = (patch = {}) => ({
  id: OPPORTUNITY_ID, accountName: ACCOUNT, opportunityName: 'Analyser rollout', stage: 'Demo',
  estimatedValue: 400_000_000, currency: 'VND', expectedClosePeriod: 'Q4 2026',
  productOrSolution: 'Analyser', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: 'Send the pack', nextActionDate: day(4), evidence: '',
  missingContext: '', objectionDebt: '', forecastEvidenceCategory: 'Weak but recoverable',
  decisionRecommendation: 'Monitor', status: 'Active', createdAt: day(-60), updatedAt: day(-1),
  storageMode: 'local', ...patch,
});

const derive = (patch = {}) => deriveCommercialDelta({
  subject: { kind: 'opportunity', id: OPPORTUNITY_ID, name: 'Analyser rollout', accountName: ACCOUNT },
  events: [], commitments: [], planItems: [], objections: [], stakeholders: [], activities: [],
  opportunityOutcomes: [], evidence: [], recommendations: [], observedFrom: null, today: TODAY,
  ...patch,
});

const policies = (patch = {}) => evaluateCommercialPolicies({
  threads: [], commitments: [], opportunities: [opportunity()], quotes: [], today: TODAY, ...patch,
});

const parse = (raw, patch = {}) => parseCapture({
  rawCapture: raw,
  captureDate: day(0),
  context: {
    accounts: [{ id: 'acct-1', accountName: ACCOUNT }],
    opportunities: [{
      id: OPPORTUNITY_ID, accountName: ACCOUNT, opportunityName: 'Analyser rollout',
      stage: 'Demo', currency: 'VND', estimatedValue: 400_000_000,
    }],
    objections: [], stakeholders: [], openCommitments: [], evidence: [],
    reportingCurrency: 'VND', ...patch,
  },
});

// ---------------------------------------------------------------- Contract A
// Evidence is its own truth, not a second copy of an activity, an objection or
// a commitment. A record that duplicates one of those would let two surfaces
// disagree about the same fact with neither being obviously wrong.
{
  for (const forbidden of ['objectionText', 'commitmentText', 'rawNote', 'activityType', 'nextAction']) {
    assert.equal(
      domainCode.includes(forbidden),
      false,
      `Commercial Evidence is carrying another record's field: ${forbidden}`,
    );
  }
  assert.ok(
    domainCode.includes('evidenceText'),
    'evidence must carry the sentence it was read from, under its own name',
  );

  // A finding is not a nudge and not a task: it has no owner, no due date and
  // no status to be worked through.
  for (const forbidden of ['dueDate', 'ownerLabel', 'commitmentParty', 'recommendedAction']) {
    assert.equal(domainCode.includes(forbidden), false, `evidence grew a task field: ${forbidden}`);
  }
}

// ---------------------------------------------------------------- Contract B
// Capture still requires the operator to say yes.
{
  const finding = parse(`${ACCOUNT}: trial passed.`).facts
    .find((fact) => fact.kind === 'commercial_evidence');
  assert.ok(finding, 'a stated trial result must reach the review');
  assert.equal(finding.status, 'proposed', 'a parsed finding must never arrive accepted');

  assert.ok(
    /if\s*\(fact\.status\s*!==\s*'accepted'\)\s*continue;/.test(dispatcherCode),
    'the dispatcher must skip anything the operator did not accept',
  );
}

// ---------------------------------------------------------------- Contract C
// Evidence is written by the kernel command, never by the parser or the page.
{
  assert.ok(
    dispatcherCode.includes('recordCommercialEvidence'),
    'the dispatcher must route findings through the canonical command',
  );
  assert.ok(
    commandCode.includes('export function recordCommercialEvidence'),
    'the command must live with the other kernel commands',
  );
  for (const forbidden of ['recordCommercialEvidence', 'saveCommercialEvidence', 'evidenceStore']) {
    assert.equal(
      parserCode.includes(forbidden), false,
      `the parser must not be able to write evidence: ${forbidden}`,
    );
    assert.equal(
      capturePageCode.includes(forbidden), false,
      `the capture page must not write evidence directly: ${forbidden}`,
    );
  }
  assert.equal(
    domainCode.includes('supabase') || domainCode.includes('localStorage'), false,
    'the evidence domain model must not reach storage itself',
  );
}

// ---------------------------------------------------------------- Contract D
// Provenance is mandatory. A claim nobody can check is not evidence.
{
  assert.ok(
    /const evidenceText = text\(raw\.evidenceText\)\.trim\(\);\s*\n\s*if \(!evidenceText\) return null;/.test(storeCode),
    'the store must refuse a record with no sentence behind it',
  );
  assert.ok(
    /if \(!evidenceText\) return fail\(/.test(commandCode),
    'the command must refuse a record with no sentence behind it',
  );
  assert.ok(
    migrationSql.includes('evidence_text text not null check (char_length(btrim(evidence_text)) > 0)'),
    'the database must refuse an empty evidence sentence too',
  );
  assert.ok(storeCode.includes('sourceType'), 'evidence must record where it came from');
}

// ---------------------------------------------------------------- Contract E
// A later observation supersedes an earlier one without deleting it.
{
  const records = [
    evidence({ id: 'stale', direction: 'negative', observedAt: day(-5) }),
    evidence({ id: 'fresh', direction: 'positive', observedAt: day(-1) }),
  ];
  const projection = projectCurrentEvidence(records);
  assert.ok(projection.supersededIds.has('stale'), 'the older observation must be superseded');
  assert.equal(projection.supersededBy.get('stale'), 'fresh');
  assert.equal(records.length, 2, 'nothing may be removed');
  assert.equal(records[0].direction, 'negative', 'nothing may be rewritten');

  const delta = derive({ evidence: records });
  assert.equal(delta.changes.length, 2, 'the history stays visible in the delta');
  assert.equal(
    delta.interpretation.basis.join(','), 'evidence:fresh',
    'but the reading is built from the current record alone',
  );

  for (const forbidden of ['deleteEvidence', 'removeEvidence']) {
    assert.equal(
      `${domainCode}${storeCode}${commandCode}`.includes(forbidden), false,
      `evidence history must not be deletable: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract F
// Relevance is declared, not inferred. Every category is mapped onto a
// dimension the kernel already reasons in.
{
  for (const category of evidenceCategories) {
    assert.ok(evidenceCategoryDimensions[category], `category with no declared dimension: ${category}`);
  }
  assert.ok(
    /Record<EvidenceCategory, CommercialDimension>/.test(domainCode),
    'the category-to-dimension map must be total, so a new category is a compile error',
  );

  // Nearby is not relevant: a technical finding must not move money work.
  const quoteRecommendation = {
    id: 'rec-quote', reasonCode: 'QUOTE_EXPIRING', reasonText: 'Expires in 3 days.',
    sourceRecordIds: ['q-1'], threshold: 7, severity: 'high',
    recommendedAction: 'Chase the decision.', calculatedAt: TODAY.toISOString(),
    accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID, href: '/app/revenue',
  };
  const changes = derive({ evidence: [evidence()] }).changes;
  assert.equal(changes.length, 1, 'the fixture must produce one observed finding');
  const ranked = rankRecommendations({
    recommendations: [quoteRecommendation], opportunities: [opportunity()], quotes: [],
    commitments: [], objections: [], observedChanges: changes, today: TODAY,
  });
  assert.deepEqual(
    ranked.ranked[0].supportingChangeIds, [],
    'a technical finding must not be cited as pressure on a money recommendation',
  );
}

// ---------------------------------------------------------------- Contract G
// Evidence never generates a recommendation. It changes which of the kernel's
// own recommendations matter.
{
  const produced = policies({ evidence: [evidence({ direction: 'negative' })] });
  const ranked = rankRecommendations({
    recommendations: produced, opportunities: [opportunity()], quotes: [],
    commitments: [], objections: [], today: TODAY,
  });
  const ids = new Set(produced.map((item) => item.id));
  for (const item of ranked.ranked) {
    assert.ok(ids.has(item.id), `ranking invented a candidate: ${item.id}`);
  }
  assert.equal(
    ranked.ranked.length + ranked.suppressed.length, produced.length,
    'every produced recommendation must be either ranked or reported as suppressed',
  );

  for (const forbidden of ['Recommendation', 'reasonCode', 'recommendedAction']) {
    assert.equal(
      domainCode.includes(forbidden), false,
      `the evidence model must not know about recommendations: ${forbidden}`,
    );
  }

  // And the one policy effect it does have is the truthful one: a rule may not
  // say "nothing recorded supports that stage" over a deal that has a recorded
  // finding, and negative evidence is not support.
  assert.ok(
    policies().some((item) => item.reasonCode === 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE'),
    'the fixture deal must start with the stage-evidence gap',
  );
  assert.ok(
    !policies({ evidence: [evidence()] })
      .some((item) => item.reasonCode === 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE'),
    'recorded support must clear the stage-evidence gap',
  );
  assert.ok(
    policies({ evidence: [evidence({ direction: 'negative' })] })
      .some((item) => item.reasonCode === 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE'),
    'a failed trial is recorded, and is not support for the stage',
  );
}

// ---------------------------------------------------------------- Contract H
// The category set is closed - in the type system and in the database.
{
  assert.ok(evidenceCategories.length > 0, 'there must be at least one category');
  assert.ok(evidenceCategories.length <= 4, 'the category set is meant to stay small');
  assert.deepEqual([...evidenceDirections], ['positive', 'negative', 'neutral']);

  const categoryCheck = `check (category in (${evidenceCategories.map((c) => `'${c}'`).join(', ')}))`;
  assert.ok(
    migrationSql.includes(categoryCheck),
    `the database must enforce the same closed category set: expected ${categoryCheck}`,
  );
  assert.ok(
    migrationSql.includes("check (direction in ('positive', 'negative', 'neutral'))"),
    'the database must enforce the closed direction set',
  );

  // No custom-field system by another name.
  for (const forbidden of ['customField', 'attributeName', 'attributeValue', 'fieldKey', 'Record<string, unknown>']) {
    assert.equal(
      domainCode.includes(forbidden), false,
      `evidence is turning into a generic attribute store: ${forbidden}`,
    );
  }
  // And no score. Direction is three words on purpose.
  for (const forbidden of ['confidence', 'weight', 'score']) {
    assert.equal(
      domainCode.toLowerCase().includes(forbidden), false,
      `evidence grew a number that would start making decisions: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract I
// Still no AI.
{
  for (const file of [
    'src/domain/commercialKernel/commercialEvidence.ts',
    'src/services/commercialKernel/evidenceStore.ts',
    'src/domain/commercialKernel/parseCapture.ts',
  ]) {
    const source = readFileSync(file, 'utf8');
    for (const forbidden of ['openai', 'anthropic', 'fetch(', 'XMLHttpRequest']) {
      assert.equal(
        source.toLowerCase().includes(forbidden.toLowerCase()), false,
        `${file} reaches a model or the network: ${forbidden}`,
      );
    }
  }
}

// ---------------------------------------------------------------- Contract J
// One objection taxonomy. Evidence must not become a second one.
{
  for (const type of objectionTypes) {
    assert.equal(
      domainCode.includes(`'${type}'`), false,
      `the evidence model is restating the objection taxonomy: ${type}`,
    );
  }
  assert.ok(
    capturedFactKinds.includes('objection') && capturedFactKinds.includes('commercial_evidence'),
    'objections and findings stay separate fact kinds',
  );
}

// ---------------------------------------------------------------- Contract K
// Capture's duplicate check reads the same merged commitments the rest of the
// product does, rather than a capture-only index of promises.
{
  assert.ok(
    capturePageCode.includes('mergePlanCommitments'),
    'the capture page must derive open promises the same way Today and Plan do',
  );
  assert.equal(
    /openCommitments:\s*\[\s*\]/.test(capturePageCode), false,
    'the capture page must not check for duplicate promises against an empty list',
  );

  const note = `${ACCOUNT} - I promised to send the validation explanation by Friday.`;
  const first = parse(note).facts.find((fact) => fact.kind === 'commitment');
  assert.ok(first, 'the fixture must produce a promise');
  const second = parse(note, {
    openCommitments: [{
      id: 'plan:derived-1', accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
      commitmentText: first.text,
    }],
  }).facts.find((fact) => fact.kind === 'commitment');
  assert.equal(second.status, 'already_recorded', 'a promise already on the Plan is not new');
  assert.equal(second.duplicateOf, 'plan:derived-1');
}

// ---------------------------------------------------------------- Contract L
// Money is formatted where a sentence is written, never inside the event.
{
  assert.equal(
    /formatCompactCurrencyAmount|formatCurrencyAmount|formatMoneyWithBase/.test(opportunityChangesCode),
    false,
    'the event payload must not be built from a presentation formatter',
  );
  assert.ok(
    deltaCode.includes('formatCompactCurrencyAmount'),
    'Delta must format money through the product\'s own formatter',
  );

  const valueEvent = {
    id: 'evt-value', userId: null, eventType: 'opportunity_value_changed', occurredAt: day(-2),
    recordedAt: day(-2), accountId: null, opportunityId: OPPORTUNITY_ID, threadId: null,
    commitmentId: null, summary: '',
    structuredPayload: { field: 'estimatedValue', from: '300000000', to: '450000000', currency: 'VND' },
    idempotencyKey: null, sourceType: 'manual', sourceId: null, sourceUrl: null,
    sourceUpdatedAt: null, createdAt: day(-2),
  };
  const [change] = derive({ events: [valueEvent] }).changes;
  assert.ok(
    !/\b300000000\b/.test(change.statement),
    `a raw amount reached the sentence: ${change.statement}`,
  );
  assert.match(change.statement, /VND/, 'the amount must carry its currency');
  assert.equal(
    change.transition.from, '300000000',
    'the observed before/after must stay a raw domain value',
  );
}

// ---------------------------------------------------------------- Contract M
// No seventh destination. Evidence appears where the deal already is.
{
  const routes = readCode('src/App.tsx');
  for (const forbidden of ['/app/evidence', 'EvidencePage', 'EvidenceCenter']) {
    assert.equal(routes.includes(forbidden), false, `evidence grew its own page: ${forbidden}`);
  }

  // Read from the registry the rail actually renders from, not from a second
  // hand-written copy of the destination list - a copy only ever checks what
  // somebody remembered to put in it.
  const registry = readCode('src/config/featureRegistry.ts');
  const block = registry.match(/export const PRIMARY_DESTINATION_IDS = \[([\s\S]*?)\] as const;/);
  assert.ok(block, 'featureRegistry must declare PRIMARY_DESTINATION_IDS');
  const destinations = [...block[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
  // Seven since Leads (2026-09-16), and seven is recorded as the ceiling - the
  // count is asserted exactly so evidence can never arrive as an eighth.
  assert.equal(destinations.length, 7, 'Memoire has seven primary destinations; evidence is not an eighth');
  assert.ok(
    !destinations.some((id) => id.includes('evidence')),
    `evidence became a navigation destination: ${destinations.join(', ')}`,
  );
  assert.ok(
    readCode('src/features/threads/DeltaPanel.tsx').includes('currentEvidence'),
    'current evidence should surface on the panel the deal already has',
  );
}

// ---------------------------------------------------------------- Contract N
// The parser stays conservative about what it is willing to call a result.
{
  const readingOf = (note) => parse(note).facts.find((fact) => fact.kind === 'commercial_evidence');

  assert.equal(readingOf(`${ACCOUNT}: trial passed.`).direction, 'positive');
  assert.equal(readingOf(`${ACCOUNT}: trial failed on the third run.`).direction, 'negative');

  for (const note of ['Trial ongoing at the plant.', 'Trial looks promising so far.']) {
    const reading = readingOf(note);
    assert.ok(reading, `expected a reading from: ${note}`);
    assert.equal(reading.direction, 'neutral', `overclaimed a verdict from: ${note}`);
  }

  for (const note of ['It passed.', 'The meeting went well.', 'Pricing looks good.']) {
    assert.equal(
      readingOf(note), undefined,
      `a result word with no evaluation subject became evidence: ${note}`,
    );
  }

  // A dated sentence is only a plan item when it names a kind of event.
  const events = (note) => parse(note).facts.filter((fact) => fact.kind === 'scheduled_event');
  assert.equal(events('Site acceptance test on 14 October.').length, 1);
  assert.equal(events('Payment is due on 30 October.').length, 0);
  // Noun present, nothing booked: the preposition is what separates an audit
  // being scheduled from an audit that already produced its findings.
  assert.equal(events('Audit findings arrive 20 October.').length, 0);
  assert.equal(events('The demo unit ships 12 November.').length, 0);
  assert.equal(events('Site acceptance test on 3 August 2026.').length, 0, 'a past date is history');
}

console.log(
  'Commercial evidence verified: what the seller learned is its own record, '
  + 'checkable, superseded rather than overwritten, and relevant only where it says it is.',
);
