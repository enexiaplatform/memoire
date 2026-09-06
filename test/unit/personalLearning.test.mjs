import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  derivePersonalLearning,
} from '../../src/domain/commercialLearning/derivePersonalLearning.ts';
import {
  evidenceStrengths,
  learningPatterns,
  learningSampleFloors,
  MEANINGFUL_EFFECT_POINTS,
  strengthFor,
} from '../../src/domain/commercialLearning/learningPatterns.ts';
import { personalEvidenceFor } from '../../src/domain/commercialLearning/personalEvidenceFor.ts';

const TODAY = new Date('2026-09-06T00:00:00.000Z');
const ACCOUNT = 'Rohto Pharma';
const OBSERVABLE = '2026-01-01';

const day = (offset) => new Date(TODAY.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const stamp = (dateKey) => `${dateKey}T00:00:00.000Z`;

const opportunity = (id, patch = {}) => ({
  id, accountName: ACCOUNT, opportunityName: `Deal ${id}`, stage: 'Proposal',
  estimatedValue: 100_000_000, currency: 'VND', expectedClosePeriod: 'Q3 2026',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '', missingContext: '',
  objectionDebt: '', forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor',
  status: 'Won', createdAt: stamp(OBSERVABLE), updatedAt: stamp(OBSERVABLE), storageMode: 'local',
  ...patch,
});

const outcome = (opportunityId, won, closedOn = day(-30), patch = {}) => ({
  id: `out-${opportunityId}`, opportunityId, accountName: ACCOUNT,
  opportunityName: `Deal ${opportunityId}`, outcome: won ? 'Won' : 'Lost', outcomeDate: closedOn,
  finalAmount: 100_000_000, currency: 'VND', forecastEvidenceCategoryBeforeOutcome: 'Defensible',
  decisionRecommendationBeforeOutcome: 'Defend', stageBeforeOutcome: 'Proposal',
  pipelineProbabilityBeforeOutcome: null, reasonCategory: 'Technical fit', reasonText: '',
  createdAt: stamp(closedOn), updatedAt: stamp(closedOn), storageMode: 'local', ...patch,
});

const evidenceRecord = (opportunityId, patch = {}) => ({
  id: `ev-${opportunityId}-${Math.random().toString(36).slice(2, 7)}`, userId: null,
  accountName: ACCOUNT, accountId: '', opportunityId, threadId: null,
  category: 'technical_outcome', direction: 'positive', summary: 'Trial passed',
  evidenceText: 'Trial passed at the plant.', observedAt: day(-40), recordedAt: stamp(day(-40)),
  sourceActivityId: null, sourceType: 'capture', sourceId: null, sourceUrl: null,
  sourceUpdatedAt: null, createdAt: stamp(day(-40)), updatedAt: stamp(day(-40)), ...patch,
});

const stakeholder = (opportunityId, name, patch = {}) => ({
  id: `sk-${opportunityId}-${name}`, accountId: '', accountName: ACCOUNT, opportunityId,
  opportunityName: '', name, roleTitle: '', stakeholderRole: 'Unknown', influenceLevel: 'Unknown',
  relationshipStrength: 'Developing', stance: 'Unknown', email: '', phone: '', notes: '', tags: [],
  lastInteractionDate: '', createdAt: stamp(day(-40)), updatedAt: stamp(day(-40)),
  storageMode: 'local', ...patch,
});

const commitment = (opportunityId, patch = {}) => ({
  id: `c-${opportunityId}-${Math.random().toString(36).slice(2, 7)}`, userId: null, threadId: '',
  accountId: '', accountName: ACCOUNT, opportunityId, commitmentParty: 'customer',
  ownerLabel: 'Purchasing', commitmentText: 'Decide', originalDueDate: day(-35),
  currentDueDate: day(-35), silenceThresholdDays: 3, status: 'open', impactType: 'none',
  dueDateHistory: [], sourceType: 'manual', createdAt: stamp(day(-40)), updatedAt: stamp(day(-40)),
  ...patch,
});

const activity = (opportunityId, patch = {}) => ({
  id: `a-${opportunityId}-${Math.random().toString(36).slice(2, 7)}`, accountName: ACCOUNT,
  opportunityName: '', activityType: 'Customer meeting', activityChannel: 'On-site visit',
  summary: '', nextAction: '', dueDate: '', tags: [], rawNote: '', activityDate: day(-40),
  linkedOpportunityId: opportunityId, linkedOpportunityName: '', linkedAccountName: ACCOUNT,
  linkStatus: 'Linked', createdAt: stamp(day(-40)), updatedAt: stamp(day(-40)),
  storageMode: 'local', ...patch,
});

const objection = (opportunityId, patch = {}) => ({
  id: `o-${opportunityId}-${Math.random().toString(36).slice(2, 7)}`, accountId: '',
  accountName: ACCOUNT, opportunityId, opportunityName: '', stakeholderId: '', stakeholderName: '',
  sourceActivityId: '', objectionType: 'Price', objectionText: 'Terms too short', impact: 'High',
  status: 'Resolved', requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '',
  resolvedAt: day(-35), tags: [], createdAt: stamp(day(-40)), updatedAt: stamp(day(-35)),
  storageMode: 'local', ...patch,
});

const quote = (opportunityId, patch = {}) => ({
  id: `q-${opportunityId}`, quoteId: `Q-${opportunityId}`, accountName: ACCOUNT, opportunityId,
  opportunityName: '', title: '', quoteDate: day(-60), validUntil: day(-20), amount: 100_000_000,
  currency: 'VND', grossMarginEstimate: null, discount: null, paymentTerm: '', status: 'Sent',
  poStatus: 'Pending', deliveryStatus: 'Not scheduled', expectedDeliveryDate: '',
  paymentStatus: 'Not due', paymentDueDate: '', nextAction: '', notes: '',
  createdAt: stamp(day(-60)), updatedAt: stamp(day(-60)), ...patch,
});

const derive = (patch = {}) => derivePersonalLearning({
  opportunities: [], opportunityOutcomes: [], activities: [], stakeholders: [], objections: [],
  quotes: [], commitments: [], evidence: [], today: TODAY, ...patch,
});

const patternOf = (result, id) => result.patterns.find((item) => item.patternId === id);

/**
 * A book of `wins + losses` closed deals, half of them "exposed" to whatever
 * the caller attaches. Deliberately verbose per deal so a test can state only
 * what it is about.
 */
function book(spec) {
  const opportunities = [];
  const outcomes = [];
  const extras = { evidence: [], stakeholders: [], commitments: [], activities: [], objections: [], quotes: [] };

  spec.forEach((entry, index) => {
    const id = `opp-${index}`;
    opportunities.push(opportunity(id, { status: entry.won ? 'Won' : 'Lost' }));
    outcomes.push(outcome(id, entry.won, entry.closedOn || day(-30)));
    if (entry.attach) entry.attach(id, extras);
  });

  return { opportunities, opportunityOutcomes: outcomes, ...extras };
}

// ------------------------------------------------------- cohort construction

describe('personal learning - cohort construction', () => {
  test('1. won and lost closed deals land on the right side of the outcome', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.evidence.push(evidenceRecord(id)) },
      { won: true, attach: (id, e) => e.evidence.push(evidenceRecord(id)) },
      { won: true, attach: (id, e) => e.evidence.push(evidenceRecord(id)) },
      { won: false },
      { won: false },
      { won: false },
      { won: false, attach: (id, e) => e.evidence.push(evidenceRecord(id)) },
      { won: false },
    ]);
    const pattern = patternOf(derive(workspace), 'technical_acceptance_before_close');
    assert.equal(pattern.exposed.won, 3);
    assert.equal(pattern.exposed.lost, 1);
    assert.equal(pattern.comparison.won, 0);
    assert.equal(pattern.comparison.lost, 4);
    assert.equal(pattern.sample, 8);
  });

  test('2. an open deal is not counted as an outcome', () => {
    const workspace = book([{ won: true, attach: (id, e) => e.evidence.push(evidenceRecord(id)) }]);
    workspace.opportunities.push(opportunity('opp-open', { status: 'Active' }));
    const pattern = patternOf(derive(workspace), 'technical_acceptance_before_close');
    assert.equal(pattern.sample, 1, 'only the deal with an outcome record counts');
  });

  test('3. an unreadable or future outcome date is excluded, never guessed', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.commitments.push(commitment(id)) },
      { won: false },
    ]);
    workspace.opportunities.push(opportunity('opp-bad'), opportunity('opp-future'));
    workspace.opportunityOutcomes.push(
      outcome('opp-bad', true, '31/02/2026'),
      outcome('opp-future', true, day(30)),
    );
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.sample, 2);
    assert.equal(pattern.diagnostics.reasons.outcome_date_unusable, 2);
  });

  test('4. sample and demo records stay out of a real workspace', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.commitments.push(commitment(id)) },
      { won: false },
    ]);
    workspace.opportunities.push(opportunity('opp-demo', { isSample: true, source: 'demo' }));
    workspace.opportunityOutcomes.push({ ...outcome('opp-demo', true), isSample: true, source: 'demo' });
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.sample, 2);
    assert.ok(!pattern.supportingRecordIds.includes('opp-demo'));
  });

  test('5. a deal that closed before the record type existed is excluded, not called absent', () => {
    // Evidence first appears 10 days ago; both deals closed 30 days ago.
    const workspace = book([{ won: true }, { won: false }]);
    workspace.evidence = [evidenceRecord('opp-other', {
      createdAt: stamp(day(-10)), observedAt: day(-10), recordedAt: stamp(day(-10)),
    })];
    const pattern = patternOf(derive(workspace), 'technical_acceptance_before_close');
    assert.equal(pattern.sample, 0, 'missing instrumentation is not evidence of absence');
    assert.equal(pattern.diagnostics.reasons.history_not_observable, 2);
    assert.equal(pattern.strength, 'insufficient');
  });

  test('5b. with no record of that kind at all, nothing is observable and nothing is claimed', () => {
    const workspace = book([{ won: true }, { won: false }, { won: true }, { won: false }]);
    const pattern = patternOf(derive(workspace), 'technical_acceptance_before_close');
    assert.equal(pattern.diagnostics.observableFrom, null);
    assert.equal(pattern.sample, 0);
    assert.match(pattern.limitations[0], /never recorded/i);
  });

  test('6. one deal per outcome: a retro written twice does not count the deal twice', () => {
    const workspace = book([{ won: true, attach: (id, e) => e.commitments.push(commitment(id)) }]);
    workspace.opportunityOutcomes.push({ ...outcome('opp-0', true), id: 'out-dup' });
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.sample, 1);
    assert.equal(pattern.diagnostics.reasons.duplicate_outcome, 1);
  });

  test('6b. Delayed and No decision are not folded into Lost', () => {
    const workspace = book([{ won: true, attach: (id, e) => e.commitments.push(commitment(id)) }]);
    workspace.opportunities.push(opportunity('opp-delayed'));
    workspace.opportunityOutcomes.push(outcome('opp-delayed', false, day(-30), { outcome: 'Delayed' }));
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.sample, 1);
    assert.equal(pattern.diagnostics.reasons.outcome_not_won_or_lost, 1);
  });
});

