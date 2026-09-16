import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCommercialDelta,
  DELTA_GROUP_AFTER,
  DELTA_WINDOW_DAYS,
  deltaConditionByReason,
} from '../../src/domain/commercialKernel/deriveDelta.ts';
import {
  diffOpportunityState,
  VALUE_CHANGE_RATIO,
} from '../../src/domain/commercialKernel/opportunityChanges.ts';
import { reasonCodes } from '../../src/domain/commercialKernel/policyEngine.ts';

const TODAY = new Date('2026-09-05T00:00:00.000Z');
const ACCOUNT = 'Vantage Instruments';
const OPPORTUNITY_ID = 'opp-1';

/** Days before TODAY, as an ISO instant. */
const ago = (days) => new Date(TODAY.getTime() - days * 86_400_000).toISOString();
/** Days before TODAY, as a business date key. */
const agoDate = (days) => ago(days).slice(0, 10);

const accountSubject = { kind: 'account', id: 'acct-1', name: ACCOUNT };
const opportunitySubject = {
  kind: 'opportunity', id: OPPORTUNITY_ID, name: 'Analyser rollout', accountName: ACCOUNT,
};

const commitment = (patch = {}) => ({
  id: 'c-1', userId: null, threadId: 'thread-1', accountId: '', accountName: ACCOUNT,
  opportunityId: OPPORTUNITY_ID, commitmentParty: 'customer', ownerLabel: 'Mai at Vantage',
  commitmentText: 'Confirm the validation quantity', originalDueDate: agoDate(20),
  currentDueDate: agoDate(20), silenceThresholdDays: 3, status: 'open', impactType: 'none',
  dueDateHistory: [], sourceType: 'manual', createdAt: ago(40), updatedAt: ago(1), ...patch,
});

const objection = (patch = {}) => ({
  id: 'obj-1', accountId: '', accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
  opportunityName: 'Analyser rollout', stakeholderId: '', stakeholderName: '', sourceActivityId: '',
  objectionType: 'Price', objectionText: 'Payment terms are too short', impact: 'High',
  status: 'Open', requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '',
  resolvedAt: '', tags: [], createdAt: ago(3), updatedAt: ago(3), storageMode: 'local', ...patch,
});

const activity = (patch = {}) => ({
  id: 'act-1', accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting',
  summary: 'Met the lab team', nextAction: '', dueDate: '', tags: [], rawNote: '',
  activityDate: agoDate(2), linkedOpportunityId: OPPORTUNITY_ID, linkedOpportunityName: '',
  linkedAccountName: ACCOUNT, linkStatus: 'Linked', createdAt: ago(2), updatedAt: ago(2),
  storageMode: 'local', ...patch,
});

const planItem = (patch = {}) => ({
  id: 'plan-1', date: agoDate(2), label: 'Send the validation pack', tag: '', done: false,
  linkedOpportunityId: OPPORTUNITY_ID, linkedAccountName: ACCOUNT,
  createdAt: ago(5), updatedAt: ago(2), ...patch,
});

const event = (patch = {}) => ({
  id: 'evt-1', userId: null, eventType: 'opportunity_stage_changed', occurredAt: ago(4),
  recordedAt: ago(4), accountId: null, opportunityId: OPPORTUNITY_ID, threadId: null,
  commitmentId: null, summary: '', structuredPayload: {}, idempotencyKey: null,
  sourceType: 'manual', sourceId: null, sourceUrl: null, sourceUpdatedAt: null, createdAt: ago(4),
  ...patch,
});

const recommendation = (patch = {}) => ({
  id: 'rec-1', reasonCode: 'THREAD_SILENT', reasonText: 'Nothing has happened for 21 days.',
  sourceRecordIds: ['thread-1'], threshold: 10, severity: 'medium',
  recommendedAction: 'Make contact, or record why this thread is parked.',
  calculatedAt: TODAY.toISOString(), accountName: ACCOUNT, threadId: 'thread-1',
  opportunityId: OPPORTUNITY_ID, href: '/app/opportunities', ...patch,
});

