// Read-only acceptance against the retained fictional QC owner. No customer data is changed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { createClient } from '@supabase/supabase-js';
import { buildRestorePlan } from '../src/utils/workspaceBackup.ts';
const base = process.env.MEMOIRE_BROWSER_BASE;
assert.ok(base, 'Set MEMOIRE_BROWSER_BASE to the deployment being verified.');
assert.ok(process.argv.includes('--production-qc'), 'Explicit --production-qc is required for the retained QC owner.');
const source = '.audit/global-b2b-year-2026-10-03';
const root = process.env.MEMOIRE_REMEDIATION_ARTIFACT_DIR || '.audit/global-b2b-remediation-2026-10-03/browser';
fs.mkdirSync(root, { recursive: true });
const credentials = JSON.parse(fs.readFileSync(`${source}/credentials.private.json`));
const fixture = JSON.parse(fs.readFileSync(`${source}/fixture.json`));
assert.match(credentials.email, /^northstar-qc-\d+@example\.invalid$/);
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
}));
assert.equal(env.VITE_SUPABASE_URL, 'https://mlmpcpkucurylkrobain.supabase.co');
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error } = await db.auth.signInWithPassword({ email: credentials.email, password: credentials.password });
assert.ifError(error); assert.equal(auth.user.id, credentials.userId);
const browser = await chromium.launch({ headless: true });
const evidence = { at: new Date().toISOString(), base, checks: [], errors: [], failedRequests: [] };
const save = () => fs.writeFileSync(`${root}/acceptance.json`, JSON.stringify(evidence, null, 2));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .01, `${actual} != ${expected}`);
const ref = r => fixture.quotes.find(q => q.status === 'Accepted' && q.opportunityId === r.opportunityId).quoteId;
async function open(route, mobile = false) {
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 }, timezoneId: 'Asia/Ho_Chi_Minh' });
  await context.addInitScript(session => {
    localStorage.setItem('memoire.supabase.auth', JSON.stringify(session));
    localStorage.setItem('memoire_reporting_currency', 'USD');
  }, auth.session);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => evidence.errors.push(e.message));
  page.on('response', r => { if (/\/rest\/v1\//.test(r.url()) && r.status() >= 400) evidence.failedRequests.push({ path: new URL(r.url()).pathname, status: r.status() }); });
  await page.goto(base + route); return { page, context };
}
async function cloudReceipts(r) {
  const result = await db.from('order_receivables').select('payload').eq('user_id', credentials.userId).eq('id', r.id).single();
  assert.ifError(result.error); return result.data.payload.receipts;
}
try {
  for (const mobile of [false, true]) {
    const paid = fixture.receivables[0], { page, context } = await open(`/app/revenue?view=collections&orderId=${paid.opportunityId}&qcMarker=keep`, mobile);
    await page.getByLabel('Amount (USD)', { exact: true }).waitFor();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('orderId'));
    await page.waitForTimeout(500); // Wait beyond the effect that previously removed the selected view.
    assert.equal(new URL(page.url()).searchParams.get('view'), 'collections');
    assert.equal(new URL(page.url()).searchParams.get('qcMarker'), 'keep');
    assert.equal(await page.getByRole('heading', { name: 'Collections', exact: true }).count(), 1);
    assert.ok(await page.getByRole('button', { name: new RegExp(ref(paid)) }).innerText().then(t => t.includes('Collected')));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${root}/deep-link-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
    evidence.checks.push({ name: 'Paid collection deep link preserves view and other parameters', mobile, passed: true });
    await context.close();
  }
  const unpaid = fixture.receivables[3], before = await cloudReceipts(unpaid);
  const future = await open(`/app/revenue?view=collections&orderId=${unpaid.opportunityId}`);
  await future.page.getByLabel('Amount (USD)', { exact: true }).fill('500');
  await future.page.getByLabel('Received on', { exact: true }).fill('2099-01-01');
  await future.page.getByRole('button', { name: 'Record', exact: true }).click();
  await future.page.getByRole('alert').filter({ hasText: /cannot be received in the future/ }).waitFor();
  assert.deepEqual(await cloudReceipts(unpaid), before);
  await future.page.screenshot({ path: `${root}/future-payment-refused.png`, fullPage: true });
  evidence.checks.push({ name: 'Future payment form refused with explanation and no account write', passed: true });
  await future.context.close();

  const euro = fixture.receivables[1], eur = await open(`/app/revenue?view=collections&orderId=${euro.opportunityId}`);
  await eur.page.getByLabel('Amount (EUR)', { exact: true }).waitFor();
  const amount = euro.receipts[0].amount.toLocaleString('en', { maximumFractionDigits: 2 });
  await eur.page.getByText(`${amount} EUR`, { exact: true }).waitFor();
  assert.equal(await eur.page.getByText(`${amount} USD`, { exact: true }).count(), 0);
  await eur.page.screenshot({ path: `${root}/original-receipt-currency.png`, fullPage: true });
  evidence.checks.push({ name: 'EUR receipt history preserves original currency in a USD reporting workspace', passed: true });
  await eur.context.close();

  const orders = await open('/app/revenue'), paidRef = ref(fixture.receivables[0]);
  const paidRow = orders.page.getByRole('row').filter({ has: orders.page.getByText(paidRef, { exact: true }) });
  await paidRow.getByText('Collected', { exact: true }).waitFor();
  assert.match(await paidRow.innerText(), /5\s*\/\s*5/);
  assert.doesNotMatch(await paidRow.innerText(), /Deposit due|Stalled|Late/);
  await paidRow.click();
  await orders.page.getByRole('button', { name: 'Collected', exact: true, disabled: true }).waitFor();
  const partialRow = orders.page.getByRole('row').filter({ has: orders.page.getByText(ref(euro), { exact: true }) });
  assert.match(await partialRow.innerText(), /Deposit due/);
  await orders.page.screenshot({ path: `${root}/orders-payment-evidence.png`, fullPage: true });
  evidence.checks.push({ name: 'Orders full settlement is proven and partial payment remains open', passed: true });
  await orders.context.close();

  const reports = await open('/app/reports?report=northstar-collections');
  const panel = reports.page.getByTestId('reports-page');
  await panel.getByRole('button', { name: 'Run report', exact: true }).click();
  const result = panel.getByTestId('report-result'); await result.waitFor();
  const downloaded = reports.page.waitForEvent('download');
  await result.getByRole('button', { name: 'Export CSV pack', exact: true }).click();
  await (await downloaded).saveAs(`${root}/collections.zip`);
  const zip = await JSZip.loadAsync(fs.readFileSync(`${root}/collections.zip`));
  const metadata = JSON.parse(await zip.file('report-metadata.json').async('string'));
  for (const key of ['orderValue', 'received', 'outstanding']) near(metadata.totals[key].value, fixture.oracle[key]);
  evidence.checks.push({ name: 'Year-end collections exported by the real account match the independent oracle', totals: metadata.totals, passed: true });
  await reports.context.close();

  const backup = await open('/app/settings?tab=export');
  await backup.page.getByRole('button', { name: 'Download ZIP', exact: true }).waitFor();
  const downloadedBackup = backup.page.waitForEvent('download');
  await backup.page.getByRole('button', { name: 'Download ZIP', exact: true }).click();
  await (await downloadedBackup).saveAs(`${root}/workspace-backup.zip`);
  const backupZip = await JSZip.loadAsync(fs.readFileSync(`${root}/workspace-backup.zip`));
  const envelope = JSON.parse(await backupZip.file('memoire-workspace-export.json').async('string'));
  assert.equal(envelope.cloudData.manifest.complete, true); assert.deepEqual(envelope.cloudData.warnings, []);
  assert.equal(envelope.cloudData.data.commercial_history_coverage.length, 1);
  assert.ok(envelope.cloudData.data.commercial_state_revisions.length > 0);
  const plan = buildRestorePlan(envelope); assert.ok(plan.restoredRecords > 0);
  fs.writeFileSync(`${root}/workspace-backup.json`, JSON.stringify(envelope));
  await backup.page.screenshot({ path: `${root}/complete-workspace-backup.png`, fullPage: true });
  evidence.checks.push({ name: 'Full authenticated UI backup is complete and passes restore validation', manifest: envelope.cloudData.manifest,
    revisions: envelope.cloudData.data.commercial_state_revisions.length, restoredRecords: plan.restoredRecords, passed: true });
  await backup.context.close();
  assert.deepEqual(evidence.errors, []); assert.deepEqual(evidence.failedRequests, []);
  evidence.passed = true; save(); console.log(JSON.stringify(evidence));
} catch (e) { evidence.errors.push(e.message); save(); throw e; }
finally { await browser.close(); db.auth.stopAutoRefresh(); }