// ------------------------------------------------------------ time leakage

describe('personal learning - chronology and leakage', () => {
  const closedOn = day(-30);

  test('7. an activity dated after the outcome does not count as pre-close behaviour', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.activities.push(activity(id, { activityDate: day(-10) })) },
      { won: false, attach: (id, e) => e.activities.push(activity(id, { activityChannel: 'Email / message' })) },
    ]);
    const pattern = patternOf(derive(workspace), 'site_visit_before_close');
    assert.equal(pattern.exposed.deals, 0, 'a visit logged after the close is not a pre-close visit');
    assert.equal(pattern.diagnostics.reasons.chronology_unavailable, 1);
  });

  test('7b. an activity dated before but written up after the outcome is excluded too', () => {
    const workspace = book([
      {
        won: true,
        attach: (id, e) => e.activities.push(activity(id, {
          activityDate: day(-40), createdAt: stamp(day(-5)),
        })),
      },
      { won: false, attach: (id, e) => e.activities.push(activity(id, { activityChannel: 'Email / message' })) },
    ]);
    const pattern = patternOf(derive(workspace), 'site_visit_before_close');
    assert.equal(pattern.exposed.deals, 0, 'a touch typed up during the retro was not known while the deal ran');
  });

  test('8. technical evidence recorded after the outcome is ignored', () => {
    const workspace = book([
      {
        won: true,
        attach: (id, e) => e.evidence.push(evidenceRecord(id, {
          observedAt: day(-40), recordedAt: stamp(day(-5)), createdAt: stamp(day(-5)),
        })),
      },
      { won: false, attach: (id, e) => e.evidence.push(evidenceRecord(id)) },
    ]);
    const pattern = patternOf(derive(workspace), 'technical_acceptance_before_close');
    assert.equal(pattern.exposed.won, 0, 'evidence written after the close cannot back-date knowledge');
    assert.equal(pattern.comparison.won, 1);
  });

  test('9. a stakeholder added after the win does not count as pre-close coverage', () => {
    const workspace = book([
      {
        won: true,
        attach: (id, e) => {
          e.stakeholders.push(stakeholder(id, 'Lan'));
          e.stakeholders.push(stakeholder(id, 'Minh', { createdAt: stamp(day(-5)) }));
        },
      },
      { won: false, attach: (id, e) => e.stakeholders.push(stakeholder(id, 'Anh')) },
    ]);
    const pattern = patternOf(derive(workspace), 'stakeholder_breadth_before_close');
    assert.equal(pattern.exposed.deals, 0, 'one contact before the close is one contact');
    assert.equal(pattern.comparison.deals, 2);
  });

  test('10. a commitment created after the outcome does not count', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.commitments.push(commitment(id, { createdAt: stamp(day(-5)) })) },
      { won: false, attach: (id, e) => e.commitments.push(commitment(id)) },
    ]);
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.exposed.won, 0);
    assert.equal(pattern.exposed.lost, 1);
  });

  test('11. the deal\'s current stage cannot manufacture historical timing', () => {
    // Both deals are at "Negotiation" now. Nothing in the comparison may read
    // the live record's stage, because when it reached that stage is unknown.
    const workspace = book([
      { won: true, attach: (id, e) => e.commitments.push(commitment(id)) },
      { won: false, attach: (id, e) => e.commitments.push(commitment(id)) },
    ]);
    workspace.opportunities = workspace.opportunities.map((item) => ({ ...item, stage: 'Negotiation' }));
    const before = patternOf(derive(workspace), 'customer_commitment_before_close');

    workspace.opportunities = workspace.opportunities.map((item) => ({ ...item, stage: 'Lead' }));
    const after = patternOf(derive(workspace), 'customer_commitment_before_close');

    assert.deepEqual(
      { e: before.exposed, c: before.comparison },
      { e: after.exposed, c: after.comparison },
      'changing the live stage must not change a historical comparison',
    );
  });
});

