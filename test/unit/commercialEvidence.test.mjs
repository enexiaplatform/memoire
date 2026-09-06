import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentEvidenceFor,
  evidenceCategories,
  evidenceCategoryDimensions,
  evidenceDirections,
  projectCurrentEvidence,
  supportingEvidenceFor,
} from '../../src/domain/commercialKernel/commercialEvidence.ts';
import { deriveCommercialDelta } from '../../src/domain/commercialKernel/deriveDelta.ts';
import { evaluateCommercialPolicies } from '../../src/domain/commercialKernel/policyEngine.ts';
import { rankRecommendations } from '../../src/domain/commercialKernel/rankRecommendations.ts';
import { parseCapture } from '../../src/domain/commercialKernel/parseCapture.ts';
import { diffOpportunityState } from '../../src/domain/commercialKernel/opportunityChanges.ts';
import { evidenceCodec } from '../../src/services/commercialKernel/evidenceStore.ts';

const TODAY = new Date('2026-09-06T00:00:00.000Z');
const ACCOUNT = 'Rohto Pharma';
const OPPORTUNITY_ID = 'opp-1';

const ago = (days) => new Date(TODAY.getTime() - days * 86_400_000).toISOString();
const agoDate = (days) => ago(days).slice(0, 10);
const inDays = (days) => new Date(TODAY.getTime() + days * 86_400_000).toISOString().slice(0, 10);

const opportunitySubject = {
  kind: 'opportunity', id: OPPORTUNITY_ID, name: 'Analyser rollout', accountName: ACCOUNT,
};

const evidence = (patch = {}) => ({
  id: 'ev-1',
  userId: null,
  accountName: ACCOUNT,
  accountId: '',
  opportunityId: OPPORTUNITY_ID,
  threadId: null,
  category: 'technical_outcome',
  direction: 'positive',
  summary: 'Trial passed',
  evidenceText: 'Trial passed but they still need clarification on GPT verification.',
  observedAt: agoDate(1),
  recordedAt: ago(1),
  sourceActivityId: 'act-1',
  sourceType: 'capture',
  sourceId: 'act-1',
  sourceUrl: null,
  sourceUpdatedAt: null,
  createdAt: ago(1),
  updatedAt: ago(1),
  ...patch,
});

const opportunity = (patch = {}) => ({
  id: OPPORTUNITY_ID,
  accountName: ACCOUNT,
  opportunityName: 'Analyser rollout',
  stage: 'Demo',
  estimatedValue: 400_000_000,
  currency: 'VND',
  expectedClosePeriod: 'Q4 2026',
  productOrSolution: 'Analyser',
  decisionMaker: '',
  budgetOwner: '',
  procurementPath: '',
  technicalCriteria: '',
  nextAction: 'Send validation pack',
  nextActionDate: inDays(4),
  evidence: '',
  missingContext: '',
  objectionDebt: '',
  forecastEvidenceCategory: 'Weak but recoverable',
  decisionRecommendation: 'Monitor',
  status: 'Active',
  createdAt: ago(60),
  updatedAt: ago(1),
  storageMode: 'local',
  ...patch,
});

const derive = (patch = {}) => deriveCommercialDelta({
  subject: opportunitySubject,
  events: [],
  commitments: [],
  planItems: [],
  objections: [],
  stakeholders: [],
  activities: [],
  opportunityOutcomes: [],
  evidence: [],
  recommendations: [],
  observedFrom: null,
  today: TODAY,
  ...patch,
});

const policies = (patch = {}) => evaluateCommercialPolicies({
  threads: [],
  commitments: [],
  opportunities: [opportunity()],
  quotes: [],
  today: TODAY,
  ...patch,
});

const parseContext = (patch = {}) => ({
  accounts: [{ id: 'acct-1', accountName: ACCOUNT }],
  opportunities: [{
    id: OPPORTUNITY_ID, accountName: ACCOUNT, opportunityName: 'Analyser rollout',
    productOrSolution: 'Analyser', stage: 'Demo', currency: 'VND', estimatedValue: 400_000_000,
  }],
  objections: [],
  stakeholders: [],
  openCommitments: [],
  evidence: [],
  reportingCurrency: 'VND',
  ...patch,
});

