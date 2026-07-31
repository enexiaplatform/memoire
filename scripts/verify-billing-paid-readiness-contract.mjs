import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return readFileSync(resolve(root, file), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function requireIncludes(text, marker, label) {
  if (!text.includes(marker)) fail(label);
}

const envExample = read('.env.example');
for (const marker of [
  'BILLING_CHECKOUT_ENABLED=false',
  'LEMONSQUEEZY_API_KEY',
  'LEMONSQUEEZY_STORE_ID',
  'LEMONSQUEEZY_WEBHOOK_SECRET',
  'LEMONSQUEEZY_PERSONAL_VARIANT_ID',
  'LEMONSQUEEZY_TEAM_VARIANT_ID',
]) {
  requireIncludes(envExample, marker, `.env.example missing billing marker: ${marker}`);
}

// Lemon Squeezy is a merchant of record and mints its checkout as a hosted URL,
// so there is no publishable key and no client-side payment SDK. A billing key
// reaching the browser bundle would be a real regression, not a style choice.
if (/VITE_[A-Z_]*(?:STRIPE|LEMONSQUEEZY)[A-Z_]*/.test(envExample)) {
  fail('.env.example must not expose a client-side billing key');
}

const billingApi = read('api/billing.ts');
for (const marker of [
  "if (req.method !== 'POST') return res.status(405).end();",
  "if (!billingConfigured()) return res.status(503).json({ error: 'Billing is not configured.' });",
  'verifyUserToken(authToken, userId)',
  "return res.status(401).json({ error: 'Unauthorized' })",
  "if (action === 'checkout')",
  "process.env.BILLING_CHECKOUT_ENABLED !== 'true'",
  "return res.status(503).json({ error: 'Checkout is not enabled.' })",
  'const allowedVariants = allowedVariantIds();',
  '!allowedVariants.includes(String(variantId))',
  "return res.status(400).json({ error: 'Invalid price.' })",
  "lemonSqueezyRequest('/checkouts'",
  'redirectUrl: `${appUrl}/app/capture?upgrade=success`',
  "if (action === 'portal')",
  "return res.status(400).json({ error: 'No billing account found' })",
  'urls?.customer_portal',
]) {
  requireIncludes(billingApi, marker, `billing API missing marker: ${marker}`);
}

const billingClient = read('api/_lemonsqueezy.js');
for (const marker of [
  "createHmac('sha256', secret)",
  'timingSafeEqual(expected, received)',
  'custom: { user_id: userId }',
  'export function subscriptionStateFor(',
  "return { subscription_status: 'free', subscription_tier: 'free' };",
]) {
  requireIncludes(billingClient, marker, `Lemon Squeezy client missing marker: ${marker}`);
}

const webhook = read('api/lemonsqueezy-webhook.ts');
for (const marker of [
  'export const config = { api: { bodyParser: false } };',
  'LEMONSQUEEZY_WEBHOOK_SECRET',
  "req.headers['x-signature']",
  "return res.status(400).json({ error: 'Missing webhook signature.' })",
  'verifyWebhookSignature(rawBody, signature, webhookSecret)',
  "return res.status(400).json({ error: 'Invalid webhook signature.' })",
  'event?.meta?.custom_data?.user_id',
  "case 'subscription_created':",
  "case 'subscription_updated':",
  "case 'subscription_cancelled':",
  "case 'subscription_expired':",
  'subscriptionStateFor(attributes.status, attributes.variant_id)',
  'lemonsqueezy_customer_id',
  'lemonsqueezy_subscription_id',
  "case 'order_created':",
  "action: 'subscription_started'",
]) {
  requireIncludes(webhook, marker, `Lemon Squeezy webhook missing marker: ${marker}`);
}

// The signature check must gate the handler, not sit beside it.
{
  const verifyIndex = webhook.indexOf('verifyWebhookSignature(rawBody, signature, webhookSecret)');
  const writeIndex = webhook.indexOf("from('user_profiles')");
  if (verifyIndex === -1 || writeIndex === -1 || verifyIndex > writeIndex) {
    fail('Lemon Squeezy webhook must verify the signature before writing billing state');
  }
}

// Stripe is gone. A reintroduced import or key would mean two payment paths,
// one of which nobody is watching.
{
  const packageJsonText = read('package.json');
  if (/"stripe"|@stripe\//.test(packageJsonText)) {
    fail('package.json must not depend on Stripe - Lemon Squeezy is the payment provider');
  }
  for (const file of ['api/billing.ts', 'api/lemonsqueezy-webhook.ts', 'api/_lemonsqueezy.js', '.env.example']) {
    if (/stripe/i.test(read(file))) {
      fail(`${file} must not reference Stripe`);
    }
  }
}

const pricing = read('src/features/pricing/PricingPage.tsx');
for (const marker of [
  'Early pricing hypothesis',
  'Pricing is still being validated.',
  'no payment checkout is active',
  'Request guided access',
  'Try demo first',
  'Not available yet',
  'No team checkout today',
  'No CRM writeback today',
]) {
  requireIncludes(pricing, marker, `pricing page missing paid-readiness marker: ${marker}`);
}
if (pricing.includes('useCheckout') || pricing.includes('startCheckout')) {
  fail('pricing page must not call checkout while B1-B6 are open');
}

const exposureGuard = read('docs/deployment/billing-checkout-exposure-guard-2026-06-17.md');
for (const marker of [
  'BILLING_CHECKOUT_ENABLED=false',
  'Only set it to `true` after:',
  'Paid offer selected.',
  'Lemon Squeezy variant ID confirmed.',
  'Billing payment QA passed.',
  'Billing support owner and refund/trial policy recorded.',
  'Pricing page matches the active offer.',
  'Legal review covers paid access.',
  'B1 selected paid offer.',
  'B3 Lemon Squeezy test/live evidence.',
  'B4 named owners and test support case.',
  'B5 pricing page update.',
  'B6 paid-access legal review.',
  'Landing and pricing pages keep public checkout inactive',
]) {
  requireIncludes(exposureGuard, marker, `billing exposure guard missing marker: ${marker}`);
}

const billingQa = read('docs/qa/billing-payment-qa-2026-06-17.md');
for (const marker of [
  'One selected paid early-access offer.',
  'Lemon Squeezy test-mode product and variant IDs.',
  '`BILLING_CHECKOUT_ENABLED=true` only in the billing QA environment after offer/support/legal approval.',
  'B3-01',
  'B3-02',
  'B3-03',
  'B3-04',
  'B3-05',
  'B3-06',
  'B3-07',
  'B3-08',
  'B3-09',
  'B3-10',
  'B3-11',
  'B3-12',
  'B3-13',
  'B3-14',
  'B3-15',
  'B3 can pass only when:',
  'B3-01 through B3-15 pass in Lemon Squeezy test mode.',
  'No checkout path is exposed on `/pricing` until B1, B4, B5, and B6 are ready.',
  'B4 can pass only when:',
]) {
  requireIncludes(billingQa, marker, `billing QA doc missing marker: ${marker}`);
}

const billingSupport = read('docs/operations/billing-support-runbook-2026-06-17.md');
for (const marker of [
  'This runbook does not authorize enabling checkout.',
  'A single paid offer is selected.',
  'Lemon Squeezy test-mode and production-mode QA pass.',
  'Legal terms cover paid access, refunds, cancellations, service availability, export, and deletion obligations.',
  'Keep `BILLING_CHECKOUT_ENABLED=false` until B1, B3, B4, B5, and B6 are ready.',
  'Billing support owner:',
  'Backup owner:',
  'Lemon Squeezy dashboard access owner:',
  'Refund approver:',
  'Legal/commercial approver:',
  'Never ask users to send full card details. Card data stays inside Lemon Squeezy.',
  '| Checkout failed |',
  '| Portal failed |',
  '| Plan mismatch |',
  '| Cancellation request |',
  '| Refund request |',
  '| Failed payment |',
  '| Duplicate charge |',
  '| Account deletion with billing |',
  '| Dispute/chargeback |',
  'B4 can move from runbook-ready to operational evidence only when:',
  'Billing support owner and backup are named.',
  'Selected paid offer, variant ID, refund policy, and trial policy are filled in.',
  'One test support ticket is run through the intake and resolution workflow.',
  'B3 payment QA, B5 pricing-page update, and B6 legal review remain open.',
]) {
  requireIncludes(billingSupport, marker, `billing support runbook missing marker: ${marker}`);
}

const coverageDoc = read('docs/product/billing-paid-readiness-contract-coverage-2026-06-17.md');
for (const marker of [
  'B1-B6 remain open',
  'scripts/verify-billing-paid-readiness-contract.mjs',
  'Runtime Evidence Still Required',
  'Do not enable checkout',
]) {
  requireIncludes(coverageDoc, marker, `billing paid-readiness coverage doc missing marker: ${marker}`);
}

const commercialVerifier = read('scripts/verify-commercial-readiness.mjs');
for (const marker of [
  'billing env flag defaults off',
  'billing API blocks checkout when flag is not enabled',
  'pricing page keeps checkout disconnected',
]) {
  requireIncludes(commercialVerifier, marker, `commercial verifier missing checkout exposure marker: ${marker}`);
}

const packageJson = read('package.json');
requireIncludes(packageJson, '"verify:billing-paid-readiness"', 'package.json missing verify:billing-paid-readiness script');
requireIncludes(packageJson, 'npm run verify:billing-paid-readiness', 'npm run check does not include billing paid-readiness verifier');

const releaseGate = read('docs/product/commercial-release-gate-2026-06-16.md');
requireIncludes(releaseGate, 'scripts/verify-billing-paid-readiness-contract.mjs', 'release gate does not reference billing paid-readiness verifier');

const roadmap = read('docs/product/commercialization-roadmap-2026-06-16.md');
requireIncludes(roadmap, 'npm run verify:billing-paid-readiness', 'roadmap does not reference billing paid-readiness verifier');

if (failures.length > 0) {
  console.error('Billing paid-readiness contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Billing paid-readiness contract verification passed.');
