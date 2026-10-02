import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.MEMOIRE_BROWSER_BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Ho_Chi_Minh' });
  await context.addInitScript(() => {
    if (localStorage.getItem('linkage-fixture')) return;
    localStorage.setItem('linkage-fixture', 'true'); localStorage.setItem('memoire_demo_workspace', 'interactive-demo');
    localStorage.setItem('memoire.sampleData.loaded', 'true'); localStorage.setItem('memoire_reporting_currency', 'VND');
    const at = '2026-10-01T00:00:00.000Z', envelope = { schemaVersion: 1, version: 1, source: 'demo', isSample: true, createdAt: at, updatedAt: at, history: [] };
    const opp = (id, amount, patch = {}) => ({ id, accountName: 'Acme', opportunityName: `Deal ${id}`, stage: 'Proposal', status: 'Active', estimatedValue: amount, currency: 'VND',
      source: 'demo', isSample: true, createdAt: at, updatedAt: at, nextAction: 'Call buyer', nextActionDate: '2026-10-02', brand: 'Original brand', productOrSolution: 'Original bundle', ...patch });
    localStorage.setItem('memoire.opportunities.v1', JSON.stringify([opp('alpha', 100), opp('beta', 200), opp('won', 50, { stage: 'Won', status: 'Won' }), opp('lead', 900, { stage: 'Lead' })]));
    localStorage.setItem('memoire.accounts.v1', JSON.stringify([{ id: 'account', accountName: 'Acme', source: 'demo', isSample: true, createdAt: at, updatedAt: at }]));
    const nodes = ['a', 'b'].map(id => ({ ...envelope, id, kind: 'brand', name: `Brand ${id.toUpperCase()}`, code: '', description: '', status: 'active', parentId: null, brandId: null, groupId: null, aliases: [] }));
    localStorage.setItem('memoire.portfolioRecords.v1', JSON.stringify([...nodes, ...['alpha', 'beta', 'won', 'lead'].map(id => ({ ...envelope, id: `assignment-${id}`, kind: 'assignment', opportunityId: id,
      businessUnitId: null, brandId: id === 'won' || id === 'lead' ? 'a' : 'b', groupId: null, productId: null, originalBrand: 'Original brand', originalProduct: 'Original bundle' }))]));
    localStorage.setItem('memoire.quotes.v1', JSON.stringify([{ id: 'q', quoteId: 'q', opportunityId: 'won', accountName: 'Acme', opportunityName: 'Deal won', title: 'Order', amount: 60, currency: 'VND',
      quoteDate: '2026-10-01', validUntil: '2026-12-31', paymentTerm: '100% on order', status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Due', paymentDueDate: '2026-10-01',
      source: 'demo', isSample: true, createdAt: at, updatedAt: at }]));
    localStorage.setItem('memoire.orderReceivables.v1', JSON.stringify([{ id: 'receivable', opportunityId: 'won', installments: [], receipts: [{ id: 'payment', amount: 20, currency: 'VND', receivedOn: '2026-10-01', method: 'Transfer', note: '' }],
      deliveredOn: '', invoicedOn: '', note: '', source: 'demo', isSample: true, createdAt: at, updatedAt: at }]));
  });
  const page = await context.newPage(), errors = [], cloud = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/rest\/v1\/(portfolio_records|report_definitions|dashboard_definitions)/.test(request.url())) cloud.push(request.url()); });
  await page.goto(`${base}/app/opportunities?opportunityId=alpha`);
  await page.getByRole('link', { name: 'Classify this deal', exact: true }).click();
  const products = page.getByTestId('portfolio-page'); await products.getByText(/Demo catalog/).waitFor();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Deal"]')?.value === 'alpha');
  await products.getByLabel('Brand', { exact: true }).selectOption('a'); await products.getByRole('button', { name: 'Save classification', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('memoire.portfolioRecords.v1')).find(row => row.opportunityId === 'alpha')?.brandId === 'a');
  await products.getByRole('listitem').filter({ has: page.getByText('Brand A', { exact: true }) }).getByRole('link', { name: 'View performance report' }).click();
  const reports = page.getByTestId('reports-page'), result = reports.getByTestId('report-result');
  await reports.getByText(/Demo report library/).waitFor();
  assert.equal(await reports.getByLabel('Filter 1 value', { exact: true }).inputValue(), 'a');
  await reports.getByRole('button', { name: 'Run report', exact: true }).click();
  await result.getByText(/2 matching records from 4 loaded/).waitFor(); await result.getByRole('cell', { name: '100', exact: true }).waitFor();
  await reports.getByRole('button', { name: 'Save report', exact: true }).click();
  await reports.getByRole('link', { name: 'Create dashboard from this report' }).waitFor();
  const reportId = new URL(page.url()).searchParams.get('report'); assert.ok(reportId);
  await page.reload(); await reports.getByRole('button', { name: 'Save changes', exact: true }).waitFor();
  assert.equal(await reports.getByLabel('Report name', { exact: true }).inputValue(), 'Brand A — Performance');
  await reports.getByLabel(/^Purpose/).fill('Unsaved revised purpose');
  assert.equal(await reports.getByRole('link', { name: 'Create dashboard from this report' }).count(), 0, 'unsaved report must not hand off an old question');
  await reports.getByRole('button', { name: 'Save changes', exact: true }).click();
  await reports.getByRole('link', { name: 'Create dashboard from this report' }).click();
  const boards = page.getByTestId('dashboards-page'), results = boards.getByTestId('dashboard-results');
  await boards.getByLabel('Widget 1 report', { exact: true }).waitFor();
  assert.equal(await boards.getByLabel('Widget 1 report', { exact: true }).inputValue(), reportId);
  assert.equal(await boards.getByLabel('Widget 1 measure', { exact: true }).inputValue(), 'pipeline');
  assert.equal(await boards.getByLabel('Widget 1 view', { exact: true }).inputValue(), 'metric');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('memoire.dashboardDefinitions.v1') || '[]').length), 0, 'handoff is a reviewed draft, not an automatic save');
  await boards.getByRole('button', { name: 'Refresh dashboard', exact: true }).click(); await results.getByRole('button', { name: /100.*Inspect 2 source records/ }).waitFor();
  await boards.locator('summary').filter({ hasText: 'Customize dashboard' }).click();
  await boards.getByRole('button', { name: 'Save dashboard', exact: true }).click(); await boards.getByRole('button', { name: 'Save dashboard changes', exact: true }).waitFor();
  assert.equal(await results.count(), 1, 'saving the first dashboard must preserve its already computed result');
  await page.reload(); await boards.getByRole('button', { name: 'Refresh dashboard', exact: true }).click(); await results.getByRole('button', { name: /100.*Inspect 2 source records/ }).click();
  await boards.getByTestId('dashboard-detail').getByText('2 source records · same captured run', { exact: true }).waitFor();
  await results.getByRole('link', { name: 'Open saved report', exact: true }).click();
  await reports.getByRole('button', { name: 'Save changes', exact: true }).waitFor(); assert.equal(new URL(page.url()).searchParams.get('report'), reportId);
  await reports.getByRole('button', { name: 'Collections & Blockers', exact: true }).click(); await reports.getByRole('button', { name: 'Run report', exact: true }).click();
  await reports.getByLabel('Report name', { exact: true }).fill('Cash follow-up');
  await reports.getByRole('button', { name: 'Save report', exact: true }).click(); await reports.getByRole('button', { name: 'Save changes', exact: true }).waitFor();
  const cashId = new URL(page.url()).searchParams.get('report'); assert.notEqual(cashId, reportId);
  await reports.getByRole('button', { name: 'Brand A — Performance', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('report'), reportId);
  await page.reload(); await reports.getByRole('button', { name: 'Save changes', exact: true }).waitFor();
  assert.equal(await reports.getByLabel('Report name', { exact: true }).inputValue(), 'Brand A — Performance');
  await page.goBack(); await reports.getByRole('button', { name: 'Save changes', exact: true }).waitFor();
  assert.equal(await reports.getByLabel('Report name', { exact: true }).inputValue(), 'Cash follow-up'); assert.equal(new URL(page.url()).searchParams.get('report'), cashId);
  await reports.getByRole('button', { name: 'Run report', exact: true }).click();
  await result.getByRole('link', { name: 'open Collections', exact: true }).click(); await page.getByRole('heading', { name: 'Collections', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/app/revenue'); assert.equal(new URL(page.url()).searchParams.get('view'), 'collections');
  await page.evaluate(() => {
    localStorage.setItem('memoire.quotes.v1', '[]');
    const rows = JSON.parse(localStorage.getItem('memoire.opportunities.v1'));
    rows.find(row => row.id === 'won').status = 'Lost'; rows.find(row => row.id === 'won').stage = 'Lost'; localStorage.setItem('memoire.opportunities.v1', JSON.stringify(rows));
  });
  await page.reload(); await page.getByRole('heading', { name: 'No committed orders yet', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Open Orders', exact: true }).click(); await page.getByRole('tab', { name: 'Orders', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab', { name: 'Orders', exact: true }).getAttribute('aria-selected'), 'true');
  for (const query of ['catalogKind=brand&catalogId=foreign', 'catalogKind=constructor&catalogId=a', 'report=missing']) {
    await page.goto(`${base}/app/reports?${query}`); await reports.getByRole('alert').waitFor();
    assert.equal(await reports.getByRole('button', { name: 'Run report', exact: true }).isDisabled(), true, 'invalid handoff must not run an unrelated default report');
  }
  await page.goto(`${base}/app/reports?catalogKind=brand&catalogId=a`); await reports.getByText(/Demo report library/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.goto(`${base}/app/products`); await products.getByText(/Demo catalog/).waitFor();
  const performanceLink = products.getByRole('listitem').filter({ has: page.getByText('Brand A', { exact: true }) }).getByRole('link', { name: 'View performance report' });
  assert.ok((await performanceLink.boundingBox()).height >= 44, 'catalog handoff has a usable mobile touch target');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(cloud, []); assert.deepEqual(errors, []);
  console.log('Product linkage verified: source deal → selected classification → scoped report → saved question → prepared dashboard → same source rows → Collections; reload identity, unsaved handoff refusal, retained run, invalid link refusal and mobile.');
} finally { await browser.close(); }