/** An otherwise-empty workspace, so each test states only what it is about. */
const derive = (patch = {}) => deriveCommercialDelta({
  subject: opportunitySubject,
  events: [],
  commitments: [],
  planItems: [],
  objections: [],
  stakeholders: [],
  activities: [],
  opportunityOutcomes: [],
  recommendations: [],
  observedFrom: null,
  today: TODAY,
  ...patch,
});

describe('deriveCommercialDelta - observed transitions', () => {
  test('1. a stage move with a genuine before and after is reported as a transition', () => {
    const delta = derive({
      events: [event({ structuredPayload: { from: 'Proposal', to: 'Negotiation' } })],
    });

    assert.equal(delta.changes.length, 1);
    const [change] = delta.changes;
    assert.equal(change.kind, 'stage_changed');
    assert.equal(change.observation, 'transition');
    assert.equal(change.provenance, 'event');
    assert.deepEqual(change.transition, { from: 'Proposal', to: 'Negotiation' });
    assert.match(change.statement, /Proposal → Negotiation/);
    assert.equal(change.direction, 'improved');
  });

  test('1b. every stage the app offers has a direction, and sideways moves are neutral', () => {
    const move = (from, to) => derive({
      events: [event({ structuredPayload: { from, to } })],
    }).changes[0];

    // Procurement follows Negotiation in the app's own dropdown. Before the
    // canonical map named it, it fell through to the start of the pipeline and
    // this move reported the deal falling backwards.
    assert.equal(move('Negotiation', 'Procurement').direction, 'neutral');
    assert.equal(move('Demo', 'Proposal').direction, 'improved');
    assert.equal(move('Proposal', 'Demo').direction, 'weakened');
    assert.equal(move('Technical discussion', 'Negotiation').direction, 'improved');
    assert.equal(move('Proposal', 'Won').direction, 'improved');
  });

  test('2. a current stage with only a recent updated_at NEVER becomes a transition', () => {
    // The whole workspace: a deal sitting at Proposal, edited an hour ago, with
    // no event behind it. This is the shape the previous implementation turned
    // into "Opportunity stage updated".
    const delta = derive({
      events: [],
      recommendations: [],
    });

    assert.equal(delta.changes.length, 0, 'no observed change exists, so none may be claimed');
    assert.equal(delta.historyCoverage.complete, false);
    assert.equal(delta.historyCoverage.observedFrom, null);
  });

  test('2b. an event missing half of its before/after is dropped, not half-rendered', () => {
    const delta = derive({
      events: [event({ structuredPayload: { to: 'Negotiation' } })],
    });
    assert.equal(delta.changes.length, 0);
  });

  test('3. an expected-close move is a transition when it was observed', () => {
    const delta = derive({
      events: [event({
        eventType: 'opportunity_close_period_changed',
        structuredPayload: { from: 'Q3', to: 'Q4' },
      })],
    });

    const [change] = delta.changes;
    assert.equal(change.kind, 'close_period_changed');
    assert.deepEqual(change.transition, { from: 'Q3', to: 'Q4' });
    assert.equal(change.direction, 'weakened', 'a later quarter is a worse commercial position');
    assert.equal(change.dimension, 'money');
  });

  test('3b. a slip into next year is a slip, not an improvement', () => {
    // Compared as strings, "Q1 2027" sorts before "Q4 2026", and the first
    // version reported a quarter's slip as the deal getting better.
    const slipped = derive({
      events: [event({ eventType: 'opportunity_close_period_changed', structuredPayload: { from: 'Q4 2026', to: 'Q1 2027' } })],
    });
    assert.equal(slipped.changes[0].direction, 'weakened');
    const pulledIn = derive({
      events: [event({ eventType: 'opportunity_close_period_changed', structuredPayload: { from: '2027-03-31', to: '2026-12-15' } })],
    });
    assert.equal(pulledIn.changes[0].direction, 'improved');
    const unreadable = derive({
      events: [event({ eventType: 'opportunity_close_period_changed', structuredPayload: { from: 'when budget lands', to: 'Q2 2027' } })],
    });
    assert.equal(unreadable.changes[0].direction, 'neutral', 'a period nobody can place is not guessed at');
  });

  test('4. a close period held only as a current value produces no transition', () => {
    // No event: the workspace knows the deal says Q4, and nothing more.
    const delta = derive({ events: [] });
    assert.equal(delta.changes.filter((item) => item.kind === 'close_period_changed').length, 0);
  });

  test('6. a rescheduled promise keeps the date it was first promised for', () => {
    const delta = derive({
      commitments: [commitment({
        originalDueDate: agoDate(20),
        currentDueDate: agoDate(1),
        dueDateHistory: [{ from: agoDate(20), to: agoDate(1), changedAt: ago(3) }],
      })],
    });

    const moved = delta.changes.find((item) => item.kind === 'commitment_rescheduled');
    assert.ok(moved, 'a move recorded in the due-date history is an observed transition');
    assert.equal(moved.provenance, 'record_history');
    assert.deepEqual(moved.transition, { from: agoDate(20), to: agoDate(1) });
    assert.equal(moved.direction, 'weakened');
  });

  test('6b. a promise that never had a date is not reported as moving from nowhere', () => {
    const delta = derive({
      commitments: [commitment({
        dueDateHistory: [{ from: '', to: agoDate(1), changedAt: ago(3) }],
      })],
    });
    assert.equal(delta.changes.filter((item) => item.kind === 'commitment_rescheduled').length, 0);
  });

  test('7. an objection opening and an objection resolving are both observed', () => {
    const opened = derive({ objections: [objection({ createdAt: ago(3) })] });
    const openedItem = opened.changes.find((item) => item.kind === 'objection_opened');
    assert.ok(openedItem);
    assert.equal(openedItem.dimension, 'purchasing', 'a price objection is a purchasing risk');
    assert.equal(openedItem.direction, 'weakened');

    const resolved = derive({
      objections: [objection({ status: 'Resolved', resolvedAt: agoDate(2), createdAt: ago(60) })],
    });
    const resolvedItem = resolved.changes.find((item) => item.kind === 'objection_resolved');
    assert.ok(resolvedItem);
    assert.equal(resolvedItem.direction, 'improved');
  });

  test('7b. an objection marked resolved with no resolution date is not dated into the window', () => {
    const delta = derive({
      objections: [objection({ status: 'Resolved', resolvedAt: '', createdAt: ago(60), updatedAt: ago(1) })],
    });
    assert.equal(
      delta.changes.filter((item) => item.kind === 'objection_resolved').length,
      0,
      'updatedAt must never be used to date a resolution',
    );
  });

  test('9. a touch that ends a long silence is an observed change; ordinary touches are not', () => {
    const delta = derive({
      activities: [
        activity({ id: 'a-old', activityDate: agoDate(40), createdAt: ago(40) }),
        activity({ id: 'a-new', activityDate: agoDate(2), createdAt: ago(2) }),
      ],
    });

    const broken = delta.changes.filter((item) => item.kind === 'silence_broken');
    assert.equal(broken.length, 1);
    assert.equal(broken[0].direction, 'improved');
    assert.deepEqual(broken[0].sourceRecordIds, ['a-old', 'a-new']);

    const chatty = derive({
      activities: [
        activity({ id: 'a-1', activityDate: agoDate(4) }),
        activity({ id: 'a-2', activityDate: agoDate(3) }),
        activity({ id: 'a-3', activityDate: agoDate(2) }),
      ],
    });
    assert.equal(chatty.changes.length, 0, 'a timeline of touches is not a delta');
  });

  test('a promise kept on the Plan is an observed completion, with no instrumentation', () => {
    const delta = derive({
      planItems: [planItem({ done: true, doneAt: ago(1) })],
    });
    const done = delta.changes.find((item) => item.kind === 'commitment_completed');
    assert.ok(done, 'doneAt is written by the tick, so it is an observation');
    assert.equal(done.provenance, 'record_occurrence');
    assert.deepEqual(done.sourceRecordIds, ['plan-1']);
  });

  test('a deal closed out is reported once, from the retro rather than twice', () => {
    const delta = derive({
      events: [event({ eventType: 'opportunity_won', occurredAt: ago(2) })],
      opportunityOutcomes: [{
        id: 'out-1', opportunityId: OPPORTUNITY_ID, accountName: ACCOUNT,
        opportunityName: 'Analyser rollout', outcome: 'Won', outcomeDate: agoDate(2),
        finalAmount: 100, currency: 'EUR', stageBeforeOutcome: 'Negotiation',
        createdAt: ago(2), updatedAt: ago(2), storageMode: 'local',
      }],
    });

    const outcomes = delta.changes.filter((item) => item.kind === 'outcome_recorded');
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].provenance, 'record_occurrence');
    assert.deepEqual(outcomes[0].transition, { from: 'Negotiation', to: 'Won' });
  });
});

