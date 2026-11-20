import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

process.env.VITE_SUPABASE_URL = 'https://memoire-plan.example.test';
process.env.VITE_SUPABASE_ANON_KEY = 'local-fixture-key';
process.env.VITE_ENABLE_NATIVE_WORKSPACES = 'true';
const server = await createServer({ configFile: false, envDir: false, plugins: [react()], server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch(process.argv.includes('--system-chrome') ? { channel: 'chrome' } : {});
const login = '11111111-1111-4111-8111-111111111111';
const workspace = 'bbbbbbbb-1111-4111-8111-111111111111';
const owner = '33333333-3333-4333-8333-333333333333';
const stamp = new Date().toISOString();
const day = stamp.slice(0, 10);
const user = { id: login, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const session = { user, access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' };

async function scenario(named, surface) {
  const fromPlan = surface === "Plan";
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' });
  try {
    const plan = { id: 'synthetic-plan', date: day, label: 'Call the fixture account', tag: 'Fixture account', createdAt: stamp, updatedAt: stamp, done: false, source: 'user' };
    const activityId = randomUUID();
    let existing = {
      id: activityId, user_id: named ? owner : login, activity_date: day, raw_note: 'Existing fixture call',
      summary: 'Existing fixture call', activity_type: 'Call', account_name: 'Fixture account', tags: [], created_at: stamp, updated_at: stamp,
    };
    const requests = [];
    let completed = null;
    let dropped = false;
    let releaseResponse;
    const firstResponse = new Promise(resolve => { releaseResponse = resolve; });
    const corruptKey = (named ? 'memoire.workspace.v1.' + login + '.' + workspace + '.' : '')
      + 'memoire.plan-completion.v1.' + login + '.' + randomUUID();
    await context.addInitScript(({ auth, book, corruptKey }) => {
      localStorage.setItem('memoire.supabase.auth', JSON.stringify(auth));
      if (book) sessionStorage.setItem('memoire.active-data-workspace.v1:' + auth.user.id, book);
      if (corruptKey) localStorage.setItem(corruptKey, '{unreadable');
    }, { auth: session, book: named ? workspace : null, corruptKey: fromPlan ? corruptKey : null });
    await context.route('https://memoire-plan.example.test/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': '*', 'access-control-allow-headers': '*' } });
      const respond = json => route.fulfill({ json, headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' } });
      if (path === '/auth/v1/user') return respond(user);
      if (path.endsWith('/rpc/memoire_get_native_workspace_scope')) return respond({ data_owner_id: owner, name: 'Fixture workspace' });
      if (path.endsWith('/rpc/memoire_active_data_owner')) return respond(owner);
      if (path.endsWith('/user_profiles')) return respond({ id: login, email: user.email, created_at: user.created_at, display_name: 'Fixture operator' });
      if (path.endsWith('/plan_items')) return respond([{ id: plan.id, payload: completed || plan, updated_at: (completed || plan).updatedAt }]);
      if (path.endsWith('/sales_activities')) {
        if (req.method() === 'POST') {
          const payload = req.postDataJSON();
          existing = { ...existing, ...payload, created_at: stamp, updated_at: stamp };
          return respond(existing);
        }
        return respond([existing]);
      }
      return respond([]);
    });
    // Keep unrelated APIs out of Vite's source module fallback. A clean CI
    // checkout has no built Vercel handlers and this fixture only owns PR-01.
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
    if (fromPlan) {
      await page.goto(base + '/app/timeline?view=upcoming');
      await page.getByText('Some saved Plan completions could not be read.', { exact: false }).waitFor();
      const box = page.getByRole('checkbox', { name: 'Mark "Call the fixture account" done', exact: true });
      await box.click().catch(async error => { console.error((await page.locator('body').innerText()).slice(-3000)); throw error; });
      await page.getByLabel('Activity entry').selectOption(activityId);
      await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }));
      await page.getByRole('button', { name: 'Link and mark done', exact: true }).click();
      await page.getByText('1 Plan completion waiting for workspace confirmation.').waitFor();
      assert.equal(requests.length, 0);
      assert.equal(await box.count(), 1);
      const attempt = page.waitForRequest('**/api/commercial?resource=plan-completion');
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        window.dispatchEvent(new Event('online'));
      });
      await attempt;
      assert.equal(await box.count(), 1);
      const lost = page.waitForEvent('requestfailed', request => request.url().includes('resource=plan-completion'));
      releaseResponse();
      await lost;
      await page.getByRole('button', { name: 'Link and mark done', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Mark "Call the fixture account" not done', exact: true }).waitFor();
      assert.deepEqual(requests[0], requests[1]);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), corruptKey), '{unreadable');
    } else {
      await page.goto(base + '/app/capture?mode=quick&account=Fixture%20account');
      await page.locator('label').filter({ hasText: 'What happened?' }).locator('textarea').fill('Completed the scheduled account call.')
        .catch(async error => { console.error((await page.locator('body').innerText()).slice(-2500)); throw error; });
      await page.getByRole('button', { name: 'Save Quick Capture', exact: true }).click();
      await page.getByRole('button', { name: 'Mark done', exact: true }).click();
      await page.getByText('Plan completion confirmed.', { exact: true }).waitFor();
      assert.equal(requests.length, 1);
    }
    assert.equal(completed.completionActivityId, existing.id);
    assert.deepEqual(errors, []);
    console.log((named ? 'Named ' : 'Default ') + surface + ' browser path confirmed with the original Activity ID.');
  } finally {
    await context.close();
  }
}

try {
  for (const named of [false, true]) {
    await scenario(named, "Plan");
    await scenario(named, "Capture");
  }
} finally {
  await browser.close();
  await server.close();
}
