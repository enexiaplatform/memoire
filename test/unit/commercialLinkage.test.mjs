import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPreselectable,
  resolveCommercialScope,
} from '../../src/domain/commercialKernel/resolveCommercialScope.ts';
import { suggestHistoricalLinks } from '../../src/domain/commercialKernel/suggestHistoricalLinks.ts';
import {
  deriveStakeholderInvolvement,
  involvementFor,
} from '../../src/domain/commercialLearning/stakeholderInvolvement.ts';
import { buildCommercialDataReadiness } from '../../src/domain/commercialLearning/commercialDataReadiness.ts';
import { derivePersonalLearning } from '../../src/domain/commercialLearning/derivePersonalLearning.ts';
import { learningSampleFloors, MEANINGFUL_EFFECT_POINTS } from '../../src/domain/commercialLearning/learningPatterns.ts';
import { parseCapture } from '../../src/domain/commercialKernel/parseCapture.ts';

const TODAY = '2026-09-06';
const ACCOUNT = 'Rohto Vietnam';

const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000)
  .toISOString().slice(0, 10);
const stamp = (key) => `${key}T00:00:00.000Z`;

const deal = (id, patch = {}) => ({
  id,
  accountName: ACCOUNT,
  opportunityName: `Deal ${id}`,
  status: 'Active',
  createdAt: stamp(day(-200)),
  ...patch,
});

const scope = (patch = {}) => resolveCommercialScope({
  accountName: ACCOUNT,
  rawNote: 'Met QC today. Trial passed.',
  captureDate: TODAY,
  opportunities: [],
  ...patch,
});

// ------------------------------------------------------- capture scope

