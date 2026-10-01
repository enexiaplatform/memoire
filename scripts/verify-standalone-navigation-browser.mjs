import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.MEMOIRE_BROWSER_BASE || 'http://127.0.0.1:5173';
const artifacts = resolve('.codex-dashboards-qa');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem('memoire_demo_workspace', 'interactive-demo');
    localStorage.setItem('memoire.sampleData.loaded', 'true');
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/app/reviews`);
  await page.getByRole('heading', { name: 'Review', exact: true, level: 1 }).waitFor();
  assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Weekly review', 'Learning & Analytics']);
  const destinations = [['Products & Brands', 'products'], ['Reports', 'reports'], ['Dashboards', 'dashboards']];
  for (const [name, route] of destinations) {
    await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name, exact: true }).click();
    await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
    assert.equal(new URL(page.url()).pathname, `/app/${route}`);
    assert.match(await page.title(), new RegExp(name));
    assert.equal(await page.getByRole('tablist', { name: 'Review section' }).count(), 0);
    assert.equal(await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name, exact: true }).getAttribute('aria-current'), 'page');
  }
  await page.screenshot({ path: resolve(artifacts, 'navigation-desktop.png'), fullPage: true, animations: 'disabled' });
  for (const [view, route, params, hash] of [
    ['portfolio', 'products', 'probe=catalog', '#catalog'],
    ['reports', 'reports', 'report=preserved-id', ''],
    ['dashboards', 'dashboards', 'dashboard=new&dashboardFilters=%5B%5D', ''],
  ]) {
    await page.goto(`${base}/app/reviews?view=${view}&${params}${hash}`);
    await page.waitForURL(url => url.pathname === `/app/${route}`);
    const actual = new URL(page.url());
    assert.equal(actual.search, `?${params}`); assert.equal(actual.hash, hash);
  }
  await page.goto(`${base}/app/reviews?view=constructor`);
  await page.getByRole('heading', { name: 'Review', exact: true, level: 1 }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/app/reviews');
  await page.goto(`${base}/app/reviews?view=analytics`);
  await page.getByRole('tab', { name: 'Learning & Analytics', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab', { name: 'Learning & Analytics', exact: true }).getAttribute('aria-selected'), 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, route] of destinations) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name, exact: true }).click();
    await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
    assert.equal(new URL(page.url()).pathname, `/app/${route}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows mobile width`);
  }
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.screenshot({ path: resolve(artifacts, 'navigation-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(errors, []);
  console.log('Standalone navigation verified: desktop/mobile destinations, headings, active links, original Review tabs and legacy query/hash preservation.');
} finally { await browser.close(); }
