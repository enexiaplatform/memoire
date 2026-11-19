import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { appHeaders, attest, checked, cleanup, command, config, env, seed } from './hosted.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pendingText = /Plan completion.*waiting for workspace confirmation/;
const routePath = '/api/commercial?resource=plan-completion';
export async function verifyPr01(c, {
  attestTarget = attest, setFlag, prepare = async () => {}, browserOptions = {},
  label = 'HOSTED STAGING', preflight = false, rehearseFlag = false,
} = {}) {
  const initial = await attestTarget(c);
  console.log(label, 'binding verified for', initial.commit);
  if (preflight) return;
  if (!setFlag) assert.equal(initial.planCompletionEnabled, true, 'Enable Plan completion before running the gates.');

  const ids = [];
  let browser;
  const day = new Date().toISOString().slice(0, 10);
  const accountName = 'Synthetic PR-01 Account';
  const requestFor = (plan, activityId) => ({
    requestId: randomUUID(), planId: plan.id, activityId, derivedKey: null,
    expectedUpdatedAt: plan.updatedAt, label: null, tag: null,
  });

  async function waitFor(description, predicate, timeout = 25_000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await predicate()) return;
      await pause(500);
    }
    throw new Error('Timed out: ' + description);
  }

  async function flag(expected) {
    const timeout = Number(env.MEMOIRE_STAGING_FLAG_WAIT_MS ?? '600000');
    assert.ok(Number.isSafeInteger(timeout) && timeout >= 1000 && timeout <= 1_800_000);
    if (setFlag) await setFlag(expected);
    else console.log('Set staging PLAN_COMPLETION_ENABLED to', expected, 'and retain the same origin and commit.');
    await waitFor('staging flag ' + expected, async () => {
      const result = await attestTarget(c).catch(() => null);
      return result?.planCompletionEnabled === expected;
    }, timeout);
  }

  async function row(book, id) {
    return checked('Read synthetic Plan', book.scoped.from('plan_items').select('payload')
      .eq('user_id', book.owner).eq('id', id).maybeSingle());
  }

  function setPlan(book, payload) {
    return checked('Write scoped synthetic Plan', book.scoped.from('plan_items').upsert({
      id: payload.id, user_id: book.owner, payload, updated_at: payload.updatedAt,
    }, { onConflict: 'user_id,id' }));
  }

  async function seedCase(book, label) {
    const now = new Date().toISOString();
    const plan = { id: 'stage-' + randomUUID(), label, date: day, tag: accountName, done: false, source: 'user', createdAt: now, updatedAt: now };
    const activity = randomUUID();
    await setPlan(book, plan);
    await checked('Insert scoped synthetic Activity', book.scoped.from('sales_activities').insert({
      id: activity, user_id: book.owner, activity_date: day, raw_note: label, summary: label,
      activity_type: 'Call', account_name: accountName, tags: [],
    }));
    return { plan, activity };
  }

  async function expectCommand(token, book, body, code) {
    await attestTarget(c);
    const response = await command(c, token, book.id, body);
    assert.equal(response.status, code);
    return response.json();
  }

  try {
    const fixture = await seed(c, ids);
    await prepare(fixture, seedCase);
    if (setFlag) await flag(true);
    const [bookA, bookB] = fixture.books;
    const token = fixture.owner.session.access_token;
    const outside = await seedCase(bookA, 'Foreign Auth test');
    const outsideBody = requestFor(outside.plan, outside.activity);
    await expectCommand(fixture.outsider.session.access_token, bookA, outsideBody, 404);
    await checked('Revoke synthetic Auth sessions', fixture.outsider.account.auth.signOut({ scope: 'global' }));
    await expectCommand(fixture.outsider.session.access_token, bookA, outsideBody, 401);
    assert.equal((await row(bookA, outside.plan.id)).payload.done, false);
    await setPlan(bookA, { ...outside.plan, __deleted: true, updatedAt: new Date().toISOString() });
    console.log(label + ' PASS Auth and revoked JWT');

    const lifecycle = await seedCase(bookA, 'Replay lifecycle test');
    const body = requestFor(lifecycle.plan, lifecycle.activity);
    const first = await expectCommand(token, bookA, body, 200);
    assert.equal(first.record.completionActivityId, lifecycle.activity);
    await expectCommand(token, bookB, body, 409);
    const at = offset => new Date(Date.parse(first.record.updatedAt) + offset).toISOString();
    const legacy = { ...first.record };
    delete legacy.completionRevision;
    await setPlan(bookA, { ...legacy, done: false, updatedAt: at(1000) });
    assert.equal((await row(bookA, lifecycle.plan.id)).payload.done, true);
    await setPlan(bookA, { ...first.record, label: 'Updated synthetic label', updatedAt: at(2000) });
    assert.equal((await expectCommand(token, bookA, body, 200)).record.label, 'Updated synthetic label');
    await setPlan(bookA, { ...first.record, done: false, updatedAt: at(3000) });
    await setPlan(bookA, { ...first.record, label: 'Stale tab payload', updatedAt: at(4000) });
    const reopened = await expectCommand(token, bookA, body, 200);
    assert.equal(reopened.record, null);
    assert.equal(reopened.receiptId, first.receiptId);
    await setPlan(bookA, { ...first.record, done: false, __deleted: true, updatedAt: at(5000) });
    await setPlan(bookA, { ...first.record, done: false, updatedAt: at(6000) });
    assert.equal((await row(bookA, lifecycle.plan.id)).payload.__deleted, true);
    assert.equal((await expectCommand(token, bookA, body, 200)).record, null);
    console.log(label + ' PASS lifecycle replay and stale sync');

    const capture = await seedCase(bookA, 'Capture offline staging');
    const link = await seedCase(bookA, 'Plan switch staging');
    const rollback = await seedCase(bookA, 'Flag rollback staging');
    browser = await chromium.launch(browserOptions);
    const context = await browser.newContext({ timezoneId: 'UTC', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const unexpected = new Set();
    let offline = false;
    const setOffline = async value => {
      offline = value;
      await context.setOffline(value);
    };
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (offline) return route.abort('internetdisconnected');
      if (url.origin === c.origin) {
        if (!c.bypass) return route.continue();
        // An explicit single-hop request keeps the bypass secret on this origin.
        const response = await route.fetch({
          maxRedirects: 0, timeout: 15_000, headers: appHeaders(c, route.request().headers()),
        });
        return route.fulfill({ response });
      }
      if (url.origin === c.backend) return route.continue();
      // Fonts and analytics are unnecessary. Abort unexpected service requests as well.
      if (['document', 'fetch', 'xhr'].includes(route.request().resourceType())) unexpected.add(url.origin);
      return route.abort();
    });
    await context.addInitScript(({ origin, session, workspace }) => {
      if (location.origin !== origin || sessionStorage.getItem('enexia-stage-init')) return;
      localStorage.setItem('memoire.supabase.auth', JSON.stringify(session));
      sessionStorage.setItem('memoire.active-data-workspace.v1:' + session.user.id, workspace);
      sessionStorage.setItem('enexia-stage-init', 'true');
    }, { origin: c.origin, session: fixture.owner.session, workspace: bookA.id });

    const page = await context.newPage();
    const requests = [];
    page.on('request', request => {
      if (request.url() === c.origin + routePath && request.method() === 'POST') requests.push(request.postDataJSON());
    });
    const upcoming = () => page.goto(c.origin + '/app/timeline?view=upcoming');
    const checkbox = label => page.getByRole('checkbox', { name: 'Mark "' + label + '" done', exact: true });
    const pick = async entry => {
      await checkbox(entry.plan.label).click();
      await page.getByLabel('Activity entry').selectOption(entry.activity);
    };
    const submit = () => page.getByRole('button', { name: 'Link and mark done', exact: true }).click();
    const pending = page.getByRole('status').filter({ hasText: pendingText }).first();
    const switchBook = async book => {
      await page.getByRole('combobox', { name: 'Switch workspace' }).first().selectOption(book.id);
      await page.waitForURL('**/app/today');
      await upcoming();
      await page.getByRole('combobox', { name: 'Switch workspace' }).first().waitFor();
    };
    const assertSingleReceipt = id => {
      const keys = requests.filter(request => request.planId === id).map(request => request.requestId);
      assert.ok(keys.length > 0);
      assert.equal(new Set(keys).size, 1);
    };

    await page.goto(c.origin + '/app/capture?mode=quick&account=' + encodeURIComponent(accountName));
    await page.locator('label').filter({ hasText: 'What happened?' }).locator('textarea').fill('Synthetic offline staging conversation.');
    await setOffline(true);
    await page.getByRole('button', { name: 'Save Quick Capture', exact: true }).click();
    await page.locator('li').filter({ hasText: capture.plan.label }).getByRole('button', { name: 'Mark done', exact: true }).click();
    await pending.waitFor();
    assert.equal((await row(bookA, capture.plan.id)).payload.done, false);
    await setOffline(false);
    await waitFor('Capture Activity sync and completion acknowledgment', async () => (await row(bookA, capture.plan.id))?.payload.done);
    await pending.waitFor({ state: 'hidden' });
    assertSingleReceipt(capture.plan.id);
    const linkedId = (await row(bookA, capture.plan.id)).payload.completionActivityId;
    const linked = await checked('Read the canonical Capture', bookA.scoped.from('sales_activities').select('id').eq('id', linkedId).single());
    assert.equal(linked.id, linkedId);
    console.log(label + ' PASS Capture offline, reconnect and receipt');

    let release;
    const held = new Promise(resolve => { release = resolve; });
    let committed;
    const accepted = new Promise(resolve => { committed = resolve; });
    let intercepted = false;
    const hold = async route => {
      const body = route.request().postDataJSON();
      const headers = appHeaders(c, route.request().headers());
      if (offline) return route.abort('internetdisconnected');
      if (intercepted || body.planId !== link.plan.id) return route.fallback();
      intercepted = true;
      const response = await route.fetch({ maxRedirects: 0, headers, timeout: 15_000 });
      committed({ status: response.status(), receipt: await response.json() });
      await held;
      await route.abort('connectionreset').catch(() => {});
    };
    await page.route(c.origin + routePath, hold);
    await upcoming();
    await pick(link);
    await setOffline(true);
    await submit();
    await pending.waitFor();
    assert.equal((await row(bookA, link.plan.id)).payload.done, false);
    await setOffline(false);
    const acceptedLink = await Promise.race([accepted, pause(20_000).then(() => ({ status: 0 }))]);
    assert.equal(acceptedLink.status, 200);
    assert.equal(acceptedLink.receipt.record.completionActivityId, link.activity);
    try {
      await switchBook(bookB);
      assert.equal(await row(bookB, link.plan.id), null);
      await pending.waitFor({ state: 'hidden' });
    } finally {
      release();
    }
    await page.unroute(c.origin + routePath, hold);
    await switchBook(bookA);
    await waitFor('workspace A receipt retry', async () => requests.filter(req => req.planId === link.plan.id).length >= 2);
    await pending.waitFor({ state: 'hidden' });
    assert.equal((await row(bookA, link.plan.id)).payload.completionActivityId, link.activity);
    assertSingleReceipt(link.plan.id);
    console.log(label + ' PASS Plan offline, uncertain acknowledgment, workspace switch and replay');

    if (rehearseFlag) {
      await flag(false);
      assert.equal((await row(bookA, link.plan.id)).payload.completionActivityId, link.activity);
      await upcoming();
      await pick(rollback);
      const paused = page.waitForResponse(response => response.url() === c.origin + routePath && response.status() === 503);
      await submit();
      assert.equal((await (await paused).json()).status, 'paused');
      await pending.waitFor();
      assert.equal((await row(bookA, rollback.plan.id)).payload.done, false);
      await flag(true);
      await waitFor('flag resume acknowledgment', async () => (await row(bookA, rollback.plan.id))?.payload.done);
      await pending.waitFor({ state: 'hidden' });
      assertSingleReceipt(rollback.plan.id);
      const prior = await expectCommand(token, bookA, requests.find(req => req.planId === link.plan.id), 200);
      assert.equal(prior.receiptId, acceptedLink.receipt.receiptId);
      console.log(label + ' PASS feature flag pause and resume');
    } else {
      console.log('SKIPPED hosted feature-flag rehearsal. Supply --flag-rehearsal with an authorized staging operator.');
    }
    assert.deepEqual([...unexpected], [], 'Browser attempted to reach an unapproved service origin.');
  } finally {
    try { await browser?.close(); } finally { await cleanup(c, ids, attestTarget); }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await verifyPr01(config(), {
    preflight: process.argv.includes('--preflight'), rehearseFlag: process.argv.includes('--flag-rehearsal'),
  });
}