const parse = (rawCapture, contextPatch = {}) => parseCapture({
  rawCapture,
  captureDate: agoDate(0),
  context: parseContext(contextPatch),
});

const findingOf = (changeSet) => changeSet.facts.find((fact) => fact.kind === 'commercial_evidence');

// --------------------------------------------------------- evidence semantics

describe('commercial evidence - semantics', () => {
  test('1. "Trial passed" is read as positive technical evidence', () => {
    const fact = findingOf(parse('Met QC today. Trial passed.'));
    assert.ok(fact, 'expected a finding');
    assert.equal(fact.category, 'technical_outcome');
    assert.equal(fact.direction, 'positive');
    assert.equal(fact.certainty, 'exact');
  });

  test('2. "Trial failed" is read as negative technical evidence', () => {
    const fact = findingOf(parse('Trial failed on the third run.'));
    assert.ok(fact);
    assert.equal(fact.direction, 'negative');
    assert.equal(fact.summary, 'Trial did not pass');
  });

  test('3. "Trial ongoing" does not become positive', () => {
    const fact = findingOf(parse('Trial ongoing at the plant.'));
    assert.ok(fact);
    assert.equal(fact.direction, 'neutral');
    assert.notEqual(fact.certainty, 'exact');
  });

  test('4. "Trial looks promising" does not claim acceptance', () => {
    const fact = findingOf(parse('Trial looks promising so far.'));
    assert.ok(fact);
    assert.equal(fact.direction, 'neutral');
    assert.equal(fact.certainty, 'ambiguous');
    assert.ok(!/passed/i.test(fact.summary), `overclaimed: ${fact.summary}`);
  });

  test('4b. a hedge in front of a positive result still refuses the verdict', () => {
    const fact = findingOf(parse('The trial should pass and it looks good so far.'));
    assert.ok(fact);
    assert.equal(fact.direction, 'neutral');
    assert.equal(fact.certainty, 'ambiguous');
  });

  test('4c. a sentence carrying both a failure and a pass is inconclusive, not guessed', () => {
    const fact = findingOf(parse('Trial failed on run two but the retest passed.'));
    assert.ok(fact);
    assert.equal(fact.direction, 'neutral');
    assert.equal(fact.certainty, 'ambiguous');
  });

  test('4d. "Trial looks good" is positive but never exact', () => {
    const fact = findingOf(parse('Trial looks good.'));
    assert.ok(fact);
    assert.equal(fact.direction, 'positive');
    assert.equal(fact.certainty, 'inferred');
  });

  test('4e. a result word with no subject proposes nothing', () => {
    assert.equal(findingOf(parse('It passed.')), undefined);
    assert.equal(findingOf(parse('The meeting went well.')), undefined);
  });

  test('5. the source sentence is preserved on the proposal', () => {
    const note = 'QC accepted the technical result yesterday.';
    const fact = findingOf(parse(note));
    assert.ok(fact.evidence.includes('QC accepted the technical result'));
  });

  test('5b. the store refuses a record with no sentence behind it', () => {
    assert.equal(evidenceCodec.sanitize({ ...evidence(), evidenceText: '   ' }), null);
    assert.equal(evidenceCodec.sanitize({ ...evidence(), observedAt: 'not a date' }), null);
    assert.ok(evidenceCodec.sanitize(evidence()));
  });

  test('6. positive then negative: the later observation is current', () => {
    const projection = projectCurrentEvidence([
      evidence({ id: 'a', direction: 'positive', observedAt: agoDate(6) }),
      evidence({ id: 'b', direction: 'negative', observedAt: agoDate(2) }),
    ]);
    const current = currentEvidenceFor(projection, { opportunityId: OPPORTUNITY_ID, accountName: ACCOUNT });
    assert.deepEqual(current.map((item) => item.id), ['b']);
    assert.ok(projection.supersededIds.has('a'));
  });

  test('7. negative then positive: the retest is current', () => {
    const projection = projectCurrentEvidence([
      evidence({ id: 'a', direction: 'negative', observedAt: agoDate(6) }),
      evidence({ id: 'b', direction: 'positive', observedAt: agoDate(2) }),
    ]);
    const current = currentEvidenceFor(projection, { opportunityId: OPPORTUNITY_ID, accountName: ACCOUNT });
    assert.deepEqual(current.map((item) => item.id), ['b']);
    assert.equal(projection.supersededBy.get('a'), 'b');
  });

  test('8. the latest relevant evidence drives the current reading, per scope', () => {
    const other = evidence({ id: 'x', opportunityId: 'opp-2', direction: 'negative', observedAt: agoDate(0) });
    const projection = projectCurrentEvidence([evidence({ id: 'a' }), other]);
    const here = currentEvidenceFor(projection, { opportunityId: OPPORTUNITY_ID, accountName: ACCOUNT });
    assert.deepEqual(here.map((item) => item.id), ['a'], 'another deal must not supersede this one');
    assert.equal(projection.supersededIds.size, 0);
  });

  test('9. superseded history is preserved, never deleted or rewritten', () => {
    const older = evidence({ id: 'a', direction: 'negative', observedAt: agoDate(6) });
    const records = [older, evidence({ id: 'b', observedAt: agoDate(2) })];
    projectCurrentEvidence(records);
    assert.equal(records.length, 2);
    assert.equal(records[0].direction, 'negative');
    assert.equal(records[0].observedAt, agoDate(6));
  });

  test('9b. an unreadable observed date loses the supersession contest', () => {
    const projection = projectCurrentEvidence([
      evidence({ id: 'good', observedAt: agoDate(4) }),
      evidence({ id: 'broken', observedAt: '31/02/2026' }),
    ]);
    assert.ok(projection.supersededIds.has('broken'));
  });

  test('9c. negative evidence is recorded but never counts as stage support', () => {
    const projection = projectCurrentEvidence([evidence({ direction: 'negative' })]);
    const scope = { opportunityId: OPPORTUNITY_ID, accountName: ACCOUNT };
    assert.equal(currentEvidenceFor(projection, scope).length, 1);
    assert.equal(supportingEvidenceFor(projection, scope).length, 0);
  });
});