// ------------------------------------------------------- technical evidence

describe('personal learning - technical evidence', () => {
  test('12. positive evidence before the close puts the deal in the exposed group', () => {
    const workspace = book([{ won: true, attach: (id, e) => e.evidence.push(evidenceRecord(id)) }]);
    assert.equal(patternOf(derive(workspace), 'technical_acceptance_before_close').exposed.deals, 1);
  });

  test('13. negative evidence is recorded history, and is not acceptance', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.evidence.push(evidenceRecord(id, { direction: 'negative' })) },
    ]);
    const pattern = patternOf(derive(workspace), 'technical_acceptance_before_close');
    assert.equal(pattern.exposed.deals, 0);
    assert.equal(pattern.comparison.deals, 1, 'the deal is still comparable, just not exposed');
  });

  test('14. a retest before the close supersedes the failure; one after it does not', () => {
    const inTime = book([
      {
        won: true,
        attach: (id, e) => {
          e.evidence.push(evidenceRecord(id, { direction: 'negative', observedAt: day(-45), recordedAt: stamp(day(-45)) }));
          e.evidence.push(evidenceRecord(id, { direction: 'positive', observedAt: day(-35), recordedAt: stamp(day(-35)) }));
        },
      },
    ]);
    assert.equal(
      patternOf(derive(inTime), 'technical_acceptance_before_close').exposed.deals, 1,
      'the retest happened before the close, so the deal closed with a pass on file',
    );

    const tooLate = book([
      {
        won: true,
        attach: (id, e) => {
          e.evidence.push(evidenceRecord(id, { direction: 'negative', observedAt: day(-45), recordedAt: stamp(day(-45)) }));
          e.evidence.push(evidenceRecord(id, { direction: 'positive', observedAt: day(-5), recordedAt: stamp(day(-5)) }));
        },
      },
    ]);
    assert.equal(
      patternOf(derive(tooLate), 'technical_acceptance_before_close').exposed.deals, 0,
      'a retest after the close cannot rewrite the state the deal closed in',
    );
  });
});

