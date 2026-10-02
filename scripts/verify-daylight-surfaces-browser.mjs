import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { seedLinkageDemo } from './fixtures/product-linkage-fixture.mjs';

const base = process.env.MEMOIRE_BROWSER_BASE || 'http://127.0.0.1:5173';
const artifacts = resolve('.memoire-private/design-sync');
await mkdir(artifacts, { recursive: true });
const routes = ['today', 'timeline', 'leads', 'accounts', 'opportunities', 'revenue', 'reviews', 'products', 'reports', 'dashboards', 'capture', 'ask', 'activity', 'vault', 'settings', 'quotes', 'portfolio-coverage', 'stakeholders', 'objections'];
const browser = await chromium.launch({ headless: true });
const evidence = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', timezoneId: 'Asia/Ho_Chi_Minh' });
    await context.addInitScript(seedLinkageDemo);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of routes) {
      await page.goto(`${base}/app/${route}`);
      await page.locator('main h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const reading = await page.evaluate(() => {
        const h = document.querySelector('main h1'), style = getComputedStyle(h);
        return { title: h.textContent, font: style.fontFamily, ink: style.color, size: style.fontSize,
          overflow: document.documentElement.scrollWidth - innerWidth,
          failed: Boolean(document.querySelector('main [role="alert"]')?.textContent?.includes('Something went wrong')) };
      });
      assert.equal(reading.failed, false, `${route}: route failed`);
      assert.match(reading.font, /Outfit/, `${route}: heading font`);
      assert.equal(reading.ink, 'rgb(11, 20, 28)', `${route}: heading ink`);
      assert.ok(reading.overflow <= 1, `${route} at ${width}px: document overflow ${reading.overflow}px`);
      if (['products', 'reports', 'dashboards'].includes(route)) {
        if (route === 'reports') {
          // The white report library is also an aside; only the dark rail gets a white focus ring.
          const template = page.getByRole('button', { name: 'Portfolio Performance', exact: true });
          await template.press('Tab');
          const ring = await page.evaluate(() => ({
            color: getComputedStyle(document.activeElement).outlineColor,
            style: getComputedStyle(document.activeElement).outlineStyle,
          }));
          assert.equal(ring.color, 'rgb(25, 118, 210)', 'White report library keyboard focus must remain blue');
          assert.equal(ring.style, 'solid', 'White report library keyboard focus must be visible');
        }
        const button = page.getByRole('button', { name: route === 'products' ? 'Save entry' : route === 'reports' ? 'Run report' : 'Refresh dashboard', exact: true });
        const pill = await button.evaluate(el => ({ radius: getComputedStyle(el).borderRadius, color: getComputedStyle(el).backgroundColor }));
        assert.ok(parseFloat(pill.radius) >= 999, `${route}: primary pill`);
        assert.equal(pill.color, 'rgb(25, 118, 210)', `${route}: primary blue`);
        await page.screenshot({ path: resolve(artifacts, `${route}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
      evidence.push({ route, width, ...reading });
    }
    const publicContext = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const publicPage = await publicContext.newPage();
    publicPage.on('pageerror', error => errors.push(error.message));
    for (const route of ['/login', '/signup', '/forgot-password', '/verify-email', '/', '/pricing', '/use-cases']) {
      await publicPage.goto(`${base}${route}`);
      await publicPage.getByRole('heading', { level: 1 }).waitFor();
      assert.equal(new URL(publicPage.url()).pathname, route, `${route}: public surface must remain on its own route`);
      const overflow = await publicPage.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${route} at ${width}px: document overflow ${overflow}px`);
      evidence.push({ route, width, overflow });
    }
    await publicContext.close();
    assert.deepEqual(errors, [], `Runtime errors at ${width}px`);
    await context.close();
  }
  await writeFile(resolve(artifacts, 'surfaces.json'), JSON.stringify(evidence, null, 2));
  console.log(`Daylight verified on ${routes.length} workspace surfaces and 7 public/auth surfaces at desktop and mobile widths; headings, primary actions, fonts, document bounds and runtime errors.`);
} finally { await browser.close(); }