describe('capture scope resolution', () => {
  test('1. Capture opened from a deal inherits that deal', () => {
    const result = scope({
      opportunities: [deal('a'), deal('b')],
      origin: { kind: 'opportunity', opportunityId: 'b' },
    });
    assert.equal(result.opportunityId, 'b');
    assert.equal(result.resolution, 'exact');
    assert.equal(result.reason, 'opened_from_opportunity');
    assert.ok(isPreselectable(result));
  });

  test('2. one open deal that already existed is proposed', () => {
    const result = scope({ opportunities: [deal('only')] });
    assert.equal(result.opportunityId, 'only');
    assert.equal(result.resolution, 'strong_match');
    assert.equal(result.reason, 'only_open_deal_on_account');
    assert.ok(isPreselectable(result));
  });

  test('3. several open deals require a choice - nothing is guessed', () => {
    const result = scope({ opportunities: [deal('a'), deal('b'), deal('c')] });
    assert.equal(result.opportunityId, null);
    assert.equal(result.resolution, 'multiple_matches');
    assert.equal(result.candidates.length, 3);
    assert.equal(isPreselectable(result), false);
  });

  test('3b. value, close date and edit recency are never identity evidence', () => {
    const result = scope({
      opportunities: [
        deal('small', { estimatedValue: 1, updatedAt: stamp(day(-300)) }),
        deal('huge', { estimatedValue: 9_000_000_000, updatedAt: stamp(day(-1)) }),
      ],
    });
    assert.equal(result.opportunityId, null, 'the bigger, fresher deal must not win by being bigger');
  });

  test('4. a closed deal is never chosen on its own', () => {
    for (const status of ['Won', 'Lost', 'On hold']) {
      const result = scope({ opportunities: [deal('closed', { status })] });
      assert.equal(result.opportunityId, null, `${status} was auto-selected`);
      assert.equal(result.resolution, 'unresolved');
      assert.equal(
        result.candidates[0].isOpen, false,
        'it is still offered, because post-sale work is real work',
      );
    }
  });

  test('4b. a closed deal opened from its own page is a legitimate explicit choice', () => {
    const result = scope({
      opportunities: [deal('won', { status: 'Won' })],
      origin: { kind: 'opportunity', opportunityId: 'won' },
    });
    assert.equal(result.opportunityId, 'won');
  });

  test('5. no deal on the account stays account-level, which is a real answer', () => {
    const result = scope({ opportunities: [deal('elsewhere', { accountName: 'Another Co' })] });
    assert.equal(result.opportunityId, null);
    assert.equal(result.resolution, 'unresolved');
    assert.equal(result.reason, 'no_open_deal');
    assert.equal(result.accountName, ACCOUNT, 'the customer is still resolved');
  });

  test('5b. no account at all resolves to nothing rather than to a guess', () => {
    const result = scope({ accountName: '', opportunities: [deal('a')] });
    assert.equal(result.resolution, 'unresolved');
    assert.equal(result.reason, 'no_account');
    assert.deepEqual(result.candidates, []);
  });

  test('6. the deal named in the note wins over counting open deals', () => {
    const result = scope({
      rawNote: 'Met QC about the PMM media rollout. Trial passed.',
      opportunities: [
        deal('rollout', { opportunityName: 'PMM media rollout' }),
        deal('spares', { opportunityName: 'PMM spare parts' }),
      ],
    });
    assert.equal(result.opportunityId, 'rollout');
    assert.equal(result.reason, 'named_in_note');
  });

  test('6b. a shared word is not a name', () => {
    const result = scope({
      rawNote: 'Met QC about PMM. Trial passed.',
      opportunities: [
        deal('rollout', { opportunityName: 'PMM media rollout' }),
        deal('spares', { opportunityName: 'PMM spare parts' }),
      ],
    });
    assert.equal(result.opportunityId, null, 'a token both deals share cannot pick between them');
  });

  test('7. and 8. a confirmed scope is inherited by every fact', () => {
    const changeSet = parseCapture({
      rawCapture: 'Met QC. Trial passed. Purchasing wants to decide before Sep 20.',
      captureDate: TODAY,
      scope: { accountName: ACCOUNT, opportunityId: 'chosen', opportunityName: 'PMM media rollout' },
      context: {
        accounts: [], opportunities: [], objections: [], stakeholders: [],
        openCommitments: [], evidence: [], reportingCurrency: 'VND',
      },
    });
    assert.ok(changeSet.facts.length > 0, 'the fixture must produce facts');
    for (const fact of changeSet.facts) {
      assert.equal(fact.target.opportunityId, 'chosen', `${fact.kind} did not inherit the scope`);
      assert.equal(fact.target.accountName, ACCOUNT);
    }
  });

  test('8b. with no confirmed scope the parser still reads one out of the note', () => {
    const changeSet = parseCapture({
      rawCapture: 'Met QC. Trial passed.',
      captureDate: TODAY,
      context: {
        accounts: [], opportunities: [], objections: [], stakeholders: [],
        openCommitments: [], evidence: [], reportingCurrency: 'VND',
      },
    });
    for (const fact of changeSet.facts) assert.equal(fact.target.opportunityId, null);
  });
});

// ------------------------------------------------------- historical links