// -------------------------------------------------------------- commitments

describe('personal learning - commitments and channel', () => {
  test('19. a promise you made is not a promise the customer made', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.commitments.push(commitment(id, { commitmentParty: 'self', ownerLabel: 'You' })) },
      { won: false, attach: (id, e) => e.commitments.push(commitment(id, { commitmentParty: 'internal' })) },
    ]);
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.exposed.deals, 0);
    assert.equal(pattern.comparison.deals, 2);
  });

  test('22. an activity with no channel is "not stated", never "not a visit"', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.activities.push(activity(id, { activityChannel: '' })) },
      { won: false, attach: (id, e) => e.activities.push(activity(id, { activityChannel: 'On-site visit' })) },
    ]);
    const pattern = patternOf(derive(workspace), 'site_visit_before_close');
    assert.equal(pattern.comparison.deals, 0, 'a blank channel must not be read as no visit');
    assert.equal(pattern.exposed.deals, 1);
    assert.equal(pattern.diagnostics.reasons.chronology_unavailable, 1);
  });

  test('22b. a deal with nothing linked to it has unknown contact history, not none', () => {
    const workspace = book([
      { won: true },
      { won: false, attach: (id, e) => e.activities.push(activity(id)) },
    ]);
    const pattern = patternOf(derive(workspace), 'site_visit_before_close');
    assert.equal(pattern.sample, 1, 'a deal with no linked activity cannot answer the question');
  });

  test('quote silence reuses the kernel threshold, and an unquoted deal is not applicable', () => {
    const workspace = book([
      { won: false, attach: (id, e) => { e.quotes.push(quote(id)); e.activities.push(activity(id, { activityDate: day(-59) })); } },
      { won: true, attach: (id, e) => { e.quotes.push(quote(id)); e.activities.push(activity(id, { activityDate: day(-31) })); } },
      { won: true, attach: (id, e) => e.activities.push(activity(id)) },
    ]);
    const pattern = patternOf(derive(workspace), 'quote_silence_before_close');
    assert.equal(pattern.exposed.deals, 1, 'the deal quoted 60 days out with one touch the next day went quiet');
    assert.equal(pattern.comparison.deals, 1);
    assert.equal(pattern.diagnostics.reasons.question_not_applicable, 1);
  });

  test('a quoted deal with nothing linked to it is unknown, not quiet', () => {
    // The distinction the whole pattern rests on: one activity in a hundred
    // carries a deal link in a real workspace, so "no touches on file" is a
    // gap in linkage and reading it as silence would invent the finding.
    const workspace = book([
      { won: false, attach: (id, e) => e.quotes.push(quote(id)) },
      { won: true, attach: (id, e) => { e.quotes.push(quote(id)); e.activities.push(activity(id, { activityDate: day(-55), createdAt: stamp(day(-55)) })); } },
    ]);
    const pattern = patternOf(derive(workspace), 'quote_silence_before_close');
    assert.equal(pattern.sample, 1, 'the deal with no linked touch cannot answer the question');
    assert.equal(pattern.exposed.deals, 0);
    assert.equal(pattern.diagnostics.reasons.chronology_unavailable, 1);
  });

  test('an objection settled before the close is separated from one left open', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.objections.push(objection(id)) },
      { won: false, attach: (id, e) => e.objections.push(objection(id, { status: 'Open', resolvedAt: '' })) },
      { won: true },
    ]);
    const pattern = patternOf(derive(workspace), 'objection_resolved_before_close');
    assert.equal(pattern.exposed.deals, 1);
    assert.equal(pattern.comparison.deals, 1);
    assert.equal(pattern.diagnostics.reasons.question_not_applicable, 1);
  });

  test('an objection resolved after the close counts as still open at the close', () => {
    const workspace = book([
      { won: true, attach: (id, e) => e.objections.push(objection(id, { resolvedAt: day(-5) })) },
    ]);
    const pattern = patternOf(derive(workspace), 'objection_resolved_before_close');
    assert.equal(pattern.exposed.deals, 0);
    assert.equal(pattern.comparison.deals, 1);
  });
});