describe('deriveCommercialDelta - current conditions', () => {
  test('5. an overdue promise arrives as a condition, in the policy engine\'s own words', () => {
    const overdue = recommendation({
      reasonCode: 'CUSTOMER_COMMITMENT_OVERDUE',
      reasonText: 'Mai at Vantage committed to "Confirm the quantity" by 16 August. It is 20 days overdue.',
      severity: 'critical',
    });
    const delta = derive({ recommendations: [overdue] });

    assert.equal(delta.changes.length, 0, 'a condition is never listed as a change');
    assert.equal(delta.conditions.length, 1);
    const [condition] = delta.conditions;
    assert.equal(condition.observation, 'condition');
    assert.equal(condition.provenance, 'policy');
    assert.equal(condition.occurredAt, null, 'a condition is true now, not "at" a time');
    assert.equal(condition.statement, overdue.reasonText, 'the rule keeps its own voice');
    assert.equal(condition.reasonCode, 'CUSTOMER_COMMITMENT_OVERDUE');
    assert.equal(condition.significance, 'critical');
  });

  test('8. a silent thread is a condition, phrased in the present', () => {
    const delta = derive({ recommendations: [recommendation()] });
    const [condition] = delta.conditions;
    assert.equal(condition.kind, 'thread_silent');
    assert.match(condition.statement, /has happened/);
    assert.doesNotMatch(condition.statement, /went quiet|became|increased/);
  });

  test('every policy reason code maps to a condition, so a new rule cannot go dark', () => {
    for (const code of reasonCodes) {
      assert.ok(deltaConditionByReason[code], `no delta meaning declared for ${code}`);
    }
  });

  test('conditions from another customer never reach this subject', () => {
    const delta = derive({
      subject: accountSubject,
      recommendations: [recommendation({ accountName: 'Someone Else' })],
    });
    assert.equal(delta.conditions.length, 0);
  });
});

