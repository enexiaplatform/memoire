import { chromium } from 'playwright';
import { buildScaleWorkspace } from './lib/scale-workspace.mjs';

/**
 * Every destination at phone width, and the keyboard path through the two
 * screens that matter.
 *
 * Capture happens away from a desk - that is the whole premise - so a
 * destination that scrolls sideways on a 390px screen is not a cosmetic
 * problem, it is the product being unusable where it is meant to be used. And
 * a control that cannot be reached or named is invisible to anyone using a
 * screen reader, on any screen.
 *
 * Hand-run, like `measure-surface-render`: it needs a browser, so it reports
 * rather than gates.
 *
 *   npm run build && npx vite preview --port 5299 &
 *   node scripts/measure-mobile-accessibility.mjs --base http://localhost:5299
 */

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const base = option('base', 'http://localhost:5173').replace(/\/$/, '');
const width = Number(option('width', '390'));

const DESTINATIONS = [
  'today', 'timeline', 'business', 'reviews',
  'accounts', 'opportunities', 'revenue',
  'ask', 'activity', 'vault', 'settings', 'capture',
];

const workspace = buildScaleWorkspace({ opportunities: 60, activities: 180, accounts: 40, quotes: 50 });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate((data) => {
  Object.keys(window.localStorage).forEach((key) => {
    if (key.startsWith('memoire')) window.localStorage.removeItem(key);
  });
  window.localStorage.setItem('memoire_demo_workspace', 'interactive-demo');
  window.localStorage.setItem('memoire.opportunities.v1', JSON.stringify(data.opportunities));
  window.localStorage.setItem('memoire.salesActivities.v1', JSON.stringify(data.activities));
  window.localStorage.setItem('memoire.accounts.v1', JSON.stringify(data.accounts));
  window.localStorage.setItem('memoire.quotes.v1', JSON.stringify(data.quotes));
  window.localStorage.setItem('memoire.opportunityOutcomes.v1', JSON.stringify(data.outcomes));
}, workspace);

console.log(`Every destination at ${width}px:\n`);

const failures = [];