// ------------------------------------------------------------- effect + strength

describe('personal learning - evidence strength and effect', () => {
  const exposedWins = (wins, losses) => Array.from({ length: wins + losses }, (unused, index) => ({
    won: index < wins,
    attach: (id, e) => e.commitments.push(commitment(id)),
  }));
  const plainDeals = (wins, losses) => Array.from({ length: wins + losses }, (unused, index) => ({
    won: index < wins,
  }));

  test('26. a tiny sample is insufficient however clean the split', () => {
    const workspace = book([...exposedWins(2, 0), ...plainDeals(0, 2)]);
    // Commitments have to exist for the pattern to be observable at all.
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.strength, 'insufficient');
    assert.equal(pattern.direction, 'none');
  });

  test('27. one-sided cohorts are insufficient even at a large total', () => {
    const workspace = book([...exposedWins(20, 9), ...plainDeals(1, 0)]);
    workspace.commitments.push(commitment('opp-0'));
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.strength, 'insufficient', '29 against 1 is not a comparison');
    assert.equal(strengthFor(29, 1), 'insufficient');
  });

  test('28. an adequate sample with a small difference reports no difference', () => {
    // 12 exposed: 7 won (58%). 12 comparison: 7 won (58%). Zero points apart.
    const workspace = book([...exposedWins(7, 5), ...plainDeals(7, 5)]);
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.strength, 'developing');
    assert.equal(pattern.direction, 'none');
    assert.ok(Math.abs(pattern.effectPoints) < MEANINGFUL_EFFECT_POINTS);
    assert.match(pattern.reading, /No difference is visible/);
  });

  test('29. an adequate sample with a real difference is reported with its direction', () => {
    // 12 exposed: 10 won (83%). 12 comparison: 3 won (25%).
    const workspace = book([...exposedWins(10, 2), ...plainDeals(3, 9)]);
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.strength, 'developing');
    assert.equal(pattern.direction, 'exposed_higher');
    assert.ok(pattern.effectPoints >= MEANINGFUL_EFFECT_POINTS);
  });

  test('29b. the strength ladder matches the declared floors on both sides', () => {
    assert.equal(strengthFor(4, 4), 'early');
    assert.equal(strengthFor(learningSampleFloors.developing.perGroup, 14), 'developing');
    assert.equal(
      strengthFor(learningSampleFloors.established.perGroup, learningSampleFloors.established.perGroup + 16),
      'established',
    );
    // Total floor is more than twice the per-group floor on purpose.
    assert.equal(strengthFor(3, 3), 'insufficient', '6 deals clears the per-group floor and not the total');
  });

  test('30. the raw counts behind every conclusion are preserved', () => {
    const workspace = book([...exposedWins(10, 2), ...plainDeals(3, 9)]);
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.exposed.won + pattern.exposed.lost, pattern.exposed.deals);
    assert.equal(pattern.comparison.won + pattern.comparison.lost, pattern.comparison.deals);
    assert.equal(pattern.exposed.won, 10);
    assert.equal(pattern.comparison.lost, 9);
    assert.equal(pattern.supportingRecordIds.length, pattern.sample);
  });

  test('an empty group reports a null rate, never a zero', () => {
    const workspace = book(plainDeals(2, 2));
    workspace.commitments.push(commitment('opp-0'));
    const pattern = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.equal(pattern.exposed.deals, 1);
    assert.equal(pattern.effectPoints !== null, true);
    const empty = patternOf(derive(book(plainDeals(1, 1))), 'quote_silence_before_close');
    assert.equal(empty.exposed.winRatePercent, null);
    assert.equal(empty.effectPoints, null);
  });
});

