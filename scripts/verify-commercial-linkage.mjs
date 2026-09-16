import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * Commercial history is only worth reasoning about while it is attached to the
 * deal it belongs to.
 *
 * A real workspace was measured at one opportunity-linked activity in a
 * hundred, with the customer resolved on ninety-nine of them - so the history
 * existed and the sentence connecting it to the deal did not. The assertions
 * here protect the fix and, more importantly, protect it from the obvious
 * over-correction: a product that links everything to something is worse than
 * one that links nothing, because a false link is invisible afterwards and
 * changes what Memoire later tells the seller about their own business.
 */

// A browser-shaped global, so the canonical activity writer can be exercised
// end to end rather than asserted on by reading its source.
const store = new Map();
const storage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
  clear: () => store.clear(),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};
globalThis.window = {
  localStorage: storage,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = storage;
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
};

const {
  isPreselectable,
  resolveCommercialScope,
} = await import('../src/domain/commercialKernel/resolveCommercialScope.ts');
const { suggestHistoricalLinks } = await import('../src/domain/commercialKernel/suggestHistoricalLinks.ts');
const {
  deriveStakeholderInvolvement,
  involvementFor,
} = await import('../src/domain/commercialLearning/stakeholderInvolvement.ts');
const { buildCommercialDataReadiness } = await import('../src/domain/commercialLearning/commercialDataReadiness.ts');
const { derivePersonalLearning } = await import('../src/domain/commercialLearning/derivePersonalLearning.ts');
const {
  learningSampleFloors,
  MEANINGFUL_EFFECT_POINTS,
} = await import('../src/domain/commercialLearning/learningPatterns.ts');
const { saveSalesActivity, loadSalesActivities } = await import('../src/services/salesActivityStore.ts');

const codeOf = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const readCode = (file) => codeOf(readFileSync(file, 'utf8'));

const resolverCode = readCode('src/domain/commercialKernel/resolveCommercialScope.ts');
const suggestionCode = readCode('src/domain/commercialKernel/suggestHistoricalLinks.ts');
const involvementCode = readCode('src/domain/commercialLearning/stakeholderInvolvement.ts');
const readinessCode = readCode('src/domain/commercialLearning/commercialDataReadiness.ts');
const capturePageCode = readCode('src/features/dailyCapture/DailyCapturePage.tsx');
const activityStoreCode = readCode('src/services/salesActivityStore.ts');
const linkagePanelCode = readCode('src/features/reviews/CommercialLinkagePanel.tsx');

const TODAY = '2026-09-06';
const ACCOUNT = 'Rohto Vietnam';
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000)
  .toISOString().slice(0, 10);
const stamp = (key) => `${key}T00:00:00.000Z`;

const deal = (id, patch = {}) => ({
  id, accountName: ACCOUNT, opportunityName: `Deal ${id}`, status: 'Active',
  createdAt: stamp(day(-200)), ...patch,
});

const scope = (patch = {}) => resolveCommercialScope({
  accountName: ACCOUNT, rawNote: 'Met QC today.', captureDate: TODAY, opportunities: [], ...patch,
});

// ---------------------------------------------------------------- Contract A
// Whatever Memoire proposes, the operator can say otherwise.
{
  const proposed = scope({ opportunities: [deal('only')] });
  assert.equal(proposed.opportunityId, 'only');
  assert.ok(proposed.candidates.length > 0, 'a proposal must arrive with its alternatives');

  const ambiguous = scope({ opportunities: [deal('a'), deal('b')] });
  assert.equal(ambiguous.candidates.length, 2, 'the choice must be offered, not hidden');

  assert.ok(
    capturePageCode.includes('chooseScope') && capturePageCode.includes('scopeOverrideId'),
    'the capture screen must let the operator override the resolved scope',
  );
  assert.ok(
    /Keep it with the customer/.test(capturePageCode),
    'declining a deal entirely must be one of the offered answers',
  );
}

// ---------------------------------------------------------------- Contract B
// A finished deal is never chosen for a new interaction on its own.
{
  for (const status of ['Won', 'Lost', 'On hold']) {
    const result = scope({ opportunities: [deal('closed', { status })] });
    assert.equal(result.opportunityId, null, `a ${status} deal was auto-selected`);
    assert.equal(isPreselectable(result), false);
  }
  // Explicitly chosen is different, and post-sale work is real work.
  const explicit = scope({
    opportunities: [deal('won', { status: 'Won' })],
    origin: { kind: 'opportunity', opportunityId: 'won' },
  });
  assert.equal(explicit.opportunityId, 'won');
  assert.ok(
    /=== 'Active'/.test(resolverCode),
    'only Active may count as open; a paused deal is not what a new note is probably about',
  );
}

