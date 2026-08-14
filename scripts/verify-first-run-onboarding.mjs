import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

/**
 * What a person sees the first time they open Memoire.
 *
 * Before 2026-08-14 the answer was: nothing. `OnboardingModal` mounted on every
 * `/app` route with `active: false` in its initial state and could only be woken
 * by a replay event from Settings, so the welcome screen it contained had never
 * been shown to a new account - and the tour behind that replay button still
 * walked through `/app/pipeline-defense`, a destination retired from the rail.
 * The only guidance that did run - the First Week Path strip on Today - was
 * gated on the workspace already having records, which is to say it appeared
 * only after the hardest step had been taken with no help at all.
 *
 * Three properties are pinned here, and they are the three that decay:
 *
 *   1. A new arrival is met. The redirect exists, and it is a function of the
 *      workspace rather than of a flag alone.
 *   2. Guidance is derived, never claimed. No step in the coach can be ticked by
 *      a button; the workspace ticks it. A checklist you can lie to measures
 *      nothing and teaches nothing.
 *   3. There is one path. The welcome, the strip and the coach all read their
 *      steps from `buildFirstWeekPath`, so they cannot describe three different
 *      first weeks - the exact failure that produced six competing onboarding
 *      surfaces last time.
 */

// The store's decisions run in node, so give the module the browser API it
// guards for. Without this every write is a no-op and the per-account rule -
// the subtle half of the contract - cannot be tested at all.
const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
};

const {
  completeFirstRun,
  firstRunUserKey,
  markFirstRunStarted,
  readFirstRunState,
  restartFirstRun,
  shouldOpenFirstRun,
} = await import('../src/utils/firstRun.ts');
const { buildFirstWeekPath } = await import('../src/utils/firstWeekPath.ts');

// 1. Who gets welcomed. The decision is a pure function of two things, and both
// halves have to hold: a stored answer alone must not silence it for a
// different account, and an empty flag must not drag an established workspace
// back to the welcome.
{
  const base = { userKey: 'user-a', hasAnyRecord: false, sampleDataActive: false, state: null };

  assert.equal(shouldOpenFirstRun(base), true, 'an empty workspace that has never answered is welcomed');

  assert.equal(
    shouldOpenFirstRun({ ...base, hasAnyRecord: true }),
    false,
    'a workspace with records is already underway and is never sent back to the welcome',
  );

  assert.equal(
    shouldOpenFirstRun({ ...base, sampleDataActive: true }),
    false,
    'the sample workspace has its own guidance; welcoming someone into records that are not theirs teaches the wrong loop',
  );

  assert.equal(
    shouldOpenFirstRun({ ...base, state: { userKey: 'user-a', completedAt: '2026-08-14T00:00:00.000Z' } }),
    false,
    'an answered welcome stays answered',
  );

  assert.equal(
    shouldOpenFirstRun({ ...base, state: { userKey: 'user-b', completedAt: '2026-08-14T00:00:00.000Z' } }),
    true,
    'one browser holds two logins - the second person must not inherit the first person\'s "already seen this"',
  );

  assert.equal(
    shouldOpenFirstRun({ ...base, state: { userKey: 'user-a', startedAt: '2026-08-14T00:00:00.000Z' } }),
    true,
    'opening the welcome is not answering it - a reload mid-flow returns to it',
  );
}

// 2. The stored answer round-trips, is owned by an account, and Settings can
// clear it.
{
  restartFirstRun();
  assert.equal(readFirstRunState(), null, 'a cleared store reads as never answered');

  assert.equal(firstRunUserKey({ id: 'abc' }), 'abc');
  assert.equal(firstRunUserKey({ email: 'a@b.c' }), 'a@b.c', 'an account without an id is still an account');
  assert.equal(firstRunUserKey(null), 'local', 'a browser-only session is a person too');

  markFirstRunStarted('user-a');
  assert.equal(readFirstRunState()?.startedAt !== undefined, true);
  assert.equal(readFirstRunState()?.completedAt, undefined, 'starting is not finishing');

  completeFirstRun('user-a', 'sample-workspace');
  assert.equal(readFirstRunState()?.choice, 'sample-workspace', 'the door taken is recorded');
  assert.equal(readFirstRunState()?.completedAt !== undefined, true);

  restartFirstRun();
  assert.equal(readFirstRunState(), null, '"Show the guide again" really forgets');
}

const app = readFileSync('src/App.tsx', 'utf8');
const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
const today = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
const welcome = readFileSync('src/features/onboarding/FirstRunPage.tsx', 'utf8');
const coach = readFileSync('src/features/onboarding/GettingStartedCoach.tsx', 'utf8');
const settings = readFileSync('src/features/settings/SettingsPage.tsx', 'utf8');

// 3. The welcome is reachable, and it is reachable without the rail. A first-run
// screen framed by eleven destinations nobody has a reason to understand yet is
// the confusion it exists to remove, so the route is a sibling of the shell
// rather than one of its children.
{
  assert.ok(app.includes('path="/app/start"'), 'App must declare the welcome route');
  const shellBlock = app.slice(app.indexOf('path="/app"'));
  assert.equal(
    shellBlock.includes('path="/app/start"'),
    false,
    'the welcome must not be nested inside the AppShell route',
  );
  assert.ok(
    /path="\/app\/start"[\s\S]{0,200}<ProtectedRoute>/.test(app),
    'the welcome renders one account\'s workspace choices and stays behind ProtectedRoute',
  );
}