// ------------------------------------------------------------------ language

describe('personal learning - language', () => {
  const CAUSAL = /\b(increases?|improves?|boosts?|causes?|leads? to|results? in|drives?|makes? .* more likely|you should|always|guarantee)\b/i;

  test('31. no reading claims a cause', () => {
    const workspace = book([
      ...Array.from({ length: 12 }, (unused, index) => ({
        won: index < 10, attach: (id, e) => e.commitments.push(commitment(id)),
      })),
      ...Array.from({ length: 12 }, (unused, index) => ({ won: index < 3 })),
    ]);
    for (const pattern of derive(workspace).patterns) {
      assert.ok(!CAUSAL.test(pattern.reading), `causal wording: ${pattern.reading}`);
      for (const limitation of pattern.limitations) {
        assert.ok(!CAUSAL.test(limitation), `causal wording: ${limitation}`);
      }
    }
    const reported = patternOf(derive(workspace), 'customer_commitment_before_close');
    assert.match(reported.reading, /in your recorded history/i);
  });

  test('32. the insufficient state says so plainly rather than hedging a claim', () => {
    const pattern = patternOf(derive(book([{ won: true }, { won: false }])), 'customer_commitment_before_close');
    assert.equal(pattern.strength, 'insufficient');
    assert.match(pattern.reading, /Not enough comparable closed deals/i);
  });

  test('33. strength is one of four words and never a percentage', () => {
    for (const pattern of derive(book([{ won: true }])).patterns) {
      assert.ok(evidenceStrengths.includes(pattern.strength));
      assert.equal(typeof pattern.strength, 'string');
    }
    assert.deepEqual([...evidenceStrengths], ['insufficient', 'early', 'developing', 'established']);
  });

  test('every registered pattern names both groups and a dimension', () => {
    for (const pattern of learningPatterns) {
      assert.ok(pattern.exposedLabel.trim(), `${pattern.id} has no exposed label`);
      assert.ok(pattern.comparisonLabel.trim(), `${pattern.id} has no comparison label`);
      assert.ok(pattern.dimension, `${pattern.id} has no dimension`);
      assert.ok(pattern.question.endsWith('?'), `${pattern.id} does not ask a question`);
    }
  });
});