describe('deriveCommercialDelta - interpretation', () => {
  test('past-tense wording is used only when a transition was observed', () => {
    const delta = derive({
      objections: [objection({ createdAt: ago(2) })],
    });
    assert.ok(delta.interpretation);
    assert.match(delta.interpretation.statement, /purchasing risk increased/i);
  });

  test('conditions alone produce present-tense wording, never a claim of change', () => {
    const delta = derive({
      recommendations: [recommendation({ severity: 'high' })],
    });
    assert.ok(delta.interpretation);
    assert.match(delta.interpretation.statement, /is weak/i);
    assert.doesNotMatch(delta.interpretation.statement, /weakened|increased|recovered|improved/i);
  });

  test('a dimension dragged down by conditions is not said to have "increased"', () => {
    // The only thing observed on momentum was a promise kept - an improvement.
    // Two standing problems outweigh it, so the net reads weakened. Nothing was
    // ever watched getting worse, so the sentence may not say it did.
    const delta = derive({
      planItems: [planItem({ done: true, doneAt: ago(1) })],
      recommendations: [
        recommendation({ id: 'r-1', reasonCode: 'THREAD_SILENT', severity: 'medium' }),
        recommendation({
          id: 'r-2', reasonCode: 'CUSTOMER_COMMITMENT_OVERDUE', severity: 'critical',
          reasonText: 'Mai committed to "Send the PO" by 16 August. It is 20 days overdue.',
        }),
      ],
    });

    assert.ok(delta.interpretation);
    assert.match(
      delta.interpretation.statement,
      /^Commercial momentum is weak\.$/,
      'a net weakening with no observed weakening must be stated as a condition',
    );
    assert.doesNotMatch(delta.interpretation.statement, /weakened/);
  });

  test('a sentence may mix tenses when the two dimensions differ in evidence', () => {
    const delta = derive({
      // Observed: an objection resolved (purchasing improved).
      objections: [objection({
        id: 'obj-resolved', status: 'Resolved', resolvedAt: agoDate(2), createdAt: ago(90),
      })],
      // Conditions only: money is in trouble now, with nothing watched changing.
      recommendations: [
        recommendation({ id: 'r-1', reasonCode: 'QUOTE_EXPIRING', severity: 'high' }),
        recommendation({ id: 'r-2', reasonCode: 'MONEY_CHECKPOINT_STUCK', severity: 'high' }),
      ],
    });

    assert.equal(
      delta.interpretation.statement,
      'Money exposure is elevated while purchasing risk eased.',
      'each half is phrased from its own evidence, not from the sentence it shares',
    );
  });

  test('two dimensions moving the same way are joined, not contrasted', () => {
    const delta = derive({
      // A price objection (purchasing) and a slipped quarter (money): both worse.
      objections: [objection({ createdAt: ago(2), impact: 'High' })],
      events: [event({
        eventType: 'opportunity_close_period_changed',
        structuredPayload: { from: 'Q3', to: 'Q4' },
      })],
    });
    assert.ok(delta.interpretation);
    assert.match(delta.interpretation.statement, /both increased\.$/);
    assert.doesNotMatch(
      delta.interpretation.statement,
      / while /,
      '"while" claims a contrast that is not there when both sides moved the same way',
    );
  });

  test('two dimensions moving opposite ways are contrasted', () => {
    const delta = derive({
      objections: [objection({ createdAt: ago(2), impact: 'High' })],
      planItems: [
        planItem({ id: 'p-1', done: true, doneAt: ago(1) }),
        planItem({ id: 'p-2', done: true, doneAt: ago(2) }),
      ],
    });
    assert.ok(delta.interpretation);
    assert.match(delta.interpretation.statement, / while /);
  });

  test('12. an empty workspace produces no items, no reading and no recommendation', () => {
    const delta = derive({});
    assert.deepEqual(delta.changes, []);
    assert.deepEqual(delta.conditions, []);
    assert.equal(delta.interpretation, null, 'silence is not narrated');
    assert.equal(delta.recommendation, null);
    assert.deepEqual(delta.evidenceRecordIds, []);
  });

  test('a change with no direction produces no reading', () => {
    const delta = derive({
      recommendations: [recommendation({
        id: 'rec-owner', reasonCode: 'COMMITMENT_WITHOUT_OWNER', severity: 'low',
      })],
    });
    assert.equal(delta.conditions.length, 1);
    assert.equal(delta.interpretation, null, 'a neutral condition moves no dimension');
  });
});