// ---------------------------------------------------------------- Contract C
// Knowing the customer does not mean knowing the deal.
{
  const noDeal = scope({ opportunities: [deal('elsewhere', { accountName: 'Another Co' })] });
  assert.equal(noDeal.accountName, ACCOUNT, 'the customer is still resolved');
  assert.equal(noDeal.opportunityId, null, 'and the note stays with the customer');
  assert.equal(noDeal.resolution, 'unresolved');

  const ambiguous = scope({ opportunities: [deal('a'), deal('b')] });
  assert.equal(ambiguous.opportunityId, null, 'several open deals is not an answer');
  assert.equal(isPreselectable(ambiguous), false);

  // None of these is identity evidence, and none of them may appear here.
  for (const forbidden of ['estimatedValue', 'expectedClosePeriod', 'updatedAt', 'rank', 'severity']) {
    assert.equal(
      resolverCode.includes(forbidden), false,
      `the resolver is reading something that is not identity evidence: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract D
// A scope confirmed at capture survives the canonical write.
{
  store.clear();
  const activity = {
    accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting', summary: 'Met QC',
    nextAction: '', dueDate: '', tags: [], rawNote: 'Met QC today.', activityDate: TODAY,
  };
  const saved = await saveSalesActivity(activity, undefined, { source: 'user' }, {
    linkedOpportunityId: 'opp-confirmed',
    linkedOpportunityName: 'PMM media rollout',
    linkedAccountName: ACCOUNT,
  });
  assert.equal(saved.record.linkedOpportunityId, 'opp-confirmed', 'the writer dropped the link');
  assert.equal(saved.record.linkStatus, 'Linked');

  // And it is still there after a read, which is where it used to be lost.
  const stored = await loadSalesActivities();
  const [reloaded] = stored.filter((item) => item.id === saved.record.id);
  assert.equal(reloaded.linkedOpportunityId, 'opp-confirmed', 'the link did not survive the read path');
  assert.equal(reloaded.linkedOpportunityName, 'PMM media rollout');

  // Passing nothing still means account-level, which is a real answer.
  const unlinked = await saveSalesActivity(activity, undefined, { source: 'user' });
  assert.equal(unlinked.record.linkStatus, 'Unlinked');
  assert.equal(unlinked.record.linkedOpportunityId, '');

  // A name with no id is a label, not a link.
  const nameOnly = await saveSalesActivity(activity, undefined, { source: 'user' }, {
    linkedOpportunityId: '', linkedOpportunityName: 'PMM media rollout', linkedAccountName: ACCOUNT,
  });
  assert.equal(nameOnly.record.linkStatus, 'Unlinked');

  // Both writers, from one decision.
  //
  // The cloud insert cannot be exercised from here without a Supabase, so what
  // is pinned instead is that it does not get to decide anything: every one of
  // its four link columns comes out of `resolveActivityLink`, the same function
  // the browser copy above just proved. Eight uses - four fields, twice - and a
  // writer that starts hardcoding one of them again drops below that.
  const linkHelperUses = (activityStoreCode.match(/resolveActivityLink\(link\)/g) || []).length;
  assert.equal(
    linkHelperUses, 8,
    `both writers must derive all four link fields from resolveActivityLink; found ${linkHelperUses}`,
  );
  assert.equal(
    /link_status: 'Unlinked'/.test(activityStoreCode), false,
    'no writer may hardcode Unlinked; it is a decision, not a default',
  );
  store.clear();
}

// ---------------------------------------------------------------- Contract E
// One person, however many deals they turn up on.
{
  const person = {
    id: 'p1', accountId: '', accountName: ACCOUNT, opportunityId: '', opportunityName: '',
    name: 'Lan', roleTitle: 'QC engineer', stakeholderRole: 'Unknown', influenceLevel: 'Unknown',
    relationshipStrength: 'Developing', stance: 'Unknown', email: '', phone: '', notes: '',
    tags: [], lastInteractionDate: day(-20), createdAt: stamp(day(-40)), updatedAt: stamp(day(-20)),
    storageMode: 'local',
  };
  const touch = (id, opportunityId) => ({
    id, accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting',
    activityChannel: '', summary: '', nextAction: '', dueDate: '', tags: [], rawNote: '',
    stakeholderName: 'Lan', activityDate: day(-20), linkedOpportunityId: opportunityId,
    linkedOpportunityName: '', linkedAccountName: ACCOUNT, linkStatus: 'Linked',
    createdAt: stamp(day(-20)), updatedAt: stamp(day(-20)), storageMode: 'local',
  });

  const index = deriveStakeholderInvolvement({
    stakeholders: [person],
    activities: [touch('a1', 'rollout'), touch('a2', 'spares')],
  });
  assert.equal(involvementFor(index, 'rollout')[0].stakeholderId, 'p1');
  assert.equal(
    involvementFor(index, 'spares')[0].stakeholderId, 'p1',
    'the same person id must serve both deals - two records would be two Lans',
  );

  for (const forbidden of ['createStakeholder', 'saveStakeholder', 'localStorage', 'supabase']) {
    assert.equal(
      involvementCode.includes(forbidden), false,
      `involvement must be derived, never written: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract F
// Attendance is not authority.
{
  const index = deriveStakeholderInvolvement({
    stakeholders: [{
      id: 'p1', accountId: '', accountName: ACCOUNT, opportunityId: '', opportunityName: '',
      name: 'Lan', roleTitle: 'QC engineer', stakeholderRole: 'Unknown', influenceLevel: 'Unknown',
      relationshipStrength: 'Developing', stance: 'Unknown', email: '', phone: '', notes: '',
      tags: [], lastInteractionDate: day(-20), createdAt: stamp(day(-40)),
      updatedAt: stamp(day(-20)), storageMode: 'local',
    }],
    activities: [{
      id: 'a1', accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting',
      activityChannel: '', summary: '', nextAction: '', dueDate: '', tags: [], rawNote: '',
      stakeholderName: 'Lan', activityDate: day(-20), linkedOpportunityId: 'rollout',
      linkedOpportunityName: '', linkedAccountName: ACCOUNT, linkStatus: 'Linked',
      createdAt: stamp(day(-20)), updatedAt: stamp(day(-20)), storageMode: 'local',
    }],
  });
  assert.equal(involvementFor(index, 'rollout')[0].recordedRole, 'Unknown');
  for (const forbidden of ['Economic Buyer', 'Champion', 'Decision Maker']) {
    assert.equal(
      involvementCode.includes(forbidden), false,
      `involvement is assigning a MEDDIC role: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract G
// Suggestions, never a backfill.
{
  const activities = [{
    id: 'a1', accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting',
    activityChannel: '', summary: 'Met the lab team', nextAction: '', dueDate: '', tags: [],
    rawNote: 'Met the lab team.', activityDate: day(-30), linkedOpportunityId: '',
    linkedOpportunityName: '', linkedAccountName: ACCOUNT, linkStatus: 'Unlinked',
    createdAt: stamp(day(-30)), updatedAt: stamp(day(-30)), storageMode: 'local',
  }];
  const before = JSON.stringify(activities);
  const review = suggestHistoricalLinks({ activities, opportunities: [deal('only')] });
  assert.equal(review.suggestions.length, 1);
  assert.equal(JSON.stringify(activities), before, 'suggesting must not mutate history');

  for (const forbidden of ['updateSalesActivityLink', 'saveSalesActivity', 'localStorage', 'supabase']) {
    assert.equal(
      suggestionCode.includes(forbidden), false,
      `the suggestion engine can write: ${forbidden}`,
    );
  }
  assert.ok(
    linkagePanelCode.includes('onLink') && linkagePanelCode.includes('onIgnore'),
    'the operator must be able to accept or decline each one',
  );
  assert.equal(
    /Link all|Apply all|backfill/i.test(linkagePanelCode), false,
    'there must be no bulk apply',
  );
}

// ---------------------------------------------------------------- Contract H
// A deal cannot be what a note was about before that deal existed.
{
  const march = [{
    id: 'a1', accountName: ACCOUNT, opportunityName: '', activityType: 'Customer meeting',
    activityChannel: '', summary: 'Met the lab team', nextAction: '', dueDate: '', tags: [],
    rawNote: 'Met the lab team.', activityDate: day(-120), linkedOpportunityId: '',
    linkedOpportunityName: '', linkedAccountName: ACCOUNT, linkStatus: 'Unlinked',
    createdAt: stamp(day(-120)), updatedAt: stamp(day(-120)), storageMode: 'local',
  }];
  const review = suggestHistoricalLinks({
    activities: march,
    opportunities: [deal('august', { createdAt: stamp(day(-10)) })],
  });
  assert.deepEqual(
    review.suggestions, [],
    'today\'s only open deal was suggested for an interaction that predates it',
  );
  assert.ok(
    resolverCode.includes('existedOn'),
    'the resolver must ask what existed on the day, not what exists now',
  );

  // The live path is gated the same way, by the same function.
  const future = scope({
    captureDate: day(-120),
    opportunities: [deal('later', { createdAt: stamp(day(-10)) })],
  });
  assert.equal(future.opportunityId, null);
}

// ---------------------------------------------------------------- Contract I
// Learning is a consumer of linkage and never an input to it.
{
  for (const forbidden of [
    'derivePersonalLearning', 'PersonalLearningEvidence', 'commercialLearning',
    'strengthFor', 'evidenceStrength', 'cohort',
  ]) {
    assert.equal(
      `${resolverCode}${suggestionCode}`.includes(forbidden), false,
      `linkage is reading Commercial Learning: ${forbidden}`,
    );
  }
  // Nor may it read outcomes, which is the same mistake wearing a data model.
  for (const forbidden of ['outcome', 'Won', 'Lost', 'winRate']) {
    assert.equal(
      suggestionCode.includes(forbidden), false,
      `the suggestion engine is reading outcomes: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract J
// This phase changed no learning threshold.
{
  assert.deepEqual(
    {
      early: { ...learningSampleFloors.early },
      developing: { ...learningSampleFloors.developing },
      established: { ...learningSampleFloors.established },
    },
    {
      early: { total: 8, perGroup: 3 },
      developing: { total: 20, perGroup: 6 },
      established: { total: 40, perGroup: 12 },
    },
    'a linkage phase must not move a learning threshold',
  );
  assert.equal(MEANINGFUL_EFFECT_POINTS, 15);
}

// ---------------------------------------------------------------- Contract K
// Readiness reports Learning's own numbers rather than a second estimate.
{
  const learning = derivePersonalLearning({
    opportunities: [], opportunityOutcomes: [], activities: [], stakeholders: [], objections: [],
    quotes: [], commitments: [], evidence: [], today: new Date(stamp(TODAY)),
  });
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
  assert.ok(
    readinessCode.includes('input.learning.patterns'),
    'readiness must read the learning result rather than recompute observability',
  );
  for (const forbidden of ['observableFrom', 'earliestDay', 'strengthFor']) {
    assert.equal(
      readinessCode.includes(forbidden), false,
      `readiness is re-deriving learning observability: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract L
// No AI.
{
  for (const file of [
    'src/domain/commercialKernel/resolveCommercialScope.ts',
    'src/domain/commercialKernel/suggestHistoricalLinks.ts',
    'src/domain/commercialLearning/stakeholderInvolvement.ts',
    'src/domain/commercialLearning/commercialDataReadiness.ts',
  ]) {
    const source = readFileSync(file, 'utf8').toLowerCase();
    for (const forbidden of ['openai', 'anthropic', 'embedding', 'fetch(', 'xmlhttprequest']) {
      assert.equal(source.includes(forbidden), false, `${file} reaches a model or the network: ${forbidden}`);
    }
  }
}

// ---------------------------------------------------------------- Contract M
// Nothing here became a destination.
{
  const routes = readCode('src/App.tsx');
  for (const forbidden of ['/app/linkage', '/app/data', '/app/cleanup', 'LinkagePage', 'DataQualityPage']) {
    assert.equal(routes.includes(forbidden), false, `linkage grew its own route: ${forbidden}`);
  }
  const registry = readCode('src/config/featureRegistry.ts');
  const block = registry.match(/export const PRIMARY_DESTINATION_IDS = \[([\s\S]*?)\] as const;/);
  assert.ok(block, 'featureRegistry must declare PRIMARY_DESTINATION_IDS');
  const destinations = [...block[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
  assert.equal(destinations.length, 7, 'Memoire has seven primary destinations (Leads became the seventh on 2026-09-16)');
  assert.ok(!destinations.some((id) => /linkage|data|quality|cleanup/.test(id)));

  // And it did not become a spreadsheet.
  for (const forbidden of ['<table', 'selectAll', 'bulkEdit', 'checkbox']) {
    assert.equal(
      linkagePanelCode.includes(forbidden), false,
      `the linkage panel is turning into a data grid: ${forbidden}`,
    );
  }
}

// ---------------------------------------------------------------- Contract N
// Linkage counting stays on the device and stays content-free.
{
  const metricsCode = readCode('src/services/captureFactMetrics.ts');
  for (const forbidden of ['accountName', 'opportunityName', 'rawNote', 'amount', 'fetch(', 'trackProductEvent']) {
    assert.equal(
      metricsCode.includes(forbidden), false,
      `capture metrics can carry commercial content: ${forbidden}`,
    );
  }
  assert.ok(
    metricsCode.includes('scopeResolution'),
    'how scope resolved is worth counting, as a category',
  );
  assert.equal(
    /accountName|opportunityName|rawNote/.test(readinessCode.split('buildCommercialDataReadiness')[0]), false,
    'readiness must not export commercial names',
  );
}

console.log(
  'Commercial linkage verified: scope is resolved once and survives the write, '
  + 'history is suggested rather than rewritten, and nothing is linked to a deal that did not exist yet.',
);