// 4. A new arrival is actually redirected, and only once the load has finished -
// "no records yet" and "the cloud has not answered yet" are indistinguishable
// mid-flight, and only one of them is a new user.
{
  assert.ok(today.includes('shouldOpenFirstRun({'), 'Today must ask whether this arrival is a first run');
  assert.ok(today.includes('<Navigate to="/app/start" replace />'), 'Today must send a first run to the welcome');
  assert.ok(
    today.includes('!authLoading && !loading && shouldOpenFirstRun({'),
    'the redirect must wait for the workspace load, or a slow cloud looks like a new account',
  );
  assert.ok(
    today.includes('hasAnyRecord: data.activities.length > 0'),
    'the redirect must be decided from the workspace, not from the stored flag alone',
  );
}

// 5. The coach rides the shell, so guidance survives walking from Today to the
// screen it just pointed at. That was the whole failure of a strip that lived on
// one page.
{
  assert.ok(shell.includes('<GettingStartedCoach />'), 'the shell must render the coach on every workspace route');
  assert.equal(
    existsSync('src/components/layout/OnboardingModal.tsx'),
    false,
    'the dead guided-workflow modal is back',
  );
  assert.equal(
    existsSync('src/features/onboarding/guidedWorkflow.ts'),
    false,
    'the guided-workflow event plumbing is back; it drove a tour through retired routes',
  );
  for (const file of ['src/features/v31/AskMemoirePage.tsx', 'src/features/v31/FollowUpComposerPanel.tsx']) {
    assert.equal(
      readFileSync(file, 'utf8').includes('guidedWorkflow'),
      false,
      `${file} still dispatches into a listener that no longer exists`,
    );
  }
}

// 6. Progress is derived, never claimed. This is the property that makes the
// coach worth having: there is no button anywhere on it that marks a step done,
// so the only way to advance is to do the work in the product.
{
  assert.ok(coach.includes('useFirstWeekPath()'), 'the coach must read progress from the workspace');
  for (const claim of [
    'markTrialActivationChecklistItemComplete',
    'setDone(',
    'onMarkDone',
    'Mark as done',
    'markStepComplete',
  ]) {
    assert.equal(coach.includes(claim), false, `the coach lets a step be claimed rather than earned: ${claim}`);
  }
  assert.ok(
    coach.includes('dismissTrialActivationChecklist()'),
    'dismissal reuses the existing onboarding flag - a second dismissal store is how guidance comes back from the dead',
  );
}

// 7. The coach knows when to stay away: the sample workspace has its own
// journey card, two screens are already having this conversation, and a
// finished workspace is finished.
{
  assert.ok(coach.includes('sampleDataActive'), 'the coach must stand down in the sample workspace');
  assert.ok(
    coach.includes("const SUPPRESSED_ROUTES = ['/app/start', '/app/today']"),
    'the coach must not float over the welcome, nor over the Today strip that already shows the same five steps',
  );
  assert.ok(
    coach.includes('SUPPRESSED_ROUTES.includes(pathname)'),
    'the suppression list must actually be applied',
  );
  assert.ok(
    coach.includes('path.complete && !graduating'),
    'a completed path retires the coach rather than leaving a permanent 5/5 badge on screen',
  );
  assert.ok(
    coach.includes('!loaded'),
    'a workspace that has not answered must show no progress at all - a 0/5 ring over a failed load reads as "you have captured nothing"',
  );
}

// 8. One path, three surfaces. The welcome names the five steps by reading them
// from the same builder Today and the coach use, so nobody can rewrite the first
// week in one place and leave the other two describing the old one.
{
  assert.ok(
    welcome.includes('buildFirstWeekPath({ activities: [], opportunities: [], briefs: [] }).steps'),
    'the welcome must read its five beats from the path builder rather than restating them',
  );
  const steps = buildFirstWeekPath({ activities: [], opportunities: [], briefs: [] }).steps;
  assert.equal(steps.length, 5, 'the welcome renders whatever the builder returns; five is the product decision');
  for (const step of steps) {
    assert.ok(step.label.length > 0 && step.hint.length > 0, `step ${step.id} has nothing to show a new user`);
  }
}

// 9. Onboarding invents no analytics. The taxonomy is duplicated across the
// client, the endpoint and a Postgres CHECK constraint; a name added here alone
// is silently rejected by the database and reported as delivered.
{
  const taxonomy = readFileSync('src/utils/productAnalytics.ts', 'utf8');
  const used = [...`${welcome}${coach}`.matchAll(/trackProductEvent\('([a-z_]+)'/g)].map((match) => match[1]);
  assert.ok(used.length > 0, 'the welcome should report that a demo was started');
  for (const event of used) {
    assert.ok(
      taxonomy.includes(`| '${event}'`),
      `onboarding sends an event the taxonomy does not declare: ${event}`,
    );
  }
}

// 10. There is a way back in. Onboarding you cannot reopen is onboarding that
// has to be right on the single pass, and nobody manages that.
{
  assert.ok(settings.includes('restartFirstRun()'), 'Settings must be able to bring the welcome back');
  assert.ok(
    settings.includes('resetTrialActivationChecklist()'),
    'bringing the guide back must also clear the dismissal, or only half of it returns',
  );
  assert.equal(
    settings.includes('REPLAY_GUIDED_WORKFLOW_EVENT'),
    false,
    'Settings still fires the retired replay event, which led a tour through routes that no longer exist',
  );
}

console.log('First-run onboarding contract verified: new arrivals are met, progress is earned, one path across three surfaces.');
