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
];

const failures = [];

for (const check of checks) {
  const path = resolve(root, check.file);
  const text = readFileSync(path, 'utf8');
  if (!check.assert(text)) {
    failures.push(`${check.name} (${check.file})`);
  }
}

if (failures.length > 0) {
  console.error('Commercial readiness verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Commercial readiness verification passed (${checks.length} checks).`);