// ------------------------------------------------------------------- capture

describe('commercial evidence - capture', () => {
  test('10. a proposal is not a record: parsing writes nothing and stays "proposed"', () => {
    const fact = findingOf(parse('Trial passed.'));
    assert.equal(fact.status, 'proposed');
  });

  test('11. accepting is the operator\'s act, and carries the whole fact forward', () => {
    const fact = findingOf(parse('Trial passed.'));
    const accepted = { ...fact, status: 'accepted' };
    assert.equal(accepted.direction, 'positive');
    assert.equal(accepted.category, 'technical_outcome');
  });

  test('12. ignoring leaves nothing behind', () => {
    const changeSet = parse('Trial passed.');
    const kept = changeSet.facts.filter((item) => item.status === 'accepted');
    assert.equal(kept.length, 0);
  });

  test('13. direction and summary are editable before saving', () => {
    const fact = findingOf(parse('Trial looks promising so far.'));
    const edited = { ...fact, direction: 'positive', summary: 'Trial accepted by QC' };
    assert.equal(edited.direction, 'positive');
    assert.equal(edited.summary, 'Trial accepted by QC');
  });

  test('14. the identical finding already on the books is marked, not re-proposed', () => {
    const changeSet = parse(`${ACCOUNT}: trial passed.`, {
      evidence: [{
        id: 'ev-existing', accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
        category: 'technical_outcome', direction: 'positive', summary: 'Trial passed',
      }],
    });
    const fact = findingOf(changeSet);
    assert.equal(fact.status, 'already_recorded');
    assert.equal(fact.duplicateOf, 'ev-existing');
  });

  test('14b. the same trial pointing the other way is news, not a duplicate', () => {
    const changeSet = parse(`${ACCOUNT}: trial failed on the third run.`, {
      evidence: [{
        id: 'ev-existing', accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
        category: 'technical_outcome', direction: 'positive', summary: 'Trial passed',
      }],
    });
    assert.equal(findingOf(changeSet).status, 'proposed');
  });

  test('15. a trial result is no longer listed as having nowhere to go', () => {
    const changeSet = parse('Trial passed.');
    assert.ok(!changeSet.unsupported.some((item) => item.label === 'Trial result'));
  });

  test('15b. a trial sentence the reader cannot resolve is still listed honestly', () => {
    const changeSet = parse('Trial results were mixed.');
    assert.equal(findingOf(changeSet), undefined);
    assert.ok(changeSet.unsupported.some((item) => item.label === 'Trial result'));
  });
});