// ----------------------------------------------------------------------- NBA

describe('personal learning - next best action', () => {
  const recommendation = (id, reasonCode) => ({
    id, reasonCode, reasonText: 'Something is true about this deal.', sourceRecordIds: ['opp-0'],
    threshold: 1, severity: 'medium', recommendedAction: 'Do the thing.',
    calculatedAt: TODAY.toISOString(), accountName: ACCOUNT, opportunityId: 'opp-0',
    href: '/app/opportunities',
  });

  const maturePattern = (patch = {}) => ({
    patternId: 'customer_commitment_before_close', label: 'A promise from the customer',
    question: 'q?', dimension: 'momentum',
    exposed: { deals: 12, won: 10, lost: 2, winRatePercent: 83 },
    comparison: { deals: 12, won: 3, lost: 9, winRatePercent: 25 },
    sample: 24, effectPoints: 58, direction: 'exposed_higher', strength: 'developing',
    reading: 'In your recorded history, deals where the customer had promised something have closed won more often.',
    limitations: [], supportingRecordIds: [], diagnostics: { usable: 24, excluded: 0, reasons: {}, observableFrom: OBSERVABLE },
    calculatedAt: TODAY.toISOString(), ...patch,
  });

  test('34. insufficient learning reaches nothing', () => {
    const evidence = personalEvidenceFor(
      [maturePattern({ strength: 'insufficient' })],
      [recommendation('rec-1', 'THREAD_SILENT')],
    );
    assert.deepEqual(evidence, []);
  });

  test('35. an early pattern is not quoted beside a recommendation either', () => {
    const evidence = personalEvidenceFor(
      [maturePattern({ strength: 'early' })],
      [recommendation('rec-1', 'THREAD_SILENT')],
    );
    assert.deepEqual(evidence, []);
  });

  test('36. a matured, relevant pattern is quoted - and only as a rationale line', () => {
    const evidence = personalEvidenceFor(
      [maturePattern()],
      [recommendation('rec-1', 'THREAD_SILENT')],
    );
    assert.equal(evidence.length, 1);
    assert.deepEqual(evidence[0].recommendationIds, ['rec-1']);
    assert.match(evidence[0].reading, /From your own history \(24 comparable closed deals\)/);
    assert.deepEqual(Object.keys(evidence[0]).sort(), ['reading', 'recommendationIds']);
  });

  test('37. an unrelated pattern cannot reach a recommendation', () => {
    const technical = maturePattern({ patternId: 'technical_acceptance_before_close', dimension: 'technical' });
    // QUOTE_EXPIRING is about money and purchasing. A technical pattern is not
    // evidence about a quote running out.
    const evidence = personalEvidenceFor([technical], [recommendation('rec-1', 'QUOTE_EXPIRING')]);
    assert.deepEqual(evidence, []);
  });

  test('38. a pattern with no visible difference is not quoted as if it were one', () => {
    const evidence = personalEvidenceFor(
      [maturePattern({ direction: 'none', effectPoints: 2 })],
      [recommendation('rec-1', 'THREAD_SILENT')],
    );
    assert.deepEqual(evidence, []);
  });
});

