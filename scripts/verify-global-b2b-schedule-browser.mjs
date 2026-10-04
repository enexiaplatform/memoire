import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { buildGlobalB2BYear } from './fixtures/global-b2b-year.mjs';
import { buildRestorePlan } from '../src/utils/workspaceBackup.ts';
const base = process.env.MEMOIRE_BROWSER_BASE || 'http://127.0.0.1:5186';
const root = process.env.MEMOIRE_SCHEDULE_ARTIFACT_DIR || '.audit/global-b2b-round3-2026-10-04/schedule-browser';
fs.mkdirSync(root, { recursive: true });
const f = buildGlobalB2BYear(), initial = f.receivables[0];
const slice = (id, percent, amount = null) => ({ id, label: id, percent, amount, trigger: 'order', offsetDays: 0 });
const browser = await chromium.launch({ headless: true });
const evidence = { at: new Date().toISOString(), base, checks: [], runtimeErrors: [], cloudRequests: 0, passed: false };
try {
  for (const [name, installments] of [
    ['200 percent', [slice('First', 100), slice('Second', 100)]],
    ['fixed schedule', [slice('First', null, 7000), slice('Second', null, 4000)]],
    ['mixed schedule', [slice('First', 70), slice('Second', null, 4000)]],
  ]) {
    const record = { ...initial, installments };
    const records = { 'memoire.accounts.v1': f.accounts, 'memoire.opportunities.v1': f.opportunities.filter(o => o.id === record.opportunityId),
      'memoire.quotes.v1': f.quotes.filter(q => q.opportunityId === record.opportunityId), 'memoire.orderReceivables.v1': [record] };
    assert.throws(() => buildRestorePlan({ exportedAt: '2026-10-04T00:00:00Z', localBrowserData: records }), /exceeds/);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Ho_Chi_Minh' });
    await context.route('**/*', route => {
      if (route.request().url().includes('/rest/v1/')) { evidence.cloudRequests++; return route.abort(); }
      return route.continue();
    });
    await context.addInitScript(records => {
      localStorage.setItem('memoire_demo_workspace', 'interactive-demo');
      localStorage.setItem('memoire_reporting_currency', 'USD');
      for (const [key, data] of Object.entries(records)) localStorage.setItem(key, JSON.stringify(data));
    }, records);
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => evidence.runtimeErrors.push(error.message));
    for (const [route, surface] of [
      ['/app/revenue?view=collections', 'Collections'], ['/app/revenue', 'Orders'], ['/app/today', 'Today'],
    ]) {
      await page.goto(base + route);
      await page.getByRole('alert').filter({ hasText: /payment schedule exceeds/i }).first().waitFor();
      assert.equal(await page.getByText(/354 days late|Second.*354d late/).count(), 0);
      await page.screenshot({ path: `${root}/${name.replaceAll(' ', '-')}-${surface.toLowerCase()}.png`, fullPage: true });
      evidence.checks.push({ name, surface, visibleIntegrityError: true, passed: true });
    }
    await context.close();
  }
  assert.deepEqual(evidence.runtimeErrors, []); assert.equal(evidence.cloudRequests, 0); evidence.passed = true;
} finally { await browser.close(); fs.writeFileSync(`${root}/acceptance.json`, JSON.stringify(evidence, null, 2)); }
console.log(JSON.stringify(evidence));
