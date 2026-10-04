// Real isolated QC owner only. Every mutation is restored, including failures.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
const base = process.env.MEMOIRE_BROWSER_BASE;
assert.ok(base, 'Set the deployment URL.');
assert.ok(process.argv.includes('--production-qc'), 'The retained fictional owner requires --production-qc.');
const root = process.env.MEMOIRE_CONCURRENCY_ARTIFACT_DIR || '.audit/global-b2b-round3-2026-10-04/concurrency-browser';
fs.mkdirSync(root, { recursive: true });
const source = '.audit/global-b2b-year-2026-10-03';
const credentials = JSON.parse(fs.readFileSync(`${source}/credentials.private.json`));
assert.equal(credentials.userId, 'd5394eb0-cd88-48ae-936b-be50e19e890a');
assert.match(credentials.email, /^northstar-qc-\d+@example\.invalid$/);
const fixture = JSON.parse(fs.readFileSync(`${source}/fixture.json`));
const target = fixture.receivables[3];
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
}));
assert.equal(env.VITE_SUPABASE_URL, 'https://mlmpcpkucurylkrobain.supabase.co');
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error } = await db.auth.signInWithPassword(credentials);
assert.ifError(error); assert.equal(auth.user.id, credentials.userId);
async function rows() {
  const result = await db.from('order_receivables').select('*').eq('user_id', credentials.userId).order('id');
  assert.ifError(result.error); return result.data;
}
const original = await rows(); assert.equal(original.length, 48);
fs.writeFileSync(`${root}/receivables-before.private.json`, JSON.stringify(original));
async function restore() {
  const result = await db.from('order_receivables').upsert(original, { onConflict: 'user_id,id' });
  assert.ifError(result.error);
  assert.deepEqual((await rows()).map(r => ({ id: r.id, payload: r.payload })), original.map(r => ({ id: r.id, payload: r.payload })));
}
const browser = await chromium.launch({ headless: true });
const evidence = { at: new Date().toISOString(), base, checks: [], errors: [], writes: [], restored: false, passed: false };
const ref = order => fixture.quotes.find(q => q.status === 'Accepted' && q.opportunityId === order.opportunityId).quoteId;
async function open(order = target) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Ho_Chi_Minh' });
  await context.addInitScript(session => {
    localStorage.setItem('memoire.supabase.auth', JSON.stringify(session));
    localStorage.setItem('memoire_reporting_currency', 'USD');
  }, auth.session);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/rest/v1/order_receivables') && ['POST', 'PATCH'].includes(request.method())) {
      const payload = request.postDataJSON();
      evidence.writes.push({ method: request.method(), ids: (Array.isArray(payload) ? payload : [payload]).map(row => row.id) });
    }
  });
  await page.goto(`${base}/app/revenue?view=collections&orderId=${order.opportunityId}`);
  try { await page.getByLabel('Amount (USD)', { exact: true }).waitFor(); }
  catch (error) {
    await page.screenshot({ path: `${root}/failed-open.png`, fullPage: true });
    fs.writeFileSync(`${root}/failed-open.txt`, `URL: ${page.url()}\n${await page.locator('body').innerText()}`);
    throw error;
  }
  return { page, context, order };
}
async function waitFor(check, description) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out: ${description}`);
}
const cloud = async (order = target) => (await rows()).find(r => r.id === order.id).payload;
const marker = label => `[SIMULATED ROUND3] ${label}`;
async function bank(instance, amount, label, online = true) {
  const page = instance.page;
  await page.getByLabel('Amount (USD)', { exact: true }).fill(String(amount));
  await page.getByLabel('Received on', { exact: true }).fill('2026-09-28');
  await page.getByLabel('How', { exact: true }).fill(marker(label));
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await page.getByText(marker(label), { exact: false }).waitFor();
  if (online) await waitFor(async () => (await cloud(instance.order)).receipts.some(r => r.method === marker(label)), `cloud payment ${label}`);
}
async function refreshed(instance, expectedMarkers) {
  await instance.page.reload();
  await instance.page.getByRole('button', { name: new RegExp(ref(instance.order)) }).waitFor();
  await waitFor(async () => instance.page.evaluate(({ id, markers }) => {
    const record = JSON.parse(localStorage.getItem('memoire.orderReceivables.v1') || '[]').find(r => r.opportunityId === id);
    return record && !(record.pendingChanges?.length) && markers.every(method => record.receipts.some(r => r.method === method));
  }, { id: instance.order.opportunityId, markers: expectedMarkers.map(marker) }), 'acknowledged receipts after reload');
}
async function closeAndReset(...instances) { for (const instance of instances) await instance.context.close(); await restore(); }
try {
  const a = await open(), b = await open();
  await bank(a, 111, 'A'); await bank(b, 222, 'B');
  assert.equal((await cloud()).receipts.reduce((sum, r) => sum + r.amount, 0), 333);
  await refreshed(a, ['A', 'B']); await refreshed(b, ['A', 'B']);
  await b.page.screenshot({ path: `${root}/same-order-reloaded.png`, fullPage: true });
  evidence.checks.push({ name: 'Two already-open devices preserve both payments before and after reload', total: 333, passed: true });
  await closeAndReset(a, b);

  const e = await open(), f = await open(fixture.receivables[7]);
  await bank(e, 555, 'E'); await bank(f, 666, 'F');
  assert.ok((await cloud()).receipts.some(r => r.method === marker('E')));
  await refreshed(e, ['E']); await refreshed(f, ['F']);
  evidence.checks.push({ name: 'Changing another order cannot overwrite the first order', passed: true });
  await closeAndReset(e, f);

  const c = await open(), d = await open(); let blocked = 0;
  await c.context.route('**/rest/v1/order_receivables**', async route => {
    if (['POST', 'PATCH'].includes(route.request().method())) { blocked++; await route.abort('failed'); }
    else await route.continue();
  });
  await bank(c, 333, 'Offline C', false);
  await waitFor(() => blocked > 0, 'failed cloud write');
  await c.page.getByRole('status').filter({ hasText: 'Saved on this device' }).waitFor();
  await bank(d, 444, 'Online D');
  await c.page.screenshot({ path: `${root}/offline-payment-retained.png`, fullPage: true });
  await c.context.unroute('**/rest/v1/order_receivables**');
  await refreshed(c, ['Offline C', 'Online D']); await refreshed(d, ['Offline C', 'Online D']);
  assert.equal((await cloud()).receipts.reduce((sum, r) => sum + r.amount, 0), 777);
  evidence.checks.push({ name: 'Failed-sync receipt survives a newer remote write and syncs once after refresh', total: 777, blockedWrites: blocked, passed: true });
  await closeAndReset(c, d);

  const paid = fixture.receivables[0], removing = await open(paid), adding = await open(paid);
  const removedId = paid.receipts[0].id;
  await removing.page.getByRole('button', { name: 'Remove this payment', exact: true }).first().click();
  await waitFor(async () => !(await cloud(paid)).receipts.some(r => r.id === removedId), 'payment removal');
  await bank(adding, 111, 'Added after removal');
  assert.equal((await cloud(paid)).receipts.some(r => r.id === removedId), false);
  assert.equal((await cloud(paid)).receipts.reduce((sum, r) => sum + r.amount, 0), 6111);
  await refreshed(removing, ['Added after removal']); await refreshed(adding, ['Added after removal']);
  evidence.checks.push({ name: 'A stale device add never revives the remotely deleted receipt', total: 6111, passed: true });
  await closeAndReset(removing, adding);

  const delivery = await open(), payer = await open();
  await delivery.page.getByLabel('Delivered on', { exact: true }).fill('2026-09-29');
  await delivery.page.getByRole('button', { name: 'Save delivery date', exact: true }).click();
  await waitFor(async () => (await cloud()).deliveredOn === '2026-09-29', 'delivery date');
  await bank(payer, 222, 'Payment during delivery edit');
  assert.equal((await cloud()).deliveredOn, '2026-09-29');
  evidence.checks.push({ name: 'Concurrent delivery and payment changes preserve both facts', passed: true });
  await closeAndReset(delivery, payer);

  const first = await open(), second = await open();
  await first.page.getByLabel('Delivered on', { exact: true }).fill('2026-09-29');
  await first.page.getByRole('button', { name: 'Save delivery date', exact: true }).click();
  await waitFor(async () => (await cloud()).deliveredOn === '2026-09-29', 'first delivery edit');
  await second.page.getByLabel('Delivered on', { exact: true }).fill('2026-09-30');
  await second.page.getByRole('button', { name: 'Save delivery date', exact: true }).click();
  await second.page.getByRole('button', { name: 'Keep my changes', exact: true }).waitFor();
  assert.equal((await cloud()).deliveredOn, '2026-09-29');
  await second.page.screenshot({ path: `${root}/delivery-conflict-retained.png`, fullPage: true });
  await second.page.getByRole('button', { name: 'Keep my changes', exact: true }).click();
  await waitFor(async () => (await cloud()).deliveredOn === '2026-09-30', 'explicit conflict choice');
  await refreshed(second, []);
  evidence.checks.push({ name: 'Conflicting delivery edit remains local until the user explicitly chooses a version', passed: true });
  await closeAndReset(first, second);

  assert.ok(evidence.writes.length > 0);
  assert.ok(evidence.writes.every(write => write.ids.length === 1), 'Every write must address only the changed order.');
  assert.deepEqual(evidence.errors, []); evidence.passed = true;
} finally {
  await browser.close(); await restore(); evidence.restored = true;
  db.auth.stopAutoRefresh(); fs.writeFileSync(`${root}/acceptance.json`, JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify({ base, passed: evidence.passed, checks: evidence.checks, writes: evidence.writes.length, restored: evidence.restored, errors: evidence.errors }));
