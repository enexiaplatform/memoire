import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readJson(file) {
  return JSON.parse(readFileSync(resolve(root, file), 'utf8'));
}

const checks = [
  {
    name: 'billing env flag defaults off',
    file: '.env.example',
    assert: (text) => /BILLING_CHECKOUT_ENABLED=false/.test(text),
  },
  {
    name: 'billing API blocks checkout when flag is not enabled',
    file: 'api/billing.ts',
    assert: (text) => {
      const guardIndex = text.indexOf("process.env.BILLING_CHECKOUT_ENABLED !== 'true'");
      const checkoutIndex = text.indexOf("lemonSqueezyRequest('/checkouts'");
      return guardIndex !== -1 && checkoutIndex !== -1 && guardIndex < checkoutIndex;
    },
  },
  {
    name: 'billing API returns disabled checkout error',
    file: 'api/billing.ts',
    assert: (text) => text.includes("Checkout is not enabled."),
  },
  {
    name: 'readiness runtime exposes checkout disabled status',
    file: 'scripts/lib/production-readiness-runtime.mjs',
    assert: (text) => text.includes('billing_checkout_disabled') && text.includes('BILLING_CHECKOUT_ENABLED'),
  },
  {
    name: 'billing QA covers disabled flag with Lemon Squeezy configured',
    file: 'docs/qa/billing-payment-qa-2026-06-17.md',
    assert: (text) => text.includes('Checkout flag disabled') && text.includes('BILLING_CHECKOUT_ENABLED=false'),
  },
  {
    name: 'release gate keeps checkout disabled until paid gates pass',
    file: 'docs/product/commercial-release-gate-2026-06-16.md',
    assert: (text) => text.includes('BILLING_CHECKOUT_ENABLED=false') && text.includes('B1-B6'),
  },
  {
    name: 'deployment remains noindexed before public selling',
    file: 'vercel.json',
    assert: () => {
      const config = readJson('vercel.json');
      return config.headers?.some((entry) =>
        entry.source === '/(.*)' &&
        entry.headers?.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow'),
      );
    },
  },
  // The public pages quote the offer; they never take the payment. Checkout
  // needs a session token, so the buy button lives in Settings > Billing - a
  // checkout call in a marketing bundle would be a second payment path with no
  // authenticated user behind it. The price markers keep the two pages from
  // drifting apart, and from drifting away from what Lemon Squeezy charges.
  {
    name: 'landing page quotes the real personal price and keeps checkout out of the marketing bundle',
    file: 'src/pages/LandingPage.tsx',
    assert: (text) =>
      text.includes('$10') &&
      text.includes('Lemon Squeezy') &&
      text.includes('Settings under Billing') &&
      !text.includes('startCheckout') &&
      !text.includes('useCheckout'),
  },
  {
    name: 'pricing page quotes the real personal price and keeps checkout disconnected',
    file: 'src/features/pricing/PricingPage.tsx',
    assert: (text) =>
      text.includes('$10') &&
      text.includes('Lemon Squeezy') &&
      text.includes('Settings under Billing') &&
      !text.includes('startCheckout') &&
      !text.includes('useCheckout'),
  },
  // Only two plans are purchasable, and Team is not one of them yet. A public
  // page offering a price for it would be selling something the store has no
  // variant for.
  {
    name: 'pricing page does not put a price on the team plan',
    file: 'src/features/pricing/PricingPage.tsx',
    assert: (text) => /name:\s*'Team',\s*\n\s*price:\s*'Later',/.test(text),
  },
  // Memoire has no AI service (scripts/verify-no-ai-dependency.mjs). The public
  // pages once advertised "AI assist optional", which promised something that
  // does not exist. Any AI claim here is a false claim.
  {
    name: 'landing page makes no AI capability claim',
    file: 'src/pages/LandingPage.tsx',
    assert: (text) =>
      !/\bAI[- ](assist|search|powered|generated)/i.test(text) &&
      text.includes('nothing is sent to an AI service'),
  },
  // Memoire is sold globally. The mocks on the marketing pages must be
  // structurally real but generically populated - an earlier version pasted the
  // demo workspace in verbatim, and a worldwide product went out looking like a
  // tool for one country's pharmaceutical trade: VND amounts, and the demo's own
  // pharma and food-testing accounts.
  //
  // The account list is read from the demo fixture rather than hard-coded, so
  // renaming a sample account cannot quietly retire this guard.
  {
    name: 'marketing pages do not paste the demo workspace verbatim',
    file: 'src/pages/LandingPage.tsx',
    assert: (text, { sampleAccountNames }) => {
      // The doc comment naming the mistake is the one allowed mention.
      const body = text.replace(/\/\*[\s\S]*?\*\//g, '');
      return !sampleAccountNames.some((name) => body.includes(name));
    },
  },
  {
    name: 'marketing pages quote no single market currency',
    file: 'src/pages/LandingPage.tsx',
    // The dollar figures are illustrative and stay; a local currency code or
    // symbol means somebody's own workspace was copied onto a global page.
    assert: (text) => !/\b(VND|IDR|THB|PHP|MYR|INR|KRW|JPY)\b|[₫₹₩¥]/.test(text),
  },
];

/**
 * Names of the accounts the demo sandbox ships with. Pulled from the fixture so
 * the guard above tracks it automatically.
 */
function readSampleAccountNames() {
  const sample = readFileSync(resolve(root, 'src/utils/sampleData.ts'), 'utf8');
  const names = new Set();
  for (const match of sample.matchAll(/accountName: '([^']+)'/g)) names.add(match[1]);
  if (names.size === 0) {
    throw new Error('verify-commercial-readiness: found no sample account names - the fixture shape changed');
  }
  return [...names];
}

const failures = [];
const context = { sampleAccountNames: readSampleAccountNames() };

for (const check of checks) {
  const path = resolve(root, check.file);
  const text = readFileSync(path, 'utf8');
  if (!check.assert(text, context)) {
    failures.push(`${check.name} (${check.file})`);
  }
}

if (failures.length > 0) {
  console.error('Commercial readiness verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Commercial readiness verification passed (${checks.length} checks).`);