describe('historical link suggestions', () => {
  const activity = (id, patch = {}) => ({
    id,
    accountName: ACCOUNT,
    opportunityName: '',
    activityType: 'Customer meeting',
    activityChannel: '',
    summary: 'Met the lab team',
    nextAction: '',
    dueDate: '',
    tags: [],
    rawNote: 'Met the lab team about the trial.',
    activityDate: day(-30),
    linkedOpportunityId: '',
    linkedOpportunityName: '',
    linkedAccountName: ACCOUNT,
    linkStatus: 'Unlinked',
    createdAt: stamp(day(-30)),
    updatedAt: stamp(day(-30)),
    storageMode: 'local',
    ...patch,
  });

  test('19. a note naming the deal produces a suggestion', () => {
    const review = suggestHistoricalLinks({
      activities: [activity('a', { rawNote: 'Reviewed the PMM media rollout with QC.' })],
      opportunities: [
        deal('rollout', { opportunityName: 'PMM media rollout' }),
        deal('other', { opportunityName: 'Spare parts contract' }),
      ],
    });
    assert.equal(review.suggestions.length, 1);
    assert.equal(review.suggestions[0].opportunityId, 'rollout');
    assert.equal(review.suggestions[0].reason, 'named_in_note');
  });

  test('20. one deal that was open on the day produces a suggestion', () => {
    const review = suggestHistoricalLinks({
      activities: [activity('a')],
      opportunities: [deal('only')],
    });
    assert.equal(review.suggestions.length, 1);
    assert.equal(review.suggestions[0].reason, 'only_open_deal_on_account');
  });

  test('21. a deal created after the interaction is never suggested for it', () => {
    const review = suggestHistoricalLinks({
      activities: [activity('march', { activityDate: day(-120), createdAt: stamp(day(-120)) })],
      // Created after the activity, and today the only open deal on the account.
      opportunities: [deal('august', { createdAt: stamp(day(-10)) })],
    });
    assert.deepEqual(review.suggestions, [], 'today\'s only open deal is not what March was about');
  });

  test('22. several plausible deals produce no suggestion at all', () => {
    const review = suggestHistoricalLinks({
      activities: [activity('a')],
      opportunities: [deal('a'), deal('b')],
    });
    assert.deepEqual(review.suggestions, []);
    assert.equal(review.examined, 1, 'it was looked at and declined, not skipped');
  });

  test('23. suggesting mutates nothing', () => {
    const activities = [activity('a')];
    const before = JSON.stringify(activities);
    suggestHistoricalLinks({ activities, opportunities: [deal('only')] });
    assert.equal(JSON.stringify(activities), before);
  });

  test('23b. an activity already answered is not asked about again', () => {
    for (const linkStatus of ['Linked', 'Ignored']) {
      const review = suggestHistoricalLinks({
        activities: [activity('a', { linkStatus })],
        opportunities: [deal('only')],
      });
      assert.deepEqual(review.suggestions, [], `${linkStatus} was re-suggested`);
    }
  });

  test('25. nothing about outcomes or learning can reach the suggestion engine', () => {
    // A won deal is not more suggestible than a lost one; the engine cannot see
    // outcomes at all, and this pins that it stays that way.
    const won = suggestHistoricalLinks({
      activities: [activity('a')],
      opportunities: [deal('only', { status: 'Won' })],
    });
    assert.deepEqual(won.suggestions, [], 'a closed deal is not a suggestion target');
  });
});

// ------------------------------------------------------ stakeholder involvement

describe('stakeholder involvement', () => {
  const person = (id, name, patch = {}) => ({
    id,
    accountId: '',
    accountName: ACCOUNT,
    opportunityId: '',
    opportunityName: '',
    name,
    roleTitle: 'QC engineer',
    stakeholderRole: 'Unknown',
    influenceLevel: 'Unknown',
    relationshipStrength: 'Developing',
    stance: 'Unknown',
    email: '',
    phone: '',
    notes: '',
    tags: [],
    lastInteractionDate: day(-20),
    createdAt: stamp(day(-40)),
    updatedAt: stamp(day(-20)),
    storageMode: 'local',
    ...patch,
  });

  const linkedActivity = (id, opportunityId, name, patch = {}) => ({
    id,
    accountName: ACCOUNT,
    opportunityName: '',
    activityType: 'Customer meeting',
    activityChannel: '',
    summary: '',
    nextAction: '',
    dueDate: '',
    tags: [],
    rawNote: '',
    stakeholderName: name,
    activityDate: day(-20),
    linkedOpportunityId: opportunityId,
    linkedOpportunityName: '',
    linkedAccountName: ACCOUNT,
    linkStatus: 'Linked',
    createdAt: stamp(day(-20)),
    updatedAt: stamp(day(-20)),
    storageMode: 'local',
    ...patch,
  });

  test('14. and 18. one person can be involved in two deals without being duplicated', () => {
    const index = deriveStakeholderInvolvement({
      stakeholders: [person('p1', 'Lan')],
      activities: [
        linkedActivity('a1', 'rollout', 'Lan'),
        linkedActivity('a2', 'spares', 'Lan'),
      ],
    });
    assert.equal(involvementFor(index, 'rollout').length, 1);
    assert.equal(involvementFor(index, 'spares').length, 1);
    assert.equal(involvementFor(index, 'rollout')[0].stakeholderId, 'p1');
    assert.equal(
      involvementFor(index, 'spares')[0].stakeholderId, 'p1',
      'the same person id on both - one identity, two involvements',
    );
  });

  test('15. an account-level person gains opportunity involvement from a linked touch', () => {
    const index = deriveStakeholderInvolvement({
      stakeholders: [person('p1', 'Lan', { opportunityId: '' })],
      activities: [linkedActivity('a1', 'rollout', 'Lan')],
    });
    const involvement = involvementFor(index, 'rollout');
    assert.equal(involvement.length, 1);
    assert.deepEqual(involvement[0].sources, ['linked_activity']);
    assert.equal(involvement[0].lastSeenOn, day(-20));
  });

  test('16. being in the room does not make anybody the Economic Buyer', () => {
    const index = deriveStakeholderInvolvement({
      stakeholders: [person('p1', 'Lan', { stakeholderRole: 'Unknown' })],
      activities: [linkedActivity('a1', 'rollout', 'Lan')],
    });
    assert.equal(involvementFor(index, 'rollout')[0].recordedRole, 'Unknown');
  });

  test('an unlinked touch evidences no involvement', () => {
    const index = deriveStakeholderInvolvement({
      stakeholders: [person('p1', 'Lan')],
      activities: [linkedActivity('a1', 'rollout', 'Lan', { linkStatus: 'Unlinked', linkedOpportunityId: '' })],
    });
    assert.deepEqual(involvementFor(index, 'rollout'), []);
  });

  test('a name the workspace does not know is not turned into a person', () => {
    const index = deriveStakeholderInvolvement({
      stakeholders: [],
      activities: [linkedActivity('a1', 'rollout', 'Somebody Unrecorded')],
    });
    assert.deepEqual(involvementFor(index, 'rollout'), []);
  });
});

