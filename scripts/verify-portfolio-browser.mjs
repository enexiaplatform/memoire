import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.MEMOIRE_BROWSER_BASE || 'http://127.0.0.1:5173';
const artifacts = resolve(process.env.MEMOIRE_PORTFOLIO_ARTIFACT_DIR || '.codex-portfolio-qa');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem('memoire_demo_workspace', 'interactive-demo');
    localStorage.setItem('memoire.sampleData.loaded', 'true');
    localStorage.setItem('memoire_reporting_currency', 'VND');
    const at = '2026-10-01T00:00:00.000Z';
    localStorage.setItem('memoire.accounts.v1', JSON.stringify([{ id: 'sample-account', accountName: 'Acme', source: 'demo', isSample: true, createdAt: at, updatedAt: at }]));
    localStorage.setItem('memoire.opportunities.v1', JSON.stringify([
      { id: 'sample-deal', accountId: 'sample-account', accountName: 'Acme', opportunityName: 'Portfolio test deal', source: 'demo', isSample: true,
        stage: 'Proposal', status: 'Active', estimatedValue: 100000000, currency: 'VND', expectedClosePeriod: '2026-10-15',
        brand: 'Old Brand', productOrSolution: 'Device bundle', forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor', createdAt: at, updatedAt: at },
      { id: 'sample-lead', accountName: 'Acme', opportunityName: 'Unqualified lead', source: 'demo', isSample: true,
        stage: 'Lead', status: 'Active', estimatedValue: 900000000, currency: 'VND', createdAt: at, updatedAt: at },
    ]));
  });
  const page = await context.newPage();
  const pageErrors = [], portfolioRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => { if (request.url().includes('/rest/v1/portfolio_records')) portfolioRequests.push(request.url()); });
  await page.goto(`${base}/app/products`);
  const panel = page.getByTestId('portfolio-page');
  await panel.getByRole('heading', { name: 'Products & Brands', exact: true }).waitFor();
  await panel.getByText(/Demo catalog/).waitFor();
  await panel.getByText('1 active deals · 0 missing amount/rate', { exact: true }).waitFor();
  const add = async (kind, name) => {
    await panel.getByLabel('Type', { exact: true }).selectOption(kind);
    await panel.getByLabel('Name', { exact: true }).fill(name);
    await panel.getByRole('button', { name: 'Save entry', exact: true }).click();
    await panel.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) }).waitFor();
  };
  await add('unit', 'Healthcare'); await add('brand', 'Standard Brand'); await add('group', 'Devices');
  await panel.getByLabel('Type', { exact: true }).selectOption('product');
  await panel.getByLabel('Name', { exact: true }).fill('Device A');
  await panel.getByLabel('Default brand', { exact: true }).selectOption({ label: 'Standard Brand' });
  await panel.getByLabel('Default product group', { exact: true }).selectOption({ label: 'Devices' });
  await panel.getByRole('button', { name: 'Save entry', exact: true }).click();
  await panel.getByRole('listitem').filter({ has: page.getByText('Device A', { exact: true }) }).waitFor();
  await panel.getByLabel('Deal', { exact: true }).selectOption({ label: 'Acme — Portfolio test deal' });
  await panel.getByLabel('Business unit', { exact: true }).selectOption({ label: 'Healthcare' });
  await panel.getByLabel('Product / solution', { exact: true }).selectOption({ label: 'Device A' });
  await panel.getByRole('button', { name: 'Save classification', exact: true }).click();
  await panel.getByText(/0 qualified deals have no portfolio classification/).waitFor();
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('memoire.portfolioRecords.v1')));
  const assigned = stored.find(row => row.kind === 'assignment');
  assert.equal(assigned.originalBrand, 'Old Brand'); assert.ok(assigned.brandId); assert.ok(assigned.businessUnitId);
  const brandRow = panel.getByRole('listitem').filter({ has: page.getByText('Standard Brand', { exact: true }) });
  await brandRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await panel.getByLabel('Name', { exact: true }).fill('Renamed Brand');
  await panel.getByRole('button', { name: 'Save entry', exact: true }).click();
  await panel.getByRole('listitem').filter({ has: page.getByText('Renamed Brand', { exact: true }) }).waitFor();
  await page.reload(); await panel.getByText(/Demo catalog/).waitFor();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('memoire.portfolioRecords.v1')));
  const renamed = stored.find(row => row.id === assigned.brandId);
  assert.equal(renamed.name, 'Renamed Brand'); assert.equal(renamed.history[0].state.name, 'Standard Brand');
  const reloadedBrand = panel.getByRole('listitem').filter({ has: page.getByText('Renamed Brand', { exact: true }) });
  await reloadedBrand.getByRole('button', { name: 'Retire', exact: true }).click();
  await reloadedBrand.getByText(/retired/).waitFor();
  await panel.getByRole('heading', { name: 'Products & Brands', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(artifacts, 'portfolio-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload(); await panel.getByText(/Demo catalog/).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'portfolio overflows the mobile screen');
  await page.screenshot({ path: resolve(artifacts, 'portfolio-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'memoire.portfolioRecords.v1') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await panel.getByLabel('Name', { exact: true }).fill('Rejected new entry');
  await panel.getByRole('button', { name: 'Save entry', exact: true }).click();
  await panel.getByRole('alert').filter({ hasText: /not saved/ }).waitFor();
  assert.ok(!(await page.evaluate(() => JSON.parse(localStorage.getItem('memoire.portfolioRecords.v1')))).some(row => row.name === 'Rejected new entry'));
  // A new page restores Storage.prototype; resetting demo must sweep only tagged rows.
  await page.reload(); await panel.getByText(/Demo catalog/).waitFor();
  await page.evaluate(() => {
    const key = 'memoire.portfolioRecords.v1', records = JSON.parse(localStorage.getItem(key));
    const node = records.find(row => row.kind === 'unit');
    localStorage.setItem(key, JSON.stringify([...records, { ...node, id: 'real-catalog', name: 'Real unit', source: 'user', isSample: false }]));
  });
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.waitForFunction(() => {
    const rows = JSON.parse(localStorage.getItem('memoire.portfolioRecords.v1') || '[]');
    return rows.length === 1 && rows[0].id === 'real-catalog';
  });
  assert.deepEqual(portfolioRequests, [], 'demo catalog must never reach a live cloud');
  assert.deepEqual(pageErrors, [], 'portfolio raised a browser error');
  console.log('Portfolio browser verified: catalog CRUD, primary links, original text, rename history, reload, retirement, failed writes, demo isolation/reset and mobile layout.');
  console.log(`Screenshots: ${artifacts}`);
} finally { await browser.close(); }
