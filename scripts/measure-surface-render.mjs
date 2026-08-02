import { chromium } from 'playwright';
import { buildScaleWorkspace } from './lib/scale-workspace.mjs';

/**
 * How long each destination takes to put its content on screen, at a book of
 * business larger than the product has today.
 *
 * `verify:performance-budget` measures the derived models and runs in CI in
 * milliseconds. This measures the other half - React rendering, the DOM the
 * tables build, the workspace load - and needs a browser, so it is a hand-run
 * harness rather than a build gate. Run it before a release and when a surface
 * starts feeling heavy.
 *
 *   npm run build && npx vite preview --port 5299 &
 *   node scripts/measure-surface-render.mjs --base http://localhost:5299
 *
 * Options:
 *   --base <url>     server to measure (default http://localhost:5173)
 *   --deals <n>      opportunities to generate (default 300)
 *   --budget <ms>    per-surface budget (default 2000)
 *   --headed         watch it run
 */

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const base = option('base', 'http://localhost:5173').replace(/\/$/, '');
const deals = Number(option('deals', '300'));
const budgetMs = Number(option('budget', '2000'));
const headed = args.includes('--headed');

const SURFACES = ['today', 'opportunities', 'accounts', 'revenue', 'reviews', 'timeline', 'business', 'activity'];

const workspace = buildScaleWorkspace({
  opportunities: deals,
  activities: deals * 3,
  accounts: Math.round(deals * 0.7),
  quotes: Math.round(deals * 0.8),
});

const browser = await chromium.launch({
  headless: !headed,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate((data) => {
  Object.keys(window.localStorage).forEach((key) => {
    if (key.startsWith('memoire')) window.localStorage.removeItem(key);
  });
  // Reaching /app needs a workspace the route guard accepts; this harness is
  // measuring rendering, not authentication.
  window.localStorage.setItem('memoire_demo_workspace', 'interactive-demo');
  window.localStorage.setItem('memoire.opportunities.v1', JSON.stringify(data.opportunities));
  window.localStorage.setItem('memoire.salesActivities.v1', JSON.stringify(data.activities));
  window.localStorage.setItem('memoire.accounts.v1', JSON.stringify(data.accounts));
  window.localStorage.setItem('memoire.quotes.v1', JSON.stringify(data.quotes));
  window.localStorage.setItem('memoire.opportunityOutcomes.v1', JSON.stringify(data.outcomes));
}, workspace);

const stored = await page.evaluate(() => {
  let bytes = 0;
  Object.keys(window.localStorage).forEach((key) => {
    if (key.startsWith('memoire')) bytes += (key.length + (window.localStorage.getItem(key) || '').length) * 2;
  });
  return bytes;
});

console.log(`Measuring ${base} with ${workspace.opportunities.length} deals / ${workspace.activities.length} activities / ${workspace.accounts.length} accounts (${(stored / 1024 / 1024).toFixed(2)} MB stored)\n`);

// One warm pass so module loading is not charged to the first surface measured.
await page.goto(`${base}/app/today`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const results = [];
for (const surface of SURFACES) {
  await page.goto(`${base}/app/${surface}`, { waitUntil: 'domcontentloaded' });
  const started = Date.now();
  let elapsed = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const length = await page.evaluate(() => (document.getElementById('app-main-content')?.innerText || '').length);
    if (length > 700) { elapsed = Date.now() - started; break; }
    await page.waitForTimeout(100);
  }
  // A long task after paint is what a frozen scroll actually is.
  const longestFrame = await page.evaluate(() => new Promise((resolve) => {
    let longest = 0;
    let last = performance.now();
    let frames = 0;
    const tick = () => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
      frames += 1;
      if (frames < 30) requestAnimationFrame(tick);
      else resolve(Math.round(longest));
    };
    requestAnimationFrame(tick);
  }));

  const over = elapsed === null || elapsed > budgetMs;
  results.push({ surface, elapsed, longestFrame, over });
  console.log(
    `  ${surface.padEnd(15)} ${(elapsed === null ? '>8000' : String(elapsed)).padStart(6)} ms to content` +
    `   longest frame ${String(longestFrame).padStart(4)} ms   ${over ? 'OVER BUDGET' : 'ok'}`,
  );
}

if (pageErrors.length > 0) {
  console.log(`\nPage errors: ${pageErrors.length}`);
  pageErrors.slice(0, 5).forEach((message) => console.log(`  - ${message.slice(0, 160)}`));
}

await browser.close();

const failed = results.filter((result) => result.over);
console.log(
  failed.length === 0
    ? `\nAll ${results.length} surfaces render within ${budgetMs}ms at this scale.`
    : `\n${failed.length} surface(s) over the ${budgetMs}ms budget: ${failed.map((result) => result.surface).join(', ')}`,
);
process.exit(failed.length === 0 ? 0 : 1);