describe('deriveCommercialDelta - noise, evidence and honesty', () => {
  test('10. many identical changes collapse into one row', () => {
    const stakeholders = Array.from({ length: 12 }, (unused, index) => ({
      id: `sh-${index}`, accountId: '', accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
      opportunityName: '', name: `Person ${index}`, roleTitle: 'Engineer', stakeholderRole: 'Unknown',
      influenceLevel: 'Unknown', relationshipStrength: 'Unknown', stance: 'Unknown', email: '',
      phone: '', notes: '', tags: [], lastInteractionDate: '', createdAt: ago(2), updatedAt: ago(2),
      storageMode: 'local',
    }));

    const delta = derive({ stakeholders });
    const added = delta.changes.filter((item) => item.kind === 'stakeholder_added');
    assert.equal(added.length, 1, 'twelve rows would be a timeline, not a change');
    assert.equal(added[0].groupedCount, 12);
    assert.match(added[0].statement, /12 people added/);
    assert.equal(added[0].sourceRecordIds.length, 12, 'the group still proves itself');
    assert.equal(added[0].transition, undefined, 'a group spans moments and claims none of them');
  });

  test('fewer than the grouping threshold stay as individual rows', () => {
    const stakeholders = Array.from({ length: DELTA_GROUP_AFTER - 1 }, (unused, index) => ({
      id: `sh-${index}`, accountId: '', accountName: ACCOUNT, opportunityId: OPPORTUNITY_ID,
      opportunityName: '', name: `Person ${index}`, roleTitle: '', stakeholderRole: 'Unknown',
      influenceLevel: 'Unknown', relationshipStrength: 'Unknown', stance: 'Unknown', email: '',
      phone: '', notes: '', tags: [], lastInteractionDate: '', createdAt: ago(2), updatedAt: ago(2),
      storageMode: 'local',
    }));
    const delta = derive({ stakeholders });
    assert.equal(delta.changes.length, DELTA_GROUP_AFTER - 1);
  });

  test('11. every item names the records that prove it', () => {
    const delta = derive({
      objections: [objection()],
      planItems: [planItem({ done: true, doneAt: ago(1) })],
      recommendations: [recommendation()],
    });

    for (const item of [...delta.changes, ...delta.conditions]) {
      assert.ok(item.sourceRecordIds.length > 0, `${item.kind} carries no evidence`);
    }
    assert.ok(delta.evidenceRecordIds.includes('obj-1'));
    assert.ok(delta.evidenceRecordIds.includes('plan-1'));
  });

  test('13. history coverage is honest about where observation begins', () => {
    const none = derive({ observedFrom: null });
    assert.equal(none.historyCoverage.complete, false);

    const partial = derive({ observedFrom: ago(DELTA_WINDOW_DAYS - 5) });
    assert.equal(partial.historyCoverage.complete, false, 'observation starting inside the window is partial');

    const full = derive({ observedFrom: ago(DELTA_WINDOW_DAYS + 5) });
    assert.equal(full.historyCoverage.complete, true);
  });

  test('14. the same inputs produce the same output, byte for byte', () => {
    const inputs = {
      events: [event({ structuredPayload: { from: 'Proposal', to: 'Negotiation' } })],
      objections: [objection(), objection({ id: 'obj-2', objectionType: 'Technical fit' })],
      planItems: [planItem({ done: true, doneAt: ago(1) })],
      recommendations: [recommendation()],
      observedFrom: ago(60),
    };
    assert.equal(
      JSON.stringify(derive(inputs)),
      JSON.stringify(derive(inputs)),
      'delta derivation must not depend on wall-clock time or iteration order',
    );
  });

  test('anything outside the window is not a change in this window', () => {
    const delta = derive({
      objections: [objection({ createdAt: ago(DELTA_WINDOW_DAYS + 3) })],
    });
    assert.equal(delta.changes.length, 0);
  });

  test('"now what" is the policy engine\'s own recommendation, not a new one', () => {
    const existing = recommendation();
    const delta = derive({ recommendations: [existing] });
    assert.equal(delta.recommendation, existing, 'the same object, never a rewritten copy');
  });

  test('a deal-scoped delta never inherits another deal\'s objection', () => {
    const delta = derive({
      objections: [objection({ id: 'obj-other', opportunityId: 'opp-2' })],
    });
    assert.equal(delta.changes.length, 0);

    const forAccount = derive({
      subject: accountSubject,
      objections: [objection({ id: 'obj-other', opportunityId: 'opp-2' })],
    });
    assert.equal(forAccount.changes.length, 1, 'the account still owns everything filed under its name');
  });

  test('sample records stay out of a live workspace and inside a demo one', () => {
    const live = derive({ objections: [objection({ isSample: true })] });
    assert.equal(live.changes.length, 0);

    const demo = derive({ objections: [objection({ isSample: true })], includeSampleRecords: true });
    assert.equal(demo.changes.length, 1);
  });

  test('16. a workspace with no cloud events still reports its recorded history', () => {
    // Exactly the offline / local-only case: zero events, records only.
    const delta = derive({
      events: [],
      observedFrom: null,
      commitments: [commitment({
        dueDateHistory: [{ from: agoDate(20), to: agoDate(1), changedAt: ago(3) }],
      })],
      planItems: [planItem({ done: true, doneAt: ago(1) })],
    });

    assert.ok(delta.changes.length >= 2, 'record-preserved history needs no event log');
    assert.equal(delta.historyCoverage.observedFrom, null);
    assert.equal(delta.historyCoverage.complete, false, 'and it says so');
  });
});

