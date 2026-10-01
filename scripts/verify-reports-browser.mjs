import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';
const base = process.env.MEMOIRE_BROWSER_BASE || 'http://127.0.0.1:5173';
const artifacts = resolve(process.env.MEMOIRE_REPORTS_ARTIFACT_DIR || '.codex-reports-qa');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    if (localStorage.getItem('reports-fixture')) return;
    localStorage.setItem('reports-fixture', 'true'); localStorage.setItem('memoire_demo_workspace', 'interactive-demo');
    localStorage.setItem('memoire.sampleData.loaded', 'true'); localStorage.setItem('memoire_reporting_currency', 'VND');
    const at = '2026-09-01T00:00:00.000Z';
    const opportunity = (id, extra = {}) => ({ id, accountName: 'Acme', opportunityName: `Report deal ${id}`, source: 'demo', isSample: true,
      stage: 'Proposal', status: 'Active', estimatedValue: 100, currency: 'VND', brand: 'Original brand', productOrSolution: 'Bundle',
      nextAction: 'Call buyer', nextActionDate: '2026-10-02', missingContext: 'Invoice evidence', forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor', createdAt: at, updatedAt: at, ...extra });
    localStorage.setItem('memoire.opportunities.v1', JSON.stringify([
      ...Array.from({ length: 130 }, (_, i) => opportunity(`active-${i}`, { accountName: i === 0 ? '=HYPERLINK("bad")' : 'Acme' })),
      opportunity('lead', { stage: 'Lead', estimatedValue: 900 }), opportunity('won', { stage: 'Won', status: 'Won', estimatedValue: 50 }),
    ]));
    localStorage.setItem('memoire.accounts.v1', JSON.stringify([{ id: 'account', accountName: 'Acme', source: 'demo', isSample: true, createdAt: at, updatedAt: at }]));
    const quote = (id, amount, at) => ({ id, quoteId: id, opportunityId: 'won', accountName: 'Acme', opportunityName: 'Report deal won', title: 'Order',
      amount, currency: 'VND', quoteDate: '2026-09-01', validUntil: '2026-12-31', paymentTerm: '100% on order', status: 'Accepted', poStatus: 'Received',
      deliveryStatus: 'Delivered', paymentStatus: 'Due', paymentDueDate: '2026-09-01', expectedDeliveryDate: '2026-09-01', nextAction: '', notes: '',
      source: 'demo', isSample: true, createdAt: at, updatedAt: at });
    localStorage.setItem('memoire.quotes.v1', JSON.stringify([quote('q1', 55, at), quote('q2', 60, '2026-09-02T00:00:00.000Z')]));
    localStorage.setItem('memoire.orderReceivables.v1', JSON.stringify([{ id: 'receivable', opportunityId: 'won', installments: [],
      receipts: [{ id: 'payment', amount: 20, currency: 'VND', receivedOn: '2026-09-03', method: 'Transfer', note: '' }],
      deliveredOn: '', invoicedOn: '', note: '', source: 'demo', isSample: true, createdAt: at, updatedAt: at }]));
  });
  const page = await context.newPage(), errors = [], cloudRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/rest\/v1\/(report_definitions|portfolio_records)/.test(request.url())) cloudRequests.push(request.url()); });
  await page.goto(`${base}/app/reviews?view=reports`);
  const panel = page.getByTestId('reports-page'), result = panel.getByTestId('report-result');
  await panel.getByText(/Demo report library/).waitFor();
  await panel.getByRole('button', { name: 'Run report', exact: true }).click();
  await result.getByText(/131 matching records from 132 loaded/).waitFor();
  await result.getByText('13,000', { exact: true }).first().waitFor();
  await result.getByRole('button', { name: 'View 131 records' }).click();
  await result.getByText(/Preview 1–100 of 131 records/).waitFor();
  await result.getByRole('button', { name: 'Next page', exact: true }).click();
  await result.getByText(/Preview 101–131 of 131 records/).waitFor();
  await result.getByRole('button', { name: 'Back to summary', exact: true }).click();
  await panel.getByLabel('Report name', { exact: true }).fill('My Pipeline');
  assert.equal(await result.count(), 0, 'configuration edits must hide the old run/export');
  await panel.getByRole('button', { name: 'Save report', exact: true }).click();
  await panel.getByRole('button', { name: 'My Pipeline', exact: true }).waitFor();
  await page.reload(); await panel.getByText(/Demo report library/).waitFor();
  await panel.getByRole('button', { name: 'My Pipeline', exact: true }).click();
  await panel.getByLabel('Result view', { exact: true }).selectOption('details');
  await panel.locator('summary').filter({ hasText: 'Columns (' }).click();
  await panel.getByLabel('Next action date', { exact: true }).check();
  await panel.getByLabel('Label for Account', { exact: true }).fill('Customer');
  await panel.getByRole('button', { name: 'Move Account down', exact: true }).click();
  await panel.getByRole('button', { name: 'Save changes', exact: true }).click();
  await panel.getByRole('button', { name: 'Run report', exact: true }).click();
  await result.getByText(/131 matching records/).waitFor();
  await result.getByRole('columnheader', { name: 'Customer', exact: true }).waitFor();
  const downloaded = page.waitForEvent('download');
  await result.getByRole('button', { name: 'Export CSV pack', exact: true }).click();
  const download = await downloaded; const path = resolve(artifacts, 'report-pack.zip'); await download.saveAs(path);
  const zip = await JSZip.loadAsync(await readFile(path));
  const csv = await zip.file('details.csv').async('string'), metadata = JSON.parse(await zip.file('report-metadata.json').async('string'));
  assert.equal(csv.split('\r\n').length, 132); assert.match(csv, /'=HYPERLINK/); assert.equal(metadata.rows, 131); assert.equal(metadata.totals.pipeline.value, 13000);
  assert.equal(csv.replace(/^\uFEFF/, '').split('\r\n')[0].startsWith('"Deal / order","Customer"'), true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(artifacts, 'reports-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.report-screen').isVisible(), false);
  assert.equal(await page.locator('.report-print').isVisible(), true);
  assert.equal(await page.locator('.report-print tbody tr').count(), 131);
  await page.pdf({ path: resolve(artifacts, 'report-print.pdf'), preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await panel.getByRole('button', { name: 'Duplicate as new report', exact: true }).click();
  await panel.getByRole('button', { name: 'Save report', exact: true }).click();
  await panel.getByRole('button', { name: 'My Pipeline (copy)', exact: true }).waitFor();
  const copy = panel.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'My Pipeline (copy)', exact: true }) });
  await copy.getByRole('button', { name: 'Archive report' }).click();
  await panel.getByLabel('Show archived reports', { exact: true }).check();
  await panel.getByRole('button', { name: 'Restore report', exact: true }).click();
  await panel.getByLabel('Show archived reports', { exact: true }).uncheck();
  await panel.getByRole('button', { name: 'My Pipeline (copy)', exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Collections & Blockers', exact: true }).click();
  await panel.getByRole('button', { name: 'Run report', exact: true }).click();
  await result.getByText(/1 matching records from 1 loaded/).waitFor();
  await result.getByRole('cell', { name: '40', exact: true }).first().waitFor();
  await result.getByRole('cell', { name: '20', exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Add filter', exact: true }).click();
  await panel.getByLabel('Filter 1 field', { exact: true }).selectOption('outstanding');
  await panel.getByLabel('Filter 1 operator', { exact: true }).selectOption('gte');
  await panel.getByLabel('Filter 1 value', { exact: true }).fill('41');
  await panel.getByRole('button', { name: 'Run report', exact: true }).click();
  await result.getByText(/0 matching records/).waitFor();
  await panel.getByLabel('Filter 1 value', { exact: true }).fill('0');
  await panel.getByRole('button', { name: 'Run report', exact: true }).click(); await result.getByText(/1 matching records/).waitFor();
  await panel.locator('summary').filter({ hasText: 'Columns (' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(artifacts, 'reports-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'report controls overflow mobile');
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === 'memoire.reportDefinitions.v1') throw new DOMException('Full', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await panel.getByLabel('Report name', { exact: true }).fill('Unsaved report');
  await panel.getByRole('button', { name: 'Save report', exact: true }).click();
  await panel.getByRole('alert').filter({ hasText: /not saved/ }).waitFor();
  assert.ok(!(await page.evaluate(() => JSON.parse(localStorage.getItem('memoire.reportDefinitions.v1')))).some(row => row.definition.name === 'Unsaved report'));
  // Reset must remove only tagged sample definitions, preserving real owner records.
  await page.reload(); await panel.getByText(/Demo report library/).waitFor();
  await page.evaluate(() => {
    const key = 'memoire.reportDefinitions.v1', records = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify([...records, { ...records[0], id: 'real-report', source: 'user', isSample: false }]));
  });
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.waitForFunction(() => {
    const rows = JSON.parse(localStorage.getItem('memoire.reportDefinitions.v1') || '[]');
    return rows.length === 1 && rows[0].id === 'real-report';
  });
  assert.deepEqual(cloudRequests, [], 'demo reports must not contact live tables'); assert.deepEqual(errors, []);
  console.log('Reports browser verified: typed builder, templates, frozen results, drill-through, pagination, complete CSV pack, saved edits, duplicate/archive/restore, linked cash figures, print and mobile, quota refusal, demo isolation/reset.');
  console.log(`Artifacts: ${artifacts}`);
} finally { await browser.close(); }