// -------------------------------------------------------------- intelligence

describe('commercial evidence - intelligence', () => {
  test('16. recorded support removes the obsolete "no stage evidence" nag', () => {
    const without = policies();
    assert.ok(without.some((item) => item.reasonCode === 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE'));

    const withEvidence = policies({ evidence: [evidence()] });
    assert.ok(!withEvidence.some((item) => item.reasonCode === 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE'));
  });

  test('16b. negative evidence leaves the gap standing - it is not support', () => {
    const found = policies({ evidence: [evidence({ direction: 'negative' })] });
    assert.ok(found.some((item) => item.reasonCode === 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE'));
  });

  test('17. positive technical evidence does not touch money or purchasing urgency', () => {
    const quoteRecommendation = {
      id: 'rec-quote', reasonCode: 'QUOTE_EXPIRING',
      reasonText: 'The quote expires in 3 days.', sourceRecordIds: ['q-1'], threshold: 7,
      severity: 'high', recommendedAction: 'Chase the decision.',
      calculatedAt: TODAY.toISOString(), accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
      href: '/app/revenue',
    };
    const changes = derive({ evidence: [evidence()] }).changes;
    assert.equal(changes.length, 1, 'the finding should be an observed change');

    const withEvidence = rankRecommendations({
      recommendations: [quoteRecommendation], opportunities: [opportunity()], quotes: [],
      commitments: [], objections: [], observedChanges: changes, today: TODAY,
    });
    const without = rankRecommendations({
      recommendations: [quoteRecommendation], opportunities: [opportunity()], quotes: [],
      commitments: [], objections: [], observedChanges: [], today: TODAY,
    });
    assert.equal(withEvidence.ranked[0].urgency, without.ranked[0].urgency);
    assert.deepEqual(withEvidence.ranked[0].supportingChangeIds, []);
  });

  test('18. negative technical evidence raises the technical work that answers it', () => {
    const stageGap = policies({ evidence: [evidence({ direction: 'negative' })] })
      .find((item) => item.reasonCode === 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE');
    const changes = derive({ evidence: [evidence({ direction: 'negative' })] }).changes;

    const raised = rankRecommendations({
      recommendations: [stageGap], opportunities: [opportunity()], quotes: [],
      commitments: [], objections: [], observedChanges: changes, today: TODAY,
    });
    const flat = rankRecommendations({
      recommendations: [stageGap], opportunities: [opportunity()], quotes: [],
      commitments: [], objections: [], observedChanges: [], today: TODAY,
    });
    assert.notEqual(raised.ranked[0].urgency, flat.ranked[0].urgency);
    assert.ok(raised.ranked[0].supportingChangeIds.length > 0);
  });

  test('19. evidence produces no recommendation of its own', () => {
    const produced = policies({ evidence: [evidence({ direction: 'negative' })] });
    const ranked = rankRecommendations({
      recommendations: produced, opportunities: [opportunity()], quotes: [],
      commitments: [], objections: [], today: TODAY,
    });
    const ids = new Set(produced.map((item) => item.id));
    for (const item of ranked.ranked) assert.ok(ids.has(item.id), `invented ${item.id}`);
    assert.equal(ranked.ranked.length + ranked.suppressed.length, produced.length);
  });

  test('20. evidence reaches Delta through the record, never through its own event', () => {
    const withRecord = derive({ evidence: [evidence()] });
    assert.equal(withRecord.changes.length, 1);
    assert.equal(withRecord.changes[0].provenance, 'record_occurrence');
    assert.equal(withRecord.changes[0].dimension, 'technical');
    assert.equal(withRecord.changes[0].direction, 'improved');

    // The event the command writes must not produce a second row for the same
    // finding, or every trial would be reported twice.
    const withEvent = derive({
      events: [{
        id: 'evt-ev', userId: null, eventType: 'evidence_recorded', occurredAt: ago(1),
        recordedAt: ago(1), accountId: null, opportunityId: OPPORTUNITY_ID, threadId: null,
        commitmentId: null, summary: 'Technical evidence: Trial passed',
        structuredPayload: { category: 'technical_outcome', direction: 'positive' },
        idempotencyKey: null, sourceType: 'capture', sourceId: null, sourceUrl: null,
        sourceUpdatedAt: null, createdAt: ago(1),
      }],
      evidence: [evidence()],
    });
    assert.equal(withEvent.changes.length, 1);
  });

  test('21. a superseded finding is listed but applies no pressure', () => {
    const records = [
      evidence({ id: 'stale', direction: 'negative', observedAt: agoDate(5) }),
      evidence({ id: 'fresh', direction: 'positive', observedAt: agoDate(1) }),
    ];
    const delta = derive({ evidence: records });
    assert.equal(delta.changes.length, 2, 'history stays visible');
    const stale = delta.changes.find((item) => item.id === 'evidence:stale');
    assert.equal(stale.supersededBy, 'fresh');
    assert.equal(stale.direction, 'weakened', 'the old row keeps its own truth');

    const stageGap = {
      id: 'rec-stage', reasonCode: 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE',
      reasonText: 'No evidence.', sourceRecordIds: [OPPORTUNITY_ID], threshold: 1,
      severity: 'medium', recommendedAction: 'Record what happened.',
      calculatedAt: TODAY.toISOString(), accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
      href: '/app/opportunities',
    };
    const ranked = rankRecommendations({
      recommendations: [stageGap], opportunities: [opportunity()], quotes: [],
      commitments: [], objections: [], observedChanges: delta.changes, today: TODAY,
    });
    assert.ok(
      !ranked.ranked[0].supportingChangeIds.includes('evidence:stale'),
      'a replaced finding must not keep pushing',
    );
  });

  test('21b. the reading skips superseded findings so one fortnight is not both ways', () => {
    const delta = derive({
      evidence: [
        evidence({ id: 'stale', direction: 'negative', observedAt: agoDate(5) }),
        evidence({ id: 'fresh', direction: 'positive', observedAt: agoDate(1) }),
      ],
    });
    assert.ok(delta.interpretation);
    assert.deepEqual(delta.interpretation.basis, ['evidence:fresh']);
  });

  test('21c. every category is mapped onto a dimension the kernel already reasons in', () => {
    for (const category of evidenceCategories) {
      assert.ok(evidenceCategoryDimensions[category], `unmapped category: ${category}`);
    }
    assert.deepEqual([...evidenceDirections], ['positive', 'negative', 'neutral']);
  });
});

// --------------------------------------------------------- parser hardening

describe('capture coverage - parser hardening', () => {
  test('22. "had a chat with Lan" proposes the person', () => {
    const fact = parse('Had a chat with Lan Nguyen about the retest.')
      .facts.find((item) => item.kind === 'stakeholder');
    assert.ok(fact, 'expected a stakeholder');
    assert.equal(fact.name, 'Lan Nguyen');
  });

  test('23. "sat down with Lan" proposes the person', () => {
    const fact = parse('Sat down with Lan Nguyen yesterday.')
      .facts.find((item) => item.kind === 'stakeholder');
    assert.ok(fact);
    assert.equal(fact.name, 'Lan Nguyen');
  });

  test('24. a non-person object is not turned into a stakeholder', () => {
    for (const note of [
      'Had a chat with the team about pricing.',
      'Sat down with purchasing to go through the terms.',
      `Had a chat with ${ACCOUNT} about the retest.`,
    ]) {
      const people = parse(note).facts.filter((item) => item.kind === 'stakeholder');
      assert.deepEqual(people, [], `invented a person from: ${note}`);
    }
  });

  test('25. "Site acceptance test on 14 October" is a scheduled event', () => {
    const fact = parse('Site acceptance test on 14 October.')
      .facts.find((item) => item.kind === 'scheduled_event');
    assert.ok(fact, 'expected an event');
    assert.equal(fact.date, '2026-10-14');
  });

  test('25b. a booked audit and a customer trial are events too', () => {
    for (const note of ['Audit on 3 November.', 'Customer trial scheduled for 20 October.']) {
      const fact = parse(note).facts.find((item) => item.kind === 'scheduled_event');
      assert.ok(fact, `no event from: ${note}`);
    }
  });

  test('26. an arbitrary dated sentence does not become a scheduled event', () => {
    for (const note of [
      'Payment is due on 30 October.',
      'The price list changes on 1 December.',
      'Order volumes on 12 October were low.',
      // The event noun is present and nothing is being booked. Without the
      // scheduling preposition, an audit that produced findings would be put
      // on the plan as an audit that has not happened yet.
      'Audit findings arrive 20 October.',
      'The demo unit ships 12 November.',
    ]) {
      const events = parse(note).facts.filter((item) => item.kind === 'scheduled_event');
      assert.deepEqual(events, [], `invented an event from: ${note}`);
    }
  });

  test('26b. a date already past is history, not a plan item', () => {
    const events = parse('Site acceptance test on 3 August 2026.')
      .facts.filter((item) => item.kind === 'scheduled_event');
    assert.deepEqual(events, []);
  });

  test('26c. a reported result is not also read as a booking', () => {
    const changeSet = parse(`Trial passed on ${inDays(3)}.`);
    assert.ok(findingOf(changeSet));
    assert.deepEqual(changeSet.facts.filter((item) => item.kind === 'scheduled_event'), []);
  });

  test('27. a promise already on the Plan is not proposed again', () => {
    const note = `${ACCOUNT} - I promised to send the validation explanation by Friday.`;
    const fresh = parse(note).facts.find((item) => item.kind === 'commitment');
    assert.ok(fresh, 'expected a commitment');
    assert.equal(fresh.status, 'proposed');

    const known = parse(note, {
      openCommitments: [{
        id: 'plan:derived-1', accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
        commitmentText: fresh.text,
      }],
    }).facts.find((item) => item.kind === 'commitment');
    assert.equal(known.status, 'already_recorded');
    assert.equal(known.duplicateOf, 'plan:derived-1');
  });
});

// --------------------------------------------------------------------- money

describe('capture coverage - money in Delta', () => {
  const valueEvent = (payload) => ({
    id: 'evt-value', userId: null, eventType: 'opportunity_value_changed', occurredAt: ago(2),
    recordedAt: ago(2), accountId: null, opportunityId: OPPORTUNITY_ID, threadId: null,
    commitmentId: null, summary: '', structuredPayload: payload, idempotencyKey: null,
    sourceType: 'manual', sourceId: null, sourceUrl: null, sourceUpdatedAt: null, createdAt: ago(2),
  });

  test('28. a value move is rendered through the product\'s own money formatter', () => {
    const [change] = derive({
      events: [valueEvent({ field: 'estimatedValue', from: '300000000', to: '450000000', currency: 'VND' })],
    }).changes;
    assert.ok(!/300000000/.test(change.statement), `raw digits leaked: ${change.statement}`);
    assert.match(change.statement, /300(\.0)?M VND/);
    assert.match(change.statement, /450(\.0)?M VND/);
  });

  test('29. the event payload keeps raw domain values, not formatted strings', () => {
    const [change] = diffOpportunityState(
      { ...opportunity(), estimatedValue: 300_000_000 },
      { ...opportunity(), estimatedValue: 450_000_000 },
    );
    assert.equal(change.from, '300000000');
    assert.equal(change.to, '450000000');
    assert.equal(change.currency, 'VND');

    const [item] = derive({
      events: [valueEvent({ field: 'estimatedValue', from: change.from, to: change.to, currency: change.currency })],
    }).changes;
    assert.equal(item.transition.from, '300000000', 'the observed before must stay canonical');
    assert.equal(item.transition.to, '450000000');
  });

  test('30. another currency formats in its own currency, and an unknown one stays raw', () => {
    const [euro] = derive({
      events: [valueEvent({ field: 'estimatedValue', from: '120000', to: '150000', currency: 'EUR' })],
    }).changes;
    assert.match(euro.statement, /EUR/);
    assert.ok(!/VND/.test(euro.statement));

    // Events written before the currency travelled with them. Rendering the raw
    // number is worse than a currency, and much better than the wrong one.
    const [legacy] = derive({
      events: [valueEvent({ field: 'estimatedValue', from: '120000', to: '150000' })],
    }).changes;
    assert.match(legacy.statement, /120000 → 150000/);
  });
});