// ------------------------------------------------------------- determinism

describe('personal learning - determinism', () => {
  test('39. the same records and the same day produce the same answer', () => {
    const workspace = book([
      ...Array.from({ length: 12 }, (unused, index) => ({
        won: index < 10, attach: (id, e) => e.commitments.push(commitment(id)),
      })),
      ...Array.from({ length: 12 }, (unused, index) => ({ won: index < 3 })),
    ]);
    const first = derive(workspace);
    const second = derive(workspace);
    assert.deepEqual(first, second);
  });

  test('40. and 41. the injected day is the only clock, and nothing is written', () => {
    const workspace = book([{ won: true, attach: (id, e) => e.commitments.push(commitment(id)) }]);

    // Every timestamp in the answer comes from the caller's `today`, so a test
    // run at midnight and one run at noon cannot disagree.
    const result = derivePersonalLearning({
      opportunities: workspace.opportunities, opportunityOutcomes: workspace.opportunityOutcomes,
      activities: [], stakeholders: [], objections: [], quotes: [],
      commitments: workspace.commitments, evidence: [], today: TODAY,
    });
    assert.equal(result.calculatedAt, TODAY.toISOString());
    for (const pattern of result.patterns) assert.equal(pattern.calculatedAt, TODAY.toISOString());

    const before = JSON.stringify(workspace);
    derive(workspace);
    assert.equal(JSON.stringify(workspace), before, 'inputs must not be mutated');
  });
});