// -------------------------------------------------------------- readiness

describe('commercial data readiness', () => {
  const activity = (id, patch = {}) => ({
    id, accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting',
    activityChannel: '', summary: '', nextAction: '', dueDate: '', tags: [], rawNote: '',
    activityDate: day(-10), linkedOpportunityId: '', linkedOpportunityName: '',
    linkedAccountName: ACCOUNT, linkStatus: 'Unlinked', createdAt: stamp(day(-10)),
    updatedAt: stamp(day(-10)), storageMode: 'local', ...patch,
  });

  const opportunity = (id, patch = {}) => ({
    id, accountName: ACCOUNT, opportunityName: `Deal ${id}`, stage: 'Proposal',
    estimatedValue: 1, currency: 'VND', expectedClosePeriod: 'Q3 2026', productOrSolution: '',
    decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
    nextAction: '', nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
    forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor', status: 'Active',
    createdAt: stamp(day(-200)), updatedAt: stamp(day(-10)), storageMode: 'local', ...patch,
  });

  const emptyLearning = () => derivePersonalLearning({
    opportunities: [], opportunityOutcomes: [], activities: [], stakeholders: [], objections: [],
    quotes: [], commitments: [], evidence: [], today: new Date(`${TODAY}T00:00:00.000Z`),
  });

  test('26. and 27. the denominator is touches on customers that have a deal', () => {
    const readiness = buildCommercialDataReadiness({
      activities: [
        activity('linked', { linkStatus: 'Linked', linkedOpportunityId: 'o1' }),
        activity('same-account'),
        // A customer with no deal at all cannot be linked to one, so it must
        // not count against the rate.
        activity('no-deal', { accountName: 'Prospect Ltd', linkedAccountName: 'Prospect Ltd' }),
      ],
      opportunities: [opportunity('o1')],
      stakeholders: [],
      learning: emptyLearning(),
      evidenceCount: 0,
      commitmentsCount: 0,
      eventHistoryCount: 0,
    });
    assert.equal(readiness.activitiesTotal, 3);
    assert.equal(readiness.activitiesAccountLinked, 3);
    assert.equal(readiness.activitiesLinkableToOpportunity, 2);
    assert.equal(readiness.activitiesOpportunityLinked, 1);
  });

  test('28. pattern readiness is Learning\'s own numbers, not a second estimate', () => {
    const learning = emptyLearning();
    const readiness = buildCommercialDataReadiness({
      activities: [], opportunities: [], stakeholders: [], learning,
      evidenceCount: 0, commitmentsCount: 0, eventHistoryCount: 0,
    });
    assert.equal(readiness.patternReadiness.length, learning.patterns.length);
    for (const pattern of readiness.patternReadiness) {
      const source = learning.patterns.find((item) => item.patternId === pattern.patternId);
      assert.equal(pattern.observableDeals, source.sample);
      assert.equal(pattern.strength, source.strength);
    }
    assert.equal(readiness.patternsForming, 0);
  });

  test('30. the same inputs produce the same readiness', () => {
    const build = () => buildCommercialDataReadiness({
      activities: [activity('a')], opportunities: [opportunity('o1')], stakeholders: [],
      learning: emptyLearning(), evidenceCount: 0, commitmentsCount: 0, eventHistoryCount: 0,
    });
    assert.deepEqual(build(), build());
  });
});

