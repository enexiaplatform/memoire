import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';

process.env.VITE_SUPABASE_URL = 'https://memoire-plan.example.test';
process.env.VITE_SUPABASE_ANON_KEY = 'local-fixture-key';
process.env.VITE_ENABLE_NATIVE_WORKSPACES = 'true';
const repeat = Number(process.argv.find(arg => arg.startsWith('--repeat='))?.split('=')[1] ?? 1);
assert.ok(Number.isSafeInteger(repeat) && repeat > 0, 'Repeat count must be a positive integer.');
let browser, base;
const login = '11111111-1111-4111-8111-111111111111';
const workspace = 'bbbbbbbb-1111-4111-8111-111111111111';
const owner = '33333333-3333-4333-8333-333333333333';
const stamp = new Date().toISOString();
const day = stamp.slice(0, 10);
const user = { id: login, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const session = { user, access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' };

async function scenario(named, surface) {
  const fromPlan = surface === "Plan";
  const fromReview = surface === 'Review';
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' });
  let releaseScope;
  const scopeGate = new Promise(resolve => { releaseScope = resolve; });
  let releaseWorkspaceData;
  const workspaceDataGate = new Promise(resolve => { releaseWorkspaceData = resolve; });
  let incidentResponse;
  let incidentRequests = 0;
  let releaseIncidents;
  try {
    const priorSaturday = new Date(Date.parse(stamp) - 14 * 86_400_000);
    priorSaturday.setUTCDate(priorSaturday.getUTCDate() - ((priorSaturday.getUTCDay() + 1) % 7));
    const planDate = fromPlan ? day : priorSaturday.toISOString().slice(0, 10);
    const plan = { id: 'synthetic-plan', date: planDate, label: 'Call the fixture account', tag: 'Fixture account', createdAt: stamp, updatedAt: stamp, done: false, source: 'user' };
    const activityId = randomUUID();
    let existing = {
      id: activityId, user_id: named ? owner : login, activity_date: planDate, raw_note: 'Existing fixture call',
      summary: 'Existing fixture call', activity_type: 'Call', account_name: 'Fixture account', tags: [], created_at: stamp, updated_at: stamp,
    };
    const requests = [];
    const reviewWrites = [];
    let duplicate;
    let hideActivities = false;
    let completed = null;
    let dropped = false;
    let releaseResponse;
    const firstResponse = new Promise(resolve => { releaseResponse = resolve; });
    const corruptKey = (named ? 'memoire.workspace.v1.' + login + '.' + workspace + '.' : '')
      + 'memoire.plan-completion.v1.' + login + '.' + randomUUID();
    await context.addInitScript(({ origin, auth, book, corruptKey }) => {
      if (location.origin !== origin || sessionStorage.getItem('fixture-seeded')) return;
      localStorage.setItem('memoire.supabase.auth', JSON.stringify(auth));
      if (book) sessionStorage.setItem('memoire.active-data-workspace.v1:' + auth.user.id, book);
      if (corruptKey) localStorage.setItem(corruptKey, '{unreadable');
      sessionStorage.setItem('fixture-seeded', 'true');
    }, { origin: base, auth: session, book: named ? workspace : null, corruptKey: fromPlan ? corruptKey : null });
    await context.route('https://memoire-plan.example.test/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': '*', 'access-control-allow-headers': '*' } });
      const respond = (json, status = 200) => route.fulfill({ json, status, headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' } });
      if (path === '/auth/v1/user') return respond(user);
      if (path.endsWith('/rpc/memoire_get_native_workspace_scope')) {
        if (named && fromPlan) await scopeGate;
        return respond({ data_owner_id: owner, name: 'Fixture workspace' });
      }
      if (path.endsWith('/rpc/memoire_active_data_owner')) return respond(owner);
      if (path.endsWith('/memoire_personal_workspaces')) return respond([{ id: workspace, name: 'Fixture workspace', created_at: stamp }]);
      if (path.endsWith('/user_profiles')) return respond({ id: login, email: user.email, created_at: user.created_at, display_name: 'Fixture operator' });
      if (path.endsWith('/commercial_incidents') && incidentResponse && req.headers()['x-memoire-data-workspace'] !== workspace) {
        incidentRequests++;
        const status = await incidentResponse;
        return status === 200 ? respond([]) : respond({ message: 'Fixture evidence unavailable' }, status);
      }
      if (path.endsWith('/plan_items')) {
        if (!fromReview) return respond([{ id: plan.id, payload: completed || plan, updated_at: (completed || plan).updatedAt }]);
        const namedRequest = req.headers()['x-memoire-data-workspace'] === workspace;
        if (req.method() === 'POST') {
          const row = req.postDataJSON();
          assert.match(req.headers().prefer, /resolution=ignore-duplicates/);
          assert.equal(row.user_id, namedRequest ? owner : login);
          assert.equal(row.payload.done, false);
          assert.equal(row.payload.completionActivityId, undefined);
          assert.ok(row.payload.reviewProposal.sourceRecordIds.length);
          reviewWrites.push(row);
          return respond({ id: row.id }, 201);
        }
        return respond([...(duplicate && !namedRequest ? [duplicate] : []),
          ...reviewWrites.filter(row => row.user_id === (namedRequest ? owner : login))]);
      }
      if (path.endsWith('/sales_activities')) {
        if (fromReview && req.method() !== 'GET') throw new Error('Review may never write Activity.');
        if (req.method() === 'POST') {
          const payload = req.postDataJSON();
          existing = { ...existing, ...payload, created_at: stamp, updated_at: stamp };
          return respond(existing);
        }
        if (fromReview) return respond(hideActivities ? [] : [{ ...existing, user_id: req.headers()['x-memoire-data-workspace'] === workspace ? owner : login }]);
        if (!named && req.headers()['x-memoire-data-workspace'] === workspace) {
          await workspaceDataGate;
          return respond([{ ...existing, id: 'aaaaaaaa-1111-4111-8111-111111111111', user_id: owner, account_name: 'Second workspace account' }]);
        }
        return respond([existing]);
      }
      return respond([]);
    });
    // This browser fixture owns only the synthetic PR-01 API.
    await context.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'fixture_unavailable' } }));
    await context.route('**/api/commercial?resource=plan-completion', async route => {
      const req = route.request();
      assert.equal(req.headers()['x-memoire-data-workspace'], named ? workspace : 'default');
      const payload = req.postDataJSON();
      requests.push(payload);
      assert.equal(payload.planId, plan.id);
      const receiptId = completed?.completionRevision ?? randomUUID();
      completed = { ...plan, done: true, updatedAt: new Date(Date.now() + 1000).toISOString(), doneAt: stamp,
        completionRevision: receiptId, completionActivityId: payload.activityId };
      if (fromPlan && !dropped) {
        dropped = true;
        await firstResponse;
        return route.abort('connectionreset');
      }
      return route.fulfill({ json: { status: 'confirmed', receiptId, committedAt: stamp, transitioned: !fromPlan, record: completed } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (fromReview) {
      const draft = page.getByRole('region', { name: 'Review follow-up draft' });
      const followUp = draft.getByRole('textbox', { name: 'Follow-up' });
      const save = draft.getByRole('button', { name: 'Save to Plan' });
      const loadReview = async () => {
        await page.goto(base + '/app/reviews');
        await page.getByText('What this leaves for next week', { exact: true }).click();
        const action = page.getByRole('link', { name: 'Plan follow-up for Fixture account', exact: true }).first();
        await action.waitFor();
        return action;
      };
      await page.setViewportSize({ width: 390, height: 844 });
      const action = await loadReview();
      await action.press('Enter');
      await followUp.waitFor();
      assert.equal(await followUp.evaluate(input => document.activeElement === input), true);
      assert.ok(await draft.evaluate(panel => panel.scrollWidth <= panel.clientWidth));
      const original = await followUp.inputValue();
      await draft.getByText('Personal workspace · Proposed', { exact: true }).waitFor();
      await draft.getByText('Commercial thread · Fixture account', { exact: false }).waitFor();
      const defaultDate = await draft.getByLabel('Plan date').inputValue();
      await page.goBack();
      await page.goForward();
      await followUp.waitFor();
      assert.equal(await followUp.inputValue(), original);
      await draft.getByRole('link', { name: 'Cancel draft' }).click();
      await draft.waitFor({ state: 'detached' });
      assert.equal(reviewWrites.length, 0);

      const staleAction = await loadReview();
      hideActivities = true;
      await staleAction.press('Enter');
      await draft.getByRole('alert').filter({ hasText: 'proposal or its source evidence changed' }).waitFor();
      assert.equal(await save.count(), 0);
      assert.equal(reviewWrites.length, 0);
      hideActivities = false;

      const staleBeforeSave = await loadReview();
      await staleBeforeSave.press('Enter');
      await followUp.waitFor();
      await followUp.fill('Unsubmitted wording');
      hideActivities = true;
      await save.click();
      await draft.getByRole('alert').filter({ hasText: 'proposal or its source evidence changed' }).waitFor();
      assert.equal(await draft.getByLabel('Your unsaved wording').inputValue(), 'Unsubmitted wording');
      assert.equal(reviewWrites.length, 0);
      hideActivities = false;

      const switchAction = await loadReview();
      await switchAction.press('Enter');
      await followUp.waitFor();
      await page.setViewportSize({ width: 1440, height: 1000 });
      const switched = page.waitForURL('**/app/today');
      await page.getByLabel('Switch workspace').selectOption(workspace);
      await switched;
      await page.goBack();
      await draft.getByRole('alert').filter({ hasText: 'belongs to another workspace' }).waitFor();
      assert.equal(await followUp.count(), 0);
      assert.equal(reviewWrites.length, 0);

      const returned = page.waitForURL('**/app/today');
      await page.getByLabel('Switch workspace').selectOption('');
      await returned;
      duplicate = { id: 'matching-plan-item', updated_at: stamp, payload: {
        ...plan, id: 'matching-plan-item', label: 'Check a previous follow-up', date: defaultDate,
        linkedAccountName: 'Fixture account',
      } };
      const matchingAction = await loadReview();
      await matchingAction.press('Enter');
      await followUp.fill('Check a previous follow-up');
      await draft.getByRole('alert').filter({ hasText: 'Possible duplicate' }).waitFor();
      assert.ok(await save.isDisabled());
      await followUp.fill('Follow up on the revised terms');
      await draft.getByLabel('Plan date').fill(planDate);
      await save.evaluate(button => { button.click(); button.click(); });
      await draft.waitFor({ state: 'detached' });
      await page.getByRole('checkbox', { name: 'Mark "Follow up on the revised terms" done', exact: true }).waitFor();
      await page.getByText('Planned from Review', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('date'), planDate);
      assert.equal(reviewWrites.length, 1);
      assert.equal(reviewWrites[0].payload.date, planDate);
      assert.equal(reviewWrites[0].payload.linkedAccountName, 'Fixture account');
      assert.equal(requests.length, 0);
      await page.goBack();
      await page.goForward();
      await page.getByRole('checkbox', { name: 'Mark "Follow up on the revised terms" done', exact: true }).waitFor();
      assert.equal(await draft.count(), 0);
      assert.equal(reviewWrites.length, 1);
      assert.deepEqual(errors, []);
      console.log('Review follow-up draft verified: explicit save, duplicate warning, scoped evidence, weekend, and history.');
      return;
    } else if (fromPlan) {
      await page.goto(base + '/app/timeline?view=upcoming');
      const box = page.getByRole('checkbox', { name: 'Mark "Call the fixture account" done', exact: true });
      if (named) {
        await page.getByText('Opening workspace…', { exact: true }).waitFor();
        assert.equal(await box.count(), 0);
        assert.equal(await page.getByText('Some saved Plan completions could not be read.', { exact: false }).count(), 0);
        releaseScope();
      }
      await box.waitFor();
      assert.equal(await page.evaluate(key => localStorage.getItem(key), corruptKey), '{unreadable');
      await page.getByText('Some saved Plan completions could not be read.', { exact: false }).waitFor();
      await box.click().catch(async error => { console.error((await page.locator('body').innerText()).slice(-3000)); throw error; });
      await page.getByLabel('Activity entry').selectOption(activityId);
      await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }));
      await page.getByRole('button', { name: 'Link and mark done', exact: true }).click();
      await page.getByText('1 Plan completion waiting for workspace confirmation.').waitFor();
      await page.getByText('Completion saved on this device, waiting for workspace confirmation.', { exact: true }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Not now', exact: true }).click();
      assert.equal(requests.length, 0);
      assert.equal(await box.count(), 1);
      const attempt = page.waitForRequest('**/api/commercial?resource=plan-completion');
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        window.dispatchEvent(new Event('online'));
      });
      await attempt;
      assert.equal(await box.count(), 1);
      const checking = page.getByRole('button', { name: 'Checking…', exact: true });
      await checking.waitFor();
      assert.ok(await checking.isDisabled());
      const lost = page.waitForEvent('requestfailed', request => request.url().includes('resource=plan-completion'));
      releaseResponse();
      await lost;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Mark "Call the fixture account" not done', exact: true }).waitFor();
      assert.deepEqual(requests[0], requests[1]);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), corruptKey), '{unreadable');
      const completions = requests.length;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(base + '/app/reviews');
      await page.getByText('What this leaves for next week', { exact: true }).click();
      const attention = page.getByRole('region', { name: 'Commercial attention' });
      const why = attention.getByRole('button', { name: 'Why am I seeing this?' }).first();
      await why.focus();
      await page.keyboard.press('Enter');
      await attention.getByText('Review proposal', { exact: true }).waitFor();
      await attention.getByText(named ? 'Fixture workspace' : 'Personal workspace', { exact: true }).waitFor();
      await attention.getByText('Suggested for human review', { exact: true }).waitFor();
      await attention.getByText('Commercial thread · Fixture account', { exact: false }).waitFor();
      assert.equal(await why.getAttribute('aria-expanded'), 'true');
      assert.ok(await attention.evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.keyboard.press('Space');
      assert.equal(await attention.getByText('Review proposal', { exact: true }).count(), 0);
      assert.equal(await why.getAttribute('aria-expanded'), 'false');
      if (!named) {
        const failure = attention.getByRole('alert').filter({ hasText: 'Incident responses could not be loaded' });
        const retry = attention.getByRole('button', { name: 'Retry evidence', exact: true });
        const retrying = attention.getByRole('button', { name: 'Retrying evidence…', exact: true });
        const holdIncidents = () => {
          incidentResponse = new Promise(resolve => { releaseIncidents = resolve; });
          return page.waitForRequest(req => new URL(req.url()).pathname.endsWith('/commercial_incidents'));
        };
        const reopenFixtureReview = async () => {
          await page.goto(base + '/app/reviews');
          await page.getByText('What this leaves for next week', { exact: true }).click();
          await failure.waitFor();
        };
        incidentResponse = Promise.resolve(403);
        await reopenFixtureReview();
        const retryUrl = page.url();
        const previousRequests = incidentRequests;
        const failedRetry = holdIncidents();
        await retry.evaluate(button => { button.click(); button.click(); });
        await failedRetry;
        await retrying.waitFor();
        assert.ok(await retrying.isDisabled());
        releaseIncidents(403);
        await failure.waitFor();
        assert.equal(incidentRequests, previousRequests + 1);
        assert.equal(page.url(), retryUrl);

        const recovering = holdIncidents();
        await retry.press('Enter');
        await recovering;
        await retrying.waitFor();
        releaseIncidents(200);
        await retrying.waitFor({ state: 'detached' });
        assert.equal(await failure.count(), 0);
        assert.equal(page.url(), retryUrl);
        assert.equal(incidentRequests, previousRequests + 2);
        await why.press('Enter');
        await attention.getByText('Review proposal', { exact: true }).waitFor();
        await attention.getByText('Commercial thread · Fixture account', { exact: false }).waitFor();

        incidentResponse = Promise.resolve(403);
        await reopenFixtureReview();
        const staleRetry = holdIncidents();
        await retry.click();
        await staleRetry;
        await retrying.waitFor();
        await page.setViewportSize({ width: 1440, height: 1000 });
        const switched = page.waitForURL('**/app/today');
        await page.getByLabel('Switch workspace').selectOption(workspace);
        await switched;
        await page.getByLabel('Switch workspace').waitFor();
        await page.goto(base + '/app/reviews');
        await page.getByText('What this leaves for next week', { exact: true }).click();
        await attention.getByText('Fixture workspace', { exact: true }).waitFor();
        await attention.getByText('Loading workspace evidence…', { exact: true }).waitFor();
        assert.equal(await attention.getByText('Review proposal', { exact: true }).count(), 0);
        assert.equal(await attention.getByText('Commercial thread · Fixture account', { exact: false }).count(), 0);
        releaseIncidents(403);
        releaseWorkspaceData();
        const namedProposal = attention.getByRole('button', { name: 'Why am I seeing this?' }).first();
        await namedProposal.press('Enter');
        await attention.getByText('Commercial thread · Second workspace account', { exact: false }).waitFor();
        assert.equal(await attention.getByText('Commercial thread · Fixture account', { exact: false }).count(), 0);
        assert.equal(await failure.count(), 0);
        assert.equal(await retry.count(), 0);
      }
      assert.equal(requests.length, completions);
    } else {
      await page.goto(base + '/app/capture?mode=quick&account=Fixture%20account');
      await page.getByLabel('Activity date', { exact: true }).fill(planDate);
      await page.locator('label').filter({ hasText: 'What happened?' }).locator('textarea').fill('Completed the scheduled account call.')
        .catch(async error => { console.error((await page.locator('body').innerText()).slice(-2500)); throw error; });
      await page.getByRole('button', { name: 'Save Quick Capture', exact: true }).click();
      await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }));
      await page.getByRole('button', { name: 'Mark done', exact: true }).click();
      const pendingCapture = page.getByText('Plan completion saved on this device, waiting for workspace confirmation.', { exact: true });
      await pendingCapture.waitFor();
      await page.evaluate(async record => {
        window.dispatchEvent(new CustomEvent('memoire:plan-completion-changed', { detail: { status: 'confirmed', record } }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, { ...plan, id: 'unrelated-plan', label: 'Unrelated completion', done: true, completionActivityId: existing.id });
      assert.equal(await pendingCapture.isVisible(), true);
      assert.equal(await page.getByRole('link', { name: 'View linked activity' }).count(), 0);
      assert.equal(requests.length, 0);
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        window.dispatchEvent(new Event('online'));
      });
      await page.getByText('Plan completion confirmed.', { exact: true }).waitFor();
      assert.equal(requests.length, 1);
      const activityHref = '/app/timeline?view=history&activityId=' + existing.id;
      assert.equal(await page.getByRole('link', { name: 'View linked activity' }).getAttribute('href'), activityHref);
      const planLink = page.getByRole('link', { name: 'Review in Plan' });
      assert.equal(await planLink.getAttribute('href'), '/app/timeline?view=upcoming&date=' + planDate);
      await planLink.click();
      await page.getByRole('checkbox', { name: 'Mark "Call the fixture account" not done', exact: true }).waitFor();
      const linkedActivity = page.getByRole('link', { name: 'View activity', exact: true }).and(page.locator(`a[href="${activityHref}"]`));
      await linkedActivity.click();
      await page.waitForURL(url => url.searchParams.get('activityId') === existing.id && url.searchParams.get('view') === 'history');
    }
    assert.equal(completed.completionActivityId, existing.id);
    assert.deepEqual(errors, []);
    console.log((named ? 'Named ' : 'Default ') + surface + ' browser path confirmed with the original Activity ID.');
  } finally {
    releaseIncidents?.(403);
    releaseScope();
    releaseWorkspaceData();
    await context.close();
  }
}

const outDir = await mkdtemp(join(tmpdir(), 'memoire-plan-browser-'));
let server;
try {
  // Serve immutable assets so Vite's dev dependency optimizer cannot replace
  // modules or reload the page while Chrome is bootstrapping a workspace.
  const config = { configFile: false, envDir: false, build: { outDir } };
  await build({ ...config, plugins: [react()], logLevel: 'warn' });
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await chromium.launch(process.argv.includes('--system-chrome') ? { channel: 'chrome' } : {});
  for (let iteration = 0; iteration < repeat; iteration++) {
    for (const named of [false, true]) {
      await scenario(named, "Plan");
      await scenario(named, "Capture");
    }
    await scenario(false, 'Review');
  }
} finally {
  await browser?.close();
  await server?.close();
  await rm(outDir, { recursive: true, force: true });
}
