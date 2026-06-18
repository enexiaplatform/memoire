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
      const checkoutIndex = text.indexOf('stripe.checkout.sessions.create');
      return guardIndex !== -1 && checkoutIndex !== -1 && guardIndex < checkoutIndex;
    },
  },
  {
    name: 'billing API returns disabled checkout error',
    file: 'api/billing.ts',
    assert: (text) => text.includes("Checkout is not enabled."),
  },
  {
    name: 'health endpoint exposes checkout disabled status',
    file: 'api/health.ts',
    assert: (text) => text.includes('billing_checkout_disabled') && text.includes('BILLING_CHECKOUT_ENABLED'),
  },
  {
    name: 'billing QA covers disabled flag with Stripe configured',
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
  {
    name: 'landing page keeps public checkout inactive',
    file: 'src/pages/LandingPage.tsx',
    assert: (text) =>
      text.includes('No payment checkout is active here.') &&
      text.includes('No payment checkout is active.') &&
      !text.includes('startCheckout') &&
      !text.includes('useCheckout'),
  },
  {
    name: 'pricing page keeps checkout disconnected',
    file: 'src/features/pricing/PricingPage.tsx',
    assert: (text) =>
      text.includes('Pricing is still being validated.') &&
      text.includes('no payment checkout is active') &&
      !text.includes('startCheckout') &&
      !text.includes('useCheckout'),
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