for (const destination of DESTINATIONS) {
  await page.goto(`${base}/app/${destination}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const report = await page.evaluate((viewportWidth) => {
    const doc = document.documentElement;
    // The page itself must never scroll sideways. Wide content is allowed to,
    // but only inside its own container.
    const overflow = Math.max(0, doc.scrollWidth - viewportWidth);

    // Which element is actually sticking out, if any - a number alone is not
    // something anyone can fix.
    let culprit = '';
    if (overflow > 1) {
      const all = Array.from(document.querySelectorAll('body *'));
      for (const element of all) {
        const box = element.getBoundingClientRect();
        if (box.right > viewportWidth + 1 && box.width <= viewportWidth * 3) {
          const parent = element.parentElement;
          const clipped = parent && ['auto', 'scroll', 'hidden'].includes(getComputedStyle(parent).overflowX);
          if (!clipped) {
            culprit = `${element.tagName.toLowerCase()}.${(element.className || '').toString().split(' ').slice(0, 3).join('.')}`;
            break;
          }
        }
      }
    }

    // Controls that cannot be named cannot be used by anyone not looking at
    // them, and controls under 32px are a miss on a thumb.
    const interactive = Array.from(document.querySelectorAll('main button, main a[href], main select, main input, main textarea'));
    const unnamed = [];
    const small = [];

    // Every way an element can legitimately get an accessible name. Checking
    // only aria-label reports correctly-labelled inputs as broken, and a
    // report full of things that are fine is one nobody reads.
    const accessibleName = (element) => {
      const aria = (element.getAttribute('aria-label') || '').trim();
      if (aria) return aria;
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy.split(/\s+/)
          .map((id) => document.getElementById(id)?.innerText || '')
          .join(' ').trim();
        if (text) return text;
      }
      if (element.id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (forLabel?.innerText.trim()) return forLabel.innerText.trim();
      }
      const wrapping = element.closest('label');
      if (wrapping?.innerText.trim()) return wrapping.innerText.trim();
      const title = (element.getAttribute('title') || '').trim();
      if (title) return title;
      const placeholder = (element.getAttribute('placeholder') || '').trim();
      if (placeholder) return placeholder;
      // textContent, not innerText: a control inside a collapsed <details>
      // renders no text but is perfectly well named once the section is
      // opened. Using innerText reported every folded panel as broken.
      return (element.textContent || element.value || '').trim();
    };

    interactive.forEach((element) => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      // Inside a collapsed disclosure: not on screen, not a tap target, and
      // Chromium still reports a box for it.
      const details = element.closest('details');
      if (details && !details.open) return;
      const name = accessibleName(element);
      if (!name) unnamed.push(`${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).split(' ')[0]}` : ''}`);
      // WCAG 2.2 AA (2.5.8) is 24x24, and the target is what the thumb can
      // actually hit: a 14px checkbox inside a label is a label-sized target,
      // not a 14px one. Measuring the input alone reported every properly
      // built checkbox as a failure.
      const wrappingLabel = element.closest('label');
      let target = wrappingLabel ? wrappingLabel.getBoundingClientRect() : box;

      // A dense grid (a contribution heatmap, a five-item day column) cannot
      // grow its squares without losing the density that makes it readable, so
      // it extends the hit area with an inset ::after instead. That pseudo
      // element IS the tap target, and a box measurement cannot see it.
      const after = getComputedStyle(element, '::after');
      if (after && after.content && after.content !== 'none' && after.position === 'absolute') {
        const inset = (value) => {
          const parsed = parseFloat(value);
          return Number.isFinite(parsed) ? -parsed : 0;
        };
        const grow = Math.max(
          inset(after.top), inset(after.bottom), inset(after.left), inset(after.right),
        );
        if (grow > 0) {
          target = { width: target.width + grow * 2, height: target.height + grow * 2 };
        }
      }

      if (element.tagName !== 'A' && Math.min(target.width, target.height) < 24) {
        small.push(`${element.tagName.toLowerCase()} ${Math.round(target.width)}x${Math.round(target.height)} "${name.replace(/\s+/g, ' ').slice(0, 30)}"`);
      }
    });

    return {
      overflow,
      culprit,
      unnamed: unnamed.slice(0, 4),
      small: small.slice(0, 8),
      hasMain: Boolean(document.querySelector('main')),
      hasH1: Boolean(document.querySelector('main h1, main h2')),
    };
  }, width);

  const problems = [];
  if (report.overflow > 1) problems.push(`scrolls ${report.overflow}px sideways${report.culprit ? ` (${report.culprit})` : ''}`);
  if (report.unnamed.length) problems.push(`${report.unnamed.length}+ unnamed control(s): ${report.unnamed.join(', ')}`);
  if (report.small.length) problems.push(`${report.small.length} tap target(s) under 24px`);
  if (!report.hasMain) problems.push('no main landmark');
  if (!report.hasH1) problems.push('no heading');

  const tapTargets = report.small.length ? `\n${report.small.map((item) => `      under 24px: ${item}`).join('\n')}` : '';
  console.log(
    `  ${destination.padEnd(15)} ${problems.length === 0 ? 'ok' : problems.join('; ')}${tapTargets}`,
  );
  if (problems.length > 0) failures.push({ destination, problems });
}

// The keyboard path through the two screens the product is built around.
console.log('\nKeyboard path:');
for (const [label, path, target] of [
  ['capture', '/app/capture', 'textarea, input[type="text"]'],
  ['today', '/app/today', 'a[href], button'],
]) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const reachable = await page.evaluate((selector) => {
    const focusable = Array.from(document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const first = document.querySelector(selector);
    return {
      count: focusable.length,
      reachesTarget: Boolean(first && focusable.includes(first)),
      skipLink: Boolean(document.querySelector('.skip-link')),
    };
  }, target);

  console.log(
    `  ${label.padEnd(15)} ${reachable.count} focusable, `
    + `${reachable.reachesTarget ? 'primary control reachable' : 'PRIMARY CONTROL NOT IN TAB ORDER'}, `
    + `${reachable.skipLink ? 'skip link present' : 'NO SKIP LINK'}`,
  );
  if (!reachable.reachesTarget || !reachable.skipLink) {
    failures.push({ destination: `${label} (keyboard)`, problems: ['primary control or skip link missing'] });
  }
}

if (pageErrors.length > 0) {
  console.log(`\nPage errors: ${pageErrors.length}`);
  pageErrors.slice(0, 5).forEach((message) => console.log(`  - ${message.slice(0, 160)}`));
}

await browser.close();

console.log(
  failures.length === 0
    ? `\nAll ${DESTINATIONS.length} destinations pass at ${width}px.`
    : `\n${failures.length} destination(s) with problems at ${width}px.`,
);
process.exit(failures.length === 0 ? 0 : 1);