// ------------------------------------------------------------- learning link

describe('linkage feeds learning without learning touching linkage', () => {
  const outcome = (opportunityId, won) => ({
    id: `out-${opportunityId}`, opportunityId, accountName: ACCOUNT,
    opportunityName: 'Deal', outcome: won ? 'Won' : 'Lost', outcomeDate: day(-30),
    finalAmount: 1, currency: 'VND', forecastEvidenceCategoryBeforeOutcome: 'Defensible',
    decisionRecommendationBeforeOutcome: 'Defend', stageBeforeOutcome: 'Proposal',
    pipelineProbabilityBeforeOutcome: null, reasonCategory: 'Technical fit', reasonText: '',
    createdAt: stamp(day(-30)), updatedAt: stamp(day(-30)), storageMode: 'local',
  });

  const closedDeal = (id, won) => ({
    id, accountName: ACCOUNT, opportunityName: `Deal ${id}`, stage: 'Proposal',
    estimatedValue: 1, currency: 'VND', expectedClosePeriod: 'Q3 2026', productOrSolution: '',
    decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
    nextAction: '', nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
    forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor',
    status: won ? 'Won' : 'Lost', createdAt: stamp(day(-200)), updatedAt: stamp(day(-30)),
    storageMode: 'local',
  });

  const visit = (id, opportunityId, linked) => ({
    id, accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting',
    activityChannel: 'On-site visit', summary: '', nextAction: '', dueDate: '', tags: [],
    rawNote: '', activityDate: day(-60),
    linkedOpportunityId: linked ? opportunityId : '',
    linkedOpportunityName: '', linkedAccountName: ACCOUNT,
    linkStatus: linked ? 'Linked' : 'Unlinked',
    createdAt: stamp(day(-60)), updatedAt: stamp(day(-60)), storageMode: 'local',
  });

  const run = (activities) => derivePersonalLearning({
    opportunities: [closedDeal('d1', true), closedDeal('d2', false)],
    opportunityOutcomes: [outcome('d1', true), outcome('d2', false)],
    activities,
    stakeholders: [], objections: [], quotes: [], commitments: [], evidence: [],
    today: new Date(`${TODAY}T00:00:00.000Z`),
  });

  const visitPattern = (result) => result.patterns.find((item) => item.patternId === 'site_visit_before_close');

  test('34. an unlinked touch contributes nothing to a cohort', () => {
    const unlinked = visitPattern(run([visit('a1', 'd1', false), visit('a2', 'd2', false)]));
    assert.equal(unlinked.sample, 0, 'a touch with no deal on it cannot answer a question about a deal');
  });

  test('33. linking the same touches canonically expands the cohort - Learning unchanged', () => {
    const linked = visitPattern(run([visit('a1', 'd1', true), visit('a2', 'd2', true)]));
    assert.equal(linked.sample, 2);
    assert.equal(linked.exposed.deals, 2, 'both deals now have an on-site visit on file');
  });

  test('35. the learning thresholds are untouched by this phase', () => {
    assert.equal(learningSampleFloors.early.total, 8);
    assert.equal(learningSampleFloors.early.perGroup, 3);
    assert.equal(learningSampleFloors.developing.total, 20);
    assert.equal(learningSampleFloors.developing.perGroup, 6);
    assert.equal(learningSampleFloors.established.total, 40);
    assert.equal(learningSampleFloors.established.perGroup, 12);
    assert.equal(MEANINGFUL_EFFECT_POINTS, 15);
  });
});
