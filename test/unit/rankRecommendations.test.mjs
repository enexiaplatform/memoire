import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankRecommendations,
  recommendationRuleConcerns,
  recommendationRuleShape,
  urgencyBands,
} from '../../src/domain/commercialKernel/rankRecommendations.ts';
import { reasonCodes } from '../../src/domain/commercialKernel/policyEngine.ts';

const TODAY = new Date('2026-09-05T00:00:00.000Z');
const ACCOUNT = 'Kestrel Diagnostics';
const OTHER_ACCOUNT = 'Brightwater Labs';

const dayKey = (offset) => new Date(TODAY.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const iso = (offset) => new Date(TODAY.getTime() + offset * 86_400_000).toISOString();

/** Everything is denominated explicitly, so no test depends on a stored default. */
const REPORTING = 'VND';

const opportunity = (patch = {}) => ({
  id: 'opp-1', accountName: ACCOUNT, opportunityName: 'Analyser rollout', stage: 'Proposal',
  estimatedValue: 300_000_000, currency: 'VND', expectedClosePeriod: 'Q4', productOrSolution: '',
  decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
  nextAction: 'Confirm criteria', nextActionDate: dayKey(20), evidence: 'Trial signed off',
  missingContext: '', objectionDebt: '', forecastEvidenceCategory: 'Defensible',
  decisionRecommendation: 'Monitor', status: 'Active', createdAt: iso(-120), updatedAt: iso(-1),
  storageMode: 'local', ...patch,
});

const commitment = (patch = {}) => ({
  id: 'c-1', userId: null, threadId: 'thread-1', accountId: '', accountName: ACCOUNT,
  opportunityId: 'opp-1', commitmentParty: 'customer', ownerLabel: 'Ana Ferreira',
  commitmentText: 'Return the signed PO', originalDueDate: dayKey(-9), currentDueDate: dayKey(-9),
  silenceThresholdDays: 3, status: 'open', impactType: 'none', impactAmount: null,
  impactCurrency: null, dueDateHistory: [], sourceType: 'manual',
  createdAt: iso(-40), updatedAt: iso(-2), ...patch,
});

const quote = (patch = {}) => ({
  id: 'q-1', quoteId: 'Q-1001', accountName: ACCOUNT, opportunityId: 'opp-1',
  opportunityName: 'Analyser rollout', title: 'Analyser', quoteDate: dayKey(-30),
  validUntil: dayKey(4), amount: 250_000_000, currency: 'VND', grossMarginEstimate: null,
  discount: null, paymentTerm: '', status: 'Sent', poStatus: 'Pending',
  deliveryStatus: 'Not scheduled', expectedDeliveryDate: '', paymentStatus: 'Not due',
  paymentDueDate: '', nextAction: '', notes: '', createdAt: iso(-30), updatedAt: iso(-3), ...patch,
});

const objection = (patch = {}) => ({
  id: 'obj-1', accountId: '', accountName: ACCOUNT, opportunityId: 'opp-1',
  opportunityName: 'Analyser rollout', stakeholderId: '', stakeholderName: '', sourceActivityId: '',
  objectionType: 'Price', objectionText: 'Payment terms too short', impact: 'High',
  status: 'Open', requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '',
  resolvedAt: '', tags: [], createdAt: iso(-5), updatedAt: iso(-5), storageMode: 'local', ...patch,
});

const recommendation = (patch = {}) => ({
  id: 'rec-1', reasonCode: 'THREAD_SILENT', reasonText: 'Nothing has happened for 21 days.',
  sourceRecordIds: ['thread-1'], threshold: 10, severity: 'medium',
  recommendedAction: 'Make contact, or record why this thread is parked.',
  calculatedAt: TODAY.toISOString(), accountName: ACCOUNT, threadId: 'thread-1',
  opportunityId: 'opp-1', commitmentId: null, href: '/app/opportunities', ...patch,
});

const overdueCommitmentRec = (patch = {}) => recommendation({
  id: 'rec-overdue', reasonCode: 'CUSTOMER_COMMITMENT_OVERDUE',
  reasonText: 'Ana Ferreira committed to "Return the signed PO" by 27 August. It is 9 days overdue.',
  sourceRecordIds: ['c-1'], threshold: 0, severity: 'critical', commitmentId: 'c-1',
  recommendedAction: 'Send a confirmation follow-up.', ...patch,
});

const delta = (patch = {}) => ({
  id: 'chg-1', kind: 'objection_opened', observation: 'transition', provenance: 'record_occurrence',
  statement: 'Price objection opened: Payment terms too short', occurredAt: iso(-3),
  dimension: 'purchasing', direction: 'weakened', significance: 'high',
  sourceRecordIds: ['obj-1'], ...patch,
});

const rank = (patch = {}) => rankRecommendations({
  recommendations: [],
  opportunities: [],
  quotes: [],
  commitments: [],
  objections: [],
  today: TODAY,
  reportingCurrency: REPORTING,
  ...patch,
});

const idsOf = (result) => result.ranked.map((item) => item.id);

describe('rankRecommendations - urgency leads', () => {
  test('1. an overdue promise outranks a quiet thread', () => {
    const result = rank({
      recommendations: [recommendation({ id: 'silent' }), overdueCommitmentRec({ id: 'overdue' })],
      opportunities: [opportunity()],
      commitments: [commitment()],
    });

    assert.deepEqual(idsOf(result), ['overdue', 'silent']);
    assert.equal(result.ranked[0].urgency, 'now');
    assert.equal(result.ranked[0].rank, 1);
  });

  test('2. the nearer date wins, and a date already passed wins outright', () => {
    // The policy engine only raises QUOTE_EXPIRING inside its warning window,
    // so both of these are quotes a seller would really be looking at.
    const quoteRec = (id, quoteId) => recommendation({
      id, reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: [quoteId],
      opportunityId: null, threadId: null,
      recommendedAction: 'Chase the decision, or extend the validity.',
    });

    const withinWeek = rank({
      recommendations: [quoteRec('later', 'q-later'), quoteRec('soon', 'q-soon')],
      quotes: [quote({ id: 'q-soon', validUntil: dayKey(1) }), quote({ id: 'q-later', validUntil: dayKey(6) })],
    });
    assert.deepEqual(idsOf(withinWeek), ['soon', 'later'], 'same band, nearer date first');
    assert.ok(withinWeek.ranked.every((item) => item.urgency === 'this_week'));

    const oneExpired = rank({
      recommendations: [quoteRec('valid', 'q-valid'), quoteRec('expired', 'q-expired')],
      quotes: [quote({ id: 'q-valid', validUntil: dayKey(5) }), quote({ id: 'q-expired', validUntil: dayKey(-2) })],
    });
    assert.deepEqual(idsOf(oneExpired), ['expired', 'valid']);
    assert.equal(oneExpired.ranked[0].urgency, 'now');
    assert.equal(oneExpired.ranked[1].urgency, 'this_week');
  });

  test('two expiring quotes on one customer are two pieces of work, not one', () => {
    const quoteRec = (id, quoteId) => recommendation({
      id, reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: [quoteId],
      opportunityId: null, threadId: null,
      recommendedAction: 'Chase the decision, or extend the validity.',
    });
    const result = rank({
      recommendations: [quoteRec('a', 'q-a'), quoteRec('b', 'q-b')],
      quotes: [quote({ id: 'q-a', validUntil: dayKey(2) }), quote({ id: 'q-b', validUntil: dayKey(5) })],
    });

    assert.equal(result.ranked.length, 2, 'a specific record is never folded into another one');
    assert.deepEqual(result.suppressed, []);
  });

  test('a date may raise urgency above the rule floor but never lower it', () => {
    // A silent thread whose next action is dated three months out is still
    // silent. The rule's floor holds.
    const result = rank({
      recommendations: [recommendation()],
      opportunities: [opportunity({ nextActionDate: dayKey(90) })],
    });
    assert.equal(result.ranked[0].urgency, recommendationRuleShape.THREAD_SILENT.urgency);
  });

  test('every policy rule has a declared shape, so none can rank last by accident', () => {
    for (const code of reasonCodes) {
      assert.ok(recommendationRuleShape[code], `no ranking shape declared for ${code}`);
    }
    assert.deepEqual(
      Object.keys(recommendationRuleShape).sort(),
      [...reasonCodes].sort(),
      'the shape map and the policy rules must be the same set',
    );
  });
});

describe('rankRecommendations - money modifies, never decides', () => {
  test('3. a huge distant deal does not outrank an urgent small one', () => {
    const result = rank({
      recommendations: [
        recommendation({ id: 'big-silent', opportunityId: 'opp-big', threadId: 'thread-big', accountName: OTHER_ACCOUNT }),
        overdueCommitmentRec({ id: 'small-overdue' }),
      ],
      opportunities: [
        opportunity(),
        opportunity({ id: 'opp-big', accountName: OTHER_ACCOUNT, estimatedValue: 9_000_000_000 }),
      ],
      commitments: [commitment()],
    });

    assert.equal(idsOf(result)[0], 'small-overdue', 'urgency is decided before value is looked at');
  });

  test('20. a large stale deal does not dominate the whole list', () => {
    // Three identical hygiene gaps, one of them on a very large deal. It should
    // come first among its equals - and no further.
    const result = rank({
      recommendations: [
        recommendation({ id: 'r-small', opportunityId: 'opp-small', threadId: 't-small' }),
        recommendation({ id: 'r-huge', opportunityId: 'opp-huge', threadId: 't-huge' }),
        overdueCommitmentRec({ id: 'r-overdue' }),
      ],
      opportunities: [
        opportunity(),
        opportunity({ id: 'opp-small', estimatedValue: 10_000_000 }),
        opportunity({ id: 'opp-huge', estimatedValue: 50_000_000_000 }),
      ],
      commitments: [commitment()],
    });

    assert.deepEqual(idsOf(result), ['r-overdue', 'r-huge', 'r-small']);
  });

  test('value decides between commercially equivalent work', () => {
    const result = rank({
      recommendations: [
        recommendation({ id: 'r-small', opportunityId: 'opp-small', threadId: 't-small' }),
        recommendation({ id: 'r-large', opportunityId: 'opp-large', threadId: 't-large' }),
      ],
      opportunities: [
        opportunity({ id: 'opp-small', estimatedValue: 10_000_000 }),
        opportunity({ id: 'opp-large', estimatedValue: 800_000_000 }),
      ],
    });
    assert.deepEqual(idsOf(result), ['r-large', 'r-small']);
  });

  test('4. a deal with no recorded value still ranks, and says why it is below', () => {
    const result = rank({
      recommendations: [
        recommendation({ id: 'r-unknown', opportunityId: 'opp-unknown', threadId: 't-unknown' }),
        recommendation({ id: 'r-known', opportunityId: 'opp-known', threadId: 't-known' }),
      ],
      opportunities: [
        opportunity({ id: 'opp-unknown', estimatedValue: null }),
        opportunity({ id: 'opp-known', estimatedValue: 5_000_000 }),
      ],
    });

    assert.deepEqual(idsOf(result), ['r-known', 'r-unknown']);
    const unknown = result.ranked[1];
    assert.equal(unknown.value.amountBase, null);
    assert.equal(unknown.value.kind, 'none');
    assert.ok(
      unknown.rationale.some((line) => /No value is recorded/i.test(line)),
      'unknown value must be stated, not hidden',
    );
  });

  test('5. currencies are converted before they are compared', () => {
    // 400,000 EUR is about 12 billion VND at the workspace rate; 3 billion VND
    // is the larger raw number and the smaller amount of money.
    const result = rank({
      recommendations: [
        recommendation({ id: 'r-vnd', opportunityId: 'opp-vnd', threadId: 't-vnd' }),
        recommendation({ id: 'r-eur', opportunityId: 'opp-eur', threadId: 't-eur' }),
      ],
      opportunities: [
        opportunity({ id: 'opp-vnd', estimatedValue: 3_000_000_000, currency: 'VND' }),
        opportunity({ id: 'opp-eur', estimatedValue: 400_000, currency: 'EUR' }),
      ],
    });

    assert.deepEqual(idsOf(result), ['r-eur', 'r-vnd'], 'the larger raw number is the smaller sum');
    assert.ok(result.ranked[0].value.amountBase > result.ranked[1].value.amountBase);
  });

  test('a currency with no rate is not compared, and says so', () => {
    const result = rank({
      recommendations: [
        recommendation({ id: 'r-unpriced', opportunityId: 'opp-unpriced', threadId: 't-unpriced' }),
        recommendation({ id: 'r-priced', opportunityId: 'opp-priced', threadId: 't-priced' }),
      ],
      opportunities: [
        opportunity({ id: 'opp-unpriced', estimatedValue: 999_000_000_000, currency: 'BRL' }),
        opportunity({ id: 'opp-priced', estimatedValue: 1_000, currency: 'VND' }),
      ],
    });

    const unpriced = result.ranked.find((item) => item.id === 'r-unpriced');
    assert.equal(unpriced.value.amountBase, null, 'an unconvertible amount is never given a base figure');
    assert.equal(unpriced.value.amount, 999_000_000_000, 'the amount the operator entered is kept');
    assert.ok(unpriced.rationale.some((line) => /no exchange rate/i.test(line)));
    assert.deepEqual(idsOf(result), ['r-priced', 'r-unpriced']);
  });

  test('a quoted figure is read from the quote, not the deal estimate', () => {
    const result = rank({
      recommendations: [recommendation({ id: 'r-q', reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: ['q-1'] })],
      opportunities: [opportunity({ estimatedValue: 1 })],
      quotes: [quote()],
    });
    assert.equal(result.ranked[0].value.kind, 'quoted_amount');
    assert.equal(result.ranked[0].value.amount, 250_000_000);
  });
});

describe('rankRecommendations - contradictions', () => {
  test('8. a won or lost deal carries no live work', () => {
    for (const status of ['Won', 'Lost', 'On hold']) {
      const result = rank({
        recommendations: [overdueCommitmentRec(), recommendation({ id: 'silent' })],
        opportunities: [opportunity({ status })],
        commitments: [commitment()],
      });
      assert.deepEqual(result.ranked, [], `${status} deals must not produce work`);
      assert.equal(result.suppressed.length, 2);
      assert.ok(result.suppressed.every((item) => item.reason === 'opportunity_closed'));
      assert.deepEqual(result.suppressed[0].contradictedBy, ['opp-1']);
    }
  });

  test('7. "nothing is scheduled" is withheld when something is', () => {
    const result = rank({
      recommendations: [recommendation({
        id: 'no-next', reasonCode: 'THREAD_WITHOUT_NEXT_COMMITMENT',
        reasonText: 'Nothing is scheduled to move it.',
        recommendedAction: 'Set the next commitment: what happens, by whom, by when.',
      })],
      opportunities: [opportunity()],
      commitments: [commitment({ currentDueDate: dayKey(4) })],
    });

    assert.deepEqual(result.ranked, []);
    assert.equal(result.suppressed[0].reason, 'commitment_already_scheduled');
    assert.deepEqual(result.suppressed[0].contradictedBy, ['c-1']);
  });

  test('a promise observed in the window also answers "nothing is scheduled"', () => {
    const result = rank({
      recommendations: [recommendation({
        id: 'no-next', reasonCode: 'OPPORTUNITY_WITHOUT_FUTURE_ACTION',
        reasonText: 'No dated next action.',
      })],
      opportunities: [opportunity()],
      commitments: [],
      observedChanges: [delta({
        id: 'chg-made', kind: 'commitment_made', direction: 'improved',
        dimension: 'momentum', sourceRecordIds: ['plan-9'],
      })],
    });

    assert.deepEqual(result.ranked, []);
    assert.deepEqual(result.suppressed[0].contradictedBy, ['plan-9']);
  });

  test('6. a resolved objection is never named as still open', () => {
    // A quote about to lapse is concerned with purchasing, so a price objection
    // is genuinely relevant to it - which is what makes this a fair test of the
    // open/resolved distinction rather than of the relevance gate.
    const quoteRec = recommendation({
      reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: ['q-1'],
      recommendedAction: 'Chase the decision, or extend the validity.',
    });

    const withOpen = rank({
      recommendations: [quoteRec], opportunities: [opportunity()], quotes: [quote()],
      objections: [objection()],
    });
    assert.match(withOpen.ranked[0].candidateAction, /price objection/i);

    const withResolved = rank({
      recommendations: [quoteRec], opportunities: [opportunity()], quotes: [quote()],
      objections: [objection({ status: 'Resolved', resolvedAt: dayKey(-2) })],
    });
    assert.equal(
      withResolved.ranked[0].candidateAction,
      'Chase the decision, or extend the validity.',
      'a settled objection must not be talked about as a live blocker',
    );
    assert.ok(!withResolved.ranked[0].rationale.some((line) => /objection is still unresolved/i.test(line)));
  });

  test('12. two rules proposing the same move on the same deal collapse into one', () => {
    const shared = 'Set the next commitment: what happens, by whom, by when.';
    const result = rank({
      recommendations: [
        recommendation({
          id: 'thread-gap', reasonCode: 'THREAD_WITHOUT_NEXT_COMMITMENT',
          reasonText: 'Thread has no open commitment.', recommendedAction: shared,
        }),
        recommendation({
          id: 'deal-gap', reasonCode: 'OPPORTUNITY_WITHOUT_FUTURE_ACTION',
          reasonText: 'No dated next action.', recommendedAction: shared, sourceRecordIds: ['opp-1'],
        }),
      ],
      opportunities: [opportunity()],
    });

    assert.equal(result.ranked.length, 1, 'one piece of work is listed once');
    assert.equal(result.suppressed.filter((item) => item.reason === 'duplicate_action').length, 1);
    assert.ok(result.ranked[0].supersededIds.length === 1);
    assert.ok(
      result.ranked[0].sourceRecordIds.includes('opp-1') && result.ranked[0].sourceRecordIds.includes('thread-1'),
      'the surviving row keeps the evidence of the one it absorbed',
    );
  });

  test('different actions on the same deal are never collapsed', () => {
    const result = rank({
      recommendations: [
        recommendation({ id: 'a', recommendedAction: 'Make contact.' }),
        recommendation({
          id: 'b', reasonCode: 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE',
          recommendedAction: 'Record what the customer actually did.', sourceRecordIds: ['opp-1'],
        }),
      ],
      opportunities: [opportunity()],
    });
    assert.equal(result.ranked.length, 2);
  });
});

describe('rankRecommendations - observed change must be relevant', () => {
  /** A quote about to lapse: concerned with money and purchasing. */
  const quoteRec = (patch = {}) => recommendation({
    id: 'quote-rec', reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: ['q-1'],
    recommendedAction: 'Chase the decision, or extend the validity.', ...patch,
  });
  /** Missing stage evidence: concerned with qualification and technical. */
  const evidenceRec = (patch = {}) => recommendation({
    id: 'evidence-rec', reasonCode: 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE', sourceRecordIds: ['opp-1'],
    recommendedAction: 'Record what the customer actually did.', ...patch,
  });
  // The objection the purchasing change refers to is still open, which is what
  // makes that change live evidence rather than something the records have
  // since answered.
  const base = { opportunities: [opportunity()], quotes: [quote()], objections: [objection()] };

  const purchasingOpened = delta({ id: 'chg-price', dimension: 'purchasing', direction: 'weakened' });
  const technicalResolved = delta({
    id: 'chg-tech', kind: 'objection_resolved', dimension: 'technical', direction: 'improved',
    statement: 'Technical fit objection resolved: GPT verification', sourceRecordIds: ['obj-tech'],
  });

  test('6. a purchasing change reaches a purchasing-concerned recommendation', () => {
    const without = rank({ ...base, recommendations: [quoteRec()] });
    const withChange = rank({ ...base, recommendations: [quoteRec()], observedChanges: [purchasingOpened] });

    assert.equal(without.ranked[0].urgency, 'this_week');
    assert.equal(withChange.ranked[0].urgency, 'now', 'a purchasing change presses a purchasing matter');
    assert.deepEqual(withChange.ranked[0].supportingChangeIds, ['chg-price']);
  });

  test('7. the same purchasing change does not reach an unrelated technical gap', () => {
    const without = rank({ ...base, recommendations: [evidenceRec()] });
    const withChange = rank({ ...base, recommendations: [evidenceRec()], observedChanges: [purchasingOpened] });

    assert.equal(withChange.ranked[0].urgency, without.ranked[0].urgency,
      'a price objection says nothing about missing stage evidence');
    assert.deepEqual(withChange.ranked[0].supportingChangeIds, []);
    assert.ok(!withChange.ranked[0].rationale.some((line) => /Since your last look/.test(line)));
  });

  test('8. a technical resolution eases a recommendation about recorded evidence', () => {
    const without = rank({ ...base, recommendations: [evidenceRec()] });
    const withChange = rank({ ...base, recommendations: [evidenceRec()], observedChanges: [technicalResolved] });

    assert.equal(without.ranked[0].urgency, 'soon');
    assert.equal(withChange.ranked[0].urgency, 'whenever',
      'a settled technical objection is recorded evidence for the stage');
  });

  test('9. the same technical resolution does not ease an unrelated promise', () => {
    const promise = recommendation({
      id: 'moved', reasonCode: 'COMMITMENT_REPEATEDLY_RESCHEDULED', commitmentId: 'c-1',
      sourceRecordIds: ['c-1'], reasonText: '"Return the signed PO" has moved 3 times.',
      recommendedAction: 'Find out what is really blocking it.',
    });
    const without = rank({ ...base, recommendations: [promise], commitments: [commitment()] });
    const withChange = rank({
      ...base, recommendations: [promise], commitments: [commitment()],
      observedChanges: [technicalResolved],
    });

    assert.equal(withChange.ranked[0].urgency, without.ranked[0].urgency,
      'a technical objection settling says nothing about a promise being kept');
  });

  test('10. a close-date move reaches everything with a clock on it, and nothing without', () => {
    const timing = delta({
      id: 'chg-timing', kind: 'close_period_changed', dimension: 'money', direction: 'weakened',
      statement: 'Expected close moved Q3 to Q4.', sourceRecordIds: ['opp-1'],
    });
    const undated = recommendation({
      id: 'no-owner', reasonCode: 'COMMITMENT_WITHOUT_OWNER', commitmentId: 'c-1',
      sourceRecordIds: ['c-1'], reasonText: 'It does not say who owes it.',
      recommendedAction: 'Name the person who owes it.',
    });

    const result = rank({
      ...base,
      recommendations: [quoteRec(), evidenceRec(), undated],
      commitments: [commitment()],
      observedChanges: [timing],
    });
    const byId = Object.fromEntries(result.ranked.map((item) => [item.id, item]));

    assert.equal(byId['quote-rec'].urgency, 'now', 'a money-timed rule moves');
    assert.equal(byId['evidence-rec'].urgency, 'this_week', 'so does a dated qualification gap');
    assert.equal(byId['no-owner'].urgency, 'whenever', 'a rule with no clock does not');
  });

  test('11. a standing condition never applies transition pressure', () => {
    const result = rank({
      ...base, recommendations: [quoteRec()],
      observedChanges: [delta({ dimension: 'purchasing', observation: 'condition', provenance: 'policy', occurredAt: null })],
    });
    assert.equal(result.ranked[0].urgency, 'this_week');
    assert.deepEqual(result.ranked[0].supportingChangeIds, []);
  });

  test('12. a change the records have since answered applies no pressure', () => {
    // The objection opened inside the window and has since been resolved. The
    // negative change is still in the delta; the canonical record is not.
    const result = rank({
      ...base,
      recommendations: [quoteRec()],
      objections: [objection({ id: 'obj-1', status: 'Resolved', resolvedAt: dayKey(-1) })],
      observedChanges: [purchasingOpened],
    });
    assert.equal(result.ranked[0].urgency, 'this_week', 'new canonical truth beats old pressure');
    assert.deepEqual(result.ranked[0].supportingChangeIds, []);
  });

  test('12b. a superseded change loses to the newer one on the same record', () => {
    const opened = delta({ id: 'chg-open', occurredAt: iso(-6), sourceRecordIds: ['obj-1'] });
    const resolved = delta({
      id: 'chg-resolved', kind: 'objection_resolved', direction: 'improved', occurredAt: iso(-1),
      sourceRecordIds: ['obj-1'], statement: 'Price objection resolved',
    });
    const result = rank({
      ...base, recommendations: [quoteRec()], objections: [],
      observedChanges: [opened, resolved],
    });
    assert.deepEqual(result.ranked[0].supportingChangeIds, ['chg-resolved'],
      'only the newest state of a record presses');
  });

  test('a change older than the delta window applies no pressure', () => {
    const result = rank({
      ...base, recommendations: [quoteRec()],
      observedChanges: [delta({ occurredAt: iso(-90) })],
    });
    assert.equal(result.ranked[0].urgency, 'this_week');
    assert.deepEqual(result.ranked[0].supportingChangeIds, []);
  });

  test('a promise says what it is about, and that decides what is relevant to it', () => {
    const overdue = overdueCommitmentRec();
    const withPurchasingImpact = rank({
      ...base, recommendations: [overdue],
      commitments: [commitment({ impactType: 'revenue' })],
      objections: [objection()],
    });
    assert.ok(
      withPurchasingImpact.ranked[0].rationale.some((line) => /price objection is still unresolved/i.test(line)),
      'an overdue purchase order is a purchasing matter, so a price objection belongs beside it',
    );

    const withoutImpact = rank({
      ...base, recommendations: [overdue],
      commitments: [commitment({ impactType: 'none' })],
      objections: [objection()],
    });
    assert.ok(
      !withoutImpact.ranked[0].rationale.some((line) => /objection/i.test(line)),
      'with nothing recorded about what the promise is for, no connection is claimed',
    );
  });

  test('every policy rule declares what it is about', () => {
    for (const code of reasonCodes) {
      const concerns = recommendationRuleConcerns[code];
      assert.ok(Array.isArray(concerns), `no concern declared for ${code}`);
      assert.ok(concerns.length > 0, `${code} is about nothing, so nothing could ever be relevant to it`);
    }
    assert.deepEqual(
      Object.keys(recommendationRuleConcerns).sort(),
      [...reasonCodes].sort(),
      'the concern map and the policy rules must be the same set',
    );
  });

  test('no delta at all still produces a useful order', () => {
    const result = rank({
      recommendations: [recommendation({ id: 'silent' }), overdueCommitmentRec({ id: 'overdue' })],
      opportunities: [opportunity()],
      commitments: [commitment()],
      observedChanges: undefined,
    });
    assert.deepEqual(idsOf(result), ['overdue', 'silent']);
    assert.deepEqual(result.ranked[0].supportingChangeIds, []);
  });
});

describe('rankRecommendations - explanation relevance', () => {
  const evidenceRec = () => recommendation({
    id: 'evidence-rec', reasonCode: 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE', sourceRecordIds: ['opp-1'],
    recommendedAction: 'Record what the customer actually did.',
  });
  const qualification = (blockerLabel) => new Map([['opp-1', {
    opportunityId: 'opp-1', accountName: ACCOUNT, opportunityName: 'Analyser rollout',
    elements: [], weighted: 0, max: 32, percentOfMax: 0,
    blockers: [{ key: 'champion', label: blockerLabel, weight: 4, status: 'Unknown', points: 0,
      weightedPoints: 0, evidence: [], gaps: [], blocking: true }],
    claimedStage: 'Proposal', evidenceStage: 'Lead', stageGap: 4,
    backsForecast: false, clearsEffortGate: false,
  }]]);

  test('15. an evidence gap appears beside a recommendation about evidence', () => {
    const result = rank({
      recommendations: [evidenceRec()], opportunities: [opportunity()],
      qualification: qualification('Champion'),
    });
    assert.ok(result.ranked[0].rationale.some((line) => /still missing: champion/i.test(line)));
  });

  test('16. the same evidence gap does not appear beside an overdue promise', () => {
    const result = rank({
      recommendations: [overdueCommitmentRec()], opportunities: [opportunity()],
      commitments: [commitment()], qualification: qualification('Champion'),
    });
    assert.ok(
      !result.ranked[0].rationale.some((line) => /still missing/i.test(line)),
      'a missing champion is true about the deal and no part of why this PO is late',
    );
  });

  test('13. and 14. only a related objection reaches the explanation', () => {
    const related = rank({
      recommendations: [recommendation({
        id: 'quote', reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: ['q-1'],
        recommendedAction: 'Chase the decision.',
      })],
      opportunities: [opportunity()], quotes: [quote()], objections: [objection()],
    });
    assert.ok(related.ranked[0].rationale.some((line) => /price objection is still unresolved/i.test(line)));

    const unrelated = rank({
      recommendations: [evidenceRec()], opportunities: [opportunity()], objections: [objection()],
    });
    assert.ok(
      !unrelated.ranked[0].rationale.some((line) => /objection/i.test(line)),
      'a price objection is nearby evidence, not relevant evidence, for missing stage evidence',
    );
  });

  test('17. and 18. only a relevant change reaches the explanation', () => {
    const purchasing = delta({ dimension: 'purchasing', direction: 'weakened' });

    const shown = rank({
      recommendations: [recommendation({
        id: 'quote', reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: ['q-1'],
        recommendedAction: 'Chase the decision.',
      })],
      opportunities: [opportunity()], quotes: [quote()], objections: [objection()],
      observedChanges: [purchasing],
    });
    assert.ok(shown.ranked[0].rationale.some((line) => /Since your last look/.test(line)));

    // Same change, same still-open objection behind it. The only difference is
    // that this recommendation is about something else.
    const hidden = rank({
      recommendations: [evidenceRec()], opportunities: [opportunity()],
      objections: [objection()], observedChanges: [purchasing],
    });
    assert.ok(!hidden.ranked[0].rationale.some((line) => /Since your last look/.test(line)));
  });

  test('19. money stays impact context and manufactures no urgency', () => {
    const small = rank({
      recommendations: [evidenceRec()], opportunities: [opportunity({ estimatedValue: 1_000 })],
    });
    const huge = rank({
      recommendations: [evidenceRec()], opportunities: [opportunity({ estimatedValue: 90_000_000_000 })],
    });

    assert.equal(huge.ranked[0].urgency, small.ranked[0].urgency, 'value never moves urgency');
    assert.ok(huge.ranked[0].rationale.some((line) => /estimated value/i.test(line)));
  });

  test('every rationale line answers something about this recommendation', () => {
    const result = rank({
      recommendations: [overdueCommitmentRec()], opportunities: [opportunity()],
      commitments: [commitment({ impactType: 'revenue' })], objections: [objection()],
      observedChanges: [delta({ dimension: 'purchasing', direction: 'weakened' })],
      qualification: qualification('Champion'),
    });
    const [item] = result.ranked;

    // The finding, the date, the related objection, the money. Not the champion
    // gap - which belongs to a different question.
    assert.equal(item.rationale[0], item.reasonText);
    assert.ok(item.rationale.some((line) => /overdue|passed/i.test(line)));
    assert.ok(item.rationale.some((line) => /price objection/i.test(line)));
    assert.ok(item.rationale.some((line) => /estimated value/i.test(line)));
    assert.ok(!item.rationale.some((line) => /still missing/i.test(line)));
  });
});

describe('rankRecommendations - determinism, evidence and purity', () => {
  const busy = () => ({
    recommendations: [
      overdueCommitmentRec(),
      recommendation({ id: 'silent' }),
      recommendation({ id: 'quote', reasonCode: 'QUOTE_EXPIRING', sourceRecordIds: ['q-1'] }),
      recommendation({
        id: 'evidence', reasonCode: 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE', sourceRecordIds: ['opp-1'],
        recommendedAction: 'Record what the customer actually did.',
      }),
    ],
    opportunities: [opportunity()],
    quotes: [quote()],
    commitments: [commitment()],
    objections: [objection()],
    observedChanges: [delta()],
  });

  test('13. the same input produces the same order, byte for byte', () => {
    assert.equal(JSON.stringify(rank(busy())), JSON.stringify(rank(busy())));
  });

  test('14. a genuine tie breaks on the date, then on record identity - never on the name', () => {
    const result = rank({
      recommendations: [
        recommendation({ id: 'zeta', accountName: 'Zeta Corp', opportunityId: 'opp-z', threadId: 't-z' }),
        recommendation({ id: 'alpha', accountName: 'Alpha Corp', opportunityId: 'opp-a', threadId: 't-a' }),
      ],
      opportunities: [
        opportunity({ id: 'opp-z', accountName: 'Zeta Corp', estimatedValue: null, nextActionDate: '' }),
        opportunity({ id: 'opp-a', accountName: 'Alpha Corp', estimatedValue: null, nextActionDate: '' }),
      ],
    });
    // Both tie on every dimension. The order is by record id, which carries no
    // commercial meaning - unlike the account name, which reads like a verdict.
    assert.deepEqual(idsOf(result), ['alpha', 'zeta']);

    const dated = rank({
      recommendations: [
        recommendation({
          id: 'zeta', opportunityId: 'opp-z', threadId: 't-z',
          reasonCode: 'OPPORTUNITY_WITHOUT_FUTURE_ACTION', reasonText: 'Next action has passed.',
          recommendedAction: 'Set a dated next action.',
        }),
        recommendation({
          id: 'alpha', opportunityId: 'opp-a', threadId: 't-a',
          reasonCode: 'OPPORTUNITY_WITHOUT_FUTURE_ACTION', reasonText: 'Next action has passed.',
          recommendedAction: 'Set a dated next action.',
        }),
      ],
      opportunities: [
        opportunity({ id: 'opp-z', estimatedValue: null, nextActionDate: dayKey(9) }),
        opportunity({ id: 'opp-a', estimatedValue: null, nextActionDate: dayKey(25) }),
      ],
    });
    assert.deepEqual(idsOf(dated), ['zeta', 'alpha'], 'the nearer date wins before identity is reached');
  });

  test('a rule that is not about a date never borrows one', () => {
    // The deal has a next action dated tomorrow. A finding about missing stage
    // evidence must not inherit its urgency, or say it is "dated 1 day out".
    const result = rank({
      recommendations: [recommendation({
        reasonCode: 'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE', sourceRecordIds: ['opp-1'],
        recommendedAction: 'Record what the customer actually did.',
      })],
      opportunities: [opportunity({ nextActionDate: dayKey(1) })],
    });

    assert.equal(result.ranked[0].dueDate, '');
    assert.equal(result.ranked[0].urgency, 'soon', 'it keeps its own rule floor');
    assert.ok(!result.ranked[0].rationale.some((line) => /dated/i.test(line)));
  });

  test('15. and 17. identity, rule and evidence all survive ranking', () => {
    const result = rank(busy());
    for (const item of result.ranked) {
      assert.ok(item.id, 'the recommendation keeps its id');
      assert.ok(item.reasonCode, 'and the rule that produced it');
      assert.ok(item.sourceRecordIds.length > 0, 'and the records that prove it');
      assert.ok(item.rationale.length > 0, 'and can say why it is where it is');
      assert.equal(item.rationale[0], item.reasonText, 'the finding leads the explanation');
      assert.ok(item.calculatedAt, 'and when it was worked out');
    }
  });

  test('16. ranking mutates nothing it is given', () => {
    const input = busy();
    const snapshot = JSON.stringify(input);
    rankRecommendations({ ...input, today: TODAY, reportingCurrency: REPORTING });
    assert.equal(JSON.stringify(input), snapshot, 'inputs must come back untouched');
  });

  test('18. every candidate is ranked; capping is the caller\'s decision', () => {
    const many = Array.from({ length: 12 }, (unused, index) => recommendation({
      id: `r-${index}`, opportunityId: `opp-${index}`, threadId: `t-${index}`,
    }));
    const result = rank({
      recommendations: many,
      opportunities: many.map((item, index) => opportunity({ id: `opp-${index}`, estimatedValue: index })),
    });
    assert.equal(result.ranked.length, 12);
    assert.deepEqual(result.ranked.map((item) => item.rank), [...Array(12).keys()].map((index) => index + 1));
  });

  test('19. a brand-new account with one bare recommendation still works', () => {
    const result = rank({
      recommendations: [recommendation({
        id: 'fresh', opportunityId: null, threadId: 'thread-new',
        reasonCode: 'THREAD_WITHOUT_NEXT_COMMITMENT', reasonText: 'Nothing is scheduled to move it.',
        recommendedAction: 'Set the next commitment: what happens, by whom, by when.',
      })],
    });

    assert.equal(result.ranked.length, 1);
    assert.equal(result.ranked[0].rank, 1);
    assert.equal(result.ranked[0].value.kind, 'none');
    assert.equal(result.ranked[0].urgency, 'soon');
    assert.equal(
      result.ranked[0].candidateAction,
      'Set the next commitment: what happens, by whom, by when.',
      'with nothing to sharpen from, the plain instruction stands',
    );
    for (const line of result.ranked[0].rationale) {
      assert.doesNotMatch(line, /score|confidence level|percentile/i, 'no jargon for a new workspace');
    }
  });

  test('the action is only sharpened where a record supports it', () => {
    const named = rank({
      recommendations: [overdueCommitmentRec()],
      opportunities: [opportunity()],
      commitments: [commitment({ ownerLabel: 'Ana Ferreira' })],
    });
    assert.match(named.ranked[0].candidateAction, /Ask Ana Ferreira to confirm a new date/);

    const anonymous = rank({
      recommendations: [overdueCommitmentRec()],
      opportunities: [opportunity()],
      commitments: [commitment({ ownerLabel: '  ' })],
    });
    assert.equal(
      anonymous.ranked[0].candidateAction,
      'Send a confirmation follow-up.',
      'with no name recorded, no name is used',
    );
  });

  test('an objection is only named when there is exactly one to name', () => {
    const two = rank({
      recommendations: [recommendation()],
      opportunities: [opportunity()],
      objections: [objection(), objection({ id: 'obj-2', objectionType: 'Lead time' })],
    });
    assert.equal(
      two.ranked[0].candidateAction,
      'Make contact, or record why this thread is parked.',
      '"the objection" is a false claim on a deal carrying two',
    );
  });

  test('no rationale line is a bare score', () => {
    const result = rank(busy());
    for (const item of result.ranked) {
      for (const line of item.rationale) {
        assert.doesNotMatch(line, /^\s*(priority\s+)?score\b/i);
        assert.ok(/[a-z]/i.test(line), 'every line is a sentence, not a number');
      }
    }
  });

  test('urgency bands are ordered most pressing first', () => {
    assert.deepEqual([...urgencyBands], ['now', 'this_week', 'soon', 'whenever']);
  });
});