describe('diffOpportunityState - what is worth writing down', () => {
  const previous = {
    id: OPPORTUNITY_ID, accountName: ACCOUNT, opportunityName: 'Analyser rollout',
    stage: 'Proposal', expectedClosePeriod: 'Q3', estimatedValue: 400_000, status: 'Active',
  };

  test('a genuine stage move is recorded with both sides', () => {
    const [change] = diffOpportunityState(previous, { ...previous, stage: 'Negotiation' });
    assert.equal(change.field, 'stage');
    assert.equal(change.eventType, 'opportunity_stage_changed');
    assert.equal(change.from, 'Proposal');
    assert.equal(change.to, 'Negotiation');
  });

  test('an unchanged save writes nothing', () => {
    assert.deepEqual(diffOpportunityState(previous, { ...previous }), []);
  });

  test('editing an unwatched field writes nothing', () => {
    assert.deepEqual(diffOpportunityState(previous, { ...previous }), [], 'no event for a notes edit');
  });

  test('setting a field for the first time is not a move from nowhere', () => {
    const blank = { ...previous, stage: '', expectedClosePeriod: '', estimatedValue: null };
    assert.deepEqual(
      diffOpportunityState(blank, previous),
      [],
      'an initial value has no observed predecessor',
    );
  });

  test('a rounding correction is below the bar; a real repricing is not', () => {
    const rounded = 400_000 * (1 + VALUE_CHANGE_RATIO / 2);
    assert.deepEqual(diffOpportunityState(previous, { ...previous, estimatedValue: rounded }), []);

    const [change] = diffOpportunityState(previous, { ...previous, estimatedValue: 250_000 });
    assert.equal(change.field, 'estimatedValue');
    assert.equal(change.eventType, 'opportunity_value_changed');
  });

  test('closing a deal is recorded as won or lost', () => {
    const [won] = diffOpportunityState(previous, { ...previous, status: 'Won' });
    assert.equal(won.eventType, 'opportunity_won');
    const [lost] = diffOpportunityState(previous, { ...previous, status: 'Lost' });
    assert.equal(lost.eventType, 'opportunity_lost');
  });

  test('a hold is not an outcome, and gets no event of its own', () => {
    assert.deepEqual(diffOpportunityState(previous, { ...previous, status: 'On hold' }), []);
  });

  // Idempotency moved to the record revision and has its own suite; see
  // test/unit/eventReliability.test.mjs.

  test('several watched fields moving at once produce one event each', () => {
    const changes = diffOpportunityState(previous, {
      ...previous, stage: 'Negotiation', expectedClosePeriod: 'Q4', estimatedValue: 250_000,
    });
    assert.deepEqual(changes.map((change) => change.field).sort(),
      ['estimatedValue', 'expectedClosePeriod', 'stage']);
  });
});
