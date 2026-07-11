import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMorningBrief } from '../src/utils/morningBrief.ts';

const today = '2026-07-09';

function makeNudge(patch = {}) {
  return {
    id: `nudge-${Math.random().toString(36).slice(2)}`,
    source: 'opportunity',
    entityType: 'opportunity',
    entityId: 'opp-1',
    accountName: 'Summit Diagnostics',
    opportunityName: 'QC workflow',
    title: 'Deal going silent',
    reason: 'No customer touch since Jun 20, 2026.',
    recommendedAction: 'Send the follow-up now.',
    urgency: 'critical',
    dueDate: '',
    status: 'active',
    snoozedUntil: '',
    createdAt: `${today}T00:00:00.000Z`,
    updatedAt: `${today}T00:00:00.000Z`,
    storageMode: 'local',
    ...patch,
  };
}

function makeActivity(patch = {}) {
  return {
    id: `act-${Math.random().toString(36).slice(2)}`,
    accountName: 'Summit Diagnostics',
    opportunityName: 'QC workflow',
    activityType: 'Call',
    summary: 'Touch',
    nextAction: '',
    dueDate: '',
    tags: [],
    linkedOpportunityId: '',
    linkedOpportunityName: '',
    linkedAccountName: '',
    linkStatus: 'Unlinked',
    rawNote: 'Touch',
    activityDate: '2026-07-08',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

// 1. Urgent state: headline counts urgent deals, silence question is generated and deep-linked.
{
  const brief = buildMorningBrief({
    today,
    nudges: [
      makeNudge(),
      makeNudge({ id: 'n2', source: 'objection', title: 'Unresolved objection', urgency: 'high', accountName: 'DKSH' }),
    ],
    activities: [makeActivity()],
    waitingFollowUps: 2,
  });
  assert.equal(brief.headline, '2 deals need attention before anything else.');
  assert.ok(brief.focus.some((line) => line.includes('Deal going silent')));
  assert.ok(brief.focus.some((line) => line.includes('1 customer touch yesterday')));
  assert.ok(brief.focus.some((line) => line.includes('2 sent follow-ups are still waiting')));
  const silenceQuestion = brief.questions.find((question) => question.label.includes('Summit Diagnostics'));
  assert.ok(silenceQuestion, 'silence nudge must produce a deep-linked question');
  assert.ok(silenceQuestion.href.startsWith('/app/ask?question='), 'questions must deep-link into Ask Memoire');
  const silenceParams = new URL(`http://memoire.test${silenceQuestion.href}`).searchParams;
  assert.equal(silenceParams.get('scope'), 'opportunity', 'silence question must scope to the flagged deal');
  assert.equal(silenceParams.get('opportunityId'), 'opp-1');
  assert.equal(silenceParams.get('question'), silenceQuestion.label);
  assert.ok(brief.questions.some((question) => question.label.includes('objections')));
  assert.ok(brief.questions.length <= 3);
}

// 2. Calm state: honest headline, default questions, no invented urgency.
{
  const brief = buildMorningBrief({ today, nudges: [], activities: [], waitingFollowUps: 0 });
  assert.equal(brief.headline, 'No deals are at risk this morning. Use today to build momentum.');
  assert.ok(brief.focus.some((line) => line.includes('No touches captured yesterday')));
  assert.equal(brief.questions.length >= 2, true);
  assert.ok(brief.questions.every((question) => question.href.startsWith('/app/ask?question=')));
}

// 3. Question labels survive the URL round-trip, including special characters.
{
  const brief = buildMorningBrief({ today, nudges: [makeNudge({ accountName: 'A & B Co' })], activities: [] });
  const encoded = brief.questions.find((question) => question.label.includes('A & B Co'));
  assert.ok(encoded, 'special-character account names must still produce a question');
  const roundTrip = new URL(`http://memoire.test${encoded.href}`).searchParams.get('question');
  assert.equal(roundTrip, encoded.label, 'question must decode back to the exact label');
}

// 3b. Account-level silence nudges fall back to an unscoped question.
{
  const brief = buildMorningBrief({
    today,
    nudges: [makeNudge({ entityType: 'account', entityId: 'acc-1' })],
    activities: [],
  });
  const question = brief.questions.find((item) => item.label.includes('Summit Diagnostics'));
  const params = new URL(`http://memoire.test${question.href}`).searchParams;
  assert.equal(params.get('scope'), null, 'non-opportunity nudges must not force a scope');
}

// 3c. A non-silence deal nudge yields a scoped "where does it stand" question
// that Ask Memoire answers from the journey read-model.
{
  const brief = buildMorningBrief({
    today,
    nudges: [makeNudge({ id: 'n-money', title: 'Payment overdue', entityType: 'opportunity', entityId: 'opp-9', accountName: 'Apex Labs', urgency: 'high' })],
    activities: [],
  });
  const positionQuestion = brief.questions.find((question) => question.label === 'Where does Apex Labs stand?');
  assert.ok(positionQuestion, 'a non-silence deal nudge must offer a deal-position question');
  const params = new URL(`http://memoire.test${positionQuestion.href}`).searchParams;
  assert.equal(params.get('scope'), 'opportunity', 'deal-position question must scope to the flagged opportunity');
  assert.equal(params.get('opportunityId'), 'opp-9');
}

// 3d. A silence nudge keeps its own richer question - no duplicate deal-position.
{
  const brief = buildMorningBrief({ today, nudges: [makeNudge()], activities: [] });
  assert.equal(
    brief.questions.some((question) => question.label === 'Where does Summit Diagnostics stand?'),
    false,
    'a silence deal is covered by its silence question, not a second deal-position one',
  );
}

// 4. UI contract: card rendered on Today; Ask Memoire consumes ?question= once context loads.
const dashboard = readFileSync(new URL('../src/features/dashboard/DashboardPage.tsx', import.meta.url), 'utf8');
for (const marker of ['MorningBriefCard', 'buildMorningBrief']) {
  assert.ok(dashboard.includes(marker), `DashboardPage missing marker: ${marker}`);
}
const askPage = readFileSync(new URL('../src/features/v31/AskMemoirePage.tsx', import.meta.url), 'utf8');
for (const marker of ["searchParams.get('question')", 'urlQuestionConsumed']) {
  assert.ok(askPage.includes(marker), `AskMemoirePage missing marker: ${marker}`);
}

console.log('Morning brief contract verified.');
